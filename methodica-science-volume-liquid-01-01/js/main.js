'use strict';

/* ─── Constants ─────────────────────────────────────────── */
const TOTAL_SCREENS = 16;  // S0–S15 — bump as screens are added (S11 = escape-room
                           // branch; S12 = the escape path's dropdown question).
                           // S15 is the last screen here: the practice series that
                           // used to follow it now lives in part 02.

/* ─── Cross-part back navigation (session-scoped route stack) ─────
   Parts are separate pages, so "which part did the learner arrive from"
   cannot live in JS memory. A sessionStorage stack records the route
   ACTUALLY taken: every forward hop pushes the part being left, and
   חזרה on a part's S0 pops it. The route branches later in the unit
   (part 04 is reachable from 02 or 03), so a hardcoded predecessor
   would be wrong — hence a stack rather than a constant.
   sessionStorage (not localStorage) is deliberate: the trail belongs to
   this browsing session, so opening a part directly in a fresh tab
   correctly has nowhere to go back to.
   This part is the unit's entry point, so it has no S0 back button and
   never pops — it only pushes itself on the way out. ───────────────── */
const LOMDA_ID      = 'methodica-science-volume-liquid-01';
const NAV_STACK_KEY = LOMDA_ID + '_navStack';
const THIS_PART     = LOMDA_ID + '-01';

/* ─── Global lomda state ────────────────────────────────────
   Single source of truth that persists across every screen for
   the whole session (single-page app). The character is written through
   the resume layer (setUnitCharacter): this component's state document and
   the per-unit mirror UI_CHARACTER_KEY, which parts 02-07 read through
   getCharacter() (unit-js/00-util.js).
   ─────────────────────────────────────────────────────────── */
window.lomdaState = window.lomdaState || {
  selectedCharacter: null,
  selectedLearningStyle: null   // set by S6 (learning-style choice)
};

/* ─── S1 companion character videos — asset map keyed by the
   producer-defined character IDs from the S0 selection screen
   (companion character system: never hardcode a character asset). ─── */
const S1_CHARACTER_VIDEOS = {
  'character-1': 'assets/video/character-1-Talking.mp4',
  'character-2': 'assets/video/character-2-Talking.mp4',
};

/* Decorative card videos (S0 character selection, S6 learning-style choice)
   must hold on their LAST frame instead — unlike the talk-video convention
   above, resetting to frame 0 would jump the character back to a start pose
   right as playback ends. The default, un-freezeVideoOnEnd <video> behavior
   already does this: a non-looping video simply stops and displays its true
   final frame. Some source clips have a blank/white tail baked in though
   (verified by pixel-sampling actual frames at each entry's cutoff below);
   for those we clamp playback to stop just before the blank tail so it
   still holds on a visible frame. Keyed by the <video>'s src path so a
   future re-export without a blank tail can simply drop its entry. Wired
   once per element; re-checked on every timeupdate against the CURRENT src,
   so it stays correct even when a card's src is swapped later (S6 character
   switch) — not just for the element's first source. */
const CARD_VIDEO_SAFE_END_TIME = {
  'assets/video/character-2-selection.mp4':  3.8,  // content through 3.86s, blank from 3.88s
  'assets/video/character-1-scratch-card.mp4': 3.8,  // content through 3.85s, blank from 3.9s
  'assets/video/character-2-scratch-card.mp4': 3.75  // content through 3.8s, blank from 3.85s
  // character-1/2-looking-glass.mp4: verified clean to their true end — no entry needed.
};

function wireCardVideoFreeze(vid) {
  if (!vid || vid._freezeWired) return;
  vid._freezeWired = true;
  vid.addEventListener('timeupdate', function () {
    const safeEnd = CARD_VIDEO_SAFE_END_TIME[vid.getAttribute('src')];
    if (safeEnd != null && vid.currentTime >= safeEnd) vid.pause();
  });
}

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

/* ═══════════════════════════════════════════════════════════
   Pointer-based drag-and-drop helper (ported from the 720
   reference engine). Replaces native HTML5 drag so screens work
   on touch devices (tablet, both orientations) without losing
   mouse support.

   Usage:
     const dnd = createPointerDnd({
       canDrag: (dragId, elem) => boolean,
       onPick:  (dragId, elem) => void,    // pointerdown accepted
       onDrop:  (dragId, targetId) => void,
       onCancel:(dragId) => void,          // dropped outside a target
     });
     dnd.attachSource(elem, dragId);   // safe to call repeatedly
     dnd.attachTarget(elem, targetId);

   Ghost element (a clone of the source) follows the pointer
   in viewport-fixed positioning and is scaled to match the
   #app transform so it visually matches the source.
   ═══════════════════════════════════════════════════════════ */
function createPointerDnd(opts) {
  const targets = new Map(); // elem → targetId
  let active = null;

  function getAppScale() {
    const app = document.getElementById('app');
    const m = app && app.style.transform.match(/scale\(([^)]+)\)/);
    return m ? parseFloat(m[1]) : 1;
  }

  function attachSource(elem, dragId) {
    if (!elem || elem.dataset.pdragAttached === '1') {
      if (elem) elem.dataset.pdragId = dragId;
      return;
    }
    elem.dataset.pdragId = dragId;
    elem.dataset.pdragAttached = '1';
    elem.style.touchAction = 'none';
    elem.addEventListener('pointerdown', onSourceDown);
  }

  function attachTarget(elem, targetId) {
    if (!elem) return;
    targets.set(elem, targetId);
  }

  function onSourceDown(e) {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    const src    = e.currentTarget;
    const dragId = src.dataset.pdragId;
    if (!dragId) return;
    if (opts.canDrag && !opts.canDrag(dragId, src)) return;
    e.preventDefault();

    const rect  = src.getBoundingClientRect();
    const scale = getAppScale();

    const ghost = src.cloneNode(true);
    // Strip ids from clone descendants to avoid duplicate ids in DOM
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    ghost.style.position       = 'fixed';
    ghost.style.left           = rect.left + 'px';
    ghost.style.top            = rect.top  + 'px';
    // Lock the ghost to the source's rendered size so the dragged card keeps the
    // same width/height (the source is width:100% of its slot; a bare clone would
    // shrink to its text). rect is post-scale, so divide back out the app scale.
    ghost.style.width          = (rect.width  / scale) + 'px';
    ghost.style.height         = (rect.height / scale) + 'px';
    ghost.style.boxSizing      = 'border-box';
    ghost.style.margin         = '0';
    ghost.style.pointerEvents  = 'none';
    ghost.style.zIndex         = '9999';
    ghost.style.opacity        = '0.92';
    ghost.style.transform      = `scale(${scale})`;
    ghost.style.transformOrigin = 'top left';
    ghost.classList.remove('dragging');
    ghost.classList.add('pointer-drag-ghost');
    document.body.appendChild(ghost);

    active = {
      dragId, srcElem: src, ghost,
      pointerId: e.pointerId,
      offX: e.clientX - rect.left,
      offY: e.clientY - rect.top,
      currentTarget: null,
    };
    src.classList.add('dragging');
    if (opts.onPick) opts.onPick(dragId, src);

    document.addEventListener('pointermove',   onMove,   { passive: false });
    document.addEventListener('pointerup',     onUp);
    document.addEventListener('pointercancel', onUp);
  }

  function findTargetUnder(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    for (const [tElem, tId] of targets) {
      if (tElem === el || tElem.contains(el)) return { elem: tElem, id: tId };
    }
    return null;
  }

  function onMove(e) {
    if (!active) return;
    if (active.pointerId !== undefined && e.pointerId !== active.pointerId) return;
    e.preventDefault();
    active.ghost.style.left = (e.clientX - active.offX) + 'px';
    active.ghost.style.top  = (e.clientY - active.offY) + 'px';

    const hit   = findTargetUnder(e.clientX, e.clientY);
    const hitId = hit ? hit.id : null;
    if (active.currentTarget !== hitId) {
      if (active.currentTarget) {
        for (const [elem, tid] of targets) {
          if (tid === active.currentTarget) elem.classList.remove('drag-over');
        }
      }
      if (hit) hit.elem.classList.add('drag-over');
      active.currentTarget = hitId;
    }
  }

  function onUp(e) {
    if (!active) return;
    if (active.pointerId !== undefined && e && e.pointerId !== undefined &&
        e.pointerId !== active.pointerId) return;

    document.removeEventListener('pointermove',   onMove);
    document.removeEventListener('pointerup',     onUp);
    document.removeEventListener('pointercancel', onUp);

    const dragId   = active.dragId;
    const targetId = active.currentTarget;
    const srcElem  = active.srcElem;
    const ghost    = active.ghost;

    for (const [elem] of targets) elem.classList.remove('drag-over');
    srcElem.classList.remove('dragging');
    ghost.remove();
    active = null;

    if (targetId && opts.onDrop)       opts.onDrop(dragId, targetId);
    else if (opts.onCancel)            opts.onCancel(dragId);
  }

  return { attachSource, attachTarget };
}

/* ─── Navigation engine ─────────────────────────────────── */
/* Screen number → its feedback popup element id, for screens that have one.
   Used to restore a popup the learner left open (not X-closed) — see below. */
const SCREEN_POPUP_ID = {
  1: 'scq-popup', 3: 's3ddq-popup', 5: 's5q-popup', 8: 's8q-popup',
  10: 's10q-popup', 12: 's12q-popup', 13: 's12ddq-popup', 15: 's14q-popup'
};
/* Screen number → whether that screen's question has actually been resolved
   (correct, or final wrong) — same "is this question done" check each screen's
   own resetScreenState() branch already uses to decide fresh-reset vs. resume.
   The popup-reopen below must only fire when this is true: reopening a
   "try again" popup over a board that a *not-done* screen's own reset just
   wiped back to blank would show stale feedback for an empty board. */
const SCREEN_DONE = {
  1: () => scqDone, 3: () => s3ddqDone, 5: () => s5qDone, 8: () => s8qDone,
  10: () => s10qDone, 12: () => s12qDone, 13: () => s12ddqDone, 15: () => s14qDone
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
  // Halt the S1 companion video when leaving its screen (muted, but no
  // reason to keep it decoding in the background).
  if (prev && prev.id === 's1') {
    try { document.getElementById('s1-talk-video')?.pause(); } catch (e) {}
  }
  // Same for the S0 and S6 character-card videos.
  if (prev && (prev.id === 's0' || prev.id === 's6')) {
    prev.querySelectorAll('.option-card-video').forEach(v => {
      try { v.pause(); } catch (e) {}
    });
  }
  // The coin "cursor" is a fixed-position element — hide it on any
  // navigation so it never lingers visible over the next screen. Also
  // stop the scratch/celebration sounds so they never play into the
  // next screen either.
  if (prev && prev.id === 's7') {
    s7scHideCoin();
    s7scStopScratchSound();
    document.getElementById('s7sc-celebration-audio')?.pause();
    s7GhStop();   // cancel the gesture-hint animation so nothing keeps firing off-screen
  }
  // S9's gesture hint, same reason as S7's above.
  if (prev && prev.id === 's9') {
    s9GhStop();
  }
  // Escape-room sounds never play into another screen: the background
  // music is scoped to S11 only (user decision), the chime is one-shot.
  // Stopped on ANY navigation to a non-S11 screen (not just when prev is
  // S11) as a safety net — s11erEnter() restarts it on entry anyway.
  if (n !== 11) {
    s11erStopMusic();
    document.getElementById('s11er-celebration-audio')?.pause();
  }
  // Halt the S13 companion video when leaving its screen (muted, but no
  // reason to keep it decoding in the background).
  if (prev && prev.id === 's13') {
    try { document.getElementById('s13tr-video')?.pause(); } catch (e) {}
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
    // TwoOptionSelection — restore the saved choice (if returning to it)
    const saved = window.lomdaState.selectedCharacter;
    document.querySelectorAll('#s0 .option-card').forEach(card => {
      const isSel = !!saved && card.dataset.value === saved;
      card.classList.toggle('selected', isSel);
      card.setAttribute('aria-checked', isSel ? 'true' : 'false');
    });
    const cont = document.getElementById('s0-continue');
    if (cont) cont.disabled = !saved;
    // Character card videos — replay from the start on every entry (returning
    // from a later screen re-plays the animation, then freezes on frame 0).
    s0PlaySelectionVideos();
  }
  if (n === 1) {
    // SingleChoiceQuestion — keep a completed question completed on return;
    // otherwise restore a clean initial state.
    if (!scqDone) scqResetInitial();
    document.getElementById('scq-hint-overlay')?.classList.add('hidden');
    // Companion character + bubble — visible from the initial state
    // (producer instruction). Re-resolves the asset on every entry so a
    // changed character selection on S0 is reflected here.
    s1ShowTalkVideo();
  }
  if (n === 2) {
    frcEnter();
  }
  if (n === 3) {
    s3ddqEnter();
  }
  if (n === 4) {
    s4frcEnter();
  }
  if (n === 5) {
    // Image-choice SCQ — keep a completed question completed on return
    if (!s5qDone) s5qResetInitial();
    document.getElementById('s5q-hint-overlay')?.classList.add('hidden');
    // Companion character hanging from the top — re-resolves the asset on
    // every entry so a changed character selection on S0 is reflected here.
    const ropeImg = document.getElementById('s5-rope-char');
    if (ropeImg) {
      const char = window.lomdaState.selectedCharacter || 'character-1';
      ropeImg.src = 'assets/img/' + char + '-rope.png';
    }
  }
  if (n === 6) {
    s6Reset();
  }
  if (n === 7) {
    s7scEnter();
  }
  if (n === 8) {
    if (!s8qDone) s8qResetInitial();
    document.getElementById('s8q-hint-overlay')?.classList.add('hidden');
  }
  if (n === 9) {
    s9scEnter();
    // Companion character peeking from the left — re-resolves the asset on
    // every entry so a changed character selection on S0 is reflected here.
    const peekImg = document.getElementById('s9-peek-char');
    if (peekImg) {
      const char = window.lomdaState.selectedCharacter || 'character-1';
      peekImg.src = 'assets/img/' + char + '-peeking.png';
    }
  }
  if (n === 10) {
    s10qEnter();
  }
  if (n === 11) {
    s11erEnter();
  }
  if (n === 12) {
    s12qEnter();
  }
  if (n === 13) {
    s12ddqEnter();
  }
  if (n === 14) {
    s13trEnter();
  }
  if (n === 15) {
    if (!s14qDone) s14qResetInitial();
    document.getElementById('s14q-hint-overlay')?.classList.add('hidden');
  }
}

function goBack() {
  // Branch screens: S11 (escape room) returns to wherever it was entered
  // from (S6 choice, or the S7/S9 toggle tab). S10 (scratch path) and
  // S12 (escape path) are the per-path dropdown questions; S13
  // (מה למדנו?) is where the paths reconnect, so its "previous" depends
  // on the path taken (linear −1 would land on the wrong branch).
  if (currentScreen === 13) { goTo(s13EntryScreen); return; }
  if (currentScreen === 12) { goTo(11); return; }
  if (currentScreen === 11) { goTo(s11erEntryScreen); return; }
  if (currentScreen === 10) { goTo(s10EntryScreen); return; }
  goTo(currentScreen - 1);
}

function advanceScreen() {
  // Screen 01 gate: a character must be selected before advancing
  if (currentScreen === 0 && !window.lomdaState.selectedCharacter) return;
  // Screen 02 gate: must answer before advancing
  if (currentScreen === 1 && !scqAnswered) return;
  // Screen 03 gate: all cards must be revealed before advancing
  if (currentScreen === 2 && !frcDone) return;
  // Screen 04 gate: question must be resolved before advancing
  if (currentScreen === 3 && !s3ddqDone) return;
  // Screen 05 gate: all cards must be revealed before advancing
  if (currentScreen === 4 && !s4frcDone) return;
  // Screen 06 gate: must answer before advancing
  if (currentScreen === 5 && !s5qAnswered) return;
  // Screen 06 branch: advance to the selected learning path
  if (currentScreen === 6) {
    const style = window.lomdaState.selectedLearningStyle;
    if (style === 'escape-room') { s11erEntryScreen = 6; goTo(11); return; }
    if (style !== 'scratch-card') return;
  }
  // Screen 08 gate: all cards must be scratched before advancing
  if (currentScreen === 7 && !s7scDone) return;
  // Screen 09 gate: must answer before advancing
  if (currentScreen === 8 && !s8qAnswered) return;
  // Screen 10 gate: all cards must be scratched before advancing
  if (currentScreen === 9) {
    if (!s9scDone) return;
    s10EntryScreen = 9;
  }
  // S10's successor is S13 (paths reconnect) — S11/S12 are the escape
  // branch, never linear.
  if (currentScreen === 10) { advanceFromS10(); return; }
  // Escape-room branch: continue moves on to S12 (the branch's dropdown)
  if (currentScreen === 11) { advanceFromS11(); return; }
  // Escape-path dropdown: successor is S13, where the paths reconnect
  if (currentScreen === 12) { advanceFromS12(); return; }
  // Screen 13 gate: must resolve the ordering question before advancing
  if (currentScreen === 13 && !s12ddqDone) return;
  // S13 (transition) has no gate — always advances
  // Screen 15 gate: must answer before advancing
  if (currentScreen === 15 && !s14qAnswered) return;
  // S15 is this part's last screen — the practice series that used to
  // follow it now lives in part 02, so continue leaves for that part.
  // Parts are sibling folders of this one, so a relative URL works
  // wherever the unit is hosted.
  if (currentScreen === 15) {
    /* xAPI: the part's last click. A teaching component: success, and NO score — its questions
       are warm-ups, not graded into anything (guide §6.4; same decision as mass-weight-01's part
       01). The platform routes; the hop to part 02 exists only under DEV_NAV. */
    try { xapiEndComponent({ success: true }, document.getElementById('s14q-check')); } catch (e) {}
    goToPart(LOMDA_ID + '-02');
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
    scqCloseHint();
    s3ddqCloseHint();
    s5qCloseHint();
    s8qCloseHint();
    s10qCloseAllDropdowns();
    s12qCloseAllDropdowns();
    s12ddqCloseHint();
    s14qCloseHint();
    closeImageZoom();
  }
});

/* ═══════════════════════════════════════════════════════════
   TEMPLATE — TwoOptionSelection (Screen 01)
   Single selection. Selecting a card stores the choice globally
   and enables the Continue button. No modal, no auto-advance.
   ═══════════════════════════════════════════════════════════ */
function selectOption(cardEl) {
  document.querySelectorAll('#s0 .option-card').forEach(c => {
    c.classList.remove('selected');
    c.setAttribute('aria-checked', 'false');
  });
  cardEl.classList.add('selected');
  cardEl.setAttribute('aria-checked', 'true');

  // Persist globally for the rest of the lomda (and across parts via localStorage)
  /* Through the resume layer (40-resume.js): memory, the per-unit same-browser mirror that parts
     02-07 read (UI_CHARACTER_KEY), and this component's state document — queued if the document
     has not been read yet (guide §8.3, §8.13). Replaces the origin-wide 'lomda_selectedCharacter'
     key, which other units share with incompatible values (QA D-6). */
  if (typeof setUnitCharacter === 'function') setUnitCharacter(cardEl.dataset.value);
  else {
    window.lomdaState.selectedCharacter = cardEl.dataset.value;
    try { localStorage.setItem(UI_CHARACTER_KEY, cardEl.dataset.value); } catch (e) {}
  }

  // Enable Continue (visible from the start, disabled until now)
  const cont = document.getElementById('s0-continue');
  if (cont) cont.disabled = false;
}

/* Character card videos on S0 — play once from the start, then hold on the
   last (non-blank) frame (see CARD_VIDEO_SAFE_END_TIME below). Called on
   every entry to S0. */
function s0PlaySelectionVideos() {
  document.querySelectorAll('#s0 .option-card-video').forEach(vid => {
    wireCardVideoFreeze(vid);
    try { vid.currentTime = 0; } catch (e) {}
    vid.play().catch(() => {});
  });
}

/* Continue ("בחרתי") → advance. */
function advanceFromS0() {
  if (!window.lomdaState.selectedCharacter) return;
  goTo(1);
}


/* ═══════════════════════════════════════════════════════════
   TEMPLATE — SingleChoiceQuestion (Screen 02)
   Hint policy: visible from the start (template default).
   Two attempts: 1st wrong → generic retry popup (no reveal);
   2nd wrong → reveal correct answer, shared explanation with the
   correct-answer popup (per current 720 convention).
   ═══════════════════════════════════════════════════════════ */
const SCQ = { correctId: 'd', maxAttempts: 2 };   // "לא ניתן לדעת" (client QA fix, 2026-09-23)
let scqSelected = null;   // currently selected option id
let scqAttempts = 0;      // number of check attempts made
let scqAnswered = false;  // true once resolved (correct or final wrong)
let scqDone     = false;  // resume-state lock (survives navigation)
let scqLastWrong = null;  // option id marked wrong on a non-final attempt (gates re-check)

/* Select an option (single selection) */
function scqSelect(id) {
  if (scqAnswered) return;
  dismissRetryPopup('scq-popup', scqDone);
  scqSelected = id;
  // If a wrong mark is showing from a previous attempt, clear it for a fresh check.
  if (scqAttempts > 0) {
    document.querySelectorAll('#s1 .scq-opt').forEach(o => o.classList.remove('wrong', 'correct'));
  }
  document.querySelectorAll('#s1 .scq-opt').forEach(o => {
    const sel = o.dataset.id === id;
    o.classList.toggle('selected', sel);
    o.setAttribute('aria-checked', sel ? 'true' : 'false');
  });
  scqUpdateBar();
}

/* Check / advance — the main bottom-bar button */
function scqCheck() {
  if (scqAnswered) { advanceScreen(); return; }   // label is "שנמשיך?" → go next
  if (!scqSelected) return;

  scqAttempts++;
  const isCorrect = scqSelected === SCQ.correctId;
  { const el = document.querySelector('#s1 .scq-opt[data-id="' + scqSelected + '"]');
    xapiAnswered('002', 'q1', isCorrect, isCorrect || scqAttempts >= SCQ.maxAttempts, xapiAnswerText(el)); }

  if (isCorrect) {
    scqMark(SCQ.correctId, 'correct');
    scqShowPopup('correct');
    scqFinish();
  } else if (scqAttempts >= SCQ.maxAttempts) {
    // Second wrong → reveal correct (green) + mark chosen wrong (red)
    scqMark(SCQ.correctId, 'correct');
    scqMark(scqSelected, 'wrong');
    scqShowPopup('wrong2');
    scqFinish();
  } else {
    // First wrong → generic retry popup, mark chosen wrong, correct NOT revealed.
    scqMark(scqSelected, 'wrong');
    /* Re-check stays disabled until the learner picks a DIFFERENT option */
    scqLastWrong = scqSelected;
    const chk = document.getElementById('scq-check');
    if (chk) chk.disabled = true;
    scqShowPopup('retry');
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

function scqMark(id, cls) {
  const opt = document.querySelector('#s1 .scq-opt[data-id="' + id + '"]');
  if (!opt) return;
  opt.classList.remove('selected');
  opt.classList.add(cls);
}

const SCQ_POPUP_CFG = {
  retry: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.'],
    body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
  },
  correct: {
    bg: '#edf8ed',
    title: ['صحيح! لكن‎...'],
    body: [
      'قد تخدعنا أعيننا‎ أحيانًا.',
      'لكي نعرف كمية السائل الموجودة فعلًا، علينا قياسها بأداة قياس خاصة وبطريقة منظمة‎.',
      'تعالوا نتعلم كيف نقوم بذلك‎.'
    ],
    img: 'assets/img/DrinksAndMeasure.png'
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.', 'الإجابة الصحيحة معلَّمة.'],
    body: [
      'قد تخدعنا أعيننا‎ أحيانًا.',
      'لكي نعرف كمية السائل الموجودة فعلًا، علينا قياسها بأداة قياس خاصة وبطريقة منظمة‎.',
      'تعالوا نتعلم كيف نقوم بذلك‎.'
    ],
    img: 'assets/img/DrinksAndMeasure.png'
  }
};

function scqShowPopup(type) {
  const popup = document.getElementById('scq-popup');
  if (!popup) return;
  const cfg = SCQ_POPUP_CFG[type];
  popup.style.background = cfg.bg;
  resetPopupPosition(popup);
  const titleEl = document.getElementById('scq-popup-title');
  if (titleEl) titleEl.innerHTML = cfg.title.map(t => '<p>' + t + '</p>').join('');
  const bodyEl = document.getElementById('scq-popup-body');
  if (bodyEl) {
    bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('') +
      (cfg.img ? '<img class="scq-popup-img" src="' + cfg.img + '" alt="">' : '');
  }
  popup.classList.remove('hidden');
}


/* Lock the question after it is resolved */
function scqFinish() {
  scqAnswered = true;
  scqDone = true;
  document.querySelectorAll('#s1 .scq-opt').forEach(o => { o.disabled = true; });
  const chk = document.getElementById('scq-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('scq-hint');
  if (hint) hint.style.visibility = 'hidden';
}

/* Enable/disable bar buttons based on current (unanswered) state */
function scqUpdateBar() {
  if (scqAnswered) return;
  const chk = document.getElementById('scq-check');
  if (chk) chk.disabled = !scqSelected || scqSelected === scqLastWrong;
}

/* Hint modal */
function scqOpenHint() {
  if (scqAnswered) return;
  /* xAPI requested.1 — after the guard, right before the reveal; this function only opens. */
  xapiRequestedHint('002', 'q1');
  document.getElementById('scq-hint-overlay')?.classList.remove('hidden');
}
function scqCloseHint() {
  const overlay = document.getElementById('scq-hint-overlay');
  if (!overlay || overlay.classList.contains('hidden')) return;
  overlay.classList.add('hidden');
}
function scqCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 'scq-hint-overlay') scqCloseHint();
}

/* ── Companion character talk video (ported from the reference S18 stage) ──
   Resolves the video from the selected character on every call, so going
   back and changing the selection updates this screen too. Only reloads
   the source when it actually changed (avoids restarting on re-entry). */
function s1ShowTalkVideo() {
  const vid = document.getElementById('s1-talk-video');
  if (!vid) return;
  const char = window.lomdaState.selectedCharacter || 'character-1';
  const src  = S1_CHARACTER_VIDEOS[char] || S1_CHARACTER_VIDEOS['character-1'];
  if (!vid.src || !vid.src.endsWith(src)) {
    vid.src = src;
    vid.load();
  }
  vid.play().catch(() => {});
  freezeVideoOnEnd(vid);
}

/* Restore the clean initial state (used on first entry / unfinished return) */
function scqResetInitial() {
  scqSelected = null;
  scqAttempts = 0;
  scqAnswered = false;
  scqLastWrong = null;
  document.querySelectorAll('#s1 .scq-opt').forEach(o => {
    o.classList.remove('selected', 'correct', 'wrong');
    o.disabled = false;
    o.setAttribute('aria-checked', 'false');
  });
  document.getElementById('scq-popup')?.classList.add('hidden');
  const chk = document.getElementById('scq-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('scq-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = ''; }
}

/* ── Feedback popup drag (mirrors the shared TwoOptionSelection engine's
   pointer-based pattern; resets to its CSS default position on every open,
   per the global "Feedback popup system" component) ── */
let scqPopupDragging = false;
let scqPopupOffX = 0, scqPopupOffY = 0;

function scqPopupMouseDown(e) {
  scqPopupDragging = true;
  const popup = document.getElementById('scq-popup');
  const app   = document.getElementById('app');
  if (!popup || !app) return;
  const appLeft = parseFloat(app.style.left)  || 0;
  const appTop  = parseFloat(app.style.top)   || 0;
  const scaleM  = app.style.transform.match(/scale\(([^)]+)\)/);
  const scale   = scaleM ? parseFloat(scaleM[1]) : 1;
  const canvasX = (e.clientX - appLeft) / scale;
  const canvasY = (e.clientY - appTop)  / scale;
  const topPx = parseFloat(popup.style.top);
  const popupTop = isNaN(topPx) ? popup.offsetTop : topPx;
  popup.style.top    = popupTop + 'px';
  popup.style.bottom = 'auto';
  scqPopupOffX  = canvasX - (parseFloat(popup.style.left) || 2);
  scqPopupOffY  = canvasY - popupTop;
  e.preventDefault();
}

window.addEventListener('pointermove', e => {
  if (!scqPopupDragging && !s3ddqPopupDragging && !s5qPopupDragging &&
      !s8qPopupDragging && !s10qPopupDragging && !s12qPopupDragging && !s12ddqPopupDragging &&
      !s14qPopupDragging) return;
  if (e.buttons === 0) { endPopupDrags(); return; }   /* release was missed: never follow a free cursor */
  const app = document.getElementById('app');
  if (!app) return;
  const appLeft = parseFloat(app.style.left)  || 0;
  const appTop  = parseFloat(app.style.top)   || 0;
  const scaleM  = app.style.transform.match(/scale\(([^)]+)\)/);
  const scale   = scaleM ? parseFloat(scaleM[1]) : 1;

  if (scqPopupDragging) {
    const popup = document.getElementById('scq-popup');
    if (popup) {
      const newX = (e.clientX - appLeft) / scale - scqPopupOffX;
      const newY = (e.clientY - appTop)  / scale - scqPopupOffY;
      popup.style.left = Math.max(0, Math.min(newX, app.offsetWidth - popup.offsetWidth))  + 'px';
      popup.style.top  = Math.max(0, Math.min(newY, app.offsetHeight - 74 - popup.offsetHeight)) + 'px';
    }
  }

  if (s3ddqPopupDragging) {
    const popup = document.getElementById('s3ddq-popup');
    if (popup) {
      const newX = (e.clientX - appLeft) / scale - s3ddqPopupOffX;
      const newY = (e.clientY - appTop)  / scale - s3ddqPopupOffY;
      popup.style.left = Math.max(0, Math.min(newX, app.offsetWidth - popup.offsetWidth))  + 'px';
      popup.style.top  = Math.max(0, Math.min(newY, app.offsetHeight - 74 - popup.offsetHeight)) + 'px';
    }
  }

  if (s5qPopupDragging) {
    const popup = document.getElementById('s5q-popup');
    if (popup) {
      const newX = (e.clientX - appLeft) / scale - s5qPopupOffX;
      const newY = (e.clientY - appTop)  / scale - s5qPopupOffY;
      popup.style.left = Math.max(0, Math.min(newX, app.offsetWidth - popup.offsetWidth))  + 'px';
      popup.style.top  = Math.max(0, Math.min(newY, app.offsetHeight - 74 - popup.offsetHeight)) + 'px';
    }
  }

  if (s8qPopupDragging) {
    const popup = document.getElementById('s8q-popup');
    if (popup) {
      const newX = (e.clientX - appLeft) / scale - s8qPopupOffX;
      const newY = (e.clientY - appTop)  / scale - s8qPopupOffY;
      popup.style.left = Math.max(0, Math.min(newX, app.offsetWidth - popup.offsetWidth))  + 'px';
      popup.style.top  = Math.max(0, Math.min(newY, app.offsetHeight - 74 - popup.offsetHeight)) + 'px';
    }
  }

  if (s10qPopupDragging) {
    const popup = document.getElementById('s10q-popup');
    if (popup) {
      const newX = (e.clientX - appLeft) / scale - s10qPopupOffX;
      const newY = (e.clientY - appTop)  / scale - s10qPopupOffY;
      popup.style.left = Math.max(0, Math.min(newX, app.offsetWidth - popup.offsetWidth))  + 'px';
      popup.style.top  = Math.max(0, Math.min(newY, app.offsetHeight - 74 - popup.offsetHeight)) + 'px';
    }
  }

  if (s12qPopupDragging) {
    const popup = document.getElementById('s12q-popup');
    if (popup) {
      const newX = (e.clientX - appLeft) / scale - s12qPopupOffX;
      const newY = (e.clientY - appTop)  / scale - s12qPopupOffY;
      popup.style.left = Math.max(0, Math.min(newX, app.offsetWidth - popup.offsetWidth))  + 'px';
      popup.style.top  = Math.max(0, Math.min(newY, app.offsetHeight - 74 - popup.offsetHeight)) + 'px';
    }
  }

  if (s12ddqPopupDragging) {
    const popup = document.getElementById('s12ddq-popup');
    if (popup) {
      const newX = (e.clientX - appLeft) / scale - s12ddqPopupOffX;
      const newY = (e.clientY - appTop)  / scale - s12ddqPopupOffY;
      popup.style.left = Math.max(0, Math.min(newX, app.offsetWidth - popup.offsetWidth))  + 'px';
      popup.style.top  = Math.max(0, Math.min(newY, app.offsetHeight - 74 - popup.offsetHeight)) + 'px';
    }
  }

  if (s14qPopupDragging) {
    const popup = document.getElementById('s14q-popup');
    if (popup) {
      const newX = (e.clientX - appLeft) / scale - s14qPopupOffX;
      const newY = (e.clientY - appTop)  / scale - s14qPopupOffY;
      popup.style.left = Math.max(0, Math.min(newX, app.offsetWidth - popup.offsetWidth))  + 'px';
      popup.style.top  = Math.max(0, Math.min(newY, app.offsetHeight - 74 - popup.offsetHeight)) + 'px';
    }
  }
});

function endPopupDrags() { scqPopupDragging = false; s3ddqPopupDragging = false; s5qPopupDragging = false; s8qPopupDragging = false; s10qPopupDragging = false; s12qPopupDragging = false; s12ddqPopupDragging = false; s14qPopupDragging = false; }
window.addEventListener('pointerup',     endPopupDrags);
window.addEventListener('pointercancel', endPopupDrags);


/* ═══════════════════════════════════════════════════════════
   TEMPLATE — FlipCardsReveal (Screen 03)
   Cards flip back and forth freely (producer notes: "ניתנים
   להיפוך חזרה") — frcFlipped tracks the CURRENT visual state per
   card (toggles both ways); frcRevealed tracks "seen at least
   once" and only ever turns true, driving the Continue unlock and
   the footnote reveal (both fire once, when all 3 have been seen).
   ═══════════════════════════════════════════════════════════ */
let frcRevealed = [false, false, false];
let frcFlipped  = [false, false, false];
let frcDone     = false;

function frcFlip(cardEl) {
  const idx = parseInt(cardEl.dataset.index, 10);
  frcFlipped[idx] = !frcFlipped[idx];
  if (frcFlipped[idx]) frcRevealed[idx] = true;

  cardEl.classList.toggle('is-flipped', frcFlipped[idx]);
  cardEl.setAttribute('aria-expanded', frcFlipped[idx] ? 'true' : 'false');

  // aria-label = card name (data-base-label) + ". " + the state hint. All
  // three texts live in index.html (hints on the .option-cards group), so
  // translating them never touches this code.
  const group = cardEl.closest('.option-cards');
  const hint  = frcFlipped[idx] ? group.dataset.unflipHint : group.dataset.flipHint;
  cardEl.setAttribute('aria-label', cardEl.dataset.baseLabel + '. ' + hint);

  const front = cardEl.querySelector('.frc-card-front');
  const back  = cardEl.querySelector('.frc-card-back');
  if (front) front.setAttribute('aria-hidden', frcFlipped[idx] ? 'true' : 'false');
  if (back)  back.setAttribute('aria-hidden', frcFlipped[idx] ? 'false' : 'true');

  frcCheckUnlock();
}

function frcCheckUnlock() {
  if (frcRevealed.every(Boolean)) {
    const btn = document.getElementById('s2-continue');
    if (btn) btn.disabled = false;
    // visibility-based reveal — the footnote already occupies its space,
    // so nothing above it moves when it appears.
    document.getElementById('s2-footnote')?.classList.remove('invisible');
    frcDone = true;
    try { flushResumeSave(); } catch (e) {}   // a gate is state: saved the moment it is earned (rule 11)
  }
}

function advanceFromS2() {
  goTo(3);
}

function frcEnter() {
  // Restore visual state (cards can flip back/forth across navigation)
  document.querySelectorAll('#s2 .frc-card').forEach((cardEl, idx) => {
    cardEl.classList.toggle('is-flipped', frcFlipped[idx]);
    cardEl.setAttribute('aria-expanded', frcFlipped[idx] ? 'true' : 'false');
    const front = cardEl.querySelector('.frc-card-front');
    const back  = cardEl.querySelector('.frc-card-back');
    if (front) front.setAttribute('aria-hidden', frcFlipped[idx] ? 'true' : 'false');
    if (back)  back.setAttribute('aria-hidden', frcFlipped[idx] ? 'false' : 'true');
  });
  const btn = document.getElementById('s2-continue');
  if (btn) btn.disabled = !frcDone;
  document.getElementById('s2-footnote')?.classList.toggle('invisible', !frcDone);
}


/* ═══════════════════════════════════════════════════════════
   TEMPLATE — DragAndDropQuestion · Image Top variant (Screen 04)
   Config-driven, ported from the reference S16 implementation.
   Two attempts (deck general convention); per-zone ✓/✕ feedback
   icons on check; hint available from the start (user decision);
   pointer-based DnD (touch-compatible).
   ═══════════════════════════════════════════════════════════ */
const S3DDQ = {
  // Answer key — producer notes (notesSlide6):
  //   פיפטה  → "במעבדה צריך להוסיף בדיוק 5 מ״ל תמיסת צבע לנוזל שבמבחנה."
  //   מזרק   → "צריך לתת לגור חתולים 5 מ״ל תחליף חלב ישירות לפה."
  //   כפית   → "ילד צריך לקחת מנה של 5 מ״ל סירופ בעזרת הכלי המצורף לבקבוק."
  correctMap: {
    'target-s3-pipette': 'drag-s3-lab',
    'target-s3-syringe': 'drag-s3-kitten',
    'target-s3-spoon':   'drag-s3-child'
  },
  revealMap: {
    'target-s3-pipette': 'drag-s3-lab',
    'target-s3-syringe': 'drag-s3-kitten',
    'target-s3-spoon':   'drag-s3-child'
  },
  maxAttempts: 2,
  feedbackText: {
    retry: {
      bg: '#ffdbdc', titleColor: '#303030',
      title: ['الإجابة غير صحيحة.'],
      body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
    },
    correct: {
      bg: '#edf8ed', titleColor: '#222222',
      title: ['صحيح‎!'],
      body: [
        'في جميع الحالات نحتاج إلى نفس الكمية، لكن هدف الاستخدام مختلف‎:',
        '<span class="fb-bullet">• <strong>ماصّة</strong> للقياس الدقيق في المختبر‎.</span>',
        '<span class="fb-bullet">• <strong>محقنة</strong> لسحب كمية محددة من السائل وإخراجها باستخدام المكبس‎.</span>',
        '<span class="fb-bullet">• <strong>ملعقة قياس طبية</strong> لقياس جرعة شراب دواء ثابتة.</span>',
        '<span class="fb-indent">عند اختيار الأداة، نأخذ بالحسبان الكمية وهدف الاستخدام أيضًا‎.</span>'
      ]
    },
    wrong2: {
      bg: '#ffdbdc', titleColor: '#303030',
      title: ['الإجابة غير صحيحة.', 'الإجابة الصحيحة تَظهَر الآن.'],
      body: [
        'في جميع الحالات نحتاج إلى نفس الكمية، لكن هدف الاستخدام مختلف‎:',
        '<span class="fb-bullet">• <strong>ماصّة</strong> للقياس الدقيق في المختبر‎.</span>',
        '<span class="fb-bullet">• <strong>محقنة</strong> لسحب كمية محددة من السائل وإخراجها باستخدام المكبس‎.</span>',
        '<span class="fb-bullet">• <strong>ملعقة قياس طبية</strong> لقياس جرعة شراب دواء ثابتة.</span>',
        '<span class="fb-indent">عند اختيار الأداة، نأخذ بالحسبان الكمية وهدف الاستخدام أيضًا‎.</span>'
      ],
      /* One outcome, two views -- see part 06 S3's wrong2 for the full
         pattern. The answer view's copy is fixed and canonical, unlike the
         base's own pedagogical explanation. */
      action: { label: 'الانتقال إلى إجابتي', view: 'answer' },
      answerView: {
        title: ['الإجابة غير صحيحة.'],
        body:  ['يمكن مشاهدة الحل الصحيح مرة أخرى‎.'],
        action: { label: 'الإجابة الصحيحة', view: 'solution' }
      }
    }
  }
};

/* Draggable text labels — used when rendering the placed card in a target. */
const s3ddqTexts = {
  'drag-s3-lab':    'في المختبر يجب إضافة 5 ملل بالضبط من محلول الصبغة إلى السائل الموجود في أنبوب الاختبار‎.',
  'drag-s3-child':  'يحتاج طفل إلى تناول جرعة مقدارها 5 ملل من شراب الدواء باستخدام الأداة المرفقة للعبوة.',
  'drag-s3-kitten': 'يجب إعطاء قطّ صغير 5 ملل من بديل الحليب مباشرةً في فمه‎.'
};

const s3ddqPlacement = {
  'drag-s3-lab':    'source',
  'drag-s3-child':  'source',
  'drag-s3-kitten': 'source'
};
let s3ddqChecked      = false;
let s3ddqDone         = false;
let s3ddqAttempts     = 0;
let s3ddqShowFeedback = false;
/* JSON snapshot of s3ddqPlacement as of the last non-final wrong attempt —
   gates the check button disabled until the placement actually changes. */
let s3ddqLastWrongSnapshot = null;
let s3ddqDnd          = null;   // pointer-DnD controller
let s3ddqPopupDragging = false;
let s3ddqPopupOffX = 0, s3ddqPopupOffY = 0;

/* ── Final-attempt solution/answer toggle (see part 06 S3 for the full
   contract) -- the snapshot is a shallow copy of the WHOLE placement map,
   since the toggle governs every target together, not one at a time.
   s3ddqAnswer  copy of s3ddqPlacement at the moment of final-wrong submit,
               taken before s3ddqRevealCorrect() mutates the live map. null
               => not toggleable.
   s3ddqView   'solution' | 'answer'. Runtime only -- reset in s3ddqEnter(). */
let s3ddqAnswer = null;
let s3ddqView   = 'solution';

/* ── Render — single state object → DOM (data-driven, no hardcoded ids) ── */
function s3ddqRender() {
  // Source slots: ghost when placed
  Object.keys(s3ddqPlacement).forEach(id => {
    const card = document.getElementById(id);
    if (!card) return;
    const inSource = (s3ddqPlacement[id] === 'source');
    card.classList.toggle('ghost', !inSource);
  });

  const targetIds = [...new Set([
    ...Object.keys(S3DDQ.correctMap),
    ...Object.values(s3ddqPlacement).filter(v => v !== 'source')
  ])];

  targetIds.forEach(targetId => {
    const zone = document.getElementById(targetId);
    if (!zone) return;
    zone.querySelector('.s3ddq-placed-card')?.remove();

    const dragId = Object.keys(s3ddqPlacement)
      .find(k => s3ddqPlacement[k] === targetId) || null;

    if (dragId) {
      const card = document.createElement('div');
      card.className = 's3ddq-placed-card';
      const txt = document.createElement('span');
      txt.className = 's3ddq-card-text';
      txt.textContent = s3ddqTexts[dragId];
      card.appendChild(txt);
      if (!s3ddqChecked && s3ddqDnd) s3ddqDnd.attachSource(card, dragId);
      zone.appendChild(card);
      zone.classList.add('occupied');
    } else {
      zone.classList.remove('occupied', 'drag-over');
    }
  });

  s3ddqUpdateCheck();
}

/* ── Check gate: all required targets filled ─────────────── */
function s3ddqAllFilled() {
  return Object.keys(S3DDQ.correctMap).every(tId =>
    Object.keys(s3ddqPlacement).some(dId => s3ddqPlacement[dId] === tId)
  );
}

function s3ddqUpdateCheck() {
  if (s3ddqChecked) return;
  const btn = document.getElementById('s3ddq-check');
  /* Retry gate: re-enable only once the placement genuinely DIFFERS from
     the one just marked wrong — a live comparison, not a one-shot flag. */
  if (btn) {
    btn.disabled = !s3ddqAllFilled() ||
      JSON.stringify(s3ddqPlacement) === s3ddqLastWrongSnapshot;
  }
}

/* ── Pointer DnD setup — runs once, idempotent ───────────── */
function s3ddqInitDnd() {
  if (s3ddqDnd) return;
  s3ddqDnd = createPointerDnd({
    canDrag: (dragId, elem) => {
      if (s3ddqChecked) return false;
      if (elem.id === dragId) return s3ddqPlacement[dragId] === 'source';
      return true; // placed card
    },
    onPick: (dragId) => {
      // Picking up a card is the start of correcting the answer —
      // dismiss a visible retry popup alongside the drag (same click).
      dismissRetryPopup('s3ddq-popup', s3ddqDone);
      s3ddqClearAttemptFeedback();
      if (s3ddqPlacement[dragId] !== 'source') {
        s3ddqPlacement[dragId] = 'source';
        s3ddqRender();
      }
      document.getElementById(dragId)?.classList.add('dragging');
    },
    onDrop: (dragId, targetId) => {
      const evicted = Object.keys(s3ddqPlacement).find(k => s3ddqPlacement[k] === targetId);
      if (evicted && evicted !== dragId) s3ddqPlacement[evicted] = 'source';
      s3ddqPlacement[dragId] = targetId;
      s3ddqRender();
    },
    onCancel: () => {
      s3ddqRender();
    },
  });
  Object.keys(s3ddqPlacement).forEach(id => {
    const el = document.getElementById(id);
    if (el) s3ddqDnd.attachSource(el, id);
  });
  document.querySelectorAll('#s3 .s3ddq-target').forEach(el => {
    s3ddqDnd.attachTarget(el, el.id);
  });
}

/* ── Check answers ───────────────────────────────────────── */
function s3ddqCheck() {
  if (s3ddqDone) { advanceScreen(); return; }   // label is "שנמשיך?" → go next
  if (!s3ddqAllFilled()) return;

  s3ddqClearAttemptFeedback();
  s3ddqAttempts++;

  const allCorrect = Object.keys(S3DDQ.correctMap).every(
    tId => s3ddqPlacement[S3DDQ.correctMap[tId]] === tId
  );
  /* xAPI 004 q1 (matching), after allCorrect is final. Answer = each tool target and the case
     card placed on it (xapiZoneAnswer's id template does not fit this board). */
  xapiAnswered('004', 'q1', allCorrect, allCorrect || s3ddqAttempts >= S3DDQ.maxAttempts,
    Object.keys(S3DDQ.correctMap).map(tId => {
      const card = Object.keys(s3ddqPlacement).find(c => s3ddqPlacement[c] === tId);
      return tId.replace('target-s3-', '') + ': ' + (card ? s3ddqTexts[card] : '—');
    }).join(' | '));

  if (allCorrect) {
    s3ddqChecked = true;
    s3ddqDone    = true;
    s3ddqRender();
    s3ddqLock();
    s3ddqShowFeedbackIcons(true);
    s3ddqShowPopup('correct');
    s3ddqFinish();
  } else if (s3ddqAttempts >= S3DDQ.maxAttempts) {
    s3ddqChecked = true;
    s3ddqDone    = true;
    /* Capture the learner's final placement BEFORE the reveal overwrites it --
       this is the only place it still exists. Then resolve straight into the
       solution view; the question is complete at this moment. */
    s3ddqAnswer = Object.assign({}, s3ddqPlacement);
    s3ddqView   = 'solution';
    s3ddqApplyView();
    s3ddqFinish();
  } else {
    // First wrong attempt — per-zone feedback icons, retry allowed.
    // The hint button is already visible (available from the start).
    s3ddqShowFeedback = true;
    s3ddqShowFeedbackIcons(false);
    /* Re-check stays disabled until the placement actually changes */
    s3ddqLastWrongSnapshot = JSON.stringify(s3ddqPlacement);
    s3ddqUpdateCheck();
    s3ddqShowPopup('retry');
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

/* ── Lock dragging after final check ─────────────────────── */
function s3ddqLock() {
  Object.keys(s3ddqPlacement).forEach(id => {
    const card = document.getElementById(id);
    if (!card) return;
    card.draggable = false;
    card.classList.add('locked');
  });
  document.querySelectorAll('#s3 .s3ddq-placed-card').forEach(c => {
    c.draggable = false;
  });
}

/* ── Reveal correct answer (final wrong) ─────────────────── */
function s3ddqRevealCorrect() {
  Object.keys(S3DDQ.revealMap).forEach(tId => {
    s3ddqPlacement[S3DDQ.revealMap[tId]] = tId;
  });
  const assigned = new Set(Object.values(S3DDQ.revealMap));
  Object.keys(s3ddqPlacement).forEach(id => {
    if (!assigned.has(id)) s3ddqPlacement[id] = 'source';
  });
  s3ddqRender();
}

/* ── Finish — completed state: primary button becomes שנמשיך? ── */
function s3ddqFinish() {
  const btn = document.getElementById('s3ddq-check');
  if (btn) { btn.textContent = 'متابعة'; btn.disabled = false; }
  const hint = document.getElementById('s3ddq-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s3ddq-hint-overlay')?.classList.add('hidden');
}

/* ── Hint overlay (available from the start) ─────────────── */
function s3ddqOpenHint() {
  if (s3ddqDone) return;
  /* xAPI requested.1 — after the guard, right before the reveal; this function only opens. */
  xapiRequestedHint('004', 'q1');
  document.getElementById('s3ddq-hint-overlay')?.classList.remove('hidden');
}
function s3ddqCloseHint() {
  document.getElementById('s3ddq-hint-overlay')?.classList.add('hidden');
}
function s3ddqCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 's3ddq-hint-overlay') s3ddqCloseHint();
}

/* Exact Figma vectors (white fill, eSbp4bKHgBky0rakDb8l9N node 1027:26021)
   for the per-zone feedback badges below — shared by S3/S12 drag-drop. */
const DDQ_BADGE_CHECK_SVG =
  '<svg width="14" height="12" viewBox="0 0 14 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M4.52036 12C4.12296 12.0002 3.74183 11.8126 3.46106 11.4787L0.258452 7.67744C-0.0861507 7.26814 -0.0861507 6.60467 0.258452 6.19536C0.603165 5.78619 1.16194 5.78619 1.50666 6.19536L4.52036 9.77374L12.4933 0.306878C12.8381 -0.102293 13.3968 -0.102293 13.7415 0.306878C14.0862 0.716179 14.0862 1.37966 13.7415 1.78896L5.57966 11.4787C5.29889 11.8126 4.91776 12.0002 4.52036 12Z" fill="#fff"/>' +
  '</svg>';
const DDQ_BADGE_WRONG_SVG =
  '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M13.6743 0.325691C13.4657 0.117151 13.1828 0 12.8879 0C12.5929 0 12.31 0.117151 12.1014 0.325691L7 5.42709L1.8986 0.325691C1.69 0.117151 1.40711 0 1.11215 0C0.817183 0 0.534294 0.117151 0.325691 0.325691C0.117151 0.534294 0 0.817183 0 1.11215C0 1.40711 0.117151 1.69 0.325691 1.8986L5.42709 7L0.325691 12.1014C0.117151 12.31 0 12.5929 0 12.8879C0 13.1828 0.117151 13.4657 0.325691 13.6743C0.534294 13.8829 0.817183 14 1.11215 14C1.40711 14 1.69 13.8829 1.8986 13.6743L7 8.57291L12.1014 13.6743C12.31 13.8829 12.5929 14 12.8879 14C13.1828 14 13.4657 13.8829 13.6743 13.6743C13.8829 13.4657 14 13.1828 14 12.8879C14 12.5929 13.8829 12.31 13.6743 12.1014L8.57291 7L13.6743 1.8986C13.8829 1.69 14 1.40711 14 1.11215C14 0.817183 13.8829 0.534294 13.6743 0.325691Z" fill="#fff"/>' +
  '</svg>';

/* ── Per-zone feedback icons (exact Figma vector inside each placed card) ── */
function s3ddqShowFeedbackIcons(allGreen) {
  Object.keys(S3DDQ.correctMap).forEach(tId => {
    const zone = document.getElementById(tId);
    if (!zone) return;
    const isCorrect = allGreen ||
      (s3ddqPlacement[S3DDQ.correctMap[tId]] === tId);
    const placedCard = zone.querySelector('.s3ddq-placed-card');
    if (placedCard) {
      placedCard.querySelector('.s3ddq-placed-ficon')?.remove();
      const iconEl = document.createElement('div');
      iconEl.className = 's3ddq-placed-ficon ' +
        (isCorrect ? 's3ddq-placed-ficon--correct' : 's3ddq-placed-ficon--wrong');
      iconEl.innerHTML = isCorrect ? DDQ_BADGE_CHECK_SVG : DDQ_BADGE_WRONG_SVG;
      placedCard.appendChild(iconEl);
    }
    zone.classList.remove('s3ddq-correct', 's3ddq-wrong');
    zone.classList.add(isCorrect ? 's3ddq-correct' : 's3ddq-wrong');
  });
}

function s3ddqClearAttemptFeedback() {
  if (!s3ddqShowFeedback) return;
  s3ddqShowFeedback = false;
  Object.keys(S3DDQ.correctMap).forEach(tId => {
    const zone = document.getElementById(tId);
    if (!zone) return;
    zone.querySelector('.s3ddq-placed-ficon')?.remove();
    zone.classList.remove('s3ddq-correct', 's3ddq-wrong');
  });
}

/* Single owner of the resolved-wrong state -- see part 06 S3's
   s3vApplyView(). Idempotent; never re-runs validation. */
function s3ddqApplyView() {
  if (s3ddqAnswer === null) return;
  if (s3ddqView === 'answer') {
    Object.assign(s3ddqPlacement, s3ddqAnswer);
    s3ddqRender();
    s3ddqShowFeedbackIcons(false);   // per-target correctness against the
                                     // learner's own real placement
  } else {
    s3ddqRevealCorrect();           // unchanged; already mutates + renders
    s3ddqShowFeedbackIcons(true);
  }
  s3ddqLock();                      // re-created placed cards need re-locking
  s3ddqShowPopup('wrong2', s3ddqView);
}

/* Pure view switch -- see part 06 S3's s3vToggleView(). Never routes through
   s3ddqCheck(), never touches s3ddqAttempts or the done lock. */
function s3ddqToggleView() {
  if (s3ddqAnswer === null) return;
  s3ddqView = (s3ddqView === 'solution') ? 'answer' : 'solution';
  s3ddqApplyView();
}

/* ── Feedback popup ──────────────────────────────────────── */
function s3ddqShowPopup(type, view) {
  const popup = document.getElementById('s3ddq-popup');
  if (!popup) return;
  const base = S3DDQ.feedbackText[type];
  const cfg  = (view === 'answer' && base.answerView)
             ? Object.assign({}, base, base.answerView)
             : base;
  popup.style.background = cfg.bg;
  /* Reset position only on a genuine open -- see part 06 S3's s3vShowPopup(). */
  if (popup.classList.contains('hidden')) resetPopupPosition(popup);
  const titleEl = document.getElementById('s3ddq-popup-title');
  if (titleEl) {
    titleEl.innerHTML = cfg.title.map(t => '<p>' + t + '</p>').join('');
    titleEl.style.color = cfg.titleColor;
  }
  const bodyEl = document.getElementById('s3ddq-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  renderPopupAction('s3ddq-popup', cfg.action, s3ddqToggleView);
  popup.classList.remove('hidden');
  clampPopup(popup);
}


function s3ddqPopupMouseDown(e) {
  /* The action button is a control, not a drag handle. Without this guard its
     pointerdown would start a drag AND flip the popup from bottom- to
     top-anchoring. Ported verbatim from part 06's Foundation. */
  if (e.target && e.target.closest && e.target.closest('.popup-action')) return;
  s3ddqPopupDragging = true;
  const popup = document.getElementById('s3ddq-popup');
  const app   = document.getElementById('app');
  if (!popup || !app) return;
  const appLeft = parseFloat(app.style.left) || 0;
  const appTop  = parseFloat(app.style.top)  || 0;
  const scaleM  = app.style.transform.match(/scale\(([^)]+)\)/);
  const scale   = scaleM ? parseFloat(scaleM[1]) : 1;
  const canvasX = (e.clientX - appLeft) / scale;
  const canvasY = (e.clientY - appTop)  / scale;
  const topPx = parseFloat(popup.style.top);
  const popupTop = isNaN(topPx) ? popup.offsetTop : topPx;
  popup.style.top    = popupTop + 'px';
  popup.style.bottom = 'auto';
  s3ddqPopupOffX = canvasX - (parseFloat(popup.style.left) || 2);
  s3ddqPopupOffY = canvasY - popupTop;
  e.preventDefault();
}

/* ── Enter / reset screen state ──────────────────────────── */
function s3ddqEnter() {
  s3ddqInitDnd();
  if (s3ddqDone) {
    /* A resolved screen always comes back on the SOLUTION view -- see part 06
       S3's s3vEnter() for the full rationale. s3ddqApplyView() renders,
       locks, sets the feedback icons and reopens the popup with matching
       content in one call. */
    s3ddqView = 'solution';
    s3ddqApplyView();
    const btn = document.getElementById('s3ddq-check');
    if (btn) { btn.textContent = 'متابعة'; btn.disabled = false; }
    const hint = document.getElementById('s3ddq-hint');
    if (hint) hint.style.visibility = 'hidden';
    return;
  }

  // Full reset for fresh entry
  s3ddqChecked      = false;
  s3ddqAttempts     = 0;
  s3ddqShowFeedback = false;
  s3ddqLastWrongSnapshot = null;
  s3ddqAnswer       = null;
  s3ddqView         = 'solution';
  Object.keys(s3ddqPlacement).forEach(id => { s3ddqPlacement[id] = 'source'; });

  Object.keys(S3DDQ.correctMap).forEach(tId => {
    const zone = document.getElementById(tId);
    if (!zone) return;
    zone.classList.remove('s3ddq-correct', 's3ddq-wrong', 'occupied', 'drag-over');
    zone.querySelector('.s3ddq-placed-card')?.remove();
  });

  Object.keys(s3ddqPlacement).forEach(id => {
    const card = document.getElementById(id);
    if (!card) return;
    card.classList.remove('ghost', 'dragging', 'locked');
  });

  const btn = document.getElementById('s3ddq-check');
  if (btn) { btn.textContent = 'هل إجابتي صحيحة؟'; btn.disabled = true; }
  const hint = document.getElementById('s3ddq-hint');
  if (hint) hint.style.visibility = '';

  s3ddqRender();
}


/* ═══════════════════════════════════════════════════════════
   TEMPLATE — FlipCardsReveal (Screen 05, second instance)
   Namespaced s4frc* per the template's multi-instance rule.
   Same behavior as S2: cards flip both ways; s4frcRevealed only
   ever turns true, driving Continue + the footnote reveal.
   ═══════════════════════════════════════════════════════════ */
let s4frcRevealed = [false, false];
let s4frcFlipped  = [false, false];
let s4frcDone     = false;

function s4frcFlip(cardEl) {
  const idx = parseInt(cardEl.dataset.index, 10);
  s4frcFlipped[idx] = !s4frcFlipped[idx];
  if (s4frcFlipped[idx]) s4frcRevealed[idx] = true;

  cardEl.classList.toggle('is-flipped', s4frcFlipped[idx]);
  cardEl.setAttribute('aria-expanded', s4frcFlipped[idx] ? 'true' : 'false');

  // aria-label = card name (data-base-label) + ". " + the state hint. All
  // three texts live in index.html (hints on the .option-cards group), so
  // translating them never touches this code.
  const group = cardEl.closest('.option-cards');
  const hint  = s4frcFlipped[idx] ? group.dataset.unflipHint : group.dataset.flipHint;
  cardEl.setAttribute('aria-label', cardEl.dataset.baseLabel + '. ' + hint);

  const front = cardEl.querySelector('.frc-card-front');
  const back  = cardEl.querySelector('.frc-card-back');
  if (front) front.setAttribute('aria-hidden', s4frcFlipped[idx] ? 'true' : 'false');
  if (back)  back.setAttribute('aria-hidden', s4frcFlipped[idx] ? 'false' : 'true');

  s4frcCheckUnlock();
}

function s4frcCheckUnlock() {
  if (s4frcRevealed.every(Boolean)) {
    const btn = document.getElementById('s4-continue');
    if (btn) btn.disabled = false;
    document.getElementById('s4-footnote')?.classList.remove('invisible');
    s4frcDone = true;
    try { flushResumeSave(); } catch (e) {}   // a gate is state: saved the moment it is earned (rule 11)
  }
}

function advanceFromS4() {
  goTo(5);
}

function s4frcEnter() {
  // Restore visual state (cards can flip back/forth across navigation)
  document.querySelectorAll('#s4 .frc-card').forEach((cardEl, idx) => {
    cardEl.classList.toggle('is-flipped', s4frcFlipped[idx]);
    cardEl.setAttribute('aria-expanded', s4frcFlipped[idx] ? 'true' : 'false');
    const front = cardEl.querySelector('.frc-card-front');
    const back  = cardEl.querySelector('.frc-card-back');
    if (front) front.setAttribute('aria-hidden', s4frcFlipped[idx] ? 'true' : 'false');
    if (back)  back.setAttribute('aria-hidden', s4frcFlipped[idx] ? 'false' : 'true');
  });
  const btn = document.getElementById('s4-continue');
  if (btn) btn.disabled = !s4frcDone;
  document.getElementById('s4-footnote')?.classList.toggle('invisible', !s4frcDone);
}


/* ═══════════════════════════════════════════════════════════
   S5 — Image-choice SingleChoiceQuestion (Screen 06)
   Standard SCQ state machine (two attempts, hint from start,
   feedback popups) over TwoOptionSelection-style image cards.
   Correct answer: משורה ('cylinder').
   ═══════════════════════════════════════════════════════════ */
const S5Q = { correctId: 'cylinder', maxAttempts: 2 };
let s5qSelected = null;   // currently selected card id
let s5qAttempts = 0;      // number of check attempts made
let s5qAnswered = false;  // true once resolved (correct or final wrong)
let s5qDone     = false;  // resume-state lock (survives navigation)
let s5qLastWrong = null;  // card id marked wrong on a non-final attempt (gates re-check)

const S5Q_POPUP_CFG = {
  retry: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.'],
    body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
  },
  correct: {
    bg: '#edf8ed',
    title: ['صحيح‎!'],
    body: [
      'المخبار المدرّج هو أداة القياس المناسبة لكمية 100 ملل من السائل. الماصّة وملعقة القياس الطبية معدّتان لكمية صغيرة من السائل تحتاج إلى دقة عالية جدًا‎.'
    ]
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['غير دقيق...', 'الإجابة الصحيحة معلَّمة.'],
    body: [
      'المخبار المدرّج هو أداة القياس المناسبة لكمية 100 ملل من السائل. الماصّة وملعقة القياس الطبية معدّتان لكمية صغيرة من السائل تحتاج إلى دقة عالية جدًا‎.'
    ]
  }
};

/* Select a card (single selection) */
function s5qSelect(id) {
  if (s5qAnswered) return;
  dismissRetryPopup('s5q-popup', s5qDone);
  s5qSelected = id;
  // Clear a previous attempt's wrong mark for a fresh check
  if (s5qAttempts > 0) {
    document.querySelectorAll('#s5 .s5q-card').forEach(c => c.classList.remove('wrong', 'correct'));
  }
  document.querySelectorAll('#s5 .s5q-card').forEach(c => {
    const sel = c.dataset.id === id;
    c.classList.toggle('selected', sel);
    c.setAttribute('aria-checked', sel ? 'true' : 'false');
  });
  const chk = document.getElementById('s5q-check');
  if (chk && !s5qAnswered) chk.disabled = !s5qSelected || s5qSelected === s5qLastWrong;
}

/* Check / advance — the main bottom-bar button ("בחרתי") */
function s5qCheck() {
  if (s5qAnswered) { advanceScreen(); return; }   // label is "שנמשיך?" → go next
  if (!s5qSelected) return;

  s5qAttempts++;
  const isCorrect = s5qSelected === S5Q.correctId;
  { const el = document.querySelector('#s5 .s5q-card[data-id="' + s5qSelected + '"]');
    xapiAnswered('006', 'q1', isCorrect, isCorrect || s5qAttempts >= S5Q.maxAttempts, xapiAnswerText(el)); }

  if (isCorrect) {
    s5qMark(S5Q.correctId, 'correct');
    s5qShowPopup('correct');
    s5qFinish();
  } else if (s5qAttempts >= S5Q.maxAttempts) {
    // Second wrong → reveal correct (green) + mark chosen wrong (red)
    s5qMark(S5Q.correctId, 'correct');
    s5qMark(s5qSelected, 'wrong');
    s5qShowPopup('wrong2');
    s5qFinish();
  } else {
    // First wrong → generic retry popup, mark chosen wrong, correct NOT revealed
    s5qMark(s5qSelected, 'wrong');
    /* Re-check stays disabled until the learner picks a DIFFERENT card */
    s5qLastWrong = s5qSelected;
    const chk = document.getElementById('s5q-check');
    if (chk) chk.disabled = true;
    s5qShowPopup('retry');
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

function s5qMark(id, cls) {
  const card = document.querySelector('#s5 .s5q-card[data-id="' + id + '"]');
  if (!card) return;
  card.classList.remove('selected');
  card.classList.add(cls);
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


/* Lock the question after it is resolved */
function s5qFinish() {
  s5qAnswered = true;
  s5qDone = true;
  document.querySelectorAll('#s5 .s5q-card').forEach(c => { c.disabled = true; });
  const chk = document.getElementById('s5q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s5q-hint');
  if (hint) hint.style.visibility = 'hidden';
}

/* Hint modal (available from the start) */
function s5qOpenHint() {
  if (s5qAnswered) return;
  /* xAPI requested.1 — after the guard, right before the reveal; this function only opens. */
  xapiRequestedHint('006', 'q1');
  document.getElementById('s5q-hint-overlay')?.classList.remove('hidden');
}
function s5qCloseHint() {
  document.getElementById('s5q-hint-overlay')?.classList.add('hidden');
}
function s5qCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 's5q-hint-overlay') s5qCloseHint();
}

/* Restore the clean initial state (used on first entry / unfinished return) */
function s5qResetInitial() {
  s5qSelected = null;
  s5qLastWrong = null;
  s5qAttempts = 0;
  s5qAnswered = false;
  document.querySelectorAll('#s5 .s5q-card').forEach(c => {
    c.classList.remove('selected', 'correct', 'wrong');
    c.disabled = false;
    c.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s5q-popup')?.classList.add('hidden');
  const chk = document.getElementById('s5q-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('s5q-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = ''; }
}

/* Popup drag (shared draggable-popup pattern) */
let s5qPopupDragging = false;
let s5qPopupOffX = 0, s5qPopupOffY = 0;

function s5qPopupMouseDown(e) {
  s5qPopupDragging = true;
  const popup = document.getElementById('s5q-popup');
  const app   = document.getElementById('app');
  if (!popup || !app) return;
  const appLeft = parseFloat(app.style.left) || 0;
  const appTop  = parseFloat(app.style.top)  || 0;
  const scaleM  = app.style.transform.match(/scale\(([^)]+)\)/);
  const scale   = scaleM ? parseFloat(scaleM[1]) : 1;
  const canvasX = (e.clientX - appLeft) / scale;
  const canvasY = (e.clientY - appTop)  / scale;
  const topPx = parseFloat(popup.style.top);
  const popupTop = isNaN(topPx) ? popup.offsetTop : topPx;
  popup.style.top    = popupTop + 'px';
  popup.style.bottom = 'auto';
  s5qPopupOffX = canvasX - (parseFloat(popup.style.left) || 2);
  s5qPopupOffY = canvasY - popupTop;
  e.preventDefault();
}


/* ═══════════════════════════════════════════════════════════
   TEMPLATE — ImageHotspotQuestion (Screen 09) — NEW template
   Reuses the SingleChoiceQuestion state machine exactly (2 attempts,
   hint from start, feedback popups); only the selection mechanism
   differs (image hotspot instead of a text pill).
   ═══════════════════════════════════════════════════════════ */
const S8Q = { correctId: 'right', maxAttempts: 2 };
let s8qSelected = null;
let s8qAttempts = 0;
let s8qAnswered = false;
let s8qDone     = false;
let s8qLastWrong = null;  // hotspot id marked wrong on a non-final attempt (gates re-check)

const S8Q_POPUP_CFG = {
  retry: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.'],
    body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
  },
  correct: {
    bg: '#edf8ed',
    title: ['صحيح‎!'],
    body: [
      'نقرأ ارتفاع السائل <strong>على مستوى سطح السائل وبحسب أدنى نقطة في الانحناء</strong>.',
      'النظر من الأعلى أو الأسفل قد يؤدي إلى خطأ في القراءة‎.'
    ]
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة،', 'الإجابة الصحيحة تَظهَر الآن.'],
    body: [
      'نقرأ ارتفاع السائل <strong>على مستوى سطح السائل وبحسب أدنى نقطة في الانحناء</strong>.',
      'النظر من الأعلى أو الأسفل قد يؤدي إلى خطأ في القراءة‎.'
    ]
  }
};

function s8qSelect(id, btnEl) {
  if (s8qAnswered) return;
  dismissRetryPopup('s8q-popup', s8qDone);
  s8qSelected = id;
  if (s8qAttempts > 0) {
    document.querySelectorAll('#s8 .s8q-hotspot').forEach(h => h.classList.remove('wrong', 'correct'));
  }
  // The pulsing ripple is a "click here" affordance — needed only until
  // the first selection. Once the learner has picked anything, stop the
  // ripple on ALL dots for the rest of the question (incl. retry after a
  // wrong first attempt); 'answered' only kills the ripple, and
  // s8qResetInitial clears it.
  document.querySelectorAll('#s8 .s8q-hotspot').forEach(h => {
    h.classList.toggle('selected', h.dataset.id === id);
    h.classList.add('answered');
  });
  const chk = document.getElementById('s8q-check');
  if (chk) chk.disabled = !s8qSelected || s8qSelected === s8qLastWrong;
  void btnEl;
}

function s8qCheck() {
  if (s8qAnswered) { advanceScreen(); return; }
  if (!s8qSelected) return;

  s8qAttempts++;
  const isCorrect = s8qSelected === S8Q.correctId;
  /* item 007 q1 (eye-level reading) — asked on the scratch-card path only (see the config). */
  { const el = document.querySelector('#s8 .s8q-hotspot[data-id="' + s8qSelected + '"]');
    xapiAnswered('007', 'q1', isCorrect, isCorrect || s8qAttempts >= S8Q.maxAttempts, (xapiAnswerText(el) || (el && el.getAttribute('aria-label')) || s8qSelected)); }

  if (isCorrect) {
    s8qMark(S8Q.correctId, 'correct');
    s8qShowPopup('correct');
    s8qFinish();
  } else if (s8qAttempts >= S8Q.maxAttempts) {
    s8qMark(S8Q.correctId, 'correct');
    s8qMark(s8qSelected, 'wrong');
    s8qShowPopup('wrong2');
    s8qFinish();
  } else {
    s8qMark(s8qSelected, 'wrong');
    /* Re-check stays disabled until the learner picks a DIFFERENT figure */
    s8qLastWrong = s8qSelected;
    const chk = document.getElementById('s8q-check');
    if (chk) chk.disabled = true;
    s8qShowPopup('retry');
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

function s8qMark(id, cls) {
  const hotspot = document.querySelector('#s8 .s8q-hotspot[data-id="' + id + '"]');
  if (!hotspot) return;
  hotspot.classList.remove('selected');
  hotspot.classList.add(cls);
}

function s8qShowPopup(type) {
  const popup = document.getElementById('s8q-popup');
  if (!popup) return;
  const cfg = S8Q_POPUP_CFG[type];
  popup.style.background = cfg.bg;
  resetPopupPosition(popup);
  const titleEl = document.getElementById('s8q-popup-title');
  if (titleEl) titleEl.innerHTML = cfg.title.map(t => '<p>' + t + '</p>').join('');
  const bodyEl = document.getElementById('s8q-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  popup.classList.remove('hidden');
}


function s8qFinish() {
  s8qAnswered = true;
  s8qDone = true;
  document.querySelectorAll('#s8 .s8q-hotspot').forEach(h => { h.disabled = true; h.classList.add('answered'); });
  const chk = document.getElementById('s8q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s8q-hint');
  if (hint) hint.style.visibility = 'hidden';
}

function s8qOpenHint() {
  if (s8qAnswered) return;
  /* xAPI requested.1 — after the guard, right before the reveal; this function only opens. */
  xapiRequestedHint('007', 'q1');
  document.getElementById('s8q-hint-overlay')?.classList.remove('hidden');
}
function s8qCloseHint() {
  document.getElementById('s8q-hint-overlay')?.classList.add('hidden');
}
function s8qCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 's8q-hint-overlay') s8qCloseHint();
}

function s8qResetInitial() {
  s8qSelected = null;
  s8qAttempts = 0;
  s8qAnswered = false;
  s8qLastWrong = null;
  document.querySelectorAll('#s8 .s8q-hotspot').forEach(h => {
    h.classList.remove('selected', 'correct', 'wrong', 'answered');
    h.disabled = false;
  });
  document.getElementById('s8q-popup')?.classList.add('hidden');
  const chk = document.getElementById('s8q-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('s8q-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = ''; }
}

let s8qPopupDragging = false;
let s8qPopupOffX = 0, s8qPopupOffY = 0;

function s8qPopupMouseDown(e) {
  s8qPopupDragging = true;
  const popup = document.getElementById('s8q-popup');
  const app   = document.getElementById('app');
  if (!popup || !app) return;
  const appLeft = parseFloat(app.style.left) || 0;
  const appTop  = parseFloat(app.style.top)  || 0;
  const scaleM  = app.style.transform.match(/scale\(([^)]+)\)/);
  const scale   = scaleM ? parseFloat(scaleM[1]) : 1;
  const canvasX = (e.clientX - appLeft) / scale;
  const canvasY = (e.clientY - appTop)  / scale;
  const topPx = parseFloat(popup.style.top);
  const popupTop = isNaN(topPx) ? popup.offsetTop : topPx;
  popup.style.top    = popupTop + 'px';
  popup.style.bottom = 'auto';
  s8qPopupOffX = canvasX - (parseFloat(popup.style.left) || 2);
  s8qPopupOffY = canvasY - popupTop;
  e.preventDefault();
}


/* ═══════════════════════════════════════════════════════════
   S6 — TwoOptionSelection: learning-style choice (Screen 07)
   Slides 10+11 = one screen, two character variants. Card images
   resolve from the companion-character asset map on every entry
   (never hardcoded), so changing the character on S0 updates here.
   The choice persists in lomdaState.selectedLearningStyle; routing
   to the two learning paths is wired once those screens exist.
   ═══════════════════════════════════════════════════════════ */
const S6_CHARACTER_VIDEOS = {
  'character-1': {
    lookingGlass: 'assets/video/character-1-looking-glass.mp4',
    scratchCard:  'assets/video/character-1-scratch-card.mp4'
  },
  'character-2': {
    lookingGlass: 'assets/video/character-2-looking-glass.mp4',
    scratchCard:  'assets/video/character-2-scratch-card.mp4'
  }
};

let s6Selected = null;

/* Re-plays both S6 card videos from the start on every entry, resolving the
   source from the selected companion character (S0) each time so a changed
   selection is reflected here too. */
function updateS6Characters() {
  const ch = window.lomdaState.selectedCharacter || 'character-1';
  const assets = S6_CHARACTER_VIDEOS[ch] || S6_CHARACTER_VIDEOS['character-1'];
  const vidGlass   = document.getElementById('s6-img-glass');
  const vidScratch = document.getElementById('s6-img-scratch');
  [[vidGlass, assets.lookingGlass], [vidScratch, assets.scratchCard]].forEach(function (pair) {
    const vid = pair[0], src = pair[1];
    if (!vid) return;
    wireCardVideoFreeze(vid);
    if (vid.getAttribute('src') !== src) { vid.src = src; vid.load(); }
    try { vid.currentTime = 0; } catch (e) {}
    vid.play().catch(() => {});
  });
}

function selectOptionS6(cardEl) {
  s6Selected = cardEl.dataset.value;
  window.lomdaState.selectedLearningStyle = s6Selected;
  document.querySelectorAll('#s6 .option-card').forEach(c => {
    c.classList.remove('selected');
    c.setAttribute('aria-checked', 'false');
  });
  cardEl.classList.add('selected');
  cardEl.setAttribute('aria-checked', 'true');
  const btn = document.getElementById('s6-continue');
  if (btn) btn.disabled = false;
  try { flushResumeSave(); } catch (e) {}   // the chosen path decides where back and forward go
}

function advanceFromS6() {
  if (!s6Selected) return;
  // Branch to the selected learning path.
  if (s6Selected === 'scratch-card') goTo(7);
  else if (s6Selected === 'escape-room') { s11erEntryScreen = 6; goTo(11); }
}

function s6Reset() {
  s6Selected = window.lomdaState.selectedLearningStyle || null;
  document.querySelectorAll('#s6 .option-card').forEach(c => {
    const isSelected = c.dataset.value === s6Selected;
    c.classList.toggle('selected', isSelected);
    c.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  });
  const btn = document.getElementById('s6-continue');
  if (btn) btn.disabled = !s6Selected;
  updateS6Characters();
}

/* Keyboard activation for the selection cards (Enter / Space) — template
   contract for TwoOptionSelection radiogroups. One delegated handler
   covers both selection screens (S0 was missing this vs. the spec). */
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const s0card = e.target.closest('#s0 .option-card');
  if (s0card) { e.preventDefault(); selectOption(s0card); return; }
  const s6card = e.target.closest('#s6 .option-card');
  if (s6card) { e.preventDefault(); selectOptionS6(s6card); }
});


/* ═══════════════════════════════════════════════════════════
   TEMPLATE — ScratchCardsReveal (Screen 08) — NEW template
   Side A (white surface + question title) is drawn on a per-card
   canvas cover; pointer-scratching erases it (destination-out mask)
   to reveal side B (live HTML) beneath. ≥50% erased → the rest
   auto-clears. Enter/Space on a focused card reveals instantly
   (keyboard path). s7scRevealed only ever turns true and drives the
   Continue unlock (same invariant as FlipCardsReveal).
   ═══════════════════════════════════════════════════════════ */
const S7SC_REVEAL_THRESHOLD = 0.6;   // erased-area ratio that auto-completes the rest to 100%
const S7SC_BRUSH_RADIUS     = 58.5;  // scratch brush radius, canvas px (2.25× the original 26 — two +50% rounds)

let s7scRevealed = [false, false, false];
let s7scDone     = false;
let s7scInited   = false;

/* Coin "cursor" — a real <img class="s7sc-coin"> tracking the pointer
   over any unscratched card (a native CSS cursor is size-limited and
   silently rejected past ~128px, so this shows coin.png at full size
   instead).
   COORDINATE RULE: the coin lives inside #app, which carries a scale()
   transform — so viewport clientX/Y must be converted into #app design
   coords ((client − appOrigin) / scale), exactly like the popup-drag
   code. Setting raw clientX/Y "works" only at scale 1.0 and drifts
   badly at any other viewport size (position:fixed is also captured by
   the transformed ancestor, so there is no viewport-coords shortcut). */
function s7scShowCoin(e) {
  const coin = document.getElementById('s7sc-coin');
  const app  = document.getElementById('app');
  if (!coin || !app) return;
  const appLeft = parseFloat(app.style.left) || 0;
  const appTop  = parseFloat(app.style.top)  || 0;
  const scaleM  = app.style.transform.match(/scale\(([^)]+)\)/);
  const scale   = scaleM ? parseFloat(scaleM[1]) : 1;
  coin.style.left = ((e.clientX - appLeft) / scale) + 'px';
  coin.style.top  = ((e.clientY - appTop)  / scale) + 'px';
  coin.classList.remove('hidden');
}
function s7scHideCoin() {
  document.getElementById('s7sc-coin')?.classList.add('hidden');
}

/* Paint side A onto a card's cover canvas: white surface + the question
   title (runtime-drawn from the live data-side-a string — same text that
   exists as live HTML in side B, so AT users are not dependent on it). */
function s7scPaintCover(card) {
  const canvas = card.querySelector('.s7sc-card-cover');
  const inner = card.clientWidth;                 // 277 = 283 − 2×3px border
  // #app is CSS-scaled to fill the viewport (scaleApp()); a canvas raster
  // sized 1:1 to design px gets stretched by that scale (plus devicePixelRatio
  // on hi-DPI screens) when composited, so text/edges blur. Oversize the
  // backing store to match effective screen pixels, then scale the context
  // back down so drawing coordinates stay in plain design-px units.
  const appScaleM = document.getElementById('app').style.transform.match(/scale\(([^)]+)\)/);
  const pixelRatio = (appScaleM ? parseFloat(appScaleM[1]) : 1) * (window.devicePixelRatio || 1);
  canvas.width = inner * pixelRatio; canvas.height = inner * pixelRatio;
  canvas.style.width = inner + 'px'; canvas.style.height = inner + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(pixelRatio, pixelRatio);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, inner, inner);
  // Question title — bold, centered (both axes) RTL, wrapped to the card's text width
  ctx.fillStyle = '#303030';
  ctx.font = '700 24px Calibri, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  const maxWidth = inner - 32;                    // 16px padding each side
  const lineHeight = 31;
  const words = (card.dataset.sideA || '').split(' ');
  const lines = [];
  let line = '';
  words.forEach(word => {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  const startY = inner / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, inner / 2, startY + i * lineHeight));
}

function s7scErasedRatio(canvas) {
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let clear = 0, total = 0;
  for (let i = 3; i < data.length; i += 4 * 4) {   // sample every 4th pixel
    total++;
    if (data[i] === 0) clear++;
  }
  return total ? clear / total : 0;
}

/* Scratch sound effects — one shared instance of each, driven entirely
   from the scratch engine (not learner-facing controls). */
function s7scPlayScratchSound() {
  const audio = document.getElementById('s7sc-scratch-audio');
  if (!audio) return;
  audio.loop = true;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}
function s7scStopScratchSound() {
  const audio = document.getElementById('s7sc-scratch-audio');
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}
/* Shared celebration player (S7 / S9 / S11). The clip is 1.0s long:
   the success chime decays out by ~0.6s, and a stray unrelated low blip
   sits at t≈0.95s (measured via WebAudio RMS analysis) — stop playback
   before it reaches that tail. Volume is capped in code so the chime
   stays moderate even at 100% system volume (producer request). */
const CELEBRATION_VOLUME  = 0.5;
const CELEBRATION_CUT_SEC = 0.7;
let celebrationCutTimer = null;
function playCelebrationClip(id) {
  const audio = document.getElementById(id);
  if (!audio) return;
  clearTimeout(celebrationCutTimer);
  audio.volume = CELEBRATION_VOLUME;
  audio.currentTime = 0;
  audio.play().catch(() => {});
  celebrationCutTimer = setTimeout(() => audio.pause(), CELEBRATION_CUT_SEC * 1000);
}

function s7scPlayCelebration() {
  playCelebrationClip('s7sc-celebration-audio');
}

function s7scCompleteReveal(card) {
  const idx = parseInt(card.dataset.index, 10);
  if (s7scRevealed[idx]) return;
  s7scRevealed[idx] = true;
  card.querySelector('.s7sc-card-cover').classList.add('is-cleared');
  card.classList.add('is-revealed');
  card.setAttribute('aria-expanded', 'true');
  s7scHideCoin();
  s7scStopScratchSound();
  s7scPlayCelebration();
  s7scCheckUnlock();
}

function s7scCheckUnlock() {
  if (s7scRevealed.every(Boolean)) {
    const btn = document.getElementById('s7-continue');
    if (btn) btn.disabled = false;
    s7scDone = true;
    try { flushResumeSave(); } catch (e) {}   // a gate is state: saved the moment it is earned (rule 11)
  }
}

/* ── S7 gesture hint — finite "scratch/scrub" demo (Cursor Click hand,
   Figma node 3287:22205, file eSbp4bKHgBky0rakDb8l9N — 720 UI Templates).
   Shows a zig-zag scrub motion on the rightmost card
   (data-index="2", "איך נבחר כלי מדידה?" — first per the source's own
   right→left card order, see the S7 markup comment) to teach the scratch
   gesture. This is a THIRD gesture-hint category, distinct from the
   click/drag cases in _gesture-hints.md:
     - both stroke directions are instructional here (no "never seen
       moving backward" rule — that rule is drag-specific);
     - it is FINITE: one keyframe run holding TWO separate demos (each
       fading fully out before the next begins — see the keyframe comment
       in style.css), then hidden for good; it never loops on an idle timer;
     - "gesture understood" (s7GhSeen) is tracked independently of
       s7scRevealed/s7scDone (shared rule), and is set the moment any
       card's cover is ACTUALLY erased — hooked into eraseAt() below,
       the scratch engine's own erase primitive, not an invented
       pointer detector — so it fires for whichever of the 3 cards the
       learner scratches first. A keyboard-only reveal (Enter/Space)
       never calls eraseAt(), so it correctly does NOT count.
   Because this hint is one self-contained CSS keyframe (both demos, the
   hidden gap and every fade baked into a single animation) rather than
   several animations needing manual sequencing, a single token-guarded
   `animationend` listener replaces the doc's setTimeout phase chain —
   same invalidation-token purpose, adapted to one CSS event instead of a
   chain of timeouts. */
const S7GH_CARD_INDEX = 2;   // rightmost card — matches the source's right→left reading order
let s7GhSeen  = false;       // dedicated gesture-understood flag — never inferred from reveal/done state
let s7GhToken = 0;

function s7GhReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* Stop immediately and hide — no fade. The abrupt cut is intentional: the
   learner just performed the real gesture, so the demo has nothing left
   to teach; waiting for a fade (or for the keyframe to finish) would mean
   showing a decorative hand a moment after it stopped being relevant. */
function s7GhStop() {
  s7GhToken++;
  const el = document.getElementById('s7gh-hint');
  if (!el) return;
  el.classList.remove('s7gh-active');
  el.classList.add('hidden');
}

/* Real scratch detected on ANY of the 3 cards — any equivalent card counts
   per the shared gesture-hint rule. Idempotent past the first call (cheap
   no-op on every later erase point of the same stroke). */
function s7GhNotifyRealScratch() {
  if (s7GhSeen) return;
  s7GhSeen = true;
  s7GhStop();
}

/* Called on every S7 entry (from s7scEnter). No-ops once the gesture has
   been understood, under reduced motion, or if the hinted card itself has
   already been revealed some other way (keyboard shortcut on that one
   card) — there would be no cover left to demonstrate scratching on. */
function s7GhStart() {
  if (s7GhSeen) return;
  if (s7scRevealed[S7GH_CARD_INDEX]) return;
  if (s7GhReducedMotion()) return;
  s7GhStop();   // clean slate + bump token (guards a stale animationend from a previous run)
  const myToken = s7GhToken;
  const el = document.getElementById('s7gh-hint');
  if (!el) return;
  el.classList.remove('hidden');
  void el.offsetWidth;   // force reflow so re-adding the class restarts the animation on quick re-entry
  el.classList.add('s7gh-active');
  el.addEventListener('animationend', function onEnd() {
    if (myToken !== s7GhToken) return;   // a newer stop()/start() already superseded this run
    el.classList.remove('s7gh-active');
    el.classList.add('hidden');
  }, { once: true });
}

/* Wire scratch interaction — once, idempotent */
function s7scInit() {
  if (s7scInited) return;
  s7scInited = true;

  document.querySelectorAll('#s7 .s7sc-card').forEach(card => {
    const canvas = card.querySelector('.s7sc-card-cover');
    const ctx = canvas.getContext('2d');
    let scratching = false;
    let lastX = 0, lastY = 0;

    function canvasPoint(e) {
      const r = canvas.getBoundingClientRect();
      // Coordinates in design px, not raw backing-store px: s7scPaintCover
      // leaves a persistent ctx.scale(pixelRatio) on this canvas's (cached,
      // shared) 2D context so its own drawing stays in design units — arc()
      // here must match that space, not canvas.width/height (the oversized
      // backing store used for hi-DPI/app-scale sharpness).
      return {
        x: (e.clientX - r.left) / r.width  * card.clientWidth,
        y: (e.clientY - r.top)  / r.height * card.clientWidth
      };
    }

    function eraseAt(x, y) {
      s7GhNotifyRealScratch();   // source of truth: this IS the scratch engine's real erase primitive
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, S7SC_BRUSH_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    function eraseStroke(x0, y0, x1, y1) {
      const dist = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(1, Math.ceil(dist / (S7SC_BRUSH_RADIUS / 2)));
      for (let i = 0; i <= steps; i++) {
        eraseAt(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps);
      }
    }

    canvas.addEventListener('pointerdown', e => {
      const idx = parseInt(card.dataset.index, 10);
      if (s7scRevealed[idx]) return;
      e.preventDefault();
      scratching = true;
      // Capture may throw for a pointer that is no longer active (and for
      // synthetic events) — the initial erase dot must not depend on it.
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      const p = canvasPoint(e);
      lastX = p.x; lastY = p.y;
      eraseAt(p.x, p.y);
      s7scPlayScratchSound();
    });

    canvas.addEventListener('pointermove', e => {
      const idx = parseInt(card.dataset.index, 10);
      if (!s7scRevealed[idx]) s7scShowCoin(e);
      if (!scratching) return;
      e.preventDefault();
      const p = canvasPoint(e);
      eraseStroke(lastX, lastY, p.x, p.y);
      lastX = p.x; lastY = p.y;
    });

    canvas.addEventListener('pointerleave', s7scHideCoin);

    function endStroke() {
      if (!scratching) return;
      scratching = false;
      // s7scCompleteReveal() stops the scratch sound itself (and starts the
      // celebration one) when the threshold is reached — only stop it here
      // for the below-threshold case, so the two sounds never overlap.
      if (s7scErasedRatio(canvas) >= S7SC_REVEAL_THRESHOLD) s7scCompleteReveal(card);
      else s7scStopScratchSound();
    }
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', endStroke);

    // Keyboard path — Enter/Space reveals the card instantly
    card.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      s7scCompleteReveal(card);
    });
  });
}

/* חדר בריחה tab — two-way path switch (user decision): jumps to the
   escape room; its own toggle / חזרה lead back here. Scratch progress
   persists via s7scRevealed, escape progress via s11erOpened. */
function s7scSwitchTab(tab) {
  if (tab !== 'escape-room') return;
  s11erEntryScreen  = 7;
  s11erReturnScratch = 7;
  goTo(11);
}

function advanceFromS7() {
  if (!s7scDone) return;
  goTo(8);   // no-op until the next screen exists
}

/* ── Enter / reset screen state ──────────────────────────── */
function s7scEnter() {
  s7scInit();
  s7scHideCoin();
  document.querySelectorAll('#s7 .s7sc-card').forEach((card, idx) => {
    const cover = card.querySelector('.s7sc-card-cover');
    if (s7scRevealed[idx]) {
      // Revealed cards stay revealed on return navigation
      cover.classList.add('is-cleared');
      card.classList.add('is-revealed');
      card.setAttribute('aria-expanded', 'true');
    } else {
      // Unrevealed cards get a fresh full cover (partial scratch progress
      // does not persist across navigation — only the revealed state does)
      cover.classList.remove('is-cleared');
      card.classList.remove('is-revealed');
      card.setAttribute('aria-expanded', 'false');
      s7scPaintCover(card);
    }
  });
  const btn = document.getElementById('s7-continue');
  if (btn) btn.disabled = !s7scDone;
  s7GhStart();   // no-ops on its own if already understood / reduced motion / hinted card already revealed
}


/* ═══════════════════════════════════════════════════════════
   S9 — ScratchCardsReveal (2nd instance — same mechanic as S7,
   own namespace/coin/audio so the two screens never cross-talk)
   ═══════════════════════════════════════════════════════════ */
const S9SC_REVEAL_THRESHOLD = 0.6;
const S9SC_BRUSH_RADIUS     = 58.5;

let s9scRevealed = [false, false, false];
let s9scDone     = false;
let s9scInited   = false;

function s9scShowCoin(e) {
  const coin = document.getElementById('s9sc-coin');
  const app  = document.getElementById('app');
  if (!coin || !app) return;
  const appLeft = parseFloat(app.style.left) || 0;
  const appTop  = parseFloat(app.style.top)  || 0;
  const scaleM  = app.style.transform.match(/scale\(([^)]+)\)/);
  const scale   = scaleM ? parseFloat(scaleM[1]) : 1;
  coin.style.left = ((e.clientX - appLeft) / scale) + 'px';
  coin.style.top  = ((e.clientY - appTop)  / scale) + 'px';
  coin.classList.remove('hidden');
}
function s9scHideCoin() {
  document.getElementById('s9sc-coin')?.classList.add('hidden');
}

function s9scPaintCover(card) {
  const canvas = card.querySelector('.s7sc-card-cover');
  // S9's cards are 283×360 (taller than the S7 square) — width and height
  // are tracked separately throughout.
  const innerW = card.clientWidth;
  const innerH = card.clientHeight;
  const appScaleM = document.getElementById('app').style.transform.match(/scale\(([^)]+)\)/);
  const pixelRatio = (appScaleM ? parseFloat(appScaleM[1]) : 1) * (window.devicePixelRatio || 1);
  canvas.width = innerW * pixelRatio; canvas.height = innerH * pixelRatio;
  canvas.style.width = innerW + 'px'; canvas.style.height = innerH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(pixelRatio, pixelRatio);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, innerW, innerH);
  ctx.fillStyle = '#303030';
  ctx.font = '700 24px Calibri, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  const maxWidth = innerW - 32;
  const lineHeight = 31;
  const words = (card.dataset.sideA || '').split(' ');
  const lines = [];
  let line = '';
  words.forEach(word => {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  const startY = innerH / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, innerW / 2, startY + i * lineHeight));
}

function s9scErasedRatio(canvas) {
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let clear = 0, total = 0;
  for (let i = 3; i < data.length; i += 4 * 4) {
    total++;
    if (data[i] === 0) clear++;
  }
  return total ? clear / total : 0;
}

function s9scPlayScratchSound() {
  const audio = document.getElementById('s9sc-scratch-audio');
  if (!audio) return;
  audio.loop = true;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}
function s9scStopScratchSound() {
  const audio = document.getElementById('s9sc-scratch-audio');
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}
function s9scPlayCelebration() {
  playCelebrationClip('s9sc-celebration-audio');
}

function s9scCompleteReveal(card) {
  const idx = parseInt(card.dataset.index, 10);
  if (s9scRevealed[idx]) return;
  s9scRevealed[idx] = true;
  card.querySelector('.s7sc-card-cover').classList.add('is-cleared');
  card.classList.add('is-revealed');
  card.setAttribute('aria-expanded', 'true');
  s9scHideCoin();
  s9scStopScratchSound();
  s9scPlayCelebration();
  s9scCheckUnlock();
}

function s9scCheckUnlock() {
  if (s9scRevealed.every(Boolean)) {
    const btn = document.getElementById('s9-continue');
    if (btn) btn.disabled = false;
    s9scDone = true;
    try { flushResumeSave(); } catch (e) {}   // a gate is state: saved the moment it is earned (rule 11)
  }
}

/* ── S9 gesture hint — same approved pattern as S7's s7Gh* (see the S7
   gesture-hint comment for the full rationale); re-namespaced s9Gh* per
   the multi-instance rule. Only the card index and the CSS keyframe it
   triggers (s9gh-scratch, adjusted for this card's taller-starting
   2-line title — see style.css) differ from S7. Lifecycle, token guard,
   and the eraseAt() hook below are identical in shape. */
const S9GH_CARD_INDEX = 2;   // rightmost card — same reading-order convention as S7
let s9GhSeen  = false;
let s9GhToken = 0;

function s9GhReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function s9GhStop() {
  s9GhToken++;
  const el = document.getElementById('s9gh-hint');
  if (!el) return;
  el.classList.remove('s7gh-active');
  el.classList.add('hidden');
}

function s9GhNotifyRealScratch() {
  if (s9GhSeen) return;
  s9GhSeen = true;
  s9GhStop();
}

function s9GhStart() {
  if (s9GhSeen) return;
  if (s9scRevealed[S9GH_CARD_INDEX]) return;
  if (s9GhReducedMotion()) return;
  s9GhStop();
  const myToken = s9GhToken;
  const el = document.getElementById('s9gh-hint');
  if (!el) return;
  el.classList.remove('hidden');
  void el.offsetWidth;
  el.classList.add('s7gh-active');
  el.addEventListener('animationend', function onEnd() {
    if (myToken !== s9GhToken) return;
    el.classList.remove('s7gh-active');
    el.classList.add('hidden');
  }, { once: true });
}

function s9scInit() {
  if (s9scInited) return;
  s9scInited = true;

  document.querySelectorAll('#s9 .s7sc-card').forEach(card => {
    const canvas = card.querySelector('.s7sc-card-cover');
    const ctx = canvas.getContext('2d');
    let scratching = false;
    let lastX = 0, lastY = 0;

    function canvasPoint(e) {
      const r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) / r.width  * card.clientWidth,
        y: (e.clientY - r.top)  / r.height * card.clientHeight
      };
    }

    function eraseAt(x, y) {
      s9GhNotifyRealScratch();   // source of truth: this IS the scratch engine's real erase primitive
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, S9SC_BRUSH_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    function eraseStroke(x0, y0, x1, y1) {
      const dist = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(1, Math.ceil(dist / (S9SC_BRUSH_RADIUS / 2)));
      for (let i = 0; i <= steps; i++) {
        eraseAt(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps);
      }
    }

    canvas.addEventListener('pointerdown', e => {
      const idx = parseInt(card.dataset.index, 10);
      if (s9scRevealed[idx]) return;
      e.preventDefault();
      scratching = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      const p = canvasPoint(e);
      lastX = p.x; lastY = p.y;
      eraseAt(p.x, p.y);
      s9scPlayScratchSound();
    });

    canvas.addEventListener('pointermove', e => {
      const idx = parseInt(card.dataset.index, 10);
      if (!s9scRevealed[idx]) s9scShowCoin(e);
      if (!scratching) return;
      e.preventDefault();
      const p = canvasPoint(e);
      eraseStroke(lastX, lastY, p.x, p.y);
      lastX = p.x; lastY = p.y;
    });

    canvas.addEventListener('pointerleave', s9scHideCoin);

    function endStroke() {
      if (!scratching) return;
      scratching = false;
      if (s9scErasedRatio(canvas) >= S9SC_REVEAL_THRESHOLD) s9scCompleteReveal(card);
      else s9scStopScratchSound();
    }
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', endStroke);

    card.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      s9scCompleteReveal(card);
    });
  });
}

/* חדר בריחה tab — same two-way switch as S7's, remembering that the
   scratch path should resume at S9. */
function s9scSwitchTab(tab) {
  if (tab !== 'escape-room') return;
  s11erEntryScreen  = 9;
  s11erReturnScratch = 9;
  goTo(11);
}

function advanceFromS9() {
  if (!s9scDone) return;
  s10EntryScreen = 9;
  goTo(10);
}

function s9scEnter() {
  s9scInit();
  s9scHideCoin();
  document.querySelectorAll('#s9 .s7sc-card').forEach((card, idx) => {
    const cover = card.querySelector('.s7sc-card-cover');
    if (s9scRevealed[idx]) {
      cover.classList.add('is-cleared');
      card.classList.add('is-revealed');
      card.setAttribute('aria-expanded', 'true');
    } else {
      cover.classList.remove('is-cleared');
      card.classList.remove('is-revealed');
      card.setAttribute('aria-expanded', 'false');
      s9scPaintCover(card);
    }
  });
  const btn = document.getElementById('s9-continue');
  if (btn) btn.disabled = !s9scDone;
  s9GhStart();   // no-ops on its own if already understood / reduced motion / hinted card already revealed
}


/* ═══════════════════════════════════════════════════════════
   S10 — DropdownQuestion (ported from Target-01's mdq*, 3→4
   blanks). No hint on this screen (producer notes: ללא רמז).
   ═══════════════════════════════════════════════════════════ */
/* Correct option per blank, by option key (the <li data-key> in index.html).
   Keys, not labels: the visible label lives only in the HTML, so translating
   it never touches this logic. */
const S10Q_CORRECT = { 1: 'tool', 2: 'eye-level', 3: 'three', 4: 'average' };

/* Visible label of a dropdown option, read from its <li data-key> in the
   first list of the screen (all four blanks share the same option set).
   Shared by S10 and S12. */
function mdqOptionText(listIdPrefix, key) {
  const li = document.querySelector('#' + listIdPrefix + '1 .mdq-option[data-key="' + key + '"]');
  return li ? li.textContent : key;
}

/* One outcome, two views -- see part 06 S3's wrong2 for the full pattern.
   This screen's title is a bare string (textContent), not an array -- the
   answerView keeps that same shape. */
const S10Q_POPUP_CFG = {
  retry:   { bg: '#ffdbdc', title: 'الإجابة ليست صحيحة بالكامل.', body: ['هل نحاول مرة أخرى؟'] },
  correct: { bg: '#edf8ed', title: 'الإجابة صحيحة. كل الاحترام!',
             body: ['القياس العلمي الجيد للسائل يحتاج إلى: أداة مناسبة، قراءة على مستوى العينين، إجراء ثلاثة قياسات وحساب المعدل.'] },
  wrong2:  { bg: '#ffdbdc', title: 'هذا خطأ، الإجابة الصحيحة تظهر الآن.',
             body: ['القياس العلمي الجيد للسائل يحتاج إلى: أداة مناسبة، قراءة على مستوى العينين، إجراء ثلاثة قياسات وحساب المعدل.'],
             action: { label: 'الانتقال إلى إجابتي', view: 'answer' },
             answerView: {
               title: 'الإجابة غير صحيحة.',
               body:  ['يمكن مشاهدة الحل الصحيح مرة أخرى‎.'],
               action: { label: 'الإجابة الصحيحة', view: 'solution' }
             } }
};

/* Exact Figma vectors, eSbp4bKHgBky0rakDb8l9N node 1027:26021 */
const S10Q_CHECK_SVG =
  '<svg class="mdq-check-ico" width="16" height="16" viewBox="0 0 14 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M4.52036 12C4.12296 12.0002 3.74183 11.8126 3.46106 11.4787L0.258452 7.67744C-0.0861507 7.26814 -0.0861507 6.60467 0.258452 6.19536C0.603165 5.78619 1.16194 5.78619 1.50666 6.19536L4.52036 9.77374L12.4933 0.306878C12.8381 -0.102293 13.3968 -0.102293 13.7415 0.306878C14.0862 0.716179 14.0862 1.37966 13.7415 1.78896L5.57966 11.4787C5.29889 11.8126 4.91776 12.0002 4.52036 12Z" fill="#609E12"/>' +
  '</svg>';
const S10Q_WRONG_SVG =
  '<svg class="mdq-wrong-ico" width="16" height="16" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M13.6743 0.325691C13.4657 0.117151 13.1828 0 12.8879 0C12.5929 0 12.31 0.117151 12.1014 0.325691L7 5.42709L1.8986 0.325691C1.69 0.117151 1.40711 0 1.11215 0C0.817183 0 0.534294 0.117151 0.325691 0.325691C0.117151 0.534294 0 0.817183 0 1.11215C0 1.40711 0.117151 1.69 0.325691 1.8986L5.42709 7L0.325691 12.1014C0.117151 12.31 0 12.5929 0 12.8879C0 13.1828 0.117151 13.4657 0.325691 13.6743C0.534294 13.8829 0.817183 14 1.11215 14C1.40711 14 1.69 13.8829 1.8986 13.6743L7 8.57291L12.1014 13.6743C12.31 13.8829 12.5929 14 12.8879 14C13.1828 14 13.4657 13.8829 13.6743 13.6743C13.8829 13.4657 14 13.1828 14 12.8879C14 12.5929 13.8829 12.31 13.6743 12.1014L8.57291 7L13.6743 1.8986C13.8829 1.69 14 1.40711 14 1.11215C14 0.817183 13.8829 0.534294 13.6743 0.325691Z" fill="#B20010"/>' +
  '</svg>';

let s10qSelections = { 1: null, 2: null, 3: null, 4: null };
/* JSON snapshot of s10qSelections as of the last non-final wrong attempt —
   gates the check button disabled until at least one blank changes. */
let s10qLastWrongSnapshot = null;
let s10qAttempts = 0;
let s10qDone = false;
let s10qListenerRegistered = false;

let s10qPopupDragging = false;
let s10qPopupOffX = 0, s10qPopupOffY = 0;

/* ── Final-attempt solution/answer toggle (see part 06 S3 for the full
   contract) -- this screen has FOUR independent blanks, so the snapshot is
   keyed per-blank. One toggle governs all four and the popup together.
   s10qAnswer  { 1: {value, correct}, 2: {...}, 3: {...}, 4: {...} } -- the
              learner's final selection for every blank, and whether each one
              was individually right, captured before any reveal overwrites
              a wrong one. null => not toggleable.
   s10qView   'solution' | 'answer'. Runtime only -- reset in s10qEnter(). */
let s10qAnswer = null;
let s10qView   = 'solution';

function s10qEnter() {
  document.getElementById('s10q-popup')?.classList.add('hidden');
  s10qCloseAllDropdowns();

  if (s10qDone) {
    /* A resolved screen always comes back on the SOLUTION view -- see part 06
       S3's s3vEnter() for the full rationale. This used to be a dedicated
       s10qRestoreDone() that fell back to `s10qSelections[n] || S10Q_CORRECT[n]`
       -- that fallback only worked BECAUSE s10qMarkBlank('revealed', n) used to
       overwrite s10qSelections[n] with the correct value. It no longer does
       (see s10qAnswer above), so this call is what replaces it. */
    s10qView = 'solution';
    s10qApplyView();
    const chk = document.getElementById('s10q-check');
    if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
    return;
  }

  s10qLastWrongSnapshot = null;
  [1, 2, 3, 4].forEach(n => {
    const btn = document.getElementById('s10q-btn-' + n);
    const sel = document.getElementById('s10q-selected-' + n);
    if (!btn || !sel) return;

    btn.classList.remove('mdq-correct', 'mdq-wrong');
    btn.querySelector('.mdq-check-ico')?.remove();
    btn.querySelector('.mdq-wrong-ico')?.remove();
    const chevron = btn.querySelector('.mdq-chevron');
    if (chevron) chevron.style.display = '';
    btn.disabled = false;

    if (s10qSelections[n] !== null) {
      sel.textContent = mdqOptionText('s10q-list-', s10qSelections[n]);
      btn.removeAttribute('data-empty');
    } else {
      sel.textContent = 'اختاروا إجابة';
      btn.setAttribute('data-empty', 'true');
    }
  });

  s10qAnswer = null;
  s10qView   = 'solution';

  const chk = document.getElementById('s10q-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = false; }
  s10qUpdateBar();

  if (!s10qListenerRegistered) {
    document.addEventListener('click', s10qOutsideClick);
    s10qListenerRegistered = true;
  }
}

function s10qToggle(n) {
  const btn  = document.getElementById('s10q-btn-' + n);
  const list = document.getElementById('s10q-list-' + n);
  if (!btn || !list || btn.disabled) return;
  dismissRetryPopup('s10q-popup', s10qDone);
  const isOpen = !list.classList.contains('hidden');
  s10qCloseAllDropdowns();
  if (!isOpen) {
    list.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
  }
}

function s10qCloseAllDropdowns(exceptN) {
  [1, 2, 3, 4].forEach(n => {
    if (n === exceptN) return;
    document.getElementById('s10q-list-' + n)?.classList.add('hidden');
    document.getElementById('s10q-btn-'  + n)?.setAttribute('aria-expanded', 'false');
  });
}

function s10qOutsideClick(e) {
  if (currentScreen !== 10) return;
  if (!e.target.closest('.mdq-dropdown-wrap')) s10qCloseAllDropdowns();
}

function s10qSelect(n, value) {
  if (s10qDone) return;
  s10qSelections[n] = value;

  const sel = document.getElementById('s10q-selected-' + n);
  if (sel) sel.textContent = mdqOptionText('s10q-list-', value);
  const btn = document.getElementById('s10q-btn-' + n);
  if (btn) {
    btn.removeAttribute('data-empty');
    /* This blank's own first-attempt mark clears the moment it changes —
       same rule as this screen's answer-option constant, S3VD's dropdown
       half, and every DragAndDropQuestion zone. */
    btn.classList.remove('mdq-correct', 'mdq-wrong');
    btn.querySelector('.mdq-check-ico')?.remove();
    btn.querySelector('.mdq-wrong-ico')?.remove();
    const chevron = btn.querySelector('.mdq-chevron');
    if (chevron) chevron.style.display = '';
  }

  s10qCloseAllDropdowns();
  s10qUpdateBar();
}

function s10qUpdateBar() {
  if (s10qDone) return;
  const chk = document.getElementById('s10q-check');
  if (!chk) return;
  const allFilled = [1, 2, 3, 4].every(n => s10qSelections[n] !== null);
  /* Retry gate: re-enable only once at least one blank genuinely DIFFERS
     from the combination just marked wrong — a live comparison. */
  chk.disabled = !allFilled || JSON.stringify(s10qSelections) === s10qLastWrongSnapshot;
}

function s10qCheck() {
  if (s10qDone) { advanceFromS10(); return; }

  s10qAttempts++;

  const results = [1, 2, 3, 4].map(n => ({
    n,
    correct: s10qSelections[n] === S10Q_CORRECT[n]
  }));

  const allCorrect = results.every(r => r.correct);
  /* xAPI 007 q2 (fill-in, 4 blanks) — the same catalogue question on the scratch-card path. One
     all-or-nothing verdict; 2 attempts. Answer = the four chosen labels in order. */
  xapiAnswered('007', 'q2', allCorrect, allCorrect || s10qAttempts >= 2,
    [1, 2, 3, 4].map(n => mdqOptionText('s10q-list-', s10qSelections[n])).join(' | '));

  if (allCorrect) {
    results.forEach(r => s10qMarkBlank(r.n, 'correct'));
    s10qShowPopup('correct');
    s10qFinish();
    try { flushResumeSave(); } catch (e) {}   // before this path's return (guide §8.3)
    return;
  }

  if (s10qAttempts === 1) {
    /* First wrong — mark each blank red/green so the learner knows which
       ones to fix (client QA — matches this part's S3DDQ/S12DDQ per-zone
       feedback and part-03 S3VD's dropdown half). Every blank stays
       editable; s10qSelect() clears a blank's own mark the moment it
       changes. */
    s10qShowAttemptFeedback(results);
    s10qShowPopup('retry');
    /* Re-check stays disabled until at least one blank changes */
    s10qLastWrongSnapshot = JSON.stringify(s10qSelections);
    const chk = document.getElementById('s10q-check');
    if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
    try { flushResumeSave(); } catch (e) {}   // before this path's return (guide §8.3)
    return;
  }

  /* Capture every blank's final selection and correctness BEFORE any reveal
     overwrites a wrong one -- this is the only place they still exist. Then
     resolve straight into the solution view; the question is complete now. */
  s10qAnswer = {};
  results.forEach(r => { s10qAnswer[r.n] = { value: s10qSelections[r.n], correct: r.correct }; });
  s10qView = 'solution';
  s10qApplyView();
  s10qFinish();
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

/* First-attempt per-blank feedback: red/green border + icon, chevron stays
   visible (client QA — the learner can still reopen this dropdown to fix
   it, unlike the FINAL state where it can't change anymore), never
   disabled. Not s10qMarkBlank(): that function always disables and hides
   the chevron, and is also the single source of truth for the FINAL
   render, so it is left untouched. */
function s10qShowAttemptFeedback(results) {
  results.forEach(r => {
    const btn = document.getElementById('s10q-btn-' + r.n);
    if (!btn) return;
    btn.classList.remove('mdq-correct', 'mdq-wrong');
    btn.querySelector('.mdq-check-ico')?.remove();
    btn.querySelector('.mdq-wrong-ico')?.remove();
    btn.classList.add(r.correct ? 'mdq-correct' : 'mdq-wrong');
    btn.insertAdjacentHTML('beforeend', r.correct ? S10Q_CHECK_SVG : S10Q_WRONG_SVG);
  });
}

/* Resolved-state rendering of one blank. 'correct' = this blank was right on
   submit. 'solution' / 'answer' are the two toggle views -- 'answer' shows
   the learner's own selection for THIS blank (a screen-specific need: on
   this four-blank screen, each blank's correctness is independent). */
function s10qMarkBlank(n, state) {
  const btn     = document.getElementById('s10q-btn-' + n);
  const sel     = document.getElementById('s10q-selected-' + n);
  const chevron = btn?.querySelector('.mdq-chevron');
  if (!btn || !sel) return;

  btn.classList.remove('mdq-correct', 'mdq-wrong');
  btn.querySelector('.mdq-check-ico')?.remove();
  btn.querySelector('.mdq-wrong-ico')?.remove();
  btn.disabled = true;

  if (state === 'answer') {
    sel.textContent = mdqOptionText('s10q-list-', s10qAnswer[n].value);
    btn.removeAttribute('data-empty');
    btn.classList.add('mdq-wrong');
    /* Client QA: never show the chevron once the answer is final and the
       blank is locked (btn.disabled above) — this view can't be edited. */
    if (chevron) chevron.style.display = 'none';
    btn.insertAdjacentHTML('beforeend', S10Q_WRONG_SVG);
  } else {
    /* 'solution' overwrites this blank with the correct value; 'correct'
       leaves the learner's already-correct selection in place. */
    if (state === 'solution') { sel.textContent = mdqOptionText('s10q-list-', S10Q_CORRECT[n]); btn.removeAttribute('data-empty'); }
    btn.classList.add('mdq-correct');
    if (chevron) chevron.style.display = 'none';
    btn.insertAdjacentHTML('beforeend', S10Q_CHECK_SVG);
  }
}

/* Single owner of the resolved-wrong state for all four blanks and the
   popup -- see part 06 S3's s3vApplyView(). Idempotent; never re-runs
   validation. */
function s10qApplyView() {
  if (s10qAnswer === null) return;
  [1, 2, 3, 4].forEach(n => {
    const a = s10qAnswer[n];
    s10qMarkBlank(n, a.correct ? 'correct' : (s10qView === 'answer' ? 'answer' : 'solution'));
  });
  s10qShowPopup('wrong2', s10qView);
}

/* Pure view switch -- see part 06 S3's s3vToggleView(). Never routes through
   s10qCheck(), never touches s10qAttempts or the done lock. */
function s10qToggleView() {
  if (s10qAnswer === null) return;
  s10qView = (s10qView === 'solution') ? 'answer' : 'solution';
  s10qApplyView();
}

function s10qFinish() {
  s10qDone = true;
  [1, 2, 3, 4].forEach(n => {
    const btn = document.getElementById('s10q-btn-' + n);
    if (btn) btn.disabled = true;
  });
  const chk = document.getElementById('s10q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
}

function s10qShowPopup(type, view) {
  const popup = document.getElementById('s10q-popup');
  if (!popup) return;
  s10qCloseAllDropdowns();
  const base = S10Q_POPUP_CFG[type];
  const cfg  = (view === 'answer' && base.answerView)
             ? Object.assign({}, base, base.answerView)
             : base;
  popup.style.background = cfg.bg;
  /* Reset position only on a genuine open -- see part 06 S3's s3vShowPopup(). */
  if (popup.classList.contains('hidden')) resetPopupPosition(popup);
  const titleEl = document.getElementById('s10q-popup-title');
  if (titleEl) titleEl.textContent = cfg.title;
  const bodyEl = document.getElementById('s10q-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  renderPopupAction('s10q-popup', cfg.action, s10qToggleView);
  popup.classList.remove('hidden');
  clampPopup(popup);
}


function s10qPopupMouseDown(e) {
  /* The action button is a control, not a drag handle. Without this guard its
     pointerdown would start a drag AND flip the popup from bottom- to
     top-anchoring. Ported verbatim from part 06's Foundation. */
  if (e.target && e.target.closest && e.target.closest('.popup-action')) return;
  s10qPopupDragging = true;
  const popup = document.getElementById('s10q-popup');
  const app   = document.getElementById('app');
  if (!popup || !app) return;
  const appLeft = parseFloat(app.style.left)  || 0;
  const appTop  = parseFloat(app.style.top)   || 0;
  const scaleM  = app.style.transform.match(/scale\(([^)]+)\)/);
  const scale   = scaleM ? parseFloat(scaleM[1]) : 1;
  const canvasX = (e.clientX - appLeft) / scale;
  const canvasY = (e.clientY - appTop)  / scale;
  const topPx = parseFloat(popup.style.top);
  const top = isNaN(topPx) ? popup.offsetTop : topPx;
  popup.style.top    = top + 'px';
  popup.style.bottom = 'auto';
  s10qPopupOffX = canvasX - (parseFloat(popup.style.left) || 2);
  s10qPopupOffY = canvasY - top;
  e.preventDefault();
}

function advanceFromS10() {
  if (!s10qDone) return;
  s13EntryScreen = 10;   // S13's חזרה returns to the path it came from
  goTo(13);              // S11/S12 (escape branch) are never linear successors
}


/* ═══════════════════════════════════════════════════════════
   S11 — EscapeRoomHotspots (NEW template — no .md reference yet)
   Figma: dpY9DTl41tzW8SKvcPWU0C, nodes 2482:5770 / 2493:5851,
   component "AreaSelectionHotspot".
   Branch screen of the חדר בריחה learning path (chosen on S6 or via
   the S7/S9 toggle tabs). 6 objects hide in a lab photo; clicking
   one glows it + opens its speech-bubble modal; clicking the next
   object grays the previous one (visited, inactive) while its modal
   stays open (client QA 2026-09-23: a closed modal made learners click
   the same object again). Continue unlocks once all 6 were opened and moves on to
   S12, the escape path's own dropdown question; the paths reconnect
   at S13. All open/visited state persists across navigation and path
   switches (user decision).
   ═══════════════════════════════════════════════════════════ */
const S11ER_KEYS = ['table', 'eye', 'emptybeaker', 'fullbeaker', 'cylinder', 'pipette'];

let s11erOpened = { table: false, eye: false, emptybeaker: false,
                    fullbeaker: false, cylinder: false, pipette: false };
let s11erActive = null;    // key of the currently open (glowing) object
let s11erDone   = false;
let s11erInited = false;

/* Branch-navigation memory:
   – s11erEntryScreen: where חזרה on S11 returns to (6 = the S6 choice,
     7/9 = entered via that scratch screen's toggle tab).
   – s11erReturnScratch: which scratch screen the כרטיס גירוד tab
     resumes (the last one the learner was on).
   – s10EntryScreen: which screen advanced into S10 — S10's חזרה returns
     there (9 on the scratch path; kept as a variable for symmetry).
   – s13EntryScreen: which dropdown screen advanced into S13 (10 =
     scratch path, 12 = escape path) — S13's חזרה returns there. */
let s11erEntryScreen   = 6;
let s11erReturnScratch = 7;
let s10EntryScreen     = 9;
let s13EntryScreen     = 10;

function s11erOpen(key) {
  if (s11erActive === key) return;          // already open — stays open
  if (s11erOpened[key]) return;             // visited — inactive
  if (s11erActive) s11erRetire(s11erActive);
  s11erActive = key;
  s11erOpened[key] = true;
  document.getElementById('s11er-obj-' + key)?.classList.add('active');
  document.getElementById('s11er-bubble-' + key)?.classList.remove('hidden');
  s11erPlayCelebration();
  s11erUpdateProgress();
  s11erCheckDone();
}

/* Progress meter — dots flip current → correct in numeric order (1 = the
   rightmost dot), one per found object, regardless of WHICH object it was */
function s11erUpdateProgress() {
  const found = S11ER_KEYS.filter(k => s11erOpened[k]).length;
  for (let i = 1; i <= S11ER_KEYS.length; i++) {
    const ico = document.getElementById('s11er-dot-ico-' + i);
    if (ico) ico.src = i <= found ? 'assets/img/escape-dot-correct.svg'
                                  : 'assets/img/escape-dot-current.svg';
  }
  document.getElementById('s11er-progress')
    ?.setAttribute('aria-label', 'المبادئ التي تم إيجادها: ' + found + ' من أصل ' + S11ER_KEYS.length);
}

/* Sounds — gentle background music while the escape room is on screen,
   and a chime each time an object is found.
   s11erMusicWanted guards a race: play() is async (the file may still be
   buffering), so leaving S11 before it resolves would pause() first and
   then have the pending play() start the music on another screen. The
   flag records the current intent; a play() that resolves after a stop
   immediately re-pauses itself. */
let s11erMusicWanted = false;
function s11erStartMusic() {
  const audio = document.getElementById('s11er-music-audio');
  if (!audio) return;
  s11erMusicWanted = true;
  audio.volume = 0.15;
  audio.loop = true;
  audio.play().then(() => {
    if (!s11erMusicWanted) { audio.pause(); audio.currentTime = 0; }
  }).catch(() => {});
}
function s11erStopMusic() {
  s11erMusicWanted = false;
  const audio = document.getElementById('s11er-music-audio');
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}
function s11erPlayCelebration() {
  playCelebrationClip('s11er-celebration-audio');
}

/* Gray a previously open object out. Its modal deliberately stays open. */
function s11erRetire(key) {
  const obj = document.getElementById('s11er-obj-' + key);
  if (obj) {
    obj.classList.remove('active');
    obj.classList.add('visited');
    if (obj.tagName === 'BUTTON') obj.disabled = true;
    else { obj.setAttribute('aria-disabled', 'true'); obj.tabIndex = -1; }
  }
}

function s11erCheckDone() {
  if (!S11ER_KEYS.every(k => s11erOpened[k])) return;
  s11erDone = true;
  const btn = document.getElementById('s11-continue');
  if (btn) btn.disabled = false;
  try { flushResumeSave(); } catch (e) {}   // a gate is state: saved the moment it is earned (rule 11)
}

/* כרטיס גירוד tab — back to the scratch path, wherever it was left */
function s11erSwitchTab(tab) {
  if (tab !== 'scratch') return;
  goTo(s11erReturnScratch);
}

function advanceFromS11() {
  if (!s11erDone) return;
  goTo(12);   // the escape path's own dropdown question (S10's twin)
}

function s11erInit() {
  if (s11erInited) return;
  s11erInited = true;
  // The table object is a div[role=button] (a <table> may not nest in a
  // real <button>) — give it the native button keyboard behavior.
  document.getElementById('s11er-obj-table')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      s11erOpen('table');
    }
  });
}

/* Enter / reset — restore the screen exactly as it was left: visited
   objects gray, the active one still glowing, every opened modal open. */
function s11erEnter() {
  s11erInit();
  S11ER_KEYS.forEach(key => {
    const obj = document.getElementById('s11er-obj-' + key);
    const bub = document.getElementById('s11er-bubble-' + key);
    if (!obj) return;
    const isActive  = s11erActive === key;
    const isVisited = s11erOpened[key] && !isActive;
    obj.classList.toggle('active', isActive);
    obj.classList.toggle('visited', isVisited);
    if (obj.tagName === 'BUTTON') obj.disabled = isVisited;
    else {
      obj.setAttribute('aria-disabled', String(isVisited));
      obj.tabIndex = isVisited ? -1 : 0;
    }
    bub?.classList.toggle('hidden', !s11erOpened[key]);
  });
  s11erUpdateProgress();
  const btn = document.getElementById('s11-continue');
  if (btn) btn.disabled = !s11erDone;
  s11erStartMusic();
}


/* ═══════════════════════════════════════════════════════════
   S12 — DropdownQuestion, escape-path variant (Figma 2571:1775).
   Exact duplicate of S10's question (same blanks, shared word bank,
   correct answers, 2 attempts, no hint) — only the title/instruction
   differ, plus a faded escape-room backdrop. Reached only from S11;
   continues to S13, where the two learning paths reconnect.
   ═══════════════════════════════════════════════════════════ */
/* By option key — see S10Q_CORRECT. */
const S12Q_CORRECT = { 1: 'tool', 2: 'eye-level', 3: 'three', 4: 'average' };

/* One outcome, two views -- see part 06 S3's wrong2 for the full pattern.
   This screen's title is a bare string (textContent), not an array -- the
   answerView keeps that same shape. Kept byte-identical to S10's own
   version of this config, per the two screens' "exact duplicate" note. */
const S12Q_POPUP_CFG = {
  retry:   { bg: '#ffdbdc', title: 'الإجابة ليست صحيحة بالكامل.', body: ['هل نحاول مرة أخرى؟'] },
  correct: { bg: '#edf8ed', title: 'الإجابة صحيحة. كل الاحترام!',
             body: ['القياس العلمي الجيد للسائل يحتاج إلى: أداة مناسبة، قراءة على مستوى العينين، إجراء ثلاثة قياسات وحساب المعدل.'] },
  wrong2:  { bg: '#ffdbdc', title: 'هذا خطأ، الإجابة الصحيحة تظهر الآن.',
             body: ['القياس العلمي الجيد للسائل يحتاج إلى: أداة مناسبة، قراءة على مستوى العينين، إجراء ثلاثة قياسات وحساب المعدل.'],
             action: { label: 'الانتقال إلى إجابتي', view: 'answer' },
             answerView: {
               title: 'الإجابة غير صحيحة.',
               body:  ['يمكن مشاهدة الحل الصحيح مرة أخرى‎.'],
               action: { label: 'الإجابة الصحيحة', view: 'solution' }
             } }
};

/* Exact Figma vectors, eSbp4bKHgBky0rakDb8l9N node 1027:26021 */
const S12Q_CHECK_SVG =
  '<svg class="mdq-check-ico" width="16" height="16" viewBox="0 0 14 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M4.52036 12C4.12296 12.0002 3.74183 11.8126 3.46106 11.4787L0.258452 7.67744C-0.0861507 7.26814 -0.0861507 6.60467 0.258452 6.19536C0.603165 5.78619 1.16194 5.78619 1.50666 6.19536L4.52036 9.77374L12.4933 0.306878C12.8381 -0.102293 13.3968 -0.102293 13.7415 0.306878C14.0862 0.716179 14.0862 1.37966 13.7415 1.78896L5.57966 11.4787C5.29889 11.8126 4.91776 12.0002 4.52036 12Z" fill="#609E12"/>' +
  '</svg>';
const S12Q_WRONG_SVG =
  '<svg class="mdq-wrong-ico" width="16" height="16" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M13.6743 0.325691C13.4657 0.117151 13.1828 0 12.8879 0C12.5929 0 12.31 0.117151 12.1014 0.325691L7 5.42709L1.8986 0.325691C1.69 0.117151 1.40711 0 1.11215 0C0.817183 0 0.534294 0.117151 0.325691 0.325691C0.117151 0.534294 0 0.817183 0 1.11215C0 1.40711 0.117151 1.69 0.325691 1.8986L5.42709 7L0.325691 12.1014C0.117151 12.31 0 12.5929 0 12.8879C0 13.1828 0.117151 13.4657 0.325691 13.6743C0.534294 13.8829 0.817183 14 1.11215 14C1.40711 14 1.69 13.8829 1.8986 13.6743L7 8.57291L12.1014 13.6743C12.31 13.8829 12.5929 14 12.8879 14C13.1828 14 13.4657 13.8829 13.6743 13.6743C13.8829 13.4657 14 13.1828 14 12.8879C14 12.5929 13.8829 12.31 13.6743 12.1014L8.57291 7L13.6743 1.8986C13.8829 1.69 14 1.40711 14 1.11215C14 0.817183 13.8829 0.534294 13.6743 0.325691Z" fill="#B20010"/>' +
  '</svg>';

let s12qSelections = { 1: null, 2: null, 3: null, 4: null };
/* JSON snapshot of s12qSelections as of the last non-final wrong attempt —
   gates the check button disabled until at least one blank changes. */
let s12qLastWrongSnapshot = null;
let s12qAttempts = 0;
let s12qDone = false;
let s12qListenerRegistered = false;

let s12qPopupDragging = false;
let s12qPopupOffX = 0, s12qPopupOffY = 0;

/* ── Final-attempt solution/answer toggle -- see S10's own version of this
   contract for the full rationale; kept byte-identical here. */
let s12qAnswer = null;
let s12qView   = 'solution';

function s12qEnter() {
  document.getElementById('s12q-popup')?.classList.add('hidden');
  s12qCloseAllDropdowns();

  if (s12qDone) {
    /* A resolved screen always comes back on the SOLUTION view -- see S10's
       own version of this contract for the full rationale (this used to be a
       dedicated s12qRestoreDone() with the same destructive-fallback issue). */
    s12qView = 'solution';
    s12qApplyView();
    const chk = document.getElementById('s12q-check');
    if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
    return;
  }

  s12qLastWrongSnapshot = null;
  [1, 2, 3, 4].forEach(n => {
    const btn = document.getElementById('s12q-btn-' + n);
    const sel = document.getElementById('s12q-selected-' + n);
    if (!btn || !sel) return;

    btn.classList.remove('mdq-correct', 'mdq-wrong');
    btn.querySelector('.mdq-check-ico')?.remove();
    btn.querySelector('.mdq-wrong-ico')?.remove();
    const chevron = btn.querySelector('.mdq-chevron');
    if (chevron) chevron.style.display = '';
    btn.disabled = false;

    if (s12qSelections[n] !== null) {
      sel.textContent = mdqOptionText('s12q-list-', s12qSelections[n]);
      btn.removeAttribute('data-empty');
    } else {
      sel.textContent = 'اختاروا إجابة';
      btn.setAttribute('data-empty', 'true');
    }
  });

  s12qAnswer = null;
  s12qView   = 'solution';

  const chk = document.getElementById('s12q-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = false; }
  s12qUpdateBar();

  if (!s12qListenerRegistered) {
    document.addEventListener('click', s12qOutsideClick);
    s12qListenerRegistered = true;
  }
}

function s12qToggle(n) {
  const btn  = document.getElementById('s12q-btn-' + n);
  const list = document.getElementById('s12q-list-' + n);
  if (!btn || !list || btn.disabled) return;
  dismissRetryPopup('s12q-popup', s12qDone);
  const isOpen = !list.classList.contains('hidden');
  s12qCloseAllDropdowns();
  if (!isOpen) {
    list.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
  }
}

function s12qCloseAllDropdowns(exceptN) {
  [1, 2, 3, 4].forEach(n => {
    if (n === exceptN) return;
    document.getElementById('s12q-list-' + n)?.classList.add('hidden');
    document.getElementById('s12q-btn-'  + n)?.setAttribute('aria-expanded', 'false');
  });
}

function s12qOutsideClick(e) {
  if (currentScreen !== 12) return;
  if (!e.target.closest('.mdq-dropdown-wrap')) s12qCloseAllDropdowns();
}

function s12qSelect(n, value) {
  if (s12qDone) return;
  s12qSelections[n] = value;

  const sel = document.getElementById('s12q-selected-' + n);
  if (sel) sel.textContent = mdqOptionText('s12q-list-', value);
  const btn = document.getElementById('s12q-btn-' + n);
  if (btn) {
    btn.removeAttribute('data-empty');
    /* This blank's own first-attempt mark clears the moment it changes —
       same rule as 01-10, S3VD's dropdown half, and every
       DragAndDropQuestion zone. */
    btn.classList.remove('mdq-correct', 'mdq-wrong');
    btn.querySelector('.mdq-check-ico')?.remove();
    btn.querySelector('.mdq-wrong-ico')?.remove();
    const chevron = btn.querySelector('.mdq-chevron');
    if (chevron) chevron.style.display = '';
  }

  s12qCloseAllDropdowns();
  s12qUpdateBar();
}

function s12qUpdateBar() {
  if (s12qDone) return;
  const chk = document.getElementById('s12q-check');
  if (!chk) return;
  const allFilled = [1, 2, 3, 4].every(n => s12qSelections[n] !== null);
  /* Retry gate: re-enable only once at least one blank genuinely DIFFERS
     from the combination just marked wrong — a live comparison. */
  chk.disabled = !allFilled || JSON.stringify(s12qSelections) === s12qLastWrongSnapshot;
}

function s12qCheck() {
  if (s12qDone) { advanceFromS12(); return; }

  s12qAttempts++;

  const results = [1, 2, 3, 4].map(n => ({
    n,
    correct: s12qSelections[n] === S12Q_CORRECT[n]
  }));

  const allCorrect = results.every(r => r.correct);
  /* xAPI 007 q2 (fill-in, 4 blanks) — the same catalogue question on the escape-room path. One
     all-or-nothing verdict; 2 attempts. Answer = the four chosen labels in order. */
  xapiAnswered('007', 'q2', allCorrect, allCorrect || s12qAttempts >= 2,
    [1, 2, 3, 4].map(n => mdqOptionText('s12q-list-', s12qSelections[n])).join(' | '));

  if (allCorrect) {
    results.forEach(r => s12qMarkBlank(r.n, 'correct'));
    s12qShowPopup('correct');
    s12qFinish();
    try { flushResumeSave(); } catch (e) {}   // before this path's return (guide §8.3)
    return;
  }

  if (s12qAttempts === 1) {
    /* First wrong — mark each blank red/green so the learner knows which
       ones to fix (same as 01-10 and part-03 S3VD's dropdown half). Every
       blank stays editable; s12qSelect() clears a blank's own mark the
       moment it changes. */
    s12qShowAttemptFeedback(results);
    s12qShowPopup('retry');
    /* Re-check stays disabled until at least one blank changes */
    s12qLastWrongSnapshot = JSON.stringify(s12qSelections);
    const chk = document.getElementById('s12q-check');
    if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
    try { flushResumeSave(); } catch (e) {}   // before this path's return (guide §8.3)
    return;
  }

  /* Capture every blank's final selection and correctness BEFORE any reveal
     overwrites a wrong one -- this is the only place they still exist. Then
     resolve straight into the solution view; the question is complete now. */
  s12qAnswer = {};
  results.forEach(r => { s12qAnswer[r.n] = { value: s12qSelections[r.n], correct: r.correct }; });
  s12qView = 'solution';
  s12qApplyView();
  s12qFinish();
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

/* First-attempt per-blank feedback -- see S10's own version of this
   contract; kept byte-identical here. */
function s12qShowAttemptFeedback(results) {
  results.forEach(r => {
    const btn = document.getElementById('s12q-btn-' + r.n);
    if (!btn) return;
    btn.classList.remove('mdq-correct', 'mdq-wrong');
    btn.querySelector('.mdq-check-ico')?.remove();
    btn.querySelector('.mdq-wrong-ico')?.remove();
    btn.classList.add(r.correct ? 'mdq-correct' : 'mdq-wrong');
    btn.insertAdjacentHTML('beforeend', r.correct ? S12Q_CHECK_SVG : S12Q_WRONG_SVG);
  });
}

/* Resolved-state rendering of one blank -- see S10's own version of this
   contract; kept byte-identical here. */
function s12qMarkBlank(n, state) {
  const btn     = document.getElementById('s12q-btn-' + n);
  const sel     = document.getElementById('s12q-selected-' + n);
  const chevron = btn?.querySelector('.mdq-chevron');
  if (!btn || !sel) return;

  btn.classList.remove('mdq-correct', 'mdq-wrong');
  btn.querySelector('.mdq-check-ico')?.remove();
  btn.querySelector('.mdq-wrong-ico')?.remove();
  btn.disabled = true;

  if (state === 'answer') {
    sel.textContent = mdqOptionText('s12q-list-', s12qAnswer[n].value);
    btn.removeAttribute('data-empty');
    btn.classList.add('mdq-wrong');
    /* Client QA: never show the chevron once the answer is final and the
       blank is locked (btn.disabled above) — this view can't be edited. */
    if (chevron) chevron.style.display = 'none';
    btn.insertAdjacentHTML('beforeend', S12Q_WRONG_SVG);
  } else {
    if (state === 'solution') { sel.textContent = mdqOptionText('s12q-list-', S12Q_CORRECT[n]); btn.removeAttribute('data-empty'); }
    btn.classList.add('mdq-correct');
    if (chevron) chevron.style.display = 'none';
    btn.insertAdjacentHTML('beforeend', S12Q_CHECK_SVG);
  }
}

/* Single owner of the resolved-wrong state for all four blanks and the
   popup -- see S10's own version of this contract. */
function s12qApplyView() {
  if (s12qAnswer === null) return;
  [1, 2, 3, 4].forEach(n => {
    const a = s12qAnswer[n];
    s12qMarkBlank(n, a.correct ? 'correct' : (s12qView === 'answer' ? 'answer' : 'solution'));
  });
  s12qShowPopup('wrong2', s12qView);
}

/* Pure view switch -- never routes through s12qCheck(), never touches
   s12qAttempts or the done lock. */
function s12qToggleView() {
  if (s12qAnswer === null) return;
  s12qView = (s12qView === 'solution') ? 'answer' : 'solution';
  s12qApplyView();
}

function s12qFinish() {
  s12qDone = true;
  [1, 2, 3, 4].forEach(n => {
    const btn = document.getElementById('s12q-btn-' + n);
    if (btn) btn.disabled = true;
  });
  const chk = document.getElementById('s12q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
}

function s12qShowPopup(type, view) {
  const popup = document.getElementById('s12q-popup');
  if (!popup) return;
  s12qCloseAllDropdowns();
  const base = S12Q_POPUP_CFG[type];
  const cfg  = (view === 'answer' && base.answerView)
             ? Object.assign({}, base, base.answerView)
             : base;
  popup.style.background = cfg.bg;
  if (popup.classList.contains('hidden')) resetPopupPosition(popup);
  const titleEl = document.getElementById('s12q-popup-title');
  if (titleEl) titleEl.textContent = cfg.title;
  const bodyEl = document.getElementById('s12q-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  renderPopupAction('s12q-popup', cfg.action, s12qToggleView);
  popup.classList.remove('hidden');
  clampPopup(popup);
}


function s12qPopupMouseDown(e) {
  if (e.target && e.target.closest && e.target.closest('.popup-action')) return;
  s12qPopupDragging = true;
  const popup = document.getElementById('s12q-popup');
  const app   = document.getElementById('app');
  if (!popup || !app) return;
  const appLeft = parseFloat(app.style.left)  || 0;
  const appTop  = parseFloat(app.style.top)   || 0;
  const scaleM  = app.style.transform.match(/scale\(([^)]+)\)/);
  const scale   = scaleM ? parseFloat(scaleM[1]) : 1;
  const canvasX = (e.clientX - appLeft) / scale;
  const canvasY = (e.clientY - appTop)  / scale;
  const topPx = parseFloat(popup.style.top);
  const top = isNaN(topPx) ? popup.offsetTop : topPx;
  popup.style.top    = top + 'px';
  popup.style.bottom = 'auto';
  s12qPopupOffX = canvasX - (parseFloat(popup.style.left) || 2);
  s12qPopupOffY = canvasY - top;
  e.preventDefault();
}

function advanceFromS12() {
  if (!s12qDone) return;
  s13EntryScreen = 12;   // S13's חזרה returns to the path it came from
  goTo(13);
}

/* ═══════════════════════════════════════════════════════════
   S12 — OrderedDragAndDropQuestion (slide 19)
   Sequencing variant of DragAndDropQuestion — order the 5 steps of
   measuring liquid volume into numbered zones. 2 attempts, hint
   visible from the start (producer note). Ported from Target-01's
   S11 (the reference named in notesSlide19), namespaced s12ddq*.
   ═══════════════════════════════════════════════════════════ */

const S12DDQ = {
  // Correct order — producer notes (notesSlide19):
  //   1 בחירת כלי מדידה · 2 מדידה בגובה העיניים · 3 חזרתיות — ביצוע
  //   3 מדידות · 4 בדיקת מהימנות · 5 חישוב ממוצע
  correctMap: {
    'target-s12-1': 'drag-s12-klei',
    'target-s12-2': 'drag-s12-eynayim',
    'target-s12-3': 'drag-s12-hazara',
    'target-s12-4': 'drag-s12-mehemanut',
    'target-s12-5': 'drag-s12-memuza'
  },
  maxAttempts: 2,
  feedbackText: {
    retry: {
      bg: '#ffdbdc', titleColor: '#303030',
      title: ['الإجابة ليست صحيحة بالكامل.'],
      body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
    },
    correct: {
      bg: '#edf8ed', titleColor: '#222222',
      title: ['الإجابة صحيحة. كل الاحترام.'],
      body: []
    },
    wrong2: {
      bg: '#ffdbdc', titleColor: '#303030',
      title: ['الإجابة ليست صحيحة بالكامل،', 'الإجابة الصحيحة تَظهَر الآن.'],
      body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هيّا نواصل التعلّم.'],
      /* One outcome, two views -- see part 06 S3's wrong2 for the full
         pattern. The answer view's copy is fixed and canonical, unlike the
         base's own pedagogical explanation. */
      action: { label: 'الانتقال إلى إجابتي', view: 'answer' },
      answerView: {
        title: ['الإجابة غير صحيحة.'],
        body:  ['يمكن مشاهدة الحل الصحيح مرة أخرى‎.'],
        action: { label: 'الإجابة الصحيحة', view: 'solution' }
      }
    }
  }
};

const s12ddqPlacement = {
  'drag-s12-klei':      'source',
  'drag-s12-hazara':    'source',
  'drag-s12-memuza':    'source',
  'drag-s12-eynayim':   'source',
  'drag-s12-mehemanut': 'source'
};
let s12ddqChecked      = false;
let s12ddqDone         = false;
let s12ddqAttempts     = 0;
let s12ddqShowFeedback = false;
/* JSON snapshot of s12ddqPlacement as of the last non-final wrong attempt —
   gates the check button disabled until the placement actually changes. */
let s12ddqLastWrongSnapshot = null;
let s12ddqDnd          = null;   // pointer-DnD controller
let s12ddqPopupDragging = false;
let s12ddqPopupOffX = 0, s12ddqPopupOffY = 0;

/* ── Final-attempt solution/answer toggle -- see part 06 S3 for the full
   contract and part 01 S3ddq for the placement-map shape this mirrors.
   s12ddqAnswer  copy of s12ddqPlacement at the moment of final-wrong submit,
                taken before s12ddqRevealCorrect() mutates the live map.
   s12ddqView   'solution' | 'answer'. Runtime only -- reset in s12ddqEnter(). */
let s12ddqAnswer = null;
let s12ddqView   = 'solution';

/* ── Render — placement state → DOM ───────────────────────── */
function s12ddqRender() {
  s12ddqInitDnd();

  // Source tray: hide (ghost) every card that was dragged out; the slot
  // keeps its space so the tray order stays stable.
  Object.keys(s12ddqPlacement).forEach(dragId => {
    const card = document.getElementById(dragId);
    if (!card) return;
    card.classList.toggle('ghost', s12ddqPlacement[dragId] !== 'source');
  });

  // Drop targets
  Object.keys(S12DDQ.correctMap).forEach(targetId => {
    const zone = document.getElementById(targetId);
    if (!zone) return;
    zone.querySelector('.s12ddq-placed-card')?.remove();

    const dragId = Object.keys(s12ddqPlacement).find(k => s12ddqPlacement[k] === targetId);

    if (dragId) {
      const placedCard = document.createElement('div');
      placedCard.className = 's12ddq-placed-card';
      const textEl = document.createElement('span');
      textEl.className = 's12ddq-card-text';
      textEl.textContent = document.getElementById(dragId)
        ?.querySelector('.s12ddq-card-text')?.textContent || '';
      placedCard.appendChild(textEl);
      if (!s12ddqChecked) s12ddqDnd.attachSource(placedCard, dragId);
      zone.appendChild(placedCard);
      if (s12ddqChecked) {
        zone.classList.remove('occupied');
        zone.classList.add('s12ddq-correct');
      } else {
        zone.classList.add('occupied');
      }
    } else {
      zone.classList.remove('occupied', 'drag-over');
    }
  });

  s12ddqUpdateCheck();
}

/* ── Pointer DnD setup — runs once, idempotent ───────────── */
function s12ddqInitDnd() {
  if (s12ddqDnd) return;
  s12ddqDnd = createPointerDnd({
    canDrag: (dragId, elem) => {
      if (s12ddqChecked) return false;
      if (elem.id === dragId) return s12ddqPlacement[dragId] === 'source';
      return true; // placed card
    },
    onPick: (dragId) => {
      // Picking up a card is the start of correcting the answer —
      // dismiss a visible retry popup alongside the drag (same click).
      dismissRetryPopup('s12ddq-popup', s12ddqDone);
      s12ddqClearAttemptFeedback();
      if (s12ddqPlacement[dragId] !== 'source') {
        s12ddqPlacement[dragId] = 'source';
        s12ddqRender();
      }
      document.getElementById(dragId)?.classList.add('dragging');
    },
    onDrop: (dragId, targetId) => {
      const evicted = Object.keys(s12ddqPlacement).find(k => s12ddqPlacement[k] === targetId);
      if (evicted && evicted !== dragId) s12ddqPlacement[evicted] = 'source';
      s12ddqPlacement[dragId] = targetId;
      s12ddqRender();
    },
    onCancel: () => {
      s12ddqRender();
    },
  });
  Object.keys(s12ddqPlacement).forEach(id => {
    const el = document.getElementById(id);
    if (el) s12ddqDnd.attachSource(el, id);
  });
  document.querySelectorAll('#s13 .s12ddq-target').forEach(el => {
    s12ddqDnd.attachTarget(el, el.id);
  });
}

/* ── Check gate ───────────────────────────────────────────── */
function s12ddqAllFilled() {
  return Object.keys(S12DDQ.correctMap).every(tId =>
    Object.keys(s12ddqPlacement).some(dId => s12ddqPlacement[dId] === tId)
  );
}

function s12ddqUpdateCheck() {
  if (s12ddqChecked) return;
  const btn = document.getElementById('s12ddq-check');
  /* Retry gate: re-enable only once the placement genuinely DIFFERS from
     the one just marked wrong — a live comparison, not a one-shot flag. */
  if (btn) {
    btn.disabled = !s12ddqAllFilled() ||
      JSON.stringify(s12ddqPlacement) === s12ddqLastWrongSnapshot;
  }
}

/* ── Check answers ────────────────────────────────────────── */
function s12ddqCheck() {
  if (s12ddqDone) { advanceScreen(); return; }
  if (!s12ddqAllFilled()) return;

  s12ddqClearAttemptFeedback();
  s12ddqAttempts++;

  const allCorrect = Object.keys(S12DDQ.correctMap).every(
    tId => s12ddqPlacement[S12DDQ.correctMap[tId]] === tId
  );
  /* xAPI 008 q1 (sequencing), after allCorrect is final. Answer = the learner's order: the card
     text placed in slots 1..5. */
  xapiAnswered('008', 'q1', allCorrect, allCorrect || s12ddqAttempts >= S12DDQ.maxAttempts,
    Object.keys(S12DDQ.correctMap).map((tId, i) => {
      const card = Object.keys(s12ddqPlacement).find(c => s12ddqPlacement[c] === tId);
      const el = card && document.getElementById(card);
      return (i + 1) + '. ' + (el ? el.textContent.replace(/\s+/g, ' ').trim() : '—');
    }).join(' | '));

  if (allCorrect) {
    s12ddqChecked = true;
    s12ddqDone    = true;
    s12ddqRender();
    s12ddqLock();
    s12ddqShowFeedbackIcons(true);
    s12ddqShowPopup('correct');
    s12ddqFinish();
  } else if (s12ddqAttempts >= S12DDQ.maxAttempts) {
    s12ddqChecked = true;
    s12ddqDone    = true;
    /* Capture the learner's final placement BEFORE the reveal overwrites it --
       this is the only place it still exists. Then resolve straight into the
       solution view; the question is complete at this moment. */
    s12ddqAnswer = Object.assign({}, s12ddqPlacement);
    s12ddqView   = 'solution';
    s12ddqApplyView();
    s12ddqFinish();
  } else {
    // First wrong attempt — per-zone feedback, allow retry
    s12ddqShowFeedback = true;
    s12ddqShowFeedbackIcons(false);
    /* Re-check stays disabled until the placement actually changes */
    s12ddqLastWrongSnapshot = JSON.stringify(s12ddqPlacement);
    s12ddqUpdateCheck();
    s12ddqShowPopup('retry');
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

/* ── Lock dragging after final check ─────────────────────── */
function s12ddqLock() {
  Object.keys(s12ddqPlacement).forEach(id => {
    document.getElementById(id)?.classList.add('locked');
  });
}

/* ── Reveal correct answer ────────────────────────────────── */
function s12ddqRevealCorrect() {
  Object.keys(S12DDQ.correctMap).forEach(tId => {
    s12ddqPlacement[S12DDQ.correctMap[tId]] = tId;
  });
  s12ddqRender();
}

/* ── Finish — update CTA, hide hint ──────────────────────── */
function s12ddqFinish() {
  const btn = document.getElementById('s12ddq-check');
  if (btn) { btn.textContent = 'متابعة'; btn.disabled = false; }
  const hint = document.getElementById('s12ddq-hint');
  if (hint) hint.style.visibility = 'hidden';
  document.getElementById('s12ddq-hint-overlay')?.classList.add('hidden');
}

/* ── Feedback icons (32px colored circles per zone, exact Figma vector) ── */
function s12ddqShowFeedbackIcons(allGreen) {
  [1, 2, 3, 4, 5].forEach(i => {
    const tId  = 'target-s12-' + i;
    const zone = document.getElementById(tId);
    if (!zone) return;
    const isCorrect = allGreen ||
      (s12ddqPlacement[S12DDQ.correctMap[tId]] === tId);
    const placedCard = zone.querySelector('.s12ddq-placed-card');
    if (placedCard) {
      placedCard.querySelector('.s12ddq-placed-ficon')?.remove();
      const iconEl = document.createElement('div');
      iconEl.className = 's12ddq-placed-ficon ' +
        (isCorrect ? 's12ddq-placed-ficon--correct' : 's12ddq-placed-ficon--wrong');
      iconEl.innerHTML = isCorrect ? DDQ_BADGE_CHECK_SVG : DDQ_BADGE_WRONG_SVG;
      placedCard.appendChild(iconEl);
    }
    zone.classList.remove('s12ddq-correct', 's12ddq-wrong');
    zone.classList.add(isCorrect ? 's12ddq-correct' : 's12ddq-wrong');
  });
}

function s12ddqClearAttemptFeedback() {
  if (!s12ddqShowFeedback) return;
  s12ddqShowFeedback = false;
  [1, 2, 3, 4, 5].forEach(i => {
    const zone = document.getElementById('target-s12-' + i);
    if (!zone) return;
    zone.querySelector('.s12ddq-placed-ficon')?.remove();
    zone.classList.remove('s12ddq-correct', 's12ddq-wrong');
  });
}

/* Single owner of the resolved-wrong state -- see part 06 S3's
   s3vApplyView() and part 01 S3ddq's own version of this contract. */
function s12ddqApplyView() {
  if (s12ddqAnswer === null) return;
  if (s12ddqView === 'answer') {
    Object.assign(s12ddqPlacement, s12ddqAnswer);
    s12ddqRender();
    s12ddqShowFeedbackIcons(false);   // per-target correctness against the
                                      // learner's own real placement
  } else {
    s12ddqRevealCorrect();           // unchanged; already mutates + renders
    s12ddqShowFeedbackIcons(true);
  }
  s12ddqLock();                      // re-created placed cards need re-locking
  s12ddqShowPopup('wrong2', s12ddqView);
}

/* Pure view switch -- never routes through s12ddqCheck(), never touches
   s12ddqAttempts or the done lock. */
function s12ddqToggleView() {
  if (s12ddqAnswer === null) return;
  s12ddqView = (s12ddqView === 'solution') ? 'answer' : 'solution';
  s12ddqApplyView();
}

/* ── Feedback popup ───────────────────────────────────────── */
function s12ddqShowPopup(type, view) {
  const popup = document.getElementById('s12ddq-popup');
  if (!popup) return;
  const base = S12DDQ.feedbackText[type];
  const cfg  = (view === 'answer' && base.answerView)
             ? Object.assign({}, base, base.answerView)
             : base;
  popup.style.background = cfg.bg;
  /* Reset position only on a genuine open -- see part 06 S3's s3vShowPopup(). */
  if (popup.classList.contains('hidden')) resetPopupPosition(popup);
  const titleEl = document.getElementById('s12ddq-popup-title');
  if (titleEl) {
    titleEl.innerHTML = cfg.title.map(t => `<p>${t}</p>`).join('');
    titleEl.style.color = cfg.titleColor;
  }
  const bodyEl = document.getElementById('s12ddq-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => `<p>${p}</p>`).join('');
  renderPopupAction('s12ddq-popup', cfg.action, s12ddqToggleView);
  popup.classList.remove('hidden');
  clampPopup(popup);
}


function s12ddqPopupMouseDown(e) {
  /* The action button is a control, not a drag handle. Without this guard its
     pointerdown would start a drag AND flip the popup from bottom- to
     top-anchoring. Ported verbatim from part 06's Foundation. */
  if (e.target && e.target.closest && e.target.closest('.popup-action')) return;
  s12ddqPopupDragging = true;
  const popup = document.getElementById('s12ddq-popup');
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
  s12ddqPopupOffX = canvasX - (parseFloat(popup.style.left) || 2);
  s12ddqPopupOffY = canvasY - top;
  e.preventDefault();
}

/* ── Hint overlay — visible from the start (producer note) ── */
function s12ddqOpenHint() {
  if (s12ddqDone) return;
  /* xAPI requested.1 — after the guard, right before the reveal; this function only opens. */
  xapiRequestedHint('008', 'q1');
  document.getElementById('s12ddq-hint-overlay')?.classList.remove('hidden');
}
function s12ddqCloseHint() {
  document.getElementById('s12ddq-hint-overlay')?.classList.add('hidden');
}
function s12ddqCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 's12ddq-hint-overlay') s12ddqCloseHint();
}

/* ── Enter / reset screen state ──────────────────────────── */
function s12ddqEnter() {
  if (s12ddqDone) {
    /* A resolved screen always comes back on the SOLUTION view -- see part 06
       S3's s3vEnter() for the full rationale. s12ddqApplyView() renders,
       locks, sets the feedback icons and reopens the popup with matching
       content in one call. The explicit re-hide below is unchanged from the
       original: goTo()'s SCREEN_DONE step re-shows it right after this
       returns, so the net effect is the same, just via the screen's own
       existing hide-then-unhide sequencing. */
    s12ddqView = 'solution';
    s12ddqApplyView();
    const btn = document.getElementById('s12ddq-check');
    if (btn) { btn.textContent = 'متابعة'; btn.disabled = false; }
    const hint = document.getElementById('s12ddq-hint');
    if (hint) hint.style.visibility = 'hidden';
    document.getElementById('s12ddq-popup')?.classList.add('hidden');
    return;
  }

  // Full reset for fresh entry
  s12ddqChecked      = false;
  s12ddqAttempts     = 0;
  s12ddqShowFeedback = false;
  s12ddqLastWrongSnapshot = null;
  s12ddqAnswer       = null;
  s12ddqView         = 'solution';
  Object.keys(s12ddqPlacement).forEach(id => { s12ddqPlacement[id] = 'source'; });

  Object.keys(S12DDQ.correctMap).forEach(tId => {
    const zone = document.getElementById(tId);
    if (!zone) return;
    zone.classList.remove('s12ddq-correct', 's12ddq-wrong', 'occupied', 'drag-over');
    zone.querySelector('.s12ddq-placed-card')?.remove();
  });

  Object.keys(s12ddqPlacement).forEach(id => {
    document.getElementById(id)?.classList.remove('ghost', 'dragging', 'locked');
  });

  const btn = document.getElementById('s12ddq-check');
  if (btn) { btn.textContent = 'هل إجابتي صحيحة؟'; btn.disabled = true; }

  const hint = document.getElementById('s12ddq-hint');
  if (hint) { hint.style.visibility = ''; hint.disabled = false; }

  document.getElementById('s12ddq-popup')?.classList.add('hidden');
  document.getElementById('s12ddq-hint-overlay')?.classList.add('hidden');

  s12ddqRender();
}


/* ═══════════════════════════════════════════════════════════
   S13 — TransitionScreen (slide 20)
   Ported from Target-01's S7 (the reference named in notesSlide20).
   Companion character video — Sporty variant, resolved per the S0
   selection on every entry; plays once, freezes on its rest frame.
   No gate: continue ("קחו אותי לשאלה") is always enabled.
   ═══════════════════════════════════════════════════════════ */
const S13_CHARACTER_VIDEOS = {
  'character-1': 'assets/video/Character-1-Sporty.mp4',
  'character-2': 'assets/video/Character-2-Sporty.mp4'
};

function s13trEnter() {
  const vid = document.getElementById('s13tr-video');
  if (!vid) return;
  const char = window.lomdaState.selectedCharacter || 'character-1';
  const src  = S13_CHARACTER_VIDEOS[char] || S13_CHARACTER_VIDEOS['character-1'];
  if (!vid.src || !vid.src.endsWith(src)) {
    vid.src = src;
    vid.load();
  }
  vid.play().catch(() => {});
  freezeVideoOnEnd(vid);
}

function advanceFromS13() {
  goTo(15);
}


/* ═══════════════════════════════════════════════════════════
   S14 — SingleChoiceQuestion "תרופה לתינוק" (slide 21)
   Same state machine as S1's SCQ, namespaced s14q*. Text options
   (user decision), correct: מזרק. 2 attempts, hint from the start.
   ═══════════════════════════════════════════════════════════ */
const S14Q = { correctId: 'syringe', maxAttempts: 2 };
let s14qSelected = null;
let s14qAttempts = 0;
let s14qAnswered = false;
let s14qDone     = false;
let s14qLastWrong = null;  // option id marked wrong on a non-final attempt (gates re-check)

const S14Q_POPUP_CFG = {
  retry: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.'],
    body: ['لا بأس، نتعلّم من الأخطاء أيضًا.', 'هل نحاول مرة أخرى؟']
  },
  correct: {
    bg: '#edf8ed',
    title: ['إجابة صحيحة.', 'كل الاحترام!'],
    body: ['محقنة الدواء مصممة لهذا الغرض تحديدًا - من السهل قراءة 2&nbsp; ملل بالضبط، ويمكن حقن الدواء مباشرةً في فم الطفل بدون سكبه‎.']
  },
  wrong2: {
    bg: '#ffdbdc',
    title: ['الإجابة غير صحيحة.', 'الإجابة الصحيحة معلَّمة.'],
    body: ['محقنة الدواء مصممة لهذا الغرض تحديدًا - من السهل قراءة 2&nbsp; ملل بالضبط، ويمكن حقن الدواء مباشرةً في فم الطفل بدون سكبه‎.']
  }
};

function s14qSelect(id) {
  if (s14qAnswered) return;
  dismissRetryPopup('s14q-popup', s14qDone);
  s14qSelected = id;
  if (s14qAttempts > 0) {
    document.querySelectorAll('#s15 .scq-opt').forEach(o => o.classList.remove('wrong', 'correct'));
  }
  document.querySelectorAll('#s15 .scq-opt').forEach(o => {
    const sel = o.dataset.id === id;
    o.classList.toggle('selected', sel);
    o.setAttribute('aria-checked', sel ? 'true' : 'false');
  });
  if (!s14qAnswered) {
    const chk = document.getElementById('s14q-check');
    if (chk) chk.disabled = !s14qSelected || s14qSelected === s14qLastWrong;
  }
}

function s14qCheck() {
  if (s14qAnswered) { advanceScreen(); return; }
  if (!s14qSelected) return;

  s14qAttempts++;
  const isCorrect = s14qSelected === S14Q.correctId;
  { const el = document.querySelector('#s15 .scq-opt[data-id="' + s14qSelected + '"]');
    xapiAnswered('009', 'q1', isCorrect, isCorrect || s14qAttempts >= S14Q.maxAttempts, xapiAnswerText(el)); }

  if (isCorrect) {
    s14qMark(S14Q.correctId, 'correct');
    s14qShowPopup('correct');
    s14qFinish();
  } else if (s14qAttempts >= S14Q.maxAttempts) {
    s14qMark(S14Q.correctId, 'correct');
    s14qMark(s14qSelected, 'wrong');
    s14qShowPopup('wrong2');
    s14qFinish();
  } else {
    s14qMark(s14qSelected, 'wrong');
    /* Re-check stays disabled until the learner picks a DIFFERENT option */
    s14qLastWrong = s14qSelected;
    const chk = document.getElementById('s14q-check');
    if (chk) chk.disabled = true;
    s14qShowPopup('retry');
  }
  try { flushResumeSave(); } catch (e) {}   // after the last commitment, every path (guide §8.3)
}

function s14qMark(id, cls) {
  const opt = document.querySelector('#s15 .scq-opt[data-id="' + id + '"]');
  if (!opt) return;
  opt.classList.remove('selected');
  opt.classList.add(cls);
}

function s14qShowPopup(type) {
  const popup = document.getElementById('s14q-popup');
  if (!popup) return;
  const cfg = S14Q_POPUP_CFG[type];
  popup.style.background = cfg.bg;
  resetPopupPosition(popup);
  const titleEl = document.getElementById('s14q-popup-title');
  if (titleEl) titleEl.innerHTML = cfg.title.map(t => '<p>' + t + '</p>').join('');
  const bodyEl = document.getElementById('s14q-popup-body');
  if (bodyEl) bodyEl.innerHTML = cfg.body.map(p => '<p>' + p + '</p>').join('');
  popup.classList.remove('hidden');
}


function s14qFinish() {
  s14qAnswered = true;
  s14qDone = true;
  document.querySelectorAll('#s15 .scq-opt').forEach(o => { o.disabled = true; });
  const chk = document.getElementById('s14q-check');
  if (chk) { chk.textContent = 'متابعة'; chk.disabled = false; }
  const hint = document.getElementById('s14q-hint');
  if (hint) hint.style.visibility = 'hidden';
}

function s14qOpenHint() {
  if (s14qAnswered) return;
  /* xAPI requested.1 — after the guard, right before the reveal; this function only opens. */
  xapiRequestedHint('009', 'q1');
  document.getElementById('s14q-hint-overlay')?.classList.remove('hidden');
}
function s14qCloseHint() {
  document.getElementById('s14q-hint-overlay')?.classList.add('hidden');
}
function s14qCloseHintOnBackdrop(e) {
  if (e.target && e.target.id === 's14q-hint-overlay') s14qCloseHint();
}

function s14qResetInitial() {
  s14qSelected = null;
  s14qAttempts = 0;
  s14qAnswered = false;
  s14qLastWrong = null;
  document.querySelectorAll('#s15 .scq-opt').forEach(o => {
    o.classList.remove('selected', 'correct', 'wrong');
    o.disabled = false;
    o.setAttribute('aria-checked', 'false');
  });
  document.getElementById('s14q-popup')?.classList.add('hidden');
  const chk = document.getElementById('s14q-check');
  if (chk) { chk.textContent = 'هل إجابتي صحيحة؟'; chk.disabled = true; }
  const hint = document.getElementById('s14q-hint');
  if (hint) { hint.disabled = false; hint.style.visibility = ''; }
}

let s14qPopupDragging = false;
let s14qPopupOffX = 0, s14qPopupOffY = 0;

function s14qPopupMouseDown(e) {
  s14qPopupDragging = true;
  const popup = document.getElementById('s14q-popup');
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
  s14qPopupOffX = canvasX - (parseFloat(popup.style.left) || 2);
  s14qPopupOffY = canvasY - top;
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

if (window.Motion) Motion.reveal(document.querySelector('.screen.active'));
// S0 loads .active straight from HTML on first paint (no goTo(0) call), so
// resetScreenState(0) never runs for it — wire the card videos' freeze here too.
if (document.getElementById('s0')?.classList.contains('active')) s0PlaySelectionVideos();
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

/* Deep link: '#last' lands on this part's final screen — used by part 02's
   S0 back button to return here. Placed at module bottom so every sNEnter()
   and the module state they read are already initialized. */
if (location.hash === '#last') goTo(TOTAL_SCREENS - 1);

/* ═══════════════════ xAPI (720) — this part's config ═══════════════════
   Data only; the shared layer in ../unit-js/ reads it at call time (guide §6.1).
   ⚠️ SCREEN_TO_SUBCONTENT must hold exactly TOTAL_SCREENS keys (16), 0..15.
   S6 lets the learner pick a path, and both paths belong to item 007 ("the correct liquid-volume
   measuring process"), which declares q1 (reading at eye level, S8) and q2 (the four-blank
   sentence). The scratch-card path is S7 S8 S9 S10; the escape-room path is S11 S12. q2 is asked
   on BOTH paths (S10 / S12, the same sentence); q1 only on the scratch-card path — so an
   escape-room learner never answers 007 q1. That gap is by path design (guide D-5), decided
   2026-09-28, not an omission. */
var SCREEN_TO_SUBCONTENT = {
  0:  ['001', 1],   // character choice (landing screen — opened by the loader)
  1:  ['002', 1],   // SingleChoice — which glass holds more
  2:  ['003', 1],   // flip cards — small-volume tools
  3:  ['004', 1],   // drag and drop — tool per purpose (matching)
  4:  ['005', 1],   // flip cards — large-volume tools
  5:  ['006', 1],   // image cards — tool for 100 ml
  6:  ['007', 1],   // learning-path choice (scratch cards / escape room)
  7:  ['007', 2],   // scratch path: scratch cards
  8:  ['007', 3],   // scratch path: hotspot — who reads at eye level (q1)
  9:  ['007', 4],   // scratch path: scratch cards
  10: ['007', 5],   // scratch path: four-blank sentence (q2)
  11: ['007', 6],   // escape path: escape room
  12: ['007', 7],   // escape path: four-blank sentence (q2)
  13: ['008', 1],   // ordering — the measuring steps (sequencing)
  14: null,         // transition
  15: ['009', 1]    // SingleChoice warm-up — medicine for a baby
};

var XAPI_COMP_SLUG     = 'methodica-science-volume-liquid-01-01';
var XAPI_COMP_ID       = XAPI_ID_PREFIX + XAPI_COMP_SLUG + '/';
var XAPI_EVAL_ITEMS    = { '002': 1, '004': 1, '006': 1, '007': 1, '008': 1, '009': 1 };
var XAPI_METADATA_FILE = '../metadata/methodica-science-volume-liquid-01-01.json';
var XAPI_END_BTN       = 's14q-check';   // S15 "שנמשיך?" — the part's last click (D-8)

/* ═══════════════════ Resume (720) — the four per-part hooks ═══════════════════
   Guide §8.7. What is saved mirrors what this part already keeps across a screen change:
   - single-choice and drag questions: their COMMITTED state (their enter function resets an
     unanswered one on every entry);
   - flip cards, scratch cards, the escape room and the four-blank dropdowns: their progress as
     it stands, answered or not, because their enter functions repaint it on every entry;
   - the chosen learning path and the screens each branch was entered from (goBack uses them).
   The character is not here: it lives beside the payload, in ui.character (40-resume.js). */
const _rsClone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
function capturePartPayload() {
  const sc = (a, ans, d, sel) => ({ a: a, ans: ans, d: d, sel: sel });
  const dd = (plc, chk, d, a, fb, ans, view) => ({ plc: _rsClone(plc), chk: chk, d: d, a: a, fb: fb, answer: _rsClone(ans), view: view });
  const bl = (sel, a, d, ans, view) => ({ sel: _rsClone(sel), a: a, d: d, answer: _rsClone(ans), view: view });
  return {
    currentScreen: currentScreen,
    xq: rsCaptureXq(),
    style: window.lomdaState.selectedLearningStyle,
    entry: { s10: s10EntryScreen, s11: s11erEntryScreen, s13: s13EntryScreen, s11ret: s11erReturnScratch },
    scq:  sc(scqAttempts, scqAnswered, scqDone, scqSelected),
    s5q:  sc(s5qAttempts, s5qAnswered, s5qDone, s5qSelected),
    s8q:  sc(s8qAttempts, s8qAnswered, s8qDone, s8qSelected),
    s14q: sc(s14qAttempts, s14qAnswered, s14qDone, s14qSelected),
    frc:   { rev: _rsClone(frcRevealed), flip: _rsClone(frcFlipped), d: frcDone },
    s4frc: { rev: _rsClone(s4frcRevealed), flip: _rsClone(s4frcFlipped), d: s4frcDone },
    s7sc:  { rev: _rsClone(s7scRevealed), d: s7scDone },
    s9sc:  { rev: _rsClone(s9scRevealed), d: s9scDone },
    s11er: { opened: _rsClone(s11erOpened), d: s11erDone },
    s3ddq:  dd(s3ddqPlacement, s3ddqChecked, s3ddqDone, s3ddqAttempts, s3ddqShowFeedback, s3ddqAnswer, s3ddqView),
    s12ddq: dd(s12ddqPlacement, s12ddqChecked, s12ddqDone, s12ddqAttempts, s12ddqShowFeedback, s12ddqAnswer, s12ddqView),
    s10q: bl(s10qSelections, s10qAttempts, s10qDone, s10qAnswer, s10qView),
    s12q: bl(s12qSelections, s12qAttempts, s12qDone, s12qAnswer, s12qView)
  };
}
function applyResumeVars(st) {
  if (!st) return;
  rsRestoreXq(st.xq);
  if (st.style) window.lomdaState.selectedLearningStyle = st.style;
  if (st.entry) {
    if (typeof st.entry.s10 === 'number') s10EntryScreen = st.entry.s10;
    if (typeof st.entry.s11 === 'number') s11erEntryScreen = st.entry.s11;
    if (typeof st.entry.s13 === 'number') s13EntryScreen = st.entry.s13;
    if (typeof st.entry.s11ret !== 'undefined') s11erReturnScratch = st.entry.s11ret;
  }
  const done = k => (st[k] && st[k].d) ? st[k] : null;
  let s;
  if ((s = done('scq')))  { scqAttempts = s.a; scqAnswered = s.ans; scqDone = true; scqSelected = s.sel; }
  if ((s = done('s5q')))  { s5qAttempts = s.a; s5qAnswered = s.ans; s5qDone = true; s5qSelected = s.sel; }
  if ((s = done('s8q')))  { s8qAttempts = s.a; s8qAnswered = s.ans; s8qDone = true; s8qSelected = s.sel; }
  if ((s = done('s14q'))) { s14qAttempts = s.a; s14qAnswered = s.ans; s14qDone = true; s14qSelected = s.sel; }
  if ((s = st.frc))   { frcRevealed = _rsClone(s.rev) || frcRevealed; frcFlipped = _rsClone(s.flip) || frcFlipped; frcDone = !!s.d; }
  if ((s = st.s4frc)) { s4frcRevealed = _rsClone(s.rev) || s4frcRevealed; s4frcFlipped = _rsClone(s.flip) || s4frcFlipped; s4frcDone = !!s.d; }
  if ((s = st.s7sc))  { s7scRevealed = _rsClone(s.rev) || s7scRevealed; s7scDone = !!s.d; }
  if ((s = st.s9sc))  { s9scRevealed = _rsClone(s.rev) || s9scRevealed; s9scDone = !!s.d; }
  if ((s = st.s11er)) { s11erOpened = Object.assign({}, s11erOpened, s.opened || {}); s11erDone = !!s.d; }
  if ((s = done('s3ddq')))  { rsAssign(s3ddqPlacement, s.plc); s3ddqChecked = s.chk; s3ddqDone = true; s3ddqAttempts = s.a;
                              s3ddqShowFeedback = s.fb; s3ddqAnswer = _rsClone(s.answer) || null; s3ddqView = s.view || 'solution'; }
  if ((s = done('s12ddq'))) { rsAssign(s12ddqPlacement, s.plc); s12ddqChecked = s.chk; s12ddqDone = true; s12ddqAttempts = s.a;
                              s12ddqShowFeedback = s.fb; s12ddqAnswer = _rsClone(s.answer) || null; s12ddqView = s.view || 'solution'; }
  /* The four-blank sentences keep pending picks across entries (their enter repaints them), so a
     reload keeps them too — but the Retry gate's snapshot is cleared on every entry, as live. */
  if ((s = st.s10q)) { s10qSelections = Object.assign({}, s10qSelections, s.sel || {}); s10qAttempts = s.a || 0; s10qDone = !!s.d;
                       s10qAnswer = _rsClone(s.answer) || null; s10qView = s.view || 'solution'; }
  if ((s = st.s12q)) { s12qSelections = Object.assign({}, s12qSelections, s.sel || {}); s12qAttempts = s.a || 0; s12qDone = !!s.d;
                       s12qAnswer = _rsClone(s.answer) || null; s12qView = s.view || 'solution'; }
}
function applyResumeDom(st) {}   // every screen here repaints from its variables
/* The two drag boards: a correct board is repainted as its final check left it (cards on their
   targets, locked, green icons, popup); a wrong final one is the reveal toggle, in the current
   view (applyView owns the board and the popup). */
function _rsPaintDnd(done, answer, render, lock, icons, showPopup, applyView, finish) {
  if (!done) return;
  if (answer === null) { render(); lock(); icons(true); showPopup('correct'); }
  else applyView();
  finish();
}
/* The four-blank sentences: a correct one shows the learner's four labels, each marked correct;
   a wrong final one is the reveal toggle in the current view. */
function _rsPaintBlanks(done, answer, prefix, selections, markBlank, showPopup, applyView, finish) {
  if (!done) return;
  if (answer === null) {
    [1, 2, 3, 4].forEach(n => {
      const sel = document.getElementById(prefix + '-selected-' + n);
      if (sel && selections[n] != null) sel.textContent = mdqOptionText(prefix + '-list-', selections[n]);
      document.getElementById(prefix + '-btn-' + n)?.removeAttribute('data-empty');
      markBlank(n, 'correct');
    });
    showPopup('correct');
  } else applyView();
  finish();
}
/* Must never throw (rule 7): guarded; unanswered screens and the progress screens (flip, scratch,
   escape room, choices) are painted by their own enter functions from the restored variables. */
function restoreScreenUI(n) {
  try {
    if (n === 1)  rsPaintChoice({ done: scqDone, selected: scqSelected, correctId: SCQ.correctId, optSel: '#s1 .scq-opt',
      mark: scqMark, showPopup: scqShowPopup, finish: scqFinish });
    if (n === 3)  _rsPaintDnd(s3ddqDone, s3ddqAnswer, s3ddqRender, s3ddqLock, s3ddqShowFeedbackIcons,
      t => s3ddqShowPopup(t), s3ddqApplyView, s3ddqFinish);
    if (n === 5)  rsPaintChoice({ done: s5qDone, selected: s5qSelected, correctId: S5Q.correctId, optSel: '#s5 .s5q-card',
      mark: s5qMark, showPopup: s5qShowPopup, finish: s5qFinish });
    if (n === 8)  rsPaintChoice({ done: s8qDone, selected: s8qSelected, correctId: S8Q.correctId, optSel: '#s8 .s8q-hotspot',
      mark: s8qMark, showPopup: s8qShowPopup, finish: s8qFinish });
    if (n === 10) _rsPaintBlanks(s10qDone, s10qAnswer, 's10q', s10qSelections, s10qMarkBlank, t => s10qShowPopup(t), s10qApplyView, s10qFinish);
    if (n === 12) _rsPaintBlanks(s12qDone, s12qAnswer, 's12q', s12qSelections, s12qMarkBlank, t => s12qShowPopup(t), s12qApplyView, s12qFinish);
    if (n === 13) _rsPaintDnd(s12ddqDone, s12ddqAnswer, s12ddqRender, s12ddqLock, s12ddqShowFeedbackIcons,
      t => s12ddqShowPopup(t), s12ddqApplyView, s12ddqFinish);
    if (n === 15) rsPaintChoice({ done: s14qDone, selected: s14qSelected, correctId: S14Q.correctId, optSel: '#s15 .scq-opt',
      mark: s14qMark, showPopup: s14qShowPopup, finish: s14qFinish });
  } catch (e) { console.error('[resume] restoreScreenUI ' + n, e); }
}