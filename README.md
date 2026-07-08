# Environment reservation board

A tiny static site for 6 people to share tstqa / tstqadev / tstqadev02 —
see who has each one in real time, reserve it, and join a queue if
it's busy.

No server to run or maintain. Just a static site + a free Firebase
project (for shared state).

## Files

- `index.html` — the page
- `app.js` — all the logic (Firestore sync)
- `config.js` — **the only file you need to edit**

## 1. Set up Firebase (5 minutes, free tier is plenty for this)

1. Go to https://console.firebase.google.com and create a project.
2. In the left sidebar: **Build > Firestore Database > Create database**.
   Start in **test mode** for now (we'll lock it down in step 3).
3. In **Project settings > General > Your apps**, click the `</>` (web)
   icon to register a web app. Copy the `firebaseConfig` object it
   gives you into `config.js` under `FIREBASE_CONFIG`.
4. Once it's working, tighten the Firestore rules (Firestore Database
   > Rules) so randoms on the internet can't edit your reservations.
   Something like this is enough for a 6-person internal tool with no
   real auth layer:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /environments/{envId} {
         allow read, write: if true; // fine for an internal, unlisted URL
       }
     }
   }
   ```

   If you want real access control later, add Firebase Auth (e.g.
   Google Sign-In restricted to your company domain) and change this
   rule to `allow read, write: if request.auth != null;`. That's a
   bigger change to `app.js` (adding a login screen) — happy to add it
   if you want it.

## 2. Edit the user list

In `config.js`, update `USERS` with your 6 names and `ENVIRONMENTS` if
the environment names ever change.

## 3. Deploy

This is a plain static site — drop the folder onto whatever static
host you've got:

- **GitHub Pages**: push this folder to a repo, enable Pages on the
  branch/folder in repo settings.
- **Netlify / Vercel**: drag-and-drop the folder onto their dashboard,
  or connect the repo.
- **S3 + CloudFront**: upload the 3 files to a bucket with static
  website hosting enabled.

No build step — it's just static HTML/JS.

## How it works

- Each environment is one Firestore document: who currently has it,
  and an ordered queue of who's waiting.
- **Reserve**: if the environment is free, you get it immediately. If
  not, you're appended to the queue.
- **Release**: only shown to whoever currently holds it. Releasing
  promotes the next person in the queue (if any) automatically.
- **Leave queue**: for when you queued but no longer need it.
- The "I am" field is just a per-browser identity (stored in
  `localStorage`) — there's no login. Good enough for 6 trusted
  people on an internal URL; not meant to stop someone from picking a
  different name if they wanted to.

## Known limitations

- No real authentication — anyone with the URL can act as anyone.
  Fine for an internal tool behind your VPN/network; not something to
  put on the open internet as-is.
- No automatic timeout — if someone forgets to hit Release, the
  environment stays theirs until they do. The "time remaining" display
  is just a visual nudge (based on `SLOT_DURATION_MINUTES` in
  `config.js`) — it turns red past the limit but doesn't force anything.
