/* ═══════════════════════════════════════════════════════════
   unit-js/38-progress.js  —  question-progress nav (pairs with unit-css/progress-question.css).
   Loaded by: the practice parts 02, 03, 05, BEFORE js/main.js. Declarations only: nothing runs at
   load. These functions were byte-identical (comments/whitespace aside) in
   every part that had them and were moved here verbatim; they read the
   part's own globals (LOMDA_ID, THIS_PART, NAV_STACK_KEY, currentScreen …)
   at call time. Never re-declare one of these names in a part's main.js.
   ═══════════════════════════════════════════════════════════ */

/* Generic renderer — works for any question count.
   Icon  ← q.state  ('not-answered'|'current'|'correct'|'incorrect')
   Label ← q.visited; click-nav ← q.visited && q.screen != null.
   Connector N visited when questions[N-1] is answered. */
function updateProgressQuestion(container, state) {
  state.questions.forEach((q, i) => {
    const n    = i + 1;
    const item = container.querySelector('[data-question="' + n + '"]');
    if (!item) return;
    const icon  = item.querySelector('.progress-question__icon');
    const label = item.querySelector('.progress-question__label');
    icon.classList.remove(
      'progress-question__icon--current',
      'progress-question__icon--correct',
      'progress-question__icon--incorrect'
    );
    if (q.state !== 'not-answered') {
      icon.classList.add('progress-question__icon--' + q.state);
    }
    label.classList.toggle('progress-question__label--visited', q.visited);
    const navigable = q.visited && q.screen != null && q.screen !== currentScreen;
    item.style.cursor = navigable ? 'pointer' : '';
    item.onclick = navigable ? (() => goTo(q.screen)) : null;
  });
  for (let n = 1; n < state.questions.length; n++) {
    const conn = container.querySelector('[data-connector="' + n + '"]');
    if (!conn) continue;
    const qState = state.questions[n - 1].state;
    conn.classList.toggle(
      'progress-question__connector--visited',
      qState === 'correct' || qState === 'incorrect'
    );
  }
}

function syncPracticeProgressNav(sectionEl) {
  const nav = sectionEl?.querySelector('.progress-question');
  if (nav) updateProgressQuestion(nav, practiceProgress);
}
