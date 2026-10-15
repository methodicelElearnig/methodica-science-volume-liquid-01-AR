'use strict';
/* ═══════════════════ xAPI (720) — item scope + question ids ═══════════════════
   משותף לששת הסינים. Definition-only: אין כאן שום side effect ברמת top-level,
   והאתחול מונע מבלוק ה"אתחול" שבתחתית כל script.js (שקורא ל-bootXAPI() אחרון).

   methodica-science-volume-liquid-01 (2026-09-28): copied verbatim from
   methodica-science-mass-weight-01/unit-js/20-xapi.js — which is methodica-science-mass-measure-03's
   file with the guide's ports applied (B-1 _xapiCloseItem, restoreEndedButton, xapiSubmittedOpen
   and the three changes below). Only comments naming the donor unit were changed. Donor changes —
     1. xapiAnswerText's drop list re-pointed at this unit's markup;
     2. xapiRequestedHint: the hints ledger persisted in the state document (QA D-7), ported from
        methodica-math-scale-01/unit-js/20-xapi.js:246-261 (+ sendStatementOnce in 40-resume.js);
     3. xapiWireVideos: the playing/reloading state machine that replaced the pausedOnce latch
        (MOE 17.09.26), ported from methodica-math-scale-01/unit-js/20-xapi.js:317-345.
   Guide: 2026/Documentation/reporting-and-resume/ADDING-REPORTING-AND-RESUME.md §0 (the five ports).

   התפרים הפר-סיניים, כולם נקראים בזמן CALL ולא בזמן טעינה (וזו הסיבה
   ש-script.js יכול להיטען אחרי הקבצים המשותפים):
     SCREEN_TO_SUBCONTENT   מסך -> [סיומת פריט, עמוד-בפריט]; null = אין פריט בקטלוג
     XAPI_COMP_SLUG         למשל 'methodica-science-volume-liquid-01-02'
     XAPI_COMP_ID           XAPI_ID_PREFIX + XAPI_COMP_SLUG + '/'
     XAPI_EVAL_ITEMS        פריטים שנושאים שאלה מדורגת בקוד (לא רק במטא-דאטה)
     XAPI_ITEM_RESULT       אופציונלי; סיומת פריט -> פונקציה שמחזירה result מפורש
   כל קריאה מגודרת ב-typeof, כדי שסין שלא הגדיר אחד מהאופציונליים יתדרדר
   לערך הנייטרלי במקום לזרוק בתוך מסלול של statement — שם ה-try/catch העוטף
   היה מחניק את השגיאה וה-statement היה נעלם בשקט. */

/* מוסכמת ה-slash של היחידה הזאת, כפי שאומתה מול metadata/ (ראו 10-identity.js):
   יחידה, רכיב ופריט נושאים trailing slash; שאלה לא. XAPI_COMP_ID כבר מסתיים
   ב-'/', ולכן הפריט הוא <רכיב><slug>-NNN/ .
   xapiQ() מנרמל slashes לפני ההשוואה בכל מקרה, כך שהתאמת הפריטים עמידה
   לשינוי מוסכמה; מה שלא עמיד לכך הוא ה-id שנשלח בפועל, ולכן הוא חייב להתאים
   ל-metadata/ בית-לבית. */
function xapiItemId(suffix) { return XAPI_COMP_ID + XAPI_COMP_SLUG + '-' + suffix + '/'; }
function _xapiTrim(u) { return String(u == null ? '' : u).replace(/\/+$/, ''); }

/* טקסט התשובה הגלוי, ל-result.response. משכפל קודם כדי לא לגעת ב-DOM החי,
   ומסיר את צמתי ה-tooltip שאחרת textContent היה משרבב לאמצע התווית.
   הסלקטורים כאן הם של הפרויקט הזה (.scq-*), לא של המתמטיקה. */
function xapiAnswerText(el) {
  if (!el) return '';
  var c = el.cloneNode(true);
  /* This unit's options (.scq-opt rows, .s5q-card image cards, .mdq-option dropdown items) may
     carry a zoom button, a tooltip or an info bubble; none of that is the learner's answer. The
     dropdown check/wrong marks are text-less SVGs and need no entry. */
  var drop = c.querySelectorAll('.img-zoom-btn, .help-popup, [class*="tooltip"], [class*="info-bubble"], [class*="info-chip"]');
  for (var i = 0; i < drop.length; i++) { drop[i].remove(); }
  return c.textContent.replace(/\s+/g, ' ').trim();
}

/* הקשר השאלה. metadata/<component>.json הוא מקור האמת היחיד למזהי שאלות:
   מאתרים subContent[<suffix>].questions[<qKey>] ומחזירים את אותו questionId
   כמו שהוא כשהוא כבר אבסולוטי. התאמת הפריט היא לפי סיומת '-NNN' כשה-slashes
   מנורמלים, כך שסנכרון מחדש של המטא-דאטה מ-Kata יכול לשנות את התחילית בלי
   לגעת בקוד. */
function xapiQ(suffix, qKey) {
  var itemId = xapiItemId(suffix);
  var qid = null;
  try {
    var sc = (window.METADATA && window.METADATA.subContent) || [];
    for (var i = 0; i < sc.length; i++) {
      if (_xapiTrim(sc[i].id).slice(-(suffix.length + 1)) !== '-' + suffix) continue;
      var qs = sc[i].questions || [];
      for (var j = 0; j < qs.length; j++) {            // התאמת המפתח, חשוף או בצורת URL
        var v = _xapiTrim(qs[j].questionId);
        if (v === qKey || v.slice(-(qKey.length + 1)) === '/' + qKey) { qid = qs[j].questionId; break; }
      }
      if (qid == null) {                               // נפילה לאחור: מיקומי, 'q3' -> אינדקס 2
        var n = parseInt(String(qKey).replace(/\D/g, ''), 10);
        if (n >= 1 && n <= qs.length) qid = qs[n - 1].questionId;
      }
      break;
    }
  } catch (e) {}
  if (qid == null) { console.warn('[xAPI] no metadata question', suffix, qKey); qid = qKey; }
  /* itemId מסתיים ב-'/', ולכן ההצמדה היא ישירה — בלי מפריד נוסף. */
  return { questionId: /^https?:\/\//.test(qid) ? qid : itemId + qid, parentId: itemId };
}

/* תוצאה פר-שאלה, במפתח '<item>/<q>'. נכתבת בכל אתר answered — תמיד מחוץ
   ל-try/catch שלו, כדי שכשל דיווח לא יקלקל את הניקוד — ונקראת כשמורכב
   ה-completed של הרכיב. הצבירה של הספרייה עצמה היא AND של "כל התשובות
   נכונות", מה שהיה מדווח success:false על כל מעבר חלקי, ולכן רכיב שצריך
   ניקוד חלקי מספק את ה-result שלו במפורש. */
var XAPI_Q_RESULTS = {};
function xapiCorrectCount() {
  return Object.keys(XAPI_Q_RESULTS).filter(function (k) { return XAPI_Q_RESULTS[k]; }).length;
}

var xapiCurrentItem = null;

/* result מפורש ל-completed של פריט, כשה-AND של הספרייה שגוי עבורו.
   סין שלא מגדיר XAPI_ITEM_RESULT מקבל null — בדיוק מה שהיה מועבר literal. */
/* ── O-8 (QA 2026-10-02): every evaluated item supplies its own result ──
   Without one the library scored an item's 'completed' from its in-memory per-item aggregate, which a
   reload wipes: no result, or one counted from the post-reload answers only (U1's 06 walk passed by
   coincidence). XAPI_Q_RESULTS is saved and restored by every part (rsCaptureXq / rsRestoreXq), so the
   result is rebuilt from it: success = every declared question correct, scaled = correct / declared
   (declared = this item's questions in metadata/). A part may override an item through
   XAPI_ITEM_RESULT (06 and 07, one item each, mirror their component result). Nothing answered and
   nothing restored -> null, as before. Pattern of methodica-math-ratio-04 unit-js/70-platform.js. */
function _xapiDeclaredQs(item) {
  try {
    var sc = (window.METADATA && window.METADATA.subContent) || [];
    for (var i = 0; i < sc.length; i++) {
      if (_xapiTrim(sc[i].id).slice(-(item.length + 1)) !== '-' + item) continue;
      return (sc[i].questions || []).map(function (q) { return _xapiTrim(q.questionId).split('/').pop(); });
    }
  } catch (e) {}
  return [];
}
function _xapiDefaultItemResult(item) {
  var mine = Object.keys(XAPI_Q_RESULTS).filter(function (k) { return k.split('/')[0] === item; })
                   .map(function (k) { return k.slice(item.length + 1); });
  if (!mine.length) return null;
  var qs = _xapiDeclaredQs(item);
  if (!qs.length) qs = mine;
  var ok = qs.filter(function (q) { return XAPI_Q_RESULTS[item + '/' + q] === true; }).length;
  return { success: ok === qs.length, score: { scaled: ok / qs.length } };
}
function xapiItemResult(item) {
  var map = (typeof XAPI_ITEM_RESULT !== 'undefined') ? XAPI_ITEM_RESULT : null;
  var f = map && map[item];
  if (f) return f();
  return _xapiIsEval(item) ? _xapiDefaultItemResult(item) : null;
}

function _xapiIsEval(item) {
  return (typeof XAPI_EVAL_ITEMS !== 'undefined') && !!XAPI_EVAL_ITEMS[item];
}

/* ── חימוש מחדש של זיכרון ה-'answered' של הספרייה אחרי שחזור ────────────────
   xapi-720-k.js חוסמת 'completed' של פריט על סמך xapiItemAnswered[itemId] — מפה
   שהיא ממלאת רק מ-'answered' שעבר דרכה באותה טעינת דף:

       if (sttmContext?.expectsAnswer && !xapiItemAnswered[_cid]) {
           console.log("[XAPI] item left unanswered — deferring 'completed': " + _cid);
           return;          // "deferring" הוא זריקה — אין תור, אין flush, אין ניסיון חוזר

   בתוך אותה הפעלה השער נכון: הוא מונע מלומד שיוצא משאלה אחורה דרך goBack() לשדר
   'completed' חסר תוצאה, שהיה חוסם אחר כך את האמיתי והמנוקד. אבל שחזור מכוון לא
   משדר מחדש את התשובות שהוא משחזר, ולכן בלי הזריעה שלמטה הספרייה מתייחסת לכל
   פריט שנענה בעבר כאילו לא נענה ומוחקת את ה-'completed' שלו — בזמן
   ש-sendStatementOnce, שכבר קרא לשולח, מסמן ביומן שנשלח. הלומדה לא תשאל שוב,
   הספרייה לא תנסה שוב, וה-statement אבד לתמיד.

   אומת חי מול Kata ב-07.09.26 ביחידת הייחוס methodica-math-ratio-01: היומן אמר
   "נשלח" בזמן ש-xapiCompletedObjects של הספרייה עדיין היה ריק.

   הזריעה מחזירה את הספרייה למצב שבו הייתה אילו הלומד לא היה יוצא. היא לא משדרת
   כלום בעצמה — רק פותחת את השער, וה-'completed' שנשלח אחריה נושא את התוצאה
   המפורשת ש-xapiItemResult() מספק, כך ששום דבר לא תלוי בניקוד של הספרייה עצמה.

   רק פריטים עם תשובה רשומה נזרעים, כך שפריט שהלומד לא ענה עליו עדיין נדחה
   וההגנה של goBack נשמרת.

   ⚠️ חייב לרוץ אחרי applyResumeVars (שממלא מחדש את XAPI_Q_RESULTS) ולפני שאפשר
   לחצות גבול פריט. applyExecutionState קורא לזה כפעולה האחרונה שלו. */
function xapiSeedAnsweredFromResume(){
  if (!window.XAPI_USING_G) return;
  /* no-op שקט כאן היה מחזיר את הבאג בלי שאיש ישים לב, ולכן אומרים זאת: המפה היא
     גלובל רגיל היום, והייתה מפסיקה להיות נגישה אילו הספרייה תעביר אותה ל-const/let. */
  if (!window.xapiItemAnswered) {
    console.warn('[xAPI] xapiItemAnswered unreachable - item "completed" will be dropped after a resume');
    return;
  }
  Object.keys(XAPI_Q_RESULTS).forEach(function(k){
    var item = k.split('/')[0];
    if (item) window.xapiItemAnswered[xapiItemId(item)] = true;
  });
}

/* ── B-1 (live Kata run 2026-09-24, QA/2026-09-24/REPORT.md) ──
   The library DROPS an evaluated item's 'completed' when that item has no 'answered' in this page
   load (the "deferring" return quoted above — no queue, no retry). sendStatementOnce cannot see
   that: it marks the ledger anyway, and the real, scored 'completed' — after the learner comes
   back and answers — is then suppressed forever. Live: part 03, Back 28 → 27 → 26 → 25 through
   unanswered 003 and 002; Kata never received either 'completed'.
   So the close asks the library's own question first and, when the library would drop the
   statement, sends nothing and leaves the ledger untouched. Fallback when the map is unreachable:
   an answer recorded in XAPI_Q_RESULTS (restored by resume, same predicate as the seed). */
function _xapiLibWouldDrop(item) {
  if (!_xapiIsEval(item)) return false;
  var m = window.xapiItemAnswered;
  if (m) return !m[xapiItemId(item)];
  return !Object.keys(XAPI_Q_RESULTS).some(function (k) { return k.split('/')[0] === item; });
}
function _xapiCloseItem(item) {
  if (_xapiLibWouldDrop(item)) return;
  try { sendCompletedOnce('doneItems', itemLedgerKey(item), 'question', xapiItemResult(item), { objectId: xapiItemId(item), expectsAnswer: _xapiIsEval(item) }); } catch (e) {}
}

/* זוגות initialized/completed ברמת הפריט, מונעים מ-goTo(). דפדוף בתוך אותו
   פריט לא משדר כלום; הפריט נסגר כשהלומד נכנס למסך ששייך לפריט אחר. */
function xapiOnScreen(screen) {
  if (!window.XAPI_USING_G || typeof sendStatement720 !== 'function') return;
  var map = (typeof SCREEN_TO_SUBCONTENT !== 'undefined') ? SCREEN_TO_SUBCONTENT[screen] : null;
  var item = map ? map[0] : null;
  if (item === xapiCurrentItem) return;
  if (xapiCurrentItem) _xapiCloseItem(xapiCurrentItem);
  xapiCurrentItem = item;
  if (item) {
    try { sendStatement720('initialized', 'question', null, { objectId: xapiItemId(item), isEvaluationItem: _xapiIsEval(item) }); } catch (e) {}
  }
}

/* סוגר את הפריט הפתוח האחרון — נקרא מיד לפני כל completed של רכיב. */
function xapiFinishItems() {
  if (!window.XAPI_USING_G || typeof sendStatement720 !== 'function') return;
  if (xapiCurrentItem) {
    _xapiCloseItem(xapiCurrentItem);
    /* מתאפס בין אם ה-statement דוכא ובין אם לא: latch שנשאר דלוק היה גורם
       ל-xapiOnScreen הבא לנסות לסגור את אותו פריט שוב. */
    xapiCurrentItem = null;
  }
}

/* ═══════════════════ שלושת העוזרים שאתרי הקריאה משתמשים בהם ═══════════════════
   בלומדת המתמטיקה כל אתר answered הוא בלוק של 6–8 שורות, משוכפל 26 פעמים על
   פני חמישה קבצים. בלומדה הזאת יש 26 אתרים בעלי מבנה כמעט זהה
   (sNNCheck עם ענף נכון / שגוי-ראשון / שגוי-סופי), ולכן העוזרים האלה הופכים כל
   אתר לשורה אחת. פחות שכפול פירושו פחות מקומות שבהם אפשר לטעות — וזו בדיוק
   מחלקת הטעויות שה-try/catch השקטים היו מסתירים.

   ⚠️ הכתיבה ל-XAPI_Q_RESULTS קורית **לפני** ה-try/catch ומחוצה לו, לא בתוכו.
   זו אינווריאנטה מ-REPORT-XAPI.md §2: כשל דיווח לא יכול לקלקל את הניקוד.
   כאן היא נאכפת במקום אחד במקום להסתמך על 26 אתרי קריאה שיזכרו אותה. */

/* ── שני בוני טקסט-תשובה, לסוגי השאלות שאינם בחירה בודדת ──
   result.response אמור לשאת את מה שהלומד באמת ענה. בבחירה בודדת זה
   xapiAnswerText(optEl); בשאלות גרירה ובשאלות שדות צריך לתאר מצב, ולא
   אלמנט אחד. שניהם גנריים במכוון — אותה תבנית markup חוזרת בסינים
   01, 02, 04, 05 ו-06. */

/* לוח גרירה: לכל אזור, הפריטים שהלומד הניח בו.
   'ton: קטר | kg: צב ענק | gram: תפוח, גרגר מלח' */
function xapiZoneAnswer(prefix, zoneIds) {
  try {
    return zoneIds.map(function (z) {
      var el = document.getElementById(prefix + '-zone-' + z);
      var items = el ? el.querySelectorAll('[class*="drag-item"], [class*="placed-card"]') : [];
      var names = [];
      for (var i = 0; i < items.length; i++) names.push(xapiAnswerText(items[i]));
      return z + ': ' + (names.join(', ') || '—');
    }).join(' | ');
  } catch (e) { return ''; }
}

/* קבוצת שדות או נפתחים. values אופציונלי — בלעדיו נקרא .value מה-DOM.
   's18-input-1=1400 | s18-input-2=900' */
function xapiFieldsAnswer(ids, values) {
  try {
    return ids.map(function (id) {
      var v = values ? values[id] : (document.getElementById(id) || {}).value;
      return id + '=' + (v == null || v === '' ? '—' : v);
    }).join(' | ');
  } catch (e) { return ''; }
}

/* בחירה מרובה: התוויות של האפשרויות שנבחרו, דרך פונקציית האיתור של המסך. */
function xapiMultiAnswer(ids, optElFn) {
  try {
    return (ids || []).map(function (id) {
      return xapiAnswerText(optElFn(id)) || String(id);
    }).join(', ');
  } catch (e) { return ''; }
}

/* דיווח תשובה מדורגת אחת.
     item      סיומת הפריט, למשל '003'
     qKey      מפתח השאלה, למשל 'q1'
     correct   האם התשובה נכונה
     isLast    האם זו התשובה האחרונה על השאלה (נכונה, או שנגמרו הניסיונות).
               רק 'answered.last' נכנס למכנה של ניקוד הרכיב.
     answer    טקסט התשובה של הלומד, כפי שהוא רואה אותה */
function xapiAnswered(item, qKey, correct, isLast, answer) {
  XAPI_Q_RESULTS[item + '/' + qKey] = !!correct;
  if (!window.XAPI_USING_G || typeof sendStatement720 !== 'function') return;
  try {
    sendStatement720(isLast ? 'answered.last' : 'answered', 'question',
      { success: !!correct,
        score: { scaled: correct ? 1 : 0 },
        extensions: { student_answer: [answer == null ? '' : String(answer)] } },
      xapiQ(item, qKey));
  } catch (e) { console.error('[xAPI] answered ' + item + '/' + qKey, e); }
}

/* An OPEN question that the code does not grade (methodica-science-mass-weight-01, 2026-09-23).
   The catalogue declares it (questionType "other"), so it must not stay silent (QA D-9) — but
   xapiAnswered would invent a verdict (success/score) that nobody measured. This sends the
   learner's text as 'answered.last' with NO success and NO score, and records nothing in
   XAPI_Q_RESULTS, so no component score can ever count it. Its item must NOT be listed in
   XAPI_EVAL_ITEMS. In this unit: part 04 S2, the ungraded open question (wired in Phase 5). */
function xapiSubmittedOpen(item, qKey, answer) {
  if (!window.XAPI_USING_G || typeof sendStatement720 !== 'function') return;
  try {
    sendStatement720('answered.last', 'question',
      { extensions: { student_answer: [answer == null ? '' : String(answer)] } },
      xapiQ(item, qKey));
  } catch (e) { console.error('[xAPI] answered (open) ' + item + '/' + qKey, e); }
}

/* מפתחות ה-(item/qKey) שכבר נשלח עבורם 'requested.1' בטעינת העמוד הזאת.
   אותו מפתח בדיוק ש-xapiAnswered משתמש בו ל-XAPI_Q_RESULTS. */
var XAPI_HINTS_SENT = {};

/* בקשת רמז. ⚠️ להציב רק בענף "הרמז נפתח כרגע". רמזים כאן הם לרוב overlay
   ש-hidden שלו מתהפך, ומיקום הקריאה על ה-toggle היה מדווח בקשה שנייה בכל
   סגירה. ראו REPORT-XAPI.md §4.

   ── דה-דופליקציה: פעם אחת לכל שאלה ──
   ההערה הישנה כאן טענה ש"הפונקציה פותחת בלבד ולכן אין סיכון לדיווח כפול".
   זה כיסה רק כניסה חוזרת מנתיב הסגירה. ה-overlay נסגר בשלוש דרכים (כפתור
   הסגירה, קליק על הרקע, ו-Escape), וכולן משאירות את כפתור הרמז חי — ובפאבריקה
   המשותפת הוא אפילו מופעל מחדש במפורש ב-closeHint. לכן לומד שפותח רמז פעמיים
   דיווח 'requested.1' פעמיים.
   הבדיקה כאן ולא באתרי הקריאה — כל אתרי הרמז עוברים דרך הפונקציה הזאת.
   (The old "page-load scope is deliberate" note was retired 2026-09-23: see below.) */
/* Hints ledger (2026-09-23, port 2): the key also lives in the state document under `hints`,
   through the same sendStatementOnce the 'completed' ledger uses, so a hint reported once stays
   reported across a reload. XAPI_HINTS_SENT stays in front as the in-memory fast path. The memory
   latch is set only when sendStatementOnce reports the key SETTLED (false = suppressed during a
   restore — latching there would swallow the learner's first real hint), and both latches sit
   after the XAPI_USING_G guard, so neither records a statement that never left.
   With RESUME_ENABLED false there is no document: alreadySent() is false and the hint is sent
   (fail open); the memory latch still dedupes within the page load. */
function xapiRequestedHint(item, qKey) {
  var _k = item + '/' + qKey;
  if (XAPI_HINTS_SENT[_k]) return;
  if (!window.XAPI_USING_G || typeof sendStatement720 !== 'function') return;
  try {
    if (typeof sendStatementOnce === 'function') {
      if (sendStatementOnce('hints', _k, 'requested.1', 'question', null, xapiQ(item, qKey))) {
        XAPI_HINTS_SENT[_k] = true;
      }
      return;
    }
    sendStatement720('requested.1', 'question', null, xapiQ(item, qKey));
    XAPI_HINTS_SENT[_k] = true;
  } catch (e) { console.error('[xAPI] requested ' + _k, e); }
}

/* ה-completed של הרכיב. סוגר קודם את הפריט הפתוח, ואז מדווח דרך היומן.
   ⚠️ יש לקרוא לזה גם במסלולי כשל. רכיב שהלומד לא צלח חייב להיות מדווח, אחרת
   כל הניסיון שלו לא נרשם — ניתוב לומד שנכשל הוא תפקיד הפלטפורמה, דרך
   recommendedAfterFail של הרכיב. ראו REPORT-XAPI.md §5. */
function xapiCompleteComponent(result) {
  try { xapiFinishItems(); } catch (e) {}
  try {
    sendCompletedOnce('done', currentPartSlug(), 'onlinelesson', result || null);
  } catch (e) { console.error('[xAPI] completed component', e); }
}

/* סיום הרכיב מהכפתור האחרון: מדווח, ואז עוצר. Kata מסירה את הרכיב מהמסך
   כשמגיע ה-completed (הנחיות 2.7 עמ' 23 — "הפלטפורמה מסירה את הרכיב מהמסך"),
   ולכן ה-completed חייב להיות **הפעולה האחרונה** של הלומד ברכיב, אחרי כל
   משוב וכל מסך מסכם. מחוץ ל-Kata (QA על ה-CDN, הרצה מקומית) אין מי שיסיר את
   הרכיב, והכפתור המושבת הוא הסימן היחיד שהלחיצה נרשמה. ללומד לא מוצג טקסט
   חדש — כך הוכרע (16.09.26).
   הניווט לסין הבא שהיה כאן עד 2026-09-16 חי רק תחת DEV_NAV (10-identity.js).

   ⚠️ אין יותר completed ברמת היחידה. xapiCompleteUnit הוסר ב-2026-09-16: הנחיות
   2.5/2.7 מגדירות את object כ"ID של הפריט או רכיב התוכן" בלבד, והפלטפורמה
   גוזרת את מצב היחידה בעצמה. ראו REPORT-XAPI.md §10. */
function xapiEndComponent(result, btn) {
  xapiCompleteComponent(result);
  if (btn) { btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); }
}

/* ── A finished component's button stays disabled (QA D-8, port 3 — ratio-01 842f96c) ──
   xapiEndComponent disables the button once; after a reload, or a step back and forward, the
   screen's own enter code shows / re-enables it again. The click then sends nothing (the ledger
   suppresses it) but the screen tells the learner the work was not recorded. The authority is the
   LEDGER, never the screen position: a learner who answered but never clicked keeps a live button.
   XAPI_END_BTN (per-part config) names the part's last button. Called at the end of every
   repaintScreen and after the restore in applyExecutionState (40-resume.js); enter code that
   re-enables the button on a timer asks xapiComponentEnded() instead of writing `false`. */
function xapiComponentEnded() {
  try { return typeof alreadySent === 'function' && alreadySent('done', currentPartSlug()); }
  catch (e) { return false; }
}
function restoreEndedButton() {
  if (typeof XAPI_END_BTN === 'undefined' || !xapiComponentEnded()) return;
  var btn = document.getElementById(XAPI_END_BTN);
  if (btn) { btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); }
}

/* played/paused ל-<video> של HTML5 — **רק לווידאו תוכן**, לפי סימון מפורש.
   ── למה allowlist ולא כל ה-<video> ──
   הגרסה הקודמת בחרה querySelectorAll('video') בלי שום סינון. כל 18 קובצי ה-mp4
   ביחידה הזאת הם avatar-* — קליפים של הדמות המלווה, כלומר עיטור ולא תוכן —
   ותשעה מהם (סינים 01/02/05/06) חוברו ודיווחו. סינים 03/04 שתקו רק כי אין בהם
   <video> כלל, לא בגלל סינון.
   זה גם לא היה דיווח שקט: כל מסך דמות מריץ video.load() + play() בכניסה
   (למשל -01/script.js:940), וה-load() על אלמנט מתנגן מפיק אירוע pause ואחריו
   play — כלומר זוג paused/played מזויף בכל כניסה למסך, כולל חזרה ושחזור.
   מעכשיו מחוברים רק אלמנטים שנושאים data-xapi-report, וערכו הוא סיומת הפריט
   (למשל data-xapi-report="003"). כרגע אין ביחידה אף אלמנט
   כזה, ולכן הדיווח כבוי בפועל — המנגנון נשאר מוכן לווידאו תוכן אמיתי.
   ── objectId: הפריט, לא השאלה (15.09.26) ──
   דווח על ידי צוות הבדיקות: האמירות האלה נשלחו מול הסין. נשיאת xapiQ() מעולם
   לא הספיקה. הספרייה בונה את object.id מ-sttmContext.objectId, אחרת מ-questionId
   אבל רק ל-answered/selected/requested, ואחרת מ-window.METADATA.id. played/paused
   אינם באף אחת מהרשימות, ולכן ה-questionId וה-parentId נזרקו ונשלח מזהה הרכיב
   (xapi-720-k.js, בלוק ה-object). מעכשיו מועבר objectId: xapiItemId(item) — אותו
   helper שמעגן item initialized/completed.
   xapiQ() ו-data-xapi-q ירדו מהמסלול הזה: האובייקט הוא הפריט, ופריט וידאו לא חייב
   לשאת שאלה בכלל (לפריט 006 של mass-measure-01 אין).
   ⚠️ ב"דוגמאות XAPI" של משרד החינוך, §6 ו-§7, מופיע ב-object מזהה רכיב. אנחנו
   הולכים לפי צוות הבדיקות, כי אמירת וידאו ברמת רכיב לא יכולה לומר איזה סרטון.
   אישור בכתב מ-MOE עדיין פתוח — לשאול אותו יחד עם אותה שאלה לגבי 'requested'. */
/* State machine (2026-09-23, port 1) instead of the pausedOnce latch, which swallowed the first
   'played' of every viewing (MOE, 17.09.26). Two rules bind anything ever opted in:
     - do NOT load() or swap src on a reported video while it plays — the pause that fires is not
       the learner's ('emptied' guards the common ordering, not every engine);
     - NEVER opt in a `loop` video: every iteration would report a 'played'.
   This unit has NO HTML5 content video: every <video> is a character loop (décor) and must not be
   opted in. Its one content video is part 05 S3's YouTube player, reported by xapiYouTubeState. */
function xapiWireVideos() {
  if (!window.XAPI_USING_G || typeof sendStatement720 !== 'function') return;
  document.querySelectorAll('video[data-xapi-report]').forEach(function (v) {
    if (v.__xapiWired) return; v.__xapiWired = true;
    var item = v.getAttribute('data-xapi-report');
    var ctx  = { objectId: xapiItemId(item) };   // the ITEM this video belongs to
    var playing   = false;  // a 'played' is open, not yet closed by a 'paused'
    var reloading = false;  // a load()/src swap is in flight: its 'pause' is not the learner
    function send(verb) {
      try { sendStatement720(verb, 'question', null, Object.assign({ time: v.currentTime }, ctx)); } catch (e) {}
    }
    v.addEventListener('emptied', function () { reloading = true; });
    v.addEventListener('play', function () {
      reloading = false;
      if (playing) return;                           // already open: nothing started
      playing = true;
      send('played');
    });
    v.addEventListener('pause', function () {
      if (!playing) return;                          // nothing open -> an orphan is impossible
      playing = false;
      if (v.ended) return;                           // end of clip, not a learner pause
      if (reloading || v.readyState === 0) return;   // load()/src swap, not a learner pause
      send('paused');
    });
    /* Some engines fire 'ended' without a preceding 'pause'. Close the state either way. */
    v.addEventListener('ended', function () { playing = false; });
  });
}

/* played/paused לסרטוני YouTube — onStateChange של IFrame Player API.
   ── למה (23.09.26) ──
   דווח ע"י בודק MOE: "אין בכלל דיווחים של played/paused על הסרטון". בסין 01 יש
   שלושה סרטוני YouTube (מסכים s1/s3/s7), וה-handler שלהם האזין רק ל-ENDED כדי
   לפתוח את כפתור "המשך". xapiWireVideos למעלה לא רואה אותם — iframe אינו <video>.
   ── מכונת מצבים, לא latch ── (הועתק מ-mass-measure-01/unit-js/20-xapi.js)
   דגל אחד לכל נגן: __xapiPlaying == "יש played פתוח שעוד לא נסגר ב-paused".
   played נשלח רק כשהדגל כבוי, paused רק כשהוא דלוק. לכן:
     - ה-played הראשון בכל צפייה נשלח (latch מסוג pausedOnce היה בולע אותו —
       זה בדיוק הפגם ש-MOE דיווח ב-mass-measure-01 ב-17.09.26);
     - paused יתום בלתי אפשרי מבנית;
     - BUFFERING -> PLAYING באמצע ניגון (seek) שקט — PLAYING שני כשכבר מנגן.
   ENDED מאפס את הדגל ולא מדווח כלום: כך ניגון חוזר ישלח played שוב, ו-paused
   סינתטי בסוף הסרטון היה מדווח פעולת לומד שלא קרתה.
   ── objectId ──
   הפריט, כמו ב-xapiWireVideos: xapiItemId(item). ה-caller מעביר את סיומת הפריט
   (s1/s3 -> 002, s7 -> 006; ראו SCREEN_TO_SUBCONTENT ב-01/script.js). הדגל יושב על
   מופע הנגן ולא על הפריט — s1 ו-s3 חולקים את פריט 002, ודגל לפי פריט היה מתערבב. */
function xapiYouTubeState(e, item) {
  if (!window.XAPI_USING_G || typeof sendStatement720 !== 'function') return;
  if (!item) { console.warn('[xAPI] youtube state with no item suffix -- not reporting'); return; }
  var p = e && e.target;
  if (!p) return;
  var t = (typeof p.getCurrentTime === 'function') ? p.getCurrentTime() : undefined;
  var ctx = { time: t, objectId: xapiItemId(item) };
  if (e.data === YT.PlayerState.PLAYING) {
    if (p.__xapiPlaying) return;          // seek באמצע ניגון — כבר פתוח
    p.__xapiPlaying = true;
    try { sendStatement720('played', 'question', null, ctx); } catch (_) {}
  } else if (e.data === YT.PlayerState.PAUSED) {
    if (!p.__xapiPlaying) return;         // אין played פתוח — לא שולחים יתום
    p.__xapiPlaying = false;
    try { sendStatement720('paused', 'question', null, ctx); } catch (_) {}
  } else if (e.data === YT.PlayerState.ENDED) {
    p.__xapiPlaying = false;              // re-arm לניגון חוזר; ENDED עצמו לא מדווח
  }
}
