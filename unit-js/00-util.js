/* ═══════════════════════════════════════════════════════════
   unit-js/00-util.js  —  small shared helpers (character choice, video rest frame).
   Loaded by: all seven parts, BEFORE js/main.js. Declarations only: nothing runs at
   load. These functions were byte-identical (comments/whitespace aside) in
   every part that had them and were moved here verbatim; they read the
   part's own globals (LOMDA_ID, THIS_PART, NAV_STACK_KEY, currentScreen …)
   at call time. Never re-declare one of these names in a part's main.js.
   ═══════════════════════════════════════════════════════════ */

/* ─── Character carry-over (chosen in part 01, read by every part) ──
   Through the resume layer (40-resume.js getUnitCharacter): this component's state document
   first, then the per-unit same-browser mirror UI_CHARACTER_KEY — never the origin-wide
   'lomda_selectedCharacter', which other units share with incompatible values (QA D-6). Only
   this unit's two characters are accepted; anything else falls back to the default. */
function getCharacter() {
  let c = null;
  try {
    c = (typeof getUnitCharacter === 'function') ? getUnitCharacter()
      : localStorage.getItem(typeof UI_CHARACTER_KEY !== 'undefined' ? UI_CHARACTER_KEY : '');
  } catch (e) {}
  return (c === 'character-1' || c === 'character-2') ? c : 'character-1';
}

/* Companion videos play once (no loop). Freeze on the clean opening
   frame instead of dropping into the player's black "ended" state. */
function freezeVideoOnEnd(vid) {
  if (!vid || vid._freezeWired) return;
  vid._freezeWired = true;
  function showRestFrame() { try { vid.currentTime = 0; } catch (e) {} vid.pause(); }
  vid.addEventListener('timeupdate', function () {
    if (vid.duration && vid.currentTime >= vid.duration - 0.3) showRestFrame();
  });
  vid.addEventListener('ended', showRestFrame);
}
