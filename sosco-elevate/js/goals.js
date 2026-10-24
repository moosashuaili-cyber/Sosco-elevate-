// Goals / KPIs: managers set targets per review cycle; employees log progress.
(() => {
    'use strict';
    const A = App;
    const { esc, ICON, fmtDay } = A;

    function goalRow(g, showPerson) {
        const p = A.achievement(g);
        const tone = p >= 100 ? 'green' : p >= 70 ? 'blue' : 'orange';
        const who = showPerson ? `${esc(A.nameOf(g.uid))} · ` : '';
        return `<button class="row goal-row" data-action="go" data-view="goal" data-id="${g.id}">
            <span class="grow"><span class="title">${esc(g.title)}</span>
            <span class="sub">${who}${esc(g.actual ?? 0)} of ${g.direction === 'lower' ? 'max ' : ''}${esc(g.target)} ${esc(g.metric || '')} · Weight ${g.weight || 0}%</span>
            <span class="progress small"><span class="tone-${tone}" style="width:${Math.min(100, p)}%"></span></span></span>
            ${A.pill(`${p}%`, tone)}${ICON.chevron}</button>`;
    }
    A.goalRow = goalRow;

    A.views.goals = () => {
        const u = A.me();
        const mine = Store.all('goals').filter(g => g.uid === u.id);
        const cycles = A.cyclesNewest().filter(c => mine.some(g => g.cycleId === c.id));
        const weight = c => mine.filter(g => g.cycleId === c.id).reduce((n, g) => n + (Number(g.weight) || 0), 0);
        return `<div class="screen">${A.nav()}
            <h1 class="large-title">Goals</h1>
            ${cycles.length ? cycles.map(c => `<div class="section-label section-label-split"><span>${esc(c.name)}</span><span>${c.status === 'closed' ? 'Closed' : `Weights ${weight(c)}%`}</span></div>
                <div class="group">${mine.filter(g => g.cycleId === c.id).map(g => goalRow(g)).join('')}</div>`).join('')
                : '<div class="group"><div class="row empty">No goals yet. Your manager sets your goals for each review cycle.</div></div>'}
            ${cycles.length ? '<p class="section-foot">Tap a goal to log your latest progress. Your manager rates each goal in your review.</p>' : ''}
        </div>`;
    };

    A.views.goal = ({ id }) => {
        const g = Store.get('goals', id);
        if (!g) { A.home(); return null; }
        const u = A.me();
        const mine = g.uid === u.id;
        const canManage = g.managerId === u.id || u.role === 'admin';
        const cycle = Store.get('cycles', g.cycleId);
        const open = cycle && cycle.status !== 'closed';
        const p = A.achievement(g);
        const f = A.state.ui.progress || (A.state.ui.progress = { value: g.actual ?? 0, note: '' });
        const back = mine ? A.nav('Goals', 'data-action="tab" data-tab="goals"') : A.nav(A.nameOf(g.uid), `data-action="go" data-view="profile" data-id="${g.uid}"`);

        return `<div class="screen">${back}
            <h1 class="large-title">${esc(g.title)}</h1>
            <p class="lead">${mine ? '' : `${esc(A.nameOf(g.uid))} · `}${esc(cycle ? cycle.name : '')}</p>
            ${g.description ? `<p class="body-text">${esc(g.description)}</p>` : ''}
            <div class="goal-hero">
                ${A.ring(120, 11, Math.min(1, p / 100), p >= 100 ? 'var(--green)' : p >= 70 ? 'var(--blue)' : 'var(--orange)', `<b>${p}%</b><span>achieved</span>`)}
                <div class="group grow">
                    <div class="row"><span class="grow">Current</span><span class="value">${esc(g.actual ?? 0)} ${esc(g.metric || '')}</span></div>
                    <div class="row"><span class="grow">Target</span><span class="value">${g.direction === 'lower' ? 'At most ' : ''}${esc(g.target)} ${esc(g.metric || '')}</span></div>
                    <div class="row"><span class="grow">Weight</span><span class="value">${g.weight || 0}%</span></div>
                </div>
            </div>

            ${(mine || canManage) && open ? `<div class="section-label">Log progress</div>
            <div class="group">
                <label class="row"><span class="grow">New value</span><input class="input-plain num wide" type="number" id="gp-value" data-progress="value" value="${esc(f.value)}"><span class="unit">${esc(g.metric || '')}</span></label>
                <div class="row"><input class="input-plain" id="gp-note" data-progress="note" value="${esc(f.note)}" placeholder="What changed? (optional)"></div>
            </div>
            <div class="actions tight"><button class="btn btn-primary" data-action="goal-log" data-id="${g.id}">Save Progress</button></div>` : ''}

            ${(g.updates || []).length ? `<div class="section-label">History</div>
            <div class="group">${g.updates.slice().reverse().map(x => `<div class="row"><span class="grow"><span class="title">${esc(x.value)} ${esc(g.metric || '')}</span>
                <span class="sub">${fmtDay(x.at)} · ${esc(A.nameOf(x.by))}${x.note ? ` · ${esc(x.note)}` : ''}</span></span></div>`).join('')}</div>` : ''}

            ${canManage ? `<div class="actions">
                <button class="btn btn-plain" data-action="goal-edit" data-id="${g.id}">Edit Goal</button>
                <button class="btn btn-plain danger" data-action="goal-delete" data-id="${g.id}">${A.state.ui.confirmDelete ? 'Tap again to delete this goal' : 'Delete Goal'}</button>
            </div>` : ''}
        </div>`;
    };

    A.views['goal-edit'] = () => {
        const f = A.state.ui.goal;
        if (!f) { A.home(); return null; }
        const cycles = A.cyclesNewest().filter(c => c.status !== 'closed');
        const others = Store.all('goals').filter(g => g.uid === f.uid && g.cycleId === f.cycleId && g.id !== f.id);
        const total = others.reduce((n, g) => n + (Number(g.weight) || 0), 0) + (Number(f.weight) || 0);
        return `<div class="screen">${A.nav('Cancel', `data-action="go" data-view="profile" data-id="${f.uid}"`)}
            <h1 class="large-title">${Store.get('goals', f.id) ? 'Edit Goal' : 'New Goal'}</h1>
            <p class="lead">For ${esc(A.nameOf(f.uid))}</p>
            <div class="group">
                <div class="row"><input class="input-plain" id="g-title" data-goal="title" value="${esc(f.title)}" placeholder="Goal, e.g. Jobs completed without NPT"></div>
                <div class="row"><textarea class="input-plain" id="g-desc" data-goal="description" rows="2" placeholder="Details (optional)">${esc(f.description || '')}</textarea></div>
                <label class="row"><span class="grow">Review cycle</span><select class="select" id="g-cycle" data-goal="cycleId">${cycles.map(c => `<option value="${c.id}" ${c.id === f.cycleId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
            </div>
            <div class="section-label">Measure</div>
            <div class="group">
                <div class="row"><div class="seg grow" role="group" aria-label="Direction">
                    <button type="button" class="${f.direction !== 'lower' ? 'on' : ''}" data-action="goal-dir" data-dir="higher">Higher is better</button>
                    <button type="button" class="${f.direction === 'lower' ? 'on' : ''}" data-action="goal-dir" data-dir="lower">Lower is better</button></div></div>
                <label class="row"><span class="grow">${f.direction === 'lower' ? 'Maximum allowed' : 'Target'}</span><input class="input-plain num wide" type="number" id="g-target" data-goal="target" data-num value="${esc(f.target)}"></label>
                <label class="row"><span class="grow">Unit</span><input class="input-plain short" id="g-metric" data-goal="metric" value="${esc(f.metric || '')}" placeholder="jobs, %, talks"></label>
                <label class="row"><span class="grow">Current value</span><input class="input-plain num wide" type="number" id="g-actual" data-goal="actual" data-num value="${esc(f.actual ?? 0)}"></label>
                <label class="row"><span class="grow">Weight</span><input class="input-plain num" type="number" min="0" max="100" id="g-weight" data-goal="weight" data-num value="${esc(f.weight)}"><span class="unit">%</span></label>
            </div>
            <p class="section-foot">Goal weights for this person and cycle total ${total}% including this one. Aim for 100%.</p>
            ${A.state.errors.length ? `<div class="errors" role="alert"><ul>${A.state.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
            <div class="actions"><button class="btn btn-primary" data-action="goal-save">Save Goal</button></div>
        </div>`;
    };

    Object.assign(A.actions, {
        'goal-new': el => {
            const cycle = A.activeCycle() || A.cyclesNewest().find(c => c.status !== 'closed');
            if (!cycle) { A.toast('Start a review cycle first. Goals belong to a cycle.'); return; }
            const p = A.user(el.dataset.uid);
            A.state.ui = { goal: { id: Store.uid(), uid: p.id, managerId: p.managerId || A.me().id, cycleId: cycle.id, title: '', description: '', metric: '', direction: 'higher', target: 1, actual: 0, weight: 0, updates: [], createdAt: Date.now() } };
            A.go('goal-edit', {}, { keepUi: true });
        },
        'goal-edit': el => { A.state.ui = { goal: JSON.parse(JSON.stringify(Store.get('goals', el.dataset.id))) }; A.go('goal-edit', {}, { keepUi: true }); },
        'goal-dir': el => { A.state.ui.goal.direction = el.dataset.dir; A.render(); },
        'goal-save': () => {
            const f = A.state.ui.goal;
            const errors = [];
            if (!f.title.trim()) errors.push('Give the goal a name.');
            if (f.target === '' || isNaN(Number(f.target))) errors.push('Set a target number.');
            A.state.errors = errors;
            if (errors.length) { A.render(); return; }
            A.save('goals', { ...f, target: Number(f.target), actual: Number(f.actual) || 0, weight: Number(f.weight) || 0 }, 'Goal saved');
            A.go('profile', { id: f.uid }, { tab: A.state.tab });
        },
        'goal-delete': el => {
            if (!A.state.ui.confirmDelete) { A.state.ui.confirmDelete = true; A.render(); return; }
            const g = Store.get('goals', el.dataset.id);
            Store.remove('goals', g.id).catch(() => A.toast('Couldn\'t delete. Check your connection.'));
            A.toast('Goal deleted');
            A.go('profile', { id: g.uid });
        },
        'goal-log': el => {
            const g = Store.get('goals', el.dataset.id);
            const f = A.state.ui.progress;
            const value = Number(f.value);
            if (f.value === '' || isNaN(value)) { A.toast('Enter a number for the new value.'); return; }
            A.state.ui.progress = { value, note: '' };
            A.save('goals', { ...g, actual: value, updates: [...(g.updates || []), { at: Date.now(), value, note: f.note.trim(), by: A.me().id }] }, 'Progress saved');
        },
    });

    A.bindGoal = t => {
        if (t.dataset.progress) { A.state.ui.progress[t.dataset.progress] = t.value; return true; }
        const f = A.state.ui.goal;
        if (f && t.dataset.goal) {
            f[t.dataset.goal] = t.dataset.num !== undefined ? (t.value === '' ? '' : Number(t.value)) : t.value;
            return true;
        }
        return false;
    };
})();
