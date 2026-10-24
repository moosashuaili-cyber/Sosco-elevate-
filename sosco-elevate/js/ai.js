// Connects the app to Claude.
//   Firebase mode: through the `claude` Cloud Function, which holds the API key.
//   Demo mode: straight from this browser with a key saved on this device only,
//   for trying the feature before Firebase is set up.
const AI = (() => {
    'use strict';
    const KEY = 'sosco.anthropicKey';
    const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.132.0/+esm';
    let sdk = null;

    function deviceKey() {
        try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
    }
    function setDeviceKey(value) {
        try {
            if (value) localStorage.setItem(KEY, value);
            else localStorage.removeItem(KEY);
            return true;
        } catch (e) { return false; }
    }

    // 'server' (Cloud Function), 'device' (key in this browser) or 'none'.
    function mode() {
        if (window.SOSCO_PREVIEW) return 'none';
        if (Store.mode === 'firebase') return 'server';
        return deviceKey() ? 'device' : 'none';
    }

    // Returns the task result, or throws an Error whose message can be shown to the user.
    async function run(task, input) {
        if (mode() === 'server') {
            try {
                return await Store.call('claude', { task, input });
            } catch (e) {
                if (e.code === 'functions/not-found' || e.code === 'functions/internal' && /not found/i.test(e.message)) {
                    throw new Error('The Claude function isn\'t deployed yet. See “Connect Claude” in SETUP.md.');
                }
                throw new Error(e.message || 'Couldn\'t reach Claude. Check the internet connection.');
            }
        }
        if (mode() === 'none') throw new Error('Claude isn\'t connected yet.');
        try {
            sdk = sdk || await import(SDK_URL);
        } catch (e) {
            throw new Error('Couldn\'t load the Claude library. Check the internet connection.');
        }
        const Anthropic = sdk.default;
        const client = new Anthropic({ apiKey: deviceKey(), dangerouslyAllowBrowser: true });
        try {
            return await SOSCO_AI_TASKS.run(client, task, input);
        } catch (e) {
            throw new Error(SOSCO_AI_TASKS.describeError(e, Anthropic));
        }
    }

    return { mode, run, deviceKey, setDeviceKey };
})();
