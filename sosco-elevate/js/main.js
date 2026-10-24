// Event wiring and start-up for SOSCO ELEVATE.
(() => {
    'use strict';
    const A = App;
    const app = document.getElementById('app');

    app.addEventListener('submit', async ev => {
        if (ev.target.id !== 'loginForm') return;
        ev.preventDefault();
        const btn = document.getElementById('signin-btn');
        const box = document.getElementById('loginError');
        btn.disabled = true;
        btn.textContent = 'Signing in…';
        const err = await Store.signIn(document.getElementById('username').value, document.getElementById('password').value);
        if (err) {
            box.textContent = err;
            box.hidden = false;
            btn.disabled = false;
            btn.textContent = 'Sign In';
            return;
        }
        A.home();
    });

    // Claude chat: send on submit, or Enter without Shift
    app.addEventListener('submit', ev => {
        if (ev.target.id !== 'aiForm') return;
        ev.preventDefault();
        A.sendChat();
    });
    app.addEventListener('keydown', ev => {
        if (ev.target.id === 'ai-input' && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
            ev.preventDefault();
            A.sendChat();
        }
    });

    // Password change form
    app.addEventListener('submit', async ev => {
        if (ev.target.id !== 'pwForm') return;
        ev.preventDefault();
        const u = A.me();
        const f = A.state.ui.pw;
        const errors = !f.current ? ['Enter your ' + (u.mustChangePassword ? 'temporary' : 'current') + ' password.'] : [];
        errors.push(...A.passwordProblems(f.next, { current: f.current, name: u.name }));
        if (f.next !== f.confirm) errors.push('The new passwords don\'t match.');
        A.state.errors = errors;
        if (errors.length) { A.render(); return; }
        A.state.ui.busy = true;
        A.render();
        const err = await Store.changePassword(f.current, f.next);
        A.state.ui.busy = false;
        if (err) { A.state.errors = [err]; A.render(); return; }
        A.toast('Password changed');
        A.home();
    });

    function bind(t) {
        if (A.bindAssistant && A.bindAssistant(t)) return;
        if (t.dataset.pw) { A.state.ui.pw[t.dataset.pw] = t.value; A.state.errors = []; A.render(); return; }
        if (t.dataset.dash) { A.state.ui[t.dataset.dash] = t.value; A.render(); return; }
        if (t.dataset.actionChange) { A.actions[t.dataset.actionChange](t); return; }
        if (A.bindDraft && A.state.view === 'exam-edit' && A.bindDraft(t)) return;
        if (A.bindReview && A.bindReview(t)) return;
        if (A.bindGoal && A.bindGoal(t)) return;
        if (A.bindPeople) A.bindPeople(t);
    }

    app.addEventListener('input', ev => { if (ev.target.tagName !== 'SELECT' && ev.target.type !== 'checkbox') bind(ev.target); });
    app.addEventListener('change', ev => { if (ev.target.tagName === 'SELECT' || ev.target.type === 'checkbox' || ev.target.type === 'date' || ev.target.type === 'datetime-local') bind(ev.target); });

    document.addEventListener('click', ev => {
        const el = ev.target.closest('[data-action]');
        if (!el || !document.body.contains(el)) return;
        const act = el.dataset.action;
        if (act === 'tab') { A.go(el.dataset.tab, {}, { tab: el.dataset.tab }); return; }
        if (act === 'go') { A.go(el.dataset.view, { id: el.dataset.id }); return; }
        if (A.actions[act]) {
            ev.preventDefault();
            A.actions[act](el);
        }
    });

    async function start() {
        document.getElementById('app').innerHTML = '<div class="boot">Loading…</div>';
        try {
            await Store.init();
        } catch (e) {
            document.getElementById('app').innerHTML = `<div class="screen-login"><div class="login-card"><div class="welcome">Can't connect</div>
                <p class="body-text">The app couldn't reach Firebase. Check your internet connection and reload.</p><p class="code-box">${A.esc(e.message)}</p></div></div>`;
            return;
        }
        Store.onChange(A.onData);
        A.reconcile();
        A.home();
        // Re-check exam deadlines and overdue reviews every minute.
        setInterval(() => { if (A.state.view !== 'exam-run') A.onData(); }, 60000);
    }

    start();
})();
