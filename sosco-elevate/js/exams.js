// Exams: managers build timed exams and see results; employees take them.
(() => {
    'use strict';
    const A = App;
    const { esc, ICON, pct, fmtDate, fmtSecs, fmtLeft } = A;
    const LETTERS = 'ABCDEF';
    let timerId = null;

    const attemptOf = (examId, uid) => Store.get('attempts', `${examId}_${uid}`);
    const keyOf = examId => Store.get('examKeys', examId);

    function scorePill(exam, a) {
        if (a.score == null) return A.pill('Marking', 'grey');
        const p = pct(a.score, a.total);
        return A.pill(`${a.score}/${a.total} · ${p}%`, p >= exam.passMark ? 'green' : 'red');
    }

    // ---------- Lists ----------

    function myExamRows(list, now) {
        const u = A.me();
        return list.map(e => {
            const a = attemptOf(e.id, u.id);
            const st = A.examState(e, a, now);
            if (st === 'done') {
                return `<button class="row" data-action="go" data-view="exam-score" data-id="${e.id}"><span class="grow"><span class="title">${esc(e.title)}</span>
                    <span class="sub">Submitted ${fmtDate(a.submittedAt)}</span></span>${scorePill(e, a)}${ICON.chevron}</button>`;
            }
            if (st === 'missed') {
                return `<div class="row"><span class="grow"><span class="title">${esc(e.title)}</span><span class="sub">Closed ${fmtDate(e.dueAt)}</span></span>${A.pill('Missed', 'red')}</div>`;
            }
            const sub = st === 'upcoming' ? `Opens ${fmtDate(e.opensAt)}` : `Due in ${fmtLeft(e.dueAt - now)} · ${fmtDate(e.dueAt)}`;
            const p = st === 'progress' ? A.pill('In progress', 'orange') : st === 'upcoming' ? A.pill('Soon') : A.pill('New', 'blue');
            return `<button class="row" data-action="go" data-view="exam-intro" data-id="${e.id}"><span class="grow"><span class="title">${esc(e.title)}</span>
                <span class="sub">${sub}</span></span>${p}${ICON.chevron}</button>`;
        }).join('');
    }

    function assignedToMe() {
        const u = A.me();
        return Store.all('exams').filter(e => e.status === 'sent' && e.assignedTo.includes(u.id));
    }

    A.views.exams = () => {
        const u = A.me();
        const now = Date.now();
        const mine = assignedToMe().sort((a, b) => a.dueAt - b.dueAt);
        const todo = mine.filter(e => ['open', 'progress', 'upcoming'].includes(A.examState(e, attemptOf(e.id, u.id), now)));
        const rest = mine.filter(e => !todo.includes(e)).reverse();

        const takerSections = `
            <div class="section-label">To do</div>
            <div class="group">${myExamRows(todo, now) || '<div class="row empty">Nothing to do. New exams will show up here.</div>'}</div>
            ${rest.length ? `<div class="section-label">Completed</div><div class="group">${myExamRows(rest, now)}</div>` : ''}`;

        if (!A.isManager()) {
            return `<div class="screen">${A.nav()}<h1 class="large-title">Exams</h1>${takerSections}</div>`;
        }

        const exams = Store.all('exams')
            .filter(e => u.role === 'admin' || e.createdBy === u.id)
            .sort((a, b) => b.createdAt - a.createdAt);
        const sent = exams.filter(e => e.status === 'sent');
        const drafts = exams.filter(e => e.status === 'draft');

        const sentRows = sent.map(e => {
            const done = e.assignedTo.filter(id => A.examState(e, attemptOf(e.id, id), now) === 'done').length;
            const when = now > e.dueAt ? `Closed ${fmtDate(e.dueAt)}` : `Due ${fmtDate(e.dueAt)}`;
            const by = u.role === 'admin' && e.createdBy !== u.id ? ` · ${esc(A.nameOf(e.createdBy))}` : '';
            return `<button class="row" data-action="go" data-view="exam-results" data-id="${e.id}">
                <span class="grow"><span class="title">${esc(e.title)}</span><span class="sub">${e.questions.length} questions · ${when}${by}</span></span>
                ${A.pill(`${done}/${e.assignedTo.length} done`, done === e.assignedTo.length ? 'green' : 'grey')}${ICON.chevron}</button>`;
        }).join('');
        const draftRows = drafts.map(e => `<button class="row" data-action="exam-edit" data-id="${e.id}">
                <span class="grow"><span class="title">${esc(e.title) || 'Untitled exam'}</span><span class="sub">${e.questions.length} questions · Not sent</span></span>
                ${A.pill('Draft')}${ICON.chevron}</button>`).join('');

        return `<div class="screen">
            ${A.nav()}
            <h1 class="large-title">Exams</h1>
            <button class="btn btn-primary" data-action="exam-new">${ICON.plus} New Exam</button>
            <div class="section-label">Sent</div>
            <div class="group">${sentRows || '<div class="row empty">No exams sent yet. Tap New Exam to write one.</div>'}</div>
            ${drafts.length ? `<div class="section-label">Drafts</div><div class="group">${draftRows}</div>` : ''}
            ${mine.length ? `<div class="section-label section-gap">Assigned to you</div>${takerSections.replace('<div class="section-label">To do</div>', '')}` : ''}
        </div>`;
    };

    // ---------- Builder ----------

    const TF_AR = ['صحيح', 'خطأ'];

    function newQuestion(type) {
        return type === 'tf'
            ? { id: Store.uid(), type: 'tf', text: '', text_ar: '', options: ['True', 'False'], options_ar: TF_AR.slice(), correct: 0, seconds: 20 }
            : { id: Store.uid(), type: 'mcq', text: '', text_ar: '', options: ['', '', '', ''], options_ar: ['', '', '', ''], correct: 0, seconds: 30 };
    }

    const hasArabic = q => !!(q.text_ar && q.text_ar.trim());
    const needsArabic = q => q.text.trim() && (!hasArabic(q) || q.options.some((o, j) => o.trim() && !(q.options_ar && (q.options_ar[j] || '').trim())));
    const ar = text => (text && text.trim() ? `<span class="ar" dir="rtl" lang="ar">${esc(text)}</span>` : '');

    function newDraft() {
        const now = Date.now();
        const due = new Date(now + 2 * A.DAY);
        due.setMinutes(0, 0, 0);
        return {
            id: Store.uid(), title: '', description: '', passMark: 70, opensAt: now, dueAt: due.getTime(),
            assignedTo: [], status: 'draft', createdBy: A.me().id, createdAt: now, questions: [newQuestion('mcq')],
        };
    }

    function validate(d) {
        const errors = [];
        if (!d.title.trim()) errors.push('Give the exam a title.');
        if (!d.assignedTo.length) errors.push('Choose at least one person.');
        if (!d.opensAt || !d.dueAt) errors.push('Set when the exam opens and when it is due.');
        else if (d.dueAt <= d.opensAt) errors.push('The due time must be after the opening time.');
        else if (d.dueAt <= Date.now()) errors.push('The due time is in the past. Pick a later time.');
        if (!d.questions.length) errors.push('Add at least one question.');
        d.questions.forEach((q, i) => {
            if (!q.text.trim()) errors.push(`Question ${i + 1} has no text.`);
            if (q.type === 'mcq' && (q.options.length < 2 || q.options.some(o => !o.trim()))) errors.push(`Question ${i + 1}: fill in every answer, at least two.`);
        });
        return errors;
    }

    function saveDraft(d, status) {
        const { questions, ...rest } = d;
        const exam = { ...rest, status, questions: questions.map(({ correct, ...q }) => q) };
        if (status === 'sent') exam.sentAt = Date.now();
        return Promise.all([
            A.save('exams', exam),
            A.save('examKeys', { id: d.id, createdBy: d.createdBy, answers: questions.map(q => q.correct) }),
        ]);
    }

    A.views['exam-edit'] = () => {
        const d = A.state.ui.draft;
        if (!d) { A.go('exams'); return null; }
        const totalSecs = d.questions.reduce((n, q) => n + q.seconds, 0);
        const people = A.team();

        const peopleRows = people.map(p => `<label class="row">
                <input type="checkbox" class="check" data-assign="${p.id}" ${d.assignedTo.includes(p.id) ? 'checked' : ''}>
                <span class="grow"><span class="title">${esc(p.name)}</span><span class="sub">${esc(p.jobTitle || '')} · ${esc((A.dept(p.deptId) || {}).code || '')}</span></span></label>`).join('');

        const showAr = A.state.ui.showAr !== false;
        const questions = d.questions.map((q, i) => {
            const oar = q.options_ar || [];
            const answers = q.type === 'tf'
                ? q.options.map((o, j) => `<button type="button" class="row opt" data-action="q-correct" data-q="${i}" data-opt="${j}">
                        <span class="mark ${q.correct === j ? 'on' : ''}">${ICON.check}</span><span class="grow">${o}${showAr ? ` · ${ar(TF_AR[j])}` : ''}</span></button>`).join('')
                : q.options.map((o, j) => `<div class="row opt">
                        <button type="button" class="mark ${q.correct === j ? 'on' : ''}" data-action="q-correct" data-q="${i}" data-opt="${j}" aria-label="Mark answer ${LETTERS[j]} as correct">${ICON.check}</button>
                        <div class="opt-texts">
                            <input class="input-plain" id="q-${q.id}-${j}" data-q="${i}" data-opt="${j}" value="${esc(o)}" placeholder="Answer ${LETTERS[j]}">
                            ${showAr ? `<input class="input-plain input-ar" dir="rtl" lang="ar" id="q-${q.id}-${j}-ar" data-q="${i}" data-opt-ar="${j}" value="${esc(oar[j] || '')}" placeholder="الإجابة بالعربية">` : ''}
                        </div>
                        ${q.options.length > 2 ? `<button type="button" class="icon-btn" data-action="q-delopt" data-q="${i}" data-opt="${j}" aria-label="Remove answer ${LETTERS[j]}">${ICON.cross}</button>` : ''}
                    </div>`).join('') + (q.options.length < 6 ? `<button type="button" class="row add-row" data-action="q-addopt" data-q="${i}">${ICON.plus} Add answer</button>` : '');

            return `<div class="q-card">
                <div class="q-head"><span class="q-num">Question ${i + 1}</span>
                    ${d.questions.length > 1 ? `<button type="button" class="link-danger" data-action="q-del" data-q="${i}">Delete</button>` : ''}</div>
                <div class="seg" role="group" aria-label="Question type">
                    <button type="button" class="${q.type === 'mcq' ? 'on' : ''}" data-action="q-type" data-q="${i}" data-type="mcq">Multiple choice</button>
                    <button type="button" class="${q.type === 'tf' ? 'on' : ''}" data-action="q-type" data-q="${i}" data-type="tf">True / False</button>
                </div>
                <textarea class="q-text-input" id="q-${q.id}" data-q="${i}" data-qfield="text" rows="2" placeholder="Type the question">${esc(q.text)}</textarea>
                ${showAr ? `<textarea class="q-text-input input-ar" dir="rtl" lang="ar" id="q-${q.id}-ar" data-q="${i}" data-qfield="text_ar" rows="2" placeholder="السؤال بالعربية">${esc(q.text_ar || '')}</textarea>` : ''}
                <div class="hint">Tap the circle next to the correct answer.</div>
                <div class="group inset">${answers}</div>
                <div class="timer-row"><span>Time for this question</span>
                    <div class="stepper">
                        <button type="button" data-action="q-step" data-q="${i}" data-d="-5" aria-label="Less time">${ICON.minus}</button>
                        <b>${fmtSecs(q.seconds)}</b>
                        <button type="button" data-action="q-step" data-q="${i}" data-d="5" aria-label="More time">${ICON.plus}</button>
                    </div></div>
            </div>`;
        }).join('');

        const saved = Store.get('exams', d.id);
        return `<div class="screen">
            ${A.nav('Exams', 'data-action="tab" data-tab="exams"')}
            <h1 class="large-title">${saved ? 'Edit Draft' : 'New Exam'}</h1>

            <div class="section-label">Details</div>
            <div class="group">
                <div class="row"><input class="input-plain" id="exam-title" data-draft="title" value="${esc(d.title)}" placeholder="Title, e.g. Well Control Basics"></div>
                <div class="row"><textarea class="input-plain" id="exam-desc" data-draft="description" rows="2" placeholder="Note for employees (optional)">${esc(d.description)}</textarea></div>
                <label class="row"><span class="grow">Pass mark</span><input class="input-plain num" id="exam-pass" type="number" min="1" max="100" data-draft="passMark" data-num value="${d.passMark}"><span class="unit">%</span></label>
            </div>

            <div class="section-label">Time window</div>
            <div class="group">
                <label class="row"><span class="grow">Opens</span><input class="input-plain date" id="exam-opens" type="datetime-local" data-draft="opensAt" data-time value="${A.toInput(d.opensAt)}"></label>
                <label class="row"><span class="grow">Due</span><input class="input-plain date" id="exam-due" type="datetime-local" data-draft="dueAt" data-time value="${A.toInput(d.dueAt)}"></label>
            </div>
            <p class="section-foot">People can only start the exam between these times. Unfinished exams are submitted at the due time.</p>

            <div class="section-label section-label-split"><span>Send to</span>${people.length ? `<button type="button" class="link" data-action="exam-allpeople">${d.assignedTo.length === people.length ? 'Clear all' : 'Select all'}</button>` : ''}</div>
            <div class="group">${peopleRows || '<div class="row empty">No one reports to you yet. An admin can add people to your team.</div>'}</div>

            <div class="section-label">Questions · ${d.questions.length} · ${fmtSecs(totalSecs)} in total</div>
            <div class="ai-bar">
                <button type="button" class="btn btn-ai" data-action="ai-open">${ICON.sparkle} Write Questions with Claude</button>
                <div class="btn-row even">
                    <button type="button" class="btn btn-secondary" data-action="ai-translate" ${A.state.ui.translating ? 'disabled' : ''}>${A.state.ui.translating ? 'Translating…' : 'Translate to Arabic'}</button>
                    <button type="button" class="btn btn-plain" data-action="ar-toggle">${showAr ? 'Hide Arabic' : 'Show Arabic'}</button>
                </div>
                ${d.questions.some(needsArabic) ? `<p class="section-foot">${d.questions.filter(needsArabic).length} of ${d.questions.length} questions still need Arabic. Employees see Arabic under each question and answer.</p>` : ''}
            </div>
            ${questions}
            <button type="button" class="btn btn-secondary" data-action="q-add">${ICON.plus} Add Question</button>

            ${A.state.errors.length ? `<div class="errors" role="alert"><b>Before sending:</b><ul>${A.state.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}

            <div class="actions">
                <button type="button" class="btn btn-primary" data-action="exam-send">Send to ${d.assignedTo.length || ''} ${d.assignedTo.length === 1 ? 'Person' : 'People'}</button>
                <button type="button" class="btn btn-plain" data-action="exam-savedraft">Save as Draft</button>
                ${saved ? `<button type="button" class="btn btn-plain danger" data-action="exam-delete" data-id="${d.id}">${A.state.ui.confirmDelete ? 'Tap again to delete this draft' : 'Delete Draft'}</button>` : ''}
            </div>
        </div>`;
    };

    // ---------- Results ----------

    A.views['exam-results'] = ({ id }) => {
        const e = Store.get('exams', id);
        if (!e) { A.go('exams', {}, { tab: 'exams' }); return null; }
        const key = keyOf(e.id);
        const now = Date.now();
        const rows = e.assignedTo.map(uid => ({ person: A.user(uid) || { id: uid, name: 'Removed user' }, a: attemptOf(e.id, uid) }))
            .map(r => ({ ...r, st: A.examState(e, r.a, now) }));
        const marked = rows.filter(r => r.st === 'done' && r.a && r.a.score != null);
        const avg = marked.length ? Math.round(marked.reduce((n, r) => n + pct(r.a.score, r.a.total), 0) / marked.length) : null;
        const passed = marked.filter(r => pct(r.a.score, r.a.total) >= e.passMark).length;
        const submitted = rows.filter(r => r.st === 'done').length;
        const PILLS = { progress: A.pill('In progress', 'orange'), open: A.pill('Not started'), upcoming: A.pill('Not open yet'), missed: A.pill('Missed', 'red') };

        const people = rows.map(({ person, a, st }) => {
            const isDone = st === 'done';
            const open = isDone && A.state.ui.openRow === person.id;
            const head = `${A.avatar(person, 32)}<span class="grow"><span class="title">${esc(person.name)}</span>
                <span class="sub">${isDone ? `Submitted ${fmtDate(a.submittedAt)}` : esc(person.jobTitle || '')}</span></span>
                ${isDone ? scorePill(e, a) : PILLS[st]}`;
            if (!isDone) return `<div class="row">${head}</div>`;
            const detail = !open ? '' : `<div class="detail">${e.questions.map((q, i) => {
                const ans = a.answers[i] || { choice: null, ms: 0 };
                const right = key ? key.answers[i] : null;
                const ok = ans.choice === right;
                const given = ans.choice == null ? 'No answer (time ran out)' : esc(q.options[ans.choice]);
                return `<div class="d-item"><span class="d-mark ${ok ? 'ok' : 'bad'}">${ok ? ICON.check : ICON.cross}</span>
                    <div class="grow"><div class="d-q">${i + 1}. ${esc(q.text)}</div>${hasArabic(q) ? `<div class="d-a">${ar(q.text_ar)}</div>` : ''}
                    <div class="d-a">Answered: ${given} · ${Math.round(ans.ms / 1000)} s</div>
                    ${ok || right == null ? '' : `<div class="d-a">Correct: ${esc(q.options[right])}</div>`}</div></div>`;
            }).join('')}</div>`;
            return `<button class="row" data-action="exam-toggle" data-user="${person.id}" aria-expanded="${open}">${head}
                <svg class="chevron ${open ? 'down' : ''}" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg></button>${detail}`;
        }).join('');

        const perQuestion = e.questions.map((q, i) => {
            const right = key ? marked.filter(r => r.a.answers[i] && r.a.answers[i].choice === key.answers[i]).length : 0;
            return `<div class="row"><span class="grow"><span class="title clamp">${i + 1}. ${esc(q.text)}</span>
                <span class="sub">${q.type === 'tf' ? 'True / False' : 'Multiple choice'} · ${fmtSecs(q.seconds)}</span></span>
                <span class="count">${marked.length ? `${right}/${marked.length}` : '–'}</span></div>`;
        }).join('');

        return `<div class="screen">
            ${A.nav('Exams', 'data-action="tab" data-tab="exams"')}
            <h1 class="large-title">${esc(e.title)}</h1>
            <p class="lead">${now > e.dueAt ? `Closed ${fmtDate(e.dueAt)}` : `Open until ${fmtDate(e.dueAt)}`} · Pass mark ${e.passMark}%${e.createdBy !== A.me().id ? ` · by ${esc(A.nameOf(e.createdBy))}` : ''}</p>
            <div class="stats">
                <div class="stat"><b>${submitted}/${rows.length}</b><span>Submitted</span></div>
                <div class="stat"><b>${avg === null ? '–' : avg + '%'}</b><span>Average</span></div>
                <div class="stat"><b>${passed}</b><span>Passed</span></div>
            </div>
            <div class="section-label">People</div>
            <div class="group">${people}</div>
            <p class="section-foot">Tap a submitted result to see each answer.</p>
            <div class="section-label">Correct answers per question</div>
            <div class="group">${perQuestion}</div>
            <div class="actions">
                <button type="button" class="btn btn-plain danger" data-action="exam-delete" data-id="${e.id}">${A.state.ui.confirmDelete ? 'Tap again to delete exam and results' : 'Delete Exam'}</button>
            </div>
        </div>`;
    };

    // ---------- Taking an exam ----------

    A.views['exam-intro'] = ({ id }) => {
        const e = Store.get('exams', id);
        if (!e) { A.go('exams', {}, { tab: 'exams' }); return null; }
        const st = A.examState(e, attemptOf(e.id, A.me().id));
        if (st === 'done') { A.go('exam-score', { id }); return null; }
        const total = e.questions.reduce((n, q) => n + q.seconds, 0);
        const canStart = st === 'open' || st === 'progress';
        const reason = st === 'upcoming' ? `This exam opens ${fmtDate(e.opensAt)}.` : st === 'missed' ? 'This exam has closed.' : '';
        const from = A.nameOf(e.createdBy);
        return `<div class="screen">
            ${A.nav('Exams', 'data-action="tab" data-tab="exams"')}
            <h1 class="large-title">${esc(e.title)}</h1>
            ${e.description ? `<p class="lead">${esc(e.description)}</p>` : ''}
            <div class="group">
                <div class="row"><span class="grow">From</span><span class="value">${esc(from)}</span></div>
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
                <div class="row">Your score goes to ${esc(from)} when you finish.</div>
                ${e.questions.some(hasArabic) ? '<div class="row">Questions and answers are shown in English and Arabic. <span class="ar" dir="rtl" lang="ar">الأسئلة والإجابات معروضة بالإنجليزية والعربية.</span></div>' : ''}
            </div>
            <div class="actions">
                ${reason ? `<p class="section-foot">${reason}</p>` : ''}
                <button class="btn btn-primary" data-action="exam-start" data-id="${e.id}" ${canStart ? '' : 'disabled'}>${st === 'progress' ? 'Resume Exam' : 'Start Exam'}</button>
            </div>
        </div>`;
    };

    function currentRun() {
        const e = Store.get('exams', A.state.params.id);
        const a = e && attemptOf(e.id, A.me().id);
        return { e, a, q: e && a && !a.submittedAt ? e.questions[a.answers.length] : null };
    }

    A.views['exam-run'] = () => {
        const { e, a, q } = currentRun();
        if (!q) { A.go('exam-score', { id: A.state.params.id }); return null; }
        const i = a.answers.length;
        const pick = A.state.ui.pick;
        return `<div class="screen run">
            <div class="run-top">
                <div class="grow"><div class="run-count">Question ${i + 1} of ${e.questions.length}</div>
                    <div class="progress"><span style="width:${i / e.questions.length * 100}%"></span></div></div>
                <div id="timer" aria-live="off">${A.ring(64, 6, 1, 'var(--blue)', q.seconds)}</div>
            </div>
            <div class="q-type-row"><span class="q-type">${q.type === 'tf' ? 'True or false' : 'Choose one answer'}</span>
                ${hasArabic(q) ? `<button class="lang-toggle ${showArabic() ? 'on' : ''}" data-action="ar-run-toggle" aria-pressed="${showArabic()}">العربية</button>` : ''}</div>
            <h2 class="q-text">${esc(q.text)}</h2>
            ${showArabic() && hasArabic(q) ? `<p class="q-text-ar" dir="rtl" lang="ar">${esc(q.text_ar)}</p>` : ''}
            <div class="choices">
                ${q.options.map((o, j) => `<button class="choice ${pick === j ? 'on' : ''}" data-action="exam-pick" data-opt="${j}" aria-pressed="${pick === j}">
                    <span class="letter">${q.type === 'tf' ? (j === 0 ? 'T' : 'F') : LETTERS[j]}</span>
                    <span class="grow"><span class="choice-en">${esc(o)}</span>${showArabic() && hasArabic(q) ? ar((q.options_ar || [])[j]) : ''}</span></button>`).join('')}
            </div>
            <div class="actions"><button class="btn btn-primary" data-action="exam-next" ${pick == null ? 'disabled' : ''}>${i === e.questions.length - 1 ? 'Submit' : 'Next'}</button></div>
        </div>`;
    };

    function showArabic() {
        try { return localStorage.getItem('sosco.showArabic') !== '0'; } catch (e) { return true; }
    }

    function advance(choice) {
        const { e, a, q } = currentRun();
        if (!q) return;
        const now = Date.now();
        const answers = [...a.answers, { choice, ms: Math.min(now - a.qStartedAt, q.seconds * 1000) }];
        const next = { ...a, answers, qStartedAt: now };
        if (answers.length === e.questions.length) next.submittedAt = now;
        A.state.ui.pick = null;
        A.save('attempts', next);
        if (next.submittedAt) A.go('exam-score', { id: e.id });
        else A.render();
    }

    function tick() {
        const { e, a, q } = currentRun();
        if (!q) return;
        const now = Date.now();
        if (now > e.dueAt) {
            const answers = a.answers.slice();
            while (answers.length < e.questions.length) answers.push({ choice: null, ms: 0 });
            A.save('attempts', { ...a, answers, submittedAt: e.dueAt });
            A.toast('The exam has closed. Your answers so far were submitted.');
            A.go('exam-score', { id: e.id });
            return;
        }
        const left = q.seconds * 1000 - (now - a.qStartedAt);
        if (left <= 0) {
            if (A.state.ui.pick == null) A.toast('Time is up for that question.');
            advance(A.state.ui.pick == null ? null : A.state.ui.pick);
            return;
        }
        const secs = Math.ceil(left / 1000);
        const color = secs <= 5 ? 'var(--red)' : secs <= 10 ? 'var(--orange)' : 'var(--blue)';
        const box = document.getElementById('timer');
        if (box) box.innerHTML = A.ring(64, 6, left / (q.seconds * 1000), color, secs);
    }

    A.afterRender.push(view => {
        clearInterval(timerId);
        if (view === 'exam-run') { tick(); timerId = setInterval(tick, 250); }
    });

    A.views['exam-score'] = ({ id }) => {
        const e = Store.get('exams', id);
        const a = e && attemptOf(e.id, A.me().id);
        if (!a || !a.submittedAt) { A.go('exams', {}, { tab: 'exams' }); return null; }
        const from = A.nameOf(e.createdBy);
        const back = A.nav('Exams', 'data-action="tab" data-tab="exams"');
        if (a.score == null) {
            return `<div class="screen">${back}
                <div class="score-hero">${A.ring(180, 14, 1, 'var(--track)', `<b class="ring-icon">${ICON.check}</b>`)}
                <h1 class="large-title">Submitted</h1>
                <p class="lead">${esc(e.title)}</p></div>
                <div class="group"><div class="row"><span class="grow">Submitted</span><span class="value">${fmtDate(a.submittedAt)}</span></div>
                <div class="row"><span class="grow">Sent to</span><span class="value">${esc(from)}</span></div></div>
                <p class="section-foot">Your score shows here as soon as ${esc(from)}'s app marks it.</p></div>`;
        }
        const p = pct(a.score, a.total);
        const pass = p >= e.passMark;
        return `<div class="screen">${back}
            <div class="score-hero">
                ${A.ring(180, 14, p / 100, pass ? 'var(--green)' : 'var(--red)', `<b>${p}%</b><span>${a.score} of ${a.total} correct</span>`)}
                <h1 class="large-title">${pass ? 'Passed' : 'Not passed'}</h1>
                <p class="lead">${esc(e.title)} · pass mark ${e.passMark}%</p>
            </div>
            <div class="group">
                <div class="row"><span class="grow">Submitted</span><span class="value">${fmtDate(a.submittedAt)}</span></div>
                <div class="row"><span class="grow">Sent to</span><span class="value">${esc(from)}</span></div>
            </div>
        </div>`;
    };

    // ---------- Actions ----------

    const draft = () => A.state.ui.draft;
    const q = el => draft().questions[+el.dataset.q];

    Object.assign(A.actions, {
        'exam-new': () => { A.state.ui = { draft: newDraft() }; A.go('exam-edit', {}, { keepUi: true }); },
        'exam-edit': el => {
            const e = Store.get('exams', el.dataset.id);
            const key = keyOf(e.id) || { answers: [] };
            A.state.ui = { draft: { ...JSON.parse(JSON.stringify(e)), questions: e.questions.map((x, i) => ({ ...x, correct: key.answers[i] || 0 })) } };
            A.go('exam-edit', {}, { keepUi: true });
        },
        'exam-toggle': el => { A.state.ui.openRow = A.state.ui.openRow === el.dataset.user ? null : el.dataset.user; A.render(); },
        'q-add': () => { draft().questions.push(newQuestion(draft().questions.at(-1)?.type || 'mcq')); A.render(); },
        'q-del': el => { draft().questions.splice(+el.dataset.q, 1); A.render(); },
        'q-type': el => {
            const x = q(el);
            if (x.type !== el.dataset.type) Object.assign(x, newQuestion(el.dataset.type), { id: x.id, text: x.text, text_ar: x.text_ar || '' });
            A.render();
        },
        'q-correct': el => { q(el).correct = +el.dataset.opt; A.render(); },
        'q-addopt': el => { const x = q(el); x.options.push(''); x.options_ar = [...(x.options_ar || []), '']; A.render(); },
        'q-delopt': el => {
            const x = q(el);
            const j = +el.dataset.opt;
            x.options.splice(j, 1);
            if (x.options_ar) x.options_ar.splice(j, 1);
            if (x.correct === j) x.correct = 0; else if (x.correct > j) x.correct--;
            A.render();
        },
        'q-step': el => { const x = q(el); x.seconds = Math.max(5, Math.min(600, x.seconds + +el.dataset.d)); A.render(); },
        'exam-allpeople': () => {
            const all = A.team().map(p => p.id);
            draft().assignedTo = draft().assignedTo.length === all.length ? [] : all;
            A.render();
        },
        'exam-savedraft': () => { saveDraft(draft(), 'draft'); A.toast('Draft saved'); A.go('exams', {}, { tab: 'exams' }); },
        'exam-send': () => {
            const d = draft();
            A.state.errors = validate(d);
            if (A.state.errors.length) {
                A.render();
                document.querySelector('.errors').scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            saveDraft(d, 'sent');
            A.toast(`Sent to ${d.assignedTo.length} ${d.assignedTo.length === 1 ? 'person' : 'people'}`);
            A.go('exam-results', { id: d.id });
        },
        'exam-delete': el => {
            if (!A.state.ui.confirmDelete) { A.state.ui.confirmDelete = true; A.render(); return; }
            const id = el.dataset.id;
            Store.all('attempts').filter(a => a.examId === id).forEach(a => Store.remove('attempts', a.id).catch(() => {}));
            Store.remove('examKeys', id).catch(() => {});
            Store.remove('exams', id).catch(() => A.toast('Couldn\'t delete. Check your connection.'));
            A.toast('Deleted');
            A.go('exams', {}, { tab: 'exams' });
        },
        'exam-start': el => {
            const e = Store.get('exams', el.dataset.id);
            const u = A.me();
            const st = A.examState(e, attemptOf(e.id, u.id));
            if (st !== 'open' && st !== 'progress') { A.render(); return; }
            if (st === 'open') {
                const now = Date.now();
                A.save('attempts', { id: `${e.id}_${u.id}`, examId: e.id, uid: u.id, managerId: e.createdBy, startedAt: now, qStartedAt: now, answers: [] });
            }
            A.go('exam-run', { id: e.id, fullscreen: true });
        },
        'exam-pick': el => { A.state.ui.pick = +el.dataset.opt; A.render(); },
        'exam-next': () => { if (A.state.ui.pick != null) advance(A.state.ui.pick); },
    });

    // Builder fields: draft.title etc., question text and answers.
    A.bindDraft = (t) => {
        const d = draft();
        if (!d) return false;
        if (t.dataset.opt !== undefined && t.dataset.q !== undefined && t.tagName === 'INPUT') { d.questions[+t.dataset.q].options[+t.dataset.opt] = t.value; return true; }
        if (t.dataset.optAr !== undefined) {
            const x = d.questions[+t.dataset.q];
            x.options_ar = x.options_ar || x.options.map(() => '');
            x.options_ar[+t.dataset.optAr] = t.value;
            return true;
        }
        if (t.dataset.qfield) { d.questions[+t.dataset.q][t.dataset.qfield] = t.value; return true; }
        if (t.dataset.draft) {
            d[t.dataset.draft] = t.dataset.time !== undefined ? A.fromInput(t.value)
                : t.dataset.num !== undefined ? Math.max(1, Math.min(100, parseInt(t.value, 10) || 70)) : t.value;
            return true;
        }
        if (t.dataset.assign) {
            d.assignedTo = d.assignedTo.filter(x => x !== t.dataset.assign);
            if (t.checked) d.assignedTo.push(t.dataset.assign);
            A.render();
            return true;
        }
        return false;
    };
})();
