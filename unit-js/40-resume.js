'use strict';
/* ═══════════════════ RESUME — שמירה/שחזור מצב מול Kata (xAPI State API) ═══════════════════
   משותף לששת הסינים. Definition-only: 90-boot.js קורא ל-initResumeResetHatch()
   ול-initResumeLeaveHandlers(), ו-50-loader.js מריץ את השחזור עצמו.
   העיצוב המלא: RESUME.md בלומדת methodica-math-scale-01 (המקור לדפוס הזה).

   methodica-science-volume-liquid-01 (2026-09-28): copied from methodica-science-mass-weight-01,
   which is methodica-science-mass-measure-03's file with the guide's ports (`hints` / `picks`
   ledgers and sendStatementOnce from methodica-math-scale-01 — QA D-7; restoreEndedButton calls —
   D-8). Changed here: this unit's UI_CHARACTER_KEY, RESULT_KEYS and NAV_EDGE_KEY.
   RESUME_ENABLED stays false until the four hooks exist in every part (plan Phase 6) — until then
   _unitState stays null, every ledger fails open, and only the library's per-page dedupe applies.

   ── מסמך אחד לכל {לומד, רכיב} — כמו במודל של Kata ──
   אומת מול Documentation/KATA/KATA-API.md ומול הערת צוות Kata (2026-09-16):
   ה-registration שלפיו נשמר ונשלף ה-State מייצג זוג {user, component}, ולכן
   לכל רכיב של היחידה יש ללומד registration שונה — ומסמך שונה. הכתובת היא
   `?registration` **בלבד** (או studentId+componentKey; שליחת שניהם היא 400).
   הפלטפורמה משגרת כל רכיב בנפרד (`POST /launcher/context` מקבל componentId
   יחיד ומחזיר registrationId יחיד), ומאז 2026-09-16 שום סין לא מנווט לסין
   אחר ולא מעתיק את ה-query שלו הלאה — ולכן כל סין קורא וכותב **את המסמך
   שלו בלבד**.

   v5 (2026-09-16): המסמך עצמו הותאם למודל הזה. אין בו יותר `part` (מצביע
   נחיתה), `prev` (קשתות חזרה) ו-`parts{}` (payload של כל הסינים) — יש
   `component` (של מי המסמך) ו-`payload` (של הסין הזה). מסמך שה-`component`
   שלו אינו הסין הנוכחי נזרק עם console.warn: registration משותף לשני רכיבים
   הוא תקלה בצד הפלטפורמה, ולעולם לא מחילים payload של סין אחר.

   הפלטפורמה רשאית לנקות את ה-State של רכיב מסוים בכניסה חוזרת (ביצוע מחדש
   של רכיב הערכה). מסמך חסר (404) הוא לכן "ניסיון חדש": payload ריק, יומן
   `done` ריק (ה-completed יישלח שוב — זו הכוונה), ו-`results` ריק שגובר על
   הקאש ב-localStorage מהניסיון הקודם (ראו סדר העדיפויות ב-getters).

   (window.XAPI_UNIT_ID ו-RESUME_STATE_ID מכתיבים רק את מפתח ה-fallback
   ב-localStorage, שנכנס לתמונה כשאין ?slxapi תקין. RESUME_STATE_ID כולל את
   ה-slug של הסין, כדי שגם ה-fallback הזה יהיה מסמך לכל סין — בלי זה סיור
   ?dev=1 בין סינים היה קורא בסין 02 את המסמך של 01.)

   ── עוד שלוש עובדות מהמסמך, שנוגעות ישירות לקוד כאן ──
   • **עמידות:** Kata "never acknowledges a write that wasn't durably saved".
     כלומר ה-true שחוזר מ-saveState720 הוא הבטחה אמיתית, וזה מה שמצדיק את
     בדיקת ה-!== false ב-persistUnitState.
   • **גודל:** תקרה של ~1MB (מעליה 413). המסמך כאן זעיר — payload של סין
     אחד ושני יומנים — ולכן אין חשש.
   • **שמירה בזמן:** ברירת המחדל היא ~12 חודשים מהעדכון האחרון, ואחריה GET
     מחזיר 404. לומד שחוזר אחרי יותר מזה מתחיל מאפס, בשקט. readUnitState
     מטפל ב-404/null כמו ב"מסמך חדש", ולכן זה מתנהג נכון ולא נופל.

   ── הקובץ הזה החליף את 40-ledger.js ──
   40-ledger.js סיפק את אותו API בדיוק מעל sessionStorage, כדי ש-20-xapi.js
   יעבוד לפני שה-resume קיים. הפער שהוא תיעד: sessionStorage לא שורד סגירת
   לשונית, ולכן לומד שחוזר בשיגור חדש היה שולח completed שני. היומן כאן יושב
   בתוך מסמך ה-state, ולכן שורד. כל השמות הציבוריים נשמרו — 20-xapi.js
   וקוד הסינים לא נגעו.

   ── תפרים פר-סין, נקראים בזמן call (לא בזמן טעינה) ──
     capturePartPayload()   מחזיר את ה-payload של הסין הזה, כולל currentScreen
     applyResumeVars(st)    מחזיר משתני תשובה   ← שלב 2, כרגע stub
     applyResumeDom(st)     מחזיר ערכי DOM      ← שלב 2, כרגע stub
     restoreScreenUI(n)     מצייר מסך שנענה     ← שלב 2, כרגע stub
   ═══════════════════════════════════════════════════════════════════ */

/* v4 (2026-08-20): נוספו `ui` (הדמות) ו-`results` (תוצאות מועד א/ב) — עד אז
   ישבו רק ב-localStorage, ולומד שהמשיך ממחשב אחר קיבל דמות כתומה ונותב
   לסין 06 גם כשעבר את מועד א'. המסמך הוא מקור האמת, localStorage קאש.

   v5 (2026-09-16): מסמך לכל סין — `component` + `payload` במקום
   `part`/`parts{}`/`prev{}` (ראו הכותרת). **יש מיגרציה** מ-v4, ב-migrateState:
   payload = parts[slug של הסין הזה]; היומנים, הדמות והתוצאות נשמרים כפי שהם.
   כל v אחר נזרק. לומד באמצע סין ביום ההעלאה לא מאבד דבר.

   ⚠️ גם כך **חייבים** לקדם את כל ה-?v= של unit-js/*.js ושל script.js בששת
   ה-index.html באותו commit — 40-resume.js מיושן בקאש שקורא מסמך v5 מוחק
   אותו, ו-script.js חדש מול 40-resume.js מיושן קורא ל-setters שלא קיימים. */
var RESUME_STATE_VERSION = 5;
/* כולל את ה-slug: מפתח ה-fallback ב-localStorage (ומפת ה-debounce בספרייה)
   לכל סין בנפרד. currentPartSlug היא הצהרת פונקציה למטה — hoisted. */
var RESUME_STATE_ID      = 'execution-state::' + currentPartSlug();

/* לא נדלק עד הקריאה הראשונה שהצליחה (או ה-catch שלה). כל נתיבי הכתיבה
   בודקים אותו, כדי שכלום לא ייכתב לפני שידוע מה כבר יש במסמך. */
var _resumeReady       = false;

/* דלוק רק בתוך applyExecutionState. מדכא כתיבות ואת היומן — ראו שם. */
var _restoring         = false;

/* מונע מ-handlers של יציאה לדרוך על השמירה שנכתבה רגע לפני ניווט (dev בלבד). */
var _leavingToNextPart = false;

/* המסמך כולו, כפי שנקרא/נכתב לאחרונה. לעולם לא נשאר null אחרי
   readUnitState() — גם sendCompletedOnce וגם captureUnitState נגזרים ממנו,
   וכל אתרי הקריאה שלהם יושבים ב-try/catch שמחניק, כך שזריקה שם הייתה
   מפילה statement אמיתי בשקט. */
var _unitState = null;

/* נדלק ע"י initResumeResetHatch. הדגל נחוץ כי ה-hatch מסלק את ?resetState
   מה-URL בתחילת ה-boot, בעוד readUnitState רץ מאוחר יותר (אחרי טעינת
   הספרייה) — ואז הבדיקה על ה-query string כבר לא הייתה מוצאת כלום. */
var _resetRequested = false;

/* ה-slug של הסין הנוכחי, נגזר מנתיב התיקייה. שמות התיקיות הם מקור האמת
   ל-slug הפנימי הזה, והם כולם באותיות קטנות — כמו המזהים שב-metadata/.

   ⚠️ toLowerCase() אינו קוסמטי. ה-slug נגזר מ-location.pathname, כלומר
   מהאופן שבו הלומד *הגיע* לדף. URL שנבדל רק באות רישית היה מייצר מפתח שני
   לאותו סין — מסמך שה-component שלו "לא תואם" ונזרק, ומפתח יומן אחר — ומשם:
   התקדמות שנעלמת, יומן `done` שמחמיץ, ולכן completed כפול. הנרמול חוסם את זה בשורש.
   בדיקת רגרסיה ב-_test/verify-report.js אוסרת אות רישית בנתיבים האלה. */
function currentPartSlug() {
  var p = window.location.pathname.replace(/\/index\.html.*$/, '').replace(/\/+$/, '');
  return (p.split('/').pop() || '').toLowerCase();
}

function itemLedgerKey(item) { return currentPartSlug() + '#' + item; }

/* ═══════════════════ המסמך ═══════════════════ */

function emptyUnitState() {
  return {
    v: RESUME_STATE_VERSION,
    component: currentPartSlug(),  // של מי המסמך — נבדק בכל קריאה; מסמך של סין אחר נזרק
    payload: null,                 // capturePartPayload() של הסין הזה (כולל currentScreen)
    done:  {},                     // slug של הרכיב → ה-completed שלו נשלח
    doneItems: {},                 // '<slug>#<itemId>' → ה-completed של הפריט נשלח
    /* ── `ui` ו-`results` — העותק של הסין הזה ──
       הדמות נבחרת בסין 01 ומגיעה לסינים הבאים דרך הקאש ב-localStorage
       (adoptUnitCharacter מעתיק אותה למסמך של הסין בכניסה הראשונה). התוצאות
       נכתבות ונקראות באותו סין (05 קורא את של 05, 06 את של 06). */
    hints: {},                      // '<item>/<qKey>' → that hint's 'requested.1' was sent (D-7)
    picks: {},                      // one-off learner choices whose 'selected' was sent
    ui:      { character: null },   // unused in this unit (no character choice)
    results: {}                     // resultKey → value (see RESULT_KEYS)
  };
}

/* מפתחות ה-localStorage שהיו עד v3 מקור האמת, ומ-v4 הם קאש סינכרוני בלבד.
   מוחזקים ברשימה אחת כי שני אתרים צריכים אותה: ה-getters (fallback כשאין
   מסמך) ו-initResumeResetHatch (איפוס חייב לנקות גם את הקאש). */
/* Namespaced per unit (QA D-6): the origin-wide 'lomda_selectedCharacter' was shared by several
   units with incompatible values, and adoptUnitCharacter copied the foreign value into each
   component's Kata document. Part 01's S0 writes it through setUnitCharacter, and every part reads it
   through getCharacter() (unit-js/00-util.js), which accepts only this unit's two characters. */
var UI_CHARACTER_KEY = 'methodica_science_volume_liquid_01_selectedCharacter';
/* ⚠️ Exactly the keys this unit's parts write. A key missing here never reaches the document's
   `results`, so its reader falls back to localStorage only — i.e. a second device reads null.
   This unit writes none (2026-09-28): part 02's 4-of-5 branch to 03/04 is computed in memory at
   the end of part 02, and in production that routing belongs to the platform (catalogue results +
   part 03's recommendedAfterFail), not to a stored gate. Add a key here the day a part persists one. */
var RESULT_KEYS = [];

/* מיגרציה של צעד אחד בלבד (v4 → v5), מכנית וניתנת לבדיקה ב-jsdom. מסמך
   מהגרסה הנוכחית חוזר כמו שהוא; כל גרסה אחרת → null (נזרק). */
function migrateState(old) {
  if (!old) return null;
  if (old.v === RESUME_STATE_VERSION) return old;
  if (old.v !== RESUME_STATE_VERSION - 1) return null;
  var slug = currentPartSlug();
  return {
    v: RESUME_STATE_VERSION,
    component: slug,
    payload: (old.parts && old.parts[slug]) || null,
    done: old.done || {},
    doneItems: old.doneItems || {},
    hints: old.hints || {},
    picks: old.picks || {},
    ui: old.ui || { character: null },
    results: old.results || {}
  };
}

/* תמיד מחזיר מסמך שמיש. מסמך v4 מהוגר; מסמך של סין אחר (component לא תואם)
   נזרק עם אזהרה — registration משותף לשני רכיבים הוא תקלת פלטפורמה, ולא
   מחילים payload זר; 404/null = ניסיון חדש (ראו הכותרת). */
function readUnitState() {
  var doc = null;
  try {
    if (_resetRequested) {
      _unitState = emptyUnitState();
      persistUnitState(_unitState);
      console.log('[resume] state reset');
      return _unitState;
    }
    doc = (typeof window.loadState720 === 'function') ? window.loadState720(RESUME_STATE_ID) : null;
  } catch (e) { console.error('[resume] read', e); doc = null; }
  doc = migrateState(doc);
  if (doc && doc.component && doc.component !== currentPartSlug()) {
    console.warn('[resume] document belongs to "' + doc.component + '", not "' + currentPartSlug() + '" — discarded');
    doc = null;
  }
  if (!doc) doc = emptyUnitState();
  doc.component = currentPartSlug();
  doc.payload   = doc.payload   || null;
  doc.done      = doc.done      || {};
  doc.doneItems = doc.doneItems || {};
  doc.hints     = doc.hints     || {};
  doc.picks     = doc.picks     || {};
  /* חייבים להיות אובייקטים קיימים ולא undefined: **קיומם** הוא מה שאומר
     ל-getters "המסמך הוא הסמכות, אל תיפול ל-localStorage". בלי זה מסמך
     שאופס (או שנוקה ע"י הפלטפורמה לביצוע מחדש) היה מחזיר את הדמות והתוצאות
     מהקאש המיושן — כלומר איפוס שאינו איפוס. */
  doc.ui        = doc.ui        || { character: null };
  doc.results   = doc.results   || {};
  _unitState = doc;
  return doc;
}

/* **מחליף** את ה-payload ולא ממזג לתוכו — מיזוג היה משאיר מפתחות מיושנים בחיים. */
function captureUnitState() {
  var doc = _unitState || emptyUnitState();
  doc.v = RESUME_STATE_VERSION;
  doc.component = currentPartSlug();
  doc.payload = capturePartPayload();
  _unitState = doc;
  return doc;
}

/* חימוש מחדש של ה-debounce **לפני** הכתיבה הסינכרונית הוא מה שמקבע מעבר בין
   סינים: העמוד נשאר בחיים בזמן שהמסמך הבא נטען, מספיק זמן ל-timer מיושן
   לירות ולדרוך על הכתיבה עם payload שעוד מצביע על הסין הזה.
   מחזיר אם הכתיבה הסינכרונית נחתה — מי שעומד לנווט חייב לדעת. */
function persistUnitState(doc) {
  var ok = false;
  try {
    if (typeof window.saveState720Debounced === 'function') window.saveState720Debounced(RESUME_STATE_ID, doc);
    /* !== false ולא בדיקת truthiness: הספרייה מחזירה true/false מפורש בכל
       מסלול (אומת מול 720-common-lib/xapi-720-k.js), ולעולם לא undefined.
       ‎-k לא שינה את החוזה הזה — הוא רק הוסיף לידו את הפירוט. */
    if (typeof window.saveState720 === 'function') ok = (window.saveState720(RESUME_STATE_ID, doc) !== false);
    /* אבחון: ב--j כשל כתיבה היה ביט אחד, ולכן הרצה שנכשלת מול הפלטפורמה לא
       הייתה ניתנת לפירוש — 412 מול 413 (מסמך מעל 1MB) מול 401 מול CORS נראו
       זהים. ‎-k מוסיף את stateLastResult720(); מגודר ב-typeof כדי שהיחידה
       תמשיך לרוץ גם מול -j, שאין בו את הפונקציה. */
    if (!ok && typeof window.stateLastResult720 === 'function') {
      console.error('[resume] persist failed —', window.stateLastResult720());
    }
  } catch (e) { console.error('[resume] persist', e); ok = false; }
  return ok;
}

/* אם הניווט בסוף לא קורה (offline, 404, unload שבוטל) העמוד נשאר בחיים,
   ולכן משחררים — אחרת הסין הזה לא היה יכול לשמור עד סוף הסשן. */
function armLeaving() {
  _leavingToNextPart = true;
  try { setTimeout(function () { _leavingToNextPart = false; }, 5000); } catch (e) {}
}

/* ═══════════════════ מצב ברמת היחידה — דמות ותוצאות מועד ═══════════════════
   ── למה יש כאן בכלל שכבת getters/setters ──
   עד v4 שני סוגי המצב האלה נקראו ונכתבו ישירות ל-localStorage בששת הסינים.
   זה עבד מושלם על מחשב אחד ונשבר לגמרי על שני: המסמך ב-Kata לא הכיל אותם,
   ולכן לומד שהמשיך את אותו רישום ממחשב אחר קיבל כתום במקום ירוק ונותב
   לתוך סין 06 למרות שעבר את מועד א'. השכבה הזאת מעבירה את הסמכות למסמך.

   ── סדר העדיפויות בקריאה, ולמה הוא כזה ──
   1. המסמך, אם `ui`/`results` **קיימים** בו. קיום ולא ערך: מסמך שאופס מכיל
      `{character:null}` ו-`{}`, וזה חייב לנצח קאש מיושן — אחרת ?resetState
      אינו איפוס.
   2. localStorage, כשאין מסמך בכלל — כלומר לפני שה-resume נקרא (הנתיב
      הסינכרוני בראש כל script.js) או כשה-resume כבוי לגמרי.

   ── ולמה localStorage עדיין נכתב ──
   הוא הפך מקאש קריא-סינכרונית ולא ממקור אמת. זה מה שמחזיק את כלל 1
   ב-CLAUDE.md: `window.lomdaState.selectedCharacter` נקבע בשורה 12 של כל
   script.js, לפני ה-paint הראשון, בזמן שהמסמך עוד רחוק שני סקריפטים מה-CDN.
   בלי הקאש היה נפתח בדיוק ההבהוב שהכלל ההוא אוסר. */

/* בחירה/תוצאה שנעשתה לפני ש-_resumeReady נדלק. חלון אמיתי ולא תיאורטי:
   מסך בחירת הדמות הוא מסך 1 של סין 01, והמסמך מגיע רק אחרי שני סקריפטים
   מה-CDN. בלי התור הזה הבחירה לא הייתה מגיעה למסמך אף פעם — אין אחריה שום
   כתיבה שהייתה מתקנת את זה. */
var _pendingProfile = null;
var _pendingResults = null;

/* localStorage זורק SecurityError ב-origin אטום (file://). כל הגישות עוברות
   כאן, כדי שאף אתר קריאה לא ייפול על זה בעצמו. */
function _lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
function _lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
function _lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) {} }

function getUnitCharacter() {
  if (_unitState && _unitState.ui) return _unitState.ui.character || null;
  return _lsGet(UI_CHARACTER_KEY);
}

function setUnitCharacter(c) {
  if (window.lomdaState) window.lomdaState.selectedCharacter = c;
  if (c) _lsSet(UI_CHARACTER_KEY, c); else _lsDel(UI_CHARACTER_KEY);
  if (!RESUME_ENABLED) return;
  if (!_resumeReady || !_unitState) { _pendingProfile = { character: c }; return; }
  _unitState.ui = _unitState.ui || {};
  _unitState.ui.character = c;
  /* סינכרוני ולא מושהה: הלומד לוחץ "המשך" מיד אחרי הבחירה, וכתיבה מושהית
     הייתה יכולה להיירות אחרי הניווט לסין הבא — אותו נימוק בדיוק כמו
     flushResumeSave. */
  try { persistUnitState(captureUnitState()); } catch (e) { console.error('[resume] character', e); }
}

function getUnitResult(key) {
  if (_unitState && _unitState.results) return _unitState.results[key] || null;
  return _lsGet(key);
}

function setUnitResult(key, val) {
  _lsSet(key, val);
  if (!RESUME_ENABLED) return;
  if (!_resumeReady || !_unitState) {
    _pendingResults = _pendingResults || {};
    _pendingResults[key] = val;
    return;
  }
  _unitState.results = _unitState.results || {};
  _unitState.results[key] = val;
  try { persistUnitState(captureUnitState()); } catch (e) { console.error('[resume] result', e); }
}

/* נקרא מ-50-loader.js מיד אחרי ש-_resumeReady נדלק, ו**לפני**
   applyUnitProfile. הסדר הוא מה שמממש את כלל הקדימות: בחירה שנעשתה בסשן
   הזה חדשה יותר ממה שכתוב במסמך, ולכן היא מנצחת אותו. */
function drainPendingUnitState() {
  if (!_unitState) return;
  var dirty = false;
  if (_pendingProfile) {
    _unitState.ui = _unitState.ui || {};
    _unitState.ui.character = _pendingProfile.character;
    _pendingProfile = null;
    dirty = true;
  }
  if (_pendingResults) {
    _unitState.results = _unitState.results || {};
    Object.keys(_pendingResults).forEach(function (k) {
      _unitState.results[k] = _pendingResults[k];
    });
    _pendingResults = null;
    dirty = true;
  }
  if (dirty) {
    try { persistUnitState(captureUnitState()); } catch (e) { console.error('[resume] drain', e); }
  }
}

/* הדמות בכניסה לסין — ארבעה צעדים (החלטה 2026-09-16): (1) המסמך של הסין
   הזה; (2) אם null — הקאש ב-localStorage (הבחירה מסין 01 באותו דפדפן);
   (3) אם נמצא — מועתק למסמך של הסין הזה: ל-doc ישירות, כדי ש-getUnitCharacter
   יחזיר אותו כבר בין שלב א' לשלב ב', ולתור _pendingProfile, כדי
   ש-drainPendingUnitState ישמור אותו בשלב ב' (שלב א' עדיין לא כותב);
   (4) אם אין — הקורא נשאר עם ברירת המחדל.

   **לעולם לא מוחק את הקאש.** הקודם (applyUnitProfile) פירש null במסמך
   כ"אין דמות" ומחק את הבחירה — ותחת מסמך לכל סין כל סין ≥02 נפתח עם null,
   כך שהדמות אבדה בכל שיגור של Kata, ועם ה-fallback גם לסינים שאחריו.

   מחזיר אם השתנה משהו — מסך שכבר צויר בצבע הקודם חייב להיצבע מחדש לפני
   שהכיסוי מוסר. על נתיב השחזור אין צורך בציור נוסף: applyExecutionState
   קורא ל-goTo(), ושם resetScreenState(n) פותר את ה-src **לפני**
   classList.add('active') (כלל 1 ב-CLAUDE.md). */
function adoptUnitCharacter(doc) {
  var c = (doc && doc.ui && doc.ui.character) || null;
  if (!c && !_resetRequested) {   /* איפוס לא מאמץ כלום, גם אם הקאש התמלא שוב */
    c = _lsGet(UI_CHARACTER_KEY);
    if (c && doc) {
      doc.ui = doc.ui || {};
      doc.ui.character = c;
      _pendingProfile = { character: c };
    }
  }
  var cur = window.lomdaState ? (window.lomdaState.selectedCharacter || null) : null;
  if (c) {
    if (window.lomdaState) window.lomdaState.selectedCharacter = c;
    _lsSet(UI_CHARACTER_KEY, c);
  }
  return c !== cur;
}

/* ═══════════════════ כיסוי האתחול ═══════════════════
   #boot-cover יושב ב-markup של ששת ה-index.html (אח של #app, לא בן שלו —
   #app מוזז ומוקטן ע"י scaleApp) וצבוע ברקע העמוד, כדי שהוא ייצבע בפריים
   הראשון. הוא מסתיר את החלון שבו מסך 0 כבר גלוי אבל המסמך עוד לא נקרא.

   ⚠️ זו הדרך היחידה שבה השינוי הזה יכול להשאיר לומד מול מסך ריק, ולכן
   ההסרה מרוכזת כאן, אידמפוטנטית, ונקראת מכל נתיב יציאה של 50-loader.js.
   מעליה יש רשת ביטחון שאינה תלויה בשום קובץ JS: סקריפט inline קטן ב-markup
   שמסיר את הכיסוי אחרי 800ms — אלא אם 50-loader.js הדליק את
   window.__resumeInFlight, ואז הוא ממתין לשחזור עד תקרה קשיחה של 6 שניות.
   גם 40-resume.js שנכשל בטעינה לא יכול להשאיר את הכיסוי במקום: הדגל פשוט
   לעולם לא נדלק, והרשת מסירה ב-800ms כמו קודם.

   כיבוי הדגל כאן ולא באתרי הקריאה: dropBootCover היא כבר הנקודה שכל נתיבי
   היציאה עוברים דרכה, ולכן "הכיסוי ירד" ו"השחזור אינו בתעופה" נשארים צמודים. */
function dropBootCover() {
  try { window.__resumeInFlight = false; } catch (e) {}
  try {
    var c = document.getElementById('boot-cover');
    if (c && c.parentNode) c.parentNode.removeChild(c);
  } catch (e) {}
}

/* ═══════════════════ יומן ה-completed ═══════════════════
   completed אחד לכל רכיב, לכל פריט ולכל היחידה — כפתור "חזרה" הופך כל מסך
   שהושלם לנגיש מחדש, וה-dedupe של הספרייה עצמה מחזיק טעינת עמוד אחת בלבד.

   שלושת הסדרים כאן נושאי-משקל:
   1. **יציאה מוחלטת בזמן _restoring** — לא שולחים וגם לא מסמנים.
      applyExecutionState עושה stub ל-sender, ולכן סימון שנלקח שם היה מדכא
      לתמיד statement שמעולם לא יצא. כך היה נעלם ה-completed של היחידה
      כשלומד משוחזר ישר למסך הסיום.
   2. **fail open, לעולם לא closed.** היומן נשמע רק כשהוא אומר במפורש "כבר
      נשלח". אם המסמך לא זמין — שולחים בכל מקרה: כל אתר קריאה יושב בתוך
      try/catch שמחניק, ושם drop שקט גרוע בהרבה מכפילות.
   3. **הסימון נכתב סינכרונית כאן.** שני אתרי קריאה שולחים בלי לנווט אחר כך
      (מסכי הסיום של סינים 05 ו-06), ולכן שום דבר אחר לא היה כותב אותו.

   'initialized' לא מדוכא, אף פעם — הפלטפורמה מבקשת אותו בכל כניסה. */
function alreadySent(ledger, key) {
  return !!(_unitState && _unitState[ledger] && _unitState[ledger][key]);
}

function markSent(ledger, key) {
  if (!_unitState) return;
  _unitState[ledger] = _unitState[ledger] || {};
  _unitState[ledger][key] = true;
  try { persistUnitState(captureUnitState()); } catch (e) { console.error('[resume] ledger', e); }
}

/* Any verb, same three invariants (ported from methodica-math-scale-01, 2026-09-23). Returns
   whether the key is SETTLED — sent just now or already in the ledger. false means suppressed
   because a restore is in flight, so the caller must not latch anything of its own either. */
function sendStatementOnce(ledger, key, verb, objectType, result, opts) {
  if (_restoring) return false;
  if (alreadySent(ledger, key)) return true;
  sendStatement720(verb, objectType, result || null, opts);
  markSent(ledger, key);
  return true;
}

function sendCompletedOnce(ledger, key, objectType, result, opts) {
  sendStatementOnce(ledger, key, 'completed', objectType, result, opts);
}

/* ═══════════════════ קשתות-חזרה בין סינים ═══════════════════
   ── למה זה קיים ──
   סין 03 ניתן להגעה **משני** מקומות: מסין 02 (המסלול הרגיל) ומסין 01 ישירות
   (כשהלומד עומד בסף 4/5 ומדלג על סין 02). כפתור "חזרה" מקובע היה שולח את מי
   שדילג בחזרה לתוך תוכן שלא ראה.

   הפתרון הוא **מפת קשתות, לא מחסנית**: ניווט קדימה כותב את הקשת, וניווט
   אחורה רק קורא. אין אינווריאנטה שכתיבה חלקית יכולה לשבור, ואין מה לסנכרן.

   ── שכבה אחת + fallback (מ-2026-09-16 הכול dev בלבד) ──
   1. מפת הקשתות ב-sessionStorage — זמינה סינכרונית מרגע טעינת ה-script.
   2. הארגומנטים המקובעים — כשהאחסון חסום או שאין קשת.
   השכבה שהייתה במסמך (`prev`) הוסרה יחד עם מצביע הנחיתה: המסמך הוא של סין
   אחד, ואין בו מה להצביע על סין אחר. הניווט עצמו רץ רק תחת DEV_NAV
   (10-identity.js); בייצור הפלטפורמה משגרת כל רכיב בנפרד.

   הקשת נושאת גם את ה-hash של מסך היעד, כי המסך האחרון שונה בין המקורות
   (מסין 01 חוזרים למסך 20, מסין 02 למסך 9).

   sessionStorage ולא localStorage: הקשת שייכת לניסיון הנוכחי. קשת שנשארת
   מניסיון קודם עלולה לשלוח לומד למסלול שהוא לא עבר בפעם הזאת. */
/* ⚠️ נושא את slug היחידה במכוון. שתי יחידות שחולקות את המפתח הזה חולקות יומן,
   וכל אחת משתיקה בשקט את הדיווחים של השנייה. */
var NAV_EDGE_KEY = 'lomda_nav_edges::methodica-science-volume-liquid-01';

function _readEdges() {
  try {
    var raw = window.sessionStorage.getItem(NAV_EDGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

/* נקרא מכל מנווט קדימה, מיד לפני הניווט. writeForwardState קורא לזה בעצמו,
   כך שהשתיים לא יכולות להיפרד.
     destSlug    שם התיקייה של היעד
     returnHash  ה-hash שיחזיר את הלומד למסך שממנו יצא, למשל '#screen=19' */
function recordForwardEdge(destSlug, returnHash) {
  try {
    var edges = _readEdges();
    edges[destSlug] = { from: currentPartSlug(), hash: returnHash || '' };
    window.sessionStorage.setItem(NAV_EDGE_KEY, JSON.stringify(edges));
  } catch (e) { /* אחסון חסום — ה-fallback בכפתור החזרה יטפל */ }
}

/* הקשת הנכנסת לסין הנוכחי — מהמפה ב-sessionStorage בלבד. */
function _incomingEdge() {
  return _readEdges()[currentPartSlug()] || null;
}

/* פתרון הקשת ל-URL. מופרד מהניווט עצמו במכוון: כך ההחלטה ניתנת לבדיקה בלי
   לנווט בפועל — location.href אינו ניתן ל-stub ב-jsdom, ובלי ההפרדה הזאת
   הכלל שקובע לאן חוזרים לא היה מכוסה בבדיקות בכלל. */
function previousPartHref(fallbackSlug, fallbackHash) {
  var edge = _incomingEdge();
  var slug = (edge && edge.from) || fallbackSlug;
  var hash = edge ? (edge.hash || '') : (fallbackHash || '');
  return '../' + slug + '/index.html' + window.location.search + hash;
}

/* ניווט אחורה — dev בלבד. שומר את הסין הזה סינכרונית (כדי שסיור ?dev=1
   יחזיר אותו למקום שבו עמד) ומנווט. אין יותר מצביע נחיתה לכתוב, ולכן אין
   כתיבה שיכולה להיכשל ולעצור את הניווט. */
function goBackToPreviousPart(fallbackSlug, fallbackHash) {
  /* 2026-09-16: ניווט בין סינים שייך לפלטפורמה. בייצור הפונקציה לא עושה דבר;
     הכפתור שקורא לה מוסתר ב-90-boot.js, וזה הגיבוי למקרה שהוא מגיע בכל זאת
     (מקלדת, DOM ישן). פתוח רק תחת DEV_NAV — ראו unit-js/10-identity.js. */
  if (!DEV_NAV) return;
  var href = previousPartHref(fallbackSlug, fallbackHash);
  if (RESUME_ENABLED && _resumeReady) {
    flushResumeSave();
    armLeaving();
  }
  /* replace() ולא href: כפתור ה-Back של הדפדפן לא צריך לחזור לסין שעזבו. */
  window.location.replace(href);
}

/* רושם את קשת החזרה ושומר את הסין שעוזבים — dev בלבד (הקוראים רצים רק תחת
   DEV_NAV). אין יותר מצביע נחיתה ואין זריעת payload ליעד: המסמך של היעד הוא
   מסמך אחר, של הסין ההוא. */
function writeForwardState(destSlug, returnHash) {
  /* מפת הקשתות תמיד, גם כשה-resume כבוי או לא מוכן — קוד הסינים סומך עליה. */
  recordForwardEdge(destSlug, returnHash);
  if (!RESUME_ENABLED || !_resumeReady) return;
  flushResumeSave();
  armLeaving();
}

/* ═══════════════════ השחזור ═══════════════════
   שבעה שלבים, שלושה מהם נושאי-משקל ולא אינטואיטיביים.

   - **ה-stub על sendStatement720 מוחזק לרוחב כל ה-goTo** (1→6). מסכי הסיום
     של סינים 05 ו-06 שולחים completed של פריט, רכיב **ויחידה** בכניסה, וכלל
     ה-completed-אחד-לטעינת-עמוד של הספרייה לא עוזר בין טעינות עמוד. דיכוי
     רק בזמן החזרת המשתנים היה מכפיל את שלושתם בכל שחזור למסך סיום.
     ה-stub הוא גם הדבר **היחיד** שמדכא 'initialized': 20-xapi.js שולח אותו
     ישירות ולא דרך היומן, ולכן _restoring לבדו לא היה עוצר אותו.

   - **מעבר שני על המשתנים** (4). goTo() מריץ את resetScreenState(n), וזה
     *מאתחל*, לא *משחזר* — הוא מאפס בדיוק את המשתנים שהוחזרו רגע לפני.
     החזרה שנייה מנטרלת את זה בלי לגעת באף resetScreenStateN.
     (בשלב 1 ה-hooks עדיין stubs, ולכן המעבר הזה הוא no-op — אבל הוא נשאר
     כאן כדי שהוספת ה-painters בשלב 2 לא תדרוש לגעת בסדר הזה שוב.)

   - **איפוס xapiCurrentItem** (7). xapiOnScreen() יוצא מוקדם כש-
     item === xapiCurrentItem, וה-latch נשאר דלוק מתוך ה-goTo שדוכא, למרות
     שה-statement נבלע. בלי האיפוס סשן משוחזר לא היה שולח 'initialized'
     של פריט **בכלל**, והחלפת המסך הבאה הייתה סוגרת פריט שלא נפתח.

   ── screenOverride ──
   ה-hash מנצח את המסמך בבחירת **המסך**, אבל לא בשחזור **המצב**. עד 2026-08-18
   ה-loader דילג על applyExecutionState כולו כשהיה '#screen=N' ב-URL, ולכן
   הגעה דרך "חזרה" בין-סינית איבדה את כל השחזור — כולל XAPI_Q_RESULTS ו-
   stationProgress, שמהם נגזר הניתוב קדימה. לומד שעמד בסף היה נשלח לתרגול
   המחזק. עכשיו תמיד משחזרים, וה-hash קובע רק לאן נוחתים. */
function applyExecutionState(st, screenOverride) {
  if (!st) return;
  _restoring = true;
  var _origSend = window.sendStatement720;
  window.sendStatement720 = function () {};
  try {
    applyResumeVars(st);
    /* טווח נבדק מול TOTAL_SCREENS: goTo() חוסם מחוץ לטווח ו**חוזר**, כלומר
       currentScreen היה נשאר על הערך הקודם וה-painter היה מצייר מסך אחר.
       hash מיושן (סין שהתקצר) חוזר לערך שבמסמך, לא נוחת בשום מקום. */
    var _n = (typeof screenOverride === 'number' && screenOverride >= 0 &&
              screenOverride < TOTAL_SCREENS)
      ? screenOverride
      : ((typeof st.currentScreen === 'number') ? st.currentScreen : 0);
    goTo(_n);
    applyResumeVars(st);   // מבטל את האיפוס שעשה resetScreenState של המסך הזה
    applyResumeDom(st);    // לפני ה-painter, שנועל/משבית את השדות
    restoreScreenUI(currentScreen);
    try { restoreEndedButton(); } catch (e) {}   // D-8: the ledger, not the screen, decides (20-xapi.js)
  } catch (e) {
    console.error('[resume] apply', e);
  } finally {
    window.sendStatement720 = _origSend;
    _restoring = false;
  }
  /* לפני שמשהו יכול לסגור פריט: לספר לספרייה על התשובות ששוחזרו זה עתה ולא שודרו
     מחדש בכוונה, אחרת ה-'completed' שלהן נזרק. ראו xapiSeedAnsweredFromResume()
     ב-../unit-js/20-xapi.js. */
  try { xapiSeedAnsweredFromResume(); } catch (e) {}
  xapiCurrentItem = null;
  try { xapiOnScreen(currentScreen); } catch (e) {}
}

/* ═══════════════════ ציור מסך שנענה, בכל ניווט ═══════════════════
   התיקון לבאג ש-applyExecutionState לבדו לא כיסה: applyResumeVars מחזיר את
   משתני התשובה של **כל** השאלות בסין, אבל restoreScreenUI נקרא שם למסך
   הנחיתה **בלבד**. כל מסך אחר שנענה נשאר עם "המשתנים אומרים נענה, ה-DOM
   אומר ריק" — וזה חסימה מלאה, לא אי-נוחות: scqNSelect פותח ב-
   `if (scqNDone) return;` ולכן כל קליק נבלע; resetScreenStateN יוצא מוקדם על
   scqNDone ולכן לא מצייר ולא מפעיל; וה-disabled של כפתור הבדיקה מגיע
   מה-markup, כך שרק restoreScqUI או scqNCheck חי מסירים אותו. הלומד נשאר בלי
   שום שליטה קדימה — וכפתור "חזרה" של כל מסך הוא goTo(n-1), כלומר לחיצה אחת
   מנחיתה אותו על מסך תקוע נוסף. רק רענון עמוד משחרר.

   למה בלי "פעם אחת למסך": כל 20 ה-painters כבר idempotent ומוגנים ב-guard
   של מסך נקי, ושלושת המפגעים שבגללם שקלתי bookkeeping אינם ניתנים להגעה
   בניווט חוזר (resetScreenState10 יוצא על s11Matches > 0, s11RestoreUI יוצא
   על s11Matches === 0, ו-scqFbResetPosition רץ כבר בכל showFeedback חי).
   בנוסף, gating היה מסתיר את התיקון של סימוני הטעות (ראו applyResumeDom).
   ההערות בכל ששת הסינים ממילא מתארות את ההתנהגות הזאת ("נקרא גם
   מ-applyExecutionState וגם — בשלב 2 — מכל ניווט"); רק הקריאה עצמה חסרה.

   מדלגים בזמן _restoring: applyExecutionState מצייר בעצמו, ו**אחרי**
   applyResumeDom — ציור מוקדם משם היה על placement שעוד לא הוחזר. */
/* דלוק כל עוד repaintScreen מצייר. ראו resumeIsPainting למטה. */
var _repainting = false;

/* "האם צייר רץ עכשיו" — כלומר מסך נענה מצויר מחדש, ולא אירוע חי של הלומד.
   שני המצבים נספרים: applyExecutionState (שמסמן _restoring) ו-repaintScreen,
   שרץ **מחוץ** ל-_restoring במכוון ולכן צריך דגל משלו.

   נדרש כי scqFbResetPosition מאפס את מיקום בועית המשוב בכל showFeedback, וכל
   ציור מחדש עובר דרך אותן פונקציות showFeedback עצמן. בלי ההבחנה הזאת אי אפשר
   להבדיל בין "משוב חדש" (שבו האיפוס נכון — בועית שנגררה לפינה חייבת לחזור
   לתצוגה) לבין "הצייר מציג מחדש משוב קיים" (שבו האיפוס הוא בדיוק הבאג שדווח:
   המיקום שהלומד בחר נמחק בכל רענון ובכל ניווט חזרה למסך). */
function resumeIsPainting() { return _restoring || _repainting; }

function repaintScreen(n) {
  if (!RESUME_ENABLED || _restoring) return;
  if (typeof restoreScreenUI !== 'function') return;
  _repainting = true;
  try { restoreScreenUI(n); }
  catch (e) { console.error('[resume] repaintScreen', e); }
  finally { _repainting = false; }
  try { restoreEndedButton(); } catch (e) {}   // D-8 (20-xapi.js)
}

/* ═══════════════════ מתי נכתב ═══════════════════
   כולם יוצאים אם ה-resume כבוי, אם עוד לא הייתה קריאה מוצלחת, או בתוך
   שחזור — כך שכלום לא נכתב בזמן replay וכלום לא נכתב לפני הקריאה. */

/* החלפת מסך — נקודת החנק. מושהה: תוחם את האיבוד למסך אחד. */
function scheduleResumeSave() {
  if (!RESUME_ENABLED || !_resumeReady || _restoring) return;
  if (typeof window.saveState720Debounced !== 'function') return;
  try { window.saveState720Debounced(RESUME_STATE_ID, captureUnitState()); } catch (e) {}
}

/* מחויבות תשובה / סיום — סינכרוני.
   למה לא מושהה: goTo(n) מחמש שמירה מושהית; הלומד לוחץ "המשך" 200ms אחר כך;
   פונקציית הניתוב כותבת את ה-blob של היעד ומנווטת — אבל העמוד נשאר בחיים
   בזמן שהמסמך הבא נטען, מספיק זמן ל-timer המיושן לירות **אחרי** הכתיבה
   קדימה. השיגור הבא היה חוזר לתוך הסין שהסתיים. */
function flushResumeSave() {
  if (!RESUME_ENABLED || !_resumeReady || _restoring) return;
  if (typeof window.saveState720 !== 'function') return;
  try { window.saveState720(RESUME_STATE_ID, captureUnitState()); } catch (e) {}
}

/* יציאה מהעמוד. beforeunload לבדו לא מספיק: הוא לא נורה כשלשונית מובייל
   עוברת לרקע ואז נהרגת — וזו בדיוק הדרך שבה לומד עוזב באמצע. */
function flushResumeSaveOnLeave() {
  if (_leavingToNextPart) return;
  flushResumeSave();
}

/* נרשם מ-90-boot.js. */
function initResumeLeaveHandlers() {
  window.addEventListener('beforeunload', flushResumeSaveOnLeave);
  window.addEventListener('pagehide', flushResumeSaveOnLeave);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushResumeSaveOnLeave();
  });
}

/* ═══════════════════ פתח יציאה ל-QA ═══════════════════
   מחוץ לפלטפורמה אין ?registration, ולכן ה-fallback ב-localStorage מכתיב
   לכל הרצה מקומית את **אותו** מסמך — כלומר אחרי מעבר אחד היומן מלא ואף
   completed לא נשלח שוב, מה שנקרא כרגרסיה קטסטרופלית למי שבודק אחר כך.
   ?resetState מתחיל מדף חלק.

   מנקה את עצמו מה-URL: אחרת כל רענון של הדף היה מאפס שוב — וה-resume
   לעולם לא היה עובד. הניקוי חייב לקרות לפני שמישהו קורא את ה-query, ולכן
   90-boot.js קורא לזה ראשון; הדגל _resetRequested הוא מה שמעביר את הכוונה
   ל-readUnitState, שרץ מאוחר יותר כשה-URL כבר נקי. */
function initResumeResetHatch() {
  if (!/[?&]resetState(=|&|$)/.test(window.location.search)) return;
  _resetRequested = true;
  try { window.sessionStorage.removeItem(NAV_EDGE_KEY); } catch (e) {}
  /* גם הקאש, לא רק המסמך. ה-getters נופלים ל-localStorage כשאין מסמך — כלומר
     בדיוק בנתיב הסינכרוני שרץ בראש כל script.js, לפני readUnitState. בלי
     הניקוי הזה ?resetState היה מותיר את הדמות ואת שערי המועד מהריצה הקודמת
     בחיים עד שהמסמך מגיע, ואיפוס שמשאיר מצב אינו איפוס. */
  _lsDel(UI_CHARACTER_KEY);
  RESULT_KEYS.forEach(_lsDel);
  try {
    var q = window.location.search
      .replace(/([?&])resetState(=[^&]*)?(&|$)/, '$1')
      .replace(/[?&]$/, '');
    history.replaceState(null, '', window.location.pathname + q + window.location.hash);
  } catch (e) {}
  console.log('[resume] reset requested');
}
