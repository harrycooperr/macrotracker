MacroLog 2

This update keeps MacroLog's dark theme and existing barcode, label-photo, manual-entry and daily nutrition features. It adds named reusable foods, a searchable food library, dated diaries, weight tracking, two weight graph views, weekly calorie guidance and JSON backup/restore.

Run the app

1. Extract the complete macrotracker-main folder. Keep index.html, MacroLog-Pro.html, core.js, app.js, styles.css, upgrade.css and sw.js together.
2. Upload all those files to your existing static website, keeping the same website address and browser profile if you want the app to read your existing on-device data.
3. For a local preview, open a terminal inside this folder and run:

   Windows:
   py -m http.server 8000

   macOS/Linux:
   python3 -m http.server 8000

4. Open http://localhost:8000. Camera access requires HTTPS or localhost and browser permission. The app does not require an account, build step, backend or database server.

Both HTML filenames now load the same updated interface and shared JavaScript. On a normal website they share the same browser data. Browser handling of file:// storage differs between browsers; using a stable HTTP/HTTPS address is recommended. Changing addresses, ports, browser profiles or devices does not automatically transfer local data.

Using foods

- Scan a barcode, photograph a nutrition label or choose Add food manually.
- Enter a recognisable food name and verify nutrition. Set an optional serving weight/name.
- Save food stores a reusable definition without logging calories. Save and add logs the selected portion as well.
- Existing saved foods accept grams or fractional servings.
- Recent foods > View all opens the complete searchable library. Search covers every retained item, even when the list is loading in batches.
- Edit a saved food using Save food. Previous diary entries retain their own nutrition snapshots.
- Use the diary date selector to correct past entries. Any diary edit marks that day incomplete until you confirm it again.

Using weight tracking

1. Open Weight > Setup. Choose an actual starting date, confirm the starting weight and choose your monthly gain range.
2. The suggested starting reading is 10 st 8 lb = 148 lb = 67.13167076 kg. It is not recorded until you confirm a date and save.
3. The optional nutrition checkbox offers 2,640 kcal, 148 g protein, 75 g fat and 343.25 g carbohydrate. It keeps the existing sugar target and does not change saved targets unless selected.
4. Record your weight daily. Existing dates offer Update recorded weight. You can backfill, change a record's date, edit readings or delete them.
5. Daily tracking offers 7/30/90-day and All-time charts. Overall progress retains your chosen starting measurement through today's date.
6. Orange points are actual readings. The teal trend is a seven-calendar-day mean when at least four readings exist in that window. Missing dates are not zero weights or fabricated readings. A line connects observations for readability.
7. Display units can change without changing the underlying kilogram measurements. A gain/loss amount is shown in pounds when the display preference is stone plus pounds.

How calorie guidance works

The app compares actual complete food logs with the chosen calorie target and compares observed weight change with the desired monthly gain range.

After recording all food and drinks for a date, check Finished logging this day. A partially logged day is not assumed to be zero intake. Older diary dates without stored targets remain unknown; the app does not pretend today's target applied in the past.

The review rules are deliberately transparent, configurable where indicated, and are not a reproduction of MacroFactor's expenditure algorithm or an exact prescription from Jeff Nippard.

- Two adjacent seven-calendar-day windows.
- At least four weigh-in dates and five complete food-log dates in each window.
- At least 14 calendar days of observations under a known calorie target.
- A minimum 14-day wait after a calorie-target change.
- Complete-day average intake within the configured tolerance of the target in each week; default 5%.
- Weight-window mean dates are used when calculating a weekly rate, so irregular weighing dates are handled.
- Monthly percentage targets are converted using 7/30.44.
- A 100-kcal adjustment is proposed only after two consecutive eligible weekly reviews agree, and the current trend still supports that direction.
- Below the chosen gain range: consider adding 100 kcal/day.
- Above the range: consider removing 100 kcal/day.
- Within range: keep the target.
- Missing or inconsistent data: explain what is missing and keep the target.

Expect roughly three weeks or more of sufficiently complete, consistent records before the first adjustment proposal. This depends on the target's effective date and data coverage. Daily graph/trend updates are separate from weekly review periods.

Apply suggested target updates the actual Nutrition/Goals target once and records the change. Keep current target dismisses that week's proposal. Manual changes remain available in Goals. A target change starts a new observation period.

Protein and fat remain unchanged on a calorie adjustment. Carbohydrates use:
carbs_g = (calories - 4 * protein_g - 9 * fat_g) / 4

Sugar is part of total carbohydrate, not additional calories. A target that leaves negative carbohydrates is rejected. Internally precise values can produce a one-calorie difference when displayed macros are rounded.

Guidance is an estimate from logs. Scale-weight change is not identified as confirmed muscle gain.

Data, migration and backups

The canonical versioned state is stored under macrolog:v2 in browser localStorage. Legacy goals, recents and dated log keys are read once when no versioned state exists. The original legacy keys are retained, not erased.

Migration recovers valid foods from every retained dated diary and the old recent list. It cannot recover data that was previously discarded and no longer exists. It preserves distinct nutrition definitions with the same generic name. Deleting a saved food does not delete old diary entries or cause it to reappear on reload.

Current targets and future target changes get effective dates. Historical dates before target recording began remain unknown. Applied review/target history is retained.

Settings provides JSON backup and validated restore. A restore replaces current app data after an explicit confirmation. Export a backup first if needed. The Gemini key is separate and is excluded from backups. Storage failures are shown and do not report successful saving.

Browser storage is finite and device-specific. This app does not provide cloud sync. Saved foods, graphs and diaries work without external services. After a successful online visit over HTTPS/localhost, the service worker also caches the local app shell for offline reopening. It only caches app files, not API calls or personal data. App assets are refreshed from the network when available and fall back to the cache offline.

Scanning requirements and limits

- First-time barcode lookup needs an internet connection to Open Food Facts. Known saved barcode items reuse their saved definitions.
- Barcode decoding uses the browser's BarcodeDetector when available, with an on-demand ZXing 0.21.3 fallback. A first decoder load needs a connection if the native API is unavailable.
- Label photos need your existing Gemini key and an internet connection. The app retains the existing gemini-2.5-flash endpoint and handles temporary busy/rate-limit responses.
- Verify scan results before saving. Amounts in this version use grams. A label that only provides volume without a valid gram conversion needs verified manual per-100-g data.
- Live camera hardware, real product recognition and a real Gemini account were not available for validation. Automated scan workflows used fixtures/mocks; they must not be described as live camera/OCR tests.

Verification

See TEST_RESULTS.md for the completed checks. No test data or API keys are preloaded into the shipped app.

Core checks require Node.js 18+:
node --test tests/core.test.js

Browser checks require Playwright and an installed Chromium browser:
node tests/browser.test.js

The browser suite creates an isolated local server and temporary browser contexts. External scans are mocked. You can set MACROLOG_CHROME_BIN to a Chromium executable and MACROLOG_QA_DIR to an output folder. Screenshots and test outputs are generated there; they are not needed to run the app.

