/* SHARED COPY, loaded by every part of this unit.
   Source of truth: animation-system skill engine
   (~/.claude/skills/animation-system/engine/motion.js), copied verbatim below.
   To update: replace everything below this banner with the skill's file, then
   bump its ?v= identically in all seven index.html. Never add per-part copies
   (scripts/sync-motion.ps1 used to write seven; it was removed with them). */
/* ═══════════════════════════════════════════════════════════
   Animation System — motion.js
   Canonical engine script — copy verbatim into the target project.
   Companion of engine/motion.css.

   Wiring (two one-line hooks in the project's screen-transition
   function, e.g. goTo(n)):
     1. inside goTo(n):  Motion.cancel(prev)  when leaving,
                         Motion.reveal(next)  after '.active' is added
     2. at initial load: Motion.reveal(document.querySelector('.screen.active'))

   Behavior contract:
   - Opt-in: only screens containing [data-reveal] animate; all
     other screens are untouched.
   - First visit per session only — revisit/back-nav/DEV jumps
     show everything instantly (matches the standard 720 seen-flag
     convention: entrance animations play once per session, not on
     every revisit).
   - prefers-reduced-motion: no animation at all, instant show.
   - Interaction is NOT blocked during entrance by default. Any
     per-screen exception must be justified and documented where
     it is applied.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Screens (by element id) already revealed this session. */
  const seen = new Set();

  function reducedMotion() {
    return window.matchMedia &&
           window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* Read a ms token from motion.css so timing lives in ONE place. */
  function tokenMs(name, fallback) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
    const val = parseFloat(raw);
    if (isNaN(val)) return fallback;
    return raw.indexOf('ms') === -1 ? val * 1000 : val;
  }

  /* Reveal the entering screen's data-reveal groups (first visit only). */
  function reveal(screenEl) {
    if (!screenEl) return;
    const key = screenEl.id || 'screen-' + screenEl.getAttribute('data-screen');
    if (seen.has(key)) return;
    seen.add(key);

    const groups = screenEl.querySelectorAll('[data-reveal]');
    if (!groups.length || reducedMotion()) return;

    screenEl.classList.add('m-animate');

    /* Drop the class once the last group settles: CSS animations
       restart whenever display flips none→block, so leaving the
       class on would replay the reveal on every revisit. End state
       equals the elements' default state, so removal is invisible. */
    let maxGroup = 1;
    groups.forEach(g => {
      maxGroup = Math.max(maxGroup, parseInt(g.getAttribute('data-reveal'), 10) || 1);
    });
    const total = tokenMs('--m-reveal-duration', 600) +
                  (maxGroup - 1) * tokenMs('--m-reveal-stagger', 180) + 80;
    const startCleanup = () => {
      screenEl._mTimer = setTimeout(() => {
        screenEl.classList.remove('m-animate');
        screenEl._mTimer = null;
      }, total);
    };

    /* Initial page load: hold the reveal (paused at its hidden
       from-state) until the page has painted, otherwise the whole
       animation plays during the loading white-screen and looks
       like the content simply appeared. Screen changes after load
       start immediately. */
    if (document.readyState === 'complete') {
      startCleanup();
    } else {
      screenEl.classList.add('m-hold');
      window.addEventListener('load', () => {
        requestAnimationFrame(() => {
          screenEl.classList.remove('m-hold');
          startCleanup();
        });
      }, { once: true });
    }
  }

  /* Cancel a reveal mid-flight (fast navigation / DEV jumps).
     The screen is already in `seen`, so it re-enters instantly. */
  function cancel(screenEl) {
    if (!screenEl) return;
    if (screenEl._mTimer) {
      clearTimeout(screenEl._mTimer);
      screenEl._mTimer = null;
    }
    screenEl.classList.remove('m-animate', 'm-hold');
  }

  /* ── Popup motion: replay on EVERY real open ──────────────
     The CSS rule (.m-popup:not(.hidden)) restarts the fade only when
     display flips none→block. When a popup STAYS OPEN and only its
     content is swapped (e.g. a second wrong-answer attempt reusing
     the same feedback element), there is no display flip and the
     animation never replays. Watch every .m-popup for class flips
     and content changes and restart the animation explicitly via the
     reflow trick below. Style-attribute changes (drag, positioning)
     are NOT observed, so dragging never retriggers the fade. */
  /* Cancel a pending outside-dismiss exit (see dismissPopup below) —
     e.g. a NEW popup opens while the old one is still fading out. */
  function cancelExit(el) {
    if (el._mExitTimer) {
      clearTimeout(el._mExitTimer);
      el._mExitTimer = null;
    }
    el.style.pointerEvents = '';
  }

  function popupRestart(el) {
    cancelExit(el);
    if (reducedMotion()) { el.style.animation = ''; return; }
    el.style.animation = 'none';
    void el.offsetHeight;          // force reflow so the animation resets
    el.style.animation = '';
  }

  /* ── Popup EXIT: outside-dismiss fade-out (optional) ───────
     Only relevant if the consuming project wires a popup dismissal
     that should animate out in parallel with the learner's next
     action (e.g. correcting an answer while feedback is still open —
     the retry-dismissal case, which is the only in-screen way a
     feedback popup goes away; feedback popups have no close button).
     The fade is an INLINE animation so the class/content
     MutationObserver above ignores it; general close paths
     (navigation, and a close button or Escape on the components that
     still have one) should stay instant and never call this. */
  function dismissPopup(el) {
    if (!el || el.classList.contains('hidden')) return;
    if (el._mExitTimer) return;                     // already exiting
    if (reducedMotion()) { el.classList.add('hidden'); return; }
    el.style.animation =
      'm-fade-out var(--m-popup-exit-duration) var(--m-ease) both';
    el.style.pointerEvents = 'none';
    el._mExitTimer = setTimeout(() => {
      el._mExitTimer = null;
      el.classList.add('hidden');
      el.style.animation = '';
      el.style.pointerEvents = '';
    }, tokenMs('--m-popup-exit-duration', 200) + 40);
  }
  function watchPopups() {
    document.querySelectorAll('.m-popup').forEach(el => {
      let scheduled = false;
      const restart = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          if (!el.classList.contains('hidden')) popupRestart(el);
        });
      };
      new MutationObserver(restart).observe(el, {
        attributes: true, attributeFilter: ['class'],
        childList: true, subtree: true, characterData: true
      });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchPopups);
  } else {
    watchPopups();
  }

  window.Motion = { reveal, cancel, dismissPopup };
})();
