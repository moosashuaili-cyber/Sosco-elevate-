# Connecting SOSCO ELEVATE to Firebase

Without a Firebase config the app runs in **demo mode**: sample data, kept only in
the browser. Follow these steps to make it live, so managers and employees use their
own phones and share one database.

## 1. Turn on Authentication and Firestore

In the [Firebase console](https://console.firebase.google.com), open your project
(for example `sosco-dashboard`):

1. **Build → Authentication → Get started → Sign-in method** → enable **Email/Password**.
2. **Build → Firestore Database → Create database** → start in **production mode** and
   pick a location close to Oman. The location can't be changed later.

## 2. Add the web config

1. **Project settings → General → Your apps** → add a **Web app** if there isn't one.
2. Copy the `firebaseConfig` object.
3. Paste it into `sosco-elevate/js/firebase-config.js` in place of `null`:

   ```js
   window.SOSCO_FIREBASE_CONFIG = {
       apiKey: '…',
       authDomain: 'sosco-dashboard.firebaseapp.com',
       projectId: 'sosco-dashboard',
       // …the rest of the values
   };
   ```

These values identify the project; they are not secret. Access is controlled by
`firestore.rules`.

## 3. Deploy the security rules and the app

From the repository root, with the [Firebase CLI](https://firebase.google.com/docs/cli)
installed and logged in (`npm install -g firebase-tools`, then `firebase login`):

```bash
firebase use sosco-dashboard           # your project ID
firebase deploy --only firestore:rules # always deploy the rules first
firebase deploy --only hosting         # publishes sosco-elevate/ to <project>.web.app
```

> **Careful:** deploying hosting replaces whatever is live on that site now. If
> `sosco-dashboard.web.app` still serves the older app built on your computer, either
> deploy this to a new site (`firebase hosting:sites:create sosco-elevate`, then add
> `"site": "sosco-elevate"` under `hosting` in `firebase.json`), or merge the two first.

## 4. Create the first admin

Nobody can add people until one admin exists:

1. **Authentication → Users → Add user**: enter your email and a password.
2. Copy the new user's **User UID**.
3. **Firestore → Start collection** → collection ID `users` → document ID = that UID,
   with these fields:

   | Field    | Type    | Value            |
   |----------|---------|------------------|
   | `name`   | string  | your name        |
   | `email`  | string  | the same email   |
   | `role`   | string  | `admin`          |
   | `active` | boolean | `true`           |

4. Open the app and sign in. If you see “Almost there”, the document ID doesn't match
   the UID shown on that screen.

## 5. Set up the organisation

Signed in as admin:

1. **People → Department**: add departments (e.g. HO, WHM, WI).
2. **People → Add Person**: add managers first, then employees, choosing each person's
   manager. A temporary password is generated for you; give it to the person with their
   email. At their first sign-in they must replace it with their own password before
   they can use the app.
3. **People → Assign Managers**: change who reports to whom, for everyone on one screen.
   Open reviews and goals move to the new manager.
4. **Reviews → New Review Cycle**: set dates and competencies, then **Start Cycle**.
   Everyone with a manager gets a review and is asked to assess themselves first.
5. Managers set goals from **Team → person → Add Goal**, and send exams from **Exams**.

## 6. Connect Claude (question assistant and Arabic translation)

The exam builder can ask Claude to write questions (in English and Arabic) and to
translate questions into Arabic. The Claude API key must stay on a server, never in the
app's files, so a small Cloud Function (`functions/`) calls Claude for signed-in
managers and admins.

1. Cloud Functions need the **Blaze (pay-as-you-go)** plan: Firebase console →
   ⚙ → Usage and billing → Modify plan. Normal use stays within the free allowance;
   Claude usage is billed separately by Anthropic.
2. In the [Claude Console](https://platform.claude.com), create an API key for this app
   and set a monthly spend limit for it.
3. Store the key in Google Secret Manager (it is never written to a file):

   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY
   ```

   Paste the key when asked.
4. Install the function's packages and deploy it:

   ```bash
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```

5. In the app: **Exams → New Exam → Write Questions with Claude**.

The function runs in `us-central1` by default. If you deploy it to another region, set
`window.SOSCO_FUNCTIONS_REGION = 'your-region';` in `sosco-elevate/js/firebase-config.js`.

**Before Firebase is set up**, you can try Claude in demo mode on your own computer:
open `sosco-elevate/index.html`, start a new exam, tap **Write Questions with Claude**,
and paste your key. It is saved in that browser only and sent straight to Anthropic.
Don't do this on a shared computer, and never put the key in the code, a chat or an email.

Claude uses `claude-opus-5-5`. If Claude declines a request on safety grounds, the API
retries it on Anthropic's recommended fallback model. Questions Claude writes are
suggestions: managers should check each one, especially anything that depends on a
company or client procedure, before sending the exam.

## 7. WhatsApp sign-in

People sign in by typing their mobile number and the 6-digit code they receive on
WhatsApp, so there's no password to remember. Email and password sign-in still works
for anyone who has it.

### 7a. Meta (WhatsApp Business)

1. **Business account:** at [business.facebook.com](https://business.facebook.com), create
   (or open) SOSCO's business and complete **business verification**.
2. **App:** at [developers.facebook.com](https://developers.facebook.com) → **Create app** →
   type **Business** → add the **WhatsApp** product, linked to that business.
3. **Sender number:** WhatsApp → **API Setup** → **Add phone number**. Your Omani number
   works, but a number can't be on the normal WhatsApp or WhatsApp Business app and
   the API at the same time: either use a SIM that isn't on WhatsApp, or delete the
   WhatsApp account on that number first (back up any chats). Meta checks the number by
   SMS or call. Copy the **Phone number ID** shown there.
4. **Message template:** WhatsApp Manager → **Message templates** → **Create** →
   category **Authentication** → name `sosco_login_code`, language **English** → choose
   the **Copy code** button and tick “add expiry time” (5 minutes). Submit; approval
   is usually quick. (For Arabic instead, create it in Arabic and set
   `WHATSAPP_OTP_LANG=ar` below.)
5. **Access token that doesn't expire:** Business settings → **Users → System users** →
   add a system user (Admin) → **Assign assets**: the app and the WhatsApp account
   (full control) → **Generate token** with `whatsapp_business_messaging` and
   `whatsapp_business_management`, expiry **Never**. Keep it secret.
6. **Billing:** add a payment method in WhatsApp Manager. Meta charges each
   authentication message at its rate for the recipient's country (Oman for your staff).

### 7b. Firebase

1. Store the token as a secret (it never goes in a file):

   ```bash
   firebase functions:secrets:set WHATSAPP_TOKEN
   ```

2. Let the functions sign people in: in [Google Cloud console](https://console.cloud.google.com)
   for the same project, enable the **IAM Service Account Credentials API**, then under
   **IAM** give the account `PROJECT_NUMBER-compute@developer.gserviceaccount.com` the
   role **Service Account Token Creator**. Without it, the code arrives but signing in
   fails.
3. Deploy (from the repository root):

   ```bash
   cd functions && npm install && cd ..
   firebase deploy --only functions,firestore:rules
   ```

   The CLI asks for `WHATSAPP_PHONE_NUMBER_ID` (from step 7a.3) and offers defaults for
   the template name (`sosco_login_code`), language (`en`) and Meta Graph API version.
   Use the newest Graph API version Meta lists in its docs.
4. **Add numbers:** People → person → **Edit Person** → **WhatsApp number**. Omani numbers
   can be typed without +968; other countries need the + and country code. New people can
   be added with only a number: they open the app and sign in with WhatsApp.

### Limits and safety

- Codes are 6 digits, work once, and expire after 5 minutes; 5 wrong tries cancel a code.
- A number can request a code once a minute and 5 times an hour.
- Codes are stored only as salted hashes, in a collection no app user can read.
- The sign-in screen gives the same reply whether or not a number is registered, so it
  can't be used to find out who works at SOSCO. Codes are only sent to registered,
  active people, which also keeps Meta charges down.
- People who sign in with WhatsApp aren't asked to replace a temporary password.

## How it behaves

- **Review flow:** self-assessment → manager review → employee sign-off → complete.
  The overall score combines competency ratings and goal ratings using the cycle's
  goals weight.
- **Exam answers are stored apart from the questions** (`examKeys`), so people taking
  an exam can't read the answers. Because of that, scores are marked by the exam
  owner's app (manager or admin) the next time it opens, so employees may see
  “Submitted” for a while before their score appears. Instant marking would need a
  Cloud Function, which requires the Blaze (pay-as-you-go) plan.
- **Exam timers** run in the app. The rules stop anyone starting outside the exam
  window or submitting more than two minutes after the due time.
- **Temporary passwords:** new accounts are flagged `mustChangePassword`, and the app
  shows only the “Set a new password” screen until the person chooses a new one (at
  least 8 characters, letters and numbers, different from the temporary one). An admin
  can switch the flag back on from Edit Person. The app enforces this screen; Firestore
  can't check that a password really changed, so a determined user could clear the flag
  without changing it. For a hard guarantee, add a Cloud Function (Blaze plan).
- **Removing people:** set them to inactive. They can no longer sign in or join new
  cycles, and their history stays. To delete a login completely, use
  Authentication → Users in the console.
