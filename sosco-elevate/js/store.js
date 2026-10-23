// Data layer for SOSCO ELEVATE.
//
// Demo mode: everything is kept in this browser's localStorage, so a manager
// and an employee can only share exams when they use the same browser.
// To share exams across devices, replace these functions with Firebase
// (Authentication for users, Firestore for exams and attempts) keeping the
// same names and data shapes.
const Store = (() => {
    const memory = {};

    function read(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            if (value !== null) return JSON.parse(value);
        } catch (e) { /* storage blocked: use memory */ }
        return key in memory ? memory[key] : fallback;
    }

    function write(key, value) {
        memory[key] = value;
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* memory only */ }
    }

    // Demo accounts for testing only. Real accounts belong in Firebase Authentication.
    const USERS = [
        { username: 'admin', password: 'admin123', name: 'Admin', role: 'admin', dept: 'HO · MEB' },
        { username: 'manager', password: 'manager123', name: 'Salim Al-Rawahi', role: 'manager', dept: 'WHM' },
        { username: 'employee', password: 'employee123', name: 'Ahmed Al-Balushi', role: 'employee', dept: 'WHM' },
        { username: 'employee2', password: 'employee123', name: 'Fatma Al-Hinai', role: 'employee', dept: 'WHM' },
        { username: 'employee3', password: 'employee123', name: 'Yousuf Al-Amri', role: 'employee', dept: 'WHM' },
    ];

    function seed() {
        if (read('sosco.exams', null) !== null) return;
        const now = Date.now();
        const exam = {
            id: 'sample-h2s',
            title: 'H2S Awareness Refresher (sample)',
            description: 'Short refresher before the next well-site rotation.',
            passMark: 80,
            opensAt: now - 864e5,
            dueAt: now + 3 * 864e5,
            assignedTo: ['employee', 'employee2', 'employee3'],
            status: 'sent',
            createdBy: 'manager',
            createdAt: now - 864e5,
            sentAt: now - 864e5,
            questions: [
                { id: 'q1', type: 'tf', text: 'H2S is heavier than air and collects in low areas such as cellars and pits.', options: ['True', 'False'], correct: 0, seconds: 20 },
                { id: 'q2', type: 'mcq', text: 'The H2S alarm sounds on location. What do you do first?', options: ['Finish the task you are on', 'Hold your breath, don your escape set and move upwind or crosswind to the muster point', 'Go downwind to the nearest vehicle', 'Look for the source of the leak'], correct: 1, seconds: 30 },
                { id: 'q3', type: 'tf', text: 'You can rely on your sense of smell to detect H2S at high concentrations.', options: ['True', 'False'], correct: 1, seconds: 20 },
                { id: 'q4', type: 'mcq', text: 'What colour is H2S gas?', options: ['Yellow', 'Pale green', 'Colourless', 'Brown'], correct: 2, seconds: 20 },
                { id: 'q5', type: 'mcq', text: 'What tells you which way to move during an H2S release?', options: ['The windsock', 'The flare stack', 'The site layout board', 'The nearest gas detector'], correct: 0, seconds: 25 },
            ],
        };
        write('sosco.exams', [exam]);
        write('sosco.attempts', [{
            id: 'sample-h2s:employee2', examId: 'sample-h2s', username: 'employee2',
            startedAt: now - 3 * 36e5, qStartedAt: now - 3 * 36e5 + 80000, submittedAt: now - 3 * 36e5 + 80000,
            answers: [{ choice: 0, ms: 9000 }, { choice: 1, ms: 14000 }, { choice: 1, ms: 8000 }, { choice: 2, ms: 6000 }, { choice: 3, ms: 21000 }],
            score: 4, total: 5,
        }]);
    }

    seed();

    return {
        login(username, password) {
            const u = USERS.find(x => x.username === username.trim().toLowerCase() && x.password === password);
            return u ? { ...u, password: undefined } : null;
        },
        user: username => USERS.find(x => x.username === username),
        employees: () => USERS.filter(x => x.role === 'employee'),

        session: () => read('sosco.session', null),
        setSession: user => write('sosco.session', user),
        clearSession: () => write('sosco.session', null),

        exams: () => read('sosco.exams', []),
        exam: id => read('sosco.exams', []).find(e => e.id === id),
        saveExam(exam) {
            const list = read('sosco.exams', []).filter(e => e.id !== exam.id);
            write('sosco.exams', [...list, exam]);
        },
        deleteExam(id) {
            write('sosco.exams', read('sosco.exams', []).filter(e => e.id !== id));
            write('sosco.attempts', read('sosco.attempts', []).filter(a => a.examId !== id));
        },

        attempt: (examId, username) => read('sosco.attempts', []).find(a => a.examId === examId && a.username === username),
        saveAttempt(attempt) {
            const list = read('sosco.attempts', []).filter(a => a.id !== attempt.id);
            write('sosco.attempts', [...list, attempt]);
        },
    };
})();
