// Shared helpers, scoring rules, navigation and rendering for SOSCO ELEVATE.
const App = (() => {
    'use strict';

    const state = { tab: 'home', view: 'login', params: {}, errors: [], ui: {} };
    const views = {};
    const actions = {};
    const afterRender = [];
    let renderQueued = false;

    // ---------- Formatting ----------

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pad = n => String(n).padStart(2, '0');
    const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
    const DAY = 864e5;

    const fmtDate = ts => new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const fmtDay = ts => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const toInput = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    const toDateInput = ts => toInput(ts).slice(0, 10);
    const fromInput = v => { const t = new Date(v).getTime(); return isNaN(t) ? null : t; };
    const fromDateInput = v => fromInput(v + 'T17:00');

    function fmtLeft(ms) {
        const min = Math.max(1, Math.round(Math.abs(ms) / 60000));
        if (min < 60) return `${min} min`;
        const h = Math.floor(min / 60);
        if (h < 48) return `${h} h`;
        return `${Math.floor(h / 24)} days`;
    }
    const fmtSecs = s => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`);
    const fmtScore = n => (n == null ? '–' : n.toFixed(2));
    const initials = name => String(name || '?').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();

    // ---------- People ----------

    const me = () => Store.me();
    const user = id => Store.get('users', id);
    const nameOf = id => (user(id) ? user(id).name : 'Unknown');
    const dept = id => Store.get('departments', id);
    const isAdmin = () => me() && me().role === 'admin';
    const isManager = () => me() && (me().role === 'manager' || me().role === 'admin');
    const ROLE = { admin: 'Admin', manager: 'Manager', employee: 'Employee' };

    // People this user evaluates: admins see everyone active, managers their direct team.
    function team() {
        const u = me();
        return Store.all('users')
            .filter(p => p.active !== false && p.id !== u.id && (u.role === 'admin' ? p.role !== 'admin' : p.managerId === u.id))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    // ---------- Review scoring ----------

    const RATINGS = ['', 'Unsatisfactory', 'Needs improvement', 'Meets expectations', 'Exceeds expectations', 'Outstanding'];
    const SHORT = ['', 'Unsat.', 'Needs impr.', 'Meets', 'Exceeds', 'Outstanding'];
    const band = score => (score == null ? 0 : score >= 4.5 ? 5 : score >= 3.5 ? 4 : score >= 2.5 ? 3 : score >= 1.5 ? 2 : 1);
    const STAGES = { self: 'Self-assessment', review: 'Manager review', ack: 'Employee sign-off', done: 'Complete' };

    // Achievement against target, in percent. "lower" goals (e.g. incidents) are met when actual <= target.
    function achievement(g) {
        const actual = Number(g.actual) || 0;
        const target = Number(g.target) || 0;
        if (g.direction === 'lower') {
            if (actual <= target) return 100;
            return target > 0 ? Math.round(target / actual * 100) : 0;
        }
        return target > 0 ? Math.round(actual / target * 100) : 100;
    }
    const suggestRating = p => (p >= 110 ? 5 : p >= 100 ? 4 : p >= 85 ? 3 : p >= 70 ? 2 : 1);

    function weighted(items) {
        const rated = items.filter(i => i.rating);
        const w = rated.reduce((n, i) => n + (Number(i.weight) || 0), 0);
        if (!rated.length) return null;
        if (!w) return rated.reduce((n, i) => n + i.rating, 0) / rated.length;
        return rated.reduce((n, i) => n + i.rating * (Number(i.weight) || 0), 0) / w;
    }

    // Final result of an appraisal from the manager's ratings: competencies and goals, weighted by the cycle.
    function result(a, cycle, ratings, goalRatings) {
        cycle = cycle || Store.get('cycles', a.cycleId);
        ratings = ratings || (a.review && a.review.ratings) || {};
        goalRatings = goalRatings || (a.review && a.review.goalRatings) || {};
        const comp = weighted(cycle.competencies.map(c => ({ weight: c.weight, rating: ratings[c.id] })));
        const goals = Store.all('goals').filter(g => g.uid === a.uid && g.cycleId === a.cycleId);
        const goal = weighted(goals.map(g => ({ weight: g.weight, rating: goalRatings[g.id] })));
        const gw = goals.length && goal != null ? (Number(cycle.goalsWeight) || 0) / 100 : 0;
        const final = comp == null ? null : comp * (1 - gw) + (goal || 0) * gw;
        return { comp, goal, final, band: band(final) };
    }

    const isFinal = a => a.stage === 'ack' || a.stage === 'done';

    function overdue(a, cycle, now = Date.now()) {
        cycle = cycle || Store.get('cycles', a.cycleId);
        if (!cycle || cycle.status !== 'active') return null;
        if (a.stage === 'self' && now > cycle.selfDue) return 'Self-assessment overdue';
        if ((a.stage === 'self' || a.stage === 'review') && now > cycle.managerDue) return 'Review overdue';
        return null;
    }

    const activeCycle = () => Store.all('cycles').filter(c => c.status === 'active').sort((a, b) => b.periodStart - a.periodStart)[0];
    const cyclesNewest = () => Store.all('cycles').slice().sort((a, b) => b.periodStart - a.periodStart);

    // ---------- Exam scoring ----------

    function examState(exam, attempt, now = Date.now()) {
        if (attempt && attempt.submittedAt) return 'done';
        if (now > exam.dueAt) return attempt ? 'done' : 'missed';
        if (now < exam.opensAt) return 'upcoming';
        return attempt ? 'progress' : 'open';
    }

    function scoreAttempt(exam, key, attempt) {
        return exam.questions.reduce((n, q, i) => n + (attempt.answers[i] && attempt.answers[i].choice === key.answers[i] ? 1 : 0), 0);
    }

    // Finishes attempts left open past the due time and marks submitted ones, wherever this user may.
    function reconcile() {
        const u = me();
        if (!u || u.missing) return;
        const now = Date.now();
        Store.all('attempts').forEach(a => {
            const exam = Store.get('exams', a.examId);
            if (!exam) return;
            const key = Store.get('examKeys', exam.id);
            const owner = Store.mode === 'demo' || exam.createdBy === u.id || u.role === 'admin';
            if (!a.submittedAt && now > exam.dueAt && (owner || (a.uid === u.id && now < exam.dueAt + 110000))) {
                const answers = a.answers.slice();
                while (answers.length < exam.questions.length) answers.push({ choice: null, ms: 0 });
                Store.put('attempts', { ...a, answers, submittedAt: exam.dueAt }).catch(() => {});
                return;
            }
            if (a.submittedAt && a.score == null && key && owner) {
                Store.put('attempts', { ...a, score: scoreAttempt(exam, key, a), total: exam.questions.length, scoredAt: now }).catch(() => {});
            }
        });
    }

    // ---------- Icons ----------

    const svg = (body, vb = '0 0 24 24', w = 2) => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    const ICON = {
        back: svg('<path d="M10 2L2 10l8 8"/>', '0 0 12 20', 2.5),
        chevron: '<svg class="chevron" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg>',
        check: svg('<path d="M5 12l5 5 9-10"/>', '0 0 24 24', 3),
        cross: svg('<path d="M6 6l12 12M18 6L6 18"/>', '0 0 24 24', 3),
        minus: svg('<path d="M5 12h14"/>', '0 0 24 24', 2.5),
        plus: svg('<path d="M12 5v14M5 12h14"/>', '0 0 24 24', 2.5),
        user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
        lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
        shield: svg('<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
        briefcase: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>'),
        hardhat: svg('<path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M14 6a6 6 0 0 1 6 6v3"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><rect x="2" y="15" width="20" height="4" rx="1"/>'),
        home: svg('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>'),
        star: svg('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
        target: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
        exam: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
        people: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14a6.5 6.5 0 0 1 3.5 6"/>'),
        clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
        alert: svg('<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/>'),
        pen: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>'),
    };

    function ring(size, stroke, fraction, color, inner) {
        const r = (size - stroke) / 2;
        const c = 2 * Math.PI * r;
        const off = c * (1 - Math.max(0, Math.min(1, fraction)));
        return `<div class="ring" style="width:${size}px;height:${size}px">
            <svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>
            <circle class="ring-bar" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/></svg>
            <div class="ring-label">${inner}</div></div>`;
    }

    const avatar = (u, size = 36) => `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px">${esc(initials(u && u.name))}</span>`;
    const pill = (text, tone = 'grey') => `<span class="pill pill-${tone}">${esc(text)}</span>`;

    function stagePill(a) {
        const late = overdue(a);
        if (late) return pill(late, 'red');
        return pill(STAGES[a.stage], a.stage === 'done' ? 'green' : a.stage === 'ack' ? 'blue' : a.stage === 'review' ? 'orange' : 'grey');
    }

    function ratingPill(score) {
        if (score == null) return pill('Not rated');
        const b = band(score);
        return pill(`${score.toFixed(1)} · ${SHORT[b]}`, b >= 4 ? 'green' : b === 3 ? 'blue' : 'red');
    }

    // ---------- Charts ----------

    // Horizontal bars, one series, values labelled at the end of each bar.
    function barList(rows, { max, format = v => v, empty = 'No data yet.' } = {}) {
        if (!rows.length) return `<p class="chart-empty">${empty}</p>`;
        const top = max || Math.max(1, ...rows.map(r => r.value));
        return `<div class="bars" role="table">${rows.map(r => `
            <div class="bar-row" role="row" title="${esc(r.label)}: ${esc(format(r.value))}">
                <span class="bar-label" role="cell">${esc(r.label)}</span>
                <span class="bar-track" role="cell"><span class="bar-fill" style="width:${r.value ? Math.max(2, r.value / top * 100) : 0}%"></span></span>
                <span class="bar-value" role="cell">${esc(format(r.value))}</span>
            </div>`).join('')}</div>`;
    }

    // One stacked bar of ordered stages, with a legend that carries the counts.
    function stageBar(parts) {
        const total = parts.reduce((n, p) => n + p.value, 0);
        if (!total) return '<p class="chart-empty">No reviews in this cycle yet.</p>';
        return `<div class="stack" aria-hidden="true">${parts.filter(p => p.value).map(p =>
            `<span class="stack-seg" style="flex:${p.value};background:${p.color}" title="${esc(p.label)}: ${p.value}"></span>`).join('')}</div>
            <ul class="legend">${parts.map(p => `<li><span class="key" style="background:${p.color}"></span>${esc(p.label)}<b>${p.value}</b></li>`).join('')}</ul>`;
    }

    // ---------- Navigation ----------

    const TABS = {
        employee: [['home', 'Home', 'home'], ['reviews', 'Reviews', 'star'], ['goals', 'Goals', 'target'], ['exams', 'Exams', 'exam']],
        manager: [['home', 'Home', 'home'], ['team', 'Team', 'people'], ['reviews', 'Reviews', 'star'], ['exams', 'Exams', 'exam']],
        admin: [['home', 'Home', 'home'], ['people', 'People', 'people'], ['reviews', 'Reviews', 'star'], ['exams', 'Exams', 'exam']],
    };

    function tabBar() {
        const tabs = TABS[me().role] || TABS.employee;
        return `<nav class="tabbar" aria-label="Sections">${tabs.map(([id, label, icon]) =>
            `<button class="tab ${state.tab === id ? 'on' : ''}" data-action="tab" data-tab="${id}" ${state.tab === id ? 'aria-current="page"' : ''}>${ICON[icon]}<span>${label}</span></button>`).join('')}</nav>`;
    }

    function go(view, params = {}, opts = {}) {
        Object.assign(state, { view, params, errors: [], ui: opts.keepUi ? state.ui : {} });
        if (opts.tab) state.tab = opts.tab;
        render();
        if (!opts.keepScroll) window.scrollTo(0, 0);
    }

    function home() {
        const u = me();
        if (!u) return go('login', {}, { tab: 'home' });
        if (u.missing) return go('setup', {}, { tab: 'home' });
        go('home', {}, { tab: 'home' });
    }

    const nav = (backLabel, backAction, extra = '') =>
        `<div class="nav">${backLabel ? `<button class="nav-btn" ${backAction}>${ICON.back} ${esc(backLabel)}</button>` : ''}${extra}</div>`;

    function toast(text) {
        document.querySelectorAll('.toast').forEach(t => t.remove());
        const el = document.createElement('div');
        el.className = 'toast';
        el.setAttribute('role', 'status');
        el.textContent = text;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2800);
    }

    // Save and report failures in plain words (for example, a rule refusing the write).
    function save(c, doc, done) {
        return Store.put(c, doc).then(() => { if (done) toast(done); }).catch(err => {
            toast(/permission/i.test(err.message) ? 'You don\'t have permission to make that change.' : 'Couldn\'t save. Check your connection and try again.');
            console.warn(err);
        });
    }

    // ---------- Render ----------

    const app = () => document.getElementById('app');

    function render() {
        renderQueued = false;
        const u = me();
        if (!u && state.view !== 'login') state.view = 'login';
        if (u && u.missing) state.view = 'setup';
        if (u && !u.missing && (state.view === 'login' || state.view === 'setup')) { state.view = 'home'; state.tab = 'home'; }
        const fn = views[state.view] || views.home;
        const html = fn(state.params);
        if (html == null) return; // the view redirected
        const withTabs = u && !u.missing && !state.params.fullscreen;
        const focusId = document.activeElement && document.activeElement.id;
        const caret = focusId && document.activeElement.selectionStart;
        app().innerHTML = withTabs ? `<main class="has-tabs">${html}</main>${tabBar()}` : html;
        document.body.classList.toggle('logged-in', !!withTabs);
        if (focusId) {
            const el = document.getElementById(focusId);
            if (el) { el.focus(); try { if (caret != null) el.setSelectionRange(caret, caret); } catch (e) { /* not a text field */ } }
        }
        afterRender.forEach(fn => fn(state.view));
    }

    // Data changes from other devices re-render, unless the user is typing in a form.
    function onData() {
        reconcile();
        const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
        if (state.ui.dirty && typing) return;
        if (!renderQueued) { renderQueued = true; requestAnimationFrame(render); }
    }

    return {
        state, views, actions, afterRender, render, onData, go, home, nav, toast, save,
        esc, pad, pct, DAY, fmtDate, fmtDay, fmtLeft, fmtSecs, fmtScore, toInput, toDateInput, fromInput, fromDateInput,
        me, user, nameOf, dept, isAdmin, isManager, team, ROLE,
        RATINGS, SHORT, band, STAGES, achievement, suggestRating, result, isFinal, overdue, activeCycle, cyclesNewest,
        examState, scoreAttempt, reconcile,
        ICON, ring, avatar, pill, stagePill, ratingPill, barList, stageBar,
    };
})();
