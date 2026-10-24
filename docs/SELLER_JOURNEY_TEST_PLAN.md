# ARC_SILK seller journey test plan

Status: prepared; browser execution is still pending. Run in a non-production test environment with two controlled test accounts. Do not use real customer data or create fake listings in production.

## Preconditions
- A staging Supabase project with the current schema, RLS policies, and Edge Functions deployed.
- Two email addresses controlled by the project owner; one account for seller A and one for seller B.
- Browser devtools available to inspect network responses and console errors.
- No service-role key in browser storage, HTML, client logs, or network responses.

## Test cases

| ID | Action | Expected result |
|---|---|---|
| AUTH-01 | Open the site signed out and open Seller Studio | Seller Studio requests sign-in; no listing data is exposed. |
| LIST-01 | Sign in as seller A and save a valid draft | One draft is saved with seller_id equal to seller A's auth user ID. |
| LIST-02 | Submit the draft | Status becomes submitted; submitted counter increases by one. |
| LIST-03 | Attempt a preview duration of 31 seconds | Client validation blocks the save; a direct API attempt must not bypass any server/database constraint that exists. |
| LIST-04 | Attempt to insert a listing with seller B's ID | RLS rejects the write. |
| LIST-05 | Attempt to update seller B's listing by ID | No row is changed; access is denied or no matching row is returned. |
| ACT-01 | With fewer than five submitted listings, invoke seller activation | Request is rejected with HTTP 422 and the remaining count; profile remains non-seller. |
| ACT-02 | Submit five listings and invoke seller activation | Function returns success and profile seller status is true. |
| VIS-01 | Try to make a profile public with missing/invalid username or display name | Function rejects the request; profile remains private. |
| VIS-02 | Try to make a non-seller profile public | Database guard rejects it; profile remains private. |
| VIS-03 | Make an eligible seller profile public | Function confirms is_public true; only active listings appear in public discovery. |
| PRIV-01 | Set seller A's profile private | Profile is no longer returned by public profile discovery. |
| PRIV-02 | Query drafts/submitted listings while signed out or as seller B | Private listings are not returned. |
| PRICE-01 | Create a listing priced at 1250 NGN | Discovery displays 1,250 NGN, not 125,000 NGN. |
| SECRET-01 | Inspect page source, browser storage, and client network payloads | No service-role key or private management credential is present. |

## Evidence to capture
- Test case ID, timestamp, test account label (not email address), pass/fail, HTTP status, and redacted error message.
- Never include access tokens, refresh tokens, private email contents, or full identity documents in screenshots or logs.

## Release gate
Do not mark the seller journey end-to-end verified until the authentication, listing ownership, five-listing activation, visibility, privacy, and price tests pass in staging. Do not merge or deploy solely because static checks pass.
