# ARC_SILK seller journey test plan

Status: authenticated browser execution is pending. Run in a non-production test environment with two controlled test accounts. Do not use real customer data or create fake listings in production.

## Preconditions
- A staging Supabase project with the current schema, RLS policies, and Edge Functions deployed.
- Two email addresses controlled by the project owner; one account for seller A and one for seller B.
- Browser devtools available to inspect network responses and console errors.
- No service-role key in browser storage, HTML, client logs, or network responses.
- Staging credentials must be supplied through the approved test environment only; never commit them to GitHub or embed them in the HTML.
- If staging requires a paid Supabase branch/project, obtain cost approval before provisioning it.

## Automated checks
- `scripts/check-arc-silk-html.mjs` validates inline JavaScript syntax and key UI/backend contracts.
- `scripts/smoke-edge-functions.mjs` sends unauthenticated POST requests to all three deployed Edge Functions and expects HTTP 401. It creates no accounts and writes no data.
- These checks are not substitutes for authenticated browser tests. The smoke test only confirms the unauthenticated boundary; it does not prove successful sign-in or a complete customer journey.

## Authenticated test cases

| ID | Action | Expected result |
|---|---|---|
| AUTH-01 | Open the site signed out and open Seller Studio | Seller Studio requests sign-in; no listing data is exposed. |
| AUTH-02 | Register a controlled test account, confirm email, sign in, refresh, recover password, and sign out | Each auth state transition succeeds; signed-out routes remain protected. |
| AUTH-03 | Sign out, then replay a previously captured listing-write request without the access token | Request is rejected; no row is created or changed. |
| LIST-01 | Sign in as seller A and save a valid draft | One draft is saved with seller_id equal to seller A's auth user ID. |
| LIST-02 | Submit the draft | Status becomes submitted; submitted counter increases by one. |
| LIST-03 | Attempt a preview duration of 31 seconds | Client validation blocks the save; a direct API attempt must not bypass database constraints. |
| LIST-04 | Attempt to insert a listing with seller B's ID | RLS rejects the write. |
| LIST-05 | Attempt to update seller B's listing by ID | No row is changed; access is denied or no matching row is returned. |
| LIST-06 | As seller A, attempt a direct insert with status active or archived | RLS rejects the insert; direct API calls cannot skip the draft/submitted workflow. |
| LIST-07 | As seller A, attempt to change a submitted listing directly to active through table UPDATE | The client-side path cannot bypass the server publication function; database permissions/policies must reject the transition. |
| LIST-08 | Save invalid listing title/category, unsupported currency/type, zero/negative price, or description over 5,000 characters via direct API | Database constraints reject invalid data; no invalid row persists. |
| ACT-01 | With fewer than five submitted listings, invoke seller activation | Request is rejected with HTTP 422 and the remaining count; profile remains non-seller. |
| ACT-02 | Submit five listings and invoke seller activation | Function returns success and profile seller status is true. |
| ACT-03 | As seller A, attempt to set is_seller=true directly through profile UPDATE before meeting the threshold | Trigger rejects the privilege escalation; profile remains non-seller. |
| VIS-01 | Try to make a profile public with missing/invalid username or display name | Function rejects the request; profile remains private. |
| VIS-02 | Try to make a non-seller profile public | Database guard rejects it; profile remains private. |
| VIS-03 | Make an eligible seller profile public | Function confirms is_public true; only active listings appear in public discovery. |
| SONG-01 | Submit a customer song/listing with a valid preview link | No staff listening or manual song approval is required before publication can proceed. |
| SONG-02 | Publish an eligible submitted listing | Listing becomes active without staff listening review. |
| SONG-03 | Attempt publication by another seller, on a draft, or with invalid preview metadata | Request is rejected; no unauthorized listing changes. |
| SONG-04 | Publish a valid listing, then retry the same publish request | Retry succeeds idempotently or reports already active; no duplicate listing is created. |
| PRIV-01 | Set seller A's profile private | Profile is no longer returned by public profile discovery; seller A can still access their own profile and listings. |
| PRIV-02 | Query drafts/submitted listings while signed out or as seller B | Private listings are not returned. |
| PRIV-03 | While seller A is private, request seller A's active listing as an anonymous visitor and as seller B | Public reads do not return the listing while the seller profile is private. |
| PRICE-01 | Create a listing priced at 1250 NGN | Discovery displays 1,250 NGN, not 125,000 NGN. |
| SECRET-01 | Inspect page source, browser storage, and client network payloads | No service-role key or private management credential is present. |

## Additional customer workflows
- Verify file/audio upload storage permissions: an authenticated user can upload only to their permitted namespace; another user's private files cannot be read, overwritten, or deleted.
- Verify message send/receive and conversation access: only conversation participants can read or send messages in that conversation.
- Verify order creation and state transitions, payment confirmation, refunds, and dispute handling in staging.
- Verify the 5% commission is calculated and disclosed correctly for eligible purchases.
- Verify buyer-only accounts can browse and purchase without being forced to activate seller status.
- Verify a specialist can act as buyer and seller using one account after seller eligibility is met.
- Do not use real payment details or initiate live charges for tests.

## Evidence to capture
- Test case ID, timestamp, test account label (not email address), pass/fail, HTTP status, and redacted error message.
- For negative security tests, record the attempted action and confirm the database row/profile state remained unchanged.
- Never include access tokens, refresh tokens, private email contents, or full identity documents in screenshots or logs.

## Release gate
Do not mark the seller journey end-to-end verified until authentication, listing ownership, five-listing activation, publishing, public discovery, visibility, privacy, and price tests pass in staging. Storage, messaging, orders, payment/refund, and commission flows must also be tested before claiming the full marketplace is production-ready. Do not merge or deploy the frontend solely because static checks or unauthenticated smoke tests pass.

## Locked product rule — no routine song listening review
Customer songs must not be routed into a routine staff listening or approval queue. Validate listing metadata and preview constraints automatically; do not require ARC_SILK staff to listen to customer songs before publication. Audio previews remain capped at 30 seconds. Copyright or policy reports, if implemented, are handled as a separate complaint process and are not routine song review.

## Seamless publication (v119)
- A submitted listing can be published by its authenticated owner only when their seller profile is active and public.
- Publication performs server-side metadata checks and enforces HTTPS preview URLs and a maximum 30-second preview; it does not require staff to listen to customer songs.
- Attempts to publish another seller's listing, a draft, an invalid listing, or a listing with a preview longer than 30 seconds are rejected.
- Published listings become active for Marketplace discovery. Five submitted listings remain the seller activation gate; active listings count toward eligibility when restoring public visibility.
