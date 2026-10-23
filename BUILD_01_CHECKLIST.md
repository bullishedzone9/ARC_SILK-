# ARC_SILK BUILD 01 — implementation checklist

## Before coding
- [ ] Confirm the intended baseline HTML prototype.
- [ ] Inspect all inline scripts and form/button behavior.
- [ ] Identify demo alerts, nonfunctional links, and any external dependencies.
- [ ] Preserve the originals in version control.

## Authentication
- [ ] Supabase project created for development.
- [ ] Environment variables configured locally; no secrets committed.
- [ ] Sign-up, sign-in, sign-out, email confirmation, password recovery tested.
- [ ] Session persistence and expired-session behavior tested.
- [ ] Protected routes checked in browser and server-side where applicable.
- [ ] Profile reads/updates constrained by RLS.

## Before production
- [ ] Add verified admin authorization independent of client-side flags.
- [ ] Add rate limiting, validation, abuse handling, and audit logging.
- [ ] Review privacy notice, terms, payment disclosures, refund/dispute flow, and regional compliance.
- [ ] Verify mobile and desktop behavior.
- [ ] Run dependency/security checks and test with non-admin and admin accounts.
