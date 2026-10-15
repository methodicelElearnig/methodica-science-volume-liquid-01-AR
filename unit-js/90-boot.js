'use strict';
/* ═══════════════════ BOOT ═══════════════════
   הקובץ היחיד ב-unit-js/ שיש לו side effects ברמת top-level, ותג ה-script
   האחרון בכל עמוד — אחרי script.js של הסין, כך שכל hook פר-סיני שהוא קורא
   כבר קיים.

   ── למה קובץ נפרד, ולא כמה שורות בתחתית script.js ──
   נסיון ראשון כן הוסיף את הקריאות האלה לבלוק ה"אתחול" שבתחתית כל script.js.
   הרצה headless על ששת הסינים הראתה למה זו טעות: זריקה ברמת top-level בקוד
   האתחול הקיים (בסינים 02/05/06 זה היה video.play().catch על סביבה שבה play()
   לא ממומש) מפילה את *שאר* אותו script — כלומר מודאל הדיווח והדיווחיות לא
   היו מאותחלים בכלל, בשקט. תג script נפרד מריץ קונטקסט נפרד: זריקה
   ב-script.js לא נוגעת בו. זו בדיוק הסיבה שלומדת המתמטיקה מחזיקה 90-boot.js
   נפרד, ולא כמה שורות בסוף כל סין.

   ── הסדר נושא-משקל ──
     1. initResumeResetHatch() ראשון — הוא משנה את ה-URL (הסרת ?resetState)
        ומדליק את דגל האיפוס, ולכן חייב לרוץ לפני שמישהו קורא את ה-query או
        נוגע במסמך ה-state.
     2. initResumeLeaveHandlers() — beforeunload / pagehide / visibilitychange.
        נרשם מוקדם במכוון: הוא הרשת שתופסת לומד שעוזב לפני שהגיע לניווט מסודר.
        אין צורך לגדר אותו ב-RESUME_ENABLED — flushResumeSave בודק את הדגל
        בעצמו, ולכן ה-handlers פשוט אינרטיים כשה-resume כבוי.
     3. initReportModal() — כפתור הדגל, ה-select המותאם, שלושת הדיאלוגים.
     4. hideCrossPartBack() — "חזרה" של המסך הראשון מנווט לסין הקודם, וזה שייך
        לפלטפורמה (2026-09-16). מוסתר אלא אם DEV_NAV (10-identity.js);
        goBackToPreviousPart עצמו גם נעצר בלי הדגל, כך שהכפתור המוסתר הוא
        הנוחות והפונקציה היא הגיבוי.
     5. bootXAPI() אחרון. הוא טוען שני סקריפטים מה-CDN ומדווח את ה-initialized
        של הרכיב. (קפיצת ה-resume לסין אחר שהייתה בו הוסרה ב-2026-09-16 —
        הרכיב שהושג הוא הרכיב שמוצג.)

   הראשונות עטופות ב-try/catch כל אחת בנפרד, כדי שכשל באחת לא ימנע את
   האחרות. bootXAPI() עוטף כבר את עצמו פנימה.

   אין צורך ב-DOMContentLoaded: התג הזה יושב מיד לפני </body>, ולכן ה-DOM שלם. */
/* methodica-science-volume-liquid-01: each part names its first-screen "חזרה" in S0_BACK_ID
   (js/main.js) — 's0-back' in parts 03-07, 's15-back' in part 02, none in part 01 — so it is
   looked up by that constant rather than by mass-measure-03's fixed #s0-back. */
function hideCrossPartBack() {
  if (DEV_NAV) return;
  var b = document.getElementById(typeof S0_BACK_ID !== 'undefined' ? S0_BACK_ID : 's0-back');
  /* Inline display:none as well as the attribute: the button's own rule (.btn-back { display:flex })
     is an author rule and beats the UA's [hidden] { display:none } — seen live on 16/09, the
     button stayed on screen with hidden === true. */
  if (b) { b.hidden = true; b.style.display = 'none'; b.setAttribute('aria-hidden', 'true'); }
}

(function boot() {
  /* methodica-science-volume-liquid-01: a part without the four resume hooks (§8.7) runs without
     resume instead of throwing inside every save and restore. Decided here, before bootXAPI() reads
     the flag to choose the library letter. Each part defines all four; this is a safety net. */
  if (RESUME_ENABLED && ['capturePartPayload', 'applyResumeVars', 'applyResumeDom', 'restoreScreenUI']
        .some(function (f) { return typeof window[f] !== 'function'; })) {
    console.warn('[resume] this part lacks the resume hooks — resume is off for it');
    RESUME_ENABLED = false;
  }
  try { initResumeResetHatch(); }    catch (e) { console.error('[boot] initResumeResetHatch', e); }
  try { initResumeLeaveHandlers(); } catch (e) { console.error('[boot] initResumeLeaveHandlers', e); }
  try { initReportModal(); }         catch (e) { console.error('[boot] initReportModal', e); }
  try { hideCrossPartBack(); }       catch (e) { console.error('[boot] hideCrossPartBack', e); }
  bootXAPI();
})();
