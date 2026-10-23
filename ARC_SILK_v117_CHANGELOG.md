# ARC_SILK v117 — Seller Discovery Fix

## Included fixes
- Corrected the Supabase discovery price mapping: `marketplace_listings.price` is stored in major currency units, and the UI's `money()` formatter displays that numeric value directly. Multiplying it by 100 made public listing prices display 100× too high.
- Updated the seller profile privilege guard so a user may make their profile private at any time, while public visibility requires seller status and at least five submitted listings.
- Preserved the existing blue 4D authentication interface and fail-safe messaging for API-only actions.

## Validation
- All 14 inline JavaScript blocks passed `node --check`.
- No duplicate HTML IDs detected.
- Confirmed the legacy `localhost:8000` fallback is absent.
- Confirmed the incorrect 100× price mapping is absent.
- Supabase security advisor returned no findings after the database migration.

## Remaining production gates
- Run browser-based sign-up, sign-in, confirmation, recovery, and sign-out tests.
- Configure and validate the marketplace API for orders, messages, seller listing management, payments, refunds, and disputes.
- Configure a Vercel project linked to the canonical repository and deploy only after a production review.
- Test with non-admin and admin accounts; verify public profile visibility and five-submitted-listing enforcement.

The full updated HTML artifact is provided separately as `ARC_SILK_v117_Seller_Discovery_Fix.html`. The launch-page prototype remains unchanged.


## v118 — Seller Studio listing workflow
- Added a Seller Studio navigation entry and responsive creator workspace to the v117 HTML branch.
- Added Supabase-authenticated listing create, read, update, draft, and submit actions against `public.marketplace_listings`; rows are scoped to the signed-in seller ID.
- Added listing counters and a five-submitted-listing activation gate. The database trigger remains the enforcement layer for seller/public-profile activation.
- Added input validation for title/category lengths, positive price, allowed currency via database constraints, HTTPS preview URLs, and preview durations of 1–30 seconds.
- Submitted listings are described as awaiting review; the UI does not grant itself active marketplace status.

## v118 validation status
- Retrieved the committed branch file from GitHub and confirmed Seller Studio markup and Supabase listing CRUD code are present.
- Parsed all 16 inline script bodies with JavaScript's function parser; 0 syntax error(s) found.
- Supabase security advisor currently reports no findings.
- Browser-based authenticated CRUD and five-listing activation still require live user-session tests; no test accounts or fake listings were created.


## v118 — Seller Studio hardening
- Added the Seller Studio listing interface with Supabase-backed create/read/update, draft and submit operations, listing counters, input validation, and a 30-second preview-duration cap.
- Routed seller activation through the authenticated `activate-seller` Edge Function instead of directly changing privileged profile flags from the browser.
- Routed public-profile visibility through the authenticated `set-profile-visibility` Edge Function. If seller activation succeeds but visibility fails, the UI allows retrying visibility without attempting to reactivate the seller.
- Confirmed database constraints enforce title/category lengths, allowed currencies and listing types, positive prices, valid statuses, and 1–30 second preview duration.

## v118 validation
- Retrieved the latest HTML from the development branch after commit and confirmed both Edge Function calls are wired in.
- Parsed all 16 inline JavaScript blocks successfully; no syntax errors found.
- Supabase security advisor returned no findings.
- Authenticated browser tests remain outstanding; no test accounts or fake listings were created.
