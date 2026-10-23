// SOSCO ELEVATE app: login, manager exam builder and results, employee timed exams.
(function () {
    'use strict';

    const app = document.getElementById('app');
    const state = { view: 'login', examId: null, draft: null, errors: [], openRow: null, pick: null, confirmDelete: false };
    let timerId = null;

    // ---------- Helpers ----------

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const uid = () => Math.random().toString(36).slice(2, 10);
    const pad = n => String(n).padStart(2, '0');
    const pct = (score, total) => (total ? Math.round(score / total * 100) : 0);
    const me = () => Store.session();
    const LETTERS = 'ABCDEF';

    function fmtDate(ts) {
        return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    function toInput(ts) {
        const d = new Date(ts);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function fromInput(value) {
        const t = new Date(value).getTime();
        return isNaN(t) ? null : t;
    }

    function fmtLeft(ms) {
        const min = Math.max(1, Math.round(ms / 60000));
        if (min < 60) return `${min} min`;
        const h = Math.floor(min / 60);
        if (h < 48) return `${h} h`;
        return `${Math.floor(h / 24)} days`;
    }

    function fmtSecs(s) {
        if (s < 60) return `${s} s`;
        return `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`;
    }

    const ICON = {
        back: '<svg viewBox="0 0 12 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2L2 10l8 8"/></svg>',
        chevron: '<svg class="chevron" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l6 6-6 6"/></svg>',
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
        cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14"/></svg>',
        plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
        user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
        lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
        shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
        briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>',
        hardhat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M14 6a6 6 0 0 1 6 6v3"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><rect x="2" y="15" width="20" height="4" rx="1"/></svg>',
    };

    function ring(size, stroke, fraction, color, inner) {
        const r = (size - stroke) / 2;
        const c = 2 * Math.PI * r;
        const off = c * (1 - Math.max(0, Math.min(1, fraction)));
        return `<div class="ring" style="width:${size}px;height:${size}px">
            <svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>
            <circle class="ring-bar" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/></svg>
            <div class="ring-label">${inner}</div></div>`;
    }

    function toast(text) {
        const el = document.createElement('div');
        el.className = 'toast';
        el.setAttribute('role', 'status');
        el.textContent = text;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2600);
    }

    function go(view, extra) {
        Object.assign(state, { view, errors: [], openRow: null, pick: null, confirmDelete: false }, extra);
        render();
        window.scrollTo(0, 0);
    }

    function home() {
        const u = me();
        go(!u ? 'login' : u.role === 'employee' ? 'employee' : 'manager');
    }

    // ---------- Exam rules ----------

    function finish(exam, attempt, at) {
        while (attempt.answers.length < exam.questions.length) attempt.answers.push({ choice: null, ms: 0 });
        attempt.score = exam.questions.reduce((n, q, i) => n + (attempt.answers[i].choice === q.correct ? 1 : 0), 0);
        attempt.total = exam.questions.length;
        attempt.submittedAt = at || Date.now();
        Store.saveAttempt(attempt);
    }

    // Status of one employee on one exam. An attempt left open past the due time is submitted as it stands.
    function statusOf(exam, username) {
        const a = Store.attempt(exam.id, username);
        const now = Date.now();
        if (a && a.submittedAt) return { key: 'done', a };
        if (now > exam.dueAt) {
            if (a) { finish(exam, a, exam.dueAt); return { key: 'done', a }; }
            return { key: 'missed' };
        }
        if (now < exam.opensAt) return { key: 'upcoming' };
        return a ? { key: 'progress', a } : { key: 'open' };
    }

    function scorePill(exam, a) {
        const p = pct(a.score, a.total);
        return `<span class="pill ${p >= exam.passMark ? 'pill-green' : 'pill-red'}">${a.score}/${a.total} · ${p}%</span>`;
    }

    // ---------- Login ----------

    function viewLogin() {
        const demo = (key, name, dept, tile, icon) => `
            <button type="button" class="row" data-action="demo" data-user="${key}">
                <span class="icon-tile ${tile}">${icon}</span>
                <span class="grow"><span class="title">${name}</span><span class="sub">${dept}</span></span>
                ${ICON.chevron}
            </button>`;
        return `
        <div class="screen-login">
            <div class="header">
                <img class="app-icon" src="icons/icon.svg" alt="SOSCO ELEVATE">
                <h1>SOSCO <span>Elevate</span></h1>
                <div class="subtitle">Middle East Brigade &middot; MEB</div>
            </div>

            <div class="login-card">
                <div class="welcome">Welcome back</div>
                <div class="welcome-sub">Sign in to access your dashboard</div>
                <form id="loginForm" novalidate>
                    <div class="form-group">
                        <label for="username">Username</label>
                        <div class="input-wrap">${ICON.user}<input id="username" type="text" placeholder="john.smith" autocomplete="username" autocapitalize="none"></div>
                    </div>
                    <div class="form-group">
                        <label for="password">Password</label>
                        <div class="input-wrap">${ICON.lock}<input id="password" type="password" placeholder="Enter your password" autocomplete="current-password"></div>
                    </div>
                    <p id="loginError" class="form-error" role="alert" hidden>Wrong username or password. Check both and try again.</p>
                    <button type="submit" class="btn btn-primary">Sign In</button>
                </form>
            </div>

            <div class="section-label">Demo accounts</div>
            <div class="group">
                ${demo('admin', 'Admin', 'HO · MEB', 'tile-admin', ICON.shield)}
                ${demo('manager', 'Manager', 'WHM · Salim Al-Rawahi', 'tile-manager', ICON.briefcase)}
                ${demo('employee', 'Employee', 'WHM · Ahmed Al-Balushi', 'tile-employee', ICON.hardhat)}
            </div>
            <p class="section-foot">Tap an account to fill in its username and password. Other employees: employee2, employee3 (password employee123).</p>
        </div>`;
    }

    // ---------- Manager: exam list ----------

    function topBar(left) {
        const u = me();
        return `<div class="nav">${left || `<span class="who">${esc(u.name)} · ${u.role === 'admin' ? 'Admin' : 'Manager'}</span>`}
            <button class="nav-btn" data-action="logout">Sign Out</button></div>`;
    }

    function viewManager() {
        const u = me();
        const exams = Store.exams()
            .filter(e => u.role === 'admin' || e.createdBy === u.username)
            .sort((a, b) => b.createdAt - a.createdAt);
        const sent = exams.filter(e => e.status === 'sent');
        const drafts = exams.filter(e => e.status === 'draft');
        const now = Date.now();

        const sentRows = sent.map(e => {
            const done = e.assignedTo.filter(name => statusOf(e, name).key === 'done').length;
            const all = done === e.assignedTo.length;
            const when = now > e.dueAt ? `Closed ${fmtDate(e.dueAt)}` : `Due ${fmtDate(e.dueAt)}`;
            return `<button class="row" data-action="results" data-id="${e.id}">
                <span class="grow"><span class="title">${esc(e.title)}</span><span class="sub">${e.questions.length} questions · ${when}</span></span>
                <span class="pill ${all ? 'pill-green' : 'pill-grey'}">${done}/${e.assignedTo.length} done</span>${ICON.chevron}</button>`;
        }).join('');

        const draftRows = drafts.map(e => `<button class="row" data-action="edit" data-id="${e.id}">
                <span class="grow"><span class="title">${esc(e.title) || 'Untitled exam'}</span><span class="sub">${e.questions.length} questions · Not sent</span></span>
                <span class="pill pill-grey">Draft</span>${ICON.chevron}</button>`).join('');

        return `<div class="screen">
            ${topBar()}
            <h1 class="large-title">Exams</h1>
            <button class="btn btn-primary" data-action="new">${ICON.plus} New Exam</button>

            <div class="section-label">Sent</div>
            <div class="group">${sentRows || '<div class="row empty">No exams sent yet. Tap New Exam to write one.</div>'}</div>

            ${drafts.length ? `<div class="section-label">Drafts</div><div class="group">${draftRows}</div>` : ''}
        </div>`;
    }

    // ---------- Manager: exam builder ----------

    function newQuestion(type) {
        return type === 'tf'
            ? { id: uid(), type: 'tf', text: '', options: ['True', 'False'], correct: 0, seconds: 20 }
            : { id: uid(), type: 'mcq', text: '', options: ['', '', '', ''], correct: 0, seconds: 30 };
    }

    function newDraft() {
        const now = Date.now();
        const due = new Date(now + 2 * 864e5);
        due.setMinutes(0, 0, 0);
        return {
            id: uid(), title: '', description: '', passMark: 70, opensAt: now, dueAt: due.getTime(),
            assignedTo: [], status: 'draft', createdBy: me().username, createdAt: now, questions: [newQuestion('mcq')],
        };
    }

    function validate(d) {
        const errors = [];
        if (!d.title.trim()) errors.push('Give the exam a title.');
        if (!d.assignedTo.length) errors.push('Choose at least one employee.');
        if (!d.opensAt || !d.dueAt) errors.push('Set when the exam opens and when it is due.');
        else if (d.dueAt <= d.opensAt) errors.push('The due time must be after the opening time.');
        else if (d.dueAt <= Date.now()) errors.push('The due time is in the past. Pick a later time.');
        if (!d.questions.length) errors.push('Add at least one question.');
        d.questions.forEach((q, i) => {
            if (!q.text.trim()) errors.push(`Question ${i + 1} has no text.`);
            if (q.type === 'mcq') {
                const filled = q.options.filter(o => o.trim()).length;
                if (filled < 2 || filled !== q.options.length) errors.push(`Question ${i + 1}: fill in every answer, at least two.`);
            }
        });
        return errors;
    }

    function viewEditor() {
        const d = state.draft;
        const totalSecs = d.questions.reduce((n, q) => n + q.seconds, 0);
        const emps = Store.employees();

        const people = emps.map(p => `<label class="row">
                <input type="checkbox" class="check" data-assign="${p.username}" ${d.assignedTo.includes(p.username) ? 'checked' : ''}>
                <span class="grow"><span class="title">${esc(p.name)}</span><span class="sub">${esc(p.dept)} · ${p.username}</span></span></label>`).join('');

        const questions = d.questions.map((q, i) => {
            const answers = q.type === 'tf'
                ? q.options.map((o, j) => `<button type="button" class="row opt" data-action="correct" data-q="${i}" data-opt="${j}">
                        <span class="mark ${q.correct === j ? 'on' : ''}">${ICON.check}</span><span class="grow">${o}</span></button>`).join('')
                : q.options.map((o, j) => `<div class="row opt">
                        <button type="button" class="mark ${q.correct === j ? 'on' : ''}" data-action="correct" data-q="${i}" data-opt="${j}" aria-label="Mark answer ${LETTERS[j]} as correct">${ICON.check}</button>
                        <input class="input-plain" data-q="${i}" data-opt="${j}" value="${esc(o)}" placeholder="Answer ${LETTERS[j]}">
                        ${q.options.length > 2 ? `<button type="button" class="icon-btn" data-action="delopt" data-q="${i}" data-opt="${j}" aria-label="Remove answer ${LETTERS[j]}">${ICON.cross}</button>` : ''}
                    </div>`).join('') + (q.options.length < 6 ? `<button type="button" class="row add-row" data-action="addopt" data-q="${i}">${ICON.plus} Add answer</button>` : '');

            return `<div class="q-card">
                <div class="q-head">
                    <span class="q-num">Question ${i + 1}</span>
                    ${d.questions.length > 1 ? `<button type="button" class="link-danger" data-action="delq" data-q="${i}">Delete</button>` : ''}
                </div>
                <div class="seg" role="group" aria-label="Question type">
                    <button type="button" class="${q.type === 'mcq' ? 'on' : ''}" data-action="qtype" data-q="${i}" data-type="mcq">Multiple choice</button>
                    <button type="button" class="${q.type === 'tf' ? 'on' : ''}" data-action="qtype" data-q="${i}" data-type="tf">True / False</button>
                </div>
                <textarea class="q-text-input" id="q-${q.id}" data-q="${i}" data-field="text" rows="2" placeholder="Type the question">${esc(q.text)}</textarea>
                <div class="hint">Tap the circle next to the correct answer.</div>
                <div class="group inset">${answers}</div>
                <div class="timer-row">
                    <span>Time for this question</span>
                    <div class="stepper">
                        <button type="button" data-action="step" data-q="${i}" data-d="-5" aria-label="Less time">${ICON.minus}</button>
                        <b>${fmtSecs(q.seconds)}</b>
                        <button type="button" data-action="step" data-q="${i}" data-d="5" aria-label="More time">${ICON.plus}</button>
                    </div>
                </div>
            </div>`;
        }).join('');

        return `<div class="screen">
            <div class="nav"><button class="nav-btn" data-action="home">${ICON.back} Exams</button></div>
            <h1 class="large-title">${Store.exam(d.id) ? 'Edit Draft' : 'New Exam'}</h1>

            <div class="section-label">Details</div>
            <div class="group">
                <div class="row"><input class="input-plain" id="exam-title" data-field="title" value="${esc(d.title)}" placeholder="Title, e.g. Well Control Basics"></div>
                <div class="row"><textarea class="input-plain" id="exam-desc" data-field="description" rows="2" placeholder="Note for employees (optional)">${esc(d.description)}</textarea></div>
                <label class="row"><span class="grow">Pass mark</span><input class="input-plain num" id="exam-pass" type="number" min="1" max="100" data-field="passMark" value="${d.passMark}"><span class="unit">%</span></label>
            </div>

            <div class="section-label">Time window</div>
            <div class="group">
                <label class="row"><span class="grow">Opens</span><input class="input-plain date" id="exam-opens" type="datetime-local" data-field="opensAt" value="${toInput(d.opensAt)}"></label>
                <label class="row"><span class="grow">Due</span><input class="input-plain date" id="exam-due" type="datetime-local" data-field="dueAt" value="${toInput(d.dueAt)}"></label>
            </div>
            <p class="section-foot">Employees can only start the exam between these times. Unfinished exams are submitted at the due time.</p>

            <div class="section-label section-label-split"><span>Send to</span><button type="button" class="link" data-action="allpeople">${d.assignedTo.length === emps.length ? 'Clear all' : 'Select all'}</button></div>
            <div class="group">${people}</div>

            <div class="section-label">Questions · ${d.questions.length} · ${fmtSecs(totalSecs)} in total</div>
            ${questions}
            <button type="button" class="btn btn-secondary" data-action="addq">${ICON.plus} Add Question</button>

            ${state.errors.length ? `<div class="errors" role="alert"><b>Before sending:</b><ul>${state.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}

            <div class="actions">
                <button type="button" class="btn btn-primary" data-action="send">Send to ${d.assignedTo.length || ''} ${d.assignedTo.length === 1 ? 'Employee' : 'Employees'}</button>
                <button type="button" class="btn btn-plain" data-action="savedraft">Save as Draft</button>
                ${Store.exam(d.id) ? `<button type="button" class="btn btn-plain danger" data-action="delete">${state.confirmDelete ? 'Tap again to delete this draft' : 'Delete Draft'}</button>` : ''}
            </div>
        </div>`;
    }

    // ---------- Manager: results ----------

    function viewResults() {
        const e = Store.exam(state.examId);
        if (!e) { home(); return ''; }
        const rows = e.assignedTo.map(name => ({ user: Store.user(name) || { name, username: name, dept: '' }, st: statusOf(e, name) }));
        const done = rows.filter(r => r.st.key === 'done');
        const avg = done.length ? Math.round(done.reduce((n, r) => n + pct(r.st.a.score, r.st.a.total), 0) / done.length) : null;
        const passed = done.filter(r => pct(r.st.a.score, r.st.a.total) >= e.passMark).length;
        const closed = Date.now() > e.dueAt;

        const PILLS = {
            progress: '<span class="pill pill-orange">In progress</span>',
            open: '<span class="pill pill-grey">Not started</span>',
            upcoming: '<span class="pill pill-grey">Not open yet</span>',
            missed: '<span class="pill pill-red">Missed</span>',
        };

        const people = rows.map(({ user, st }) => {
            const isDone = st.key === 'done';
            const open = isDone && state.openRow === user.username;
            const head = `<span class="grow"><span class="title">${esc(user.name)}</span>
                <span class="sub">${isDone ? `Submitted ${fmtDate(st.a.submittedAt)}` : esc(user.dept)}</span></span>
                ${isDone ? scorePill(e, st.a) : PILLS[st.key]}`;
            if (!isDone) return `<div class="row">${head}</div>`;
            const detail = !open ? '' : `<div class="detail">${e.questions.map((q, i) => {
                const ans = st.a.answers[i] || { choice: null, ms: 0 };
                const ok = ans.choice === q.correct;
                const given = ans.choice === null ? 'No answer (time ran out)' : esc(q.options[ans.choice]);
                return `<div class="d-item"><span class="d-mark ${ok ? 'ok' : 'bad'}">${ok ? ICON.check : ICON.cross}</span>
                    <div class="grow"><div class="d-q">${i + 1}. ${esc(q.text)}</div>
                    <div class="d-a">Answered: ${given} · ${Math.round(ans.ms / 1000)} s</div>
                    ${ok ? '' : `<div class="d-a">Correct: ${esc(q.options[q.correct])}</div>`}</div></div>`;
            }).join('')}</div>`;
            return `<button class="row" data-action="toggle" data-user="${user.username}" aria-expanded="${open}">${head}
                <svg class="chevron ${open ? 'down' : ''}" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l6 6-6 6"/></svg></button>${detail}`;
        }).join('');

        const perQuestion = e.questions.map((q, i) => {
            const right = done.filter(r => r.st.a.answers[i] && r.st.a.answers[i].choice === q.correct).length;
            return `<div class="row"><span class="grow"><span class="title clamp">${i + 1}. ${esc(q.text)}</span>
                <span class="sub">${q.type === 'tf' ? 'True / False' : 'Multiple choice'} · ${fmtSecs(q.seconds)}</span></span>
                <span class="count">${done.length ? `${right}/${done.length}` : '–'}</span></div>`;
        }).join('');

        return `<div class="screen">
            <div class="nav"><button class="nav-btn" data-action="home">${ICON.back} Exams</button></div>
            <h1 class="large-title">${esc(e.title)}</h1>
            <p class="lead">${closed ? `Closed ${fmtDate(e.dueAt)}` : `Open until ${fmtDate(e.dueAt)}`} · Pass mark ${e.passMark}%</p>

            <div class="stats">
                <div class="stat"><b>${done.length}/${rows.length}</b><span>Submitted</span></div>
                <div class="stat"><b>${avg === null ? '–' : avg + '%'}</b><span>Average</span></div>
                <div class="stat"><b>${passed}</b><span>Passed</span></div>
            </div>

            <div class="section-label">Employees</div>
            <div class="group">${people}</div>
            <p class="section-foot">Tap a submitted result to see each answer.</p>

            <div class="section-label">Correct answers per question</div>
            <div class="group">${perQuestion}</div>

            <div class="actions">
                <button type="button" class="btn btn-plain danger" data-action="delete">${state.confirmDelete ? 'Tap again to delete exam and results' : 'Delete Exam'}</button>
            </div>
        </div>`;
    }

    // ---------- Employee: exam list ----------

    function viewEmployee() {
        const u = me();
        const now = Date.now();
        const mine = Store.exams()
            .filter(e => e.status === 'sent' && e.assignedTo.includes(u.username))
            .map(e => ({ e, st: statusOf(e, u.username) }))
            .sort((a, b) => a.e.dueAt - b.e.dueAt);

        const todo = mine.filter(x => ['open', 'progress', 'upcoming'].includes(x.st.key));
        const done = mine.filter(x => x.st.key === 'done').reverse();
        const missed = mine.filter(x => x.st.key === 'missed');

        const todoRows = todo.map(({ e, st }) => {
            const sub = st.key === 'upcoming' ? `Opens ${fmtDate(e.opensAt)}` : `Due in ${fmtLeft(e.dueAt - now)} · ${fmtDate(e.dueAt)}`;
            const pill = st.key === 'progress' ? '<span class="pill pill-orange">In progress</span>'
                : st.key === 'upcoming' ? '<span class="pill pill-grey">Soon</span>' : '<span class="pill pill-blue">New</span>';
            return `<button class="row" data-action="intro" data-id="${e.id}"><span class="grow"><span class="title">${esc(e.title)}</span>
                <span class="sub">${sub}</span></span>${pill}${ICON.chevron}</button>`;
        }).join('');

        const doneRows = done.map(({ e, st }) => `<button class="row" data-action="score" data-id="${e.id}">
                <span class="grow"><span class="title">${esc(e.title)}</span><span class="sub">Submitted ${fmtDate(st.a.submittedAt)}</span></span>
                ${scorePill(e, st.a)}${ICON.chevron}</button>`).join('');

        const missedRows = missed.map(({ e }) => `<div class="row"><span class="grow"><span class="title">${esc(e.title)}</span>
                <span class="sub">Closed ${fmtDate(e.dueAt)}</span></span><span class="pill pill-red">Missed</span></div>`).join('');

        return `<div class="screen">
            <div class="nav"><span class="who">${esc(u.name)} · ${esc(u.dept)}</span><button class="nav-btn" data-action="logout">Sign Out</button></div>
            <h1 class="large-title">My Exams</h1>

            <div class="section-label">To do</div>
            <div class="group">${todoRows || '<div class="row empty">Nothing to do. New exams from your manager will show up here.</div>'}</div>

            ${done.length ? `<div class="section-label">Completed</div><div class="group">${doneRows}</div>` : ''}
            ${missed.length ? `<div class="section-label">Missed</div><div class="group">${missedRows}</div>` : ''}
        </div>`;
    }

    // ---------- Employee: before starting ----------

    function viewIntro() {
        const e = Store.exam(state.examId);
        const st = statusOf(e, me().username);
        if (st.key === 'done') { go('score', { examId: e.id }); return ''; }
        const from = Store.user(e.createdBy);
        const total = e.questions.reduce((n, q) => n + q.seconds, 0);
        const canStart = st.key === 'open' || st.key === 'progress';
        const reason = st.key === 'upcoming' ? `This exam opens ${fmtDate(e.opensAt)}.` : st.key === 'missed' ? 'This exam has closed.' : '';

        return `<div class="screen">
            <div class="nav"><button class="nav-btn" data-action="home">${ICON.back} My Exams</button></div>
            <h1 class="large-title">${esc(e.title)}</h1>
            ${e.description ? `<p class="lead">${esc(e.description)}</p>` : ''}

            <div class="group">
                <div class="row"><span class="grow">From</span><span class="value">${esc(from ? from.name : e.createdBy)}</span></div>
                <div class="row"><span class="grow">Questions</span><span class="value">${e.questions.length}</span></div>
                <div class="row"><span class="grow">Total time</span><span class="value">${fmtSecs(total)}</span></div>
                <div class="row"><span class="grow">Pass mark</span><span class="value">${e.passMark}%</span></div>
                <div class="row"><span class="grow">Due</span><span class="value">${fmtDate(e.dueAt)}</span></div>
            </div>

            <div class="section-label">How it works</div>
            <div class="group rules">
                <div class="row">Each question has its own timer.</div>
                <div class="row">When the time runs out, the exam moves to the next question.</div>
                <div class="row">You can't go back to a question once you leave it.</div>
                <div class="row">Your score goes to ${esc(from ? from.name : 'your manager')} when you finish.</div>
            </div>

            <div class="actions">
                ${reason ? `<p class="section-foot">${reason}</p>` : ''}
                <button class="btn btn-primary" data-action="start" ${canStart ? '' : 'disabled'}>${st.key === 'progress' ? 'Resume Exam' : 'Start Exam'}</button>
            </div>
        </div>`;
    }

    // ---------- Employee: taking the exam ----------

    function currentRun() {
        const e = Store.exam(state.examId);
        const a = e && Store.attempt(e.id, me().username);
        return { e, a, q: e && a ? e.questions[a.answers.length] : null };
    }

    function viewRun() {
        const { e, a, q } = currentRun();
        if (!q) { go('score', { examId: state.examId }); return ''; }
        const i = a.answers.length;
        const last = i === e.questions.length - 1;
        return `<div class="screen run">
            <div class="run-top">
                <div class="grow">
                    <div class="run-count">Question ${i + 1} of ${e.questions.length}</div>
                    <div class="progress"><span style="width:${i / e.questions.length * 100}%"></span></div>
                </div>
                <div id="timer">${ring(64, 6, 1, 'var(--blue)', q.seconds)}</div>
            </div>
            <div class="q-type">${q.type === 'tf' ? 'True or false' : 'Choose one answer'}</div>
            <h2 class="q-text">${esc(q.text)}</h2>
            <div class="choices">
                ${q.options.map((o, j) => `<button class="choice ${state.pick === j ? 'on' : ''}" data-action="pick" data-opt="${j}">
                    <span class="letter">${q.type === 'tf' ? (j === 0 ? 'T' : 'F') : LETTERS[j]}</span><span class="grow">${esc(o)}</span></button>`).join('')}
            </div>
            <div class="actions">
                <button class="btn btn-primary" data-action="next" ${state.pick === null ? 'disabled' : ''}>${last ? 'Submit' : 'Next'}</button>
            </div>
        </div>`;
    }

    function advance(choice) {
        const { e, a, q } = currentRun();
        if (!q) return;
        const now = Date.now();
        a.answers.push({ choice, ms: Math.min(now - a.qStartedAt, q.seconds * 1000) });
        a.qStartedAt = now;
        state.pick = null;
        if (a.answers.length === e.questions.length) {
            finish(e, a);
            go('score', { examId: e.id });
            return;
        }
        Store.saveAttempt(a);
        render();
    }

    function tick() {
        const { e, a, q } = currentRun();
        if (!q) return;
        const now = Date.now();
        if (now > e.dueAt) {
            finish(e, a, e.dueAt);
            toast('The exam has closed. Your answers so far were submitted.');
            go('score', { examId: e.id });
            return;
        }
        const left = q.seconds * 1000 - (now - a.qStartedAt);
        if (left <= 0) {
            if (state.pick !== null) { advance(state.pick); return; }
            toast('Time is up for that question.');
            advance(null);
            return;
        }
        const secs = Math.ceil(left / 1000);
        const color = secs <= 5 ? 'var(--red)' : secs <= 10 ? 'var(--orange)' : 'var(--blue)';
        const box = document.getElementById('timer');
        if (box) box.innerHTML = ring(64, 6, left / (q.seconds * 1000), color, secs);
    }

    // ---------- Employee: score ----------

    function viewScore() {
        const e = Store.exam(state.examId);
        const a = Store.attempt(e.id, me().username);
        if (!a || !a.submittedAt) { home(); return ''; }
        const p = pct(a.score, a.total);
        const pass = p >= e.passMark;
        const from = Store.user(e.createdBy);
        return `<div class="screen score">
            <div class="nav"><button class="nav-btn" data-action="home">${ICON.back} My Exams</button></div>
            <div class="score-hero">
                ${ring(180, 14, p / 100, pass ? 'var(--green)' : 'var(--red)', `<b>${p}%</b><span>${a.score} of ${a.total} correct</span>`)}
                <h1 class="large-title">${pass ? 'Passed' : 'Not passed'}</h1>
                <p class="lead">${esc(e.title)} · pass mark ${e.passMark}%</p>
            </div>
            <div class="group">
                <div class="row"><span class="grow">Submitted</span><span class="value">${fmtDate(a.submittedAt)}</span></div>
                <div class="row"><span class="grow">Sent to</span><span class="value">${esc(from ? from.name : e.createdBy)}</span></div>
            </div>
            <div class="actions"><button class="btn btn-primary" data-action="home">Back to My Exams</button></div>
        </div>`;
    }

    // ---------- Render and events ----------

    const VIEWS = { login: viewLogin, manager: viewManager, editor: viewEditor, results: viewResults, employee: viewEmployee, intro: viewIntro, run: viewRun, score: viewScore };

    function render() {
        clearInterval(timerId);
        const html = VIEWS[state.view]();
        if (html) app.innerHTML = html;
        if (state.view === 'run' && html) {
            tick();
            timerId = setInterval(tick, 250);
        }
    }

    app.addEventListener('submit', ev => {
        if (ev.target.id !== 'loginForm') return;
        ev.preventDefault();
        const user = Store.login(document.getElementById('username').value, document.getElementById('password').value);
        if (!user) { document.getElementById('loginError').hidden = false; return; }
        Store.setSession(user);
        home();
    });

    app.addEventListener('input', ev => {
        const t = ev.target;
        const d = state.draft;
        if (state.view !== 'editor' || !d) return;
        if (t.dataset.opt !== undefined && t.dataset.q !== undefined) d.questions[+t.dataset.q].options[+t.dataset.opt] = t.value;
        else if (t.dataset.q !== undefined && t.dataset.field === 'text') d.questions[+t.dataset.q].text = t.value;
        else if (t.dataset.field === 'title' || t.dataset.field === 'description') d[t.dataset.field] = t.value;
        else if (t.dataset.field === 'passMark') d.passMark = Math.max(1, Math.min(100, parseInt(t.value, 10) || 70));
    });

    app.addEventListener('change', ev => {
        const t = ev.target;
        const d = state.draft;
        if (state.view !== 'editor' || !d) return;
        if (t.dataset.field === 'opensAt' || t.dataset.field === 'dueAt') d[t.dataset.field] = fromInput(t.value);
        if (t.dataset.assign) {
            d.assignedTo = d.assignedTo.filter(x => x !== t.dataset.assign);
            if (t.checked) d.assignedTo.push(t.dataset.assign);
            render();
        }
    });

    app.addEventListener('click', ev => {
        const el = ev.target.closest('[data-action]');
        if (!el) return;
        const act = el.dataset.action;
        const d = state.draft;
        const q = el.dataset.q !== undefined ? d.questions[+el.dataset.q] : null;

        switch (act) {
            case 'demo': {
                const pw = { admin: 'admin123', manager: 'manager123', employee: 'employee123' }[el.dataset.user];
                document.getElementById('username').value = el.dataset.user;
                document.getElementById('password').value = pw;
                document.getElementById('loginError').hidden = true;
                break;
            }
            case 'logout': Store.clearSession(); go('login'); break;
            case 'home': home(); break;

            case 'new': go('editor', { draft: newDraft() }); break;
            case 'edit': go('editor', { draft: JSON.parse(JSON.stringify(Store.exam(el.dataset.id))) }); break;
            case 'results': go('results', { examId: el.dataset.id }); break;
            case 'toggle': state.openRow = state.openRow === el.dataset.user ? null : el.dataset.user; render(); break;

            case 'addq': d.questions.push(newQuestion(d.questions.at(-1)?.type || 'mcq')); render(); break;
            case 'delq': d.questions.splice(+el.dataset.q, 1); render(); break;
            case 'qtype':
                if (q.type !== el.dataset.type) Object.assign(q, newQuestion(el.dataset.type), { id: q.id, text: q.text });
                render();
                break;
            case 'correct': q.correct = +el.dataset.opt; render(); break;
            case 'addopt': q.options.push(''); render(); break;
            case 'delopt': {
                const j = +el.dataset.opt;
                q.options.splice(j, 1);
                if (q.correct === j) q.correct = 0;
                else if (q.correct > j) q.correct--;
                render();
                break;
            }
            case 'step': q.seconds = Math.max(5, Math.min(600, q.seconds + +el.dataset.d)); render(); break;
            case 'allpeople': {
                const all = Store.employees().map(p => p.username);
                d.assignedTo = d.assignedTo.length === all.length ? [] : all;
                render();
                break;
            }
            case 'savedraft':
                d.status = 'draft';
                Store.saveExam(d);
                toast('Draft saved');
                home();
                break;
            case 'send': {
                state.errors = validate(d);
                if (state.errors.length) {
                    render();
                    document.querySelector('.errors').scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return;
                }
                Object.assign(d, { status: 'sent', sentAt: Date.now() });
                Store.saveExam(d);
                toast(`Sent to ${d.assignedTo.length} ${d.assignedTo.length === 1 ? 'employee' : 'employees'}`);
                go('results', { examId: d.id });
                break;
            }
            case 'delete': {
                if (!state.confirmDelete) { state.confirmDelete = true; render(); return; }
                Store.deleteExam(state.view === 'editor' ? d.id : state.examId);
                toast('Deleted');
                home();
                break;
            }

            case 'intro': go('intro', { examId: el.dataset.id }); break;
            case 'score': go('score', { examId: el.dataset.id }); break;
            case 'start': {
                const e = Store.exam(state.examId);
                const st = statusOf(e, me().username);
                if (st.key !== 'open' && st.key !== 'progress') { render(); return; }
                if (!st.a) {
                    const now = Date.now();
                    Store.saveAttempt({ id: `${e.id}:${me().username}`, examId: e.id, username: me().username, startedAt: now, qStartedAt: now, answers: [] });
                }
                go('run', { examId: e.id });
                break;
            }
            case 'pick': state.pick = +el.dataset.opt; render(); break;
            case 'next': if (state.pick !== null) advance(state.pick); break;
        }
    });

    home();
})();
