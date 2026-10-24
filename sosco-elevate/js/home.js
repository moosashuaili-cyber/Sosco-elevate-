// Sign-in, first-run setup, the employee home and the manager/admin dashboard.
(() => {
    'use strict';
    const A = App;
    const { esc, ICON, fmtDay, fmtLeft } = A;

    // ---------- Sign in ----------

    A.views.login = () => {
        const demo = Store.mode === 'demo';
        const row = (key, name, sub, tile, icon) => `
            <button type="button" class="row" data-action="demo-fill" data-user="${key}">
                <span class="icon-tile ${tile}">${ICON[icon]}</span>
                <span class="grow"><span class="title">${name}</span><span class="sub">${sub}</span></span>${ICON.chevron}</button>`;
        const mode = A.state.ui.loginMode || 'whatsapp';
        const otp = A.state.ui.otp;
        let card;
        if (mode === 'whatsapp' && otp && otp.sent) {
            card = `<form id="otpCodeForm" novalidate>
                    <div class="otp-sent">${ICON.whatsapp}<span>Enter the 6-digit code we sent on WhatsApp to <b dir="ltr">${esc(A.fmtPhone(otp.phone))}</b>.
                        <span class="muted">If you don't get it, check that this is the number your admin registered.</span></span></div>
                    <input id="otp-code" class="otp-input" data-otp-code inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" placeholder="••••••" aria-label="6-digit code" value="${esc(otp.code || '')}">
                    <p id="loginError" class="form-error" role="alert" ${otp.error ? '' : 'hidden'}>${esc(otp.error || '')}</p>
                    <button type="submit" class="btn btn-primary" id="otp-verify" ${otp.busy ? 'disabled' : ''}>${otp.busy ? 'Checking…' : 'Sign In'}</button>
                    <div class="otp-links">
                        <button type="button" class="link" data-action="otp-back">Change number</button>
                        <button type="button" class="link" data-action="otp-resend" id="otp-resend" ${otp.wait > 0 ? 'disabled' : ''}>${otp.wait > 0 ? `Resend in ${otp.wait}s` : 'Resend code'}</button>
                    </div>
                </form>`;
        } else if (mode === 'whatsapp') {
            card = `<form id="otpPhoneForm" novalidate>
                    <div class="form-group">
                        <label for="otp-phone">WhatsApp number</label>
                        <div class="input-wrap phone-wrap">${ICON.phone}<input id="otp-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="9123 4567" value="${esc((otp && otp.input) || '')}"></div>
                        <p class="hint-text">Omani numbers can be typed without +968.</p>
                    </div>
                    <p id="loginError" class="form-error" role="alert" ${otp && otp.error ? '' : 'hidden'}>${esc((otp && otp.error) || '')}</p>
                    <button type="submit" class="btn btn-whatsapp" id="otp-send" ${otp && otp.busy ? 'disabled' : ''}>${ICON.whatsapp} ${otp && otp.busy ? 'Sending…' : 'Send Code on WhatsApp'}</button>
                </form>`;
        } else {
            card = `<form id="loginForm" novalidate>
                    <div class="form-group">
                        <label for="username">${demo ? 'Username or email' : 'Email'}</label>
                        <div class="input-wrap">${ICON.user}<input id="username" type="${demo ? 'text' : 'email'}" placeholder="${demo ? 'manager' : 'name@company.com'}" autocomplete="username" autocapitalize="none"></div>
                    </div>
                    <div class="form-group">
                        <label for="password">Password</label>
                        <div class="input-wrap">${ICON.lock}<input id="password" type="password" placeholder="Enter your password" autocomplete="current-password"></div>
                    </div>
                    <p id="loginError" class="form-error" role="alert" hidden></p>
                    <button type="submit" class="btn btn-primary" id="signin-btn">Sign In</button>
                    ${demo ? '' : '<button type="button" class="link forgot" data-action="forgot">Forgot password?</button>'}
                </form>`;
        }
        const demoCode = mode === 'whatsapp' && otp && otp.sent && otp.demoCode;
        return `<div class="screen-login">
            ${demoCode ? `<div class="wa-banner" role="status">${ICON.whatsapp}<div><b>WhatsApp · SOSCO ELEVATE</b><span>${esc(otp.demoCode)} is your SOSCO ELEVATE sign-in code. Don't share it.</span>
                <small>Demo mode: in the live app this arrives on the person's WhatsApp.</small></div></div>` : ''}
            <div class="header">
                <img class="app-icon" src="icons/icon.svg" alt="SOSCO ELEVATE">
                <h1>SOSCO <span>Elevate</span></h1>
                <div class="subtitle">Middle East Brigade &middot; MEB</div>
            </div>
            <div class="login-card">
                <div class="welcome">Welcome back</div>
                <div class="welcome-sub">Sign in to reviews, goals and exams</div>
                <div class="seg login-seg" role="tablist" aria-label="Sign-in method">
                    <button type="button" role="tab" class="${mode === 'whatsapp' ? 'on' : ''}" aria-selected="${mode === 'whatsapp'}" data-action="login-mode" data-mode="whatsapp">WhatsApp</button>
                    <button type="button" role="tab" class="${mode === 'password' ? 'on' : ''}" aria-selected="${mode === 'password'}" data-action="login-mode" data-mode="password">${demo ? 'Password' : 'Email'}</button>
                </div>
                ${card}
            </div>
            ${demo ? `<div class="section-label">Demo accounts</div>
            <div class="group">
                ${row('admin', 'Admin', 'HR · runs review cycles, manages people', 'tile-admin', 'shield')}
                ${row('manager', 'Manager', 'Salim Al-Rawahi · WHM supervisor', 'tile-manager', 'briefcase')}
                ${row('employee', 'Employee', 'Ahmed Al-Balushi · Wellhead technician', 'tile-employee', 'hardhat')}
            </div>
            <p class="section-foot">Demo mode: data stays in this browser. Tap an account to fill in its ${mode === 'whatsapp' ? 'WhatsApp number' : 'details'}. ${mode === 'whatsapp' ? 'The code appears at the top of the screen.' : 'Also try manager2 (manager123) and employee2–employee6 (employee123).'}</p>` : ''}
        </div>`;
    };

    // ---------- Password change (forced after a temporary password, or from the profile) ----------

    A.views.password = () => {
        const u = A.me();
        const forced = !!u.mustChangePassword;
        const f = A.state.ui.pw || (A.state.ui.pw = { current: '', next: '', confirm: '' });
        const rules = [
            ['At least 8 characters', f.next.length >= 8],
            ['Letters and numbers', /[A-Za-z]/.test(f.next) && /[0-9]/.test(f.next)],
            ['Both new passwords match', f.next.length > 0 && f.next === f.confirm],
        ];
        const field = (id, key, label, auto) => `<div class="form-group">
            <label for="${id}">${label}</label>
            <div class="input-wrap">${ICON.lock}<input id="${id}" type="password" data-pw="${key}" value="${esc(f[key])}" autocomplete="${auto}"></div></div>`;
        const form = `
            <form id="pwForm" novalidate>
                ${field('pw-current', 'current', forced ? 'Temporary password' : 'Current password', 'current-password')}
                ${field('pw-next', 'next', 'New password', 'new-password')}
                ${field('pw-confirm', 'confirm', 'Confirm new password', 'new-password')}
                <ul class="pw-rules" aria-label="Password rules">${rules.map(([t, ok]) => `<li class="${ok ? 'ok' : ''}">${ok ? ICON.check : '<span class="dot"></span>'}${t}</li>`).join('')}</ul>
                ${A.state.errors.length ? `<p class="form-error" role="alert">${A.state.errors.map(esc).join('<br>')}</p>` : ''}
                <button type="submit" class="btn btn-primary" id="pw-save" ${A.state.ui.busy ? 'disabled' : ''}>${A.state.ui.busy ? 'Saving…' : 'Save New Password'}</button>
            </form>`;

        if (forced) {
            return `<div class="screen-login">
                <div class="header"><span class="icon-tile tile-lock big">${ICON.lock}</span><h1>Set a new password</h1>
                <div class="subtitle">Welcome, ${esc(u.name.split(' ')[0])}. For your security, replace the temporary password you were given before you continue.</div></div>
                <div class="login-card">${form}</div>
                <button class="link forgot" data-action="logout">Sign out</button>
            </div>`;
        }
        return `<div class="screen">${A.nav('Profile', `data-action="go" data-view="profile" data-id="${u.id}"`)}
            <h1 class="large-title">Change Password</h1>
            <div class="login-card">${form}</div></div>`;
    };

    A.views.setup = () => {
        const u = A.me();
        return `<div class="screen-login">
            <div class="header"><img class="app-icon" src="icons/icon.svg" alt=""><h1>Almost there</h1></div>
            <div class="login-card">
                <p class="body-text">You're signed in as <b>${esc(u.email)}</b>, but your account hasn't been set up in SOSCO ELEVATE yet, or it has been switched off.</p>
                <p class="body-text">Ask your admin to add you. If you are setting up the app, follow “Create the first admin” in SETUP.md using this user ID:</p>
                <p class="code-box" id="uid-box">${esc(u.id)}</p>
                <button class="btn btn-plain" data-action="logout">Sign Out</button>
            </div>
        </div>`;
    };

    // ---------- Tasks ----------

    function myTasks() {
        const u = A.me();
        const now = Date.now();
        const tasks = [];
        Store.all('appraisals').filter(a => a.uid === u.id).forEach(a => {
            const c = Store.get('cycles', a.cycleId);
            if (!c || c.status !== 'active') return;
            if (a.stage === 'self') tasks.push({ icon: 'star', title: 'Complete your self-assessment', sub: `${c.name} · due ${fmtDay(c.selfDue)}`, late: now > c.selfDue, attr: `data-action="go" data-view="appraisal" data-id="${a.id}"` });
            if (a.stage === 'ack') tasks.push({ icon: 'star', title: 'Read your review and sign off', sub: `${c.name} · from ${A.nameOf(a.managerId)}`, attr: `data-action="go" data-view="appraisal" data-id="${a.id}"` });
        });
        Store.all('exams').filter(e => e.status === 'sent' && e.assignedTo.includes(u.id)).forEach(e => {
            const st = A.examState(e, Store.get('attempts', `${e.id}_${u.id}`), now);
            if (st === 'open' || st === 'progress') tasks.push({ icon: 'exam', title: `${st === 'progress' ? 'Finish' : 'Take'} ${e.title}`, sub: `Exam · due in ${fmtLeft(e.dueAt - now)}`, late: e.dueAt - now < A.DAY, attr: `data-action="go" data-view="exam-intro" data-id="${e.id}"` });
        });
        const c = A.activeCycle();
        if (c) {
            const stale = Store.all('goals').filter(g => g.uid === u.id && g.cycleId === c.id && (!(g.updates || []).length || now - g.updates.at(-1).at > 30 * A.DAY));
            if (stale.length) tasks.push({ icon: 'target', title: `Update progress on ${stale.length} ${stale.length === 1 ? 'goal' : 'goals'}`, sub: 'Not updated in the last 30 days', attr: 'data-action="tab" data-tab="goals"' });
        }
        if (A.isManager()) {
            const team = Store.all('appraisals').filter(a => a.managerId === u.id && a.uid !== u.id && Store.get('cycles', a.cycleId)?.status === 'active');
            const toReview = team.filter(a => a.stage === 'review');
            if (toReview.length) {
                const due = Store.get('cycles', toReview[0].cycleId).managerDue;
                tasks.push({ icon: 'people', title: `Review ${toReview.length} ${toReview.length === 1 ? 'person' : 'people'}`, sub: `Self-assessments are in · due ${fmtDay(due)}`, late: now > due, attr: 'data-action="tab" data-tab="reviews"' });
            }
            const lateSelf = team.filter(a => a.stage === 'self' && now > Store.get('cycles', a.cycleId).selfDue);
            if (lateSelf.length) tasks.push({ icon: 'clock', title: `${lateSelf.length} self-${lateSelf.length === 1 ? 'assessment is' : 'assessments are'} late`, sub: lateSelf.map(a => A.nameOf(a.uid).split(' ')[0]).join(', '), late: true, attr: 'data-action="tab" data-tab="reviews"' });
        }
        return tasks;
    }

    const taskList = tasks => (tasks.length
        ? `<div class="group">${tasks.map(t => `<button class="row" ${t.attr}><span class="task-icon ${t.late ? 'late' : ''}">${ICON[t.icon]}</span>
            <span class="grow"><span class="title">${esc(t.title)}</span><span class="sub">${t.late ? '<span class="late-text">Overdue or due soon</span> · ' : ''}${esc(t.sub)}</span></span>${ICON.chevron}</button>`).join('')}</div>`
        : '<div class="group"><div class="row empty">You\'re all caught up.</div></div>');

    function greeting() {
        const h = new Date().getHours();
        return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    }

    function header() {
        const u = A.me();
        return `<div class="nav"><span class="who">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <button class="nav-btn" data-action="logout">Sign Out</button></div>
            <div class="home-head"><h1 class="large-title">${greeting()}, ${esc(u.name.split(' ')[0])}</h1>
            <button class="avatar-btn" data-action="go" data-view="profile" data-id="${u.id}" aria-label="Your profile">${A.avatar(u, 40)}</button></div>`;
    }

    const demoFoot = () => (Store.mode === 'demo'
        ? '<p class="section-foot center">Demo mode · data is saved in this browser only. <button class="link inline" data-action="demo-reset">Reset demo data</button></p>' : '');

    // ---------- Employee home ----------

    function employeeHome() {
        const u = A.me();
        const last = Store.all('appraisals').filter(a => a.uid === u.id && A.isFinal(a) && Store.get('cycles', a.cycleId))
            .sort((a, b) => Store.get('cycles', b.cycleId).periodStart - Store.get('cycles', a.cycleId).periodStart)[0];
        const c = A.activeCycle();
        const goals = c ? Store.all('goals').filter(g => g.uid === u.id && g.cycleId === c.id) : [];
        const results = Store.all('attempts').filter(x => x.uid === u.id && x.submittedAt && x.score != null && Store.get('exams', x.examId))
            .sort((x, y) => y.submittedAt - x.submittedAt).slice(0, 3);
        const r = last && A.result(last);
        return `<div class="screen">${header()}
            <div class="section-label">To do</div>
            ${taskList(myTasks())}
            ${r ? `<div class="section-label">Latest review</div>
            <button class="card result-mini" data-action="go" data-view="appraisal" data-id="${last.id}">
                ${A.ring(76, 8, (r.final || 0) / 5, A.band(r.final) >= 4 ? 'var(--green)' : A.band(r.final) === 3 ? 'var(--blue)' : 'var(--red)', `<b>${A.fmtScore(r.final)}</b>`)}
                <span class="grow"><span class="title">${esc(A.RATINGS[r.band])}</span><span class="sub">${esc(Store.get('cycles', last.cycleId).name)} · ${esc(A.STAGES[last.stage])}</span></span>${ICON.chevron}</button>` : ''}
            ${goals.length ? `<div class="section-label">Your goals · ${esc(c.name)}</div><div class="group">${goals.map(g => A.goalRow(g)).join('')}</div>` : ''}
            ${results.length ? `<div class="section-label">Recent exam results</div><div class="group">${results.map(x => {
                const e = Store.get('exams', x.examId);
                const pc = A.pct(x.score, x.total);
                return `<button class="row" data-action="go" data-view="exam-score" data-id="${e.id}"><span class="grow"><span class="title">${esc(e.title)}</span><span class="sub">${fmtDay(x.submittedAt)}</span></span>
                    ${A.pill(`${pc}%`, pc >= e.passMark ? 'green' : 'red')}${ICON.chevron}</button>`;
            }).join('')}</div>` : ''}
            ${demoFoot()}
        </div>`;
    }

    // ---------- Manager / admin dashboard ----------

    function dashboard() {
        const u = A.me();
        const admin = u.role === 'admin';
        const ui = A.state.ui;
        const cycles = A.cyclesNewest().filter(c => c.status !== 'draft');
        const cycle = Store.get('cycles', ui.dashCycle) || A.activeCycle() || cycles[0];
        const deptId = admin ? ui.dashDept || '' : '';
        const inScope = a => (admin ? a.uid !== u.id : a.managerId === u.id) && (!deptId || a.deptId === deptId);
        const list = cycle ? Store.all('appraisals').filter(a => a.cycleId === cycle.id && inScope(a)) : [];
        const people = new Set(list.map(a => a.uid));
        const final = list.filter(A.isFinal).map(a => ({ a, r: A.result(a) })).filter(x => x.r.final != null);
        const avg = final.length ? final.reduce((n, x) => n + x.r.final, 0) / final.length : null;
        const count = s => list.filter(a => a.stage === s).length;
        const late = list.filter(a => A.overdue(a));

        const goals = cycle ? Store.all('goals').filter(g => g.cycleId === cycle.id && people.has(g.uid)) : [];
        const met = goals.filter(g => A.achievement(g) >= 100).length;

        const since = Date.now() - 180 * A.DAY;
        const scopeUsers = new Set(admin ? Store.all('users').filter(p => !deptId || p.deptId === deptId).map(p => p.id) : A.team().map(p => p.id));
        const attempts = Store.all('attempts').filter(x => scopeUsers.has(x.uid) && x.submittedAt > since && x.score != null && Store.get('exams', x.examId));
        const passed = attempts.filter(x => A.pct(x.score, x.total) >= Store.get('exams', x.examId).passMark).length;
        const failed = attempts.filter(x => A.pct(x.score, x.total) < Store.get('exams', x.examId).passMark).sort((x, y) => y.submittedAt - x.submittedAt).slice(0, 5);

        const dist = [5, 4, 3, 2, 1].map(b => ({ label: A.RATINGS[b], value: final.filter(x => x.r.band === b).length }));
        const top = final.slice().sort((x, y) => y.r.final - x.r.final).slice(0, 5);
        const deptAvg = admin && !deptId ? Store.all('departments').map(d => {
            const xs = final.filter(x => x.a.deptId === d.id);
            return { label: d.name, value: xs.length ? Number((xs.reduce((n, x) => n + x.r.final, 0) / xs.length).toFixed(2)) : 0, n: xs.length };
        }).filter(d => d.n) : [];

        const filters = `<div class="filters">
            ${cycles.length ? `<select class="select" id="dash-cycle" data-dash="dashCycle" aria-label="Review cycle">${cycles.map(c => `<option value="${c.id}" ${cycle && c.id === cycle.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : ''}
            ${admin ? `<select class="select" id="dash-dept" data-dash="dashDept" aria-label="Department"><option value="">All departments</option>
                ${Store.all('departments').map(d => `<option value="${d.id}" ${d.id === deptId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>` : ''}
        </div>`;

        return `<div class="screen">${header()}
            <div class="section-label">Needs your attention</div>
            ${taskList(myTasks())}

            <div class="section-label section-label-split"><span>${admin ? 'Company overview' : 'Your team'}</span></div>
            ${filters}
            <div class="stats four">
                <div class="stat"><b>${list.length ? A.pct(count('ack') + count('done'), list.length) : 0}%</b><span>Reviews done · ${count('ack') + count('done')}/${list.length}</span></div>
                <div class="stat"><b>${avg == null ? '–' : avg.toFixed(2)}</b><span>Average score</span></div>
                <div class="stat"><b>${goals.length ? A.pct(met, goals.length) : 0}%</b><span>Goals met · ${met}/${goals.length}</span></div>
                <div class="stat"><b>${attempts.length ? A.pct(passed, attempts.length) + '%' : '–'}</b><span>Exam pass rate · 6 mo</span></div>
            </div>

            <div class="section-label">Review progress${late.length ? ` · <span class="late-text">${late.length} overdue</span>` : ''}</div>
            <div class="card">${A.stageBar([
                { label: 'Self-assessment', value: count('self'), color: 'var(--seq-1)' },
                { label: 'Manager review', value: count('review'), color: 'var(--seq-2)' },
                { label: 'Sign-off', value: count('ack'), color: 'var(--seq-3)' },
                { label: 'Complete', value: count('done'), color: 'var(--seq-4)' },
            ])}</div>

            <div class="section-label">Rating distribution · ${final.length} rated</div>
            <div class="card">${A.barList(final.length ? dist : [], { empty: 'Ratings appear once managers send their reviews.' })}</div>

            ${deptAvg.length ? `<div class="section-label">Average score by department</div>
            <div class="card">${A.barList(deptAvg, { max: 5, format: v => v.toFixed(2) })}</div>` : ''}

            ${top.length ? `<div class="section-label">Top performers</div>
            <div class="group">${top.map(x => {
                const p = A.user(x.a.uid) || { name: 'Removed user' };
                return `<button class="row" data-action="go" data-view="profile" data-id="${x.a.uid}">${A.avatar(p, 32)}<span class="grow"><span class="title">${esc(p.name)}</span>
                    <span class="sub">${esc(p.jobTitle || '')}</span></span>${A.ratingPill(x.r.final)}${ICON.chevron}</button>`;
            }).join('')}</div>` : ''}

            ${late.length ? `<div class="section-label">Overdue reviews</div>
            <div class="group">${late.map(a => `<button class="row" data-action="go" data-view="appraisal" data-id="${a.id}">${A.avatar(A.user(a.uid), 32)}
                <span class="grow"><span class="title">${esc(A.nameOf(a.uid))}</span><span class="sub">Manager: ${esc(A.nameOf(a.managerId))}</span></span>${A.stagePill(a)}${ICON.chevron}</button>`).join('')}</div>` : ''}

            ${failed.length ? `<div class="section-label">Recent failed exams</div>
            <div class="group">${failed.map(x => {
                const e = Store.get('exams', x.examId);
                return `<button class="row" data-action="go" data-view="profile" data-id="${x.uid}">${A.avatar(A.user(x.uid), 32)}<span class="grow"><span class="title">${esc(A.nameOf(x.uid))}</span>
                    <span class="sub">${esc(e.title)} · ${fmtDay(x.submittedAt)}</span></span>${A.pill(`${A.pct(x.score, x.total)}%`, 'red')}${ICON.chevron}</button>`;
            }).join('')}</div>` : ''}
            ${demoFoot()}
        </div>`;
    }

    A.views.home = () => (A.isManager() ? dashboard() : employeeHome());

    Object.assign(A.actions, {
        'demo-fill': el => {
            if ((A.state.ui.loginMode || 'whatsapp') === 'whatsapp') {
                const u = Store.get('users', el.dataset.user);
                A.state.ui.otp = { input: A.fmtPhone(u && u.phone).replace('+968 ', '') };
                A.render();
                return;
            }
            document.getElementById('username').value = el.dataset.user;
            document.getElementById('password').value = `${el.dataset.user}123`;
            document.getElementById('loginError').hidden = true;
        },
        'demo-reset': () => { if (A.state.ui.confirmReset) Store.resetDemo(); else { A.state.ui.confirmReset = true; A.toast('Tap Reset demo data again to restore the sample data.'); } },
        forgot: async () => {
            const email = document.getElementById('username').value.trim();
            const box = document.getElementById('loginError');
            if (!email) { box.textContent = 'Type your email above first, then tap Forgot password.'; box.hidden = false; return; }
            const err = await Store.resetPassword(email);
            box.textContent = err || `If ${email} has an account, a reset link is on its way.`;
            box.hidden = false;
        },
        'password-change': () => { A.state.ui = {}; A.go('password'); },
        'login-mode': el => { A.state.ui.loginMode = el.dataset.mode; A.render(); },
        'otp-back': () => { const o = A.state.ui.otp || {}; A.state.ui.otp = { input: o.input }; A.render(); },
        'otp-resend': () => A.requestCode(),
        logout: async () => { await Store.signOut(); A.go('login', {}, { tab: 'home' }); },
    });
})();
