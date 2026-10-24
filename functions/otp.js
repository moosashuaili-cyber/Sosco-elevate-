// WhatsApp sign-in codes for SOSCO ELEVATE.
//
// requestOtp sends a 6-digit code to a registered number through Meta's WhatsApp
// Cloud API; verifyOtp checks it and returns a Firebase custom token for that person.
// Codes are stored only as salted hashes in the server-only `otps` collection.
const crypto = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');

const WHATSAPP_TOKEN = defineSecret('WHATSAPP_TOKEN');
const PHONE_NUMBER_ID = defineString('WHATSAPP_PHONE_NUMBER_ID', { description: 'Phone number ID of the WhatsApp Business number (Meta → WhatsApp → API Setup)' });
const TEMPLATE = defineString('WHATSAPP_OTP_TEMPLATE', { default: 'sosco_login_code', description: 'Name of the approved authentication template' });
const TEMPLATE_LANG = defineString('WHATSAPP_OTP_LANG', { default: 'en', description: 'Language code of that template, e.g. en or ar' });
const GRAPH_VERSION = defineString('WHATSAPP_GRAPH_VERSION', { default: 'v23.0', description: 'Meta Graph API version' });

const CODE_TTL = 5 * 60 * 1000;
const RESEND_AFTER = 60 * 1000;
const SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

// E.164 number; 8-digit numbers are taken as Omani (+968).
function normalizePhone(value) {
    let s = String(value || '').replace(/[\s()-]/g, '');
    if (s.startsWith('00')) s = '+' + s.slice(2);
    if (/^[79]\d{7}$/.test(s)) s = '+968' + s;
    if (/^968\d{8}$/.test(s)) s = '+' + s;
    return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

const hash = (salt, code) => crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
const minutes = s => (s < 90 ? `${s} seconds` : `${Math.ceil(s / 60)} minutes`);

async function sendWhatsApp(phone, code) {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION.value()}/${PHONE_NUMBER_ID.value()}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN.value()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone.slice(1),
            type: 'template',
            template: {
                name: TEMPLATE.value(),
                language: { code: TEMPLATE_LANG.value() },
                components: [
                    { type: 'body', parameters: [{ type: 'text', text: code }] },
                    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
                ],
            },
        }),
    });
    if (!res.ok) {
        console.error('WhatsApp send failed', res.status, await res.text());
        throw new HttpsError('unavailable', 'Couldn\'t send the WhatsApp message. Try again in a minute, or sign in with email.');
    }
}

exports.requestOtp = onCall({ secrets: [WHATSAPP_TOKEN] }, async request => {
    const phone = normalizePhone(request.data && request.data.phone);
    if (!phone) throw new HttpsError('invalid-argument', 'Enter a valid mobile number, for example 9123 4567.');
    const db = admin.firestore();
    const found = await db.collection('users').where('phone', '==', phone).limit(2).get();
    const user = found.size === 1 && found.docs[0].data().active !== false ? found.docs[0] : null;

    // Limits apply to every number, registered or not, so the reply never reveals which numbers have accounts.
    const now = Date.now();
    const ref = db.collection('otps').doc(phone);
    const outcome = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const d = snap.exists ? snap.data() : {};
        const sends = (d.sends || []).filter(t => now - t < 3600e3);
        if (d.lastSent && now - d.lastSent < RESEND_AFTER) return { wait: Math.ceil((RESEND_AFTER - (now - d.lastSent)) / 1000) };
        if (sends.length >= SENDS_PER_HOUR) return { wait: Math.ceil((sends[0] + 3600e3 - now) / 1000) };
        const code = user ? String(crypto.randomInt(0, 1000000)).padStart(6, '0') : null;
        const salt = crypto.randomBytes(16).toString('hex');
        tx.set(ref, { lastSent: now, sends: [...sends, now], salt, hash: code ? hash(salt, code) : null, uid: user ? user.id : null, expiresAt: now + CODE_TTL, attempts: 0 });
        return { code };
    });
    if (outcome.wait) throw new HttpsError('resource-exhausted', `Wait ${minutes(outcome.wait)} before asking for another code.`);
    if (outcome.code) await sendWhatsApp(phone, outcome.code);
    return { phone, resendIn: RESEND_AFTER / 1000 };
});

exports.verifyOtp = onCall(async request => {
    const phone = normalizePhone(request.data && request.data.phone);
    const code = String((request.data && request.data.code) || '');
    if (!phone || !/^\d{6}$/.test(code)) throw new HttpsError('invalid-argument', 'Enter the 6-digit code from WhatsApp.');
    const db = admin.firestore();
    const ref = db.collection('otps').doc(phone);
    const now = Date.now();
    const outcome = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const d = snap.exists ? snap.data() : null;
        if (!d || !d.hash || now > d.expiresAt) return { error: 'This code is wrong or has expired. Ask for a new one.' };
        if (d.attempts >= MAX_ATTEMPTS) return { error: 'Too many wrong codes. Ask for a new one.' };
        const ok = crypto.timingSafeEqual(Buffer.from(hash(d.salt, code), 'hex'), Buffer.from(d.hash, 'hex'));
        if (!ok) {
            const attempts = d.attempts + 1;
            tx.update(ref, { attempts });
            const left = MAX_ATTEMPTS - attempts;
            return { error: left ? `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Ask for a new one.' };
        }
        tx.update(ref, { hash: null, usedAt: now }); // one use only
        return { uid: d.uid };
    });
    if (outcome.error) throw new HttpsError('permission-denied', outcome.error);

    const user = await db.doc(`users/${outcome.uid}`).get();
    if (!user.exists || user.data().active === false || user.data().phone !== phone) {
        throw new HttpsError('permission-denied', 'This account can\'t sign in. Ask your admin.');
    }
    return { token: await admin.auth().createCustomToken(outcome.uid, { signIn: 'whatsapp' }) };
});

exports.normalizePhone = normalizePhone;
