'use strict';
/* ═══════════════════ Resume — shared painter helpers ═══════════════════
   methodica-science-volume-liquid-01. Declarations only; loaded after 40-resume.js, before the
   part's js/main.js. Guide: ADDING-REPORTING-AND-RESUME.md §8.7-§8.8.

   Why painters at all: this unit's screen-enter functions (sNqEnter etc.) reset an UNANSWERED
   screen and leave an answered one alone, relying on the DOM still holding its marks from live
   play. After a reload — a resume — that DOM is fresh, so an answered screen must be painted back
   from the restored variables. Each part's restoreScreenUI(n) does that, through the helpers
   below; 40-resume.js calls it on every goTo() (repaintScreen) and once at the restore.

   Rules these follow (§8.8): only DOM writes — never report, never touch a score map; idempotent
   and safe on a clean screen (an unanswered screen is left to its enter function, which already
   reset it); everything they touch comes in as a parameter, never a part global by name
   (rule 7), because part state is top-level let/const and unreachable from here anyway. */

/* A resolved single-choice question (options, image cards or hotspots), repainted exactly as live
   play left it: the correct option marked correct, a wrong final pick marked wrong, the popup
   with its content, and the finished look (locked options, "שנמשיך?", hint hidden).
   c = { done, selected, correctId, optSel, mark(id, cls), showPopup(type), finish(result) }
   The verdict comes from the recorded final selection, never from the attempt count (rule 1). */
function rsPaintChoice(c) {
  if (!c || !c.done) return;
  var correct = c.selected === c.correctId;
  document.querySelectorAll(c.optSel).forEach(function (o) {
    o.classList.remove('selected', 'correct', 'wrong');
    if (o.hasAttribute('aria-checked')) o.setAttribute('aria-checked', o.dataset.id === c.selected ? 'true' : 'false');
  });
  c.mark(c.correctId, 'correct');
  if (!correct && c.selected != null) c.mark(c.selected, 'wrong');
  c.showPopup(correct ? 'correct' : 'wrong2');
  c.finish(correct ? 'correct' : 'incorrect');
}

/* Copy saved fields onto an existing object in place (const objects such as practiceProgress
   cannot be reassigned). Only keys present in `saved` are written. */
function rsAssign(target, saved) {
  if (!target || !saved) return;
  Object.keys(saved).forEach(function (k) { target[k] = saved[k]; });
}

/* practiceProgress-style { questions: [ {visited, state, screen}, … ] } — capture and restore. */
function rsCaptureQuestions(pp) {
  return pp && pp.questions ? pp.questions.map(function (q) { return { visited: q.visited, state: q.state, screen: q.screen }; }) : null;
}
function rsRestoreQuestions(pp, saved) {
  if (!pp || !pp.questions || !Array.isArray(saved)) return;
  saved.forEach(function (s, i) { if (pp.questions[i] && s) rsAssign(pp.questions[i], s); });
}

/* XAPI_Q_RESULTS (20-xapi.js) — the per-question truth the component score is read from. */
function rsCaptureXq() { return JSON.parse(JSON.stringify(XAPI_Q_RESULTS)); }
function rsRestoreXq(saved) {
  if (!saved) return;
  Object.keys(saved).forEach(function (k) { XAPI_Q_RESULTS[k] = saved[k]; });
}
