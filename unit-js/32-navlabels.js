/* ═══════════════════════════════════════════════════════════
   unit-js/32-navlabels.js  —  nav-button label wrapping.
   Loaded by: all seven parts, BEFORE js/main.js. Declarations only: nothing runs at
   load. These functions were byte-identical (comments/whitespace aside) in
   every part that had them and were moved here verbatim; they read the
   part's own globals (LOMDA_ID, THIS_PART, NAV_STACK_KEY, currentScreen …)
   at call time. Never re-declare one of these names in a part's main.js.
   ═══════════════════════════════════════════════════════════ */

function initNavLabels(root) {
  var btns = (root || document).querySelectorAll(NAV_LABEL_SELECTOR);
  for (var i = 0; i < btns.length; i++) {
    var btn = btns[i];
    wrapNavLabel(btn);
    if (!btn.navLabelObserved && window.MutationObserver) {
      btn.navLabelObserved = true;
      new MutationObserver(function (recs) {
        if (navLabelBusy) return;
        navLabelBusy = true;
        try {
          for (var j = 0; j < recs.length; j++) {
            var t = recs[j].target;
            while (t && t.nodeType === 3) { t = t.parentNode; }          /* characterData */
            while (t && !(t.classList && t.matches && t.matches(NAV_LABEL_SELECTOR))) { t = t.parentElement; }
            if (t) wrapNavLabel(t);
          }
        } finally { navLabelBusy = false; }
      }).observe(btn, { childList: true, subtree: true, characterData: true });
    }
  }
}

function wrapNavLabel(btn) {
  if (!btn || !btn.childNodes) return;
  var k, wrap = null;

  /* Already wrapped? Only re-sync the reserve with the current text. */
  for (k = 0; k < btn.children.length; k++) {
    if (btn.children[k].classList && btn.children[k].classList.contains('nav-label')) {
      wrap = btn.children[k]; break;
    }
  }
  if (wrap) {
    var cur = wrap.firstElementChild;
    if (cur && wrap.getAttribute('data-label') !== cur.textContent) {
      wrap.setAttribute('data-label', cur.textContent);
    }
    return;
  }

  /* Locate the label carrier: a direct text node, or an existing span (hint). */
  var textNode = null, span = null;
  for (k = 0; k < btn.childNodes.length; k++) {
    var n = btn.childNodes[k];
    if (n.nodeType === 3 && n.nodeValue.trim()) { textNode = n; break; }
    if (!span && n.nodeType === 1 && n.tagName === 'SPAN') { span = n; }
  }
  var carrier = textNode || span;
  if (!carrier) return;
  var label = (textNode ? textNode.nodeValue : span.textContent).trim();
  if (!label) return;

  wrap = document.createElement('span');
  wrap.className = 'nav-label';
  wrap.setAttribute('data-label', label);
  var inner = document.createElement('span');
  inner.textContent = label;
  wrap.appendChild(inner);
  btn.replaceChild(wrap, carrier);   /* replace in place: keeps hint icon order */
}
