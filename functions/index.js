// Cloud Function that lets managers and admins use Claude without the API key
// ever reaching a browser. The key is stored in Google Secret Manager:
//   firebase functions:secrets:set ANTHROPIC_API_KEY
// ai-tasks.js is copied in from sosco-elevate/js/ at deploy time (see firebase.json).
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk');
const tasks = require('./ai-tasks.js');

admin.initializeApp();

// WhatsApp sign-in codes
const otp = require('./otp.js');
exports.requestOtp = otp.requestOtp;
exports.verifyOtp = otp.verifyOtp;
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

exports.claude = onCall({ secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: '256MiB' }, async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
    const snap = await admin.firestore().doc(`users/${request.auth.uid}`).get();
    const user = snap.exists ? snap.data() : null;
    if (!user || user.active === false || !['manager', 'admin'].includes(user.role)) {
        throw new HttpsError('permission-denied', 'Only managers and admins can use Claude.');
    }

    const { task, input } = request.data || {};
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    try {
        return await tasks.run(client, task, input);
    } catch (e) {
        const message = tasks.describeError(e, Anthropic);
        if (e instanceof tasks.InputError) throw new HttpsError('invalid-argument', message);
        if (e instanceof Anthropic.RateLimitError) throw new HttpsError('resource-exhausted', message);
        if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new HttpsError('failed-precondition', message);
        console.error('Claude request failed', e);
        throw new HttpsError('unavailable', message);
    }
});
