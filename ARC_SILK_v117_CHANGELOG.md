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
