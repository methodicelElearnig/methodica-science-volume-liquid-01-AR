'use strict';

/* ═══════════════════════════════════════════════════════════
   methodica-science-volume-liquid-01-02 — main.js
   Part 02 of the liquid-volume lomda — the first standard practice
   series, split out of part 01 (was its S16–S21).
     S0  TransitionScreen (slide 22) — intro to the 5-question
         series. Character video: Read variant.
     S1  ImageHotspotQuestion   — practice Q1/5 (slide 23)
     S2  SingleChoiceQuestion   — practice Q2/5, dual-part variant
     S3  SingleChoiceQuestion   — practice Q3/5, content image
     S4  SingleChoiceQuestion   — practice Q4/5, image cards
     S5  SingleChoiceQuestion   — practice Q5/5, content image
   Screens keep the internal class/function prefixes they were
   authored with in part 01 (s15tr-, s16q-…s20q-); only the
   structural screen numbering was rebased to this part's S0–S5.
   Character choice is carried over from part 01 via localStorage.
   ═══════════════════════════════════════════════════════════ */

/* ─── Constants ─────────────────────────────────────────── */
const TOTAL_SCREENS = 6;  // S0–S5

/* Back navigation to the previous part of the lomda (sibling folder).
   Like every other cross-part link here, this is a plain redirect: the
   target part cold-starts at its own S0, it does not resume. */
/* ─── Cross-part back navigation (session-scoped route stack) ─────
   Parts are separate pages, so "which part did the learner arrive from"
   cannot live in JS memory. A sessionStorage stack records the route
   ACTUALLY taken: every forward hop pushes the part being left, and
   חזרה on S0 pops it. This part's own forward edge branches (part 04 on
   a pass, part 03 on a fail) and part 04 in turn has two inbound edges,
   so a hardcoded predecessor cannot express the real route — hence a
   stack rather than the constant this replaces.
   sessionStorage (not localStorage) is deliberate: the trail belongs to
   this browsing session, so opening a part directly in a fresh tab
   correctly has nowhere to go back to and hides its S0 back button.
   Screen-level resume is intentionally OUT OF SCOPE (owned by the resume
   branch) — back lands on the previous part's LAST screen via the
   '#last' deep link, which cold-starts that screen. ───────────────── */
const LOMDA_ID      = 'methodica-science-volume-liquid-01';
const NAV_STACK_KEY = LOMDA_ID + '_navStack';
const THIS_PART     = LOMDA_ID + '-02';
const S0_BACK_ID    = 's15-back';   // this part's S0 keeps part-01 id numbering

/* ─── State ─────────────────────────────────────────────── */
let currentScreen = 0;

/* ─── Scale App ──────────────────────────────────────────────
   Scale-to-fit the 1280×710 design while EXTENDING the canvas
   to fill the viewport so chrome anchored to canvas edges
   (flag button at top, bottom bars at bottom) reaches the
   actual screen edges instead of letterboxing.
   - scale  = min(viewportW/1280, viewportH/710)  → no distortion
   - canvas = viewport / scale  → in design coords, fills viewport
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

/* ─── GLOBAL COMPONENT — Image zoom (clone-based modal) ──────
   Any [data-zoom-src] button opens the shared #img-zoom-modal;
   any [data-zoom-close="true"] (backdrop, X) closes it. Escape
   closes too. The stage shows a clone of the image WRAPPER so
   overlays inside it are included; the zoom button itself is
   stripped from the clone. ─── */
function openImageZoom(btn) {
  const modal = document.getElementById('img-zoom-modal');
  const stage = document.getElementById('img-zoom-modal-stage');
  if (!modal || !stage || !btn) return;
  const wrapper = btn.closest('.scq-img-inner');
  if (!wrapper) return;
  const clone = wrapper.cloneNode(true);
  clone.querySelectorAll('.img-zoom-btn').forEach(b => b.remove());
  clone.classList.add('img-zoom-clone');
  stage.innerHTML = '';
  stage.appendChild(clone);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeImageZoom() {
  const modal = document.getElementById('img-zoom-modal');
  const stage = document.getElementById('img-zoom-modal-stage');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  if (stage) stage.innerHTML = '';
}

document.addEventListener('click', function (e) {
  const openBtn = e.target.closest('[data-zoom-src]');
  if (openBtn) { openImageZoom(openBtn); return; }
  if (e.target.closest('[data-zoom-close="true"]')) closeImageZoom();
});

/* Screen number → its feedback popup element id, for screens that have one.
   Used to restore a popup the learner left open (not X-closed) — see below. */
const SCREEN_POPUP_ID = {
  1: 's16q-popup', 2: 's17q-popup', 3: 's18q-popup', 4: 's19q-popup',
  5: 's20q-popup'
};
/* Screen number → whether that screen's question has actually been resolved
   (correct, or final wrong) — same "is this question done" check each screen's
   own resetScreenState() branch already uses to decide fresh-reset vs. resume.
   The popup-reopen below must only fire when this is true: reopening a
   "try again" popup over a board that a *not-done* screen's own reset just
   wiped back to blank would show stale feedback for an empty board. */
const SCREEN_DONE = {
  1: () => s16qDone, 2: () => s17qDone, 3: () => s18qDone, 4: () => s19qDone,
  5: () => s20qDone
};

function goTo(n) {
  if (n < 0 || n >= TOTAL_SCREENS) return;
  // Every feedback popup / hint overlay belongs to the screen it was opened
  // on. They live OUTSIDE the .screen divs (so display:none on an inactive
  // screen can't hide them) — hide them ALL on any navigation so none
  // carries over to the next screen.
  document.querySelectorAll('[id$="-popup"], [id$="-hint-overlay"]')
    .forEach(el => el.classList.add('hidden'));
  const prev = document.querySelector('.screen.active');
  if (prev && window.Motion) Motion.cancel(prev);
  if (prev) prev.classList.remove('active');
  // Halt the S0 companion video when leaving its screen (muted, but no
  // reason to keep it decoding in the background).
  if (prev && prev.id === 's0') {
    try { document.getElementById('s15tr-video')?.pause(); } catch (e) {}
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
    s15trEnter();
  }
  if (n === 1) {
    s16qEnter();
  }
  if (n === 2) {
    s17qEnter();
  }
  if (n === 3) {
    s18qEnter();
  }
  if (n === 4) {
    s19qEnter();
  }
  if (n === 5) {
    s20qEnter();
  }
}

function goBack() {
  // S0 is this part's first screen — "back" leaves for the previous part.
  if (currentScreen === 0) { goToPrevPart(); return; }
  goTo(currentScreen - 1);
}

function advanceScreen() {
  // S0 is a transition screen — no gate, always advances.
  // Practice-question gates: must answer before advancing
  if (currentScreen === 1 && !s16qAnswered) return;
  if (currentScreen === 2 && !s17qAnswered) return;
  if (currentScreen === 3 && !s18qAnswered) return;
  if (currentScreen === 4 && !s19qAnswered) return;
  // S5 is the last screen — series-end score routing. Threshold matches the
  // 720 global pass rule (passThreshold = ceil(2*N/3); N=5 → 4) and this
  // part's own S0 transition screen: "צריך לענות נכון על 4 שאלות לפחות".
  // ≥4/5 practice questions correct → continue to part 04 (main path);
  // otherwise → part 03 (extra practice). Parts are sibling folders of this
  // one, so a relative URL works wherever the unit is hosted.
  if (currentScreen === 5) {
    /* xAPI: the part's last click (S5 "שנמשיך?"). The component is reported on BOTH outcomes,
       before the branch (guide §6.5): success = at least 4 of the 5 questions the S0 screen
       promised; score = practiceScore() / 5 — the part's own per-screen verdicts, so the two-part
       S2 counts once, as on screen (XAPI_Q_RESULTS holds 6 entries: 002 has q1 and q2). In
       production the platform routes; the hop below exists only under DEV_NAV. */
    const score = practiceScore();
    try {
      xapiEndComponent({ success: score >= 4, score: { scaled: score / 5 } },
        document.getElementById('s20q-check'));
    } catch (e) {}
    // Pass → skip the extra-practice part; fail → route through it.
    goToPart(LOMDA_ID + (score >= 4 ? '-04' : '-03'));
    return;
  }
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
    s16qCloseHint();
    s17qCloseHint();
    s18qCloseHint();
    s19qCloseHint();
    s20qCloseHint();
    closeImageZoom();
  }
});

/* ─── Feedback-popup dragging (shared pointer handlers) ──── */
window.addEventListener('pointermove', e => {
  if (!s16qPopupDragging && !s17qPopupDragging &&
      !s18qPopupDragging && !s19qPopupDragging && !s20qPopupDragging) return;
  if (e.buttons === 0) { endPopupDrags(); return; }   /* release was missed: never follow a free cursor */
  const app = document.getElementById('app');
  if (!app) return;
  const appLeft = parseFloat(app.style.left)  || 0;
  const appTop  = parseFloat(app.style.top)   || 0;
  const scaleM  = app.style.transform.match(/scale\(([^)]+)\)/);
  const scale   = scaleM ? parseFloat(scaleM[1]) : 1;

  if (s16qPopupDragging) {
    const popup = document.getElementById('s16q-popup');
    if (popup) {
      const newX = (e.clientX - appLeft) / scale - s16qPopupOffX;
      const newY = (e.clientY - appTop)  / scale - s16qPopupOffY;
      popup.style.left = Math.max(0, Math.min(newX, app.offsetWidth - popup.offsetWidth))  + 'px';
      popup.style.top  = Math.max(0, Math.min(newY, app.offsetHeight - 74 - popup.offsetHeight)) + 'px';
    }
  }

  if (s17qPopupDragging) {
    const popup = document.getElementById('s17q-popup');
    if (popup) {
      const newX = (e.clientX - appLeft) / scale - s17qPopupOffX;
      const newY = (e.clientY - appTop)  / scale - s17qPopupOffY;
      popup.style.left = Math.max(0, Math.min(newX, app.offsetWidth - popup.offsetWidth))  + 'px';
      popup.style.top  = Math.max(0, Math.min(newY, app.offsetHeight - 74 - popup.offsetHeight)) + 'px';
    }
  }

  if (s18qPopupDragging) {
    const popup = document.getElementById('s18q-popup');
    if (popup) {
      const newX = (e.clientX - appLeft) / scale - s18qPopupOffX;
      const newY = (e.clientY - appTop)  / scale - s18qPopupOffY;
      popup.style.left = Math.max(0, Math.min(newX, app.offsetWidth - popup.offsetWidth))  + 'px';
      popup.style.top  = Math.max(0, Math.min(newY, app.offsetHeight - 74 - popup.offsetHeight)) + 'px';
    }
  }

  if (s19qPopupDragging) {
    const popup = document.getElementById('s19q-popup');
    if (popup) {
      const newX = (e.clientX - appLeft) / scale - s19qPopupOffX;
      const newY = (e.clientY - appTop)  / scale - s19qPopupOffY;
      popup.style.left = Math.max(0, Math.min(newX, app.offsetWidth - popup.offsetWidth))  + 'px';
      popup.style.top  = Math.max(0, Math.min(newY, app.offsetHeight - 74 - popup.offsetHeight)) + 'px';
    }
  }

  if (s20qPopupDragging) {
    const popup = document.getElementById('s20q-popup');
    if (popup) {
      const newX = (e.clientX - appLeft) / scale - s20qPopupOffX;
      const newY = (e.clientY - appTop)  / scale - s20qPopupOffY;
      popup.style.left = Math.max(0, Math.min(newX, app.offsetWidth - popup.offsetWidth))  + 'px';
      popup.style.top  = Math.max(0, Math.min(newY, app.offsetHeight - 74 - popup.offsetHeight)) + 'px';
    }
  }
});

function endPopupDrags() { s16qPopupDragging = false; s17qPopupDragging = false; s18qPopupDragging = false; s19qPopupDragging = false; s20qPopupDragging = false; }
window.addEventListener('pointerup',     endPopupDrags);
window.addEventListener('pointercancel', endPopupDrags);
/* ═══════════════════════════════════════════════════════════
   S15 — TransitionScreen (slide 22) — second instance.
   Same pattern as S13; Read character-video variant, plus a
   lead-in line above the title. No gate.
   ═══════════════════════════════════════════════════════════ */
const S15_CHARACTER_VIDEOS = {
  'character-1': 'assets/video/Character-1-Read.mp4',
  'character-2': 'assets/video/Character-2-Read.mp4'
};

function s15trEnter() {
  const vid = document.getElementById('s15tr-video');
  if (!vid) return;
  const char = getCharacter();
  const src  = S15_CHARACTER_VIDEOS[char] || S15_CHARACTER_VIDEOS['character-1'];
  if (!vid.src || !vid.src.endsWith(src)) {
    vid.src = src;
    vid.load();
  }
  vid.play().catch(() => {});
  freezeVideoOnEnd(vid);
}

function advanceFromS15() {
  goTo(1);
}


/* ═══════════════════════════════════════════════════════════
   COMPONENT — Practice progress state (shared across the 5
   practice-question screens; ported from Target-01's
   standardPracticeProgress). Screens mutate this object and call
   syncPracticeProgressNav(sectionEl) — no new state objects needed.
   Route decision at the series end: ≥4/5 correct, matching the 720
   global pass rule (passThreshold = ceil(2*N/3); N=5 → 4).
   ═══════════════════════════════════════════════════════════ */
const practiceProgress = {
  questions: [
    { number: 1, visited: true,  state: 'current',      screen: 1    },
    { number: 2, visited: false, state: 'not-answered', screen: null },
    { number: 3, visited: false, state: 'not-answered', screen: null },
    { number: 4, visited: false, state: 'not-answered', screen: null },
    { number: 5, visited: false, state: 'not-answered', screen: null }
  ]
};

function practiceScore() {
  return practiceProgress.questions.filter(q => q.state === 'correct').length;
}

/* ═══════════════════════════════════════════════════════════
   S16 — ImageHotspotQuestion, practice Q1/5 (slide 23)
   Same state machine as S8 (lettered 40px hotspots instead of the
   140px face targets). Correct: ג — הנקודה הנמוכה בעקומה.
   Hint appears only AFTER the first wrong answer (producer note
   for this practice series — differs from the learning screens).
   ═══════════════════════════════════════════════════════════ */
const S16Q = { correctId: 'c', maxAttempts: 2 };
let s16qSelected = null;
let s16qAttempts = 0;
let s16qAnswered = false;
let s16qDone     = false;
let s16qLastWrong = null;  // hotspot id marked wrong on a non-final attempt (gates re-check)

const S16Q_POPUP_CFG = {
  retry: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.'],
    body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
  },
  correct: {
    bg: '#edf8ed',
    title: ['الإجابة صحيحة‎.'],
    body: ['تنصّ القاعدة العلمية على أن القراءة تكون عند أسفل الجزء المقعر، وعلى مستوى العين‎.']
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.', 'الإجابة الصحيحة معلَّمة.'],
    body: ['تنصّ القاعدة العلمية على أن القراءة تكون عند أسفل الجزء المقعر، وعلى مستوى العين‎.']
  }
};

function s16qSelect(id) {
  if (s16qAnswered) return;
  dismissRetryPopup('s16q-popup', s16qDone);
  s16qSelected = id;
  if (s16qAttempts > 0) {
    document.querySelectorAll('#s1 .s16q-hotspot').forEach(h => h.classList.remove('wrong', 'correct'));
  }
  // Ripple is only a pre-first-selection affordance — see s8qSelect.
  document.querySelectorAll('#s1 .s16q-hotspot').forEach(h => {
    h.classList.toggle('selected', h.dataset.id === id);
    h.classList.add('answered');
  });
  const chk = document.getElementById('s16q-check');
  if (chk) chk.disabled = !s16qSelected || s16qSelected === s16qLastWrong;
}

function s16qCheck() {
  if (s16qAnswered) { advanceScreen(); return; }
  if (!s16qSelected) return;

  s16qAttempts++;
  const isCorrect = s16qSelected === S16Q.correctId;
  const s16qEl = document.querySelector('#s1 .s16q-hotspot[data-id="' + s16qSelected + '"]');
  xapiAnswered('001', 'q1', isCorrect, isCorrect || s16qAttempts >= S16Q.maxAttempts,
    (xapiAnswerText(s16qEl) || (s16qEl && s16qEl.getAttribute('aria-label')) || s16qSelected));

  if (isCorrect) {
    s16qMark(S16Q.correctId, 'correct');
    s16qShowPopup('correct');
    s16qFinish('correct');
  } else if (s16qAttempts >= S16Q.maxAttempts) {
    s16qMark(S16Q.correctId, 'correct');
    s16qMark(s16qSelected, 'wrong');
    s16qShowPopup('wrong2');
    s16qFinish('incorrect');
  } else {
    // First wrong — retry allowed; the hint becomes available now
    s16qMark(s16qSelected, 'wrong');
    /* Re-check stays disabled until the learner picks a DIFFERENT hotspot */
    s16qLastWrong = s16qSelected;
    const chk = document.getElementById('s16q-check');
    if (chk) chk.disabled = true;
    s16qShowPopup('retry');
    const hint = document.getElementById('s16q-hint');
    if (hint) hint.style.visibility = 'visible';
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

function s16qMark(id, cls) {
  const hotspot = document.querySelector('#s1 .s16q-hotspot[data-id="' + id + '"]');
  if (!hotspot) return;
  hotspot.classList.remove('selected');
  hotspot.classList.add(cls);
}

function s16qShowPopup(type) {
  const popup = document.getElementById('s16q-popup');
  if (!popup) return;
  const cfg = S16Q_POPUP_CFG[type];
  popup.style.background = cfg.bg;
  resetPopupPosition(popup);
  const titleEl = document.getElementById('s16q-popup-title');
  if (titleEl) titleEl.innerHTML = cfg.title.map(t => '<p>' + t + '</p>').join('');
  const bodyEl = document.getElementById('s16q-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  popup.classList.remove('hidden');
}


function s16qFinish(resultState) {
  s16qAnswered = true;
  s16qDone = true;
  document.querySelectorAll('#s1 .s16q-hotspot').forEach(h => { h.disabled = true; h.classList.add('answered'); });
  const chk = document.getElementById('s16q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s16q-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s16q-hint-overlay')?.classList.add('hidden');
  practiceProgress.questions[0].state = resultState;
  syncPracticeProgressNav(document.getElementById('s1'));
}

function s16qOpenHint() {
  if (s16qAnswered) return;
  /* xAPI requested.1 — after the guard, right before the reveal; this function only opens. */
  xapiRequestedHint('001', 'q1');
  document.getElementById('s16q-hint-overlay')?.classList.remove('hidden');
}
function s16qCloseHint() {
  document.getElementById('s16q-hint-overlay')?.classList.add('hidden');
}
function s16qCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 's16q-hint-overlay') s16qCloseHint();
}

function s16qResetInitial() {
  s16qSelected = null;
  s16qAttempts = 0;
  s16qAnswered = false;
  s16qLastWrong = null;
  document.querySelectorAll('#s1 .s16q-hotspot').forEach(h => {
    h.classList.remove('selected', 'correct', 'wrong', 'answered');
    h.disabled = false;
  });
  document.getElementById('s16q-popup')?.classList.add('hidden');
  const chk = document.getElementById('s16q-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('s16q-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = 'hidden'; }
  practiceProgress.questions[0].state = 'current';
}

/* Enter — completed question stays completed on return */
function s16qEnter() {
  if (!s16qDone) s16qResetInitial();
  document.getElementById('s16q-hint-overlay')?.classList.add('hidden');
  syncPracticeProgressNav(document.getElementById('s1'));
}

let s16qPopupDragging = false;
let s16qPopupOffX = 0, s16qPopupOffY = 0;

function s16qPopupMouseDown(e) {
  s16qPopupDragging = true;
  const popup = document.getElementById('s16q-popup');
  const app   = document.getElementById('app');
  if (!popup || !app) return;
  const appLeft = parseFloat(app.style.left) || 0;
  const appTop  = parseFloat(app.style.top)  || 0;
  const scaleM  = app.style.transform.match(/scale\(([^)]+)\)/);
  const scale   = scaleM ? parseFloat(scaleM[1]) : 1;
  const canvasX = (e.clientX - appLeft) / scale;
  const canvasY = (e.clientY - appTop)  / scale;
  const topPx = parseFloat(popup.style.top);
  const top = isNaN(topPx) ? popup.offsetTop : topPx;
  popup.style.top    = top + 'px';
  popup.style.bottom = 'auto';
  s16qPopupOffX = canvasX - (parseFloat(popup.style.left) || 2);
  s16qPopupOffY = canvasY - top;
  e.preventDefault();
}


/* ═══════════════════════════════════════════════════════════
   S17 — SingleChoiceQuestion dual-part variant, practice Q2/5
   (slide 24). Two option groups (א: average, ב: reliability) on one
   screen — צדקתי? enables only when BOTH have a selection; correct
   means both parts right (producer note). 2 attempts, hint after
   the first wrong answer. Attempt-1 feedback marks EACH part: the wrong
   part's selection red, a right part's selection green (client QA
   2026-09-23: a partly-right attempt gave no sign of which half was right).
   A part's mark clears only when that same part is changed.
   ═══════════════════════════════════════════════════════════ */
const S17Q = { correct: { a: '30', b: 'yes' }, maxAttempts: 2 };
let s17qSelectedParts = { a: null, b: null };
let s17qAttempts = 0;
let s17qAnswered = false;
let s17qDone     = false;
/* Joined signature of BOTH parts as of the last non-final wrong attempt —
   gates the check button disabled until the learner changes either half. */
let s17qLastWrong = null;
function s17qSignature() {
  return (s17qSelectedParts.a ?? '') + '|' + (s17qSelectedParts.b ?? '');
}

const S17Q_POPUP_CFG = {
  retry: {
    bg: '#ffdbdc',
    title: ['الإجابة ليست صحيحة بالكامل.'],
    body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
  },
  correct: {
    bg: '#edf8ed',
    title: ['إجابة صحيحة.', 'كل الاحترام!'],
    body: ['المعدل: <span dir="ltr">(30+28+32) : 3 = 30</span> ملل.',
           'يبدو أن القياسات موثوقة. لو كان هناك فرق بمقدار 20 ملل مثلًا، لما كان القياس موثوقًا‎.']
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة ليست صحيحة بالكامل.'],
    body: ['المعدل: <span dir="ltr">(30+28+32) : 3 = 30</span> ملل.',
           'يبدو أن القياسات موثوقة. لو كان هناك فرق بمقدار 20 ملل مثلًا، لما كان القياس موثوقًا‎.']
  }
};

function s17qSelect(part, id) {
  if (s17qAnswered) return;
  dismissRetryPopup('s17q-popup', s17qDone);
  s17qSelectedParts[part] = id;
  if (s17qAttempts > 0) {
    /* Only this part's marks — the other part keeps its green/red verdict */
    document.querySelectorAll('#s2 .scq-opt[data-part="' + part + '"]').forEach(o => o.classList.remove('wrong', 'correct'));
  }
  document.querySelectorAll('#s2 .scq-opt[data-part="' + part + '"]').forEach(o => {
    const sel = o.dataset.id === id;
    o.classList.toggle('selected', sel);
    o.setAttribute('aria-checked', sel ? 'true' : 'false');
  });
  const chk = document.getElementById('s17q-check');
  const bothFilled = s17qSelectedParts.a && s17qSelectedParts.b;
  /* Retry gate: re-enable only once either half genuinely DIFFERS from the
     combination just marked wrong — a live comparison, not a one-shot flag. */
  if (chk) chk.disabled = !bothFilled || s17qSignature() === s17qLastWrong;
}

function s17qCheck() {
  if (s17qAnswered) { advanceScreen(); return; }
  if (!s17qSelectedParts.a || !s17qSelectedParts.b) return;

  s17qAttempts++;
  const aRight = s17qSelectedParts.a === S17Q.correct.a;
  const bRight = s17qSelectedParts.b === S17Q.correct.b;
  const allRight = aRight && bRight;
  /* xAPI: item 002 declares two questions (q1 = the average, q2 = reliability) and the code knows
     each part's verdict, so each is reported on its own; isLast is shared by the screen. */
  const s17qLast = allRight || s17qAttempts >= S17Q.maxAttempts;
  xapiAnswered('002', 'q1', aRight, s17qLast,
    xapiAnswerText(document.querySelector('#s2 .scq-opt[data-part="a"][data-id="' + s17qSelectedParts.a + '"]')));
  xapiAnswered('002', 'q2', bRight, s17qLast,
    xapiAnswerText(document.querySelector('#s2 .scq-opt[data-part="b"][data-id="' + s17qSelectedParts.b + '"]')));

  if (allRight) {
    s17qMark('a', S17Q.correct.a, 'correct');
    s17qMark('b', S17Q.correct.b, 'correct');
    s17qShowPopup('correct');
    s17qFinish('correct');
  } else if (s17qAttempts >= S17Q.maxAttempts) {
    // Reveal both correct answers; mark wrong selections red
    s17qMark('a', S17Q.correct.a, 'correct');
    s17qMark('b', S17Q.correct.b, 'correct');
    if (!aRight) s17qMark('a', s17qSelectedParts.a, 'wrong');
    if (!bRight) s17qMark('b', s17qSelectedParts.b, 'wrong');
    s17qShowPopup('wrong2');
    s17qFinish('incorrect');
  } else {
    // First wrong — mark each part: wrong selection red, right selection green; hint unlocks
    s17qMark('a', s17qSelectedParts.a, aRight ? 'correct' : 'wrong');
    s17qMark('b', s17qSelectedParts.b, bRight ? 'correct' : 'wrong');
    /* Re-check stays disabled until the learner changes either half */
    s17qLastWrong = s17qSignature();
    const chk = document.getElementById('s17q-check');
    if (chk) chk.disabled = true;
    s17qShowPopup('retry');
    const hint = document.getElementById('s17q-hint');
    if (hint) hint.style.visibility = 'visible';
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

function s17qMark(part, id, cls) {
  const opt = document.querySelector('#s2 .scq-opt[data-part="' + part + '"][data-id="' + id + '"]');
  if (!opt) return;
  opt.classList.remove('selected');
  opt.classList.add(cls);
}

function s17qShowPopup(type) {
  const popup = document.getElementById('s17q-popup');
  if (!popup) return;
  const cfg = S17Q_POPUP_CFG[type];
  popup.style.background = cfg.bg;
  resetPopupPosition(popup);
  const titleEl = document.getElementById('s17q-popup-title');
  if (titleEl) titleEl.innerHTML = cfg.title.map(t => '<p>' + t + '</p>').join('');
  const bodyEl = document.getElementById('s17q-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  popup.classList.remove('hidden');
}


function s17qFinish(resultState) {
  s17qAnswered = true;
  s17qDone = true;
  document.querySelectorAll('#s2 .scq-opt').forEach(o => { o.disabled = true; });
  const chk = document.getElementById('s17q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s17q-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s17q-hint-overlay')?.classList.add('hidden');
  practiceProgress.questions[1].state = resultState;
  syncPracticeProgressNav(document.getElementById('s2'));
}

function s17qOpenHint() {
  if (s17qAnswered) return;
  /* xAPI requested.1 — one hint for the whole two-part screen; reported against q1. */
  xapiRequestedHint('002', 'q1');
  document.getElementById('s17q-hint-overlay')?.classList.remove('hidden');
}
function s17qCloseHint() {
  document.getElementById('s17q-hint-overlay')?.classList.add('hidden');
}
function s17qCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 's17q-hint-overlay') s17qCloseHint();
}

function s17qResetInitial() {
  s17qSelectedParts = { a: null, b: null };
  s17qAttempts = 0;
  s17qAnswered = false;
  s17qLastWrong = null;
  document.querySelectorAll('#s2 .scq-opt').forEach(o => {
    o.classList.remove('selected', 'correct', 'wrong');
    o.disabled = false;
    o.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s17q-popup')?.classList.add('hidden');
  const chk = document.getElementById('s17q-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('s17q-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = 'hidden'; }
  practiceProgress.questions[1].state = 'current';
}

function s17qEnter() {
  practiceProgress.questions[1].visited = true;
  practiceProgress.questions[1].screen = 2;
  if (!s17qDone) s17qResetInitial();
  document.getElementById('s17q-hint-overlay')?.classList.add('hidden');
  syncPracticeProgressNav(document.getElementById('s2'));
}

let s17qPopupDragging = false;
let s17qPopupOffX = 0, s17qPopupOffY = 0;

function s17qPopupMouseDown(e) {
  s17qPopupDragging = true;
  const popup = document.getElementById('s17q-popup');
  const app   = document.getElementById('app');
  if (!popup || !app) return;
  const appLeft = parseFloat(app.style.left) || 0;
  const appTop  = parseFloat(app.style.top)  || 0;
  const scaleM  = app.style.transform.match(/scale\(([^)]+)\)/);
  const scale   = scaleM ? parseFloat(scaleM[1]) : 1;
  const canvasX = (e.clientX - appLeft) / scale;
  const canvasY = (e.clientY - appTop)  / scale;
  const topPx = parseFloat(popup.style.top);
  const top = isNaN(topPx) ? popup.offsetTop : topPx;
  popup.style.top    = top + 'px';
  popup.style.bottom = 'auto';
  s17qPopupOffX = canvasX - (parseFloat(popup.style.left) || 2);
  s17qPopupOffY = canvasY - top;
  e.preventDefault();
}


/* ═══════════════════════════════════════════════════════════
   S18 — SingleChoiceQuestion + content image, practice Q3/5
   (slide 25). S1 state machine, namespaced s18q*. Correct: מאיה.
   2 attempts, hint after the first wrong answer (series rule —
   the notes' "רמז מופיע מהתחלה" line contradicts their own last
   line and the series rule; the series rule wins).
   ═══════════════════════════════════════════════════════════ */
const S18Q = { correctId: 'maya', maxAttempts: 2 };
let s18qSelected = null;
let s18qAttempts = 0;
let s18qAnswered = false;
let s18qDone     = false;
let s18qLastWrong = null;  // option id marked wrong on a non-final attempt (gates re-check)

const S18Q_POPUP_CFG = {
  retry: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.'],
    body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
  },
  correct: {
    bg: '#edf8ed',
    title: ['إجابة صحيحة.'],
    body: ['نضع أعيننا على مستوى سطح السائل. النظر من الأعلى أو الأسفل قد يؤدي إلى خطأ في القراءة‎.']
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.', 'الإجابة الصحيحة معلَّمة.'],
    body: ['نضع أعيننا على مستوى سطح السائل. النظر من الأعلى أو الأسفل قد يؤدي إلى خطأ في القراءة‎.']
  }
};

function s18qSelect(id) {
  if (s18qAnswered) return;
  dismissRetryPopup('s18q-popup', s18qDone);
  s18qSelected = id;
  if (s18qAttempts > 0) {
    document.querySelectorAll('#s3 .scq-opt').forEach(o => o.classList.remove('wrong', 'correct'));
  }
  document.querySelectorAll('#s3 .scq-opt').forEach(o => {
    const sel = o.dataset.id === id;
    o.classList.toggle('selected', sel);
    o.setAttribute('aria-checked', sel ? 'true' : 'false');
  });
  const chk = document.getElementById('s18q-check');
  if (chk) chk.disabled = !s18qSelected || s18qSelected === s18qLastWrong;
}

function s18qCheck() {
  if (s18qAnswered) { advanceScreen(); return; }
  if (!s18qSelected) return;

  s18qAttempts++;
  const isCorrect = s18qSelected === S18Q.correctId;
  xapiAnswered('003', 'q1', isCorrect, isCorrect || s18qAttempts >= S18Q.maxAttempts,
    xapiAnswerText(document.querySelector('#s3 .scq-opt[data-id="' + s18qSelected + '"]')));

  if (isCorrect) {
    s18qMark(S18Q.correctId, 'correct');
    s18qShowPopup('correct');
    s18qFinish('correct');
  } else if (s18qAttempts >= S18Q.maxAttempts) {
    s18qMark(S18Q.correctId, 'correct');
    s18qMark(s18qSelected, 'wrong');
    s18qShowPopup('wrong2');
    s18qFinish('incorrect');
  } else {
    s18qMark(s18qSelected, 'wrong');
    /* Re-check stays disabled until the learner picks a DIFFERENT option */
    s18qLastWrong = s18qSelected;
    const chk = document.getElementById('s18q-check');
    if (chk) chk.disabled = true;
    s18qShowPopup('retry');
    const hint = document.getElementById('s18q-hint');
    if (hint) hint.style.visibility = 'visible';
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

function s18qMark(id, cls) {
  const opt = document.querySelector('#s3 .scq-opt[data-id="' + id + '"]');
  if (!opt) return;
  opt.classList.remove('selected');
  opt.classList.add(cls);
}

function s18qShowPopup(type) {
  const popup = document.getElementById('s18q-popup');
  if (!popup) return;
  const cfg = S18Q_POPUP_CFG[type];
  popup.style.background = cfg.bg;
  resetPopupPosition(popup);
  const titleEl = document.getElementById('s18q-popup-title');
  if (titleEl) titleEl.innerHTML = cfg.title.map(t => '<p>' + t + '</p>').join('');
  const bodyEl = document.getElementById('s18q-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  popup.classList.remove('hidden');
}


function s18qFinish(resultState) {
  s18qAnswered = true;
  s18qDone = true;
  document.querySelectorAll('#s3 .scq-opt').forEach(o => { o.disabled = true; });
  const chk = document.getElementById('s18q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s18q-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s18q-hint-overlay')?.classList.add('hidden');
  practiceProgress.questions[2].state = resultState;
  syncPracticeProgressNav(document.getElementById('s3'));
}

function s18qOpenHint() {
  if (s18qAnswered) return;
  /* xAPI requested.1 — after the guard, right before the reveal; this function only opens. */
  xapiRequestedHint('003', 'q1');
  document.getElementById('s18q-hint-overlay')?.classList.remove('hidden');
}
function s18qCloseHint() {
  document.getElementById('s18q-hint-overlay')?.classList.add('hidden');
}
function s18qCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 's18q-hint-overlay') s18qCloseHint();
}

function s18qResetInitial() {
  s18qSelected = null;
  s18qAttempts = 0;
  s18qAnswered = false;
  s18qLastWrong = null;
  document.querySelectorAll('#s3 .scq-opt').forEach(o => {
    o.classList.remove('selected', 'correct', 'wrong');
    o.disabled = false;
    o.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s18q-popup')?.classList.add('hidden');
  const chk = document.getElementById('s18q-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('s18q-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = 'hidden'; }
  practiceProgress.questions[2].state = 'current';
}

function s18qEnter() {
  practiceProgress.questions[2].visited = true;
  practiceProgress.questions[2].screen = 3;
  if (!s18qDone) s18qResetInitial();
  document.getElementById('s18q-hint-overlay')?.classList.add('hidden');
  syncPracticeProgressNav(document.getElementById('s3'));
}

let s18qPopupDragging = false;
let s18qPopupOffX = 0, s18qPopupOffY = 0;

function s18qPopupMouseDown(e) {
  s18qPopupDragging = true;
  const popup = document.getElementById('s18q-popup');
  const app   = document.getElementById('app');
  if (!popup || !app) return;
  const appLeft = parseFloat(app.style.left) || 0;
  const appTop  = parseFloat(app.style.top)  || 0;
  const scaleM  = app.style.transform.match(/scale\(([^)]+)\)/);
  const scale   = scaleM ? parseFloat(scaleM[1]) : 1;
  const canvasX = (e.clientX - appLeft) / scale;
  const canvasY = (e.clientY - appTop)  / scale;
  const topPx = parseFloat(popup.style.top);
  const top = isNaN(topPx) ? popup.offsetTop : topPx;
  popup.style.top    = top + 'px';
  popup.style.bottom = 'auto';
  s18qPopupOffX = canvasX - (parseFloat(popup.style.left) || 2);
  s18qPopupOffY = canvasY - top;
  e.preventDefault();
}


/* ═══════════════════════════════════════════════════════════
   S19 — SingleChoiceQuestion image-cards variant, practice Q4/5
   (slide 26). S5 state machine, namespaced s19q*. TWO options
   only → ONE attempt (no retry; the first answer's feedback is the
   final correct/wrong verdict) and hint available from the start
   (producer note). Correct: פיפטה.
   ═══════════════════════════════════════════════════════════ */
const S19Q = { correctId: 'pipette', maxAttempts: 1 };
let s19qSelected = null;
let s19qAttempts = 0;
let s19qAnswered = false;
let s19qDone     = false;

const S19Q_POPUP_CFG = {
  correct: {
    bg: '#edf8ed',
    title: ['الإجابة صحيحة‎.'],
    body: ['يتمّ تحديد القدرة على قياس السوائل بدقّة وفق مبنى الأداة ومستوى دقّة علامات التدريج فيها.']
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.', 'الإجابة الصحيحة معلَّمة.'],
    body: ['يتمّ تحديد القدرة على قياس السوائل بدقّة وفق مبنى الأداة ومستوى دقّة علامات التدريج فيها.']
  }
};

function s19qSelect(id) {
  if (s19qAnswered) return;
  dismissRetryPopup('s19q-popup', s19qDone);
  s19qSelected = id;
  document.querySelectorAll('#s4 .s5q-card').forEach(c => {
    const sel = c.dataset.id === id;
    c.classList.toggle('selected', sel);
    c.setAttribute('aria-checked', sel ? 'true' : 'false');
  });
  const chk = document.getElementById('s19q-check');
  if (chk) chk.disabled = !s19qSelected;
}

function s19qCheck() {
  if (s19qAnswered) { advanceScreen(); return; }
  if (!s19qSelected) return;

  // Single attempt: the first answer is final — its feedback is the
  // correct/wrong verdict (no retry round).
  s19qAttempts++;
  const isCorrect = s19qSelected === S19Q.correctId;
  xapiAnswered('004', 'q1', isCorrect, true,   // single attempt: the first answer is final
    xapiAnswerText(document.querySelector('#s4 .s5q-card[data-id="' + s19qSelected + '"]')));

  if (isCorrect) {
    s19qMark(S19Q.correctId, 'correct');
    s19qShowPopup('correct');
    s19qFinish('correct');
  } else {
    s19qMark(S19Q.correctId, 'correct');
    s19qMark(s19qSelected, 'wrong');
    s19qShowPopup('wrong2');
    s19qFinish('incorrect');
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

function s19qMark(id, cls) {
  const card = document.querySelector('#s4 .s5q-card[data-id="' + id + '"]');
  if (!card) return;
  card.classList.remove('selected');
  card.classList.add(cls);
}

function s19qShowPopup(type) {
  const popup = document.getElementById('s19q-popup');
  if (!popup) return;
  const cfg = S19Q_POPUP_CFG[type];
  popup.style.background = cfg.bg;
  resetPopupPosition(popup);
  const titleEl = document.getElementById('s19q-popup-title');
  if (titleEl) titleEl.innerHTML = cfg.title.map(t => '<p>' + t + '</p>').join('');
  const bodyEl = document.getElementById('s19q-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  popup.classList.remove('hidden');
}


function s19qFinish(resultState) {
  s19qAnswered = true;
  s19qDone = true;
  document.querySelectorAll('#s4 .s5q-card').forEach(c => { c.disabled = true; });
  const chk = document.getElementById('s19q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s19q-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s19q-hint-overlay')?.classList.add('hidden');
  practiceProgress.questions[3].state = resultState;
  syncPracticeProgressNav(document.getElementById('s4'));
}

function s19qOpenHint() {
  if (s19qAnswered) return;
  /* xAPI requested.1 — after the guard, right before the reveal; this function only opens. */
  xapiRequestedHint('004', 'q1');
  document.getElementById('s19q-hint-overlay')?.classList.remove('hidden');
}
function s19qCloseHint() {
  document.getElementById('s19q-hint-overlay')?.classList.add('hidden');
}
function s19qCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 's19q-hint-overlay') s19qCloseHint();
}

function s19qResetInitial() {
  s19qSelected = null;
  s19qAttempts = 0;
  s19qAnswered = false;
  document.querySelectorAll('#s4 .s5q-card').forEach(c => {
    c.classList.remove('selected', 'correct', 'wrong');
    c.disabled = false;
    c.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s19q-popup')?.classList.add('hidden');
  const chk = document.getElementById('s19q-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('s19q-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = 'visible'; }
  practiceProgress.questions[3].state = 'current';
}

function s19qEnter() {
  practiceProgress.questions[3].visited = true;
  practiceProgress.questions[3].screen = 4;
  if (!s19qDone) s19qResetInitial();
  document.getElementById('s19q-hint-overlay')?.classList.add('hidden');
  syncPracticeProgressNav(document.getElementById('s4'));
}

let s19qPopupDragging = false;
let s19qPopupOffX = 0, s19qPopupOffY = 0;

function s19qPopupMouseDown(e) {
  s19qPopupDragging = true;
  const popup = document.getElementById('s19q-popup');
  const app   = document.getElementById('app');
  if (!popup || !app) return;
  const appLeft = parseFloat(app.style.left) || 0;
  const appTop  = parseFloat(app.style.top)  || 0;
  const scaleM  = app.style.transform.match(/scale\(([^)]+)\)/);
  const scale   = scaleM ? parseFloat(scaleM[1]) : 1;
  const canvasX = (e.clientX - appLeft) / scale;
  const canvasY = (e.clientY - appTop)  / scale;
  const topPx = parseFloat(popup.style.top);
  const top = isNaN(topPx) ? popup.offsetTop : topPx;
  popup.style.top    = top + 'px';
  popup.style.bottom = 'auto';
  s19qPopupOffX = canvasX - (parseFloat(popup.style.left) || 2);
  s19qPopupOffY = canvasY - top;
  e.preventDefault();
}


/* ═══════════════════════════════════════════════════════════
   S20 — SingleChoiceQuestion + content image, practice Q5/5
   (slide 27). S1 state machine, namespaced s20q*. Correct: מזרק
   5 מ״ל. 2 attempts, hint after the first wrong answer.
   ═══════════════════════════════════════════════════════════ */
const S20Q = { correctId: 'syringe', maxAttempts: 2 };
let s20qSelected = null;
let s20qAttempts = 0;
let s20qAnswered = false;
let s20qDone     = false;
let s20qLastWrong = null;  // option id marked wrong on a non-final attempt (gates re-check)

const S20Q_POPUP_CFG = {
  retry: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.'],
    body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
  },
  correct: {
    bg: '#edf8ed',
    title: ['الإجابة صحيحة‎.'],
    body: ['محقنة بسِعة 5 ملل هي الأداة الدقيقة لهذه الكمية، وهي مريحة لإدخال الدواء مباشرةً إلى فم الكلب. المخبار بسِعة لتر والكأس غير دقيقين لهذه الكمية. الماصّة دقيقة لكنها غير مريحة للاستخدام مع الحيوانات‎.',
           '<strong>من المهم ملاءمة الأداة أيضًا للغرض من استخدامها – وفي هذه الحالة لاستخدامها مع الحيوانات‎.</strong>']
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.', 'الإجابة الصحيحة معلَّمة.'],
    body: ['محقنة بسِعة 5 ملل هي الأداة الدقيقة لهذه الكمية، وهي مريحة لإدخال الدواء مباشرةً إلى فم الكلب. المخبار بسِعة لتر والكأس غير دقيقين لهذه الكمية. الماصّة دقيقة لكنها غير مريحة للاستخدام مع الحيوانات‎.',
           '<strong>من المهم ملاءمة الأداة أيضًا للغرض من استخدامها – وفي هذه الحالة لاستخدامها مع الحيوانات‎.</strong>']
  }
};

function s20qSelect(id) {
  if (s20qAnswered) return;
  dismissRetryPopup('s20q-popup', s20qDone);
  s20qSelected = id;
  if (s20qAttempts > 0) {
    document.querySelectorAll('#s5 .scq-opt').forEach(o => o.classList.remove('wrong', 'correct'));
  }
  document.querySelectorAll('#s5 .scq-opt').forEach(o => {
    const sel = o.dataset.id === id;
    o.classList.toggle('selected', sel);
    o.setAttribute('aria-checked', sel ? 'true' : 'false');
  });
  const chk = document.getElementById('s20q-check');
  if (chk) chk.disabled = !s20qSelected || s20qSelected === s20qLastWrong;
}

function s20qCheck() {
  if (s20qAnswered) { advanceScreen(); return; }
  if (!s20qSelected) return;

  s20qAttempts++;
  const isCorrect = s20qSelected === S20Q.correctId;
  xapiAnswered('005', 'q1', isCorrect, isCorrect || s20qAttempts >= S20Q.maxAttempts,
    xapiAnswerText(document.querySelector('#s5 .scq-opt[data-id="' + s20qSelected + '"]')));

  if (isCorrect) {
    s20qMark(S20Q.correctId, 'correct');
    s20qShowPopup('correct');
    s20qFinish('correct');
  } else if (s20qAttempts >= S20Q.maxAttempts) {
    s20qMark(S20Q.correctId, 'correct');
    s20qMark(s20qSelected, 'wrong');
    s20qShowPopup('wrong2');
    s20qFinish('incorrect');
  } else {
    s20qMark(s20qSelected, 'wrong');
    /* Re-check stays disabled until the learner picks a DIFFERENT option */
    s20qLastWrong = s20qSelected;
    const chk = document.getElementById('s20q-check');
    if (chk) chk.disabled = true;
    s20qShowPopup('retry');
    const hint = document.getElementById('s20q-hint');
    if (hint) hint.style.visibility = 'visible';
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

function s20qMark(id, cls) {
  const opt = document.querySelector('#s5 .scq-opt[data-id="' + id + '"]');
  if (!opt) return;
  opt.classList.remove('selected');
  opt.classList.add(cls);
}

function s20qShowPopup(type) {
  const popup = document.getElementById('s20q-popup');
  if (!popup) return;
  const cfg = S20Q_POPUP_CFG[type];
  popup.style.background = cfg.bg;
  resetPopupPosition(popup);
  const titleEl = document.getElementById('s20q-popup-title');
  if (titleEl) titleEl.innerHTML = cfg.title.map(t => '<p>' + t + '</p>').join('');
  const bodyEl = document.getElementById('s20q-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  popup.classList.remove('hidden');
}


function s20qFinish(resultState) {
  s20qAnswered = true;
  s20qDone = true;
  document.querySelectorAll('#s5 .scq-opt').forEach(o => { o.disabled = true; });
  const chk = document.getElementById('s20q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s20q-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s20q-hint-overlay')?.classList.add('hidden');
  practiceProgress.questions[4].state = resultState;
  syncPracticeProgressNav(document.getElementById('s5'));
}

function s20qOpenHint() {
  if (s20qAnswered) return;
  /* xAPI requested.1 — after the guard, right before the reveal; this function only opens. */
  xapiRequestedHint('005', 'q1');
  document.getElementById('s20q-hint-overlay')?.classList.remove('hidden');
}
function s20qCloseHint() {
  document.getElementById('s20q-hint-overlay')?.classList.add('hidden');
}
function s20qCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 's20q-hint-overlay') s20qCloseHint();
}

function s20qResetInitial() {
  s20qSelected = null;
  s20qAttempts = 0;
  s20qAnswered = false;
  s20qLastWrong = null;
  document.querySelectorAll('#s5 .scq-opt').forEach(o => {
    o.classList.remove('selected', 'correct', 'wrong');
    o.disabled = false;
    o.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s20q-popup')?.classList.add('hidden');
  const chk = document.getElementById('s20q-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('s20q-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = 'hidden'; }
  practiceProgress.questions[4].state = 'current';
}

function s20qEnter() {
  practiceProgress.questions[4].visited = true;
  practiceProgress.questions[4].screen = 5;
  if (!s20qDone) s20qResetInitial();
  document.getElementById('s20q-hint-overlay')?.classList.add('hidden');
  syncPracticeProgressNav(document.getElementById('s5'));
}

let s20qPopupDragging = false;
let s20qPopupOffX = 0, s20qPopupOffY = 0;

function s20qPopupMouseDown(e) {
  s20qPopupDragging = true;
  const popup = document.getElementById('s20q-popup');
  const app   = document.getElementById('app');
  if (!popup || !app) return;
  const appLeft = parseFloat(app.style.left) || 0;
  const appTop  = parseFloat(app.style.top)  || 0;
  const scaleM  = app.style.transform.match(/scale\(([^)]+)\)/);
  const scale   = scaleM ? parseFloat(scaleM[1]) : 1;
  const canvasX = (e.clientX - appLeft) / scale;
  const canvasY = (e.clientY - appTop)  / scale;
  const topPx = parseFloat(popup.style.top);
  const top = isNaN(topPx) ? popup.offsetTop : topPx;
  popup.style.top    = top + 'px';
  popup.style.bottom = 'auto';
  s20qPopupOffX = canvasX - (parseFloat(popup.style.left) || 2);
  s20qPopupOffY = canvasY - top;
  e.preventDefault();
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
s15trEnter();
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
/* .popup-action is created at runtime, after initNavLabels() has already run,
   so renderPopupAction() re-invokes initNavLabels() on the new button's row to
   attach the observer. Listing the class here is what makes that call match.
   Ported verbatim from part 06's Foundation. */
var NAV_LABEL_SELECTOR = '.btn-continue, .scq-back, .scq-hint, .scq-check, .s13-continue, .popup-action';
var navLabelBusy = false;

/* ═══════════════════ xAPI (720) — this part's config ═══════════════════
   Data only; the shared layer in ../unit-js/ reads it at call time (guide §6.1).
   ⚠️ SCREEN_TO_SUBCONTENT must hold exactly TOTAL_SCREENS keys (6), 0..5. */
var SCREEN_TO_SUBCONTENT = {
  0: null,          // transition ("5 questions, 4 to pass")
  1: ['001', 1],    // ImageHotspot — meniscus reading point
  2: ['002', 1],    // dual-part SingleChoice — average (q1) + reliability (q2)
  3: ['003', 1],    // SingleChoice — Uri and Maya
  4: ['004', 1],    // image cards, one attempt — 10 ml tool
  5: ['005', 1]     // SingleChoice — dog medicine dose
};

var XAPI_COMP_SLUG     = 'methodica-science-volume-liquid-01-02';
var XAPI_COMP_ID       = XAPI_ID_PREFIX + XAPI_COMP_SLUG + '/';
var XAPI_EVAL_ITEMS    = { '001': 1, '002': 1, '003': 1, '004': 1, '005': 1 };
var XAPI_METADATA_FILE = '../metadata/methodica-science-volume-liquid-01-02.json';
var XAPI_END_BTN       = 's20q-check';   // S5 "שנמשיך?" — the part's last click (D-8)

/* ═══════════════════ Resume (720) — the four per-part hooks ═══════════════════
   Guide §8.7. Committed state only: an unanswered question is reset by its enter function on
   every entry, so a pending pick was never kept across a screen change and is not kept across a
   reload. Answered screens are painted back by restoreScreenUI on every goTo. */
function _rsQ(a, ans, d, sel) { return { a: a, ans: ans, d: d, sel: sel }; }
function capturePartPayload() {
  return {
    currentScreen: currentScreen,
    xq: rsCaptureXq(),
    pp: rsCaptureQuestions(practiceProgress),
    s16q: _rsQ(s16qAttempts, s16qAnswered, s16qDone, s16qSelected),
    s17q: _rsQ(s17qAttempts, s17qAnswered, s17qDone, { a: s17qSelectedParts.a, b: s17qSelectedParts.b }),
    s18q: _rsQ(s18qAttempts, s18qAnswered, s18qDone, s18qSelected),
    s19q: _rsQ(s19qAttempts, s19qAnswered, s19qDone, s19qSelected),
    s20q: _rsQ(s20qAttempts, s20qAnswered, s20qDone, s20qSelected)
  };
}
function applyResumeVars(st) {
  if (!st) return;
  rsRestoreXq(st.xq);
  rsRestoreQuestions(practiceProgress, st.pp);
  const q = k => (st[k] && st[k].d) ? st[k] : null;
  let s;
  if ((s = q('s16q'))) { s16qAttempts = s.a; s16qAnswered = s.ans; s16qDone = true; s16qSelected = s.sel; }
  if ((s = q('s17q'))) { s17qAttempts = s.a; s17qAnswered = s.ans; s17qDone = true; s17qSelectedParts = { a: s.sel.a, b: s.sel.b }; }
  if ((s = q('s18q'))) { s18qAttempts = s.a; s18qAnswered = s.ans; s18qDone = true; s18qSelected = s.sel; }
  if ((s = q('s19q'))) { s19qAttempts = s.a; s19qAnswered = s.ans; s19qDone = true; s19qSelected = s.sel; }
  if ((s = q('s20q'))) { s20qAttempts = s.a; s20qAnswered = s.ans; s20qDone = true; s20qSelected = s.sel; }
}
function applyResumeDom(st) {}   // nothing on these screens lives only in the DOM
/* S2's two-part question, repainted as its final check left it: each part's correct option
   marked, a wrong final pick in either part marked wrong, then the popup and the finished look. */
function _rsPaintS17() {
  if (!s17qDone) return;
  const aRight = s17qSelectedParts.a === S17Q.correct.a, bRight = s17qSelectedParts.b === S17Q.correct.b;
  document.querySelectorAll('#s2 .scq-opt').forEach(o => {
    o.classList.remove('selected', 'correct', 'wrong');
    o.setAttribute('aria-checked', s17qSelectedParts[o.dataset.part] === o.dataset.id ? 'true' : 'false');
  });
  s17qMark('a', S17Q.correct.a, 'correct');
  s17qMark('b', S17Q.correct.b, 'correct');
  if (!aRight) s17qMark('a', s17qSelectedParts.a, 'wrong');
  if (!bRight) s17qMark('b', s17qSelectedParts.b, 'wrong');
  s17qShowPopup(aRight && bRight ? 'correct' : 'wrong2');
  s17qFinish(aRight && bRight ? 'correct' : 'incorrect');
}
/* Must never throw (rule 7): guarded, and an unanswered screen is left to its enter function. */
function restoreScreenUI(n) {
  try {
    if (n === 1) rsPaintChoice({ done: s16qDone, selected: s16qSelected, correctId: S16Q.correctId, optSel: '#s1 .s16q-hotspot',
      mark: s16qMark, showPopup: s16qShowPopup, finish: s16qFinish });
    if (n === 2) _rsPaintS17();
    if (n === 3) rsPaintChoice({ done: s18qDone, selected: s18qSelected, correctId: S18Q.correctId, optSel: '#s3 .scq-opt',
      mark: s18qMark, showPopup: s18qShowPopup, finish: s18qFinish });
    if (n === 4) rsPaintChoice({ done: s19qDone, selected: s19qSelected, correctId: S19Q.correctId, optSel: '#s4 .s5q-card',
      mark: s19qMark, showPopup: s19qShowPopup, finish: s19qFinish });
    if (n === 5) rsPaintChoice({ done: s20qDone, selected: s20qSelected, correctId: S20Q.correctId, optSel: '#s5 .scq-opt',
      mark: s20qMark, showPopup: s20qShowPopup, finish: s20qFinish });
    if (n >= 1 && n <= 5) syncPracticeProgressNav(document.getElementById('s' + n));
  } catch (e) { console.error('[resume] restoreScreenUI ' + n, e); }
}