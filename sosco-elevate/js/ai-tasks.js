// Claude requests for SOSCO ELEVATE: the exam question assistant and Arabic translation.
//
// Shared by the browser (demo mode, js/ai.js) and the Firebase Cloud Function
// (functions/index.js gets a copy at deploy time), so both send identical requests.
// `run(client, task, input)` takes an Anthropic SDK client and returns plain JSON.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SOSCO_AI_TASKS = factory();
})(typeof self !== 'undefined' ? self : this, () => {
    'use strict';

    const MODEL = 'claude-opus-5-5';
    // On a safety decline, the API re-runs the request on Anthropic's recommended fallback model.
    const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };
    const TF_AR = ['صحيح', 'خطأ'];

    class InputError extends Error {}

    const SYSTEM = `You help supervisors at SOSCO, a well intervention services company in Oman, write short timed exams for field crews: wellhead technicians, coiled tubing, slickline, pumping and nitrogen operators. Topics include HSE, H2S, permit to work, well control and barriers, pressure control equipment, lifting, and job procedures.

When the manager asks for questions, propose them with the propose_questions tool, then add one or two short sentences in your reply (for example what the set covers, or a question worth checking). If you need to know the topic, crew or difficulty first, ask in one short message instead of guessing.

Writing questions:
- Each question tests one thing a person on location needs to know or do. Plain, short sentences: many readers speak English as a second language.
- Multiple choice: 3 or 4 options, exactly one correct, wrong options plausible to someone who doesn't know, no "all of the above". Vary the position of the correct answer.
- True/false: a clear statement that is fully true or clearly false, without trick wording.
- Suggest seconds per question for reading and answering: about 20 for true/false, 30 for multiple choice, more for long questions.
- Avoid exact limits, pressures or concentrations unless they are widely standard; when a question depends on a company or client procedure, say in the explanation that the manager should check it against their procedure.
- Give every question and option in Arabic too (text_ar, options_ar): Modern Standard Arabic as used in Gulf workplaces, same meaning, keeping common technical terms and abbreviations such as H2S, BOP, PTW and NPT in Latin letters. For true/false the Arabic options are "${TF_AR[0]}" and "${TF_AR[1]}".
- explanation: one sentence on why the correct answer is right, for the manager.

When the manager asks to change questions you proposed, propose the full revised questions again with the tool.`;

    const QUESTION_SCHEMA = {
        type: 'object',
        properties: {
            type: { type: 'string', enum: ['mcq', 'tf'], description: 'mcq = multiple choice, tf = true/false' },
            text: { type: 'string', description: 'The question in English' },
            text_ar: { type: 'string', description: 'The question in Arabic' },
            options: { type: 'array', items: { type: 'string' }, description: 'Answer options in English. For tf: ["True", "False"]' },
            options_ar: { type: 'array', items: { type: 'string' }, description: 'The same options in Arabic, same order' },
            correct: { type: 'integer', description: 'Zero-based index of the correct option' },
            seconds: { type: 'integer', description: 'Suggested time to answer, in seconds' },
            explanation: { type: 'string', description: 'One sentence for the manager on why the answer is correct' },
        },
        required: ['type', 'text', 'text_ar', 'options', 'options_ar', 'correct', 'seconds', 'explanation'],
        additionalProperties: false,
    };

    const PROPOSE_TOOL = {
        name: 'propose_questions',
        description: 'Show exam questions to the manager as suggestions. The manager chooses which ones to add to the exam. Use this every time you propose new or revised questions.',
        strict: true,
        input_schema: {
            type: 'object',
            properties: { questions: { type: 'array', items: QUESTION_SCHEMA } },
            required: ['questions'],
            additionalProperties: false,
        },
    };

    const TRANSLATION_SCHEMA = {
        type: 'object',
        properties: {
            translations: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        text_ar: { type: 'string' },
                        options_ar: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['id', 'text_ar', 'options_ar'],
                    additionalProperties: false,
                },
            },
        },
        required: ['translations'],
        additionalProperties: false,
    };

    // ---------- Input checks (the Cloud Function receives this from the browser) ----------

    const str = (v, max) => typeof v === 'string' && v.length <= max;

    function checkMessages(messages) {
        if (!Array.isArray(messages) || !messages.length || messages.length > 60) throw new InputError('The conversation is empty or too long. Start a new chat.');
        if (JSON.stringify(messages).length > 400000) throw new InputError('The conversation is too long. Start a new chat.');
        messages.forEach((m, i) => {
            if (!m || (m.role !== 'user' && m.role !== 'assistant')) throw new InputError('Unexpected message in the conversation.');
            if (i === 0 && m.role !== 'user') throw new InputError('The conversation must start with your message.');
            if (!(typeof m.content === 'string' || Array.isArray(m.content))) throw new InputError('Unexpected message in the conversation.');
        });
        if (messages[messages.length - 1].role !== 'user') throw new InputError('The last message must be yours.');
    }

    function examContext(exam) {
        if (!exam || typeof exam !== 'object') return '';
        const title = str(exam.title, 200) ? exam.title.trim() : '';
        const existing = Array.isArray(exam.questions) ? exam.questions.filter(q => str(q, 1000) && q.trim()).slice(0, 50) : [];
        if (!title && !existing.length) return '';
        return `\n\nThe exam being written${title ? ` is titled "${title}"` : ''}.${existing.length
            ? ` It already has these questions; don't repeat them:\n${existing.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : ''}`;
    }

    // Keeps only well-formed questions, with options and the correct index in range.
    function normalize(q) {
        if (!q || !str(q.text, 2000) || !q.text.trim()) return null;
        const type = q.type === 'tf' ? 'tf' : 'mcq';
        let options = Array.isArray(q.options) ? q.options.filter(o => str(o, 500) && o.trim()).slice(0, 6) : [];
        let optionsAr = Array.isArray(q.options_ar) ? q.options_ar.map(o => (str(o, 500) ? o : '')).slice(0, options.length) : [];
        if (type === 'tf') { options = ['True', 'False']; optionsAr = TF_AR.slice(); }
        if (options.length < 2) return null;
        while (optionsAr.length < options.length) optionsAr.push('');
        const correct = Number.isInteger(q.correct) && q.correct >= 0 && q.correct < options.length ? q.correct : null;
        if (correct === null) return null;
        return {
            type, text: q.text.trim(), text_ar: str(q.text_ar, 2000) ? q.text_ar.trim() : '',
            options, options_ar: optionsAr, correct,
            seconds: Math.max(10, Math.min(300, Math.round((Number(q.seconds) || (type === 'tf' ? 20 : 30)) / 5) * 5)),
            explanation: str(q.explanation, 2000) ? q.explanation.trim() : '',
        };
    }

    function refusalText(response) {
        return response.stop_reason === 'refusal'
            ? 'Claude declined this request. Try rewording it, for example by naming the safety topic and the crew it is for.' : null;
    }

    // ---------- Tasks ----------

    // One turn of the question assistant. The browser keeps the conversation (including
    // Claude's own content blocks, passed back unchanged) and sends it each time.
    async function chat(client, input) {
        const messages = input && input.messages;
        checkMessages(messages);
        const response = await client.beta.messages.create({
            model: MODEL,
            max_tokens: 16000,
            ...FALLBACK,
            output_config: { effort: 'medium' },
            system: SYSTEM + examContext(input.exam),
            tools: [PROPOSE_TOOL],
            messages,
        });
        const refused = refusalText(response);
        if (refused) return { content: [], text: refused, questions: [], refused: true };

        const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n\n').trim();
        const questions = response.content
            .filter(b => b.type === 'tool_use' && b.name === 'propose_questions')
            .flatMap(b => (b.input && Array.isArray(b.input.questions) ? b.input.questions : []))
            .map(normalize).filter(Boolean);
        const cutOff = response.stop_reason === 'max_tokens';
        return {
            content: response.content,
            text: cutOff ? `${text}\n\nThe reply was cut off. Ask for fewer questions at a time.`.trim() : text,
            questions,
        };
    }

    // Arabic for questions and options that don't have it yet.
    async function translate(client, input) {
        const items = input && input.items;
        if (!Array.isArray(items) || !items.length || items.length > 60) throw new InputError('Nothing to translate.');
        const clean = items.map(it => ({
            id: String(it.id || ''),
            text: str(it.text, 2000) ? it.text : '',
            options: Array.isArray(it.options) ? it.options.filter(o => str(o, 500)).slice(0, 6) : [],
        })).filter(it => it.id && it.text.trim());
        if (!clean.length) throw new InputError('Write the questions in English first.');

        const response = await client.beta.messages.create({
            model: MODEL,
            max_tokens: 16000,
            ...FALLBACK,
            output_config: {
                effort: 'low',
                format: { type: 'json_schema', schema: TRANSLATION_SCHEMA },
            },
            system: `Translate exam questions for oil and gas field crews in Oman from English to Arabic. Use Modern Standard Arabic as used in Gulf workplaces, keep the exact meaning (including which option is correct), keep options in the same order, and keep common technical terms and abbreviations such as H2S, BOP, PTW and NPT in Latin letters. Translate "True" as "${TF_AR[0]}" and "False" as "${TF_AR[1]}". Return one entry per input item with the same id.`,
            messages: [{ role: 'user', content: JSON.stringify(clean) }],
        });
        const refused = refusalText(response);
        if (refused) return { translations: [], refused: true, text: refused };
        const block = response.content.find(b => b.type === 'text');
        let parsed;
        try { parsed = JSON.parse(block ? block.text : ''); } catch (e) { parsed = null; }
        if (!parsed || !Array.isArray(parsed.translations)) return { translations: [], text: 'The translation came back incomplete. Try again.' };
        const wanted = new Map(clean.map(it => [it.id, it]));
        return {
            translations: parsed.translations
                .filter(t => t && wanted.has(t.id) && str(t.text_ar, 2000))
                .map(t => ({ id: t.id, text_ar: t.text_ar.trim(), options_ar: (t.options_ar || []).slice(0, wanted.get(t.id).options.length).map(o => (str(o, 500) ? o.trim() : '')) })),
        };
    }

    async function run(client, task, input) {
        if (task === 'chat') return chat(client, input);
        if (task === 'translate') return translate(client, input);
        throw new InputError('Unknown task.');
    }

    // Plain-language message for an SDK error; `Anthropic` is the SDK's default export.
    function describeError(e, Anthropic) {
        if (e instanceof InputError) return e.message;
        if (Anthropic) {
            if (e instanceof Anthropic.AuthenticationError) return 'The Claude API key was rejected. Check that it is correct and active.';
            if (e instanceof Anthropic.PermissionDeniedError) return 'This API key isn\'t allowed to use this model.';
            if (e instanceof Anthropic.RateLimitError) return 'Claude is busy or the usage limit was reached. Try again in a minute.';
            if (e instanceof Anthropic.BadRequestError) return `Claude couldn't process the request (${e.message}).`;
            if (e instanceof Anthropic.APIConnectionError) return 'Couldn\'t reach Claude. Check the internet connection.';
            if (e instanceof Anthropic.APIError) return `Claude had a problem (error ${e.status}). Try again.`;
        }
        return 'Something went wrong talking to Claude. Try again.';
    }

    return { MODEL, TF_AR, InputError, run, normalize, describeError };
});
