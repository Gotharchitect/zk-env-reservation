// ── EDIT THIS FILE ──────────────────────────────────────────────
// Everything here is loaded into the browser, so don't put anything
// in here you wouldn't want a teammate to be able to see (this is a
// small internal tool for 6 trusted people, so that's normally fine).

// 1. The people who share the environments. This is just the list of
//    suggestions shown while typing — anyone can still type a name
//    that isn't here (see app.js), so this doesn't need to be kept
//    perfectly up to date.
export const USERS = [
  "Ana Picoito",
  "André Guimarães",
  "Catarina Folque",
  "Guilherme Pinto",
  "Ludovic Costa",
  "Rafael Neves",
];

// 2. The environments being shared.
export const ENVIRONMENTS = ["tstqa", "tstqadev", "tstqadev02"];

// 2b. How long a reservation is assumed to last, for the "time
//     remaining" display. This is DISPLAY ONLY — nothing gets
//     auto-released when it hits zero, it just turns red and shows
//     "overdue" as a nudge. Change this if 2 hours isn't realistic.
export const SLOT_DURATION_MINUTES = 60;

// 3. Firebase project config.
//    Create a free project at https://console.firebase.google.com
//    -> Build > Firestore Database > Create database (start in test mode,
//       then lock down rules per the README)
//    -> Project settings > General > Your apps > Web app > copy the config object below
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBqgMQ9DKbXfzvMchogpn-bWHTErY3iavk",
  authDomain: "zk-env-reservation.firebaseapp.com",
  projectId: "zk-env-reservation",
  storageBucket: "zk-env-reservation.firebasestorage.app",
  messagingSenderId: "1055608568984",
  appId: "1:1055608568984:web:8287e58f34a8652c3ba4ed"
};

// 4. Set to false once you've filled in FIREBASE_CONFIG above.
export const IS_PLACEHOLDER = false;

