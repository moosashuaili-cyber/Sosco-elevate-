// Claude in the exam builder: a chat that proposes questions (with Arabic), and Arabic translation.
(() => {
    'use strict';
    const A = App;
    const { esc, ICON, fmtSecs } = A;
    const LETTERS = 'ABCDEF';

    const draft = () => A.state.ui.draft;
    const chat = () => A.state.ui.chat || (A.state.ui.chat = { messages: [], turns: [], input: '', busy: false, error: '' });
    const ar = text => (text && text.trim() ? `<span class="ar" dir="rtl" lang="ar">${esc(text)}</span>` : '');

    const SUGGESTIONS = [
        '5 multiple-choice questions on H2S safety for wellhead technicians',
        '6 true/false questions on the permit to work system',
        'Questions on pressure control equipment checks before coiled tubing rig-up',
        'Basic lifting and rigging safety, easy level, for new starters',
    ];

    // ---------- Chat screen ----------

    function proposalCard(q, t, k) {
        const added = t.added && t.added[k];
        return `<div class="proposal">
            <div class="proposal-head"><span class="pill pill-grey">${q.type === 'tf' ? 'True / False' : 'Multiple choice'} · ${fmtSecs(q.seconds)}</span>
                <button class="btn-chip ${added ? 'done' : ''}" data-action="ai-add" data-turn="${A.state.ui.chat.turns.indexOf(t)}" data-k="${k}" ${added ? 'disabled' : ''}>${added ? `${ICON.check} Added` : `${ICON.plus} Add`}</button></div>
            <div class="proposal-q">${esc(q.text)}</div>${q.text_ar ? `<div class="proposal-q">${ar(q.text_ar)}</div>` : ''}
            <ol class="proposal-opts">${q.options.map((o, j) => `<li class="${j === q.correct ? 'right' : ''}"><span class="letter">${q.type === 'tf' ? (j ? 'F' : 'T') : LETTERS[j]}</span>
                <span class="grow">${esc(o)}${q.options_ar[j] ? ` ${ar(q.options_ar[j])}` : ''}</span>${j === q.correct ? ICON.check : ''}</li>`).join('')}</ol>
            ${q.explanation ? `<div class="proposal-why">${esc(q.explanation)}</div>` : ''}
        </div>`;
    }

    A.views['exam-ai'] = () => {
        const d = draft();
        if (!d) { A.go('exams', {}, { tab: 'exams' }); return null; }
        if (AI.mode() === 'none') { A.go('ai-setup', { fullscreen: false }, { keepUi: true }); return null; }
        const c = chat();
        const turns = c.turns.map(t => {
            if (t.role === 'user') return `<div class="bubble me">${esc(t.text)}</div>`;
            const remaining = t.questions.filter((q, k) => !(t.added && t.added[k])).length;
            return `<div class="bubble claude">${t.text ? `<p>${esc(t.text).replace(/\n/g, '<br>')}</p>` : ''}
                ${t.questions.length ? `<div class="proposals">${t.questions.map((q, k) => proposalCard(q, t, k)).join('')}</div>
                ${remaining > 1 ? `<button class="btn btn-secondary small" data-action="ai-add-all" data-turn="${c.turns.indexOf(t)}">${ICON.plus} Add All ${remaining}</button>` : ''}` : ''}</div>`;
        }).join('');

        const empty = !c.turns.length ? `<div class="chat-empty">
            <span class="icon-tile tile-ai big">${ICON.sparkle}</span>
            <h2 class="title-2">Write questions with Claude</h2>
            <p class="lead">Describe the topic and who the exam is for. Claude suggests questions in English and Arabic, and you choose which to add. Check every question before you send the exam.</p>
            <div class="chips">${SUGGESTIONS.map(s => `<button class="chip" data-action="ai-suggest" data-text="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        </div>` : '';

        return `<div class="screen chat-screen">
            ${A.nav(d.title.trim() || 'Exam', 'data-action="ai-close"', c.turns.length ? '<button class="nav-btn" data-action="ai-reset">New Chat</button>' : '')}
            ${c.turns.length ? '<h1 class="large-title compact">Claude</h1>' : ''}
            ${empty}
            <div class="chat-log" aria-live="polite">${turns}
                ${c.busy ? '<div class="bubble claude typing"><span></span><span></span><span></span><span class="sr-only">Claude is writing</span></div>' : ''}
                ${c.error ? `<div class="errors" role="alert">${esc(c.error)}</div>` : ''}
            </div>
            <form class="composer" id="aiForm">
                <textarea id="ai-input" data-ai-input rows="1" placeholder="Ask Claude for questions…" aria-label="Message to Claude" ${c.busy ? 'disabled' : ''}>${esc(c.input)}</textarea>
                <button type="submit" class="send" aria-label="Send" ${c.busy ? 'disabled' : ''}>${ICON.send}</button>
            </form>
        </div>`;
    };

    async function send(text) {
        const c = chat();
        text = text.trim();
        if (!text || c.busy) return;
        // Claude's last turn may have proposed questions; the API expects a result for each proposal.
        const last = c.messages[c.messages.length - 1];
        const pending = last && last.role === 'assistant' && Array.isArray(last.content)
            ? last.content.filter(b => b.type === 'tool_use').map(b => ({ type: 'tool_result', tool_use_id: b.id, content: 'Shown to the manager, who chooses which questions to add.' })) : [];
        const userMsg = { role: 'user', content: pending.length ? [...pending, { type: 'text', text }] : text };
        c.messages.push(userMsg);
        c.turns.push({ role: 'user', text });
        Object.assign(c, { input: '', busy: true, error: '' });
        A.render();
        scrollChat();
        const d = draft();
        try {
            const result = await AI.run('chat', { messages: c.messages, exam: { title: d.title, questions: d.questions.map(q => q.text).filter(t => t.trim()) } });
            if (result.refused || !result.content || !result.content.length) {
                c.messages.pop();
                c.turns.push({ role: 'claude', text: result.text || 'Claude didn\'t reply. Try again.', questions: [] });
            } else {
                c.messages.push({ role: 'assistant', content: result.content });
                c.turns.push({ role: 'claude', text: result.text, questions: result.questions || [], added: {} });
            }
        } catch (e) {
            c.messages.pop();
            c.turns.pop();
            Object.assign(c, { input: text, error: e.message });
        }
        c.busy = false;
        if (A.state.view === 'exam-ai') { A.render(); scrollChat(); }
    }

    function scrollChat() {
        requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    }

    function addQuestion(q) {
        const d = draft();
        const fresh = d.questions.length === 1 && !d.questions[0].text.trim() && d.questions[0].options.every(o => !o.trim());
        const question = { id: Store.uid(), type: q.type, text: q.text, text_ar: q.text_ar, options: q.options.slice(), options_ar: q.options_ar.slice(), correct: q.correct, seconds: q.seconds };
        if (fresh) d.questions = [question]; else d.questions.push(question);
    }

    // ---------- Setup (demo mode: key on this device) ----------

    A.views['ai-setup'] = () => {
        const key = AI.deviceKey();
        return `<div class="screen">${A.nav('Exam', 'data-action="ai-close"')}
            <h1 class="large-title">Connect Claude</h1>
            ${window.SOSCO_PREVIEW ? `<p class="lead">Claude can't run inside this shared preview page. It works when you open the app from your computer (demo mode, with your key saved on that device) or from Firebase once the Claude function is deployed.</p>
                <p class="section-foot">Don't paste your API key into this preview.</p>` : Store.mode === 'firebase' ? '' : `
            <p class="lead">In the live app, Claude runs through a Firebase Cloud Function that keeps your API key on the server (see “Connect Claude” in SETUP.md). To try it now in demo mode, you can save a key in this browser.</p>
            <div class="group">
                <div class="row"><input class="input-plain" type="password" id="ai-key" data-ai-key value="${esc(A.state.ui.keyInput || '')}" placeholder="${key ? 'Key saved on this device' : 'Paste your Claude API key (sk-ant-…)'}" autocomplete="off" spellcheck="false"></div>
            </div>
            <div class="notice">${ICON.alert}<span>Only do this on your own device. The key is saved unencrypted in this browser and sent straight to Anthropic from it. Never paste the key into a chat, email or the code. If it leaks, delete it in the Claude Console and create a new one.</span></div>
            ${A.state.errors.length ? `<div class="errors" role="alert">${A.state.errors.map(esc).join('<br>')}</div>` : ''}
            <div class="actions">
                <button class="btn btn-primary" data-action="ai-key-save">Save Key on This Device</button>
                ${key ? '<button class="btn btn-plain danger" data-action="ai-key-remove">Remove Saved Key</button>' : ''}
            </div>`}
        </div>`;
    };

    // ---------- Translation ----------

    async function translateDraft() {
        const d = draft();
        const todo = d.questions.filter(q => q.text.trim() && (!(q.text_ar || '').trim() || q.options.some((o, j) => o.trim() && !((q.options_ar || [])[j] || '').trim())));
        if (!todo.length) { A.toast('Every question already has Arabic.'); return; }
        if (AI.mode() === 'none') { A.go('ai-setup', {}, { keepUi: true }); return; }
        A.state.ui.translating = true;
        A.render();
        try {
            const result = await AI.run('translate', { items: todo.map(q => ({ id: q.id, text: q.text, options: q.type === 'tf' ? ['True', 'False'] : q.options })) });
            let n = 0;
            (result.translations || []).forEach(t => {
                const q = draft().questions.find(x => x.id === t.id);
                if (!q) return;
                q.text_ar = t.text_ar;
                q.options_ar = q.type === 'tf' ? ['صحيح', 'خطأ'] : q.options.map((o, j) => t.options_ar[j] || (q.options_ar || [])[j] || '');
                n++;
            });
            A.state.ui.showAr = true;
            A.toast(n ? `Translated ${n} ${n === 1 ? 'question' : 'questions'}. Check the Arabic before sending.` : (result.text || 'Nothing was translated. Try again.'));
        } catch (e) {
            A.toast(e.message);
        }
        A.state.ui.translating = false;
        if (A.state.view === 'exam-edit') A.render();
    }

    Object.assign(A.actions, {
        'ai-open': () => A.go('exam-ai', { fullscreen: true }, { keepUi: true }),
        'ai-close': () => { A.state.errors = []; A.go('exam-edit', {}, { keepUi: true }); },
        'ai-reset': () => { A.state.ui.chat = null; A.render(); },
        'ai-suggest': el => send(el.dataset.text),
        'ai-add': el => {
            const t = chat().turns[+el.dataset.turn];
            const k = +el.dataset.k;
            addQuestion(t.questions[k]);
            t.added[k] = true;
            A.toast(`Added. The exam has ${draft().questions.length} ${draft().questions.length === 1 ? 'question' : 'questions'}.`);
            A.render();
        },
        'ai-add-all': el => {
            const t = chat().turns[+el.dataset.turn];
            let n = 0;
            t.questions.forEach((q, k) => { if (!t.added[k]) { addQuestion(q); t.added[k] = true; n++; } });
            A.toast(`Added ${n} questions. The exam has ${draft().questions.length}.`);
            A.render();
        },
        'ai-translate': translateDraft,
        'ar-toggle': () => { A.state.ui.showAr = A.state.ui.showAr === false; A.render(); },
        'ar-run-toggle': () => {
            try { localStorage.setItem('sosco.showArabic', localStorage.getItem('sosco.showArabic') === '0' ? '1' : '0'); } catch (e) { /* preference not saved */ }
            A.render();
        },
        'ai-key-save': () => {
            const key = (A.state.ui.keyInput || '').trim();
            A.state.errors = /^sk-ant-[\w-]{20,}$/.test(key) ? [] : ['That doesn\'t look like a Claude API key. It starts with sk-ant-.'];
            if (A.state.errors.length) { A.render(); return; }
            if (!AI.setDeviceKey(key)) { A.state.errors = ['This browser blocked saving the key. Check that site data is allowed.']; A.render(); return; }
            A.state.ui.keyInput = '';
            A.toast('Key saved on this device');
            A.go('exam-ai', { fullscreen: true }, { keepUi: true });
        },
        'ai-key-remove': () => { AI.setDeviceKey(''); A.toast('Key removed from this device'); A.render(); },
    });

    A.bindAssistant = t => {
        if (t.dataset.aiInput !== undefined) { chat().input = t.value; t.style.height = 'auto'; t.style.height = `${Math.min(160, t.scrollHeight)}px`; return true; }
        if (t.dataset.aiKey !== undefined) { A.state.ui.keyInput = t.value; return true; }
        return false;
    };

    A.sendChat = () => send(chat().input);
})();
