MacroLog verification — 25 October 2026

Completed checks

- 33 core tests passed using Node's built-in test runner.
- 17 end-to-end browser flows passed in Chromium.
- Browser coverage included a 390-pixel mobile viewport and a 720-pixel viewport.
- No page JavaScript errors were recorded during the browser suite.
- Both HTML entry points contain the same updated interface and share the same JavaScript.

Passing browser flows

1. save a named manual food without logging calories
2. two label-photo scans retain separate names and source badges
3. mocked barcode lookup saves a reusable item and scales fractional servings once
4. editing a saved food leaves its diary snapshot unchanged
5. dated diary correction scales grams and marks a completed day incomplete
6. weight setup confirms stone/pounds and does not overwrite goals unless selected
7. record, update and backdate weigh-ins without duplicate dates
8. overall graph preserves the chosen starting point and exposes chart details
9. backup excludes the API key and restoring it replaces data correctly
10. both HTML entry points open the same app and retain data
11. offline shell reload, saved food search and weight views work without external services
12. all retained historical foods migrate and older foods remain searchable after deletion/reload
13. calorie review UI: slow gain
14. calorie review UI: fast gain
15. calorie review UI: on-target gain
16. calorie review UI: incomplete intake mismatch
17. failed persistence displays an error and retains the preceding saved state

Core coverage includes date/DST behaviour, stone/pound/kilogram conversions, reusable food identity, history snapshots, recovery of retained legacy foods, migration idempotency, quota failures, weigh-in updates, trend windows, unknown historical targets, calorie review gating, actual intake adherence, review cooldowns, one-time target application, carbohydrate calculations and backup validation.

Scope of verification

Barcode-photo decoding and Open Food Facts responses were simulated with fixtures. Gemini label responses were mocked with a dummy key. This verifies application workflows and data handling; it does not verify a physical camera, real-world barcode accuracy, live OCR quality, API account access or provider quotas.

Screenshots were used for internal visual inspection. No screenshots, test browser installations, real API keys or preloaded test records are included in the app package.

Re-run instructions are in README.md. The test source is in tests/.
