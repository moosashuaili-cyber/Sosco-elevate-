// Data layer for SOSCO ELEVATE.
//
// All screens read from an in-memory cache (Store.all / Store.get) and write with
// Store.put / Store.remove. Two backends fill that cache:
//   - Firebase (Auth + Firestore) when js/firebase-config.js has a config.
//   - Demo mode otherwise: data lives in this browser's localStorage and is
//     seeded with sample people, reviews, goals and exams.
const Store = (() => {
    const COLLECTIONS = ['users', 'departments', 'cycles', 'appraisals', 'goals', 'exams', 'examKeys', 'attempts'];
    const PREFIX = 'sosco3.';
    const data = {};
    COLLECTIONS.forEach(c => { data[c] = []; });
    const listeners = new Set();
    let current = null;
    let backend = null;

    const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    const emit = () => listeners.forEach(fn => fn());

    function upsert(c, doc) {
        const i = data[c].findIndex(d => d.id === doc.id);
        if (i === -1) data[c].push(doc); else data[c][i] = doc;
    }

    // ---------- Demo backend (localStorage) ----------

    const memory = {};
    function readKey(store, key, fallback) {
        try {
            const v = store.getItem(key);
            if (v !== null) return JSON.parse(v);
        } catch (e) { /* storage blocked */ }
        return key in memory ? memory[key] : fallback;
    }
    function writeKey(store, key, value) {
        memory[key] = value;
        try { store.setItem(key, JSON.stringify(value)); } catch (e) { /* memory only */ }
    }
    const local = () => { try { return window.localStorage; } catch (e) { return null; } };
    const session = () => { try { return window.sessionStorage; } catch (e) { return null; } };
    const readLocal = (key, fb) => readKey(local() || { getItem: () => null }, key, fb);
    const writeLocal = (key, v) => writeKey(local() || { setItem() {} }, key, v);
    // The signed-in user is kept per tab, so a manager and an employee can be open side by side.
    const readSession = () => readKey(session() || { getItem: () => null }, PREFIX + 'session', null);
    const writeSession = v => writeKey(session() || { setItem() {} }, PREFIX + 'session', v);

    const Demo = {
        mode: 'demo',
        async init() {
            if (readLocal(PREFIX + 'users', null) === null) seed();
            COLLECTIONS.forEach(c => { data[c] = readLocal(PREFIX + c, []); });
            const id = readSession();
            current = id ? data.users.find(u => u.id === id && u.active !== false) || null : null;
            window.addEventListener('storage', e => {
                const c = e.key && e.key.startsWith(PREFIX) ? e.key.slice(PREFIX.length) : null;
                if (c && data[c]) { data[c] = readLocal(e.key, []); emit(); }
            });
        },
        async signIn(login, password) {
            const name = login.trim().toLowerCase();
            const u = data.users.find(x => (x.username === name || x.email === name) && x.password === password && x.active !== false);
            if (!u) return 'Wrong username or password. Check both and try again.';
            writeSession(u.id);
            current = u;
            return null;
        },
        async signOut() { writeSession(null); current = null; },
        async write(c) { writeLocal(PREFIX + c, data[c]); },
        async remove(c) { writeLocal(PREFIX + c, data[c]); },
        async createUser(profile, password) {
            const u = { ...profile, id: uid(), password };
            upsert('users', u);
            writeLocal(PREFIX + 'users', data.users);
            return u;
        },
        async resetPassword() { return 'Password reset emails need Firebase. In demo mode, edit the user and set a new temporary password.'; },
        async changePassword(currentPw, nextPw) {
            if (current.password !== currentPw) return 'Your current password is wrong.';
            const u = { ...current, password: nextPw, mustChangePassword: false, passwordChangedAt: Date.now() };
            upsert('users', u);
            writeLocal(PREFIX + 'users', data.users);
            current = u;
            return null;
        },
        reset() { COLLECTIONS.forEach(c => writeLocal(PREFIX + c, null)); writeSession(null); },
    };

    // ---------- Firebase backend ----------

    const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = () => reject(new Error('Could not load ' + src));
            document.head.appendChild(s);
        });
    }

    const Firebase = {
        mode: 'firebase',
        subs: [],
        async init(config) {
            await loadScript(SDK + 'firebase-app-compat.js');
            await Promise.all([loadScript(SDK + 'firebase-auth-compat.js'), loadScript(SDK + 'firebase-firestore-compat.js')]);
            this.config = config;
            this.app = firebase.initializeApp(config);
            this.auth = firebase.auth();
            this.db = firebase.firestore();
            this.db.settings({ ignoreUndefinedProperties: true, merge: true });
            await new Promise(resolve => {
                this.auth.onAuthStateChanged(async user => {
                    await this.attach(user);
                    resolve();
                    emit();
                });
            });
        },

        async attach(user) {
            this.subs.forEach(off => off());
            this.subs = [];
            COLLECTIONS.forEach(c => { data[c] = []; });
            if (!user) { current = null; return; }
            const snap = await this.db.collection('users').doc(user.uid).get().catch(() => null);
            if (!snap || !snap.exists || snap.data().active === false) {
                current = { id: user.uid, email: user.email, missing: true };
                return;
            }
            current = { ...snap.data(), id: user.uid };
            this.listen();
        },

        // Each collection is filled from the queries this user's role may read (see firestore.rules).
        listen() {
            const db = this.db;
            const me = current.id;
            const admin = current.role === 'admin';
            const manager = current.role === 'manager';
            const all = c => [db.collection(c)];
            const mineOrTeam = c => admin ? all(c)
                : manager ? [db.collection(c).where('managerId', '==', me), db.collection(c).where('uid', '==', me)]
                : [db.collection(c).where('uid', '==', me)];
            const plan = {
                users: all('users'),
                departments: all('departments'),
                cycles: all('cycles'),
                appraisals: mineOrTeam('appraisals'),
                goals: mineOrTeam('goals'),
                attempts: mineOrTeam('attempts'),
                exams: admin ? all('exams')
                    : manager ? [db.collection('exams').where('createdBy', '==', me), db.collection('exams').where('assignedTo', 'array-contains', me)]
                    : [db.collection('exams').where('assignedTo', 'array-contains', me)],
                examKeys: admin ? all('examKeys') : manager ? [db.collection('examKeys').where('createdBy', '==', me)] : [],
            };
            Object.entries(plan).forEach(([c, queries]) => {
                const parts = queries.map(() => new Map());
                queries.forEach((q, i) => {
                    this.subs.push(q.onSnapshot(snap => {
                        parts[i] = new Map(snap.docs.map(d => [d.id, { ...d.data(), id: d.id }]));
                        const merged = new Map();
                        parts.forEach(p => p.forEach((v, k) => merged.set(k, v)));
                        data[c] = [...merged.values()];
                        if (c === 'users') {
                            const fresh = data.users.find(u => u.id === me);
                            if (fresh) current = fresh;
                        }
                        emit();
                    }, err => console.warn(`Could not load ${c}:`, err.message)));
                });
            });
        },

        async signIn(login, password) {
            try {
                await this.auth.signInWithEmailAndPassword(login.trim(), password);
                return null;
            } catch (e) {
                if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(e.code)) {
                    return 'Wrong email or password. Check both and try again.';
                }
                if (e.code === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes, then try again.';
                if (e.code === 'auth/network-request-failed') return 'No connection. Check your internet and try again.';
                return e.message;
            }
        },
        async signOut() { await this.auth.signOut(); },
        clean: doc => { const { id, password, ...rest } = doc; return rest; },
        async write(c, doc) { await this.db.collection(c).doc(doc.id).set(this.clean(doc)); },
        async remove(c, id) { await this.db.collection(c).doc(id).delete(); },

        // Creating an account signs that account in, so it is done on a second app instance
        // to keep the admin signed in.
        async createUser(profile, password) {
            const second = firebase.apps.find(a => a.name === 'create-user') || firebase.initializeApp(this.config, 'create-user');
            const cred = await second.auth().createUserWithEmailAndPassword(profile.email, password);
            await second.auth().signOut();
            const u = { ...profile, id: cred.user.uid };
            await this.write('users', u);
            return u;
        },
        async resetPassword(email) {
            try { await this.auth.sendPasswordResetEmail(email); return null; } catch (e) { return e.message; }
        },

        // Firebase asks for a recent sign-in before a password change, so the current password is checked first.
        async changePassword(currentPw, nextPw) {
            const user = this.auth.currentUser;
            try {
                await user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(user.email, currentPw));
                await user.updatePassword(nextPw);
            } catch (e) {
                if (['auth/invalid-credential', 'auth/wrong-password'].includes(e.code)) return 'Your current password is wrong.';
                if (e.code === 'auth/weak-password') return 'That password is too weak. Choose a longer one.';
                if (e.code === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes, then try again.';
                if (e.code === 'auth/network-request-failed') return 'No connection. Check your internet and try again.';
                return e.message;
            }
            const done = { mustChangePassword: false, passwordChangedAt: Date.now() };
            await this.db.collection('users').doc(user.uid).update(done);
            current = { ...current, ...done };
            upsert('users', current);
            return null;
        },
    };

    // ---------- Sample data for demo mode ----------

    function seed() {
        const now = Date.now();
        const day = 864e5;
        const year = new Date().getFullYear();
        const at = (m, d) => new Date(year, m - 1, d, 17, 0).getTime();
        const lastAt = (m, d) => new Date(year - 1, m - 1, d, 17, 0).getTime();

        const departments = [
            { id: 'ho', code: 'HO', name: 'Head Office' },
            { id: 'whm', code: 'WHM', name: 'WHM' },
            { id: 'wi', code: 'WI', name: 'Well Intervention' },
        ];
        const P = (id, name, role, deptId, managerId, jobTitle, staffNo) =>
            ({ id, username: id, email: `${id}@demo.sosco`, password: role === 'employee' ? 'employee123' : `${role}123`, name, role, deptId, managerId, jobTitle, staffNo, active: true });
        const users = [
            P('admin', 'Admin', 'admin', 'ho', null, 'HR Administrator', 'S-1001'),
            P('manager', 'Salim Al-Rawahi', 'manager', 'whm', 'admin', 'WHM Supervisor', 'S-1012'),
            P('manager2', 'Khalfan Al-Siyabi', 'manager', 'wi', 'admin', 'WI Supervisor', 'S-1015'),
            P('employee', 'Ahmed Al-Balushi', 'employee', 'whm', 'manager', 'Wellhead Technician', 'S-1104'),
            P('employee2', 'Fatma Al-Hinai', 'employee', 'whm', 'manager', 'Wellhead Technician', 'S-1117'),
            P('employee3', 'Yousuf Al-Amri', 'employee', 'whm', 'manager', 'Assistant Technician', 'S-1123'),
            P('employee4', 'Said Al-Maamari', 'employee', 'wi', 'manager2', 'Coiled Tubing Operator', 'S-1131'),
            P('employee5', 'Maryam Al-Kindi', 'employee', 'wi', 'manager2', 'Pumping Operator', 'S-1138'),
            P('employee6', 'Hamed Al-Busaidi', 'employee', 'wi', 'manager2', 'Slickline Operator', 'S-1142'),
            // A new starter who must choose a password at first sign-in.
            { ...P('newhire', 'Nasser Al-Habsi', 'employee', 'whm', 'manager', 'Trainee Technician', 'S-1150'), password: 'welcome123', mustChangePassword: true },
        ];
        const team = users.filter(u => u.role === 'employee' && !u.mustChangePassword);

        const competencies = [
            { id: 'hse', name: 'HSE & safety behaviour', desc: 'Follows PTW, stops unsafe work, reports hazards and near misses.', weight: 25 },
            { id: 'tech', name: 'Technical competence', desc: 'Knows the equipment and procedures for the role and applies them correctly.', weight: 25 },
            { id: 'quality', name: 'Quality of work', desc: 'Jobs done right first time, with complete reports and paperwork.', weight: 20 },
            { id: 'team', name: 'Teamwork & communication', desc: 'Works well with the crew, client and other departments; clear handovers.', weight: 15 },
            { id: 'reliability', name: 'Reliability & attendance', desc: 'On time for call-outs and rotations; can be counted on.', weight: 15 },
        ];
        const cycles = [
            { id: `cy${year - 1}`, name: `${year - 1} Annual Review`, periodStart: lastAt(1, 1), periodEnd: lastAt(12, 31), selfDue: lastAt(11, 15), managerDue: lastAt(11, 30), status: 'closed', goalsWeight: 40, competencies },
            { id: `cy${year}`, name: `${year} Annual Review`, periodStart: at(1, 1), periodEnd: at(12, 31), selfDue: now + 10 * day, managerDue: now + 24 * day, status: 'active', goalsWeight: 40, competencies },
        ];

        const R = arr => Object.fromEntries(competencies.map((c, i) => [c.id, arr[i]]));
        const prev = {
            employee: [4, 3, 4, 3, 4], employee2: [5, 4, 5, 4, 5], employee3: [3, 3, 2, 3, 3],
            employee4: [4, 4, 3, 4, 4], employee5: [3, 3, 3, 4, 3], employee6: [2, 3, 2, 3, 2],
        };
        const appraisals = [];
        const goals = [];
        const G = (u, cycleId, title, metric, direction, target, actual, weight, rating) => {
            const g = { id: uid(), uid: u.id, managerId: u.managerId, cycleId, title, metric, direction, target, actual, weight, updates: [], createdAt: now - 200 * day };
            goals.push(g);
            return [g.id, rating];
        };

        team.forEach(u => {
            const lastGoals = Object.fromEntries([
                G(u, cycles[0].id, 'Lost-time incidents', 'incidents', 'lower', 0, u.id === 'employee6' ? 1 : 0, 50, u.id === 'employee6' ? 2 : 4),
                G(u, cycles[0].id, 'Jobs completed without NPT', 'jobs', 'higher', 40, { employee: 41, employee2: 46, employee3: 33, employee4: 42, employee5: 38, employee6: 30 }[u.id], 50,
                    { employee: 4, employee2: 5, employee3: 2, employee4: 4, employee5: 3, employee6: 2 }[u.id]),
            ]);
            appraisals.push({
                id: `${cycles[0].id}_${u.id}`, cycleId: cycles[0].id, uid: u.id, managerId: u.managerId, deptId: u.deptId, stage: 'done',
                self: { ratings: R(prev[u.id].map(v => Math.min(5, v + (u.id === 'employee3' ? 1 : 0)))), comment: 'Good year on the rigs.', submittedAt: lastAt(11, 10) },
                review: { ratings: R(prev[u.id]), goalRatings: lastGoals, comment: 'Solid contribution this year.', strengths: 'Safety focus on location.', improvements: 'Paperwork turnaround.', submittedAt: lastAt(11, 25) },
                ack: { at: lastAt(11, 28), comment: '' },
            });
        });

        // Current cycle, at different stages
        const stage = { employee: 'self', employee2: 'review', employee3: 'self', employee4: 'ack', employee5: 'review', employee6: 'self' };
        team.forEach(u => {
            const ids = Object.fromEntries([
                G(u, cycles[1].id, 'Lost-time incidents', 'incidents', 'lower', 0, 0, 30),
                G(u, cycles[1].id, 'Jobs completed without NPT', 'jobs', 'higher', 45, { employee: 31, employee2: 40, employee3: 22, employee4: 39, employee5: 33, employee6: 25 }[u.id], 40),
                G(u, cycles[1].id, 'Toolbox talks led', 'talks', 'higher', 12, { employee: 8, employee2: 12, employee3: 5, employee4: 10, employee5: 9, employee6: 4 }[u.id], 30),
            ].map(([id]) => [id, null]));
            const a = { id: `${cycles[1].id}_${u.id}`, cycleId: cycles[1].id, uid: u.id, managerId: u.managerId, deptId: u.deptId, stage: stage[u.id] };
            if (stage[u.id] !== 'self') a.self = { ratings: R(prev[u.id].map(v => Math.min(5, v + 1))), comment: 'Took on more call-outs this year and led toolbox talks.', submittedAt: now - 3 * day };
            if (stage[u.id] === 'ack') {
                const gids = Object.keys(ids);
                a.review = { ratings: R([4, 4, 4, 5, 4]), goalRatings: { [gids[0]]: 4, [gids[1]]: 4, [gids[2]]: 4 }, comment: 'Reliable operator, strong on safety.', strengths: 'Calm under pressure on live wells.', improvements: 'Mentor the newer operators.', submittedAt: now - day };
            }
            appraisals.push(a);
        });
        goals.filter(g => g.cycleId === cycles[1].id && g.actual > 0).forEach(g => {
            g.updates = [{ at: now - 12 * day, value: Math.round(g.actual * 0.7), note: 'Mid-year update', by: g.uid }, { at: now - 2 * day, value: g.actual, note: 'Updated after last rotation', by: g.uid }];
        });

        // Exams: one open, one closed with results
        const h2s = {
            id: 'ex-h2s', title: 'H2S Awareness Refresher', description: 'Short refresher before the next well-site rotation.',
            passMark: 80, opensAt: now - day, dueAt: now + 3 * day, assignedTo: ['employee', 'employee2', 'employee3'],
            status: 'sent', createdBy: 'manager', createdAt: now - day, sentAt: now - day,
            questions: [
                { id: 'q1', type: 'tf', text: 'H2S is heavier than air and collects in low areas such as cellars and pits.', options: ['True', 'False'], seconds: 20 },
                { id: 'q2', type: 'mcq', text: 'The H2S alarm sounds on location. What do you do first?', options: ['Finish the task you are on', 'Hold your breath, don your escape set and move upwind or crosswind to the muster point', 'Go downwind to the nearest vehicle', 'Look for the source of the leak'], seconds: 30 },
                { id: 'q3', type: 'tf', text: 'You can rely on your sense of smell to detect H2S at high concentrations.', options: ['True', 'False'], seconds: 20 },
                { id: 'q4', type: 'mcq', text: 'What colour is H2S gas?', options: ['Yellow', 'Pale green', 'Colourless', 'Brown'], seconds: 20 },
                { id: 'q5', type: 'mcq', text: 'What tells you which way to move during an H2S release?', options: ['The windsock', 'The flare stack', 'The site layout board', 'The nearest gas detector'], seconds: 25 },
            ],
        };
        const wc = {
            id: 'ex-wc', title: 'Pressure Control Basics', description: 'Before the coiled tubing campaign.',
            passMark: 70, opensAt: now - 20 * day, dueAt: now - 13 * day, assignedTo: ['employee4', 'employee5', 'employee6'],
            status: 'sent', createdBy: 'manager2', createdAt: now - 21 * day, sentAt: now - 20 * day,
            questions: [
                { id: 'w1', type: 'tf', text: 'A kick is an unplanned flow of formation fluid into the wellbore.', options: ['True', 'False'], seconds: 20 },
                { id: 'w2', type: 'mcq', text: 'Which barrier element is tested before rigging up on a live well?', options: ['The pressure control equipment stack', 'The flowline', 'The cellar drain', 'The wind sock'], seconds: 30 },
                { id: 'w3', type: 'tf', text: 'You can bleed off pressure through the stripper rubber.', options: ['True', 'False'], seconds: 20 },
                { id: 'w4', type: 'mcq', text: 'Who authorises breaking containment on the well?', options: ['Any crew member', 'The permit holder under a valid PTW', 'The truck driver', 'The client rep by phone'], seconds: 25 },
            ],
        };
        const examKeys = [
            { id: 'ex-h2s', createdBy: 'manager', answers: [0, 1, 1, 2, 0] },
            { id: 'ex-wc', createdBy: 'manager2', answers: [0, 0, 1, 1] },
        ];
        const A = (exam, u, choices, ago, score) => ({
            id: `${exam.id}_${u}`, examId: exam.id, uid: u, managerId: exam.createdBy, startedAt: ago, qStartedAt: ago + 60000, submittedAt: ago + 60000,
            answers: choices.map(c => ({ choice: c, ms: 8000 + Math.round(Math.random() * 9000) })), score, total: choices.length, scoredAt: ago + 61000,
        });
        const attempts = [
            A(h2s, 'employee2', [0, 1, 1, 2, 3], now - 5 * 36e5, 4),
            A(wc, 'employee4', [0, 0, 1, 1], now - 15 * day, 4),
            A(wc, 'employee5', [0, 0, 0, 1], now - 14 * day, 3),
        ];

        const all = { users, departments, cycles, appraisals, goals, exams: [h2s, wc], examKeys, attempts };
        COLLECTIONS.forEach(c => writeLocal(PREFIX + c, all[c]));
    }

    // ---------- Public API ----------

    return {
        uid,
        get mode() { return backend ? backend.mode : 'demo'; },
        async init() {
            const config = window.SOSCO_FIREBASE_CONFIG;
            backend = config && config.apiKey ? Firebase : Demo;
            await backend.init(config);
        },
        me: () => current,
        onChange(fn) { listeners.add(fn); },
        all: c => data[c],
        get: (c, id) => data[c].find(d => d.id === id),

        // Writes update the cache straight away; the backend saves in the background.
        put(c, doc) {
            upsert(c, doc);
            emit();
            return backend.write(c, doc).catch(err => { emit(); throw err; });
        },
        remove(c, id) {
            data[c] = data[c].filter(d => d.id !== id);
            emit();
            return backend.remove(c, id);
        },

        async signIn(login, password) {
            const err = await backend.signIn(login, password);
            if (!err) emit();
            return err;
        },
        async signOut() { await backend.signOut(); emit(); },
        async createUser(profile, password) {
            const u = await backend.createUser(profile, password);
            upsert('users', u);
            emit();
            return u;
        },
        resetPassword: email => backend.resetPassword(email),
        async changePassword(currentPw, nextPw) {
            const err = await backend.changePassword(currentPw, nextPw);
            if (!err) emit();
            return err;
        },
        resetDemo() { if (backend === Demo) { Demo.reset(); location.reload(); } },
    };
})();
