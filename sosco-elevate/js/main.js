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

    function bind(t) {
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
