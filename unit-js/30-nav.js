/* ═══════════════════════════════════════════════════════════
   unit-js/30-nav.js  —  cross-part navigation and the back-navigation route stack.
   Loaded by: all seven parts, BEFORE js/main.js. Declarations only: nothing runs at
   load. These functions were byte-identical (comments/whitespace aside) in
   every part that had them and were moved here verbatim; they read the
   part's own globals (LOMDA_ID, THIS_PART, NAV_STACK_KEY, currentScreen …)
   at call time. Never re-declare one of these names in a part's main.js.

   ── The platform owns routing (guide §8.12) ──
   Kata launches every component on its own URL with its own ?registration and
   decides what comes next from the catalogue; a part reports 'completed'
   (xapiEndComponent, 20-xapi.js) and stops. So BOTH hops below move nothing
   unless DEV_NAV (10-identity.js: ?dev=1 and no ?registration) — a hop that
   carried a real launch URL along would report the next component under this
   component's registration. The guard sits here, in the only two functions that
   navigate, so no call site can forget it. Dev hops carry location.search along,
   so ?dev=1 (and a local ?xapiLib stub) survive the walk from part to part.
   ═══════════════════════════════════════════════════════════ */

function navStackRead() {
  try {
    const arr = JSON.parse(sessionStorage.getItem(NAV_STACK_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function navStackWrite(arr) {
  try { sessionStorage.setItem(NAV_STACK_KEY, JSON.stringify(arr)); } catch (e) {}
}

/* Forward hop to another part — records this part as the one to return to.
   DEV_NAV only (see the header). */
function goToPart(folder) {
  if (typeof DEV_NAV === 'undefined' || !DEV_NAV) return;
  const stack = navStackRead();
  stack.push(THIS_PART);
  navStackWrite(stack);
  window.location.href = '../' + folder + '/index.html' + window.location.search;
}

/* Back to the LAST screen of the part the learner actually came from.
   DEV_NAV only (see the header). */
function goToPrevPart() {
  if (typeof DEV_NAV === 'undefined' || !DEV_NAV) return;
  const stack = navStackRead();
  const prev  = stack.pop();
  if (!prev) return;               // opened directly — nowhere to go back to
  navStackWrite(stack);
  window.location.href = '../' + prev + '/index.html' + window.location.search + '#last';
}

function hasPrevPart() { return navStackRead().length > 0; }

/* S0's חזרה only exists when there IS a recorded part to return to.
   (Outside DEV_NAV, 90-boot.js hideCrossPartBack() hides it regardless.) */
function syncS0BackButton() {
  const btn = document.getElementById(S0_BACK_ID);
  if (btn) btn.style.display = hasPrevPart() ? '' : 'none';
}
