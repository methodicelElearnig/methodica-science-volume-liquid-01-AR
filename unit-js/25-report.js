'use strict';
/* ═══════════════════ מודאל דיווח בעיה — "מצאתם בעיה?" ═══════════════════
   משותף לששת הסינים. Definition-only: בלוק ה"אתחול" בתחתית כל script.js
   קורא ל-initReportModal().

   מקור: methodica-math-scale-01-vadimr-1/unit-js/25-report.js, בגרסת ה-superset
   (זו שכוללת #report-text-error ו-reportTextBlur), לפי REPORT-ISSUE.md §2 —
   "take the superset and prove it inert". כאן המודאל נבנה מאפס בכל ששת
   הסינים, ולכן כל השישה מקבלים את המבנה החדש ואין בכלל שתי גרסאות.

   התפרים הפר-סיניים, נקראים בזמן CALL ולא בזמן טעינה:
     SCREEN_TO_SUBCONTENT   מסך -> [סיומת פריט, עמוד-בפריט]
     currentScreen          מקום הלומד
   שניהם מוצהרים ב-script.js של הסין, שנטען אחרי הקובץ הזה. currentScreen הוא
   `let` ברמת top-level של classic script, כלומר הוא נכנס לסביבה הלקסיקלית
   הגלובלית המשותפת ולא ל-window. הקריאה כאן קורית בזמן קליק, אחרי שכל
   הסקריפטים נטענו, ולכן היא תקינה — אבל אסור לגעת ב-currentScreen ברמת
   top-level של קובץ משותף, שם הוא עוד ב-TDZ. */

/* טופס ה-Google שאוסף את דיווחי הלומדים.
   ═══ טופס משותף וגלובלי לכל יחידות 720, לא ייעודי ליחידה הזאת. ═══
   נקבע ע"י בעלת התוכן (2026-08-13): אותו טופס משמש את כל היחידות, והכתובת
   הזאת — שמקורה ב-methodica-math-scale-01 — היא הכתובת האוניברסלית.

   ── למה זה עובד כאן, בעוד REPORT-ISSUE.md §3 מזהיר מכתובת מושאלת ──
   האזהרה שם היא על השאלה **לא מכוונת**: "reports were arriving under the
   wrong project until the endpoint was corrected". מה שהופך שיתוף מכוון
   לתקין הוא ששני שדות בטופס נושאים את הזיהוי בכל שליחה:
     entry.1933069481 = slug היחידה  (methodica-science-volume-liquid-01)
     entry.2070680092 = slug הסין
   כלומר בגיליון המשותף יש עמודה שמפרידה בין היחידות, ודיווח מהיחידה הזאת
   ניתן לזיהוי חד-משמעי. השדות האלה נשלחים מ-window.METADATA, כלומר מהמטא-דאטה
   של הסין עצמו — לא מקובעים בקוד.

   ⚠️ המשמעות התפעולית: הגיליון מכיל דיווחים מכל יחידות 720 יחד. סינון לפי
   עמודת slug היחידה הוא חלק מתהליך הקריאה של הדיווחים, לא אופציה. */
var REPORT_FORM_ACTION =
  'https://docs.google.com/forms/d/e/1FAIpQLSfFq5XFtH1pPpLgV5RWT4m3NanYPW5GKremqTvkp6zKjEGqcw/formResponse';

/* מפתחות ה-entry.* של אותו טופס משותף. מכיוון שהטופס אחד לכל היחידות,
   המפתחות זהים בכל יחידה ואין מה להתאים — שינוי כאן ישבור את כל היחידות
   שמדווחות לאותו טופס, לא רק את זו. */
var REPORT_FIELDS = {
  dateYear:   'entry.301404029_year',
  dateMonth:  'entry.301404029_month',
  dateDay:    'entry.301404029_day',
  timeHour:   'entry.2066097581_hour',
  timeMinute: 'entry.2066097581_minute',
  unitSlug:   'entry.1933069481',
  compSlug:   'entry.2070680092',
  itemId:     'entry.1555704258',
  itemPage:   'entry.1671046914',
  problemType:'entry.1179822443',
  freeText:   'entry.806447525'
};

/* תוויות סוגי הבעיה. ברמת מודול, כי גם ה-select המותאם וגם submitReport
   צריכים אותן — הטופס רושם את התווית הקריאה, לא את המפתח הפנימי. המבנה
   הוא input נסתר + select מותאם ולא <select> נייטיב, ולכן האידיום המקובל
   options[selectedIndex].text לא רלוונטי. */
var REPORT_TYPE_LABELS = {
  'technical': 'תקלה טכנית או שמשהו לא עובד',
  'unclear':   'משהו לא ברור לי',
  'other':     'אחר'
};

/* Arabic build: what the learner SEES in the type dropdown. REPORT_TYPE_LABELS above stays Hebrew on purpose:
   it is the value submitted to the shared Google form used by every 720 unit, so the sheet stays filterable. */
var REPORT_TYPE_DISPLAY = {
  'technical': 'عطل تقني أو شيء لا يعمل',
  'unclear':   'شيء غير واضح لي',
  'other':     'أخرى'
};

function openReportModal() {
  resetReportForm();
  var m = document.getElementById('report-modal');
  if (m) m.removeAttribute('hidden');
}

function tryCloseReportModal() {
  var typeEl = document.getElementById('report-type');
  var textEl = document.getElementById('report-text');
  var typeVal = typeEl ? typeEl.value : '';
  var textVal = textEl ? textEl.value.trim() : '';

  /* יש קלט שלא נשלח — שואלים לפני שזורקים אותו. #report-confirm-modal הוא
     דיאלוג נטישה, לא דיאלוג תודה; אלה שני דברים שונים (REPORT-ISSUE.md §2). */
  if (typeVal || textVal) {
    document.getElementById('report-modal').setAttribute('hidden', '');
    document.getElementById('report-confirm-modal').removeAttribute('hidden');
  } else {
    forceCloseReportModal();
  }
}

function forceCloseReportModal() {
  document.getElementById('report-modal').setAttribute('hidden', '');
  document.getElementById('report-confirm-modal').setAttribute('hidden', '');
  resetReportForm();
}

function backToReportForm() {
  document.getElementById('report-confirm-modal').setAttribute('hidden', '');
  document.getElementById('report-modal').removeAttribute('hidden');
  setTimeout(function () {
    var el = document.querySelector('#report-type-wrapper .report-select-btn');
    if (el) el.focus();
  }, 40);
}

function showReportThanks() {
  document.getElementById('report-modal').setAttribute('hidden', '');
  document.getElementById('report-confirm-modal').setAttribute('hidden', '');
  var thanks = document.getElementById('report-thanks-modal');
  if (thanks) {
    thanks.removeAttribute('hidden');
    var btn = thanks.querySelector('.report-submit-btn');
    if (btn) setTimeout(function () { btn.focus(); }, 40);
  }
  resetReportForm();
}

function closeReportThanks() {
  var thanks = document.getElementById('report-thanks-modal');
  if (thanks) thanks.setAttribute('hidden', '');
}

function submitReport() {
  var typeKey = document.getElementById('report-type').value;
  var textVal = document.getElementById('report-text').value.trim();
  /* כפתור השליחה כבר מגודר ע"י reportCheckSubmit(); זה המסלול החגורה-וכתפיות
     לשליחה מהמקלדת או מקוד. */
  if (!typeKey || !textVal) { reportCheckSubmit(); return; }

  var now  = new Date();
  var meta = window.METADATA || {};
  var body = new URLSearchParams();
  body.append(REPORT_FIELDS.dateYear,   now.getFullYear());
  body.append(REPORT_FIELDS.dateMonth,  now.getMonth() + 1);
  body.append(REPORT_FIELDS.dateDay,    now.getDate());
  body.append(REPORT_FIELDS.timeHour,   now.getHours());
  body.append(REPORT_FIELDS.timeMinute, now.getMinutes());
  body.append(REPORT_FIELDS.unitSlug,   shortId(meta.learningUnitId));
  body.append(REPORT_FIELDS.compSlug,   shortId(meta.id));

  /* הפריט והעמוד-בפריט מגיעים מאותה מפת מסכים ששכבת ה-xAPI משתמשת בה, ולכן
     דיווח ו-statement תמיד מצביעים על אותו מקום — זה מה שהופך דיווח לניתן
     למעקב עד למקום המדויק של הלומד. מסך לא-ממופה מדווח את מספר המסך הגלמי.
     מגודר ב-typeof: המודאל עובד כבר עכשיו, לפני שהוגדרו המפות הפר-סיניות. */
  var map = (typeof SCREEN_TO_SUBCONTENT !== 'undefined') ? SCREEN_TO_SUBCONTENT : null;
  var mapEntry = map ? map[currentScreen] : null;
  var itemId   = mapEntry ? shortId(meta.id) + '-' + mapEntry[0] : '';
  var itemPage = mapEntry ? String(mapEntry[1]) : String(currentScreen);
  body.append(REPORT_FIELDS.itemId,      itemId);
  body.append(REPORT_FIELDS.itemPage,    itemPage);
  body.append(REPORT_FIELDS.problemType, REPORT_TYPE_LABELS[typeKey] || typeKey);
  body.append(REPORT_FIELDS.freeText,    textVal);

  if (!REPORT_FORM_ACTION) {
    /* שער בטיחות. לא אמור לקרות — הכתובת מוגדרת למעלה — אבל אם מישהו יאפס
       אותה, עדיף כשל רועש על שליחה שקטה לשום מקום. מסך התודה כן מוצג:
       התנהגות מול הלומד חייבת להישאר זהה, וחסימתו כאן גרועה יותר. */
    console.error('[Report] REPORT_FORM_ACTION not configured — הדיווח לא נשלח לשום מקום.\n' +
      '  מה שהיה נשלח:', Object.fromEntries(body));
    showReportThanks();
    return;
  }

  /* no-cors: Google Forms מקבל את ה-POST ומחזיר תשובה אטומה. אין מה להסתעף
     על הסטטוס. כשל לעולם לא חוסם את הלומד, ולכן המודאל נסגר בכל מקרה. */
  fetch(REPORT_FORM_ACTION, { method: 'POST', mode: 'no-cors', body: body })
    .catch(function (e) { console.error('[Report] send failed', e); });
  console.log('[Report Issue] sent');
  showReportThanks();
}

function reportCheckSubmit() {
  var typeEl = document.getElementById('report-type');
  var textEl = document.getElementById('report-text');
  var btn = document.querySelector('#report-modal .report-submit-btn');
  if (!btn) return;
  var typeVal = typeEl ? typeEl.value : '';
  var textVal = textEl ? textEl.value.trim() : '';
  btn.disabled = !(typeVal && textVal);
}

function resetReportForm() {
  var wrapper = document.getElementById('report-type-wrapper');
  if (wrapper && wrapper._resetSelect) wrapper._resetSelect();
  var ta = document.getElementById('report-text');
  var taErr = document.getElementById('report-text-error');
  if (ta) { ta.value = ''; ta.classList.remove('has-error'); }
  if (taErr) taErr.hidden = true;
  var count = document.getElementById('report-char-count');
  if (count) count.textContent = '0 / 250';
  var star = document.querySelector('#report-modal .required-star.is-error');
  if (star) star.classList.remove('is-error');
  reportCheckSubmit();
}

/* מחווט מה-markup כ-onblur="reportTextBlur()". כל חיפוש מגודר. */
function reportTextBlur() {
  var ta    = document.getElementById('report-text');
  var taErr = document.getElementById('report-text-error');
  if (!ta || !taErr) return;
  if (!ta.value.trim()) {
    ta.classList.add('has-error');
    taErr.hidden = false;
  } else {
    ta.classList.remove('has-error');
    taErr.hidden = true;
  }
}

/* ═══ כל מה שיש לו side effect יושב כאן, ונקרא פעם אחת מבלוק האתחול ═══ */
function initReportModal() {
  /* ── חיווט כפתור הדגל ב-delegation, לא ב-onclick ──
     סינים 01–02 מחזיקים מופע גלובלי אחד של .flag-btn מחוץ לכל .screen, אבל
     סינים 03–06 משכפלים אותו לכל מסך — 18 מופעים בסך הכל. getElementById או
     onclick בודד היו מחווטים אחד מהם בשקט ומשאירים את השאר מתים. Delegation
     על document תופס את כולם, כולל מופעים שיתווספו בעתיד. זה גם הדפוס שכבר
     בשימוש בפרויקט הזה עבור #img-zoom-modal. */
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.flag-btn')) {
      e.preventDefault();
      openReportModal();
    }
  });

  /* ה-select המותאם */
  (function () {
    var LABELS = REPORT_TYPE_LABELS;
    var PLACEHOLDER = 'اختاروا نوع المشكلة';
    var wrapper = document.getElementById('report-type-wrapper');
    if (!wrapper) return;
    var btn        = wrapper.querySelector('.report-select-btn');
    var list       = wrapper.querySelector('.report-select-list');
    var hidden     = document.getElementById('report-type');
    var valSpan    = wrapper.querySelector('.report-select-value');
    var errEl      = document.getElementById('report-type-error');
    var wasOpened  = false;
    var pickingOpt = false;

    function showError() {
      btn.classList.add('has-error');
      if (errEl) errEl.hidden = false;
    }
    function clearError() {
      btn.classList.remove('has-error');
      if (errEl) errEl.hidden = true;
    }
    function closeList() {
      list.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', function () {
      var opening = list.hidden;
      list.hidden = !opening;
      btn.setAttribute('aria-expanded', String(opening));
      if (opening) {
        wasOpened = true;
      } else {
        if (!hidden.value) showError();
      }
    });

    /* mousedown/mouseup על הרשימה: בלעדיהם ה-blur של הכפתור קורה לפני
       ה-click על האופציה, ומציג שגיאה בדיוק ברגע שהלומד בוחר. */
    list.addEventListener('mousedown', function () { pickingOpt = true; });
    list.addEventListener('mouseup',   function () { pickingOpt = false; });

    btn.addEventListener('blur', function () {
      if (!pickingOpt && wasOpened && !hidden.value) showError();
    });

    wrapper.querySelectorAll('.report-select-option').forEach(function (opt) {
      opt.addEventListener('click', function () {
        hidden.value = opt.getAttribute('data-value');
        valSpan.textContent = REPORT_TYPE_DISPLAY[hidden.value] || PLACEHOLDER;
        btn.classList.remove('is-placeholder');
        clearError();
        wasOpened = false;
        closeList();
        wrapper.querySelectorAll('.report-select-option').forEach(function (o) { o.classList.remove('is-selected'); });
        opt.classList.add('is-selected');
        hidden.dispatchEvent(new Event('change'));
      });
    });

    document.addEventListener('click', function (e) {
      if (!wrapper.contains(e.target)) {
        if (wasOpened && !hidden.value) showError();
        closeList();
      }
    });

    wrapper._resetSelect = function () {
      wasOpened = false;
      hidden.value = '';
      valSpan.textContent = PLACEHOLDER;
      btn.classList.add('is-placeholder');
      btn.classList.remove('has-error');
      btn.setAttribute('aria-expanded', 'false');
      if (errEl) errEl.hidden = true;
      closeList();
      wrapper.querySelectorAll('.report-select-option').forEach(function (o) { o.classList.remove('is-selected'); });
    };
  })();

  /* מונה התווים */
  var reportTextarea = document.getElementById('report-text');
  var reportCounter  = document.getElementById('report-char-count');
  if (reportTextarea && reportCounter) {
    reportTextarea.addEventListener('input', function () {
      reportCounter.textContent = reportTextarea.value.length + ' / 250';
      reportCheckSubmit();
    });
  }

  var reportSelect = document.getElementById('report-type');
  if (reportSelect) {
    reportSelect.addEventListener('change', function () {
      reportCheckSubmit();
      var field = document.querySelector('#report-modal .report-field');
      var star = field ? field.querySelector('.required-star') : null;
      if (star) star.classList.toggle('is-error', !reportSelect.value);
    });
  }

  if (reportTextarea) {
    reportTextarea.addEventListener('blur', function () {
      var field = reportTextarea.closest('.report-field');
      var star = field ? field.querySelector('.required-star') : null;
      if (star) star.classList.toggle('is-error', !reportTextarea.value.trim());
    });
    reportTextarea.addEventListener('input', function () {
      if (reportTextarea.value.trim()) {
        var field = reportTextarea.closest('.report-field');
        var star = field ? field.querySelector('.required-star') : null;
        if (star) star.classList.remove('is-error');
      }
    });
  }

  /* Escape סוגר. הסדר חשוב: דיאלוג הנטישה נבדק לפני טופס הדיווח, כי כשהוא
     פתוח הטופס מוסתר וללא הבדיקה הראשונה Escape היה פותח אותו מחדש. */
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    var thanksModal  = document.getElementById('report-thanks-modal');
    var confirmModal = document.getElementById('report-confirm-modal');
    var reportModal  = document.getElementById('report-modal');
    if (thanksModal  && !thanksModal.hasAttribute('hidden'))  { closeReportThanks();     return; }
    if (confirmModal && !confirmModal.hasAttribute('hidden')) { forceCloseReportModal(); return; }
    if (reportModal  && !reportModal.hasAttribute('hidden'))  { tryCloseReportModal();   return; }
  });

  if (!REPORT_FORM_ACTION) {
    console.warn('[Report] REPORT_FORM_ACTION is null — דיווחי לומדים לא יישלחו לשום מקום. חוסם שחרור.');
  }
}
