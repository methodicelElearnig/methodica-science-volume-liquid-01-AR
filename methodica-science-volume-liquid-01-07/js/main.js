'use strict';

/* ═══════════════════════════════════════════════════════════
   methodica-science-volume-liquid-01-07 — main.js
   Part 07 of the liquid-volume lomda.
     S0  TransitionScreen (slide 41, last slide of the deck). Intro to
         THIS part's own peak question (שאלת השיא — 4 sections, 3+
         needed to pass), built as S1-S5 below.
     S1  TextScreen (Figma 2525:1344) — bottling-QC scenario setup:
         a reference photo + 3-item numbered list. No question
         mechanics; Continue is enabled from the start.
     S2  DropdownQuestion (Figma 2525:1423 / 2525:1602) — section א׳.
         Single standalone dropdown embedded in a fill-the-blank
         sentence. "אפשר להיזכר בפרטי המשימה?" opens the shared
         task-details popup (reopens S1's exact content), always
         visible from the start.
     S3  ValueInputQuestion (Figma 2526:1287) — section ב׳. Single
         numeric input embedded in a fill-the-blank sentence, plus a
         2-item numbered recap. Same task-details recall popup as S2.
     S4  SingleChoiceQuestion (Figma 2526:1497) — section ג׳. Standard
         text-pill answers (4 options), no content image. Same
         task-details recall popup.
     S5  SingleChoiceQuestion (Figma 2526:1579) — section ד׳. Same
         shape as S4.
   Character choice is carried over from earlier parts via
   localStorage.
   ═══════════════════════════════════════════════════════════ */

/* ─── Constants ─────────────────────────────────────────── */
const TOTAL_SCREENS = 6;  // S0-S5 — bump as more screens from the deck are implemented

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
   '#last' deep link, which cold-starts that screen.
   This part is terminal, so it only ever pops — it never pushes. ───── */
const LOMDA_ID      = 'methodica-science-volume-liquid-01';
const NAV_STACK_KEY = LOMDA_ID + '_navStack';
const S0_BACK_ID    = 's0-back';

/* No onward navigation: this is the final part authored in the production
   deck (its S0 covers the deck's last slide), so there is no successor
   part to link to. */

/* S0 companion character video — asset map keyed by the producer-defined
   character IDs from part 01's selection screen (never hardcode a
   character asset). Producer notes: character-1 (purple) → Climbing
   video 1; character-2 (pink) → Climbing video 2. */
const S0_CHARACTER_VIDEOS = {
  'character-1': 'assets/video/Character-1-Climbing.mp4',
  'character-2': 'assets/video/Character-2-Climbing.mp4'
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
const SCREEN_POPUP_ID = { 2: 's2q-popup', 3: 's3v-popup', 4: 's4q-popup', 5: 's5q-popup' };
/* Screen number → whether that screen's question has actually been resolved
   (correct, or final wrong) — same "is this question done" check each screen's
   own resetScreenState() branch already uses to decide fresh-reset vs. resume.
   The popup-reopen below must only fire when this is true: reopening a
   "try again" popup over a board that a *not-done* screen's own reset just
   wiped back to blank would show stale feedback for an empty board. */
const SCREEN_DONE = { 2: () => s2qDone, 3: () => s3vDone, 4: () => s4qDone, 5: () => s5qDone };
function goTo(n) {
  if (n < 0 || n >= TOTAL_SCREENS) return;
  // Every feedback popup / hint overlay belongs to the screen it was opened on.
  // Hide them ALL on any navigation so none carries over to the next screen.
  document.querySelectorAll('[id$="-popup"], [id$="-hint-overlay"]')
    .forEach(el => el.classList.add('hidden'));
  // The task-details popup is a single shared overlay (not per-screen
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
  if (n === 3) s3vEnter();
  if (n === 4) s4qEnter();
  if (n === 5) s5qEnter();
}

function goBack() {
  if (currentScreen === 0) { goToPrevPart(); return; }
  goTo(currentScreen - 1);
}

function advanceScreen() {
  if (currentScreen === 2 && !s2qAnswered) return;
  if (currentScreen === 3 && !s3vAnswered) return;
  if (currentScreen === 4 && !s4qAnswered) return;
  if (currentScreen === 5 && !s5qAnswered) return;
  /* S5 is the unit's last screen; its "שנמשיך?" is the last click. Report the component and
     stop (guide §6.5) — success = at least 3 of the 4 sections, as S0 promises; score = sections
     correct / 4, read back from XAPI_Q_RESULTS (one entry per section, 001/q1..q4), so the
     component score cannot disagree with what 'answered' reported. */
  if (currentScreen === 5) {
    try {
      xapiEndComponent(partResult(), document.getElementById('s5q-check'));
    } catch (e) {}
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
    s3vCloseHint();
    s4qCloseHint();
    s5qCloseHint();
    closeRecallPopup();
  }
});

/* ═══════════════════════════════════════════════════════════
   GLOBAL — Task-details popup, shared by every section's "אפשר
   להיזכר בפרטי המשימה?" button (S2 onward). Always available from
   the start (producer instruction) — never gated. One overlay
   instance reused across the whole task, reopening S1's exact
   content regardless of which section opened it.
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
  /* The action button is a control, not a drag handle. Without this guard its
     pointerdown would start a drag AND flip the popup from bottom- to
     top-anchoring, so the very first click on it would change how the popup
     grows when its content is swapped. */
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
   S2 — DropdownQuestion (section א׳). Single standalone dropdown (4
   options) embedded in a fill-the-blank sentence. Hint hidden until
   the first wrong attempt. 2 attempts. Correct: 751.25.
   ═══════════════════════════════════════════════════════════ */
const S2Q = { correctValue: '751.25', maxAttempts: 2 };
let s2qSelected = null;
let s2qAttempts = 0;
let s2qAnswered = false;
let s2qDone     = false;
let s2qLastWrong = null;  // option marked wrong on a non-final attempt (gates re-check)

/* ── Final-attempt solution/answer toggle (see S3 for the full contract) ──
   s2qAnswer  the learner's final selected option string, captured before the
              reveal overwrites the dropdown display. null => not toggleable.
   s2qView    'solution' | 'answer'. Runtime only -- reset in s2qEnter().    */
let s2qAnswer = null;
let s2qView   = 'solution';

const S2Q_POPUP_CFG = {
  retry: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.'],
    body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
  },
  correct: {
    bg: '#edf8ed',
    title: ['الإجابة صحيحة‎.'],
    body: ['الحساب عبارة عن جمع كل القياسات وقسمة المجموع على عددها‎:', '<span dir="ltr">6010 : 8 = 751.25</span>']
  },
  /* One outcome, two views -- see S3's wrong2 for the full pattern. 'מסומנת'
     -> 'מוצגת': the correct value replaces the learner's selection in the
     dropdown display, it is not marked alongside it. */
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.', 'الإجابة الصحيحة تَظهَر الآن.'],
    body: ['الحساب عبارة عن جمع كل القياسات وقسمة المجموع على عددها‎:', '<span dir="ltr">6010 : 8 = 751.25</span>'],
    action: { label: 'الانتقال إلى إجابتي', view: 'answer' },
    answerView: {
      title: ['الإجابة غير صحيحة.'],
      body:  ['يمكن مشاهدة الحل الصحيح مرة أخرى‎.'],
      action: { label: 'الإجابة الصحيحة', view: 'solution' }
    }
  }
};

function s2ddToggle() {
  const btn  = document.getElementById('s2dd-btn');
  const list = document.getElementById('s2dd-list');
  if (!btn || !list || btn.disabled) return;
  dismissRetryPopup('s2q-popup', s2qDone);
  const isOpen = !list.classList.contains('hidden');
  s2ddCloseList();
  if (!isOpen) {
    list.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
  }
}
function s2ddCloseList() {
  document.getElementById('s2dd-list')?.classList.add('hidden');
  document.getElementById('s2dd-btn')?.setAttribute('aria-expanded', 'false');
}
function s2ddOutsideClick(e) {
  if (currentScreen !== 2) return;
  if (!e.target.closest('.mdq-dropdown-wrap')) s2ddCloseList();
}
document.addEventListener('click', s2ddOutsideClick);
function s2ddSelect(value) {
  if (s2qAnswered) return;
  s2qSelected = value;
  const sel = document.getElementById('s2dd-selected');
  if (sel) sel.textContent = value;
  const btn = document.getElementById('s2dd-btn');
  if (btn) {
    btn.removeAttribute('data-empty');
    btn.classList.remove('mdq-wrong');
    btn.querySelector('.mdq-wrong-ico')?.remove();
  }
  s2ddCloseList();
  const chk = document.getElementById('s2q-check');
  if (chk && !s2qAnswered) chk.disabled = s2qSelected === null || s2qSelected === s2qLastWrong;
}

function s2qCheck() {
  if (s2qAnswered) { advanceScreen(); return; }
  if (s2qSelected === null) return;

  s2qAttempts++;
  const isCorrect = s2qSelected === S2Q.correctValue;
  xapiAnswered('001', 'q1', isCorrect, isCorrect || s2qAttempts >= S2Q.maxAttempts, String(s2qSelected));

  if (isCorrect) {
    s2qMark('correct');
    s2qShowPopup('correct');
    s2qFinish('correct');
  } else if (s2qAttempts >= S2Q.maxAttempts) {
    /* Capture the learner's final selection BEFORE the reveal overwrites the
       dropdown display -- this is the only place it still exists. */
    s2qAnswer = s2qSelected;
    s2qView   = 'solution';
    s2qApplyView();
    s2qFinish('incorrect');
  } else {
    const btn = document.getElementById('s2dd-btn');
    btn?.classList.add('mdq-wrong');
    /* Client QA 2026-09-24: icon sits to the RIGHT of the answer (append,
       not prepend) — this container is direction:ltr, so last child = right. */
    btn?.insertAdjacentHTML('beforeend', S2Q_WRONG_SVG);
    /* Re-check stays disabled until the learner picks a DIFFERENT option */
    s2qLastWrong = s2qSelected;
    const chk = document.getElementById('s2q-check');
    if (chk) chk.disabled = true;
    s2qShowPopup('retry');
    const hint = document.getElementById('s2q-hint');
    if (hint) hint.style.visibility = 'visible';
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

/* Exact Figma vectors (eSbp4bKHgBky0rakDb8l9N node 1027:26021), same
   assets as part-01 S10 / part-03 S3VD */
const S2Q_CHECK_SVG =
  '<svg class="mdq-check-ico" width="16" height="16" viewBox="0 0 14 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M4.52036 12C4.12296 12.0002 3.74183 11.8126 3.46106 11.4787L0.258452 7.67744C-0.0861507 7.26814 -0.0861507 6.60467 0.258452 6.19536C0.603165 5.78619 1.16194 5.78619 1.50666 6.19536L4.52036 9.77374L12.4933 0.306878C12.8381 -0.102293 13.3968 -0.102293 13.7415 0.306878C14.0862 0.716179 14.0862 1.37966 13.7415 1.78896L5.57966 11.4787C5.29889 11.8126 4.91776 12.0002 4.52036 12Z" fill="#609E12"/>' +
  '</svg>';
const S2Q_WRONG_SVG =
  '<svg class="mdq-wrong-ico" width="16" height="16" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M13.6743 0.325691C13.4657 0.117151 13.1828 0 12.8879 0C12.5929 0 12.31 0.117151 12.1014 0.325691L7 5.42709L1.8986 0.325691C1.69 0.117151 1.40711 0 1.11215 0C0.817183 0 0.534294 0.117151 0.325691 0.325691C0.117151 0.534294 0 0.817183 0 1.11215C0 1.40711 0.117151 1.69 0.325691 1.8986L5.42709 7L0.325691 12.1014C0.117151 12.31 0 12.5929 0 12.8879C0 13.1828 0.117151 13.4657 0.325691 13.6743C0.534294 13.8829 0.817183 14 1.11215 14C1.40711 14 1.69 13.8829 1.8986 13.6743L7 8.57291L12.1014 13.6743C12.31 13.8829 12.5929 14 12.8879 14C13.1828 14 13.4657 13.8829 13.6743 13.6743C13.8829 13.4657 14 13.1828 14 12.8879C14 12.5929 13.8829 12.31 13.6743 12.1014L8.57291 7L13.6743 1.8986C13.8829 1.69 14 1.40711 14 1.11215C14 0.817183 13.8829 0.534294 13.6743 0.325691Z" fill="#B20010"/>' +
  '</svg>';

/* Resolved-state rendering of the dropdown. 'correct' = answered right first
   try. 'solution' / 'answer' are the two toggle views. */
function s2qMark(state) {
  const btn = document.getElementById('s2dd-btn');
  const sel = document.getElementById('s2dd-selected');
  if (!btn) return;
  btn.disabled = true;
  btn.classList.remove('mdq-correct', 'mdq-wrong');
  btn.querySelector('.mdq-check-ico')?.remove();
  btn.querySelector('.mdq-wrong-ico')?.remove();
  const chevron = btn.querySelector('.mdq-chevron');
  if (state === 'answer') {
    /* The learner's own final selection, restored verbatim and marked wrong. */
    if (sel) sel.textContent = s2qAnswer;
    btn.removeAttribute('data-empty');
    btn.classList.add('mdq-wrong');
    /* Client QA: never show the chevron once the answer is final and
       locked (btn.disabled above) — this view can't be edited. */
    if (chevron) chevron.style.display = 'none';
    btn.insertAdjacentHTML('beforeend', S2Q_WRONG_SVG);
  } else {
    /* 'solution' overwrites the display with the correct value; 'correct'
       leaves the learner's already-correct selection in place. */
    if (state === 'solution') { if (sel) sel.textContent = S2Q.correctValue; }
    btn.removeAttribute('data-empty');
    btn.classList.add('mdq-correct');
    if (chevron) chevron.style.display = 'none';
    btn.insertAdjacentHTML('beforeend', S2Q_CHECK_SVG);
  }
}

/* Single owner of the resolved-wrong state -- see S3's s3vApplyView(). */
function s2qApplyView() {
  if (s2qAnswer === null) return;
  s2qMark(s2qView);
  s2qShowPopup('wrong2', s2qView);
}

/* Pure view switch -- see S3's s3vToggleView(). Never routes through
   s2qCheck(), never touches s2qAttempts or the done lock. */
function s2qToggleView() {
  if (s2qAnswer === null) return;
  s2qView = (s2qView === 'solution') ? 'answer' : 'solution';
  s2qApplyView();
}

function s2qShowPopup(type, view) {
  const popup = document.getElementById('s2q-popup');
  if (!popup) return;
  const base = S2Q_POPUP_CFG[type];
  const cfg  = (view === 'answer' && base.answerView)
             ? Object.assign({}, base, base.answerView)
             : base;
  popup.style.background = cfg.bg;
  /* Reset position only on a genuine open -- see S3's s3vShowPopup(). */
  if (popup.classList.contains('hidden')) resetPopupPosition(popup);
  const titleEl = document.getElementById('s2q-popup-title');
  if (titleEl) titleEl.innerHTML = cfg.title.map(t => '<p>' + t + '</p>').join('');
  const bodyEl = document.getElementById('s2q-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  renderPopupAction('s2q-popup', cfg.action, s2qToggleView);
  popup.classList.remove('hidden');
  clampPopup(popup);
}


function s2qFinish(resultState) {
  s2qAnswered = true;
  s2qDone = true;
  s2ddCloseList();
  const chk = document.getElementById('s2q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s2q-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s2q-hint-overlay')?.classList.add('hidden');
  const recall = document.getElementById('s2-recall');
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
  s2qAnswer = null;
  s2qView   = 'solution';
  s2qLastWrong = null;
  const btn = document.getElementById('s2dd-btn');
  const sel = document.getElementById('s2dd-selected');
  if (btn) {
    btn.disabled = false; btn.classList.remove('mdq-correct', 'mdq-wrong'); btn.setAttribute('data-empty', 'true');
    btn.querySelector('.mdq-check-ico')?.remove();
    btn.querySelector('.mdq-wrong-ico')?.remove();
  }
  if (sel) sel.textContent = 'اختاروا إجابة';
  s2ddCloseList();
  document.getElementById('s2q-popup')?.classList.add('hidden');
  const chk = document.getElementById('s2q-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('s2q-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = 'hidden'; }
  const recall = document.getElementById('s2-recall');
  if (recall) { recall.disabled = false; recall.style.visibility = 'visible'; }
}

function s2qEnter() {
  if (!s2qDone) {
    s2qResetInitial();
  } else {
    /* A resolved screen always comes back on the SOLUTION view -- see S3's
       s3vEnter() for the full rationale. goTo() reopens the popup after this
       returns; this call is what guarantees its content matches the question. */
    s2qView = 'solution';
    s2qApplyView();
  }
  document.getElementById('s2q-hint-overlay')?.classList.add('hidden');
  closeRecallPopup();
}

/* ═══════════════════════════════════════════════════════════
   S3 — ValueInputQuestion (section ב׳). Single numeric input
   embedded in a fill-the-blank sentence. Hint hidden until the
   first wrong attempt. 2 attempts. Correct: 8.
   ═══════════════════════════════════════════════════════════ */
const S3V = { correctValue: 8, maxAttempts: 2 };
let s3vValue    = null;
let s3vAttempts = 0;
let s3vAnswered = false;
let s3vDone     = false;
/* Raw trimmed input as of the last non-final wrong attempt — gates the check
   button disabled until the learner actually edits the value. */
let s3vLastWrongValue = null;

/* ── Final-attempt solution/answer toggle ──────────────────
   s3vAnswer  the learner's final submitted input, captured VERBATIM as the
              raw string (not the parsed number, so "8.0" / "08" / " 8" come
              back exactly as typed) immediately before the reveal overwrites
              the field. null => nothing to toggle: unanswered, or correct.
              Doubles as the "is this question toggleable?" predicate.
   s3vView    which of the two views is on screen. Runtime state only --
              s3vEnter() resets it, so returning to a resolved screen always
              lands on the solution view. Deliberately never persisted; the
              learner's ANSWER is what must survive, and it does.            */
let s3vAnswer = null;
let s3vView   = 'solution';   // 'solution' | 'answer'

const S3V_POPUP_CFG = {
  retry: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.'],
    body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
  },
  correct: {
    bg: '#edf8ed',
    title: ['الإجابة صحيحة‎.'],
    body: ['جميع القناني الـ 8 تقع ضمن المجال بين 735 و-765‏‎.']
  },
  /* One outcome, two views. The base is the SOLUTION view (Figma variant
     2464:28288, MyAnswerBtn=True) and carries this screen's own explanation;
     answerView shallow-merges over it for the ANSWER view (Figma variant
     2464:28331, MyAnswerBtn=False), whose copy is fixed and canonical.
     'מסומנת' -> 'מוצגת': the correct value is not marked alongside the
     learner's, it replaces it in the field. */
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.', 'الإجابة الصحيحة تَظهَر الآن.'],
    body: ['جميع القناني الـ 8 تقع ضمن المجال بين 735 و-765‏‎.'],
    action: { label: 'الانتقال إلى إجابتي', view: 'answer' },
    answerView: {
      title: ['الإجابة غير صحيحة.'],
      body:  ['يمكن مشاهدة الحل الصحيح مرة أخرى‎.'],
      action: { label: 'الإجابة الصحيحة', view: 'solution' }
    }
  }
};

function s3vInputChange() {
  if (s3vAnswered) return;
  dismissRetryPopup('s3v-popup', s3vDone);
  const el = document.getElementById('s3v-input');
  const raw = el.value.trim();
  s3vValue = raw === '' ? null : Number(raw);
  if (s3vAttempts > 0) el.classList.remove('error');
  /* Retry gate: re-enable only once the entered value genuinely DIFFERS
     from the one just marked wrong — a live comparison, not a one-shot flag. */
  const chk = document.getElementById('s3v-check');
  if (chk) chk.disabled = (raw === '') || (raw === s3vLastWrongValue);
}

/* Clicking into the input is the start of a correction — dismiss the retry
   popup on focus too (typing while already focused is covered by
   s3vInputChange). Same click both dismisses and focuses the field. */
document.getElementById('s3v-input')?.addEventListener('focus', () => {
  if (!s3vAnswered) dismissRetryPopup('s3v-popup', s3vDone);
});

function s3vCheck() {
  if (s3vAnswered) { advanceScreen(); return; }
  if (s3vValue === null) return;

  s3vAttempts++;
  const isCorrect = Number.isInteger(s3vValue) && s3vValue === S3V.correctValue;
  xapiAnswered('001', 'q2', isCorrect, isCorrect || s3vAttempts >= S3V.maxAttempts,
    document.getElementById('s3v-input')?.value.trim() ?? '');

  if (isCorrect) {
    s3vMark('correct');
    s3vShowPopup('correct');
    s3vFinish('correct');
  } else if (s3vAttempts >= S3V.maxAttempts) {
    /* Capture the learner's answer BEFORE the reveal overwrites the input --
       this is the only place it still exists. Then resolve straight into the
       solution view: the question is complete at this moment, so the primary
       button takes its completion label at once and is never relabelled. */
    s3vAnswer = document.getElementById('s3v-input')?.value ?? '';
    s3vView   = 'solution';
    s3vApplyView();
    s3vFinish('incorrect');
  } else {
    const inp = document.getElementById('s3v-input');
    inp?.classList.add('error');
    /* Re-check stays disabled until the learner actually edits the value */
    s3vLastWrongValue = inp?.value.trim() ?? null;
    const chk = document.getElementById('s3v-check');
    if (chk) chk.disabled = true;
    s3vShowPopup('retry');
    const hint = document.getElementById('s3v-hint');
    if (hint) hint.style.visibility = 'visible';
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

/* Resolved-state rendering of the input. 'correct' = answered right first try.
   'solution' / 'answer' are the two toggle views. */
function s3vMark(state) {
  const el = document.getElementById('s3v-input');
  if (!el) return;
  el.disabled = true;
  if (state === 'answer') {
    /* The learner's own final answer, restored verbatim and marked wrong. */
    el.value = s3vAnswer;
    el.classList.remove('locked');
    el.classList.add('error');
  } else {
    /* 'solution' overwrites the field with the correct value; 'correct' leaves
       the learner's already-correct value in place. Both read as resolved. */
    if (state === 'solution') el.value = S3V.correctValue;
    el.classList.remove('error');
    el.classList.add('locked');
  }
}

/* The single owner of the resolved-wrong state: puts the QUESTION and the
   POPUP into the same view, so the two can never disagree. Idempotent -- safe
   to call on toggle and on screen re-entry alike. Never re-runs validation. */
function s3vApplyView() {
  if (s3vAnswer === null) return;   // not a toggleable outcome
  s3vMark(s3vView);
  s3vShowPopup('wrong2', s3vView);
}

/* The popup's action button. A pure view switch: it never routes through
   s3vCheck(), never touches s3vAttempts or the done lock, and emits no
   reporting. It is not a dismiss control -- the popup stays open throughout. */
function s3vToggleView() {
  if (s3vAnswer === null) return;
  s3vView = (s3vView === 'solution') ? 'answer' : 'solution';
  s3vApplyView();
}

function s3vShowPopup(type, view) {
  const popup = document.getElementById('s3v-popup');
  if (!popup) return;
  const base = S3V_POPUP_CFG[type];
  const cfg  = (view === 'answer' && base.answerView)
             ? Object.assign({}, base, base.answerView)
             : base;
  popup.style.background = cfg.bg;
  /* Reset position only on a genuine OPEN. A view swap is not an open -- the
     popup never closed -- so it stays wherever the learner dragged it rather
     than jumping out from under the cursor that just clicked the button. */
  if (popup.classList.contains('hidden')) resetPopupPosition(popup);
  const titleEl = document.getElementById('s3v-popup-title');
  if (titleEl) titleEl.innerHTML = cfg.title.map(t => '<p>' + t + '</p>').join('');
  const bodyEl = document.getElementById('s3v-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  /* cfg.action is undefined for retry/correct, which removes the button. */
  renderPopupAction('s3v-popup', cfg.action, s3vToggleView);
  popup.classList.remove('hidden');
  /* The two views differ in height. If the popup was dragged it is
     top-anchored, so the taller one would otherwise grow into the bottom bar.
     No-op for an undragged popup, which is bottom-anchored and grows upward. */
  clampPopup(popup);
}


function s3vFinish(resultState) {
  s3vAnswered = true;
  s3vDone = true;
  const chk = document.getElementById('s3v-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s3v-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s3v-hint-overlay')?.classList.add('hidden');
  const recall = document.getElementById('s3-recall');
  if (recall) recall.style.visibility = 'hidden';
  closeRecallPopup();
}

function s3vOpenHint() {
  if (s3vAnswered) return;
  /* xAPI requested.1 — after the guard, right before the reveal; this function only opens. */
  xapiRequestedHint('001', 'q2');
  document.getElementById('s3v-hint-overlay')?.classList.remove('hidden');
}
function s3vCloseHint() {
  document.getElementById('s3v-hint-overlay')?.classList.add('hidden');
}
function s3vCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 's3v-hint-overlay') s3vCloseHint();
}

function s3vResetInitial() {
  s3vValue = null;
  s3vAttempts = 0;
  s3vAnswered = false;
  s3vAnswer = null;
  s3vView   = 'solution';
  s3vLastWrongValue = null;
  const input = document.getElementById('s3v-input');
  if (input) { input.value = ''; input.disabled = false; input.classList.remove('error', 'locked'); }
  document.getElementById('s3v-popup')?.classList.add('hidden');
  const chk = document.getElementById('s3v-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('s3v-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = 'hidden'; }
  const recall = document.getElementById('s3-recall');
  if (recall) { recall.disabled = false; recall.style.visibility = 'visible'; }
}

function s3vEnter() {
  if (!s3vDone) {
    s3vResetInitial();
  } else {
    /* A resolved screen always comes back on the SOLUTION view. Which of the
       two the learner last looked at is deliberately not persisted -- the same
       principle as the popup's dragged position and the scroll gate, both of
       which also reset on reopen. Nothing is lost: the learner's answer is
       preserved in s3vAnswer and is one click away. No-op if they answered
       correctly. goTo() re-centres and re-shows the popup after this returns;
       this call is what guarantees its CONTENT matches the question. */
    s3vView = 'solution';
    s3vApplyView();
  }
  document.getElementById('s3v-hint-overlay')?.classList.add('hidden');
  closeRecallPopup();
}

/* ═══════════════════════════════════════════════════════════
   S4 — SingleChoiceQuestion (section ג׳). Standard text-pill
   answers, no content image. Hint hidden until the first wrong
   attempt. 2 attempts. Correct: c.
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
    body: ['تشمل هذه الجملة ادّعاءً كاملًا يشمل ادّعاءً واضحًا وتبريرًا يستند مباشرةً إلى الأدلّة، ويربطها بالمعيار المسموح به‎.']
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.', 'الإجابة الصحيحة معلَّمة.'],
    body: ['تشمل هذه الجملة ادّعاءً كاملًا يشمل ادّعاءً واضحًا وتبريرًا يستند مباشرةً إلى الأدلّة، ويربطها بالمعيار المسموح به‎.']
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
  s4qAnswered = true;
  s4qDone = true;
  document.querySelectorAll('#s4 .scq-opt').forEach(o => { o.disabled = true; });
  const chk = document.getElementById('s4q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s4q-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s4q-hint-overlay')?.classList.add('hidden');
  const recall = document.getElementById('s4-recall');
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
  const recall = document.getElementById('s4-recall');
  if (recall) { recall.disabled = false; recall.style.visibility = 'visible'; }
}

function s4qEnter() {
  if (!s4qDone) s4qResetInitial();
  document.getElementById('s4q-hint-overlay')?.classList.add('hidden');
  closeRecallPopup();
}

/* ═══════════════════════════════════════════════════════════
   S5 — SingleChoiceQuestion (section ד׳). Same shape as S4. Hint
   hidden until the first wrong attempt. 2 attempts. Correct: b.
   ═══════════════════════════════════════════════════════════ */
const S5Q = { correctId: 'b', maxAttempts: 2 };
let s5qSelected = null;
let s5qAttempts = 0;
let s5qAnswered = false;
let s5qDone     = false;
let s5qLastWrong = null;  // option id marked wrong on a non-final attempt (gates re-check)

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
      'لا يمكن قياس جميع القناني، ولذلك يتم فحص بعض القناني المختلفة‎.',
      'إذا كانت جميع القناني التي تم فحصها تستوفي المعيار، فهذا يوفر أدلة جيدة تسمح بالاستنتاج أن الشركة تنتج قناني مطابقة للمواصفات‎.'
    ]
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.', 'الإجابة الصحيحة معلَّمة.'],
    body: [
      'لا يمكن قياس جميع القناني، ولذلك يتم فحص بعض القناني المختلفة‎.',
      'إذا كانت جميع القناني التي تم فحصها تستوفي المعيار، فهذا يوفر أدلة جيدة تسمح بالاستنتاج أن الشركة تنتج قناني مطابقة للمواصفات‎.'
    ]
  }
};

function s5qSelect(id) {
  if (s5qAnswered) return;
  dismissRetryPopup('s5q-popup', s5qDone);
  s5qSelected = id;
  if (s5qAttempts > 0) {
    document.querySelectorAll('#s5 .scq-opt').forEach(o => o.classList.remove('wrong', 'correct'));
  }
  document.querySelectorAll('#s5 .scq-opt').forEach(o => {
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
    xapiAnswerText(document.querySelector('#s5 .scq-opt[data-id="' + s5qSelected + '"]')));

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
  const opt = document.querySelector('#s5 .scq-opt[data-id="' + id + '"]');
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
  s5qAnswered = true;
  s5qDone = true;
  document.querySelectorAll('#s5 .scq-opt').forEach(o => { o.disabled = true; });
  const chk = document.getElementById('s5q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s5q-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s5q-hint-overlay')?.classList.add('hidden');
  const recall = document.getElementById('s5-recall');
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
  document.querySelectorAll('#s5 .scq-opt').forEach(o => {
    o.classList.remove('selected', 'correct', 'wrong');
    o.disabled = false;
    o.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s5q-popup')?.classList.add('hidden');
  const chk = document.getElementById('s5q-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('s5q-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = 'hidden'; }
  const recall = document.getElementById('s5-recall');
  if (recall) { recall.disabled = false; recall.style.visibility = 'visible'; }
}

function s5qEnter() {
  if (!s5qDone) s5qResetInitial();
  document.getElementById('s5q-hint-overlay')?.classList.add('hidden');
  closeRecallPopup();
}

/* ═══════════════════════════════════════════════════════════
   Screen state blocks start here — add each screen's own block
   below as it's built. See the 720-templates skill for the
   reference file matching each screen's interaction type.
   ═══════════════════════════════════════════════════════════ */

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
/* Deep link: '#last' lands on this part's final screen. This part is
   terminal so nothing links back to it today, but the handler is kept for
   symmetry if a later part is ever appended. */
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
   attach the observer. Listing the class here is what makes that call match. */
var NAV_LABEL_SELECTOR = '.btn-continue, .scq-back, .scq-hint, .scq-check, .s13-continue, .popup-action';
var navLabelBusy = false;

initNavLabels();

/* ═══════════════════ xAPI (720) — this part's config ═══════════════════
   Data only; the shared layer in ../unit-js/ reads it at call time (guide §6.1).
   ⚠️ SCREEN_TO_SUBCONTENT must hold exactly TOTAL_SCREENS keys (6), 0..5.
   The whole second peak question is ONE catalogue item (001) with four questions: S1 (the task)
   opens it and S2-S5 are its sections q1-q4. The task-details reminder button is not a
   catalogued hint and is not reported. */
/* The component result: at least 3 of the 4 sections, as S0 promises; score = sections / 4, read
   from XAPI_Q_RESULTS. Also the result of item 001, which is the whole component (QA 2026-10-02
   O-8, decided 2026-10-04). */
function partResult() { const score = xapiCorrectCount(); return { success: score >= 3, score: { scaled: score / 4 } }; }
var XAPI_ITEM_RESULT = { '001': function () { return partResult(); } };

var SCREEN_TO_SUBCONTENT = {
  0: null,          // transition ("4 sections, 3 to pass")
  1: ['001', 1],    // the task: juice-bottle quality control
  2: ['001', 2],    // section 1 — q1 (dropdown)
  3: ['001', 3],    // section 2 — q2 (numeric input)
  4: ['001', 4],    // section 3 — q3
  5: ['001', 5]     // section 4 — q4
};

var XAPI_COMP_SLUG     = 'methodica-science-volume-liquid-01-07';
var XAPI_COMP_ID       = XAPI_ID_PREFIX + XAPI_COMP_SLUG + '/';
var XAPI_EVAL_ITEMS    = { '001': 1 };
var XAPI_METADATA_FILE = '../metadata/methodica-science-volume-liquid-01-07.json';
var XAPI_END_BTN       = 's5q-check';   // S5 "שנמשיך?" — the part's last click (D-8)

/* ═══════════════════ Resume (720) — the four per-part hooks ═══════════════════
   Guide §8.7. Committed state only: an unanswered section is reset by its enter function on
   every entry. S2 (dropdown) and S3 (number) carry the reveal toggle's three pieces (guide
   §8.10): the learner's own final answer, the current view, and the value behind it.
   XAPI_Q_RESULTS is the score (one entry per section). */
function capturePartPayload() {
  return {
    currentScreen: currentScreen,
    xq: rsCaptureXq(),
    s2q: { a: s2qAttempts, ans: s2qAnswered, d: s2qDone, sel: s2qSelected, answer: s2qAnswer, view: s2qView },
    s3v: { a: s3vAttempts, ans: s3vAnswered, d: s3vDone, val: s3vValue,
           raw: document.getElementById('s3v-input')?.value ?? '', answer: s3vAnswer, view: s3vView },
    s4q: { a: s4qAttempts, ans: s4qAnswered, d: s4qDone, sel: s4qSelected },
    s5q: { a: s5qAttempts, ans: s5qAnswered, d: s5qDone, sel: s5qSelected }
  };
}
function applyResumeVars(st) {
  if (!st) return;
  rsRestoreXq(st.xq);
  const q = k => (st[k] && st[k].d) ? st[k] : null;
  let s;
  if ((s = q('s2q'))) { s2qAttempts = s.a; s2qAnswered = s.ans; s2qDone = true; s2qSelected = s.sel;
                        s2qAnswer = s.answer ?? null; s2qView = s.view || 'solution'; }
  if ((s = q('s3v'))) { s3vAttempts = s.a; s3vAnswered = s.ans; s3vDone = true; s3vValue = s.val;
                        s3vAnswer = s.answer ?? null; s3vView = s.view || 'solution'; }
  if ((s = q('s4q'))) { s4qAttempts = s.a; s4qAnswered = s.ans; s4qDone = true; s4qSelected = s.sel; }
  if ((s = q('s5q'))) { s5qAttempts = s.a; s5qAnswered = s.ans; s5qDone = true; s5qSelected = s.sel; }
}
/* The dropdown's visible label and the typed number live only in the DOM (guide §8.9). */
function applyResumeDom(st) {
  if (st && st.s2q && st.s2q.d && st.s2q.sel != null) {
    const sel = document.getElementById('s2dd-selected');
    if (sel) sel.textContent = st.s2q.sel;
    document.getElementById('s2dd-btn')?.removeAttribute('data-empty');
  }
  if (st && st.s3v && st.s3v.d) {
    const input = document.getElementById('s3v-input');
    if (input && typeof st.s3v.raw === 'string') input.value = st.s3v.raw;
  }
}
/* S2: correct -> the chosen value locked green; wrong final -> the toggle, in the current view. */
function _rsPaintS2() {
  if (!s2qDone) return;
  if (s2qAnswer === null) {
    const sel = document.getElementById('s2dd-selected');
    if (sel && s2qSelected != null) sel.textContent = s2qSelected;
    s2qMark('correct');
    s2qShowPopup('correct');
    s2qFinish('correct');
  } else { s2qApplyView(); s2qFinish('incorrect'); }
}
/* S3: correct -> the typed value locked; wrong final -> the toggle, in the current view. */
function _rsPaintS3() {
  if (!s3vDone) return;
  if (s3vAnswer === null) {
    const input = document.getElementById('s3v-input');
    if (input && input.value === '' && s3vValue !== null) input.value = String(s3vValue);
    s3vMark('correct');
    s3vShowPopup('correct');
    s3vFinish('correct');
  } else { s3vApplyView(); s3vFinish('incorrect'); }
}
/* Must never throw (rule 7): guarded, and an unanswered section is left to its enter function. */
function restoreScreenUI(n) {
  try {
    if (n === 2) _rsPaintS2();
    if (n === 3) _rsPaintS3();
    if (n === 4) rsPaintChoice({ done: s4qDone, selected: s4qSelected, correctId: S4Q.correctId, optSel: '#s4 .scq-opt',
      mark: s4qMark, showPopup: s4qShowPopup, finish: s4qFinish });
    if (n === 5) rsPaintChoice({ done: s5qDone, selected: s5qSelected, correctId: S5Q.correctId, optSel: '#s5 .scq-opt',
      mark: s5qMark, showPopup: s5qShowPopup, finish: s5qFinish });
  } catch (e) { console.error('[resume] restoreScreenUI ' + n, e); }
}