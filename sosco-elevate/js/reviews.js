// Performance reviews: admin runs review cycles; employees assess themselves,
// managers rate competencies and goals, employees sign off.
(() => {
    'use strict';
    const A = App;
    const { esc, ICON, fmtDay, fmtDate } = A;

    const cycleOf = a => Store.get('cycles', a.cycleId);
    const goalsOf = (uid, cycleId) => Store.all('goals').filter(g => g.uid === uid && g.cycleId === cycleId).sort((a, b) => (b.weight || 0) - (a.weight || 0));

    // ---------- Shared pieces ----------

    function rateInput(group, key, value, label) {
        return `<div class="rate-wrap">
            <div class="rate" role="radiogroup" aria-label="${esc(label)}">
                ${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" aria-checked="${value === n}" class="${value === n ? 'on' : ''} ${value && n <= value ? 'fill' : ''}"
                    data-action="rate" data-group="${group}" data-key="${key}" data-v="${n}" aria-label="${n} – ${A.RATINGS[n]}">${n}</button>`).join('')}
            </div>
            <div class="rate-label">${value ? `${value} · ${A.RATINGS[value]}` : 'Tap to rate'}</div>
        </div>`;
    }

    function scoreRing(score, size = 132) {
        const b = A.band(score);
        const color = score == null ? 'var(--track)' : b >= 4 ? 'var(--green)' : b === 3 ? 'var(--blue)' : 'var(--red)';
        return A.ring(size, 12, score == null ? 0 : score / 5, color,
            `<b>${score == null ? '–' : score.toFixed(2)}</b><span>out of 5</span>`);
    }

    function goalLine(g) {
        const p = A.achievement(g);
        return `${esc(g.actual ?? 0)} of ${g.direction === 'lower' ? 'max ' : ''}${esc(g.target)} ${esc(g.metric || '')} · ${p}%`;
    }

    // The finished review, as both the employee and the manager see it.
    function resultView(a) {
        const cycle = cycleOf(a);
        const r = A.result(a, cycle);
        const self = (a.self && a.self.ratings) || {};
        const mgr = (a.review && a.review.ratings) || {};
        const goals = goalsOf(a.uid, a.cycleId);
        const gr = (a.review && a.review.goalRatings) || {};
        return `
            <div class="result-hero">
                ${scoreRing(r.final)}
                <div class="grow">
                    <div class="result-band">${r.final == null ? 'Not rated' : A.RATINGS[r.band]}</div>
                    <div class="sub">Competencies ${A.fmtScore(r.comp)}${goals.length ? ` · Goals ${A.fmtScore(r.goal)} (${cycle.goalsWeight}% of total)` : ''}</div>
                    <div class="sub">Reviewed by ${esc(A.nameOf(a.managerId))}${a.review && a.review.submittedAt ? ` on ${fmtDay(a.review.submittedAt)}` : ''}</div>
                </div>
            </div>

            <div class="section-label section-label-split"><span>Competencies</span><span class="cols"><span>Self</span><span>Manager</span></span></div>
            <div class="group">${cycle.competencies.map(c => `<div class="row">
                <span class="grow"><span class="title">${esc(c.name)}</span><span class="sub">Weight ${c.weight}%</span></span>
                <span class="cols"><span class="score-cell muted">${self[c.id] || '–'}</span><span class="score-cell">${mgr[c.id] || '–'}</span></span></div>`).join('')}</div>

            ${goals.length ? `<div class="section-label section-label-split"><span>Goals</span><span class="cols"><span></span><span>Rating</span></span></div>
            <div class="group">${goals.map(g => `<div class="row">
                <span class="grow"><span class="title">${esc(g.title)}</span><span class="sub">${goalLine(g)} · Weight ${g.weight || 0}%</span></span>
                <span class="cols"><span></span><span class="score-cell">${gr[g.id] || '–'}</span></span></div>`).join('')}</div>` : ''}

            ${a.review ? `<div class="section-label">Manager's comments</div>
            <div class="group text-group">
                ${a.review.comment ? `<div class="row"><div><span class="sub">Overall</span><p>${esc(a.review.comment)}</p></div></div>` : ''}
                ${a.review.strengths ? `<div class="row"><div><span class="sub">Strengths</span><p>${esc(a.review.strengths)}</p></div></div>` : ''}
                ${a.review.improvements ? `<div class="row"><div><span class="sub">To work on</span><p>${esc(a.review.improvements)}</p></div></div>` : ''}
            </div>` : ''}
            ${a.self && a.self.comment ? `<div class="section-label">Employee's comments</div><div class="group text-group"><div class="row"><p>${esc(a.self.comment)}</p></div></div>` : ''}
            ${a.ack ? `<p class="section-foot">${esc(A.nameOf(a.uid))} signed off on ${fmtDay(a.ack.at)}${a.ack.comment ? `: “${esc(a.ack.comment)}”` : '.'}</p>` : ''}`;
    }
    A.resultView = resultView;

    function personHeader(a) {
        const p = A.user(a.uid) || { name: 'Removed user' };
        const cycle = cycleOf(a);
        return `<div class="person-head">${A.avatar(p, 52)}<div class="grow"><h1 class="title-2">${esc(p.name)}</h1>
            <div class="sub">${esc(p.jobTitle || '')}${p.deptId ? ` · ${esc((A.dept(p.deptId) || {}).code || '')}` : ''}</div>
            <div class="sub">${esc(cycle.name)}</div></div>${A.stagePill(a)}</div>`;
    }

    // ---------- Lists ----------

    function nextStep(a, forManager) {
        const cycle = cycleOf(a);
        const mine = a.uid === A.me().id;
        if (a.stage === 'self') return mine ? `Assess yourself by ${fmtDay(cycle.selfDue)}` : `Self-assessment due ${fmtDay(cycle.selfDue)}`;
        if (a.stage === 'review') return forManager && a.managerId === A.me().id ? `Your review due ${fmtDay(cycle.managerDue)}` : `With ${A.nameOf(a.managerId)} for review`;
        if (a.stage === 'ack') return mine ? 'Read your review and sign off' : `Waiting for ${A.nameOf(a.uid)} to sign off`;
        return 'Complete';
    }

    function appraisalRow(a, forManager) {
        const p = A.user(a.uid) || { name: 'Removed user' };
        const right = A.isFinal(a) ? A.ratingPill(A.result(a).final) : A.stagePill(a);
        const label = forManager ? `${A.avatar(p, 34)}<span class="grow"><span class="title">${esc(p.name)}</span>`
            : `<span class="grow"><span class="title">${esc((cycleOf(a) || {}).name)}</span>`;
        return `<button class="row" data-action="go" data-view="appraisal" data-id="${a.id}">${label}
            <span class="sub">${esc(nextStep(a, forManager))}</span></span>${right}${ICON.chevron}</button>`;
    }

    A.views.reviews = () => {
        const u = A.me();
        const mine = Store.all('appraisals').filter(a => a.uid === u.id && cycleOf(a))
            .sort((a, b) => cycleOf(b).periodStart - cycleOf(a).periodStart);
        const mySection = mine.length ? `<div class="section-label">${A.isManager() ? 'Your own review' : 'Your reviews'}</div>
            <div class="group">${mine.map(a => appraisalRow(a, false)).join('')}</div>` : '';

        if (!A.isManager()) {
            return `<div class="screen">${A.nav()}<h1 class="large-title">Reviews</h1>
                ${mySection || '<div class="group"><div class="row empty">No reviews yet. Your review appears here when the next cycle starts.</div></div>'}</div>`;
        }

        const cycles = A.cyclesNewest().filter(c => c.status !== 'draft' || A.isAdmin());
        const sel = Store.get('cycles', A.state.ui.cycleId) || A.activeCycle() || cycles[0];

        let adminBlock = '';
        if (A.isAdmin()) {
            adminBlock = `<div class="section-label">Review cycles</div>
                <div class="group">${cycles.map(c => {
                    const list = Store.all('appraisals').filter(a => a.cycleId === c.id);
                    const done = list.filter(A.isFinal).length;
                    return `<button class="row" data-action="go" data-view="cycle" data-id="${c.id}"><span class="grow"><span class="title">${esc(c.name)}</span>
                        <span class="sub">${fmtDay(c.periodStart)} – ${fmtDay(c.periodEnd)}${c.status !== 'draft' ? ` · ${done}/${list.length} reviewed` : ''}</span></span>
                        ${A.pill(c.status === 'active' ? 'Active' : c.status === 'draft' ? 'Draft' : 'Closed', c.status === 'active' ? 'green' : 'grey')}${ICON.chevron}</button>`;
                }).join('') || '<div class="row empty">No cycles yet.</div>'}</div>
                <div class="actions tight"><button class="btn btn-secondary" data-action="cycle-new">${ICON.plus} New Review Cycle</button></div>`;
        }

        const team = sel ? Store.all('appraisals').filter(a => a.cycleId === sel.id && (A.isAdmin() ? a.uid !== u.id : a.managerId === u.id)) : [];
        const order = { review: 0, self: 1, ack: 2, done: 3 };
        team.sort((a, b) => order[a.stage] - order[b.stage] || A.nameOf(a.uid).localeCompare(A.nameOf(b.uid)));
        const picker = cycles.filter(c => c.status !== 'draft').length > 1 ? `<select class="select" id="cycle-pick" data-action-change="cycle-pick" aria-label="Review cycle">
            ${cycles.filter(c => c.status !== 'draft').map(c => `<option value="${c.id}" ${sel && c.id === sel.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : '';

        return `<div class="screen">${A.nav()}
            <h1 class="large-title">Reviews</h1>
            ${A.isAdmin() ? '' : mySection}
            <div class="section-label section-label-split"><span>${A.isAdmin() ? 'Everyone' : 'Your team'}${sel ? ` · ${esc(sel.name)}` : ''}</span>${picker}</div>
            <div class="group">${team.map(a => appraisalRow(a, true)).join('') || `<div class="row empty">${sel ? 'No reviews in this cycle for your team.' : 'No review cycle has started yet.'}</div>`}</div>
            ${adminBlock}
            ${A.isAdmin() ? mySection : ''}
        </div>`;
    };

    // ---------- One appraisal ----------

    function formFor(a) {
        const ui = A.state.ui;
        if (ui.formFor !== a.id) {
            const src = a.uid === A.me().id && a.stage === 'self' ? a.self : a.review;
            const goals = goalsOf(a.uid, a.cycleId);
            const goalRatings = { ...(src && src.goalRatings) };
            goals.forEach(g => { if (!goalRatings[g.id]) goalRatings[g.id] = A.suggestRating(A.achievement(g)); });
            ui.form = { ratings: { ...(src && src.ratings) }, goalRatings, comment: (src && src.comment) || '', strengths: (src && src.strengths) || '', improvements: (src && src.improvements) || '' };
            ui.formFor = a.id;
        }
        return ui.form;
    }

    function selfForm(a) {
        const cycle = cycleOf(a);
        const f = formFor(a);
        const goals = goalsOf(a.uid, a.cycleId);
        return `
            <p class="lead">Rate yourself on each competency for ${esc(cycle.name)}. ${esc(A.nameOf(a.managerId))} sees your ratings next to theirs. Due ${fmtDay(cycle.selfDue)}.</p>
            ${cycle.competencies.map(c => `<div class="rate-card">
                <div class="title">${esc(c.name)}</div><div class="sub">${esc(c.desc || '')}</div>
                ${rateInput('ratings', c.id, f.ratings[c.id], c.name)}</div>`).join('')}
            <div class="section-label">Your achievements this period</div>
            <div class="group"><div class="row"><textarea class="input-plain" id="f-comment" data-form="comment" rows="4" placeholder="Jobs, certificates, improvements you led, anything your manager should know">${esc(f.comment)}</textarea></div></div>
            ${goals.length ? `<div class="section-label">Your goals</div><div class="group">${goals.map(g => `<button class="row" data-action="go" data-view="goal" data-id="${g.id}">
                <span class="grow"><span class="title">${esc(g.title)}</span><span class="sub">${goalLine(g)}</span></span>${ICON.chevron}</button>`).join('')}</div>
                <p class="section-foot">Update your goal progress before you submit. Your manager rates the goals.</p>` : ''}
            ${errorsBox()}
            <div class="actions">
                <button class="btn btn-primary" data-action="self-submit" data-id="${a.id}">Submit to ${esc(A.nameOf(a.managerId))}</button>
                <button class="btn btn-plain" data-action="self-save" data-id="${a.id}">Save and Finish Later</button>
            </div>`;
    }

    function reviewForm(a) {
        const cycle = cycleOf(a);
        const f = formFor(a);
        const self = (a.self && a.self.ratings) || {};
        const goals = goalsOf(a.uid, a.cycleId);
        const r = A.result(a, cycle, f.ratings, f.goalRatings);
        const who = A.nameOf(a.uid).split(' ')[0];
        return `
            ${a.stage === 'self' ? `<div class="notice">${ICON.clock}<span>${esc(who)} hasn't submitted a self-assessment yet (due ${fmtDay(cycle.selfDue)}). You can still review now.</span></div>` : ''}
            <div class="section-label">Competencies · ${100 - (goals.length ? cycle.goalsWeight : 0)}% of total</div>
            ${cycle.competencies.map(c => `<div class="rate-card">
                <div class="rate-head"><div class="grow"><div class="title">${esc(c.name)}</div><div class="sub">${esc(c.desc || '')} · Weight ${c.weight}%</div></div>
                ${self[c.id] ? `<span class="self-chip" title="${esc(who)}'s own rating">Self ${self[c.id]}</span>` : ''}</div>
                ${rateInput('ratings', c.id, f.ratings[c.id], c.name)}</div>`).join('')}

            ${goals.length ? `<div class="section-label">Goals · ${cycle.goalsWeight}% of total</div>
            ${goals.map(g => `<div class="rate-card">
                <div class="rate-head"><div class="grow"><div class="title">${esc(g.title)}</div><div class="sub">${goalLine(g)} · Weight ${g.weight || 0}%</div></div>
                <span class="self-chip">Suggested ${A.suggestRating(A.achievement(g))}</span></div>
                <div class="progress small"><span style="width:${Math.min(100, A.achievement(g))}%"></span></div>
                ${rateInput('goalRatings', g.id, f.goalRatings[g.id], g.title)}</div>`).join('')}` : ''}

            ${a.self && a.self.comment ? `<div class="section-label">${esc(who)}'s comments</div><div class="group text-group"><div class="row"><p>${esc(a.self.comment)}</p></div></div>` : ''}

            <div class="section-label">Your comments</div>
            <div class="group">
                <div class="row"><textarea class="input-plain" id="f-comment" data-form="comment" rows="3" placeholder="Overall comment (required)">${esc(f.comment)}</textarea></div>
                <div class="row"><textarea class="input-plain" id="f-strengths" data-form="strengths" rows="2" placeholder="Strengths">${esc(f.strengths)}</textarea></div>
                <div class="row"><textarea class="input-plain" id="f-improvements" data-form="improvements" rows="2" placeholder="To work on next period">${esc(f.improvements)}</textarea></div>
            </div>

            <div class="preview-card">
                <div class="grow"><div class="sub">Overall score</div>
                <div class="preview-score">${A.fmtScore(r.final)} <span>${r.final == null ? '' : A.RATINGS[r.band]}</span></div>
                <div class="sub">Competencies ${A.fmtScore(r.comp)}${goals.length ? ` · Goals ${A.fmtScore(r.goal)}` : ''}</div></div>
            </div>
            ${errorsBox()}
            <div class="actions">
                <button class="btn btn-primary" data-action="review-submit" data-id="${a.id}">Send to ${esc(who)} for Sign-off</button>
                <button class="btn btn-plain" data-action="review-save" data-id="${a.id}">Save and Finish Later</button>
            </div>`;
    }

    const errorsBox = () => (A.state.errors.length
        ? `<div class="errors" role="alert"><b>Before submitting:</b><ul>${A.state.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : '');

    A.views.appraisal = ({ id }) => {
        const a = Store.get('appraisals', id);
        if (!a || !cycleOf(a)) { A.go('reviews', {}, { tab: 'reviews' }); return null; }
        const u = A.me();
        const mine = a.uid === u.id;
        const reviewer = a.managerId === u.id || u.role === 'admin';
        const closed = cycleOf(a).status === 'closed';
        let body;

        if (mine && a.stage === 'self' && !closed) body = selfForm(a);
        else if (!mine && reviewer && (a.stage === 'self' || a.stage === 'review') && !closed) body = reviewForm(a);
        else if (A.isFinal(a)) {
            body = resultView(a) + (mine && a.stage === 'ack' ? `
                <div class="section-label">Sign off</div>
                <div class="group"><div class="row"><textarea class="input-plain" id="f-ack" data-form="ack" rows="2" placeholder="Comment for ${esc(A.nameOf(a.managerId))} (optional)">${esc((A.state.ui.form || {}).ack || '')}</textarea></div></div>
                <p class="section-foot">Signing off confirms you have read this review. It doesn't mean you agree with every rating; add a comment if you don't.</p>
                <div class="actions"><button class="btn btn-primary" data-action="ack-submit" data-id="${a.id}">Sign Off</button></div>` : '');
        } else {
            const waiting = a.stage === 'review' ? `${esc(A.nameOf(a.managerId))} is reviewing.` : `Waiting for ${esc(A.nameOf(a.uid))}'s self-assessment.`;
            body = `<div class="notice">${ICON.clock}<span>${closed ? 'This cycle is closed.' : waiting}</span></div>
                ${a.self && a.self.submittedAt ? `<div class="section-label">Self-assessment</div><div class="group">${cycleOf(a).competencies.map(c => `<div class="row"><span class="grow">${esc(c.name)}</span>
                    <span class="value">${(a.self.ratings || {})[c.id] || '–'} · ${A.SHORT[(a.self.ratings || {})[c.id] || 0] || ''}</span></div>`).join('')}</div>` : ''}`;
        }

        const back = mine && !A.isManager() ? 'Reviews' : 'Reviews';
        return `<div class="screen">${A.nav(back, 'data-action="tab" data-tab="reviews"')}
            ${mine ? `<h1 class="large-title">${esc(cycleOf(a).name)}</h1>` : personHeader(a)}
            ${body}</div>`;
    };

    // ---------- Cycles (admin) ----------

    A.views.cycle = ({ id }) => {
        const c = Store.get('cycles', id);
        if (!c) { A.go('reviews', {}, { tab: 'reviews' }); return null; }
        const list = Store.all('appraisals').filter(a => a.cycleId === c.id);
        const eligible = Store.all('users').filter(p => p.active !== false && p.role !== 'admin' && p.managerId);
        const missing = eligible.filter(p => !list.some(a => a.uid === p.id));
        const count = s => list.filter(a => a.stage === s).length;
        const byDept = Store.all('departments').map(d => ({ d, rows: list.filter(a => a.deptId === d.id) })).filter(x => x.rows.length);

        return `<div class="screen">${A.nav('Reviews', 'data-action="tab" data-tab="reviews"')}
            <h1 class="large-title">${esc(c.name)}</h1>
            <p class="lead">${fmtDay(c.periodStart)} – ${fmtDay(c.periodEnd)}</p>
            <div class="group">
                <div class="row"><span class="grow">Status</span>${A.pill(c.status === 'active' ? 'Active' : c.status === 'draft' ? 'Draft' : 'Closed', c.status === 'active' ? 'green' : 'grey')}</div>
                <div class="row"><span class="grow">Self-assessments due</span><span class="value">${fmtDay(c.selfDue)}</span></div>
                <div class="row"><span class="grow">Manager reviews due</span><span class="value">${fmtDay(c.managerDue)}</span></div>
                <div class="row"><span class="grow">Goals weight</span><span class="value">${c.goalsWeight}%</span></div>
            </div>
            <div class="section-label">Competencies</div>
            <div class="group">${c.competencies.map(x => `<div class="row"><span class="grow"><span class="title">${esc(x.name)}</span><span class="sub">${esc(x.desc || '')}</span></span><span class="value">${x.weight}%</span></div>`).join('')}</div>

            ${c.status !== 'draft' ? `<div class="section-label">Progress</div>
            <div class="card">${A.stageBar([
                { label: 'Self-assessment', value: count('self'), color: 'var(--seq-1)' },
                { label: 'Manager review', value: count('review'), color: 'var(--seq-2)' },
                { label: 'Sign-off', value: count('ack'), color: 'var(--seq-3)' },
                { label: 'Complete', value: count('done'), color: 'var(--seq-4)' },
            ])}</div>
            ${byDept.map(({ d, rows }) => `<div class="section-label">${esc(d.name)}</div><div class="group">${rows.map(a => appraisalRow(a, true)).join('')}</div>`).join('')}` : ''}

            <div class="actions">
                ${c.status === 'draft' ? `<button class="btn btn-primary" data-action="cycle-launch" data-id="${c.id}">Start Cycle for ${eligible.length} People</button>
                    <p class="section-foot">Everyone with a manager gets a review. They are asked to assess themselves first.</p>` : ''}
                ${c.status === 'active' && missing.length ? `<button class="btn btn-secondary" data-action="cycle-launch" data-id="${c.id}">Add ${missing.length} New ${missing.length === 1 ? 'Person' : 'People'} to This Cycle</button>` : ''}
                ${c.status !== 'closed' ? `<button class="btn btn-plain" data-action="cycle-edit" data-id="${c.id}">Edit Cycle</button>` : ''}
                ${c.status === 'active' ? `<button class="btn btn-plain danger" data-action="cycle-close" data-id="${c.id}">${A.state.ui.confirmClose ? 'Tap again to close. Unfinished reviews stay unfinished.' : 'Close Cycle'}</button>` : ''}
                ${c.status === 'draft' ? `<button class="btn btn-plain danger" data-action="cycle-delete" data-id="${c.id}">${A.state.ui.confirmDelete ? 'Tap again to delete' : 'Delete Draft Cycle'}</button>` : ''}
            </div>
        </div>`;
    };

    const DEFAULT_COMPETENCIES = [
        { name: 'HSE & safety behaviour', desc: 'Follows PTW, stops unsafe work, reports hazards and near misses.', weight: 25 },
        { name: 'Technical competence', desc: 'Knows the equipment and procedures for the role and applies them correctly.', weight: 25 },
        { name: 'Quality of work', desc: 'Jobs done right first time, with complete reports and paperwork.', weight: 20 },
        { name: 'Teamwork & communication', desc: 'Works well with the crew, client and other departments; clear handovers.', weight: 15 },
        { name: 'Reliability & attendance', desc: 'On time for call-outs and rotations; can be counted on.', weight: 15 },
    ];

    A.views['cycle-edit'] = () => {
        const f = A.state.ui.cycle;
        if (!f) { A.go('reviews', {}, { tab: 'reviews' }); return null; }
        const total = f.competencies.reduce((n, c) => n + (Number(c.weight) || 0), 0);
        const dateRow = (label, field) => `<label class="row"><span class="grow">${label}</span>
            <input class="input-plain date" type="date" id="cy-${field}" data-cycle="${field}" data-date value="${f[field] ? A.toDateInput(f[field]) : ''}"></label>`;
        return `<div class="screen">${A.nav('Cancel', 'data-action="tab" data-tab="reviews"')}
            <h1 class="large-title">${Store.get('cycles', f.id) ? 'Edit Cycle' : 'New Review Cycle'}</h1>
            <div class="group">
                <div class="row"><input class="input-plain" id="cy-name" data-cycle="name" value="${esc(f.name)}" placeholder="Name, e.g. ${new Date().getFullYear()} Annual Review"></div>
            </div>
            <div class="section-label">Dates</div>
            <div class="group">${dateRow('Period starts', 'periodStart')}${dateRow('Period ends', 'periodEnd')}${dateRow('Self-assessments due', 'selfDue')}${dateRow('Manager reviews due', 'managerDue')}</div>
            <div class="section-label">Scoring</div>
            <div class="group"><label class="row"><span class="grow"><span class="title">Goals share of total</span><span class="sub">The rest comes from competencies</span></span>
                <input class="input-plain num" type="number" min="0" max="100" id="cy-gw" data-cycle="goalsWeight" data-num value="${f.goalsWeight}"><span class="unit">%</span></label></div>
            <div class="section-label section-label-split"><span>Competencies</span><span class="${total === 100 ? '' : 'warn'}">Weights total ${total}%</span></div>
            ${f.competencies.map((c, i) => `<div class="q-card">
                <div class="q-head"><span class="q-num">Competency ${i + 1}</span>${f.competencies.length > 1 ? `<button type="button" class="link-danger" data-action="comp-del" data-i="${i}">Delete</button>` : ''}</div>
                <input class="q-text-input" id="cy-c${i}-name" data-comp="${i}" data-field="name" value="${esc(c.name)}" placeholder="Name">
                <textarea class="q-text-input" id="cy-c${i}-desc" data-comp="${i}" data-field="desc" rows="2" placeholder="What good looks like">${esc(c.desc)}</textarea>
                <label class="timer-row"><span>Weight</span><span><input class="input-plain num boxed" type="number" min="0" max="100" id="cy-c${i}-w" data-comp="${i}" data-field="weight" value="${c.weight}"> %</span></label>
            </div>`).join('')}
            <button class="btn btn-secondary" data-action="comp-add">${ICON.plus} Add Competency</button>
            ${errorsBox()}
            <div class="actions"><button class="btn btn-primary" data-action="cycle-save">Save Cycle</button></div>
        </div>`;
    };

    function validateCycle(f) {
        const e = [];
        if (!f.name.trim()) e.push('Give the cycle a name.');
        if (!f.periodStart || !f.periodEnd || !f.selfDue || !f.managerDue) e.push('Fill in all four dates.');
        else {
            if (f.periodEnd <= f.periodStart) e.push('The period must end after it starts.');
            if (f.managerDue < f.selfDue) e.push('Manager reviews are due after self-assessments.');
        }
        if (f.competencies.some(c => !c.name.trim())) e.push('Every competency needs a name.');
        const total = f.competencies.reduce((n, c) => n + (Number(c.weight) || 0), 0);
        if (total !== 100) e.push(`Competency weights add up to ${total}%. Make them total 100%.`);
        return e;
    }

    // ---------- Actions ----------

    const findA = el => Store.get('appraisals', el.dataset.id);
    const allRated = (cycle, ratings) => cycle.competencies.every(c => ratings[c.id]);

    Object.assign(A.actions, {
        rate: el => {
            const f = A.state.ui.form;
            f[el.dataset.group][el.dataset.key] = +el.dataset.v;
            A.state.ui.dirty = true;
            A.render();
        },
        'cycle-pick': el => { A.state.ui.cycleId = el.value; A.render(); },
        'self-save': el => {
            const a = findA(el);
            const f = A.state.ui.form;
            A.state.ui.dirty = false;
            A.save('appraisals', { ...a, self: { ratings: f.ratings, comment: f.comment, submittedAt: null } }, 'Saved. You can finish later.');
        },
        'self-submit': el => {
            const a = findA(el);
            const f = A.state.ui.form;
            A.state.errors = allRated(cycleOf(a), f.ratings) ? [] : ['Rate yourself on every competency.'];
            if (A.state.errors.length) { A.render(); return; }
            A.state.ui.dirty = false;
            A.save('appraisals', { ...a, stage: 'review', self: { ratings: f.ratings, comment: f.comment, submittedAt: Date.now() } }, `Sent to ${A.nameOf(a.managerId)}`);
            A.go('reviews', {}, { tab: 'reviews' });
        },
        'review-save': el => {
            const a = findA(el);
            const f = A.state.ui.form;
            A.state.ui.dirty = false;
            A.save('appraisals', { ...a, review: { ratings: f.ratings, goalRatings: f.goalRatings, comment: f.comment, strengths: f.strengths, improvements: f.improvements, submittedAt: null } }, 'Saved. You can finish later.');
        },
        'review-submit': el => {
            const a = findA(el);
            const f = A.state.ui.form;
            const cycle = cycleOf(a);
            const errors = [];
            if (!allRated(cycle, f.ratings)) errors.push('Rate every competency.');
            if (goalsOf(a.uid, a.cycleId).some(g => !f.goalRatings[g.id])) errors.push('Rate every goal.');
            if (!f.comment.trim()) errors.push('Write an overall comment.');
            A.state.errors = errors;
            if (errors.length) { A.render(); return; }
            A.state.ui.dirty = false;
            A.save('appraisals', { ...a, stage: 'ack', review: { ratings: f.ratings, goalRatings: f.goalRatings, comment: f.comment, strengths: f.strengths, improvements: f.improvements, submittedAt: Date.now() } },
                `Sent to ${A.nameOf(a.uid)} for sign-off`);
            A.go('reviews', {}, { tab: A.state.tab });
        },
        'ack-submit': el => {
            const a = findA(el);
            A.save('appraisals', { ...a, stage: 'done', ack: { at: Date.now(), comment: ((A.state.ui.form || {}).ack || '').trim() } }, 'Signed off');
            A.go('reviews', {}, { tab: 'reviews' });
        },

        'cycle-new': () => {
            const y = new Date().getFullYear();
            const t = (m, d) => new Date(y, m - 1, d, 17).getTime();
            A.state.ui = { cycle: { id: Store.uid(), name: `${y} Annual Review`, periodStart: t(1, 1), periodEnd: t(12, 31), selfDue: t(11, 15), managerDue: t(11, 30), goalsWeight: 40, status: 'draft',
                competencies: DEFAULT_COMPETENCIES.map(c => ({ ...c, id: Store.uid() })) } };
            A.go('cycle-edit', {}, { keepUi: true });
        },
        'cycle-edit': el => { A.state.ui = { cycle: JSON.parse(JSON.stringify(Store.get('cycles', el.dataset.id))) }; A.go('cycle-edit', {}, { keepUi: true }); },
        'comp-add': () => { A.state.ui.cycle.competencies.push({ id: Store.uid(), name: '', desc: '', weight: 0 }); A.render(); },
        'comp-del': el => { A.state.ui.cycle.competencies.splice(+el.dataset.i, 1); A.render(); },
        'cycle-save': () => {
            const f = A.state.ui.cycle;
            f.competencies.forEach(c => { c.weight = Number(c.weight) || 0; });
            A.state.errors = validateCycle(f);
            if (A.state.errors.length) { A.render(); return; }
            A.save('cycles', f, 'Cycle saved');
            A.go('cycle', { id: f.id });
        },
        'cycle-launch': el => {
            const c = Store.get('cycles', el.dataset.id);
            const people = Store.all('users').filter(p => p.active !== false && p.role !== 'admin' && p.managerId);
            let added = 0;
            people.forEach(p => {
                const id = `${c.id}_${p.id}`;
                if (Store.get('appraisals', id)) return;
                added++;
                A.save('appraisals', { id, cycleId: c.id, uid: p.id, managerId: p.managerId, deptId: p.deptId || null, stage: 'self' });
            });
            if (c.status === 'draft') A.save('cycles', { ...c, status: 'active', launchedAt: Date.now() });
            A.toast(`Started reviews for ${added} ${added === 1 ? 'person' : 'people'}`);
            A.render();
        },
        'cycle-close': el => {
            if (!A.state.ui.confirmClose) { A.state.ui.confirmClose = true; A.render(); return; }
            A.state.ui.confirmClose = false;
            A.save('cycles', { ...Store.get('cycles', el.dataset.id), status: 'closed', closedAt: Date.now() }, 'Cycle closed');
        },
        'cycle-delete': el => {
            if (!A.state.ui.confirmDelete) { A.state.ui.confirmDelete = true; A.render(); return; }
            Store.remove('cycles', el.dataset.id).catch(() => A.toast('Couldn\'t delete. Check your connection.'));
            A.go('reviews', {}, { tab: 'reviews' });
        },
    });

    A.bindReview = t => {
        if (t.dataset.form) { A.state.ui.form = A.state.ui.form || {}; A.state.ui.form[t.dataset.form] = t.value; A.state.ui.dirty = true; return true; }
        const f = A.state.ui.cycle;
        if (f && t.dataset.cycle) {
            const k = t.dataset.cycle;
            f[k] = t.dataset.date !== undefined ? A.fromDateInput(t.value) : t.dataset.num !== undefined ? Math.max(0, Math.min(100, parseInt(t.value, 10) || 0)) : t.value;
            return true;
        }
        if (f && t.dataset.comp !== undefined) {
            const c = f.competencies[+t.dataset.comp];
            c[t.dataset.field] = t.dataset.field === 'weight' ? parseInt(t.value, 10) || 0 : t.value;
            return true;
        }
        return false;
    };
})();
