// People: manager's team, employee profiles, and admin user/department management.
(() => {
    'use strict';
    const A = App;
    const { esc, ICON, fmtDay, fmtDate } = A;

    function currentAppraisal(uid) {
        const c = A.activeCycle();
        return c ? Store.get('appraisals', `${c.id}_${uid}`) : null;
    }

    function lastFinal(uid) {
        const done = Store.all('appraisals').filter(a => a.uid === uid && A.isFinal(a) && Store.get('cycles', a.cycleId))
            .sort((a, b) => Store.get('cycles', b.cycleId).periodStart - Store.get('cycles', a.cycleId).periodStart);
        return done[0] ? A.result(done[0]).final : null;
    }

    function personRow(p) {
        const a = currentAppraisal(p.id);
        const right = a ? (A.isFinal(a) ? A.ratingPill(A.result(a).final) : A.stagePill(a)) : A.ratingPill(lastFinal(p.id));
        return `<button class="row" data-action="go" data-view="profile" data-id="${p.id}">${A.avatar(p, 36)}
            <span class="grow"><span class="title">${esc(p.name)}${p.active === false ? ' <span class="muted">(inactive)</span>' : ''}</span>
            <span class="sub">${esc(p.jobTitle || A.ROLE[p.role])}${p.staffNo ? ` · ${esc(p.staffNo)}` : ''}</span></span>${right}${ICON.chevron}</button>`;
    }

    A.views.team = () => {
        const team = A.team();
        return `<div class="screen">${A.nav()}
            <h1 class="large-title">Team</h1>
            <div class="group">${team.map(personRow).join('') || '<div class="row empty">No one reports to you yet. An admin sets each person\'s manager.</div>'}</div>
            ${team.length ? '<p class="section-foot">Tap a person to see their review, goals and exam results, or to set goals.</p>' : ''}
        </div>`;
    };

    // ---------- Profile ----------

    A.views.profile = ({ id }) => {
        const p = A.user(id);
        if (!p) { A.home(); return null; }
        const u = A.me();
        const canManage = u.role === 'admin' || p.managerId === u.id;
        const cycle = A.activeCycle();
        const a = currentAppraisal(p.id);
        const goals = cycle ? Store.all('goals').filter(g => g.uid === p.id && g.cycleId === cycle.id) : [];
        const history = Store.all('appraisals').filter(x => x.uid === p.id && A.isFinal(x) && Store.get('cycles', x.cycleId))
            .sort((x, y) => Store.get('cycles', x.cycleId).periodStart - Store.get('cycles', y.cycleId).periodStart);
        const attempts = Store.all('attempts').filter(x => x.uid === p.id && x.submittedAt && Store.get('exams', x.examId))
            .sort((x, y) => y.submittedAt - x.submittedAt);
        const dept = A.dept(p.deptId);
        const TAB_LABEL = { people: 'People', team: 'Team', reviews: 'Reviews', exams: 'Exams', goals: 'Goals', home: 'Home' };
        const back = A.nav(TAB_LABEL[A.state.tab] || 'Home', `data-action="tab" data-tab="${A.state.tab}"`);

        return `<div class="screen">${back}
            <div class="person-head">${A.avatar(p, 60)}<div class="grow"><h1 class="title-2">${esc(p.name)}</h1>
                <div class="sub">${esc(p.jobTitle || A.ROLE[p.role])}${dept ? ` · ${esc(dept.name)}` : ''}</div>
                <div class="sub">${p.staffNo ? `${esc(p.staffNo)} · ` : ''}Reports to ${esc(p.managerId ? A.nameOf(p.managerId) : 'no one')}</div></div></div>

            ${cycle ? `<div class="section-label">${esc(cycle.name)}</div>
            <div class="group">${a ? `<button class="row" data-action="go" data-view="appraisal" data-id="${a.id}">${ICON.star}<span class="grow"><span class="title">Review</span>
                <span class="sub">${esc(A.STAGES[a.stage])}${A.isFinal(a) ? ` · ${A.fmtScore(A.result(a).final)}` : ''}</span></span>${A.stagePill(a)}${ICON.chevron}</button>`
                : '<div class="row empty">Not part of this cycle. An admin can add them from the cycle page.</div>'}</div>` : ''}

            <div class="section-label section-label-split"><span>Goals${cycle ? ` · ${esc(cycle.name)}` : ''}</span>${canManage && cycle ? `<button class="link" data-action="goal-new" data-uid="${p.id}">Add Goal</button>` : ''}</div>
            <div class="group">${goals.map(g => A.goalRow(g)).join('') || `<div class="row empty">No goals set${canManage ? '. Tap Add Goal to set one.' : '.'}</div>`}</div>

            <div class="section-label">Rating history</div>
            <div class="card">${A.barList(history.map(x => ({ label: Store.get('cycles', x.cycleId).name, value: Number((A.result(x).final || 0).toFixed(2)) })),
                { max: 5, format: v => `${v.toFixed(2)} · ${A.SHORT[A.band(v)]}`, empty: 'No finished reviews yet.' })}</div>

            <div class="section-label">Exam results</div>
            <div class="group">${attempts.map(x => {
                const e = Store.get('exams', x.examId);
                const pc = x.score == null ? null : A.pct(x.score, x.total);
                return `<div class="row"><span class="grow"><span class="title">${esc(e.title)}</span><span class="sub">${fmtDate(x.submittedAt)}</span></span>
                    ${pc == null ? A.pill('Marking') : A.pill(`${x.score}/${x.total} · ${pc}%`, pc >= e.passMark ? 'green' : 'red')}</div>`;
            }).join('') || '<div class="row empty">No exams taken yet.</div>'}</div>

            ${p.id === u.id || u.role === 'admin' ? `<div class="actions">
                ${p.id === u.id ? `<button class="btn btn-plain" data-action="password-change">Change Password</button>` : ''}
                ${u.role === 'admin' ? `<button class="btn btn-plain" data-action="user-edit" data-id="${p.id}">Edit Person</button>` : ''}
            </div>` : ''}
        </div>`;
    };

    // ---------- Admin: people and departments ----------

    const canManage = p => p.active !== false && (p.role === 'manager' || p.role === 'admin');
    const noManager = () => Store.all('users').filter(p => p.active !== false && p.role !== 'admin' && !p.managerId);
    const reportsOf = id => Store.all('users').filter(p => p.managerId === id && p.active !== false);

    // True when making managerId the manager of uid would put uid above itself.
    function wouldLoop(uid, managerId) {
        const seen = new Set();
        for (let id = managerId; id; id = (A.user(id) || {}).managerId) {
            if (id === uid) return true;
            if (seen.has(id)) return false;
            seen.add(id);
        }
        return false;
    }

    // Changes someone's manager. Reviews and goals still open in an unclosed cycle move to the new manager.
    function assignManager(uid, managerId) {
        const p = A.user(uid);
        const next = managerId || null;
        if (next && wouldLoop(uid, next)) return `${A.nameOf(next)} reports to ${p.name}, so they can't also be ${p.name.split(' ')[0]}'s manager.`;
        if ((p.managerId || null) === next) return null;
        A.save('users', { ...p, managerId: next });
        const open = id => { const c = Store.get('cycles', id); return c && c.status !== 'closed'; };
        Store.all('appraisals').filter(a => a.uid === uid && !A.isFinal(a) && open(a.cycleId))
            .forEach(a => A.save('appraisals', { ...a, managerId: next }));
        Store.all('goals').filter(g => g.uid === uid && open(g.cycleId))
            .forEach(g => A.save('goals', { ...g, managerId: next }));
        return null;
    }

    A.views.assign = () => {
        const q = (A.state.ui.aq || '').trim().toLowerCase();
        const onlyMissing = !!A.state.ui.onlyMissing;
        const managers = Store.all('users').filter(canManage).sort((a, b) => a.name.localeCompare(b.name));
        const people = Store.all('users')
            .filter(p => p.active !== false && p.role !== 'admin')
            .filter(p => !onlyMissing || !p.managerId)
            .filter(p => !q || `${p.name} ${p.staffNo || ''} ${p.jobTitle || ''}`.toLowerCase().includes(q))
            .sort((a, b) => a.name.localeCompare(b.name));
        const depts = Store.all('departments').slice().sort((a, b) => a.name.localeCompare(b.name));
        const groups = [...depts.map(d => ({ title: d.name, list: people.filter(p => p.deptId === d.id) })),
            { title: 'No department', list: people.filter(p => !depts.some(d => d.id === p.deptId)) }].filter(g => g.list.length);
        const row = p => `<div class="row assign-row">${A.avatar(p, 32)}
            <span class="grow"><span class="title">${esc(p.name)}</span><span class="sub">${esc(p.jobTitle || A.ROLE[p.role])}${p.role === 'manager' ? ` · manages ${reportsOf(p.id).length}` : ''}</span></span>
            <select class="select ${p.managerId ? '' : 'missing'}" id="mgr-${p.id}" data-assign-mgr="${p.id}" aria-label="Manager for ${esc(p.name)}">
                <option value="">No manager</option>
                ${managers.filter(m => m.id !== p.id).map(m => `<option value="${m.id}" ${m.id === p.managerId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
            </select></div>`;
        return `<div class="screen">${A.nav('People', 'data-action="tab" data-tab="people"')}
            <h1 class="large-title">Assign Managers</h1>
            <p class="lead">Each person's manager reviews them, sets their goals and sends them exams. Changes save straight away.</p>
            <div class="toolbar"><input class="search" type="search" id="assign-q" data-ui="aq" value="${esc(A.state.ui.aq || '')}" placeholder="Search name, staff no., job" aria-label="Search people"></div>
            <div class="group"><label class="row"><span class="grow">Only people without a manager (${noManager().length})</span>
                <input type="checkbox" class="switch" id="only-missing" data-ui-check="onlyMissing" ${onlyMissing ? 'checked' : ''}></label></div>
            ${groups.map(g => `<div class="section-label">${esc(g.title)} · ${g.list.length}</div><div class="group">${g.list.map(row).join('')}</div>`).join('')
                || `<div class="group section-gap-sm"><div class="row empty">${onlyMissing ? 'Everyone has a manager.' : 'No people match.'}</div></div>`}
            <p class="section-foot">Only managers and admins can be chosen. To make someone a manager, open their profile and change their role. Open reviews and goals move to the new manager; finished reviews stay with whoever wrote them.</p>
        </div>`;
    };

    A.views.people = () => {
        const q = (A.state.ui.q || '').trim().toLowerCase();
        const users = Store.all('users').filter(p => !q || `${p.name} ${p.email || ''} ${p.staffNo || ''} ${p.jobTitle || ''}`.toLowerCase().includes(q))
            .sort((a, b) => a.name.localeCompare(b.name));
        const depts = Store.all('departments').slice().sort((a, b) => a.name.localeCompare(b.name));
        const none = users.filter(p => !depts.some(d => d.id === p.deptId));
        const section = (title, list, d) => `<div class="section-label section-label-split"><span>${esc(title)} · ${list.length}</span>
            ${d ? `<button class="link" data-action="dept-edit" data-id="${d.id}">Edit</button>` : ''}</div>
            <div class="group">${list.map(personRow).join('') || '<div class="row empty">No people.</div>'}</div>`;
        return `<div class="screen">${A.nav()}
            <h1 class="large-title">People</h1>
            <div class="toolbar">
                <input class="search" type="search" id="people-q" data-ui="q" value="${esc(A.state.ui.q || '')}" placeholder="Search name, staff no., job" aria-label="Search people">
            </div>
            <button class="btn btn-primary" data-action="user-new">${ICON.plus} Add Person</button>
            <div class="btn-row even">
                <button class="btn btn-secondary" data-action="go" data-view="assign">${ICON.people} Assign Managers</button>
                <button class="btn btn-secondary" data-action="dept-new">${ICON.plus} Department</button>
            </div>
            ${noManager().length ? `<button class="notice notice-btn" data-action="go" data-view="assign">${ICON.alert}<span class="grow">${noManager().length} ${noManager().length === 1 ? 'person has' : 'people have'} no manager, so no one can review them. Tap to assign.</span>${ICON.chevron}</button>` : ''}
            ${depts.map(d => section(d.name, users.filter(p => p.deptId === d.id), d)).join('')}
            ${none.length ? section('No department', none) : ''}
        </div>`;
    };

    A.views['user-edit'] = () => {
        const f = A.state.ui.person;
        if (!f) { A.go('people', {}, { tab: 'people' }); return null; }
        const isNew = !Store.get('users', f.id);
        const managers = Store.all('users').filter(p => canManage(p) && p.id !== f.id);
        const fire = Store.mode === 'firebase';
        return `<div class="screen">${A.nav('Cancel', isNew ? 'data-action="tab" data-tab="people"' : `data-action="go" data-view="profile" data-id="${f.id}"`)}
            <h1 class="large-title">${isNew ? 'Add Person' : 'Edit Person'}</h1>
            <div class="group">
                <div class="row"><input class="input-plain" id="u-name" data-person="name" value="${esc(f.name)}" placeholder="Full name" autocomplete="off"></div>
                <div class="row"><input class="input-plain" id="u-job" data-person="jobTitle" value="${esc(f.jobTitle || '')}" placeholder="Job title"></div>
                <div class="row"><input class="input-plain" id="u-staff" data-person="staffNo" value="${esc(f.staffNo || '')}" placeholder="Staff number"></div>
            </div>
            <div class="section-label">Sign-in</div>
            <div class="group">
                <div class="row"><input class="input-plain" type="email" id="u-email" data-person="email" value="${esc(f.email || '')}" placeholder="Email" autocomplete="off" ${fire && !isNew ? 'disabled' : ''}></div>
                ${!fire ? `<div class="row"><input class="input-plain" id="u-username" data-person="username" value="${esc(f.username || '')}" placeholder="Username" autocomplete="off" autocapitalize="none"></div>` : ''}
                ${isNew || !fire ? `<div class="row"><input class="input-plain" type="text" id="u-pass" data-person="password" value="${esc(f.password || '')}" placeholder="Temporary password (8+ characters)" autocomplete="new-password" spellcheck="false">
                    <button type="button" class="link" data-action="user-genpass">Generate</button></div>` : ''}
                ${!isNew ? `<label class="row"><span class="grow"><span class="title">Must change password</span><span class="sub">Asked to choose a new one at next sign-in</span></span>
                    <input type="checkbox" class="switch" id="u-mustchange" data-person="mustChangePassword" ${f.mustChangePassword ? 'checked' : ''}></label>` : ''}
            </div>
            ${fire && !isNew ? `<p class="section-foot">Email can't be changed here. <button class="link inline" data-action="user-reset" data-email="${esc(f.email)}">Send a password reset email</button></p>`
                : isNew ? '<p class="section-foot">Give the person this temporary password. When they first sign in, they must replace it with their own.</p>'
                : '<p class="section-foot">Setting a new password here makes it temporary: they must change it at their next sign-in.</p>'}
            <div class="section-label">Role</div>
            <div class="group"><div class="row"><div class="seg grow" role="group" aria-label="Role">
                ${['employee', 'manager', 'admin'].map(r => `<button type="button" class="${f.role === r ? 'on' : ''}" data-action="user-role" data-role="${r}">${A.ROLE[r]}</button>`).join('')}</div></div></div>
            <p class="section-foot">${f.role === 'admin' ? 'Admins manage people, departments and review cycles, and see everyone.' : f.role === 'manager' ? 'Managers review their team, set goals and send exams.' : 'Employees assess themselves, track goals and take exams.'}</p>
            <div class="section-label">Organisation</div>
            <div class="group">
                <label class="row"><span class="grow">Department</span><select class="select" id="u-dept" data-person="deptId">
                    <option value="">None</option>${Store.all('departments').map(d => `<option value="${d.id}" ${d.id === f.deptId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
                <label class="row"><span class="grow">Manager</span><select class="select" id="u-mgr" data-person="managerId">
                    <option value="">None</option>${managers.map(m => `<option value="${m.id}" ${m.id === f.managerId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
                ${!isNew ? `<label class="row"><span class="grow">Active</span><input type="checkbox" class="switch" id="u-active" data-person="active" ${f.active !== false ? 'checked' : ''}></label>` : ''}
            </div>
            <p class="section-foot">The manager reviews this person and sets their goals. Inactive people can't sign in and drop out of new cycles.</p>
            ${!isNew && reportsOf(f.id).length ? `<p class="section-foot">${reportsOf(f.id).length} ${reportsOf(f.id).length === 1 ? 'person reports' : 'people report'} to ${esc(f.name.split(' ')[0])}: ${reportsOf(f.id).map(r => esc(r.name)).join(', ')}.</p>` : ''}
            ${A.state.errors.length ? `<div class="errors" role="alert"><ul>${A.state.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
            <div class="actions"><button class="btn btn-primary" data-action="user-save" ${A.state.ui.busy ? 'disabled' : ''}>${A.state.ui.busy ? 'Saving…' : isNew ? 'Add Person' : 'Save'}</button></div>
        </div>`;
    };

    A.views['dept-edit'] = () => {
        const f = A.state.ui.dept;
        if (!f) { A.go('people', {}, { tab: 'people' }); return null; }
        const saved = Store.get('departments', f.id);
        const used = Store.all('users').some(p => p.deptId === f.id);
        return `<div class="screen">${A.nav('Cancel', 'data-action="tab" data-tab="people"')}
            <h1 class="large-title">${saved ? 'Edit Department' : 'New Department'}</h1>
            <div class="group">
                <div class="row"><input class="input-plain" id="d-name" data-dept="name" value="${esc(f.name)}" placeholder="Name, e.g. Well Intervention"></div>
                <div class="row"><input class="input-plain" id="d-code" data-dept="code" value="${esc(f.code)}" placeholder="Short code, e.g. WI"></div>
            </div>
            ${A.state.errors.length ? `<div class="errors" role="alert"><ul>${A.state.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
            <div class="actions">
                <button class="btn btn-primary" data-action="dept-save">Save</button>
                ${saved && !used ? `<button class="btn btn-plain danger" data-action="dept-delete" data-id="${f.id}">${A.state.ui.confirmDelete ? 'Tap again to delete' : 'Delete Department'}</button>` : ''}
            </div>
            ${saved && used ? '<p class="section-foot">Move everyone out of this department before deleting it.</p>' : ''}
        </div>`;
    };

    const validEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');

    Object.assign(A.actions, {
        'user-new': () => {
            A.state.ui = { person: { id: Store.uid(), name: '', email: '', username: '', password: A.tempPassword(), role: 'employee', deptId: '', managerId: '', jobTitle: '', staffNo: '', active: true, mustChangePassword: true } };
            A.go('user-edit', {}, { keepUi: true });
        },
        'user-edit': el => { A.state.ui = { person: { ...Store.get('users', el.dataset.id) } }; A.go('user-edit', {}, { keepUi: true }); },
        'user-role': el => { A.state.ui.person.role = el.dataset.role; A.render(); },
        'user-genpass': () => { A.state.ui.person.password = A.tempPassword(); A.render(); },
        'user-reset': async el => {
            const err = await Store.resetPassword(el.dataset.email);
            A.toast(err || `Reset email sent to ${el.dataset.email}`);
        },
        'user-save': async () => {
            const f = A.state.ui.person;
            const isNew = !Store.get('users', f.id);
            const fire = Store.mode === 'firebase';
            const errors = [];
            if (!f.name.trim()) errors.push('Enter the person\'s name.');
            if (fire || f.email) { if (!validEmail(f.email)) errors.push('Enter a valid email address.'); }
            if (!fire && !f.username.trim()) errors.push('Enter a username.');
            if (!fire && Store.all('users').some(p => p.id !== f.id && p.username === f.username.trim().toLowerCase())) errors.push('That username is taken.');
            const saved = Store.get('users', f.id);
            const newPassword = isNew || (!fire && saved && f.password !== saved.password);
            if (newPassword && (f.password || '').length < 8) errors.push('Use a temporary password of at least 8 characters, or tap Generate.');
            if (f.role !== 'admin' && !f.managerId) errors.push('Choose a manager, so someone can review this person.');
            if (f.managerId && wouldLoop(f.id, f.managerId)) errors.push(`${A.nameOf(f.managerId)} reports to ${f.name.split(' ')[0] || 'this person'}, so they can't be their manager.`);
            if (saved && canManage(saved) && (!canManage(f) || f.active === false) && reportsOf(f.id).length) {
                errors.push(`${reportsOf(f.id).length} ${reportsOf(f.id).length === 1 ? 'person reports' : 'people report'} to ${saved.name}. Give them a new manager first (People → Assign Managers).`);
            }
            A.state.errors = errors;
            if (errors.length) { A.render(); return; }
            const profile = { ...f, name: f.name.trim(), email: (f.email || '').trim().toLowerCase(), username: (f.username || '').trim().toLowerCase(), deptId: f.deptId || null, managerId: f.managerId || null };
            if (newPassword) profile.mustChangePassword = true;
            if (!isNew) {
                if (fire) delete profile.password;
                const managerChanged = (saved.managerId || null) !== profile.managerId;
                A.save('users', { ...profile, managerId: saved.managerId || null }, 'Saved');
                if (managerChanged) assignManager(f.id, profile.managerId);
                A.go('profile', { id: f.id }, { tab: 'people' });
                return;
            }
            A.state.ui.busy = true;
            A.render();
            try {
                const { id, password, ...rest } = profile;
                const created = await Store.createUser(fire ? { ...rest, username: undefined } : rest, password);
                A.toast(`${created.name} added`);
                A.go('profile', { id: created.id }, { tab: 'people' });
            } catch (e) {
                A.state.ui.busy = false;
                A.state.errors = [e.code === 'auth/email-already-in-use' ? 'That email already has an account.' : e.message];
                A.render();
            }
        },
        'dept-new': () => { A.state.ui = { dept: { id: Store.uid(), name: '', code: '' } }; A.go('dept-edit', {}, { keepUi: true }); },
        'dept-edit': el => { A.state.ui = { dept: { ...Store.get('departments', el.dataset.id) } }; A.go('dept-edit', {}, { keepUi: true }); },
        'dept-save': () => {
            const f = A.state.ui.dept;
            A.state.errors = f.name.trim() ? [] : ['Enter a department name.'];
            if (A.state.errors.length) { A.render(); return; }
            A.save('departments', { ...f, name: f.name.trim(), code: f.code.trim().toUpperCase() }, 'Department saved');
            A.go('people', {}, { tab: 'people' });
        },
        'dept-delete': el => {
            if (!A.state.ui.confirmDelete) { A.state.ui.confirmDelete = true; A.render(); return; }
            Store.remove('departments', el.dataset.id).catch(() => A.toast('Couldn\'t delete. Check your connection.'));
            A.go('people', {}, { tab: 'people' });
        },
    });

    A.bindPeople = t => {
        if (t.dataset.ui) { A.state.ui[t.dataset.ui] = t.value; A.render(); return true; }
        if (t.dataset.uiCheck) { A.state.ui[t.dataset.uiCheck] = t.checked; A.render(); return true; }
        if (t.dataset.assignMgr) {
            const err = assignManager(t.dataset.assignMgr, t.value);
            if (err) { A.toast(err); A.render(); return true; }
            A.toast(t.value ? `${A.nameOf(t.dataset.assignMgr)} now reports to ${A.nameOf(t.value)}` : `${A.nameOf(t.dataset.assignMgr)} has no manager`);
            return true;
        }
        if (t.dataset.person && A.state.ui.person) { A.state.ui.person[t.dataset.person] = t.type === 'checkbox' ? t.checked : t.value; return true; }
        if (t.dataset.dept && A.state.ui.dept) { A.state.ui.dept[t.dataset.dept] = t.value; return true; }
        return false;
    };
})();
