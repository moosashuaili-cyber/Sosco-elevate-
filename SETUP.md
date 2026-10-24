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
   manager. Give each person their email and temporary password; they can change it
   with **Forgot password?** on the sign-in screen.
3. **Reviews → New Review Cycle**: set dates and competencies, then **Start Cycle**.
   Everyone with a manager gets a review and is asked to assess themselves first.
4. Managers set goals from **Team → person → Add Goal**, and send exams from **Exams**.

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
- **Removing people:** set them to inactive. They can no longer sign in or join new
  cycles, and their history stays. To delete a login completely, use
  Authentication → Users in the console.
