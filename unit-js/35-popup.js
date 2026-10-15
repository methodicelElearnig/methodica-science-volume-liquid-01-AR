/* ═══════════════════════════════════════════════════════════
   unit-js/35-popup.js  —  feedback-popup helpers (dismiss, reset position, action button, clamp).
   Loaded by: parts 01, 02, 03, 05, 06, 07 (04 has no feedback popups), BEFORE js/main.js. Declarations only: nothing runs at
   load. These functions were byte-identical (comments/whitespace aside) in
   every part that had them and were moved here verbatim; they read the
   part's own globals (LOMDA_ID, THIS_PART, NAV_STACK_KEY, currentScreen …)
   at call time. Never re-declare one of these names in a part's main.js.
   ═══════════════════════════════════════════════════════════ */

function dismissRetryPopup(popupId, done) {
  if (done) return;
  const popup = document.getElementById(popupId);
  if (!popup) return;
  // Motion branch: gentle fade-out (Motion.dismissPopup). Without the
  // motion module the close stays instant — same functional behavior.
  if (window.Motion && Motion.dismissPopup) Motion.dismissPopup(popup);
  else popup.classList.add('hidden');
}

/* ── resetPopupPosition — STANDARD for all draggable feedback popups ────────
   Every feedback popup must reset to its CSS-defined default position each
   time it opens, even if the learner previously dragged it elsewhere. ── */
function resetPopupPosition(popup) {
  popup.style.left   = '2px';
  popup.style.top    = 'auto';
  popup.style.bottom = '76px';
}

/* Render (or update, or remove) the action button inside a feedback popup.
   `action` is { label, view } or null/undefined to remove the button.
   Idempotent: re-rendering the same action is a no-op, and re-rendering a
   different one relabels in place rather than rebuilding. Ported verbatim
   from part 06's Foundation -- see there for the full rationale (label
   emitted pre-wrapped in .nav-label rather than via textContent). */
function renderPopupAction(popupId, action, onClick) {
  const popup = document.getElementById(popupId);
  if (!popup) return;
  let row = popup.querySelector('.scq-popup-actions');

  if (!action) { if (row) row.remove(); return; }

  if (!row) {
    row = document.createElement('div');
    row.className = 'scq-popup-actions';
    popup.appendChild(row);
  }
  let btn = row.querySelector('.popup-action');
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'popup-action';
    const wrap = document.createElement('span');
    wrap.className = 'nav-label';
    wrap.appendChild(document.createElement('span'));
    btn.appendChild(wrap);
    row.appendChild(btn);
    initNavLabels(row);
  }
  const wrap = btn.querySelector('.nav-label');
  if (wrap.getAttribute('data-label') !== action.label) {
    wrap.setAttribute('data-label', action.label);
    wrap.firstElementChild.textContent = action.label;
  }
  if (action.view) btn.dataset.view = action.view;
  btn.onclick = onClick || null;   /* assignment, not addEventListener: never stacks */
}

/* Re-clamp an already-open popup into the canvas after its content changed
   size. Only meaningful once the learner has DRAGGED it: dragging pins the
   popup by its top (see each screen's own *PopupMouseDown below), so taller
   content then grows downward and can slide under the 74px bottom bar. An
   undragged popup is still bottom-anchored by CSS and grows upward, which is
   always safe -- detected here by style.top being unset, and left alone.
   Ported verbatim from part 06's Foundation. */
function clampPopup(popup) {
  if (!popup || popup.classList.contains('hidden')) return;
  const left = parseFloat(popup.style.left);
  const top  = parseFloat(popup.style.top);
  if (!isNaN(left)) popup.style.left = Math.max(0, Math.min(left, 1280 - popup.offsetWidth)) + 'px';
  if (!isNaN(top))  popup.style.top  = Math.max(0, Math.min(top, 710 - 74 - popup.offsetHeight)) + 'px';
}
