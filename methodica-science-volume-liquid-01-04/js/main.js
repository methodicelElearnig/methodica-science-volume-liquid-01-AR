'use strict';

/* ═══════════════════════════════════════════════════════════
   methodica-science-volume-liquid-01-04 — main.js
   Part 04 of the liquid-volume lomda. 3 screens:
     S0  TransitionScreen   (companion video; clone of part-01 s10)
     S1  TextScreen          (new template — "משימת כיתה" task list)
     S2  TextInputQuestion   (local, ungraded ValueInputQuestion variant
         — free text, no correct answer/feedback/hint; continues the
         "משימת כיתה" task, reusing S1's character + speech bubble)
   Reuses the part-01 CSS component classes. Character choice is
   carried over from earlier parts via localStorage. The S2 button
   navigates onward to part 05.
   ═══════════════════════════════════════════════════════════ */

/* ─── Constants ─────────────────────────────────────────── */
const TOTAL_SCREENS = 3;  // S0–S2

/* ─── Cross-part back navigation (session-scoped route stack) ─────
   Parts are separate pages, so "which part did the learner arrive
   from" cannot live in JS memory. A sessionStorage stack records the
   route ACTUALLY taken: every forward hop pushes the part being left,
   and חזרה on S0 pops it. That matters here more than anywhere else —
   this part has two inbound edges (part 02 directly on a pass, or via
   part 03 on a fail), so a hardcoded predecessor would be wrong half
   the time.
   sessionStorage (not localStorage) is deliberate: the trail belongs to
   this browsing session, so opening a part directly in a fresh tab
   correctly has nowhere to go back to and hides its S0 back button.
   Screen-level resume is intentionally OUT OF SCOPE (owned by the
   resume branch) — back lands on the previous part's LAST screen via
   the '#last' deep link, which cold-starts that screen. ───────────── */
const LOMDA_ID      = 'methodica-science-volume-liquid-01';
const NAV_STACK_KEY = LOMDA_ID + '_navStack';
const THIS_PART     = LOMDA_ID + '-04';
const S0_BACK_ID    = 's0-back';

/* The part's last click (S2 "אפשר להמשיך"): report the component, then stop — the platform
   routes (guide §6.5, §8.12); the hop to part 05 exists only under DEV_NAV. An off-computer class
   task with no graded question: success, and NO score — a score would invent a number nobody
   measured (guide §6.4). */
function goToNextPart() {
  try { xapiEndComponent({ success: true }, document.getElementById('s2-continue')); } catch (e) {}
  goToPart(LOMDA_ID + '-05');
}

/* ─── Character carry-over (written by part 01, read here) ── */
const CHARACTER_VIDEOS = {
  'character-1': 'assets/video/Character-1-Bag.mp4',
  'character-2': 'assets/video/Character-2-Bag.mp4'
};
const CHARACTER_IMAGES = {
  'character-1': 'assets/img/character-1-happy.PNG',
  'character-2': 'assets/img/character-2-happy.png'
};
/* ─── State ─────────────────────────────────────────────── */
let currentScreen = 0;

/* ─── Scale App — fit the 1280×710 canvas to the viewport ── */
function scaleApp() {
  const app = document.getElementById('app');
  const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 710);
  app.style.transform = `scale(${scale})`;
  app.style.left = `${Math.round((window.innerWidth  - 1280 * scale) / 2)}px`;
  app.style.top  = `${Math.round((window.innerHeight - 710  * scale) / 2)}px`;
}
window.addEventListener('resize', scaleApp);
scaleApp();

/* ─── Navigation ─────────────────────────────────────────── */
function goTo(n) {
  if (n < 0 || n >= TOTAL_SCREENS) return;
  // Every feedback popup / hint overlay belongs to the screen it was opened on.
  // Hide them ALL on any navigation so none carries over to the next screen.
  document.querySelectorAll('[id$="-popup"], [id$="-hint-overlay"]')
    .forEach(el => el.classList.add('hidden'));
  const prev = document.querySelector('.screen.active');
  if (prev && window.Motion) Motion.cancel(prev);
  if (prev) prev.classList.remove('active');
  currentScreen = n;
  const next = document.getElementById('s' + n);
  if (next) next.classList.add('active');
  if (next && window.Motion) Motion.reveal(next);
  resetScreenState(n);
  /* ── 720 platform seams (guide §6.7, §8.4a), at the very end — the order above is untouched:
     paint the screen from the (possibly restored) state, open/close items, arm a save. Each is
     wrapped on its own so one failing cannot silence the others. */
  try { repaintScreen(n); } catch (e) { console.error('[resume] repaintScreen', e); }
  try { xapiOnScreen(n); } catch (e) {}
  try { scheduleResumeSave(); } catch (e) {}
}

function resetScreenState(n) {
  if (n === 0) s0Enter();
  if (n === 1) s1Enter();
  if (n === 2) s2tiEnter();
}

function goBack() {
  // S0 is this part's first screen — "back" leaves for the part the
  // learner actually came from (02 on a pass, 03 on a fail).
  if (currentScreen === 0) { goToPrevPart(); return; }
  goTo(currentScreen - 1);
}

function advanceScreen() {
  if (currentScreen + 1 >= TOTAL_SCREENS) return;  // S2 advances to part 04 via its own button
  goTo(currentScreen + 1);
}

/* ─── Keyboard Navigation ────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft')  advanceScreen();
  if (e.key === 'ArrowRight') goBack();
});

/* ═══════════════════════════════════════════════════════════
   S0 — TransitionScreen — companion video (character-dependent)
   ═══════════════════════════════════════════════════════════ */
function s0Enter() {
  const src = CHARACTER_VIDEOS[getCharacter()] || CHARACTER_VIDEOS['character-1'];
  const vid = document.getElementById('s0-video');
  if (vid) { vid.src = src; vid.load(); vid.play().catch(() => {}); freezeVideoOnEnd(vid); }
}
function advanceFromS0() { goTo(1); }

/* ═══════════════════════════════════════════════════════════
   S1 — TextWithCallout — static instructions + a character image
   that resolves per the part-01 selection. The continue button
   (advanceScreen → S2) is wired in the markup.
   ═══════════════════════════════════════════════════════════ */
function s1Enter() {
  const img = document.getElementById('s1-char-img');
  if (!img) return;
  const char = getCharacter();
  img.src = CHARACTER_IMAGES[char] || CHARACTER_IMAGES['character-1'];
  img.alt = char === 'character-2' ? 'الشخصية الزهرية سعيدة' : 'الشخصية البنفسجية سعيدة';
}

/* ═══════════════════════════════════════════════════════════
   S2 — TextInputQuestion (local, ungraded variant of
   ValueInputQuestion). No correct answer, no feedback, no hint — and
   per client QA (2026-09-24), no gate either: "אפשר להמשיך" stays
   enabled regardless of what (or whether) the learner typed. Character
   + speech bubble (same asset/component as S1) still reveal only once
   typed, and hide again if cleared back to empty — that celebratory
   reveal is unrelated to Continue and stays gated. Max 10 characters;
   a small message shows while the learner is actively trying to type
   past that limit.
   ═══════════════════════════════════════════════════════════ */
function s2tiInputChange() {
  const input = document.getElementById('s2ti-input');
  const reveal = document.getElementById('s2ti-reveal');
  if (!input) return;
  /* Character + speech bubble appear only from 2 typed characters on —
     a single letter isn't an "object" worth celebrating yet. */
  if (reveal) reveal.classList.toggle('revealed', input.value.trim().length >= 2);
  if (input.value.length < 10) s2tiHideLimitMsg();
}

/* Native maxlength silently blocks the keystroke (no 'input' event
   fires), so the "you've hit the limit" message has to be triggered
   here instead, on the attempt itself. */
function s2tiInputKeydown(e) {
  const input = e.target;
  const isPrintable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
  const noSelectionToReplace = input.selectionStart === input.selectionEnd;
  if (isPrintable && noSelectionToReplace && input.value.length >= 10) {
    s2tiShowLimitMsg();
  }
}
function s2tiShowLimitMsg() {
  document.getElementById('s2ti-limit-msg')?.classList.remove('hidden');
}
function s2tiHideLimitMsg() {
  document.getElementById('s2ti-limit-msg')?.classList.add('hidden');
}

function s2tiEnter() {
  const img = document.getElementById('s2-char-img');
  if (img) {
    const char = getCharacter();
    img.src = CHARACTER_IMAGES[char] || CHARACTER_IMAGES['character-1'];
    img.alt = char === 'character-2' ? 'الشخصية الزهرية سعيدة' : 'الشخصية البنفسجية سعيدة';
  }
  // Resume-safe: reflect whatever is already in the field (e.g. returning via back/forward)
  // rather than resetting it, since there's no "answer" state to guard/lock here.
  s2tiInputChange();
}

/* ═══════════════════════════════════════════════════════════
   Dev mode: postMessage bridge (used by index_dev.html)
   ═══════════════════════════════════════════════════════════ */
window.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'DEV_GOTO') return;
  const n = parseInt(e.data.screen, 10);
  if (!isNaN(n)) goTo(n);
});
if (window.parent !== window) {
  const count = document.querySelectorAll('.screen').length;
  window.parent.postMessage({ type: 'DEV_READY', total: count }, '*');
}

/* ─── Initial entry — load the S0 video on first paint ─────── */
s0Enter();
if (window.Motion) Motion.reveal(document.querySelector('.screen.active'));

/* S0 loads .active straight from HTML (no goTo(0) call), so this runs at
   module level rather than from resetScreenState(0). */
syncS0BackButton();
/* Deep link: '#last' lands on this part's final screen — used by the NEXT
   part's S0 back button to return here. Placed at module bottom so every
   sNEnter() and the module state they read are already initialized. */
if (location.hash === '#last') goTo(TOTAL_SCREENS - 1);
/* =======================================================
   Navigation-button width reservation
   See the "Navigation-button width consistency" block in
   css/style.css for the design rule this implements.

   Wraps each navigation button's label as
     <span class="nav-label" data-label="LABEL"><span>LABEL</span></span>
   so the CSS reserve can size the box to the SemiBold measurement.
   data-label is derived from the button's own existing text, so the
   label stays single-sourced and no duplicate accessible text node
   is added (the reserve is a ::before pseudo-element carrying
   visibility:hidden).

   Covers every button class that has a weight-changing :hover rule:
     .btn-continue  .scq-back  .scq-hint  .scq-check  .s13-continue
   .scq-check matters twice over -- it is a flex sibling of .scq-hint
   inside .scq-bar-main, so when it grows on hover it also displaces
   the hint button next to it. (.s13-continue is currently unused CSS,
   listed so that applying it later cannot silently regress.)

   A MutationObserver re-applies the wrapper automatically, because
   production relabels these buttons at runtime with
     el.textContent = '...'
   which deletes all children including the wrapper. Re-entry is safe:
   wrapNavLabel() is idempotent, so the observer seeing its own edit
   makes no further change.
   ======================================================= */
var NAV_LABEL_SELECTOR = '.btn-continue, .scq-back, .scq-hint, .scq-check, .s13-continue';
var navLabelBusy = false;

initNavLabels();

/* ═══════════════════ xAPI (720) — this part's config ═══════════════════
   Data only; the shared layer in ../unit-js/ reads it at call time (guide §6.1).
   ⚠️ SCREEN_TO_SUBCONTENT must hold exactly TOTAL_SCREENS keys (3), 0..2.
   One catalogue item (001, the class task) with NO declared question: S1 sets the task, S2 is the
   learner's free-text note about it. Nothing is graded, so nothing is 'answered' and 001 is not
   in XAPI_EVAL_ITEMS; the item still gets its initialized/completed pair. */
var SCREEN_TO_SUBCONTENT = {
  0: null,          // transition
  1: ['001', 1],    // class task: measure the desk with non-standard tools
  2: ['001', 2]     // the learner's free-text note (not a catalogued question)
};

var XAPI_COMP_SLUG     = 'methodica-science-volume-liquid-01-04';
var XAPI_COMP_ID       = XAPI_ID_PREFIX + XAPI_COMP_SLUG + '/';
var XAPI_EVAL_ITEMS    = {};              // no graded question in this part
var XAPI_METADATA_FILE = '../metadata/methodica-science-volume-liquid-01-04.json';
var XAPI_END_BTN       = 's2-continue';   // S2 "אפשר להמשיך" — the part's last click (D-8)

/* ═══════════════════ Resume (720) — the four per-part hooks ═══════════════════
   Guide §8.7. Nothing here is graded; the one piece of learner work is S2's free-text note,
   which lives only in the input field — captured from the DOM, written back by applyResumeDom,
   and its reveal re-derived by the screen's own s2tiInputChange(). */
function capturePartPayload() {
  return { currentScreen: currentScreen, note: document.getElementById('s2ti-input')?.value ?? '' };
}
function applyResumeVars(st) {}   // no state variables on these screens
function applyResumeDom(st) {
  const input = document.getElementById('s2ti-input');
  if (input && st && typeof st.note === 'string') input.value = st.note;
}
/* Must never throw (rule 7). */
function restoreScreenUI(n) {
  try { if (n === 2) s2tiInputChange(); }
  catch (e) { console.error('[resume] restoreScreenUI ' + n, e); }
}