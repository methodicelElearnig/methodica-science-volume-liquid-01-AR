'use strict';
/* ═══════════════════ xAPI — loader / init ═══════════════════
   משותף לששת הסינים. Definition-only. bootXAPI() נקרא אחרון מ-90-boot.js.
   (עד 2026-09-16 זה היה גם השלב שעשוי לנווט הלאה — כשמסמך ה-resume הצביע על
   סין אחר הוא עשה window.location.replace(). הקפיצה הזאת הוסרה: הפלטפורמה
   משגרת רכיב, והרכיב שהושג הוא הרכיב שמוצג. ראו REPORT-XAPI.md §10.)

   התפרים הפר-סיניים:
     XAPI_METADATA_FILE   חובה — '../metadata/<component>.json'
     onXapiReady()        אופציונלי — רץ אחרי ה-initialized של הרכיב ואחרי
                          ה-init של הפריט במסך הנחיתה. סינים 01 ו-06 משתמשים
                          בו לטעינת מטא-דאטת היחידה.

   מקור: methodica-math-scale-01-vadimr-1/unit-js/50-loader.js. בלוק ה-resume
   hop הוחזר ב-2026-08-17 יחד עם unit-js/40-resume.js, והוסר ב-2026-09-16. */

function bootXAPI() {
  var CDN = 'https://lomdot.education.gov.il/metodica/720active/common/';

  /* ── מחזיקים את כיסוי האתחול, **לפני** טעינת ה-CDN ──
     הדגל נדלק כאן ולא בשלב א', וזה העיקר: שלב א' רץ אחרי שני הסקריפטים
     הסידרתיים מה-CDN, ובקאש קר הם לוקחים יותר מ-800ms — כלומר רשת הביטחון
     ב-markup הייתה חושפת את מסך 0 עוד לפני שמישהו ידע שיש מה לשחזר, וההבזק
     חוזר בדיוק בתרחיש שבגללו התיקון נעשה. כאן, לעומת זאת, אנחנו רצים
     סינכרונית מ-90-boot.js בזמן הפרסור הראשוני, הרבה לפני 800ms.
     זו הערכה אופטימית ("כנראה יש מה לשחזר") שכל נתיב יציאה מכבה: שער 1
     למטה, ענף "אין payload" בשלב א', ה-catch-ים, ו-dropBootCover עצמה. */
  if (typeof RESUME_ENABLED !== 'undefined' && RESUME_ENABLED) {
    try { window.__resumeInFlight = true; } catch (e) {}
  }

  /* ── שער 1: התפר הפר-סיני חייב להיות מוגדר ──
     בלי XAPI_METADATA_FILE, getXAPIParameters מקבל undefined, לא מצליח להביא
     מטא-דאטה, ו-jsXAPI_MetadataReady לעולם לא נדלק — כלומר pollMetadataReady
     היה נכנס ללופ טיימרים אין-סופי בלי שום שגיאה גלויה. סין שלא הגדיר את
     התפר מקבל הודעה רועשת ויציאה נקייה במקום.
     זה גם מה שמאפשר לבלוק האתחול לקרוא ל-bootXAPI() בכל הסינים לפני
     שהוגדרה הקונפיגורציה הפר-סינית — הלומדה פשוט רצה בלי דיווחיות. */
  if (typeof XAPI_METADATA_FILE === 'undefined' || !XAPI_METADATA_FILE) {
    console.warn('[xAPI] XAPI_METADATA_FILE לא מוגדר בסין הזה — הדיווחיות כבויה. ' +
      'זה המצב הצפוי עד להשלמת הקונפיגורציה הפר-סינית (REPORT-XAPI.md §2).');
    dropBootCover();   // אין resume בנתיב הזה, ואסור להשאיר את הכיסוי במקום
    return;
  }

  function loadScript(src, cb) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = cb;
    s.onerror = function () { console.error('[xAPI] failed to load', src); cb(); };
    document.head.appendChild(s);
  }

  /* ── שער 2: הפולינג חסום בזמן ──
     המקור במתמטיקה מפולל לנצח. אם קובץ המטא-דאטה חסר או מחזיר 404 —
     תרחיש דפלוימנט אמיתי לגמרי — זה לופ טיימרים שקט לכל אורך הסשן.
     50 נסיונות × 200ms = 10 שניות, ואז שגיאה שמסבירה מה לבדוק. */
  var METADATA_POLL_MAX = 50;
  function pollMetadataReady(cb, tries) {
    tries = tries || 0;
    if (window.jsXAPI_MetadataReady) { cb(); return; }
    if (tries >= METADATA_POLL_MAX) {
      console.error('[xAPI] מטא-דאטה לא נטענה תוך ' + (METADATA_POLL_MAX * 200 / 1000) + 's — ' +
        'הדיווחיות כבויה בסין הזה. לבדוק שהקובץ קיים ונגיש: ' + XAPI_METADATA_FILE);
      dropBootCover();   // ה-cb לא ייקרא לעולם — הכיסוי חייב ליפול כאן
      return;
    }
    setTimeout(function () { pollMetadataReady(cb, tries + 1); }, 200);
  }

  /* -i הוא בילד הייצור (הנחיות 720 v2.4); -k הוא -j (שהוא -i + שכבת ה-State API)
     בתוספת אבחון על שכבת ה-state. RESUME_ENABLED=true ולכן נטען -k.

     למה -k ולא -j: ב-j כל כשל של state חזר כביט אחד — loadState720 החזיר null
     גם ל-404 ("עוד אין מצב", המקרה הרגיל בקריאה הראשונה), גם ל-401 (טוקן פגום)
     וגם ל-500 או ל-200 ריק; saveState720 החזיר false גם ל-412, גם ל-413 (מסמך
     מעל ~1MB) וגם לכשל רשת/CORS. כלומר הרצה שנכשלת מול הפלטפורמה לא הייתה
     ניתנת לפירוש — וזו בדיוק ההרצה שלמנגנון הזה עוד לא הייתה.
     ‎-k מוסיף stateLastResult720() עם {op,status,ok,reason} ומחזיק את חוזי
     ההחזרה בדיוק כפי שהיו, ולכן הוא תואם-לאחור מול -j.
     ‎-j נשאר ללא שינוי ב-CDN, כך שהיחידות האחרות שטוענות אותו אינן מושפעות.

     ב-localhost בלבד, ?xapiLib=<נתיב same-origin> יכול לעקוף לבדיקת בילד מקומי
     — כך נבדק ה-resume מול _test/xapi-720-k.js בלי LRS אמיתי.

     ⚠️ שם הקובץ של ה-stub חייב להסתיים באות ספרייה שה-regex למטה מכיר
     (xapi-720-k.js): ה-regex הוא מה שקובע את XAPI_USING_G, ושם שלא תואם משתיק
     את כל ה-statements ברמת הפריט בלי שום שגיאה.

     ⚠️ window.XAPI_USING_G אומר לסינים אם statements ברמת פריט זמינים בכלל.
     ה-regex חייב למנות כל אות ספרייה שתומכת בהם — **אות חדשה שלא תתווסף כאן
     משתיקה את xapiOnScreen ואת דיווח הווידאו בלי שום שגיאה.** לכן שינוי
     ה-LIB720 ושינוי ה-regex חייבים לקרות באותו commit; זה הכשל השקט של המעבר
     בין אותיות. */
  var LIB720 = CDN + (RESUME_ENABLED ? 'xapi-720-k.js' : 'xapi-720-i.js');
  try {
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      var _ovr = new URLSearchParams(location.search).get('xapiLib');
      if (_ovr && /^(\.\.?\/|\/)[^:]*$/.test(_ovr)) LIB720 = _ovr;   // same-origin יחסי בלבד
    }
  } catch (e) {}
  window.XAPI_USING_G = /xapi-720-[ghijk]\.js/.test(LIB720);

  loadScript(CDN + 'xapiwrapper.min.js', function () {
    loadScript(LIB720, function () {
      try {
        getXAPIParameters(XAPI_METADATA_FILE);

        /* ═══ שלב א' של ה-resume — קריאת המסמך, הקפיצה בין סינים, והדמות ═══
           ── למה כאן, לפני ה-poll ──
           הכיסוי (#boot-cover) מסתיר את מסך 0 עד שידוע מה לצייר, ולכן אורך
           החיים שלו הוא זמן ההמתנה של הלומד. השלב הזה יושב לפני
           pollMetadataReady במכוון: ה-poll חסום ב-10 שניות (50 × 200ms), ולומד
           שממתין 10 שניות מול כיסוי הוא רגרסיה גרועה יותר מההבהוב שהכיסוי בא
           לתקן.

           מותר להקדים כי getXAPIParameters קובע את window.slxapi, את
           XAPI_REGISTRATION ואת XAPI_DISABLED **סינכרונית** לפני שהוא ניגש
           למטא-דאטה (xapi-720-k.js:274–353), ו-loadState720 עובד ב-XHR גולמי
           עם window.slxapi.auth — לא דרך ADL.XAPIWrapper, ולכן הוא גם לא תלוי
           ב-changeConfig שלמטה. אין כאן שום תלות בקובץ המטא-דאטה.

           ⚠️ מה שכן **לא** הוקדם: _resumeReady. הוא נשאר בשלב ב'. הדלקה שלו
           כאן הייתה פותחת חלון שבו כל goTo() מחמש שמירה שדורסת את
           doc.payload ב-payload טרי — כלומר כתיבה לפני השחזור, בדיוק מה
           שכל נתיבי הכתיבה בנויים למנוע. שלב א' לכן **קורא בלבד**:
           adoptUnitCharacter מיישר את הזיכרון ואת הקאש; מה שהוא מעתיק
           למסמך (הדמות מהקאש) ממתין בתור ונשמר בשלב ב'. */
        var _saved   = null;
        var _payload = null;
        if (RESUME_ENABLED) {
          try {
            _saved = readUnitState();
            /* המסמך הוא של הסין הזה בלבד (v5, 2026-09-16): registration של Kata
               הוא לרכיב, הפלטפורמה משגרת כל רכיב בנפרד, ואין יותר מצביע נחיתה
               או קפיצה לסין שמור. ראו 40-resume.js (הכותרת) ו-REPORT-XAPI.md §10. */
            /* הדמות — ארבעת הצעדים של adoptUnitCharacter: המסמך של הסין הזה,
               ואם אין בו — הקאש מסין 01 (מועתק למסמך ונשמר בשלב ב'), ואם אין —
               ברירת המחדל. נקרא ללא תנאי ולא רק כשיש payload: לומד שנכנס לסין
               בפעם הראשונה לא נכנס ל-applyExecutionState בכלל, והיה מפספס
               את היישור. */
            if (adoptUnitCharacter(_saved)) {
              /* מסך 0 כבר צויר בבלוק האתחול של script.js עם הצבע הקודם.
                 ציור מחדש כאן, מאחורי הכיסוי, לפני שהוא מוסר. */
              try { resetScreenState(currentScreen); } catch (e) {}
            }
            _payload = _saved.payload;

            /* ── אין payload → אין שחזור מסך → אין סיבה להחזיק את הכיסוי ──
               זה מה שמנטרל את ההתנגדות שעל בסיסה נדחה "וילון ה-boot"
               ב-2026-08-19 (RESUME.md §6ד): "מחייב ~1 שנייה של קנבס ריק בכל
               טעינה **ללא** התקדמות שמורה — כלומר גם לכל לומד בפעם הראשונה."
               לומד חדש מקבל מסמך ריק, ולכן payload ריק, ולכן הכיסוי נופל כאן —
               ברגע המוקדם ביותר האפשרי, בלי להמתין ל-pollMetadataReady.
               התיקון של הדמות (אם היה) כבר צויר סינכרונית שורה מעל.
               dropBootCover מכבה גם את __resumeInFlight שהודלק בראש
               bootXAPI, ולכן רשת הביטחון חוזרת להתנהגות ה-800ms הרגילה.
               ויש payload → הדגל נשאר דלוק, והכיסוי מוחזק עד שלב ב'. */
            if (!_payload) dropBootCover();
          } catch (e) {
            console.error('[resume] read', e);
            dropBootCover();
          }
        } else {
          /* resume כבוי — אין מה לשחזר ואף פעם לא יהיה. */
          dropBootCover();
        }

        pollMetadataReady(function () {
          try {
            try { ADL.XAPIWrapper.changeConfig({ endpoint: window.slxapi.endpoint, auth: window.slxapi.auth }); } catch (e) {}

            /* ── שער האימות של המזהים ──
               XAPI_ID_PREFIX הוא הערך היחיד בשכבה המשותפת שנקבע בהשערה
               (ראו 10-identity.js). כאן הוא נבדק מול מקור האמת בכל טעינה של
               כל סין: window.METADATA.id הוא ה-id של הרכיב הזה כפי שהוא
               כתוב ב-metadata/, ו-XAPI_COMP_ID הוא מה שהקוד ישלח בפועל.
               אי-התאמה כאן — כולל הבדל של trailing slash אחד או של אות
               רישית אחת — פירושה שכל statement שהרכיב ישלח מצביע על object
               שלא קיים בקטלוג. זה כשל שקט לחלוטין בלי הבדיקה הזאת: הספרייה
               תשלח בשמחה מזהה שגוי ו-Kata תקבל אותו.
               אזהרה, לא זריקה: דיווח שגוי עדיף על לומדה שנופלת. */
            try {
              var _metaId = window.METADATA && window.METADATA.id;
              if (_metaId && typeof XAPI_COMP_ID !== 'undefined' && _metaId !== XAPI_COMP_ID) {
                console.error('[xAPI] ID MISMATCH — הקוד ישלח מזהה שלא קיים בקטלוג.\n' +
                  '  metadata/ אומר: ' + _metaId + '\n' +
                  '  הקוד שולח:      ' + XAPI_COMP_ID + '\n' +
                  '  תקנו את XAPI_ID_PREFIX ב-unit-js/10-identity.js או את XAPI_COMP_SLUG בסין הזה.');
              }
            } catch (e) {}

            /* ── שחזור ה-resume ──
               יושב כאן במכוון: **אחרי** changeConfig (כי הקריאה מ-Kata צריכה
               endpoint+auth) ו**לפני** ה-initialized של הרכיב. הסדר הזה הוא מה
               שמונע מסשן שרק *עובר* דרך הסין הזה להשאיר אחריו statement —
               ה-return המקדים קופץ לפני שנשלח משהו.

               כל הכתיבות חסומות עד ש-_resumeReady נדלק, ולכן הוא נדלק גם
               ב-catch: קריאה שנכשלה לא אמורה לבטל את השמירה להמשך, ובטח לא
               להשתיק את הדיווחיות. */
            var _resumed = false;
            if (RESUME_ENABLED) {
              try {
                /* ═══ שלב ב' — פתיחת הכתיבות והשחזור עצמו ═══
                   קריאת המסמך והקפיצה בין הסינים כבר קרו בשלב א' שלמעלה.
                   מה שנשאר כאן הוא בדיוק מה שחייב לרוץ אחרי שהמטא-דאטה
                   מוכנה: השחזור, שבסופו applyExecutionState שולח את
                   ה-initialized של הפריט דרך xapiOnScreen.

                   המקום נשמר כפי שהיה — **אחרי** changeConfig ו**לפני**
                   ה-initialized של הרכיב — כי זה מה שמונע מסשן שרק *עובר*
                   דרך הסין הזה להשאיר אחריו statement.

                   _resumeReady נדלק רק כאן, ולא בשלב א': הוא השער של כל
                   נתיבי הכתיבה, וכתיבה שנפתחת לפני השחזור דורסת את
                   doc.payload ב-payload טרי. */
                _resumeReady = true;
                if (!_unitState) _unitState = emptyUnitState();
                /* בחירה שנעשתה בחלון שבין השלבים ממתינה בתור. מנוקזת **לפני**
                   השחזור, כי היא חדשה יותר ממה שכתוב במסמך ולכן מנצחת אותו. */
                drainPendingUnitState();
                /* ה-hash מנצח את המסמך בבחירת **המסך** — '#screen=N' מגיע
                   מלחיצה על "חזרה", כלומר מכוונה מפורשת של הלומד עכשיו, בעוד
                   המסמך מתאר איפה הוא היה פעם.

                   ⚠️ אבל הוא לא מנצח בשחזור **המצב**. עד 2026-08-18 התנאי כאן
                   דילג על applyExecutionState כולו כשהיה hash, ולכן הגעה דרך
                   "חזרה" בין-סינית איבדה את כל השחזור — כולל XAPI_Q_RESULTS
                   ו-stationProgress, שמהם נגזר הניתוב קדימה (getPracticeScore),
                   כך שלומד שעמד בסף נשלח לתרגול המחזק. עכשיו תמיד משחזרים
                   ומעבירים את המסך כ-override.

                   parseInt ולא ה-capture הגולמי: applyExecutionState בודק
                   `typeof === 'number'`, ומחרוזת הייתה נופלת ל-fallback
                   ומורידה את הלומד מהמסך ש-jumpToLinkedScreen הביא אליו —
                   בדיוק הבאג שההערה הזאת נכתבה כדי למנוע. */
                var _hm = /^#screen=(\d+)$/.exec(window.location.hash);
                if (_payload) {
                  applyExecutionState(_payload, _hm ? parseInt(_hm[1], 10) : undefined);
                  _resumed = true;
                }
              } catch (e) {
                console.error('[resume] init', e);
                _resumeReady = true;
                if (!_unitState) _unitState = emptyUnitState();
              }
            }

            /* הנתיב הרגיל להסרת הכיסוי: כאן כבר ידוע מה מצייר — הדמות יושרה
               בשלב א' ומסך היעד צויר בשלב ב'. נקרא גם כשה-resume כבוי וגם
               כשאין payload, ולכן הוא לא בתוך שום ענף.
               רשת הביטחון (סקריפט inline ב-markup, 800ms) עומדת מעל זה
               ומכסה כל נתיב שלא עובר כאן בכלל. */
            dropBootCover();

            try { sendStatement720('initialized', 'onlinelesson'); } catch (e) {}
            try { xapiWireVideos(); } catch (e) {}
            /* init ברמת הפריט עבור מסך הנחיתה. בלומדה הזאת מסך הפתיחה לא
               עובר דרך goTo() בכלל — ה-.active מקובע ב-HTML ובלוק האתחול
               קורא ל-resetScreenState(0) ישירות — ולכן זו הקריאה היחידה
               שפותחת את הפריט של המסך הראשון.
               ב-resume, applyExecutionState כבר שלח אותו בעצמו. */
            if (!_resumed) { try { xapiOnScreen(currentScreen); } catch (e) {} }
            if (typeof onXapiReady === 'function') {
              try { onXapiReady(); } catch (e) { console.error('[xAPI] ready hook', e); }
            }
          } catch (e) { console.error('[xAPI] init', e); dropBootCover(); }
        });
      } catch (e) { console.error('[xAPI] load', e); dropBootCover(); }
    });
  });
}
