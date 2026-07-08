import { USERS, ENVIRONMENTS, FIREBASE_CONFIG, SLACK_WEBHOOK_URL, IS_PLACEHOLDER, SLOT_DURATION_MINUTES } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, setDoc, onSnapshot, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Setup warning banner ────────────────────────────────────────
if (IS_PLACEHOLDER) {
  document.getElementById("setupWarning").style.display = "block";
}

// ── Firebase init ────────────────────────────────────────────────
const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);

// ── "Who am I" (per-browser, not shared) ─────────────────────────
// Anyone can type a name that isn't in the USERS suggestion list —
// it just gets remembered on this browser (localStorage) so it shows
// up as a suggestion next time too. Nothing here is shared between
// browsers; it's purely a convenience, not an identity system.
const whoInput = document.getElementById("whoInput");
const whoList = document.getElementById("whoList");

function customNames() {
  try {
    return JSON.parse(localStorage.getItem("envres_customNames") || "[]");
  } catch {
    return [];
  }
}

function rebuildSuggestions() {
  const names = [...new Set([...USERS, ...customNames()])].sort();
  whoList.innerHTML = "";
  names.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    whoList.appendChild(opt);
  });
}
rebuildSuggestions();

whoInput.value = localStorage.getItem("envres_whoami") || "";

function persistWhoami() {
  const name = whoInput.value.trim();
  if (!name) return;
  localStorage.setItem("envres_whoami", name);
  if (!USERS.includes(name)) {
    const custom = customNames();
    if (!custom.includes(name)) {
      custom.push(name);
      localStorage.setItem("envres_customNames", JSON.stringify(custom));
      rebuildSuggestions();
    }
  }
  refreshAllCards();
}

whoInput.addEventListener("change", persistWhoami);
whoInput.addEventListener("blur", persistWhoami);

function me() { return whoInput.value.trim(); }

// ── Toast helper ──────────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
}

// ── Slack notification ────────────────────────────────────────────
// Sent with mode:no-cors as a fire-and-forget call — the browser can't
// read the response, so we can't confirm delivery, but Slack's webhook
// endpoint accepts this pattern fine. If you need delivery confirmation
// later, move this call behind a tiny serverless function instead.
async function notifySlack(text) {
  if (IS_PLACEHOLDER) {
    console.log("[Slack webhook not configured] would have sent:", text);
    return;
  }
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error("Slack notification failed", e);
  }
}

// ── Firestore document shape per environment ──────────────────────
// { current: { name, since } | null, queue: [{ name, since }] }
function envRef(envName) {
  return doc(db, "environments", envName);
}

async function ensureDocsExist() {
  for (const env of ENVIRONMENTS) {
    await setDoc(envRef(env), { current: null, queue: [] }, { merge: true });
  }
}
ensureDocsExist();

// ── Reserve: take it if free, otherwise join the queue ─────────────
async function reserve(envName) {
  const name = me();
  if (!name) return toast("Type your name first");
  await runTransaction(db, async (tx) => {
    const ref = envRef(envName);
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : { current: null, queue: [] };

    if (data.current && data.current.name === name) return; // already holding it
    if (data.queue.some(q => q.name === name)) return; // already queued

    if (!data.current) {
      tx.set(ref, { current: { name, since: Date.now() }, queue: data.queue }, { merge: true });
    } else {
      tx.set(ref, { current: data.current, queue: [...data.queue, { name, since: Date.now() }] }, { merge: true });
    }
  });

  const snap = await new Promise(res => {
    const unsub = onSnapshot(envRef(envName), s => { unsub(); res(s); });
  });
  const data = snap.data();
  if (data.current && data.current.name === name) {
    toast(`You now have ${envName}`);
  } else {
    toast(`Joined the queue for ${envName}`);
  }
}

// ── Release: hand off to the next person in the queue ───────────────
async function release(envName) {
  const name = me();
  if (!name) return toast("Type your name first");
  let nextUser = null;

  await runTransaction(db, async (tx) => {
    const ref = envRef(envName);
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : { current: null, queue: [] };

    if (!data.current || data.current.name !== name) return; // not yours to release

    const [next, ...rest] = data.queue;
    nextUser = next ? next.name : null;
    tx.set(ref, {
      current: next ? { name: next.name, since: Date.now() } : null,
      queue: rest,
    }, { merge: true });
  });

  if (nextUser) {
    toast(`Released ${envName} — notifying ${nextUser}`);
    notifySlack(`:white_check_mark: *${envName}* is now free and assigned to *${nextUser}* (handed off by ${name}).`);
  } else if (nextUser === null) {
    toast(`Released ${envName}`);
  }
}

// ── Leave the queue (didn't have it yet, changed your mind) ─────────
async function leaveQueue(envName) {
  const name = me();
  if (!name) return toast("Type your name first");
  await runTransaction(db, async (tx) => {
    const ref = envRef(envName);
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : { current: null, queue: [] };
    tx.set(ref, { current: data.current, queue: data.queue.filter(q => q.name !== name) }, { merge: true });
  });
  toast(`Left the queue for ${envName}`);
}

// ── Rendering helpers ──────────────────────────────────────────────
function initials(name) {
  const parts = name.trim().split(/\s+/);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return letters.toUpperCase();
}

// Deterministic-ish color per name so the same person always gets the
// same avatar tint. Blue (from the reference screenshot) plus a few
// neighbors so a busy dashboard isn't monochrome.
const AVATAR_COLORS = ["#5b6fd8", "#4f8fd8", "#7a5bd8", "#5bb3d8", "#5bd8a0"];
function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// Remaining time against the assumed slot duration. Display only —
// nothing gets auto-released, this just turns red past zero.
function remainingTime(sinceTs) {
  const totalMs = SLOT_DURATION_MINUTES * 60 * 1000;
  const elapsedMs = Date.now() - sinceTs;
  const remainingMs = totalMs - elapsedMs;
  const overdue = remainingMs < 0;
  const absMins = Math.floor(Math.abs(remainingMs) / 60000);
  const hrs = Math.floor(absMins / 60);
  const mins = absMins % 60;
  const label = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  const pct = Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100));
  return {
    text: overdue ? `${label} overdue` : `${label} remaining`,
    overdue,
    warn: !overdue && pct >= 75,
    pct,
  };
}

function renderEnv(envName, data) {
  const card = document.getElementById(`card-${envName}`);
  const name = me();
  const isFree = !data.current;
  const iHoldIt = data.current && data.current.name === name;
  const iAmQueued = data.queue.some(q => q.name === name);

  card.querySelector(".status-pill").className = `status-pill ${isFree ? "free" : "busy"}`;
  card.querySelector(".status-pill").textContent = isFree ? "Free" : "In use";

  const avatarEl = card.querySelector(".avatar");
  const currentInfo = card.querySelector(".current-info-wrap");
  const progressFill = card.querySelector(".progress-fill");

  if (data.current) {
    const remaining = remainingTime(data.current.since);
    avatarEl.textContent = initials(data.current.name);
    avatarEl.style.background = avatarColor(data.current.name);
    avatarEl.classList.remove("empty");
    currentInfo.innerHTML = `
      <div class="current-name">${data.current.name}</div>
      <div class="current-time ${remaining.overdue ? "overdue" : ""}">${remaining.text}</div>
    `;
    progressFill.style.width = `${remaining.pct}%`;
    progressFill.className = `progress-fill ${remaining.overdue ? "overdue" : remaining.warn ? "warn" : ""}`;
  } else {
    avatarEl.textContent = "";
    avatarEl.classList.add("empty");
    currentInfo.innerHTML = `<div class="current-empty">Nobody — first to reserve gets it</div>`;
    progressFill.style.width = "0%";
    progressFill.className = "progress-fill";
  }

  // Always show exactly 3 upcoming slots, padded with "Open slot".
  const queueEl = card.querySelector(".queue-list");
  queueEl.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const entry = data.queue[i];
    const li = document.createElement("li");
    if (entry) {
      const mine = entry.name === name ? "mine" : "";
      li.innerHTML = `<span class="pos">${i + 1}</span><span class="qname ${mine}">${entry.name}</span>`;
    } else {
      li.innerHTML = `<span class="pos">${i + 1}</span><span class="qname open">Open slot</span>`;
    }
    queueEl.appendChild(li);
  }

  const reserveBtn = card.querySelector(".reserve-btn");
  const releaseBtn = card.querySelector(".release-btn");
  const leaveBtn = card.querySelector(".leave-btn");

  reserveBtn.disabled = iHoldIt || iAmQueued;
  reserveBtn.textContent = isFree ? "Reserve" : "Join queue";
  releaseBtn.style.display = iHoldIt ? "block" : "none";
  leaveBtn.style.display = iAmQueued ? "block" : "none";
}

function buildCard(envName) {
  const card = document.createElement("div");
  card.className = "panel";
  card.id = `card-${envName}`;
  card.innerHTML = `
    <div class="panel-header">
      <span class="env-name">${envName}</span>
      <span class="status-pill"></span>
    </div>
    <div class="panel-body">
      <div class="current-block">
        <div class="avatar empty"></div>
        <div class="current-info-wrap"></div>
      </div>
      <div class="progress-track"><div class="progress-fill"></div></div>
      <div>
        <div class="queue-title">Up next</div>
        <ol class="queue-list"></ol>
      </div>
    </div>
    <div class="panel-footer">
      <button class="reserve-btn primary" onclick="window.__reserve('${envName}')">Reserve</button>
      <button class="release-btn danger" style="display:none" onclick="window.__release('${envName}')">Release</button>
      <button class="leave-btn" style="display:none" onclick="window.__leaveQueue('${envName}')">Leave queue</button>
    </div>
  `;
  return card;
}

const envDataCache = {};

const grid = document.getElementById("grid");
ENVIRONMENTS.forEach(envName => {
  grid.appendChild(buildCard(envName));
  onSnapshot(envRef(envName), snap => {
    if (snap.exists()) {
      envDataCache[envName] = snap.data();
      renderEnv(envName, snap.data());
    }
  });
});

// Re-render with cached data when the "I am" name changes, so button
// states (e.g. whether Release shows up) update without waiting for
// the next Firestore update.
function refreshAllCards() {
  ENVIRONMENTS.forEach(envName => {
    if (envDataCache[envName]) renderEnv(envName, envDataCache[envName]);
  });
}
setInterval(refreshAllCards, 30000);

window.__reserve = reserve;
window.__release = release;
window.__leaveQueue = leaveQueue;
