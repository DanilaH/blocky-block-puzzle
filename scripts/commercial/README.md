# Blocky comparison: local tools and export contract

No original owner recordings belong in public Git. `verify-recorded.mjs`
accepts two private paths. `PROTOCOL.md` under the D87 QA directory freezes the
one-candidate algorithm and engineering cohort before its comparison.

## Verification

```bash
npm ci
npm test
npm run build
npx playwright test e2e/commercial.spec.ts e2e/ads.spec.ts e2e/analytics.spec.ts --workers=1
python3 scripts/commercial/test_metrics.py
python3 scripts/commercial/test-native-revenue.py
node scripts/commercial/verify-recorded.mjs /private/flow.json /private/v2.json
node scripts/commercial/verify-candidate.mjs
BLOCKY_MINUTES=10 node scripts/commercial/soak.mjs
```

The long-session probe uses synthetic clears/drag/pause/restart in one loaded
v2 game application. It includes 3×3 selector timing and saved-state/renderer
phases, but its fixture moves are not a full-board 402-move human replay and
do not exercise a real ad SDK. The separate candidate cohort measures actual
refills. Do not label either result as Android performance. Preserve early
and late minute windows, settled resource counts and GC heap samples.

## Canonical money

Cabinet access and an actual export were unavailable. This implementation uses
the native ILRD → AppMetrica AdRevenue route because exact placement/offer/
intent correlation is required. Its payload has `source=blocky_ilrd_v1`, a new
`impressionEventId` per impression, and frozen fullscreen context. For banner,
each SDK refresh callback is a separate impression with current game context.
No JS queue forwards or retries money. Fullscreen duplicate callbacks are
guarded once per show; cross-crash SDK exactly-once is not claimed.

The calculation selects **only** AdRevenue-export rows with this payload source.
`bp_ad_impression` is coverage/funnel diagnostics, never additional money.
Automatic Yandex/AppMetrica rows without the marker are excluded. Check actual
automatic-collection/dashboard configuration before interpreting aggregate
dashboard AdRevenue totals; they are not this calculation's source of truth.

Native parsing preserves original revenue/currency/precision strings and a
decimal USD amount (`revenueUSD`, or original revenue if already USD). No FX
guessing. Missing USD/invalid payload is unavailable, not zero; valid zero is
retained. `estimated`/`publisher_defined` are SDK estimates, not payouts.
The exact decimal is in the SDK AdRevenue payload `canonicalAmount`; the
normalizer also retains the CSV amount for reconciliation with SDK formatting.

### AppMetrica Logs API inputs

Export from the intended application, over a period covering assignments and
their observation windows, with these columns:

- Events CSV: `installation_id,event_timestamp,event_name,event_json`.
- AdRevenue CSV: `installation_id,ad_revenue_timestamp,ad_revenue,
  ad_revenue_currency,ad_revenue_precision,ad_revenue_payload`.

Actual availability of these events, shared installation IDs, and receipt of
the native payload remains a cabinet acceptance step. Keep the report cutoff
explicit and allow for export/delivery lag. No API key or OAuth token belongs
in this repository or command arguments.

```bash
python3 scripts/commercial/normalize_appmetrica.py events.csv ad-revenue.csv \
  2026-12-01T00:00:00Z normalized.json
python3 scripts/commercial/metrics.py normalized.json /absolute/path/result
```

The normalized schema is demonstrated by `example-export.json`:
`assignments`, `events`, `impressions`, `revenue`, with timestamps in UTC epoch
seconds or explicit-offset ISO strings. Assignment `assigned_at` is the saved
client assignment time; native `assignedAt` milliseconds are normalized.
Event params keep `offerId`, `intentId`, `milestone`, additional moves/time and
all interstitial blockers. The AppMetrica `installation_id` is the join key;
the local installation UUID is not substituted for it.

Money rows contain `impression_id,source,currency,amount,precision`. All amount
values are decimal strings. Conflicting duplicates fail rather than silently
choose an amount; identical transport retries deduplicate by stable ID.
Automatic/diagnostic copies, test records and manual playtest records are not
audience revenue. Existing manual test profiles are not automatically enrolled.

### Output and interpretation

`summary.json`, `players.csv`, `report.md`, `r7.svg`; Matplotlib is required
only for chart rendering (tested 3.10.8), the calculator/tests use stdlib.

- R7: `[assignment_at, assignment_at+7×24h)`, all assigned **mature** players,
  including players with no impressions and zero income. Immature windows are
  counted separately and never become fake zero R7 observations.
- Known income remains in the full player denominator even if some impression
  amounts are missing; that result is marked incomplete. Coverage concerns
  observed diagnostic impressions and cannot detect every missing callback.
- New and existing cohorts remain separate. D1 `[24h,48h)`, D7 `[168h,192h)`
  have their own mature denominators, based on `session_started/app_foreground`.
- Uncertainty resamples players, not impressions. Fewer than two players in
  either arm has no estimable within-arm bootstrap interval. No audience size
  is invented, no automatic winner is declared, R7 is not LTV/profit.
- Revive funnel counts unique offers/intents. Quality reports first move,
  old tray, next tray and failed-again milestones plus additional moves/time.
  Interstitial reports count every recorded blocker, including simultaneous
  blockers; not-ready is not no-fill.

`example-export.json` and committed example reports are **synthetic fixtures**,
not actual audience, revenue, retention or payout evidence.

## Test APK

```bash
python3 scripts/commercial/build-preview.py --check
python3 scripts/commercial/build-preview.py --output /absolute/path/blocky-0.64-preview.apk
```

Requires Android SDK 36/build-tools 36.0.0, JDK21 and the original preview signing
key. Analytics is off by default: no AppMetrica key/account is needed for a
gameplay playtest. The existing application startup skips SDK activation with
the empty key. Local gameplay/capture diagnostics remain available.
Debug uses Yandex demo units only.

To test analytics later, pass `--analytics test` (or
`BLOCKY_PREVIEW_ANALYTICS=test` for direct Gradle builds) and supply a separate
`APPMETRICA_TEST_API_KEY`. Packaging then rejects a missing/invalid key or a key
equal to the available production key. Format checks do not prove account
ownership: verify the test project in the cabinet. Existing CI Android job
restores the preview signing-key cache. No substitute signing key or production
analytics fallback is supplied.

## Primary API references checked

- [Yandex ILRD](https://ads.yandex.com/helpcenter/en/dev/android/impression-level).
- [Pinned AppMetrica 8.6.0 AdRevenue API](https://github.com/appmetrica/appmetrica-sdk-android/blob/v8.6.0/analytics/src/main/java/io/appmetrica/analytics/AdRevenue.java).
- [AdRevenue Logs API](https://appmetrica.yandex.com/docs/en/mobile-api/logs/ref/ad_revenue_events).
