'use strict';

/* ═══════════════════════════════════════════════════════════
   methodica-science-volume-liquid-01-06 — main.js
   Part 06 of the liquid-volume lomda. 6 screens so far:
     S0  TransitionScreen (companion video) — slide 40, last slide of
         the deck. Intro to this part's peak question (שאלת השיא),
         which will follow as later screens of this same part.
     S1  Reference-materials screen (Figma 2515:6338) — two recipe
         photos (1950 handwritten vs. modern online) + a unit-
         conversion table the learner needs for the peak question.
         No interaction beyond continue/back; continue is enabled
         from the start.
     S2  SingleChoiceQuestion (Figma 2515:6476 / 2519:1069) — section
         א׳ of the peak question. Introduces the "אפשר להיזכר
         במתכונים?" recall button (always visible, opens a shared
         modal reopening S1's exact content) alongside the standard
         hint.
     S3  SingleChoiceQuestionImage (Figma 2519:6057) — section ב׳.
         Same shape as S2 plus a content image (baked cake photo).
         Uses the same shared recall popup as S2.
     S4  SingleChoiceQuestion (Figma 2520:1164) — section ג׳. No
         content image, same shape as S2. Uses the same shared
         recall popup.
     S5  SingleChoiceQuestion, image-choice variant (same component
         as part-02's #s1) — section ד׳, the last part of the peak
         question. 4 image cards instead of text pills. Uses the
         same shared recall popup.
   Character choice is carried over from earlier parts via
   localStorage.
   ═══════════════════════════════════════════════════════════ */

/* ─── Constants ─────────────────────────────────────────── */
const TOTAL_SCREENS = 6;  // S0–S5 — bump as more slides from the deck are implemented

/* ─── Cross-part back navigation (session-scoped route stack) ─────
   Parts are separate pages, so "which part did the learner arrive from"
   cannot live in JS memory. A sessionStorage stack records the route
   ACTUALLY taken: every forward hop pushes the part being left, and
   חזרה on S0 pops it. The unit's route branches upstream (part 04 is
   reachable from part 02 or part 03), so a hardcoded predecessor cannot
   express the real route — hence a stack rather than the constant this
   replaces.
   sessionStorage (not localStorage) is deliberate: the trail belongs to
   this browsing session, so opening a part directly in a fresh tab
   correctly has nowhere to go back to and hides its S0 back button.
   Screen-level resume is intentionally OUT OF SCOPE (owned by the resume
   branch) — back lands on the previous part's LAST screen via the
   '#last' deep link, which cold-starts that screen. ───────────────── */
const LOMDA_ID      = 'methodica-science-volume-liquid-01';
const NAV_STACK_KEY = LOMDA_ID + '_navStack';
const THIS_PART     = LOMDA_ID + '-06';
const S0_BACK_ID    = 's0-back';

/* Onward navigation to the next part (extra practice on a failed peak
   question — see the S5 routing in advanceScreen). */
function goToNextPart() { goToPart(LOMDA_ID + '-07'); }

/* S0 companion character video — asset map keyed by the producer-defined
   character IDs from part 01's selection screen (never hardcode a
   character asset). Producer notes: character-1 (purple) → Challenge
   video 1; character-2 (pink) → Challenge video 2. */
const S0_CHARACTER_VIDEOS = {
  'character-1': 'assets/video/Character-1-Challenge.mp4',
  'character-2': 'assets/video/Character-2-Challenge.mp4'
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
/* Screen number → its feedback popup element id, for screens that have one.
   Used to restore a popup the learner left open (not X-closed) — see below. */
const SCREEN_POPUP_ID = { 2: 's2q-popup', 3: 's3q-popup', 4: 's4q-popup', 5: 's5q-popup' };
/* Screen number → whether that screen's question has actually been resolved
   (correct, or final wrong) — same "is this question done" check each screen's
   own resetScreenState() branch already uses to decide fresh-reset vs. resume.
   The popup-reopen below must only fire when this is true: reopening a
   "try again" popup over a board that a *not-done* screen's own reset just
   wiped back to blank would show stale feedback for an empty board. */
const SCREEN_DONE = { 2: () => s2qDone, 3: () => s3qDone, 4: () => s4qDone, 5: () => s5qDone };
function goTo(n) {
  if (n < 0 || n >= TOTAL_SCREENS) return;
  // Every feedback popup / hint overlay belongs to the screen it was opened on.
  // Hide them ALL on any navigation so none carries over to the next screen.
  document.querySelectorAll('[id$="-popup"], [id$="-hint-overlay"]')
    .forEach(el => el.classList.add('hidden'));
  // The recipe-reminder popup is a single shared overlay (not per-screen
  // suffixed) reused by every section's recall button — close it too.
  document.getElementById('recall-overlay')?.classList.add('hidden');
  const prev = document.querySelector('.screen.active');
  if (prev && window.Motion) Motion.cancel(prev);
  if (prev) prev.classList.remove('active');
  currentScreen = n;
  const next = document.getElementById('s' + n);
  if (next) next.classList.add('active');
  if (next && window.Motion) Motion.reveal(next);
  resetScreenState(n);
  // Reopen this screen's own feedback popup whenever the learner returns to an
  // already-RESOLVED screen. Feedback has no close button, so "did the learner
  // dismiss it?" is no longer a question — the screen's existing *Done
  // resume-state guard (SCREEN_DONE) is the only gate. resetScreenState() above
  // already restored the locked/answered visual state; this only restores the
  // popup itself, at its default position, without re-running any check logic.
  const enterPopupId = SCREEN_POPUP_ID[n];
  if (enterPopupId && (SCREEN_DONE[n] ? SCREEN_DONE[n]() : false)) {
    const enterPopup = document.getElementById(enterPopupId);
    if (enterPopup) {
      resetPopupPosition(enterPopup);
      enterPopup.classList.remove('hidden');
    }
  }
  /* ── 720 platform seams (guide §6.7, §8.4a), at the very end — the order above is untouched:
     paint the screen from the (possibly restored) state, open/close items, arm a save. Each is
     wrapped on its own so one failing cannot silence the others. */
  try { repaintScreen(n); } catch (e) { console.error('[resume] repaintScreen', e); }
  try { xapiOnScreen(n); } catch (e) {}
  try { scheduleResumeSave(); } catch (e) {}
}

function resetScreenState(n) {
  if (n === 0) s0Enter();
  if (n === 2) s2qEnter();
  if (n === 3) s3qEnter();
  if (n === 4) s4qEnter();
  if (n === 5) s5qEnter();
}

function goBack() {
  if (currentScreen === 0) { goToPrevPart(); return; }
  goTo(currentScreen - 1);
}

/* ─── Peak-question score (4 sub-questions, S2–S5) ──────────
   Each sXqFinish records its result here; pass = ≥3/4 correct. */
const peakResults = { 2: null, 3: null, 4: null, 5: null };
function peakScore() {
  return Object.values(peakResults).filter(r => r === 'correct').length;
}

function advanceScreen() {
  if (currentScreen === 2 && !s2qAnswered) return;
  if (currentScreen === 3 && !s3qAnswered) return;
  if (currentScreen === 4 && !s4qAnswered) return;
  if (currentScreen === 5 && !s5qAnswered) return;
  // S5 is the part's last screen. Its "שנמשיך?" is the last click: report the component on
  // BOTH outcomes, before the branch (guide §6.5) — success = at least 3 of the 4 sections, as
  // S0 promises; score = sections correct / 4. The platform routes; the DEV-only hop below sends
  // a failing walkthrough on to the second peak question (part 07).
  if (currentScreen === 5) {
    const score = peakScore();
    try {
      xapiEndComponent(partResult(), document.getElementById('s5q-check'));
    } catch (e) {}
    if (score < 3) goToNextPart();
    return;
  }
  if (currentScreen + 1 >= TOTAL_SCREENS) return;
  goTo(currentScreen + 1);
}

/* ═══════════════════════════════════════════════════════════
   Shared — dismiss a "try again" feedback popup the moment the
   learner starts CORRECTING the answer outside the popup (clicking
   another option / focusing an input / opening a dropdown). Fires
   only while the question is still answerable (done=false): correct
   and final-wrong feedback are never dismissed this way, and clicks
   inside the popup, dragging, hint, recall, zoom and navigation are
   untouched. The correcting action itself proceeds in the SAME click
   — this only hides the popup alongside it.
   NOTE: 720-templates candidate — this behavior belongs to the
   shared question templates (SingleChoiceQuestion, DropdownQuestion,
   ValueInputQuestion, MultipleChoiceQuestion) and should move into
   720-templates once approved.
   ═══════════════════════════════════════════════════════════ */
/* ─── Keyboard Navigation ────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft')  advanceScreen();
  if (e.key === 'ArrowRight') goBack();
  if (e.key === 'Escape') {
    s2qCloseHint();
    s3qCloseHint();
    s4qCloseHint();
    s5qCloseHint();
    closeRecallPopup();
    closeImageZoom();
  }
});

/* ═══════════════════════════════════════════════════════════
   GLOBAL COMPONENT — Image zoom (clone-based modal). Any
   [data-zoom-src] button opens the shared #img-zoom-modal; any
   [data-zoom-close="true"] (backdrop, X) closes it. Escape also
   closes it (wired above). Optional per-image title via
   data-zoom-caption.

   Clone sizing: measured from the source wrapper's own rendered
   size (getBoundingClientRect) then divided by #app's own
   scaleApp() zoom factor, since the modal lives inside #app and is
   therefore subject to that same ancestor transform — using the
   raw viewport-pixel measurement directly would double-apply that
   zoom once the ancestor transform renders it.
   ═══════════════════════════════════════════════════════════ */
function openImageZoom(btn) {
  const modal   = document.getElementById('img-zoom-modal');
  const stage   = document.getElementById('img-zoom-modal-stage');
  const caption = document.getElementById('img-zoom-modal-caption');
  if (!modal || !stage || !btn) return;
  const wrapper = btn.closest('.scq-img-inner');
  if (!wrapper) return;
  const clone = wrapper.cloneNode(true);
  clone.querySelectorAll('.img-zoom-btn').forEach(b => b.remove());
  clone.classList.add('img-zoom-clone');

  if (caption) caption.textContent = btn.dataset.zoomCaption || '';

  stage.innerHTML = '';
  stage.appendChild(clone);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  const appEl = document.getElementById('app');
  const scaleMatch = appEl ? appEl.style.transform.match(/scale\(([^)]+)\)/) : null;
  const appScale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;

  const rect = wrapper.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const srcW = rect.width  / appScale;
  const srcH = rect.height / appScale;
  const pad = 20;
  const maxW = stageRect.width  / appScale - pad * 2;
  const maxH = stageRect.height / appScale - pad * 2;
  if (srcW && srcH && maxW > 0 && maxH > 0) {
    const scale = Math.min(maxW / srcW, maxH / srcH);
    clone.style.width = srcW + 'px';
    clone.style.height = srcH + 'px';
    clone.style.transform = 'scale(' + scale + ')';
  }
}

function closeImageZoom() {
  const modal   = document.getElementById('img-zoom-modal');
  const stage   = document.getElementById('img-zoom-modal-stage');
  const caption = document.getElementById('img-zoom-modal-caption');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  if (stage) stage.innerHTML = '';
  if (caption) caption.textContent = '';
}

document.addEventListener('click', function (e) {
  const openBtn = e.target.closest('[data-zoom-src]');
  if (openBtn) { openImageZoom(openBtn); return; }
  if (e.target.closest('[data-zoom-close="true"]')) closeImageZoom();
});

/* ═══════════════════════════════════════════════════════════
   GLOBAL — Recipe-reminder popup, shared by every section's "אפשר
   להיזכר במתכונים?" button (S2 onward). Always available from the
   start (producer instruction) — never gated. One overlay instance
   reused across the whole multi-part question, not duplicated per
   screen; reopens S1's exact content regardless of which section
   opened it.
   ═══════════════════════════════════════════════════════════ */
function openRecallPopup() {
  document.getElementById('recall-overlay')?.classList.remove('hidden');
}
function closeRecallPopup() {
  document.getElementById('recall-overlay')?.classList.add('hidden');
}
function closeRecallPopupOnBackdrop(e) {
  if (e.target && e.target.id === 'recall-overlay') closeRecallPopup();
}

/* ═══════════════════════════════════════════════════════════
   Shared — draggable feedback popup (any #id) + reset helper
   ═══════════════════════════════════════════════════════════ */
let popupDrag = null;   // { id, offX, offY }
function popupMouseDown(e, id) {
  const popup = document.getElementById(id);
  const app   = document.getElementById('app');
  if (!popup || !app) return;
  const appLeft = parseFloat(app.style.left) || 0;
  const appTop  = parseFloat(app.style.top)  || 0;
  const m       = app.style.transform.match(/scale\(([^)]+)\)/);
  const scale   = m ? parseFloat(m[1]) : 1;
  const cx = (e.clientX - appLeft) / scale;
  const cy = (e.clientY - appTop)  / scale;
  const topPx = parseFloat(popup.style.top);
  const top   = isNaN(topPx) ? popup.offsetTop : topPx;
  popup.style.top = top + 'px';
  popup.style.bottom = 'auto';
  popupDrag = { id: id, offX: cx - (parseFloat(popup.style.left) || 2), offY: cy - top };
  e.preventDefault();
}
/* Pointer events, not mouse events: popupMouseDown runs on pointerdown and calls
   preventDefault(), which suppresses the compatibility mouse events of that press,
   so a mouseup listener never fired and the popup stayed glued to the cursor. */
window.addEventListener('pointermove', e => {
  if (!popupDrag) return;
  if (e.buttons === 0) { popupDrag = null; return; }   /* release was missed: never follow a free cursor */
  const popup = document.getElementById(popupDrag.id);
  const app   = document.getElementById('app');
  if (!popup || !app) return;
  const appLeft = parseFloat(app.style.left) || 0;
  const appTop  = parseFloat(app.style.top)  || 0;
  const m       = app.style.transform.match(/scale\(([^)]+)\)/);
  const scale   = m ? parseFloat(m[1]) : 1;
  const nx = (e.clientX - appLeft) / scale - popupDrag.offX;
  const ny = (e.clientY - appTop)  / scale - popupDrag.offY;
  popup.style.left = Math.max(0, Math.min(nx, 1280 - popup.offsetWidth)) + 'px';
  popup.style.top  = Math.max(0, Math.min(ny, 710 - 74 - popup.offsetHeight)) + 'px';
});
window.addEventListener('pointerup',     () => { popupDrag = null; });
window.addEventListener('pointercancel', () => { popupDrag = null; });

/* ═══════════════════════════════════════════════════════════
   S0 — TransitionScreen — companion video (character-dependent)
   ═══════════════════════════════════════════════════════════ */
function s0Enter() {
  const vid = document.getElementById('s0-video');
  if (!vid) return;
  const char = getCharacter();
  const src = S0_CHARACTER_VIDEOS[char] || S0_CHARACTER_VIDEOS['character-1'];
  if (!vid.src || !vid.src.endsWith(src)) {
    vid.src = src;
    vid.load();
  }
  vid.play().catch(() => {});
  freezeVideoOnEnd(vid);
}
function advanceFromS0() { goTo(1); }

/* ═══════════════════════════════════════════════════════════
   S2 — SingleChoiceQuestion (section א׳ of the peak question).
   Hint hidden until the first wrong attempt. 2 attempts. Correct:
   a (240 מ״ל). Second help affordance — .s2q-recall-btn — opens the
   shared recipe-reminder modal (openRecallPopup, global — see below)
   instead of hint text; it does not affect scoring/attempts. Unlike
   the standard hint, it is available from the very start (producer
   instruction) — never gated behind a wrong attempt. This policy
   applies to every section of this multi-part question: the recall
   button always starts visible/enabled.
   ═══════════════════════════════════════════════════════════ */
const S2Q = { correctId: 'a', maxAttempts: 2 };
let s2qSelected = null;
let s2qAttempts = 0;
let s2qAnswered = false;
let s2qDone     = false;
let s2qLastWrong = null;  // option id marked wrong on a non-final attempt (gates re-check)

const S2Q_POPUP_CFG = {
  retry: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.'],
    body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
  },
  correct: {
    bg: '#edf8ed',
    title: ['الإجابة صحيحة‎.'],
    body: ['كوب واحد من أكواب الجدة = 240 ملل.', 'الوصفة الحديثة = 250 ملل.', 'الفرق هو 10 ملل.']
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.', 'الإجابة الصحيحة معلَّمة.'],
    body: ['كوب واحد من أكواب الجدة = 240 ملل.', 'الوصفة الحديثة = 250 ملل.', 'الفرق هو 10 ملل.']
  }
};

function s2qSelect(id) {
  if (s2qAnswered) return;
  dismissRetryPopup('s2q-popup', s2qDone);
  s2qSelected = id;
  if (s2qAttempts > 0) {
    document.querySelectorAll('#s2 .scq-opt').forEach(o => o.classList.remove('wrong', 'correct'));
  }
  document.querySelectorAll('#s2 .scq-opt').forEach(o => {
    const sel = o.dataset.id === id;
    o.classList.toggle('selected', sel);
    o.setAttribute('aria-checked', sel ? 'true' : 'false');
  });
  const chk = document.getElementById('s2q-check');
  if (chk && !s2qAnswered) chk.disabled = !s2qSelected || s2qSelected === s2qLastWrong;
}

function s2qCheck() {
  if (s2qAnswered) { advanceScreen(); return; }
  if (!s2qSelected) return;

  s2qAttempts++;
  const isCorrect = s2qSelected === S2Q.correctId;
  xapiAnswered('001', 'q1', isCorrect, isCorrect || s2qAttempts >= S2Q.maxAttempts,
    xapiAnswerText(document.querySelector('#s2 .scq-opt[data-id="' + s2qSelected + '"]')));

  if (isCorrect) {
    s2qMark(S2Q.correctId, 'correct');
    s2qShowPopup('correct');
    s2qFinish('correct');
  } else if (s2qAttempts >= S2Q.maxAttempts) {
    s2qMark(S2Q.correctId, 'correct');
    s2qMark(s2qSelected, 'wrong');
    s2qShowPopup('wrong2');
    s2qFinish('incorrect');
  } else {
    s2qMark(s2qSelected, 'wrong');
    /* Re-check stays disabled until the learner picks a DIFFERENT option */
    s2qLastWrong = s2qSelected;
    const chk = document.getElementById('s2q-check');
    if (chk) chk.disabled = true;
    s2qShowPopup('retry');
    const hint = document.getElementById('s2q-hint');
    if (hint) hint.style.visibility = 'visible';
    // .s2q-recall is visible from the start (producer instruction), not
    // gated like the standard hint — nothing to reveal here.
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

function s2qMark(id, cls) {
  const opt = document.querySelector('#s2 .scq-opt[data-id="' + id + '"]');
  if (!opt) return;
  opt.classList.remove('selected');
  opt.classList.add(cls);
}

function s2qShowPopup(type) {
  const popup = document.getElementById('s2q-popup');
  if (!popup) return;
  const cfg = S2Q_POPUP_CFG[type];
  popup.style.background = cfg.bg;
  resetPopupPosition(popup);
  const titleEl = document.getElementById('s2q-popup-title');
  if (titleEl) titleEl.innerHTML = cfg.title.map(t => '<p>' + t + '</p>').join('');
  const bodyEl = document.getElementById('s2q-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  popup.classList.remove('hidden');
}


function s2qFinish(resultState) {
  peakResults[2] = resultState;
  s2qAnswered = true;
  s2qDone = true;
  document.querySelectorAll('#s2 .scq-opt').forEach(o => { o.disabled = true; });
  const chk = document.getElementById('s2q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s2q-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s2q-hint-overlay')?.classList.add('hidden');
  const recall = document.getElementById('s2q-recall');
  if (recall) recall.style.visibility = 'hidden';
  closeRecallPopup();
}

function s2qOpenHint() {
  if (s2qAnswered) return;
  /* xAPI requested.1 — after the guard, right before the reveal; this function only opens. */
  xapiRequestedHint('001', 'q1');
  document.getElementById('s2q-hint-overlay')?.classList.remove('hidden');
}
function s2qCloseHint() {
  document.getElementById('s2q-hint-overlay')?.classList.add('hidden');
}
function s2qCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 's2q-hint-overlay') s2qCloseHint();
}

function s2qResetInitial() {
  s2qSelected = null;
  s2qAttempts = 0;
  s2qAnswered = false;
  s2qLastWrong = null;
  document.querySelectorAll('#s2 .scq-opt').forEach(o => {
    o.classList.remove('selected', 'correct', 'wrong');
    o.disabled = false;
    o.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s2q-popup')?.classList.add('hidden');
  const chk = document.getElementById('s2q-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('s2q-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = 'hidden'; }
  // .s2q-recall is available from the start (producer instruction) —
  // unlike the standard hint, it's never hidden pre-attempt.
  const recall = document.getElementById('s2q-recall');
  if (recall) { recall.disabled = false; recall.style.visibility = 'visible'; }
}

function s2qEnter() {
  if (!s2qDone) s2qResetInitial();
  document.getElementById('s2q-hint-overlay')?.classList.add('hidden');
  closeRecallPopup();
}

/* ═══════════════════════════════════════════════════════════
   S3 — SingleChoiceQuestionImage (section ב׳ of the peak question).
   Hint hidden until the first wrong attempt. 2 attempts. Correct:
   b (כמעט זהה). Recall button (.s2q-recall-btn, shared styling)
   opens the same global recall popup as S2 — always visible from
   the start, same as every section.
   ═══════════════════════════════════════════════════════════ */
const S3Q = { correctId: 'b', maxAttempts: 2 };
let s3qSelected = null;
let s3qAttempts = 0;
let s3qAnswered = false;
let s3qDone     = false;
let s3qLastWrong = null;  // option id marked wrong on a non-final attempt (gates re-check)

const S3Q_POPUP_CFG = {
  retry: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.'],
    body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
  },
  correct: {
    bg: '#edf8ed',
    title: ['الإجابة صحيحة‎.'],
    body: ['الفرق بين 240 و-250 هو 10 ملل، أي نحو %4.', 'في الكعكة هذا مقبول، لكن في دواء لطفل، الفرق %4 قد يكون خطيرًا‎.']
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.', 'الإجابة الصحيحة معلَّمة.'],
    body: ['الفرق بين 240 و-250 هو 10 ملل، أي نحو %4.', 'في الكعكة هذا مقبول، لكن في دواء لطفل، الفرق %4 قد يكون خطيرًا‎.']
  }
};

function s3qSelect(id) {
  if (s3qAnswered) return;
  dismissRetryPopup('s3q-popup', s3qDone);
  s3qSelected = id;
  if (s3qAttempts > 0) {
    document.querySelectorAll('#s3 .scq-opt').forEach(o => o.classList.remove('wrong', 'correct'));
  }
  document.querySelectorAll('#s3 .scq-opt').forEach(o => {
    const sel = o.dataset.id === id;
    o.classList.toggle('selected', sel);
    o.setAttribute('aria-checked', sel ? 'true' : 'false');
  });
  const chk = document.getElementById('s3q-check');
  if (chk && !s3qAnswered) chk.disabled = !s3qSelected || s3qSelected === s3qLastWrong;
}

function s3qCheck() {
  if (s3qAnswered) { advanceScreen(); return; }
  if (!s3qSelected) return;

  s3qAttempts++;
  const isCorrect = s3qSelected === S3Q.correctId;
  xapiAnswered('001', 'q2', isCorrect, isCorrect || s3qAttempts >= S3Q.maxAttempts,
    xapiAnswerText(document.querySelector('#s3 .scq-opt[data-id="' + s3qSelected + '"]')));

  if (isCorrect) {
    s3qMark(S3Q.correctId, 'correct');
    s3qShowPopup('correct');
    s3qFinish('correct');
  } else if (s3qAttempts >= S3Q.maxAttempts) {
    s3qMark(S3Q.correctId, 'correct');
    s3qMark(s3qSelected, 'wrong');
    s3qShowPopup('wrong2');
    s3qFinish('incorrect');
  } else {
    s3qMark(s3qSelected, 'wrong');
    /* Re-check stays disabled until the learner picks a DIFFERENT option */
    s3qLastWrong = s3qSelected;
    const chk = document.getElementById('s3q-check');
    if (chk) chk.disabled = true;
    s3qShowPopup('retry');
    const hint = document.getElementById('s3q-hint');
    if (hint) hint.style.visibility = 'visible';
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

function s3qMark(id, cls) {
  const opt = document.querySelector('#s3 .scq-opt[data-id="' + id + '"]');
  if (!opt) return;
  opt.classList.remove('selected');
  opt.classList.add(cls);
}

function s3qShowPopup(type) {
  const popup = document.getElementById('s3q-popup');
  if (!popup) return;
  const cfg = S3Q_POPUP_CFG[type];
  popup.style.background = cfg.bg;
  resetPopupPosition(popup);
  const titleEl = document.getElementById('s3q-popup-title');
  if (titleEl) titleEl.innerHTML = cfg.title.map(t => '<p>' + t + '</p>').join('');
  const bodyEl = document.getElementById('s3q-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  popup.classList.remove('hidden');
}


function s3qFinish(resultState) {
  peakResults[3] = resultState;
  s3qAnswered = true;
  s3qDone = true;
  document.querySelectorAll('#s3 .scq-opt').forEach(o => { o.disabled = true; });
  const chk = document.getElementById('s3q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s3q-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s3q-hint-overlay')?.classList.add('hidden');
  const recall = document.getElementById('s3q-recall');
  if (recall) recall.style.visibility = 'hidden';
  closeRecallPopup();
}

function s3qOpenHint() {
  if (s3qAnswered) return;
  /* xAPI requested.1 — after the guard, right before the reveal; this function only opens. */
  xapiRequestedHint('001', 'q2');
  document.getElementById('s3q-hint-overlay')?.classList.remove('hidden');
}
function s3qCloseHint() {
  document.getElementById('s3q-hint-overlay')?.classList.add('hidden');
}
function s3qCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 's3q-hint-overlay') s3qCloseHint();
}

function s3qResetInitial() {
  s3qSelected = null;
  s3qAttempts = 0;
  s3qAnswered = false;
  s3qLastWrong = null;
  document.querySelectorAll('#s3 .scq-opt').forEach(o => {
    o.classList.remove('selected', 'correct', 'wrong');
    o.disabled = false;
    o.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s3q-popup')?.classList.add('hidden');
  const chk = document.getElementById('s3q-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('s3q-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = 'hidden'; }
  const recall = document.getElementById('s3q-recall');
  if (recall) { recall.disabled = false; recall.style.visibility = 'visible'; }
}

function s3qEnter() {
  if (!s3qDone) s3qResetInitial();
  document.getElementById('s3q-hint-overlay')?.classList.add('hidden');
  closeRecallPopup();
}

/* ═══════════════════════════════════════════════════════════
   S4 — SingleChoiceQuestion (section ג׳ of the peak question). No
   content image, same shape as S2. Hint hidden until the first
   wrong attempt. 2 attempts. Correct: c. Recall button (shared
   styling) opens the same global recall popup, always visible from
   the start, same as every section.
   ═══════════════════════════════════════════════════════════ */
const S4Q = { correctId: 'c', maxAttempts: 2 };
let s4qSelected = null;
let s4qAttempts = 0;
let s4qAnswered = false;
let s4qDone     = false;
let s4qLastWrong = null;  // option id marked wrong on a non-final attempt (gates re-check)

const S4Q_POPUP_CFG = {
  retry: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.'],
    body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
  },
  correct: {
    bg: '#edf8ed',
    title: ['الإجابة صحيحة‎.'],
    body: ['المعايير الدولية تضمن قياسًا موحدًا ودقيقًا. عندما تكون الكمية الدقيقة معروفة، يمكن إعادة إعداد الكعكة (أو الدواء) بنفس الطريقة في أي مكان في العالم‎.']
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.', 'الإجابة الصحيحة معلَّمة.'],
    body: ['المعايير الدولية تضمن قياسًا موحدًا ودقيقًا. عندما تكون الكمية الدقيقة معروفة، يمكن إعادة إعداد الكعكة (أو الدواء) بنفس الطريقة في أي مكان في العالم‎.']
  }
};

function s4qSelect(id) {
  if (s4qAnswered) return;
  dismissRetryPopup('s4q-popup', s4qDone);
  s4qSelected = id;
  if (s4qAttempts > 0) {
    document.querySelectorAll('#s4 .scq-opt').forEach(o => o.classList.remove('wrong', 'correct'));
  }
  document.querySelectorAll('#s4 .scq-opt').forEach(o => {
    const sel = o.dataset.id === id;
    o.classList.toggle('selected', sel);
    o.setAttribute('aria-checked', sel ? 'true' : 'false');
  });
  const chk = document.getElementById('s4q-check');
  if (chk && !s4qAnswered) chk.disabled = !s4qSelected || s4qSelected === s4qLastWrong;
}

function s4qCheck() {
  if (s4qAnswered) { advanceScreen(); return; }
  if (!s4qSelected) return;

  s4qAttempts++;
  const isCorrect = s4qSelected === S4Q.correctId;
  xapiAnswered('001', 'q3', isCorrect, isCorrect || s4qAttempts >= S4Q.maxAttempts,
    xapiAnswerText(document.querySelector('#s4 .scq-opt[data-id="' + s4qSelected + '"]')));

  if (isCorrect) {
    s4qMark(S4Q.correctId, 'correct');
    s4qShowPopup('correct');
    s4qFinish('correct');
  } else if (s4qAttempts >= S4Q.maxAttempts) {
    s4qMark(S4Q.correctId, 'correct');
    s4qMark(s4qSelected, 'wrong');
    s4qShowPopup('wrong2');
    s4qFinish('incorrect');
  } else {
    s4qMark(s4qSelected, 'wrong');
    /* Re-check stays disabled until the learner picks a DIFFERENT option */
    s4qLastWrong = s4qSelected;
    const chk = document.getElementById('s4q-check');
    if (chk) chk.disabled = true;
    s4qShowPopup('retry');
    const hint = document.getElementById('s4q-hint');
    if (hint) hint.style.visibility = 'visible';
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

function s4qMark(id, cls) {
  const opt = document.querySelector('#s4 .scq-opt[data-id="' + id + '"]');
  if (!opt) return;
  opt.classList.remove('selected');
  opt.classList.add(cls);
}

function s4qShowPopup(type) {
  const popup = document.getElementById('s4q-popup');
  if (!popup) return;
  const cfg = S4Q_POPUP_CFG[type];
  popup.style.background = cfg.bg;
  resetPopupPosition(popup);
  const titleEl = document.getElementById('s4q-popup-title');
  if (titleEl) titleEl.innerHTML = cfg.title.map(t => '<p>' + t + '</p>').join('');
  const bodyEl = document.getElementById('s4q-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  popup.classList.remove('hidden');
}


function s4qFinish(resultState) {
  peakResults[4] = resultState;
  s4qAnswered = true;
  s4qDone = true;
  document.querySelectorAll('#s4 .scq-opt').forEach(o => { o.disabled = true; });
  const chk = document.getElementById('s4q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s4q-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s4q-hint-overlay')?.classList.add('hidden');
  const recall = document.getElementById('s4q-recall');
  if (recall) recall.style.visibility = 'hidden';
  closeRecallPopup();
}

function s4qOpenHint() {
  if (s4qAnswered) return;
  /* xAPI requested.1 — after the guard, right before the reveal; this function only opens. */
  xapiRequestedHint('001', 'q3');
  document.getElementById('s4q-hint-overlay')?.classList.remove('hidden');
}
function s4qCloseHint() {
  document.getElementById('s4q-hint-overlay')?.classList.add('hidden');
}
function s4qCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 's4q-hint-overlay') s4qCloseHint();
}

function s4qResetInitial() {
  s4qSelected = null;
  s4qAttempts = 0;
  s4qAnswered = false;
  s4qLastWrong = null;
  document.querySelectorAll('#s4 .scq-opt').forEach(o => {
    o.classList.remove('selected', 'correct', 'wrong');
    o.disabled = false;
    o.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s4q-popup')?.classList.add('hidden');
  const chk = document.getElementById('s4q-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('s4q-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = 'hidden'; }
  const recall = document.getElementById('s4q-recall');
  if (recall) { recall.disabled = false; recall.style.visibility = 'visible'; }
}

function s4qEnter() {
  if (!s4qDone) s4qResetInitial();
  document.getElementById('s4q-hint-overlay')?.classList.add('hidden');
  closeRecallPopup();
}

/* ═══════════════════════════════════════════════════════════
   S5 — SingleChoiceQuestion, image-choice variant (section ד׳ of
   the peak question, same component as part-02's #s1). Hint hidden
   until the first wrong attempt. 2 attempts. Correct: cylinder
   (משורת 50 מ״ל). Recall button opens the same global recall popup,
   always visible from the start, same as every section.
   ═══════════════════════════════════════════════════════════ */
const S5Q = { correctId: 'cylinder', maxAttempts: 2 };
let s5qSelected = null;
let s5qAttempts = 0;
let s5qAnswered = false;
let s5qDone     = false;
let s5qLastWrong = null;  // card id marked wrong on a non-final attempt (gates re-check)

const S5Q_POPUP_CFG = {
  retry: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.'],
    body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
  },
  correct: {
    bg: '#edf8ed',
    title: ['الإجابة صحيحة‎.'],
    body: [
      'المخبار المدرّج هو الأداة الأنسب‎.',
      'الدورق لا يمكّننا من قياس 15 ملل‎.',
      'ملعقة المطبخ ليست معيارية (تذكروا قصة ملعقة المطبخ)‎.',
      'ملعقة القياس الطبية مناسبة من الناحية التقنية، لكن استخدامها بهذه الطريقة صعب ويزيد احتمال الأخطاء‎.'
    ]
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.', 'الإجابة الصحيحة معلَّمة.'],
    body: [
      'المخبار المدرّج هو الأداة الأنسب‎.',
      'الدورق لا يمكّننا من قياس 15 ملل‎.',
      'ملعقة المطبخ ليست معيارية (تذكروا قصة ملعقة المطبخ)‎.',
      'ملعقة القياس الطبية مناسبة من الناحية التقنية، لكن استخدامها بهذه الطريقة صعب ويزيد احتمال الأخطاء‎.'
    ]
  }
};

function s5qSelect(id) {
  if (s5qAnswered) return;
  dismissRetryPopup('s5q-popup', s5qDone);
  s5qSelected = id;
  if (s5qAttempts > 0) {
    document.querySelectorAll('#s5 .s5q-card').forEach(o => o.classList.remove('wrong', 'correct'));
  }
  document.querySelectorAll('#s5 .s5q-card').forEach(o => {
    const sel = o.dataset.id === id;
    o.classList.toggle('selected', sel);
    o.setAttribute('aria-checked', sel ? 'true' : 'false');
  });
  const chk = document.getElementById('s5q-check');
  if (chk && !s5qAnswered) chk.disabled = !s5qSelected || s5qSelected === s5qLastWrong;
}

function s5qCheck() {
  if (s5qAnswered) { advanceScreen(); return; }
  if (!s5qSelected) return;

  s5qAttempts++;
  const isCorrect = s5qSelected === S5Q.correctId;
  xapiAnswered('001', 'q4', isCorrect, isCorrect || s5qAttempts >= S5Q.maxAttempts,
    xapiAnswerText(document.querySelector('#s5 .s5q-card[data-id="' + s5qSelected + '"]')));

  if (isCorrect) {
    s5qMark(S5Q.correctId, 'correct');
    s5qShowPopup('correct');
    s5qFinish('correct');
  } else if (s5qAttempts >= S5Q.maxAttempts) {
    s5qMark(S5Q.correctId, 'correct');
    s5qMark(s5qSelected, 'wrong');
    s5qShowPopup('wrong2');
    s5qFinish('incorrect');
  } else {
    s5qMark(s5qSelected, 'wrong');
    /* Re-check stays disabled until the learner picks a DIFFERENT option */
    s5qLastWrong = s5qSelected;
    const chk = document.getElementById('s5q-check');
    if (chk) chk.disabled = true;
    s5qShowPopup('retry');
    const hint = document.getElementById('s5q-hint');
    if (hint) hint.style.visibility = 'visible';
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

function s5qMark(id, cls) {
  const opt = document.querySelector('#s5 .s5q-card[data-id="' + id + '"]');
  if (!opt) return;
  opt.classList.remove('selected');
  opt.classList.add(cls);
}

function s5qShowPopup(type) {
  const popup = document.getElementById('s5q-popup');
  if (!popup) return;
  const cfg = S5Q_POPUP_CFG[type];
  popup.style.background = cfg.bg;
  resetPopupPosition(popup);
  const titleEl = document.getElementById('s5q-popup-title');
  if (titleEl) titleEl.innerHTML = cfg.title.map(t => '<p>' + t + '</p>').join('');
  const bodyEl = document.getElementById('s5q-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  popup.classList.remove('hidden');
}


function s5qFinish(resultState) {
  peakResults[5] = resultState;
  s5qAnswered = true;
  s5qDone = true;
  document.querySelectorAll('#s5 .s5q-card').forEach(o => { o.disabled = true; });
  const chk = document.getElementById('s5q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s5q-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s5q-hint-overlay')?.classList.add('hidden');
  const recall = document.getElementById('s5q-recall');
  if (recall) recall.style.visibility = 'hidden';
  closeRecallPopup();
}

function s5qOpenHint() {
  if (s5qAnswered) return;
  /* xAPI requested.1 — after the guard, right before the reveal; this function only opens. */
  xapiRequestedHint('001', 'q4');
  document.getElementById('s5q-hint-overlay')?.classList.remove('hidden');
}
function s5qCloseHint() {
  document.getElementById('s5q-hint-overlay')?.classList.add('hidden');
}
function s5qCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 's5q-hint-overlay') s5qCloseHint();
}

function s5qResetInitial() {
  s5qSelected = null;
  s5qAttempts = 0;
  s5qAnswered = false;
  s5qLastWrong = null;
  document.querySelectorAll('#s5 .s5q-card').forEach(o => {
    o.classList.remove('selected', 'correct', 'wrong');
    o.disabled = false;
    o.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s5q-popup')?.classList.add('hidden');
  const chk = document.getElementById('s5q-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('s5q-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = 'hidden'; }
  const recall = document.getElementById('s5q-recall');
  if (recall) { recall.disabled = false; recall.style.visibility = 'visible'; }
}

function s5qEnter() {
  if (!s5qDone) s5qResetInitial();
  document.getElementById('s5q-hint-overlay')?.classList.add('hidden');
  closeRecallPopup();
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
/* Deep link: '#last' lands on this part's final screen — used by part 07's
   S0 back button to return here. Placed at module bottom so every sNEnter()
   and the module state they read are already initialized. */
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
   ⚠️ SCREEN_TO_SUBCONTENT must hold exactly TOTAL_SCREENS keys (6), 0..5.
   The whole peak question is ONE catalogue item (001) with four questions: S1 (the recipe
   materials) opens it and S2-S5 are its sections q1-q4, so paging through it sends nothing.
   The "אפשר להיזכר במתכונים?" button reopens S1's materials — a reminder, not a catalogued hint,
   so it is not reported as requested. */
/* The component result: at least 3 of the 4 sections, as S0 promises; score = sections / 4. Also the
   result of item 001, which is the whole component (QA 2026-10-02 O-8, decided 2026-10-04). */
function partResult() { const score = peakScore(); return { success: score >= 3, score: { scaled: score / 4 } }; }
var XAPI_ITEM_RESULT = { '001': function () { return partResult(); } };

var SCREEN_TO_SUBCONTENT = {
  0: null,          // transition ("4 sections, 3 to pass")
  1: ['001', 1],    // reference materials: grandma's recipe
  2: ['001', 2],    // section 1 — q1
  3: ['001', 3],    // section 2 — q2
  4: ['001', 4],    // section 3 — q3
  5: ['001', 5]     // section 4 — q4 (image cards)
};

var XAPI_COMP_SLUG     = 'methodica-science-volume-liquid-01-06';
var XAPI_COMP_ID       = XAPI_ID_PREFIX + XAPI_COMP_SLUG + '/';
var XAPI_EVAL_ITEMS    = { '001': 1 };
var XAPI_METADATA_FILE = '../metadata/methodica-science-volume-liquid-01-06.json';
var XAPI_END_BTN       = 's5q-check';   // S5 "שנמשיך?" — the part's last click (D-8)

/* ═══════════════════ Resume (720) — the four per-part hooks ═══════════════════
   Guide §8.7. Committed state only: an unanswered section is reset by its enter function on
   every entry, so a pending pick was never kept across a screen change and is not kept across a
   reload. peakResults (the score) and XAPI_Q_RESULTS travel with it. */
function capturePartPayload() {
  const q = (a, ans, d, sel) => ({ a: a, ans: ans, d: d, sel: sel });
  return {
    currentScreen: currentScreen,
    xq: rsCaptureXq(),
    peak: Object.assign({}, peakResults),
    s2q: q(s2qAttempts, s2qAnswered, s2qDone, s2qSelected),
    s3q: q(s3qAttempts, s3qAnswered, s3qDone, s3qSelected),
    s4q: q(s4qAttempts, s4qAnswered, s4qDone, s4qSelected),
    s5q: q(s5qAttempts, s5qAnswered, s5qDone, s5qSelected)
  };
}
function applyResumeVars(st) {
  if (!st) return;
  rsRestoreXq(st.xq);
  rsAssign(peakResults, st.peak);
  const q = k => (st[k] && st[k].d) ? st[k] : null;
  let s;
  if ((s = q('s2q'))) { s2qAttempts = s.a; s2qAnswered = s.ans; s2qDone = true; s2qSelected = s.sel; }
  if ((s = q('s3q'))) { s3qAttempts = s.a; s3qAnswered = s.ans; s3qDone = true; s3qSelected = s.sel; }
  if ((s = q('s4q'))) { s4qAttempts = s.a; s4qAnswered = s.ans; s4qDone = true; s4qSelected = s.sel; }
  if ((s = q('s5q'))) { s5qAttempts = s.a; s5qAnswered = s.ans; s5qDone = true; s5qSelected = s.sel; }
}
function applyResumeDom(st) {}   // nothing on these screens lives only in the DOM
/* Must never throw (rule 7): guarded, and an unanswered section is left to its enter function. */
function restoreScreenUI(n) {
  try {
    if (n === 2) rsPaintChoice({ done: s2qDone, selected: s2qSelected, correctId: S2Q.correctId, optSel: '#s2 .scq-opt',
      mark: s2qMark, showPopup: s2qShowPopup, finish: s2qFinish });
    if (n === 3) rsPaintChoice({ done: s3qDone, selected: s3qSelected, correctId: S3Q.correctId, optSel: '#s3 .scq-opt',
      mark: s3qMark, showPopup: s3qShowPopup, finish: s3qFinish });
    if (n === 4) rsPaintChoice({ done: s4qDone, selected: s4qSelected, correctId: S4Q.correctId, optSel: '#s4 .scq-opt',
      mark: s4qMark, showPopup: s4qShowPopup, finish: s4qFinish });
    if (n === 5) rsPaintChoice({ done: s5qDone, selected: s5qSelected, correctId: S5Q.correctId, optSel: '#s5 .s5q-card',
      mark: s5qMark, showPopup: s5qShowPopup, finish: s5qFinish });
  } catch (e) { console.error('[resume] restoreScreenUI ' + n, e); }
}