# MESH-X — Revenue-Backed Contribution Protocol

Status: design/staging branch; not deployed to Supabase and not connected to live payouts.

## Product rule

MESH-X is a Telegram-first hybrid contribution network. It rewards accepted digital intelligence, authorized relay/network utility, and digital production through a single verification and accounting protocol.

User flow: CONNECT → CONTRIBUTE → VERIFY → ALLOCATE → CONVERT.

## Revenue-first rule

- MESH Score is reputation/quality; it is not money.
- MESH Points are contribution/allocation units; they are not a fixed-value token and do not promise cash.
- MESH Pay records a confirmed monetary allocation or completed payout, denominated in a stated currency.
- Points can only receive a cash allocation from collected and reconciled revenue or a buyer-funded task settlement.
- No revenue/settlement means no cash distribution. Never mint a cash liability from points alone.
- No token launch, mining claim, guaranteed return, or pay-to-earn scheme in v1.

## First revenue activity

Start with paid, scoped digital-intelligence campaigns: research verification, data labeling, and structured digital QA. A customer agrees to a campaign budget and acceptance criteria; MESH-X records payment/settlement status; contributors are paid only for accepted work and only from the campaign's available cleared funds.

Do not sell personal data, scrape private data, or reward spam/click fraud. Relay and broader marketplace modules remain later expansion modules until the first paid campaign flow is proven.

## Suggested campaign allocation

The campaign creator chooses a disclosed budget split before launch. Example only: 70% accepted contributors, 15% platform operations, 10% verification/fraud costs, 5% reserve. The platform must not treat these sample percentages as universal terms.

For each closed campaign:
1. Reconcile collected funds net of refunds, chargebacks, taxes and provider fees.
2. Compute the contributor pool from the campaign's agreed split.
3. Calculate each contributor's share using eligible points from that campaign only.
4. Create immutable allocation records with a unique idempotency key.
5. Let a payout adapter pay an eligible currency/network; record provider reference and final status.
6. On payout failure, keep funds owed as pending and retry idempotently; never issue a duplicate payout.

## Minimal protocol

- Telegram identity is verified server-side; never trust a user-supplied Telegram ID alone.
- Contributions are submitted to a backend endpoint, deduplicated, checked against campaign criteria, then accepted/rejected with an audit record.
- Reward/ledger writes are server-only. Client apps must not directly change point balances or payout status.
- Use append-only ledger entries, unique idempotency keys, database transactions, and explicit reversal entries rather than editing historical ledger rows.
- Separate pending, available, allocated, paid, failed, and reversed states.
- Apply rate limits, anti-Sybil checks, moderation, and human review for disputed/high-value work.
- Do not store seed phrases or private keys. Use a regulated/compatible payout provider or carefully scoped wallet integration.
- Start in test mode with simulated payouts; real payouts are a separate launch gate.

## Existing infrastructure verification (2026-10-30)

- Existing GitHub repo: `bullishedzone9/ARC_SILK-`, default branch `main`; this work is isolated on `feat/mesh-x-revenue-protocol`.
- Existing Supabase project `ARC-SILK` is ACTIVE_HEALTHY. Existing public tables found: `profiles`, `marketplace_listings`, `photo_library_metadata`; no MESH-X tables found in the public schema.
- Existing edge functions are for seller activation, profile visibility, listings, and photo management; no MESH-X payout/contribution function found.
- No Vercel project named MESH-X was found in the connected Vercel account search.
- Existing launch page belongs to the music marketplace and must not be overwritten.

## Launch gates

1. Agree and sign off on customer terms, contribution criteria, budget splits, refunds, disputes, privacy, sanctions/KYC obligations and country availability.
2. Configure a real campaign buyer/payment or settlement source.
3. Implement server-side contribution verification and atomic ledger functions.
4. Add Telegram Mini App auth verification and bot/webhook integration.
5. Add payout provider in sandbox; test idempotency, failure/retry, refunds, and reconciliation.
6. Pass security review and legal/compliance review before real-money launch.

## Current status

Only the design and initial database migration are staged in GitHub. No production schema change, bot deployment, payout, or real-money test has been performed.
