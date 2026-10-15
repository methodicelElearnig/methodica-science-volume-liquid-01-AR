'use strict';

/* ═══════════════════════════════════════════════════════════
   methodica-science-volume-liquid-01-05 — main.js
   Part 05 of the liquid-volume lomda. 4 screens:
     S0  TransitionScreen        (companion video) — slide 37.
     S1  SingleChoiceQuestion    (medication-label question) — slide
         38 (Q1 of 2).
     S2  SingleChoiceQuestion    (mass-vs-volume-of-water question) —
         slide 39, last slide of the deck (Q2 of 2 — completes the
         series started in S1).
     S3  TransitionScreen        (content video — YouTube embed via the
         IFrame Player API, not character-dependent; continue unlocks
         once the player reaches its ENDED state).
   Character choice is carried over from earlier parts via
   localStorage.
   ═══════════════════════════════════════════════════════════ */

/* ─── Constants ─────────────────────────────────────────── */
const TOTAL_SCREENS = 4;  // S0–S3 — bump as more slides from the deck are implemented

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
const THIS_PART     = LOMDA_ID + '-05';
const S0_BACK_ID    = 's0-back';

/* Onward navigation to the next part of the lomda (sibling folder) —
   S2 is the last screen built so far in this part. */
/* The part's last click (S3 "המשך", enabled once the video has been watched): report the
   component, then stop — the platform routes (guide §6.5, §8.12). The hop to part 06 exists only
   under DEV_NAV (goToPart moves nothing otherwise). Score over the two graded questions
   (001 q1, 002 q1); with 2 questions only 2/2 passes.
   MOE 2026-10-08: real score, success only ≥60%, no gate, nothing shown. */
function goToNextPart() {
  try {
    var _s = xapiCorrectCount() / 2;
    xapiEndComponent({ success: _s >= 0.6, score: { scaled: _s } },
      document.getElementById('s3-continue'));
  } catch (e) {}
  goToPart(LOMDA_ID + '-06');
}

/* S0 companion character video — asset map keyed by the producer-defined
   character IDs from part 01's selection screen (never hardcode a
   character asset). Producer notes: character-1 (purple) → Boxing
   video 1; character-2 (pink) → Boxing video 2. */
const S0_CHARACTER_VIDEOS = {
  'character-1': 'assets/video/Character-1-Boxing.mp4',
  'character-2': 'assets/video/Character-2-Boxing.mp4'
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

/* ── Fullscreen-exit repaint (Chrome/Blink workaround) ──────
   Exiting the S3 video's fullscreen while #app is transform-scaled can
   leave the scaled subtree unpainted — blank white canvas, with only
   own-compositor-layer elements (flag button, bottom bar) still drawn.
   DOM and layout are fully restored at that point (verified via CDP
   state dump); it is purely a stale-compositor-layer paint bug. So on
   every fullscreen EXIT, force Blink to drop and rebuild #app's layer
   tree: hide → flush layout → restore, all inside one frame callback,
   so the intermediate state never paints (no visible flash). Media
   state (position/paused) survives a display toggle. */
function repaintAppAfterFullscreen() {
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  if (fsEl) return;                    // entering fullscreen — nothing to fix
  requestAnimationFrame(() => {
    const app = document.getElementById('app');
    app.style.display = 'none';
    void app.offsetHeight;             // flush layout with the subtree gone
    app.style.display = '';
    scaleApp();                        // re-fit, in case exit resize was missed
  });
}
document.addEventListener('fullscreenchange', repaintAppAfterFullscreen);
document.addEventListener('webkitfullscreenchange', repaintAppAfterFullscreen);

/* ─── Navigation ─────────────────────────────────────────── */
/* Screen number → its feedback popup element id, for screens that have one.
   Used to restore a popup the learner left open (not X-closed) — see below. */
const SCREEN_POPUP_ID = { 1: 's1q-popup', 2: 's2q-popup' };
/* Screen number → whether that screen's question has actually been resolved
   (correct, or final wrong) — same "is this question done" check each screen's
   own resetScreenState() branch already uses to decide fresh-reset vs. resume.
   The popup-reopen below must only fire when this is true: reopening a
   "try again" popup over a board that a *not-done* screen's own reset just
   wiped back to blank would show stale feedback for an empty board. */
const SCREEN_DONE = { 1: () => s1qDone, 2: () => s2qDone };
function goTo(n) {
  if (n < 0 || n >= TOTAL_SCREENS) return;
  // Every feedback popup / hint overlay belongs to the screen it was opened on.
  // Hide them ALL on any navigation so none carries over to the next screen.
  document.querySelectorAll('[id$="-popup"], [id$="-hint-overlay"]')
    .forEach(el => el.classList.add('hidden'));
  const prev = document.querySelector('.screen.active');
  if (prev && window.Motion) Motion.cancel(prev);
  if (prev) prev.classList.remove('active');
  if (prev && prev.id === 's0') {
    try { document.getElementById('s0-video')?.pause(); } catch (e) {}
  }
  if (prev && prev.id === 's3' && typeof pauseS3Video === 'function') pauseS3Video();
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
  if (n === 1) s1qEnter();
  if (n === 2) s2qEnter();
  if (n === 3) s3Enter();
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
  if (currentScreen === 2 && !s2qAnswered) return;
  // S3 is the last screen — onward travel is its own continue button
  // (goToNextPart, gated on finishing the video), never advanceScreen.
  if (currentScreen >= TOTAL_SCREENS - 1) return;
  goTo(currentScreen + 1);
}

/* ─── Keyboard Navigation ────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft')  advanceScreen();
  if (e.key === 'ArrowRight') goBack();
  if (e.key === 'Escape') {
    s1qCloseHint();
    s2qCloseHint();
    closeImageZoom();
  }
});

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
   COMPONENT — Progress Question nav (reusable across the practice
   screens of this part). 2 questions total (per producer notes:
   "שאלה 1 מתוך 2" / "שאלה 2 מתוך 2").
   ═══════════════════════════════════════════════════════════ */
const practiceProgress = {
  questions: [
    { number: 1, visited: true,  state: 'current',      screen: 1 },
    { number: 2, visited: false, state: 'not-answered', screen: 2 }
  ]
};

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
   S3 — TransitionScreen — CONTENT video, YouTube embed (IFrame Player
   API, privacy-enhanced nocookie host — ported from the reference
   lomda's VideoWatchAndContinue pattern). Deliberately NOT the
   companion pattern: no autoplay (the learner starts it via YouTube's
   own controls). Continue is gated on the player reaching its ENDED
   state, then stays enabled for the rest of the session. onError also
   lifts the gate — never trap the learner behind a blocked/broken
   embed. Leaving pauses playback via goTo()'s pauseS3Video() hook.
   Re-entering before finishing rewinds/halts the player so the
   learner watches to the end to unlock Continue (same as the
   reference); re-entering after finishing leaves Continue unlocked.
   ═══════════════════════════════════════════════════════════ */
const S3_YT_VIDEO_ID = 'lYn6pld-VXM';
let s3VideoWatched = false;
let s3YtPlayer     = null;
let s3YtApiLoading = false;

/* Load the IFrame API script once; run cb when YT.Player is available. */
function loadYouTubeApi(cb) {
  if (window.YT && window.YT.Player) { cb(); return; }
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = function () {
    if (typeof prev === 'function') prev();
    cb();
  };
  if (!s3YtApiLoading) {
    s3YtApiLoading = true;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }
}

/* We build the embed src ourselves instead of letting YT.Player build it
   from a <div>. When the IFrame API builds it, it appends `forigin` taken
   from window.location.href — the full launch URL, whose query string will
   carry the platform's xAPI credentials (?slxapi=…) — and we used to add
   widget_referrer = href on top. No playerVar suppresses forigin. See
   Documentation/reporting-and-resume/KNOWN-ISSUE-youtube-forigin-token-leak.md.
   origin comes from window.location.origin (no path, no query) and only over
   http(s): over file:// it is the string "null", which YouTube rejects with
   player error 153 — test this screen over http(s). enablejsapi=1 is
   required, or onStateChange never fires and Continue never unlocks.
   The other parameters are the playerVars this player always used. */
function ytEmbedSrc(videoId) {
  const p = ['enablejsapi=1', 'rel=0', 'modestbranding=1', 'playsinline=1',
             'hl=iw', 'cc_lang_pref=iw', 'cc_load_policy=1'];
  if (/^https?:$/.test(window.location.protocol)) {
    p.push('origin=' + encodeURIComponent(window.location.origin));
  }
  return 'https://www.youtube-nocookie.com/embed/' + videoId + '?' + p.join('&');
}

/* Replace the placeholder <div> with a real iframe (same id, so the CSS that
   targets #s3-youtube-player still applies) and return it for YT.Player to
   attach to. Idempotent: a second call finds the iframe and returns it. */
function ytMountIframe(id, videoId, title, w, h) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (el.tagName === 'IFRAME') return el;
  const f = document.createElement('iframe');
  f.id = id;
  f.src = ytEmbedSrc(videoId);
  f.width = w;
  f.height = h;
  f.title = title;
  f.setAttribute('frameborder', '0');
  f.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
  f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  f.setAttribute('allowfullscreen', '');
  el.parentNode.replaceChild(f, el);
  return f;
}

function s3OnVideoEnded() {
  s3VideoWatched = true;
  const b = document.getElementById('s3-continue');
  if (b) b.disabled = false;
  /* The watch gate is state (guide §8.8 rule 11): saved synchronously the moment it is earned, so a
     learner who closes the tab after watching does not have to watch again. */
  try { flushResumeSave(); } catch (e) {}
}

/* Create the player once; reused across re-entries. */
function initS3Player() {
  if (s3YtPlayer) return;
  loadYouTubeApi(function () {
    if (s3YtPlayer) return;
    const iframe = ytMountIframe('s3-youtube-player', S3_YT_VIDEO_ID, 'סרטון: כפית שמצילה חיים', '640', '360');
    if (!iframe) return;
    /* Attach to OUR iframe: no videoId / host / playerVars here, so the API
       never rebuilds the src (that is where forigin would come from). */
    s3YtPlayer = new YT.Player(iframe, {
      events: {
        onStateChange: function (e) {
          /* xAPI played/paused (state machine in 20-xapi.js). The catalogue has no video item for
             this part, so the video reports against 001 — the teaspoon-dosage question it is about —
             and S3 is mapped to 001 (decided 2026-09-28). */
          try { xapiYouTubeState(e, '001'); } catch (_) {}
          if (e.data === YT.PlayerState.ENDED) s3OnVideoEnded();
        },
        onError: function () { s3OnVideoEnded(); }
      }
    });
  });
}

function pauseS3Video() {
  if (s3YtPlayer && typeof s3YtPlayer.pauseVideo === 'function') s3YtPlayer.pauseVideo();
}

function s3Enter() {
  const btn = document.getElementById('s3-continue');
  if (s3VideoWatched) {
    if (btn) btn.disabled = false;
    return;
  }
  if (btn) btn.disabled = true;
  if (s3YtPlayer && typeof s3YtPlayer.stopVideo === 'function') {
    s3YtPlayer.stopVideo();
  } else {
    initS3Player();
  }
}

/* ═══════════════════════════════════════════════════════════
   S1 — SingleChoiceQuestion (medication-label question, slide 38)
   Hint hidden until the first wrong attempt (producer note). 2
   attempts. Correct: c (15 מ״ל).
   ═══════════════════════════════════════════════════════════ */
const S1Q = { correctId: 'c', maxAttempts: 2 };
let s1qSelected = null;
let s1qAttempts = 0;
let s1qAnswered = false;
let s1qDone     = false;
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
      '30‏‎ ‎كغم ÷ 10 كغم/جرعة = 3 جرعات. 3 × 5 ملل = 15 ملل.',
      'tsp = teaspoon = ملعقة قياس طبية سِعتها 5 ملل بالضبط (وليست ملعقة منزلية)‎.'
    ]
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.', 'الإجابة الصحيحة معلَّمة.'],
    body: [
      '30‏‎ ‎كغم ÷ 10 كغم/جرعة = 3 جرعات. 3 × 5 ملل = 15 ملل.',
      'tsp = teaspoon = ملعقة قياس طبية سِعتها 5 ملل بالضبط (وليست ملعقة منزلية)‎.'
    ]
  }
};

function s1qSelect(id) {
  if (s1qAnswered) return;
  dismissRetryPopup('s1q-popup', s1qDone);
  s1qSelected = id;
  if (s1qAttempts > 0) {
    document.querySelectorAll('#s1 .scq-opt').forEach(o => o.classList.remove('wrong', 'correct'));
  }
  document.querySelectorAll('#s1 .scq-opt').forEach(o => {
    const sel = o.dataset.id === id;
    o.classList.toggle('selected', sel);
    o.setAttribute('aria-checked', sel ? 'true' : 'false');
  });
  const chk = document.getElementById('s1q-check');
  if (chk && !s1qAnswered) chk.disabled = !s1qSelected || s1qSelected === s1qLastWrong;
}

function s1qCheck() {
  if (s1qAnswered) { advanceScreen(); return; }
  if (!s1qSelected) return;

  s1qAttempts++;
  const isCorrect = s1qSelected === S1Q.correctId;
  xapiAnswered('001', 'q1', isCorrect, isCorrect || s1qAttempts >= S1Q.maxAttempts,
    xapiAnswerText(document.querySelector('#s1 .scq-opt[data-id="' + s1qSelected + '"]')));

  if (isCorrect) {
    s1qMark(S1Q.correctId, 'correct');
    s1qShowPopup('correct');
    s1qFinish('correct');
  } else if (s1qAttempts >= S1Q.maxAttempts) {
    s1qMark(S1Q.correctId, 'correct');
    s1qMark(s1qSelected, 'wrong');
    s1qShowPopup('wrong2');
    s1qFinish('incorrect');
  } else {
    s1qMark(s1qSelected, 'wrong');
    /* Re-check stays disabled until the learner picks a DIFFERENT option */
    s1qLastWrong = s1qSelected;
    const chk = document.getElementById('s1q-check');
    if (chk) chk.disabled = true;
    s1qShowPopup('retry');
    const hint = document.getElementById('s1q-hint');
    if (hint) hint.style.visibility = 'visible';
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

function s1qMark(id, cls) {
  const opt = document.querySelector('#s1 .scq-opt[data-id="' + id + '"]');
  if (!opt) return;
  opt.classList.remove('selected');
  opt.classList.add(cls);
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


function s1qFinish(resultState) {
  s1qAnswered = true;
  s1qDone = true;
  document.querySelectorAll('#s1 .scq-opt').forEach(o => { o.disabled = true; });
  const chk = document.getElementById('s1q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s1q-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s1q-hint-overlay')?.classList.add('hidden');
  practiceProgress.questions[0].state = resultState;
  syncPracticeProgressNav(document.getElementById('s1'));
}

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

function s1qResetInitial() {
  s1qSelected = null;
  s1qAttempts = 0;
  s1qAnswered = false;
  s1qLastWrong = null;
  document.querySelectorAll('#s1 .scq-opt').forEach(o => {
    o.classList.remove('selected', 'correct', 'wrong');
    o.disabled = false;
    o.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s1q-popup')?.classList.add('hidden');
  const chk = document.getElementById('s1q-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('s1q-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = 'hidden'; }
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
   S2 — SingleChoiceQuestion (mass-vs-volume-of-water question,
   slide 39 — last slide of the deck, Q2 of 2). Hint policy NOT
   overridden in producer notes → template default: visible from the
   start (unlike S1's hidden-until-wrong). 2 attempts. Correct: b
   ("שניהם צודקים"). Its "שנמשיך?" completion button advances to S3
   (no longer the last screen of this part).
   ═══════════════════════════════════════════════════════════ */
const S2Q = { correctId: 'b', maxAttempts: 2 };
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
    body: [
      'حسبَ سامر الحجم بواسطة قياس الكتلة، لأنه عرف‎:',
      '1‏‎ ‎غرام = 1 ملل.',
      '',
      'لذلك‎:',
      '500‏‎ ‎غرام من الماء = 500 ملل = نصف لتر. لكل مادة حجم وكتلة، وهناك علاقة بينهما‎.',
      '',
      '<strong>1‏‎ ‎غرام ≈ 1 ملل في الماء فقط‎!</strong>'
    ]
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.', 'الإجابة الصحيحة معلَّمة.'],
    body: [
      'حسبَ سامر الحجم بواسطة قياس الكتلة، لأنه عرف‎:',
      '1‏‎ ‎غرام = 1 ملل.',
      '',
      'لذلك‎:',
      '500‏‎ ‎غرام من الماء = 500 ملل = نصف لتر. لكل مادة حجم وكتلة، وهناك علاقة بينهما‎.',
      '',
      '<strong>1‏‎ ‎غرام ≈ 1 ملل في الماء فقط‎!</strong>'
    ]
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
  xapiAnswered('002', 'q1', isCorrect, isCorrect || s2qAttempts >= S2Q.maxAttempts,
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
  s2qAnswered = true;
  s2qDone = true;
  document.querySelectorAll('#s2 .scq-opt').forEach(o => { o.disabled = true; });
  const chk = document.getElementById('s2q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s2q-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s2q-hint-overlay')?.classList.add('hidden');
  practiceProgress.questions[1].state = resultState;
  syncPracticeProgressNav(document.getElementById('s2'));
}

function s2qOpenHint() {
  if (s2qAnswered) return;
  /* xAPI requested.1 — after the guard, right before the reveal; this function only opens. */
  xapiRequestedHint('002', 'q1');
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
  practiceProgress.questions[1].state = 'current';
}

function s2qEnter() {
  practiceProgress.questions[1].visited = true;
  practiceProgress.questions[1].screen = 2;
  if (!s2qDone) s2qResetInitial();
  document.getElementById('s2q-hint-overlay')?.classList.add('hidden');
  syncPracticeProgressNav(document.getElementById('s2'));
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
/* Deep link: '#last' lands on this part's final screen — used by part 06's
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
   ⚠️ SCREEN_TO_SUBCONTENT must hold exactly TOTAL_SCREENS keys (4), 0..3.
   S3's video has no catalogue item of its own; it belongs to 001 (the teaspoon dosage it is
   about), so leaving 002 for S3 closes 002 and re-opens 001 (its second 'completed' is
   suppressed by the ledger). */
var SCREEN_TO_SUBCONTENT = {
  0: null,          // transition
  1: ['001', 1],    // SingleChoice — medicine dose by body weight
  2: ['002', 1],    // SingleChoice — mass vs volume (Ido / Tamar)
  3: ['001', 2]     // video "a spoon that saves lives" — reported against 001
};

var XAPI_COMP_SLUG     = 'methodica-science-volume-liquid-01-05';
var XAPI_COMP_ID       = XAPI_ID_PREFIX + XAPI_COMP_SLUG + '/';
var XAPI_EVAL_ITEMS    = { '001': 1, '002': 1 };
var XAPI_METADATA_FILE = '../metadata/methodica-science-volume-liquid-01-05.json';
var XAPI_END_BTN       = 's3-continue';   // the part's last button (restoreEndedButton, D-8)

/* ═══════════════════ Resume (720) — the four per-part hooks ═══════════════════
   Guide §8.7. The payload is the COMMITTED state only: an unanswered question is reset by its
   enter function on every entry (s1qEnter / s2qEnter), so a pending pick or a first wrong attempt
   was never kept across a screen change and is not kept across a reload either. Answered
   questions are painted back by restoreScreenUI (unit-js/45-resume-paint.js), on every goTo. */
function capturePartPayload() {
  return {
    currentScreen: currentScreen,
    xq: rsCaptureXq(),
    pp: rsCaptureQuestions(practiceProgress),
    s1q: { a: s1qAttempts, ans: s1qAnswered, d: s1qDone, sel: s1qSelected },
    s2q: { a: s2qAttempts, ans: s2qAnswered, d: s2qDone, sel: s2qSelected },
    video: s3VideoWatched
  };
}
function applyResumeVars(st) {
  if (!st) return;
  rsRestoreXq(st.xq);
  rsRestoreQuestions(practiceProgress, st.pp);
  if (st.s1q && st.s1q.d) { s1qAttempts = st.s1q.a; s1qAnswered = st.s1q.ans; s1qDone = true; s1qSelected = st.s1q.sel; }
  if (st.s2q && st.s2q.d) { s2qAttempts = st.s2q.a; s2qAnswered = st.s2q.ans; s2qDone = true; s2qSelected = st.s2q.sel; }
  if (st.video) s3VideoWatched = true;
}
function applyResumeDom(st) {}   // nothing on these screens lives only in the DOM
/* Must never throw (rule 7): every call is guarded, and an unanswered screen is left untouched. */
function restoreScreenUI(n) {
  try {
    if (n === 1) rsPaintChoice({ done: s1qDone, selected: s1qSelected, correctId: S1Q.correctId, optSel: '#s1 .scq-opt',
      mark: s1qMark, showPopup: s1qShowPopup, finish: s1qFinish });
    if (n === 2) rsPaintChoice({ done: s2qDone, selected: s2qSelected, correctId: S2Q.correctId, optSel: '#s2 .scq-opt',
      mark: s2qMark, showPopup: s2qShowPopup, finish: s2qFinish });
    if (n === 1 || n === 2) syncPracticeProgressNav(document.getElementById('s' + n));
    if (n === 3) { const b = document.getElementById('s3-continue'); if (b) b.disabled = !s3VideoWatched; }   // the watch gate (rule 11)
  } catch (e) { console.error('[resume] restoreScreenUI ' + n, e); }
}