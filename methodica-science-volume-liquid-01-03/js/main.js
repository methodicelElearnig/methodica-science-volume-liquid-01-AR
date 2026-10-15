'use strict';

/* ═══════════════════════════════════════════════════════════
   methodica-science-volume-liquid-01-03 — main.js
   Part 03 of the liquid-volume lomda. 6 screens so far:
     S0  TransitionScreen (companion video) — slide 28.
     S1  SingleChoiceQuestion, image-choice variant — slide 29 (Q1/3).
     S2  MultipleChoiceQuestion, image-choice variant (PROJECT-LOCAL
         VARIANT — see block comment below) — slide 30 (Q2/3).
     S3  ValueInputQuestion + DropdownQuestion, combined — slide 31
         (Q3/3).
     S4  TransitionScreen (companion still image, not video) — slide 32.
     S5  SingleChoiceQuestion, dual-image variant — slide 33 (current
         last slide of the production deck). Standalone "harder
         exercise", outside the 3-question practice set. Last screen
         of this part — completes on to part 03.
   Reuses part-01's CSS component classes verbatim (s13tr-*, s5q-*,
   mdq-*, s4v-*, scq-*) plus Target-01's .speech-bubble component and
   the image-zoom global component (first used here by S5). Character
   choice is carried over from part 01 via localStorage.
   ═══════════════════════════════════════════════════════════ */

/* ─── Constants ─────────────────────────────────────────── */
const TOTAL_SCREENS = 6;  // S0–S5 — bump as more slides from the deck are implemented

/* ─── Cross-part back navigation (session-scoped route stack) ─────
   Parts are separate pages, so "which part did the learner arrive from"
   cannot live in JS memory. A sessionStorage stack records the route
   ACTUALLY taken: every forward hop pushes the part being left, and
   חזרה on S0 pops it. The unit's route branches (part 04 is reachable
   from part 02 directly on a pass, or through this part on a fail), so a
   hardcoded predecessor cannot express the real route — hence a stack
   rather than the constant this replaces.
   sessionStorage (not localStorage) is deliberate: the trail belongs to
   this browsing session, so opening a part directly in a fresh tab
   correctly has nowhere to go back to and hides its S0 back button.
   Screen-level resume is intentionally OUT OF SCOPE (owned by the resume
   branch) — back lands on the previous part's LAST screen via the
   '#last' deep link, which cold-starts that screen. ───────────────── */
const LOMDA_ID      = 'methodica-science-volume-liquid-01';
const NAV_STACK_KEY = LOMDA_ID + '_navStack';
const THIS_PART     = LOMDA_ID + '-03';
const S0_BACK_ID    = 's0-back';

/* Onward navigation to the next part of the lomda (sibling folder) —
   S5 is the last screen built so far in this part. */
/* The part's last click on the pass path (S5 "שנמשיך?"): report the component, then stop — the
   platform routes (guide §6.5, §8.12); the hop to part 04 exists only under DEV_NAV. Decided
   2026-09-28: success is the 2-of-3 gate (already passed to get here) and the score is over the
   same three questions S0 promised — S5's "harder exercise" (item 004) reports its own answers but
   is not in the component score. */
function goToNextPart() {
  const score = practiceGateScore();
  try {
    xapiEndComponent({ success: score >= 2, score: { scaled: score / 3 } },
      document.getElementById('s5bq-check'));
  } catch (e) {}
  goToPart(LOMDA_ID + '-04');
}

/* Correct answers among the three gated practice questions (S1–S3) — the part's own per-screen
   verdicts, so S3's two-part question counts once, as on screen. */
function practiceGateScore() {
  return practiceProgress.questions.filter(q => q.state === 'correct').length;
}

/* ─── Global lomda state ─────────────────────────────────── */
window.lomdaState = window.lomdaState || {
  selectedCharacter: null
};

window.lomdaState.selectedCharacter = getCharacter();

/* S0 companion character video — asset map keyed by the producer-defined
   character IDs from part 01's selection screen (never hardcode a character
   asset). Per producer notes: purple (character-1) → jumping-rope video 1;
   pink (character-2) → jumping-rope video 2. */
const S0_CHARACTER_VIDEOS = {
  'character-1': 'assets/video/Character-1-jumping-rope.mp4',
  'character-2': 'assets/video/Character-2-jumping-rope.mp4'
};

/* S4 companion character video — asset map keyed the same way as
   S0's video map (medal variant; the real video files replaced the
   interim still-image .png pair). */
const S4_CHARACTER_VIDEOS = {
  'character-1': 'assets/video/Character-1-medal.mp4',
  'character-2': 'assets/video/Character-2-medal.mp4'
};

/* ─── State ─────────────────────────────────────────────── */
let currentScreen = 0;

/* ─── Scale App ──────────────────────────────────────────────
   Scale-to-fit the 1280×710 design while EXTENDING the canvas
   to fill the viewport so chrome anchored to canvas edges
   (flag button at top, bottom bars at bottom) reaches the
   actual screen edges instead of letterboxing.
   ─────────────────────────────────────────────────────────── */
function scaleApp() {
  const app = document.getElementById('app');
  const scale  = Math.min(window.innerWidth / 1280, window.innerHeight / 710);
  const canvasW = window.innerWidth  / scale;
  const canvasH = window.innerHeight / scale;
  app.style.width     = canvasW + 'px';
  app.style.height    = canvasH + 'px';
  app.style.transform = `scale(${scale})`;
  app.style.left      = '0px';
  app.style.top       = '0px';
}
window.addEventListener('resize', scaleApp);
scaleApp();

/* ─── Navigation engine ─────────────────────────────────── */
/* Screen number → its feedback popup element id, for screens that have one.
   Used to restore a popup the learner left open (not X-closed) — see below. */
const SCREEN_POPUP_ID = {
  1: 's1q-popup', 2: 's2mc-popup', 3: 's3v-popup', 5: 's5bq-popup'
};
/* Screen number → whether that screen's question has actually been resolved
   (correct, or final wrong) — same "is this question done" check each screen's
   own resetScreenState() branch already uses to decide fresh-reset vs. resume.
   The popup-reopen below must only fire when this is true: reopening a
   "try again" popup over a board that a *not-done* screen's own reset just
   wiped back to blank would show stale feedback for an empty board. */
const SCREEN_DONE = {
  1: () => s1qDone, 2: () => s2mcDone, 3: () => s3vdDone, 5: () => s5bqDone
};
function goTo(n) {
  if (n < 0 || n >= TOTAL_SCREENS) return;
  document.querySelectorAll('[id$="-popup"], [id$="-hint-overlay"]')
    .forEach(el => el.classList.add('hidden'));
  const prev = document.querySelector('.screen.active');
  if (prev && window.Motion) Motion.cancel(prev);
  if (prev) prev.classList.remove('active');
  if (prev && prev.id === 's0') {
    try { document.getElementById('s0-video')?.pause(); } catch (e) {}
  }
  if (prev && prev.id === 's4') {
    try { document.getElementById('s4-video')?.pause(); } catch (e) {}
  }
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
  if (n === 0) {
    s0trEnter();
  }
  if (n === 1) {
    s1qEnter();
  }
  if (n === 2) {
    s2mcEnter();
  }
  if (n === 3) {
    s3vdEnter();
  }
  if (n === 4) {
    s4trEnter();
  }
  if (n === 5) {
    s5bqEnter();
  }
}

function goBack() {
  if (currentScreen === 0) { goToPrevPart(); return; }
  goTo(currentScreen - 1);
}

function advanceScreen() {
  // S0 (transition) has no gate — always advance
  if (currentScreen === 0) { goTo(1); return; }
  // S1 gate: must answer before advancing
  if (currentScreen === 1 && !s1qAnswered) return;
  // S2 gate: must answer before advancing
  if (currentScreen === 2 && !s2mcAnswered) return;
  // S3 gate: must answer before advancing
  if (currentScreen === 3 && !s3vdAnswered) return;
  // S3 score gate (user decision): the practice series (S1–S3) passes at
  // 2/3 correct or more — the S0 promise "3 questions, answer 2 correctly to
  // advance". Below that the part ENDS here (guide §6.4, 2026-09-23): report the
  // component as failed and navigate nowhere — the platform routes on the
  // catalogue (this part's recommendedAfterFail).
  if (currentScreen === 3) {
    const score = practiceGateScore();
    if (score < 2) {
      try {
        xapiEndComponent({ success: false, score: { scaled: score / 3 } },
          document.getElementById('s3v-check'));
      } catch (e) {}
      return;
    }
  }
  // S5 gate: must answer before advancing (last screen — advances via goToNextPart, not goTo)
  if (currentScreen === 5 && !s5bqAnswered) return;
  if (currentScreen >= TOTAL_SCREENS - 1) return; // last implemented screen so far
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
    s1qCloseHint();
    s2mcCloseHint();
    s3vdCloseHint();
    s5bqCloseHint();
  }
});

/* ═══════════════════════════════════════════════════════════
   Shared — draggable feedback popup (any #id) + reset helper
   ═══════════════════════════════════════════════════════════ */
let popupDrag = null;   // { id, offX, offY }
function popupMouseDown(e, id) {
  /* The action button is a control, not a drag handle. Without this guard its
     pointerdown would start a drag AND flip the popup from bottom- to
     top-anchoring. Ported verbatim from part 06's Foundation. */
  if (e.target && e.target.closest && e.target.closest('.popup-action')) return;
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
  popup.style.left = Math.max(0, Math.min(nx, app.offsetWidth - popup.offsetWidth)) + 'px';
  popup.style.top  = Math.max(0, Math.min(ny, app.offsetHeight - 74 - popup.offsetHeight)) + 'px';
});
window.addEventListener('pointerup',     () => { popupDrag = null; });
window.addEventListener('pointercancel', () => { popupDrag = null; });

/* ═══════════════════════════════════════════════════════════
   GLOBAL COMPONENT — Image zoom (clone-based modal), ported from
   the part-01 reference. First used in this part by #s5's board
   images. Any [data-zoom-src] button opens the shared #img-zoom-
   modal; any [data-zoom-close="true"] (backdrop, X) closes it.
   Escape also closes it (wired below).

   Clone sizing: the reference implementation hardcodes a 364×364
   clone (right for a square 380×380 content-image frame). #s5's
   board frames are 300×210 (not square), so this version measures
   the source wrapper's own rendered size and scales it up to fit
   the same ~619px envelope while preserving its aspect ratio,
   instead of forcing every clone into a square.
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

  // Optional per-image title (e.g. which board this is) — carried on the
  // opening button via data-zoom-caption, since the caption itself lives
  // OUTSIDE the cloned .scq-img-inner wrapper (it's a sibling, not part of
  // the reusable image frame) and would otherwise be lost when zoomed.
  if (caption) caption.textContent = btn.dataset.zoomCaption || '';

  stage.innerHTML = '';
  stage.appendChild(clone);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  // Measured AFTER the caption text/row above is in place, so a present
  // caption correctly shrinks the stage's available height and the clone
  // never overlaps it — not a fixed constant assuming no caption.
  //
  // getBoundingClientRect() returns VIEWPORT pixels — the modal lives
  // inside #app, which carries its own scaleApp() zoom transform, so
  // those numbers already have that zoom baked in. Setting clone.style.
  // width/height directly from them double-applies the zoom (once via
  // the #app ancestor transform when the box renders, again via the
  // scale() below), blowing the clone past the panel. Divide the app
  // zoom back out first so all math here is in #app's own local,
  // untransformed coordinate space — the space the clone's inline
  // width/height/transform actually render in.
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
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeImageZoom();
});

/* ═══════════════════════════════════════════════════════════
   TEMPLATE — TransitionScreen (Screen 01 / #s0, slide 28)
   Companion video (jumping-rope variant), resolved per the character
   carried over from part 01, on every entry. No gate: continue
   ("אפשר להתחיל!") is always enabled.
   ═══════════════════════════════════════════════════════════ */
function s0trEnter() {
  const vid = document.getElementById('s0-video');
  if (!vid) return;
  const char = getCharacter();
  window.lomdaState.selectedCharacter = char;
  const src = S0_CHARACTER_VIDEOS[char] || S0_CHARACTER_VIDEOS['character-1'];
  if (!vid.src || !vid.src.endsWith(src)) {
    vid.src = src;
    vid.load();
  }
  vid.play().catch(() => {});
  freezeVideoOnEnd(vid);
}

function advanceFromS0() {
  goTo(1);
}

/* ═══════════════════════════════════════════════════════════
   COMPONENT — Progress Question nav (reusable across the practice
   screens of this part; ported from part-01 / Target-01). Screens
   mutate this object and call syncPracticeProgressNav(sectionEl).
   3 questions total (per the S0 transition text: "3 שאלות").
   ═══════════════════════════════════════════════════════════ */
const practiceProgress = {
  questions: [
    { number: 1, visited: true,  state: 'current',      screen: 1 },
    { number: 2, visited: false, state: 'not-answered', screen: 2 },
    { number: 3, visited: false, state: 'not-answered', screen: 3 }
  ]
};

/* ═══════════════════════════════════════════════════════════
   TEMPLATE — SingleChoiceQuestion, image-choice variant (Screen
   02 / #s1, slide 29). Same card/state-machine shape as part-02's
   #s3 (part 01's #s19 before the practice-series split), but hint
   policy is the TEMPLATE DEFAULT — visible from the start (producer
   note: "רמז זמין כבר מהניסיון הראשון") — not that screen's
   hidden-until-first-wrong-attempt choice. Two attempts.
   Correct answer: משורה ('cylinder').
   ═══════════════════════════════════════════════════════════ */
const S1Q = { correctId: 'cylinder', maxAttempts: 2 };
let s1qSelected = null;   // currently selected card id
let s1qAttempts = 0;      // number of check attempts made
let s1qAnswered = false;  // true once resolved (correct or final wrong)
let s1qDone     = false;  // resume-state lock (survives navigation)
let s1qLastWrong = null;  // option id marked wrong on a non-final attempt (gates re-check)

const S1Q_POPUP_CFG = {
  retry: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.'],
    body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
  },
  correct: {
    bg: '#edf8ed',
    title: ['الإجابة صحيحة‎.'],
    body: [
      'نقيس الحجم بالمخبار المدرّج‎.',
      'الملعقة ليست دقيقة بما يكفي‎.',
      'المسطرة تقيس الطول‎.',
      'بالميزان نقيس الكتلة‎.'
    ]
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.', 'الإجابة الصحيحة معلَّمة.'],
    body: [
      'نقيس الحجم بالمخبار المدرّج‎.',
      'الملعقة ليست دقيقة بما يكفي‎.',
      'المسطرة تقيس الطول‎.',
      'بالميزان نقيس الكتلة‎.'
    ]
  }
};

/* Select a card (single selection) */
function s1qSelect(id) {
  if (s1qAnswered) return;
  dismissRetryPopup('s1q-popup', s1qDone);
  s1qSelected = id;
  // Clear a previous attempt's wrong mark for a fresh check
  if (s1qAttempts > 0) {
    document.querySelectorAll('#s1 .s5q-card').forEach(c => c.classList.remove('wrong', 'correct'));
  }
  document.querySelectorAll('#s1 .s5q-card').forEach(c => {
    const sel = c.dataset.id === id;
    c.classList.toggle('selected', sel);
    c.setAttribute('aria-checked', sel ? 'true' : 'false');
  });
  const chk = document.getElementById('s1q-check');
  if (chk && !s1qAnswered) chk.disabled = !s1qSelected || s1qSelected === s1qLastWrong;
}

/* Check / advance — the main bottom-bar button ("בחרתי") */
function s1qCheck() {
  if (s1qAnswered) { advanceScreen(); return; }   // label is "שנמשיך?" → go next
  if (!s1qSelected) return;

  s1qAttempts++;
  const isCorrect = s1qSelected === S1Q.correctId;
  xapiAnswered('001', 'q1', isCorrect, isCorrect || s1qAttempts >= S1Q.maxAttempts,
    xapiAnswerText(document.querySelector('#s1 .s5q-card[data-id="' + s1qSelected + '"]')));

  if (isCorrect) {
    s1qMark(S1Q.correctId, 'correct');
    s1qShowPopup('correct');
    s1qFinish('correct');
  } else if (s1qAttempts >= S1Q.maxAttempts) {
    // Second wrong → reveal correct (green) + mark chosen wrong (red)
    s1qMark(S1Q.correctId, 'correct');
    s1qMark(s1qSelected, 'wrong');
    s1qShowPopup('wrong2');
    s1qFinish('incorrect');
  } else {
    // First wrong — retry allowed (hint has been available from the start)
    s1qMark(s1qSelected, 'wrong');
    /* Re-check stays disabled until the learner picks a DIFFERENT option */
    s1qLastWrong = s1qSelected;
    const chk = document.getElementById('s1q-check');
    if (chk) chk.disabled = true;
    s1qShowPopup('retry');
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

function s1qMark(id, cls) {
  const card = document.querySelector('#s1 .s5q-card[data-id="' + id + '"]');
  if (!card) return;
  card.classList.remove('selected');
  card.classList.add(cls);
}

function s1qShowPopup(type) {
  const popup = document.getElementById('s1q-popup');
  if (!popup) return;
  const cfg = S1Q_POPUP_CFG[type];
  popup.style.background = cfg.bg;
  resetPopupPosition(popup);
  const titleEl = document.getElementById('s1q-popup-title');
  if (titleEl) titleEl.innerHTML = cfg.title.map(t => '<p>' + t + '</p>').join('');
  const bodyEl = document.getElementById('s1q-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  popup.classList.remove('hidden');
}


/* Lock the question after it is resolved */
function s1qFinish(resultState) {
  s1qAnswered = true;
  s1qDone = true;
  document.querySelectorAll('#s1 .s5q-card').forEach(c => { c.disabled = true; });
  const chk = document.getElementById('s1q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s1q-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s1q-hint-overlay')?.classList.add('hidden');
  practiceProgress.questions[0].state = resultState;
  syncPracticeProgressNav(document.getElementById('s1'));
}

/* Hint modal — visible from the start */
function s1qOpenHint() {
  if (s1qAnswered) return;
  /* xAPI requested.1 — after the guard, right before the reveal; this function only opens. */
  xapiRequestedHint('001', 'q1');
  document.getElementById('s1q-hint-overlay')?.classList.remove('hidden');
}
function s1qCloseHint() {
  document.getElementById('s1q-hint-overlay')?.classList.add('hidden');
}
function s1qCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 's1q-hint-overlay') s1qCloseHint();
}

/* Restore the clean initial state (used on first entry / unfinished return) */
function s1qResetInitial() {
  s1qSelected = null;
  s1qAttempts = 0;
  s1qAnswered = false;
  s1qLastWrong = null;
  document.querySelectorAll('#s1 .s5q-card').forEach(c => {
    c.classList.remove('selected', 'correct', 'wrong');
    c.disabled = false;
    c.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s1q-popup')?.classList.add('hidden');
  const chk = document.getElementById('s1q-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('s1q-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = 'visible'; }
  practiceProgress.questions[0].state = 'current';
}

function s1qEnter() {
  practiceProgress.questions[0].visited = true;
  practiceProgress.questions[0].screen = 1;
  if (!s1qDone) s1qResetInitial();
  document.getElementById('s1q-hint-overlay')?.classList.add('hidden');
  syncPracticeProgressNav(document.getElementById('s1'));
}

/* ═══════════════════════════════════════════════════════════
   TEMPLATE — MultipleChoiceQuestion, image-choice variant
   (Screen 03 / #s2, slide 30). PROJECT-LOCAL VARIANT — see the
   candidate-template writeup at the bottom of this file.

   Reuses SingleChoiceQuestion's question workflow, attempts, hint,
   checking, feedback, and completion behavior wholesale
   (_question-template-defaults.md), and the S1/S19 image-card
   structure for the six answer cards. The ONLY thing that changes
   is selection semantics: single id → a Set of ids, replace-on-
   click → toggle-on-click, exact-match → set-equality.

   2×3 grid (6 cards). Correct set: {cylinder, syringe, measuringcup}
   (משורה, מזרק, כוס מדידה — the three volume-measuring tools).
   2 attempts. Hint visible from the start (producer note: "רמז
   זמין כבר מהניסיון הראשון").
   ═══════════════════════════════════════════════════════════ */
const S2MC = {
  correctSet: new Set(['cylinder', 'syringe', 'measuringcup']),
  maxAttempts: 2
};
let s2mcSelected = new Set();  // ids currently selected (toggle membership)
/* Sorted-JSON snapshot of the selection set as of the last non-final wrong
   attempt — gates the check button disabled until the learner actually
   changes the set. Sorted so selection ORDER never counts as a change. */
let s2mcLastWrong = null;
function s2mcSnapshot(set) { return JSON.stringify([...set].sort()); }
let s2mcAttempts = 0;
let s2mcAnswered = false;
let s2mcDone     = false;

const S2MC_POPUP_CFG = {
  retry: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.'],
    body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
  },
  correct: {
    bg: '#edf8ed',
    title: ['اخترت كل الإجابات الصحيحة‎!'],
    body: [
      'المخبار المدرّج، المحقنة وكوب القياس تقيس الحجم‎.',
      'الميزان – يقيس الكتلة‎.',
      'المسطرة – تقيس الطول‎.',
      'ساعة التوقيت – تقيس الزمن‎.'
    ]
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة ليست صحيحة بالكامل.', 'الإجابات الصحيحة معلَّمة.'],
    body: [
      'المخبار المدرّج، المحقنة وكوب القياس تقيس الحجم‎.',
      'الميزان – يقيس الكتلة‎.',
      'المسطرة – تقيس الطول‎.',
      'ساعة التوقيت – تقيس الزمن‎.'
    ]
  }
};

function s2mcSetsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/* Toggle one card's membership — does NOT clear other selections
   (this is the single change from SingleChoiceQuestion's exclusive-
   select behavior). */
/* Brief notice when a 4th selection is attempted — auto-hides after 2s */
let s2mcLimitMsgTimer = null;
function s2mcShowLimitMsg() {
  const msg = document.getElementById('s2mc-limit-msg');
  if (!msg) return;
  msg.hidden = false;
  clearTimeout(s2mcLimitMsgTimer);
  s2mcLimitMsgTimer = setTimeout(() => { msg.hidden = true; }, 2000);
}

function s2mcToggle(id) {
  if (s2mcAnswered) return;
  const card = document.querySelector('#s2 .s5q-card[data-id="' + id + '"]');
  if (!card) return;
  // A selection CHANGE (toggle on or off) is the start of a correction
  dismissRetryPopup('s2mc-popup', s2mcDone);

  // Clear a previous attempt's wrong/correct marks for a fresh check
  if (s2mcAttempts > 0) {
    document.querySelectorAll('#s2 .s5q-card').forEach(c => c.classList.remove('wrong', 'correct'));
  }

  if (s2mcSelected.has(id)) {
    s2mcSelected.delete(id);
    card.classList.remove('selected');
    card.setAttribute('aria-checked', 'false');
  } else {
    // Selection cap (user decision): the instruction says to mark exactly
    // 3 tools, so a 4th selection is ignored until one is deselected —
    // with a brief notice so the learner knows why nothing happened.
    if (s2mcSelected.size >= 3) { s2mcShowLimitMsg(); return; }
    s2mcSelected.add(id);
    card.classList.add('selected');
    card.setAttribute('aria-checked', 'true');
  }

  const chk = document.getElementById('s2mc-check');
  // Enabled only at exactly 3 selections (the instruction asks for 3), and
  // only once the set genuinely DIFFERS from the one just marked wrong.
  if (chk && !s2mcAnswered) {
    chk.disabled = s2mcSelected.size !== 3 || s2mcSnapshot(s2mcSelected) === s2mcLastWrong;
  }
}

/* Keyboard selection (Enter/Space toggle, same as a native checkbox) */
document.addEventListener('keydown', e => {
  if (currentScreen !== 2) return;
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = document.activeElement?.closest('#s2 .s5q-card');
  if (!card) return;
  e.preventDefault();
  s2mcToggle(card.dataset.id);
});

/* Check / advance — the main bottom-bar button ("צדקתי?") */
function s2mcCheck() {
  if (s2mcAnswered) { advanceScreen(); return; }   // label is "שנמשיך?" → go next
  if (s2mcSelected.size !== 3) return;             // exactly 3 selections required

  s2mcAttempts++;
  const isCorrect = s2mcSetsEqual(s2mcSelected, S2MC.correctSet);
  xapiAnswered('002', 'q1', isCorrect, isCorrect || s2mcAttempts >= S2MC.maxAttempts,
    xapiMultiAnswer([...s2mcSelected], id => document.querySelector('#s2 .s5q-card[data-id="' + id + '"]')));

  if (isCorrect) {
    s2mcMarkAll('correct');
    s2mcShowPopup('correct');
    s2mcFinish('correct');
  } else if (s2mcAttempts >= S2MC.maxAttempts) {
    // Final wrong → reveal the correct set (green) + mark any wrongly-
    // selected extras (red); correct cards the learner missed are also
    // revealed green so the full answer is visible.
    document.querySelectorAll('#s2 .s5q-card').forEach(c => {
      const id = c.dataset.id;
      if (S2MC.correctSet.has(id)) c.classList.add('correct');
      else if (s2mcSelected.has(id)) c.classList.add('wrong');
    });
    s2mcShowPopup('wrong2');
    s2mcFinish('incorrect');
  } else {
    // First wrong — mark only the learner's actually-wrong selections;
    // correct-but-unselected cards are NOT revealed yet. Retry allowed
    // (hint has been available from the start).
    document.querySelectorAll('#s2 .s5q-card').forEach(c => {
      const id = c.dataset.id;
      if (s2mcSelected.has(id) && !S2MC.correctSet.has(id)) c.classList.add('wrong');
    });
    /* Re-check stays disabled until the learner changes the selection set */
    s2mcLastWrong = s2mcSnapshot(s2mcSelected);
    const chk = document.getElementById('s2mc-check');
    if (chk) chk.disabled = true;
    s2mcShowPopup('retry');
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

function s2mcMarkAll(cls) {
  document.querySelectorAll('#s2 .s5q-card').forEach(c => {
    if (S2MC.correctSet.has(c.dataset.id)) {
      c.classList.remove('selected');
      c.classList.add(cls);
    }
  });
}

function s2mcShowPopup(type) {
  const popup = document.getElementById('s2mc-popup');
  if (!popup) return;
  const cfg = S2MC_POPUP_CFG[type];
  popup.style.background = cfg.bg;
  resetPopupPosition(popup);
  const titleEl = document.getElementById('s2mc-popup-title');
  if (titleEl) titleEl.innerHTML = cfg.title.map(t => '<p>' + t + '</p>').join('');
  const bodyEl = document.getElementById('s2mc-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  popup.classList.remove('hidden');
}


/* Lock the question after it is resolved */
function s2mcFinish(resultState) {
  s2mcAnswered = true;
  s2mcDone = true;
  document.querySelectorAll('#s2 .s5q-card').forEach(c => { c.disabled = true; });
  const chk = document.getElementById('s2mc-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s2mc-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s2mc-hint-overlay')?.classList.add('hidden');
  practiceProgress.questions[1].state = resultState;
  syncPracticeProgressNav(document.getElementById('s2'));
}

/* Hint modal — visible from the start */
function s2mcOpenHint() {
  if (s2mcAnswered) return;
  /* xAPI requested.1 — after the guard, right before the reveal; this function only opens. */
  xapiRequestedHint('002', 'q1');
  document.getElementById('s2mc-hint-overlay')?.classList.remove('hidden');
}
function s2mcCloseHint() {
  document.getElementById('s2mc-hint-overlay')?.classList.add('hidden');
}
function s2mcCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 's2mc-hint-overlay') s2mcCloseHint();
}

/* Restore the clean initial state (used on first entry / unfinished return) */
function s2mcResetInitial() {
  s2mcSelected = new Set();
  s2mcAttempts = 0;
  s2mcAnswered = false;
  s2mcLastWrong = null;
  document.querySelectorAll('#s2 .s5q-card').forEach(c => {
    c.classList.remove('selected', 'correct', 'wrong');
    c.disabled = false;
    c.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s2mc-popup')?.classList.add('hidden');
  const chk = document.getElementById('s2mc-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('s2mc-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = 'visible'; }
  practiceProgress.questions[1].state = 'current';
}

function s2mcEnter() {
  practiceProgress.questions[1].visited = true;
  practiceProgress.questions[1].screen = 2;
  if (!s2mcDone) s2mcResetInitial();
  document.getElementById('s2mc-hint-overlay')?.classList.add('hidden');
  syncPracticeProgressNav(document.getElementById('s2'));
}

/* ═══════════════════════════════════════════════════════════
   TEMPLATE — ValueInputQuestion + DropdownQuestion, combined
   variant (Screen 04 / #s3, slide 31). Producer: "וריאנט קטן של
   תבניות קיימות" — a small variant combining two existing
   templates on one screen. "צדקתי?" enables only once BOTH parts
   are filled. 2 attempts. Hint visible from the start (template
   default). Correct: part א = 21 (integer only), part ב = "לא,
   עדיף 3 כדי לדייק". Both parts must be correct to pass.
   ═══════════════════════════════════════════════════════════ */
/* correctOption is an option KEY (the <li data-key> in index.html), not its
   label: the visible label lives only in the HTML, so translating it never
   touches this logic. */
const S3VD = { correctValue: 21, correctOption: 'three-better', maxAttempts: 2 };
let s3vdValue    = null;   // parsed integer, or null if empty/invalid
let s3ddSelected = null;   // key of the currently selected dropdown option
/* Visible label of a dropdown option, read from its <li data-key>. */
function s3ddOptionText(key) {
  const li = document.querySelector('#s3dd-list .mdq-option[data-key="' + key + '"]');
  return li ? li.textContent : key;
}
/* Joined signature of BOTH parts as of the last non-final wrong attempt —
   gates the check button disabled until the learner changes either half.
   Uses the raw input string so "8" vs "8.0" counts as a real edit. */
let s3vdLastWrong = null;
function s3vdSignature() {
  const raw = document.getElementById('s3v-input')?.value.trim() ?? '';
  return raw + '|' + (s3ddSelected ?? '');
}
let s3vdAttempts = 0;
let s3vdAnswered = false;
let s3vdDone     = false;

/* ── Final-attempt solution/answer toggle (see part 06 S3 for the full
   contract) -- this screen has TWO sub-answers, so the snapshot is an
   object, not a single value. One toggle governs both parts and the
   popup together: pressing the button always switches the whole
   resolved state, never one part alone.
   s3vdAnswer  { value, valueCorrect, option, optionCorrect } -- the
               learner's final submission for BOTH parts, captured before
               the reveal overwrites either. null => not toggleable.
   s3vdView    'solution' | 'answer'. Runtime only -- reset in
               s3vdEnter(), same reasoning as every other migrated screen. */
let s3vdAnswer = null;
let s3vdView   = 'solution';

const S3VD_POPUP_CFG = {
  retry: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.'],
    body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
  },
  correct: {
    bg: '#edf8ed',
    title: ['إجابة صحيحة.'],
    body: [
      'أ. المعدل <span dir="ltr">(20+22)÷2 = 21</span> ملل.',
      'ب. من خلال قياسَين فقط، من الصعب معرفة ما إذا كانت إحدى النتائج شاذة. الـ 3 قياسات تزيد مستوى الدقّة‎.'
    ]
  },
  /* One outcome, two views -- see part 06 S3's wrong2 for the full pattern.
     This screen's solution-view title ("...במלואה" -- "not entirely
     correct") is a genuine content nuance (only one part may be wrong) and
     is kept; the answer view's copy is fixed and canonical regardless. */
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة ليست صحيحة بالكامل،', 'الإجابة الصحيحة تَظهَر الآن.'],
    body: [
      'أ. المعدل <span dir="ltr">(20+22)÷2 = 21</span> ملل.',
      'ب. من خلال قياسَين فقط، من الصعب معرفة ما إذا كانت إحدى النتائج شاذة. الـ 3 قياسات تزيد مستوى الدقّة‎.'
    ],
    action: { label: 'الانتقال إلى إجابتي', view: 'answer' },
    answerView: {
      title: ['الإجابة غير صحيحة.'],
      body:  ['يمكن مشاهدة الحل الصحيح مرة أخرى‎.'],
      action: { label: 'الإجابة الصحيحة', view: 'solution' }
    }
  }
};

/* Part א — value input */
function s3vdInputChange() {
  if (s3vdAnswered) return;
  dismissRetryPopup('s3v-popup', s3vdDone);
  const el = document.getElementById('s3v-input');
  const raw = el.value.trim();
  s3vdValue = raw === '' ? null : Number(raw);
  if (s3vdAttempts > 0) el.classList.remove('error', 'correct');
  s3vdUpdateBar();
}

/* Clicking into the input is the start of a correction — dismiss the retry
   popup on focus too (typing while already focused is covered by
   s3vdInputChange). Same click both dismisses and focuses the field. */
document.getElementById('s3v-input')?.addEventListener('focus', () => {
  if (!s3vdAnswered) dismissRetryPopup('s3v-popup', s3vdDone);
});

/* Part ב — dropdown (single-select, 3 options) */
function s3ddToggle() {
  const btn  = document.getElementById('s3dd-btn');
  const list = document.getElementById('s3dd-list');
  if (!btn || !list || btn.disabled) return;
  dismissRetryPopup('s3v-popup', s3vdDone);
  const isOpen = !list.classList.contains('hidden');
  s3ddCloseList();
  if (!isOpen) {
    list.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
  }
}
function s3ddCloseList() {
  document.getElementById('s3dd-list')?.classList.add('hidden');
  document.getElementById('s3dd-btn')?.setAttribute('aria-expanded', 'false');
}
function s3ddOutsideClick(e) {
  if (currentScreen !== 3) return;
  if (!e.target.closest('.mdq-dropdown-wrap')) s3ddCloseList();
}
document.addEventListener('click', s3ddOutsideClick);
function s3ddSelect(value) {
  if (s3vdAnswered) return;
  s3ddSelected = value;
  const sel = document.getElementById('s3dd-selected');
  if (sel) sel.textContent = s3ddOptionText(value);
  const btn = document.getElementById('s3dd-btn');
  if (btn) {
    btn.removeAttribute('data-empty');
    btn.classList.remove('mdq-wrong', 'mdq-correct');
    btn.querySelector('.mdq-wrong-ico')?.remove();
    btn.querySelector('.mdq-check-ico')?.remove();
  }
  s3ddCloseList();
  s3vdUpdateBar();
}

/* Combined check-button gate: both parts must be filled */
function s3vdUpdateBar() {
  if (s3vdAnswered) return;
  const chk = document.getElementById('s3v-check');
  const bothFilled = s3vdValue !== null && s3ddSelected !== null;
  /* Retry gate: re-enable only once either half genuinely DIFFERS from the
     combination just marked wrong — a live comparison, not a one-shot flag. */
  if (chk) chk.disabled = !bothFilled || s3vdSignature() === s3vdLastWrong;
}

/* Check / advance — the main bottom-bar button ("צדקתי?") */
function s3vdCheck() {
  if (s3vdAnswered) { advanceScreen(); return; }
  if (s3vdValue === null || s3ddSelected === null) return;

  s3vdAttempts++;
  const valueCorrect  = Number.isInteger(s3vdValue) && s3vdValue === S3VD.correctValue;
  const optionCorrect = s3ddSelected === S3VD.correctOption;
  const allCorrect = valueCorrect && optionCorrect;
  /* xAPI: item 003 declares two questions (q1 = the average, numeric; q2 = enough measurements,
     choice) and the code knows each part's verdict, so each is reported on its own; isLast is
     shared by the screen. */
  const s3vdLast = allCorrect || s3vdAttempts >= S3VD.maxAttempts;
  xapiAnswered('003', 'q1', valueCorrect, s3vdLast, document.getElementById('s3v-input')?.value.trim() ?? '');
  xapiAnswered('003', 'q2', optionCorrect, s3vdLast, s3ddOptionText(s3ddSelected));

  if (allCorrect) {
    s3vdMarkValue('correct');
    s3vdMarkOption('correct');
    s3vdShowPopup('correct');
    s3vdFinish();
  } else if (s3vdAttempts >= S3VD.maxAttempts) {
    /* Capture the learner's final submission for BOTH parts, and each
       part's own correctness, BEFORE the reveal overwrites either -- this
       is the only place they still exist. Then resolve straight into the
       solution view; the question is complete at this moment. */
    s3vdAnswer = {
      value: document.getElementById('s3v-input')?.value ?? '',
      valueCorrect,
      option: s3ddSelected,
      optionCorrect
    };
    s3vdView = 'solution';
    s3vdApplyView();
    s3vdFinish();
  } else {
    // First wrong — mark each part: wrong red, right green (client QA
    // 2026-09-23 — a partly-right attempt must show which half was right).
    // Both stay editable; a part's mark clears when that part is changed.
    document.getElementById('s3v-input')?.classList.add(valueCorrect ? 'correct' : 'error');
    const ddBtn = document.getElementById('s3dd-btn');
    ddBtn?.classList.add(optionCorrect ? 'mdq-correct' : 'mdq-wrong');
    ddBtn?.insertAdjacentHTML('beforeend', optionCorrect ? S3VD_CHECK_SVG : S3VD_WRONG_SVG);
    /* Re-check stays disabled until the learner changes either half */
    s3vdLastWrong = s3vdSignature();
    const chk = document.getElementById('s3v-check');
    if (chk) chk.disabled = true;
    s3vdShowPopup('retry');
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

/* Exact Figma vectors (eSbp4bKHgBky0rakDb8l9N node 1027:26021), shown
   inside resolved/wrong fields — same assets as part-01 S10 */
const S3VD_CHECK_SVG =
  '<svg class="mdq-check-ico" width="16" height="16" viewBox="0 0 14 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M4.52036 12C4.12296 12.0002 3.74183 11.8126 3.46106 11.4787L0.258452 7.67744C-0.0861507 7.26814 -0.0861507 6.60467 0.258452 6.19536C0.603165 5.78619 1.16194 5.78619 1.50666 6.19536L4.52036 9.77374L12.4933 0.306878C12.8381 -0.102293 13.3968 -0.102293 13.7415 0.306878C14.0862 0.716179 14.0862 1.37966 13.7415 1.78896L5.57966 11.4787C5.29889 11.8126 4.91776 12.0002 4.52036 12Z" fill="#609E12"/>' +
  '</svg>';
const S3VD_WRONG_SVG =
  '<svg class="mdq-wrong-ico" width="16" height="16" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M13.6743 0.325691C13.4657 0.117151 13.1828 0 12.8879 0C12.5929 0 12.31 0.117151 12.1014 0.325691L7 5.42709L1.8986 0.325691C1.69 0.117151 1.40711 0 1.11215 0C0.817183 0 0.534294 0.117151 0.325691 0.325691C0.117151 0.534294 0 0.817183 0 1.11215C0 1.40711 0.117151 1.69 0.325691 1.8986L5.42709 7L0.325691 12.1014C0.117151 12.31 0 12.5929 0 12.8879C0 13.1828 0.117151 13.4657 0.325691 13.6743C0.534294 13.8829 0.817183 14 1.11215 14C1.40711 14 1.69 13.8829 1.8986 13.6743L7 8.57291L12.1014 13.6743C12.31 13.8829 12.5929 14 12.8879 14C13.1828 14 13.4657 13.8829 13.6743 13.6743C13.8829 13.4657 14 13.1828 14 12.8879C14 12.5929 13.8829 12.31 13.6743 12.1014L8.57291 7L13.6743 1.8986C13.8829 1.69 14 1.40711 14 1.11215C14 0.817183 13.8829 0.534294 13.6743 0.325691Z" fill="#B20010"/>' +
  '</svg>';

/* Resolved-state rendering of the value box. 'correct' = this part was right
   on submit. 'solution' / 'answer' are the two toggle views -- 'answer' shows
   the learner's own value, colored per THAT part's own correctness (a
   screen-specific need: on this combined screen only one of the two parts
   may have been wrong). */
function s3vdMarkValue(state) {
  const el = document.getElementById('s3v-input');
  if (!el) return;
  el.disabled = true;
  el.classList.remove('error', 'locked', 'correct');
  el.classList.add('locked');
  if (state === 'answer') {
    el.value = s3vdAnswer.value;
    el.classList.add(s3vdAnswer.valueCorrect ? 'correct' : 'error');
  } else {
    if (state === 'solution') el.value = S3VD.correctValue;
    el.classList.add('correct');   // 'correct' outcome, or the solution view
  }
}

/* Same shape as s3vdMarkValue, for the dropdown half. Reuses this screen's
   existing resolved-look (green box + hidden chevron + check ✓, identical to
   part-01 S10) for anything that reads as correct, and its existing
   first-attempt "mdq-wrong" look for the answer view when that part was
   actually wrong -- no new visual language introduced. */
function s3vdMarkOption(state) {
  const btn = document.getElementById('s3dd-btn');
  const sel = document.getElementById('s3dd-selected');
  if (!btn) return;
  btn.disabled = true;
  btn.classList.remove('mdq-wrong', 'mdq-correct');
  btn.querySelector('.mdq-check-ico')?.remove();
  btn.querySelector('.mdq-wrong-ico')?.remove();
  const chevron = btn.querySelector('.mdq-chevron');
  if (state === 'answer') {
    if (sel) sel.textContent = s3ddOptionText(s3vdAnswer.option);
    btn.removeAttribute('data-empty');
    if (s3vdAnswer.optionCorrect) {
      btn.classList.add('mdq-correct');
      if (chevron) chevron.style.display = 'none';
      btn.insertAdjacentHTML('beforeend', S3VD_CHECK_SVG);
    } else {
      btn.classList.add('mdq-wrong');
      /* Client QA: never show the chevron once the answer is final and
         locked (btn.disabled above) — this view can't be edited. */
      if (chevron) chevron.style.display = 'none';
      btn.insertAdjacentHTML('beforeend', S3VD_WRONG_SVG);
    }
  } else {
    if (state === 'solution') { if (sel) sel.textContent = s3ddOptionText(S3VD.correctOption); }
    btn.removeAttribute('data-empty');
    btn.classList.add('mdq-correct');
    if (chevron) chevron.style.display = 'none';
    btn.insertAdjacentHTML('beforeend', S3VD_CHECK_SVG);
  }
}

/* Single owner of the resolved-wrong state for BOTH parts and the popup --
   see part 06 S3's s3vApplyView(). Idempotent; never re-runs validation. */
function s3vdApplyView() {
  if (s3vdAnswer === null) return;
  s3vdMarkValue(s3vdView);
  s3vdMarkOption(s3vdView);
  s3vdShowPopup('wrong2', s3vdView);
}

/* Pure view switch -- see part 06 S3's s3vToggleView(). Never routes through
   s3vdCheck(), never touches s3vdAttempts, s3vdValue/s3ddSelected (the real
   scoring source), or the done lock. */
function s3vdToggleView() {
  if (s3vdAnswer === null) return;
  s3vdView = (s3vdView === 'solution') ? 'answer' : 'solution';
  s3vdApplyView();
}

function s3vdShowPopup(type, view) {
  const popup = document.getElementById('s3v-popup');
  if (!popup) return;
  const base = S3VD_POPUP_CFG[type];
  const cfg  = (view === 'answer' && base.answerView)
             ? Object.assign({}, base, base.answerView)
             : base;
  popup.style.background = cfg.bg;
  /* Reset position only on a genuine open -- see part 06 S3's s3vShowPopup(). */
  if (popup.classList.contains('hidden')) resetPopupPosition(popup);
  const titleEl = document.getElementById('s3v-popup-title');
  if (titleEl) titleEl.innerHTML = cfg.title.map(t => '<p>' + t + '</p>').join('');
  const bodyEl = document.getElementById('s3v-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  renderPopupAction('s3v-popup', cfg.action, s3vdToggleView);
  popup.classList.remove('hidden');
  clampPopup(popup);
}


function s3vdFinish() {
  s3vdAnswered = true;
  s3vdDone = true;
  const chk = document.getElementById('s3v-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  document.getElementById('s3v-hint-overlay')?.classList.add('hidden');
  const resultState = (s3vdValue === S3VD.correctValue && s3ddSelected === S3VD.correctOption)
    ? 'correct' : 'incorrect';
  practiceProgress.questions[2].state = resultState;
  syncPracticeProgressNav(document.getElementById('s3'));
}

function s3vdOpenHint() {
  if (s3vdAnswered) return;
  /* xAPI requested.1 — one hint for the whole two-part screen; reported against q1. */
  xapiRequestedHint('003', 'q1');
  document.getElementById('s3v-hint-overlay')?.classList.remove('hidden');
}
function s3vdCloseHint() {
  document.getElementById('s3v-hint-overlay')?.classList.add('hidden');
}
function s3vdCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 's3v-hint-overlay') s3vdCloseHint();
}

function s3vdResetInitial() {
  s3vdValue = null;
  s3ddSelected = null;
  s3vdAttempts = 0;
  s3vdAnswered = false;
  s3vdAnswer = null;
  s3vdView   = 'solution';
  s3vdLastWrong = null;

  const input = document.getElementById('s3v-input');
  if (input) { input.value = ''; input.disabled = false; input.classList.remove('error', 'locked', 'correct'); }

  const btn = document.getElementById('s3dd-btn');
  const sel = document.getElementById('s3dd-selected');
  if (btn) {
    btn.disabled = false;
    btn.classList.remove('mdq-correct', 'mdq-wrong');
    btn.setAttribute('data-empty', 'true');
    // Undo the resolved look: restore the chevron, drop the check/X icon
    const chevron = btn.querySelector('.mdq-chevron');
    if (chevron) chevron.style.display = '';
    btn.querySelector('.mdq-check-ico')?.remove();
    btn.querySelector('.mdq-wrong-ico')?.remove();
  }
  if (sel) sel.textContent = 'اختاروا إجابة';
  s3ddCloseList();

  document.getElementById('s3v-popup')?.classList.add('hidden');
  const chk = document.getElementById('s3v-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  practiceProgress.questions[2].state = 'current';
}

function s3vdEnter() {
  practiceProgress.questions[2].visited = true;
  practiceProgress.questions[2].screen = 3;
  if (!s3vdDone) {
    s3vdResetInitial();
  } else {
    /* A resolved screen always comes back on the SOLUTION view -- see part 06
       S3's s3vEnter() for the full rationale. This screen previously relied
       on DOM persistence alone (no else branch existed); that stopped being
       enough once a Done return could be showing either view -- this call is
       what guarantees the board and the reopened popup agree. */
    s3vdView = 'solution';
    s3vdApplyView();
  }
  document.getElementById('s3v-hint-overlay')?.classList.add('hidden');
  syncPracticeProgressNav(document.getElementById('s3'));
}

/* ═══════════════════════════════════════════════════════════
   TEMPLATE — TransitionScreen (Screen 05 / #s4, slide 32)
   Same template as S0 — companion video (medal variant), resolved
   per the character carried over from part 01, on every entry.
   No gate: continue ("המשך") is always enabled.
   ═══════════════════════════════════════════════════════════ */
function s4trEnter() {
  const vid = document.getElementById('s4-video');
  if (!vid) return;
  const char = getCharacter();
  window.lomdaState.selectedCharacter = char;
  const src = S4_CHARACTER_VIDEOS[char] || S4_CHARACTER_VIDEOS['character-1'];
  if (!vid.src || !vid.src.endsWith(src)) {
    vid.src = src;
    vid.load();
  }
  vid.play().catch(() => {});
  freezeVideoOnEnd(vid);
}

function advanceFromS4() {
  goTo(5);
}

/* ═══════════════════════════════════════════════════════════
   TEMPLATE — SingleChoiceQuestion, dual-image variant (Screen
   06 / #s5, slide 33 — last slide of the production deck).
   Standalone "harder exercise" question after S4's transition —
   not part of the 3-question practice set (no progress-question
   nav, doesn't touch practiceProgress). Hint hidden until the
   first wrong attempt (producer note: "רמז מופיע רק אחרי ניסיון
   מענה שגוי 1"). 2 attempts. Correct: b ("עדי, כי המדידות קרובות
   זו לזו"). Last screen of this part — its "שנמשיך?" completion
   button goes on to part 03 via goToNextPart(), not goTo().
   ═══════════════════════════════════════════════════════════ */
const S5BQ = { correctId: 'b', maxAttempts: 2 };
let s5bqSelected = null;   // currently selected option id
let s5bqAttempts = 0;      // number of check attempts made
let s5bqAnswered = false;  // true once resolved (correct or final wrong)
let s5bqDone     = false;  // resume-state lock (survives navigation)
let s5bqLastWrong = null;  // option id marked wrong on a non-final attempt (gates re-check)

const S5BQ_POPUP_CFG = {
  retry: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.'],
    body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
  },
  correct: {
    bg: '#edf8ed',
    title: ['الإجابة صحيحة‎.'],
    body: ['تقارُب القياسات، وليس المعدل، يدل على الموثوقية. قياسات أمل أقرب من بعضها البعض (أي إن تشتّتها أصغر)، ولذلك فهي أكثر موثوقية‎.']
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.', 'الإجابة الصحيحة معلَّمة.'],
    body: ['تقارُب القياسات، وليس المعدل، يدل على الموثوقية. قياسات أمل أقرب من بعضها البعض (أي إن تشتّتها أصغر)، ولذلك فهي أكثر موثوقية‎.']
  }
};

function s5bqSelect(id) {
  if (s5bqAnswered) return;
  dismissRetryPopup('s5bq-popup', s5bqDone);
  s5bqSelected = id;
  if (s5bqAttempts > 0) {
    document.querySelectorAll('#s5 .scq-opt').forEach(o => o.classList.remove('wrong', 'correct'));
  }
  document.querySelectorAll('#s5 .scq-opt').forEach(o => {
    const sel = o.dataset.id === id;
    o.classList.toggle('selected', sel);
    o.setAttribute('aria-checked', sel ? 'true' : 'false');
  });
  const chk = document.getElementById('s5bq-check');
  if (chk && !s5bqAnswered) chk.disabled = !s5bqSelected || s5bqSelected === s5bqLastWrong;
}

function s5bqCheck() {
  if (s5bqAnswered) { goToNextPart(); return; }
  if (!s5bqSelected) return;

  s5bqAttempts++;
  const isCorrect = s5bqSelected === S5BQ.correctId;
  xapiAnswered('004', 'q1', isCorrect, isCorrect || s5bqAttempts >= S5BQ.maxAttempts,
    xapiAnswerText(document.querySelector('#s5 .scq-opt[data-id="' + s5bqSelected + '"]')));

  if (isCorrect) {
    s5bqMark(S5BQ.correctId, 'correct');
    s5bqShowPopup('correct');
    s5bqFinish();
  } else if (s5bqAttempts >= S5BQ.maxAttempts) {
    s5bqMark(S5BQ.correctId, 'correct');
    s5bqMark(s5bqSelected, 'wrong');
    s5bqShowPopup('wrong2');
    s5bqFinish();
  } else {
    s5bqMark(s5bqSelected, 'wrong');
    /* Re-check stays disabled until the learner picks a DIFFERENT option */
    s5bqLastWrong = s5bqSelected;
    const chk = document.getElementById('s5bq-check');
    if (chk) chk.disabled = true;
    s5bqShowPopup('retry');
    const hint = document.getElementById('s5bq-hint');
    if (hint) hint.style.visibility = 'visible';
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

function s5bqMark(id, cls) {
  const opt = document.querySelector('#s5 .scq-opt[data-id="' + id + '"]');
  if (!opt) return;
  opt.classList.remove('selected');
  opt.classList.add(cls);
}

function s5bqShowPopup(type) {
  const popup = document.getElementById('s5bq-popup');
  if (!popup) return;
  const cfg = S5BQ_POPUP_CFG[type];
  popup.style.background = cfg.bg;
  resetPopupPosition(popup);
  const titleEl = document.getElementById('s5bq-popup-title');
  if (titleEl) titleEl.innerHTML = cfg.title.map(t => '<p>' + t + '</p>').join('');
  const bodyEl = document.getElementById('s5bq-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  popup.classList.remove('hidden');
}


function s5bqFinish() {
  s5bqAnswered = true;
  s5bqDone = true;
  document.querySelectorAll('#s5 .scq-opt').forEach(o => { o.disabled = true; });
  const chk = document.getElementById('s5bq-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s5bq-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s5bq-hint-overlay')?.classList.add('hidden');
}

function s5bqOpenHint() {
  if (s5bqAnswered) return;
  /* xAPI requested.1 — after the guard, right before the reveal; this function only opens. */
  xapiRequestedHint('004', 'q1');
  document.getElementById('s5bq-hint-overlay')?.classList.remove('hidden');
}
function s5bqCloseHint() {
  document.getElementById('s5bq-hint-overlay')?.classList.add('hidden');
}
function s5bqCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 's5bq-hint-overlay') s5bqCloseHint();
}

function s5bqResetInitial() {
  s5bqSelected = null;
  s5bqAttempts = 0;
  s5bqAnswered = false;
  s5bqLastWrong = null;
  document.querySelectorAll('#s5 .scq-opt').forEach(o => {
    o.classList.remove('selected', 'correct', 'wrong');
    o.disabled = false;
    o.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s5bq-popup')?.classList.add('hidden');
  const chk = document.getElementById('s5bq-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('s5bq-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = 'hidden'; }
}

function s5bqEnter() {
  if (!s5bqDone) s5bqResetInitial();
  document.getElementById('s5bq-hint-overlay')?.classList.add('hidden');
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

/* Boot */
resetScreenState(0);
if (window.Motion) Motion.reveal(document.querySelector('.screen.active'));

/* S0 loads .active straight from HTML (no goTo(0) call), so this runs at
   module level rather than from resetScreenState(0). */
syncS0BackButton();
/* Deep link: '#last' lands on this part's final screen — used by part 04's
   S0 back button to return here. Placed at module bottom so every sNEnter()
   and the module state they read are already initialized. */
if (location.hash === '#last') goTo(TOTAL_SCREENS - 1);

/* ═══════════════════════════════════════════════════════════
   CANDIDATE TEMPLATE — MultipleChoiceQuestion (documented here for
   future promotion to the 720-templates skill library; #s2 above is
   its first production instance).

   Shape: identical to SingleChoiceQuestion (question workflow, image-
   card structure, attempts, hint policy, feedback-popup system,
   completion label) with exactly one behavioral delta:

   - State: a Set of selected ids instead of a single id.
   - Selection: clicking a card toggles ONLY that card's membership
     in the set — it never clears other selections (unlike
     SingleChoiceQuestion's exclusive radio-style replace).
   - Gate: check button enables once selection.size >= 1 (not "an
     exact count").
   - Correctness: set-equality against a producer-defined correct
     set (order-independent, both-directions: no missing card, no
     extra card).
   - Reveal (final wrong attempt): every card in the correct set is
     marked 'correct' (including ones the learner never selected);
     any learner-selected card NOT in the correct set is marked
     'wrong'. First-wrong (retry) attempt marks ONLY the learner's
     wrongly-selected cards — correct-but-unselected cards stay
     unrevealed, matching SingleChoiceQuestion's don't-reveal-on-
     first-attempt convention.
   - Layout: falls back to a 2×N grid instead of one row when the
     option count doesn't comfortably fit one row (6 options here);
     the producer's own notes for slide 30 raised this exact
     question and left it to the builder — a future template should
     document a card-count → row-count rule instead of a per-screen
     judgment call.
   - aria-checked reflects live membership (role="checkbox" per
     card, not role="radio"); keyboard Enter/Space toggles the
     focused card, mirroring native checkbox semantics.

   Everything else — .s5q-card markup/CSS, .scq-bar/.scq-check/
   .scq-hint, .scq-popup, .scq-hint-overlay, resetPopupPosition/
   popupMouseDown — is reused byte-for-byte from SingleChoiceQuestion.
   ═══════════════════════════════════════════════════════════ */
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
/* .popup-action is created at runtime, after initNavLabels() has already run,
   so renderPopupAction() re-invokes initNavLabels() on the new button's row to
   attach the observer. Listing the class here is what makes that call match.
   Ported verbatim from part 06's Foundation. */
var NAV_LABEL_SELECTOR = '.btn-continue, .scq-back, .scq-hint, .scq-check, .s13-continue, .popup-action';
var navLabelBusy = false;

initNavLabels();

/* ═══════════════════ xAPI (720) — this part's config ═══════════════════
   Data only; the shared layer in ../unit-js/ reads it at call time (guide §6.1).
   ⚠️ SCREEN_TO_SUBCONTENT must hold exactly TOTAL_SCREENS keys (6), 0..5. */
var SCREEN_TO_SUBCONTENT = {
  0: null,          // transition ("3 questions, 2 to advance")
  1: ['001', 1],    // image cards — tool for a glass of orange juice
  2: ['002', 1],    // multiple choice, image cards — the three volume tools
  3: ['003', 1],    // value input (q1) + dropdown (q2) — average of two measurements
  4: null,          // transition
  5: ['004', 1]     // SingleChoice, dual image — Adi and Almog (not in the component score)
};

var XAPI_COMP_SLUG     = 'methodica-science-volume-liquid-01-03';
var XAPI_COMP_ID       = XAPI_ID_PREFIX + XAPI_COMP_SLUG + '/';
var XAPI_EVAL_ITEMS    = { '001': 1, '002': 1, '003': 1, '004': 1 };
var XAPI_METADATA_FILE = '../metadata/methodica-science-volume-liquid-01-03.json';
var XAPI_END_BTN       = 's5bq-check';   // pass-path last click (a failed gate ends on s3v-check)

/* ═══════════════════ Resume (720) — the four per-part hooks ═══════════════════
   Guide §8.7. Committed state only: an unanswered question is reset by its enter function on
   every entry, so a pending pick was never kept across a screen change and is not kept across a
   reload. Answered screens are painted back by restoreScreenUI on every goTo. */
function capturePartPayload() {
  return {
    currentScreen: currentScreen,
    xq: rsCaptureXq(),
    pp: rsCaptureQuestions(practiceProgress),
    s1q: { a: s1qAttempts, ans: s1qAnswered, d: s1qDone, sel: s1qSelected },
    s2mc: { a: s2mcAttempts, ans: s2mcAnswered, d: s2mcDone, sel: [...s2mcSelected] },
    /* S3: both parts' values, and the reveal toggle's three pieces (guide §8.10): the learner's
       own final answer (s3vdAnswer), which view is showing, and the values behind them. */
    s3vd: { a: s3vdAttempts, ans: s3vdAnswered, d: s3vdDone, val: s3vdValue, opt: s3ddSelected,
            raw: document.getElementById('s3v-input')?.value ?? '', answer: s3vdAnswer, view: s3vdView },
    s5bq: { a: s5bqAttempts, ans: s5bqAnswered, d: s5bqDone, sel: s5bqSelected }
  };
}
function applyResumeVars(st) {
  if (!st) return;
  rsRestoreXq(st.xq);
  rsRestoreQuestions(practiceProgress, st.pp);
  const q = k => (st[k] && st[k].d) ? st[k] : null;
  let s;
  if ((s = q('s1q')))  { s1qAttempts = s.a; s1qAnswered = s.ans; s1qDone = true; s1qSelected = s.sel; }
  if ((s = q('s2mc'))) { s2mcAttempts = s.a; s2mcAnswered = s.ans; s2mcDone = true; s2mcSelected = new Set(s.sel || []); }
  if ((s = q('s3vd'))) { s3vdAttempts = s.a; s3vdAnswered = s.ans; s3vdDone = true; s3vdValue = s.val; s3ddSelected = s.opt;
                         s3vdAnswer = s.answer || null; s3vdView = s.view || 'solution'; }
  if ((s = q('s5bq'))) { s5bqAttempts = s.a; s5bqAnswered = s.ans; s5bqDone = true; s5bqSelected = s.sel; }
}
/* S3's typed value and the dropdown's visible label exist only in the DOM (guide §8.9): put
   them back before the painter locks the fields. */
function applyResumeDom(st) {
  const s = st && st.s3vd;
  if (!s || !s.d) return;
  const input = document.getElementById('s3v-input');
  if (input && typeof s.raw === 'string') input.value = s.raw;
  const sel = document.getElementById('s3dd-selected');
  if (sel && s.opt) { sel.textContent = s3ddOptionText(s.opt); document.getElementById('s3dd-btn')?.removeAttribute('data-empty'); }
}
/* S2 multi-select as its final check left it: the chosen cards selected; on a correct set all
   three marked correct, otherwise the correct set green and any wrong pick red. */
function _rsPaintS2() {
  if (!s2mcDone) return;
  const ok = s2mcSetsEqual(s2mcSelected, S2MC.correctSet);
  document.querySelectorAll('#s2 .s5q-card').forEach(c => {
    const id = c.dataset.id, picked = s2mcSelected.has(id);
    c.classList.remove('selected', 'correct', 'wrong');
    c.setAttribute('aria-checked', picked ? 'true' : 'false');
    if (ok) { if (S2MC.correctSet.has(id)) c.classList.add('correct'); }
    else {
      if (picked) c.classList.add('selected');
      if (S2MC.correctSet.has(id)) c.classList.add('correct');
      else if (picked) c.classList.add('wrong');
    }
  });
  s2mcShowPopup(ok ? 'correct' : 'wrong2');
  s2mcFinish(ok ? 'correct' : 'incorrect');
}
/* S3: a correct answer shows both fields locked green; a wrong final one is the reveal toggle,
   painted in whichever view is current (s3vdApplyView owns the fields and the popup). */
function _rsPaintS3() {
  if (!s3vdDone) return;
  if (s3vdAnswer === null) {
    const input = document.getElementById('s3v-input');
    if (input && s3vdValue !== null && input.value === '') input.value = String(s3vdValue);
    const sel = document.getElementById('s3dd-selected');
    if (sel && s3ddSelected) sel.textContent = s3ddOptionText(s3ddSelected);
    s3vdMarkValue('correct');
    s3vdMarkOption('correct');
    s3vdShowPopup('correct');
  } else {
    s3vdApplyView();
  }
  s3vdFinish();
  /* A part that ENDED here on the failed 2-of-3 gate keeps its button disabled (rule 12). */
  const chk = document.getElementById('s3v-check');
  if (chk && practiceGateScore() < 2 && typeof xapiComponentEnded === 'function' && xapiComponentEnded()) {
    chk.disabled = true; chk.setAttribute('aria-disabled', 'true');
  }
}
/* Must never throw (rule 7): guarded, and an unanswered screen is left to its enter function. */
function restoreScreenUI(n) {
  try {
    if (n === 1) rsPaintChoice({ done: s1qDone, selected: s1qSelected, correctId: S1Q.correctId, optSel: '#s1 .s5q-card',
      mark: s1qMark, showPopup: s1qShowPopup, finish: s1qFinish });
    if (n === 2) _rsPaintS2();
    if (n === 3) _rsPaintS3();
    if (n >= 1 && n <= 3) syncPracticeProgressNav(document.getElementById('s' + n));
    if (n === 5) rsPaintChoice({ done: s5bqDone, selected: s5bqSelected, correctId: S5BQ.correctId, optSel: '#s5 .scq-opt',
      mark: s5bqMark, showPopup: s5bqShowPopup, finish: s5bqFinish });
  } catch (e) { console.error('[resume] restoreScreenUI ' + n, e); }
}