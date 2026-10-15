'use strict';
/* ═══════════════════ xAPI (720) — identity ═══════════════════
   Shared by the seven parts of methodica-science-volume-liquid-01. Loaded first of the reporting
   layer. Source: methodica-science-mass-weight-01/unit-js/10-identity.js (itself from
   methodica-science-mass-measure-03), values replaced for this unit.
   Procedure: 2026/Documentation/reporting-and-resume/ADDING-REPORTING-AND-RESUME.md.

   Every id the lomda reports is built from these values and must match metadata/*.json byte for
   byte — including the trailing slash, which this unit's catalogue carries on component and item
   ids (not on questions, and not on the unit id, which is a bare slug — see below). Verified
   against metadata/ on 2026-09-28; 50-loader.js compares XAPI_COMP_ID with window.METADATA.id on
   every load and shouts on a mismatch.

   The IRI path is /science/volume-liquid/01/. The metadata was first authored as "mass-liquid"
   and renamed before this unit was ever registered in Kata (6032a61) — "mass-liquid" must not
   reappear in any id.

   Lowercase everywhere (ids, folder names, storage keys): Kata derives a uniqueKey from the last
   id segment, and currentPartSlug() derives the state key from location.pathname — a capital
   letter would split one learner's progress across two documents. */
var XAPI_ID_PREFIX = 'https://lomdot.education.gov.il/metodica/720active/science/volume-liquid/01/';

/* The unit id — a bare SLUG, not an IRI, equal to metadata/methodica-science-volume-liquid-01_unit.json
   `id` and to `learningUnitId` in every component JSON. MOE v2.5 §2.7 dropped the IRI requirement
   for the content unit only; components and items remain IRIs (hence XAPI_ID_PREFIX above).
   ⚠️ Never replace it with the prefix alone: Kata would take "01" as the uniqueKey and collide with
   every unit 01 of every subject. The issue-report form also posts shortId(learningUnitId) as the
   unit column of the sheet all 720 units share. */
window.XAPI_UNIT_ID = 'methodica-science-volume-liquid-01';

/* The last segment of a canonical id — the short slug the issue-report form records. */
function shortId(u) { return String(u || '').replace(/\/+$/, '').split('/').pop(); }

/* Resume (Kata xAPI State API) — ON since plan Phase 6 (2026-09-28): one state document per component,
   the four hooks in every part's js/main.js, the boot cover in every index.html. A part whose
   hooks are missing is switched back off by 90-boot.js rather than failing on every save.
   ⚠️ This flag also changes reporting, not only restoring: true makes 50-loader.js load
   xapi-720-k.js (the build with the State layer) instead of xapi-720-i.js. Once it is on, do not
   switch it off to debug a restore — use ?resetState. */
var RESUME_ENABLED = true;

/* ── Navigation between parts: off in production, open only for a local walkthrough ──
   The platform (Kata) decides which component comes next: it launches each component on its own,
   with its own ?registration, reads our 'completed' and routes by the catalogue (for this unit:
   part 02's result, and part 03's recommendedAfterFail). Any in-unit hop would carry
   window.location.search along — i.e. report the next component under the previous component's
   registration. So every cross-part navigation (the last screen's forward button, part 02's score
   branch to 03/04, and the first screen's "חזרה") runs only when DEV_NAV is true, which requires
   BOTH:
     1. ?dev=1 in the URL — index_dev.html sets it on the page it frames;
     2. NO ?registration — every Kata launch carries one, so a URL that has it is a real learner
        session, and ?dev=1 does not open navigation there.
   The component 'completed' is never gated on this flag: it is sent by the last click on the last
   screen, and the button is disabled after it. */
var DEV_NAV = false;
try {
  var _devQ = new URLSearchParams(location.search);
  DEV_NAV = _devQ.get('dev') === '1' && !_devQ.has('registration');
} catch (e) {}
