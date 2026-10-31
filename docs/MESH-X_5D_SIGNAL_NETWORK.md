# MESH-X — 5D Signal Network
Status: approved product specification; implementation staged, not deployed.

## Product definition
MESH-X is a description-first resource and connection network. Users describe what they need, offer, own, or can provide. They approve an interpreted description, select a distribution area, and publish a signal. Relevant providers can request a private connection. The requester decides whether to accept. Accepted connections open private conversations for negotiation and optional physical or remote collaboration.

Core sequence:
DESCRIBE → UNDERSTAND → REVIEW → SELECT DESTINATION → PUBLISH SIGNAL → MATCH → PROVIDER REQUESTS CONNECTION → REQUESTER ACCEPTS/DECLINES → PRIVATE CHAT → OUTCOME CONFIRMATION.

## Interface: five functional dimensions
- D1 Identity: profile, skills, resources, verification and preferences.
- D2 Resources: physical, economic and human resources.
- D3 Intelligence: natural-language interpretation, extraction, semantic matching and alternatives.
- D4 Location: user-selected distribution area; approximate locations only in provider previews.
- D5 Connection: provider-initiated requests, requester consent, private chat and outcome status.
These are product dimensions, not literal five-dimensional computing.

## Primary navigation
1. CORE — 5D command environment and signal overview.
2. SIGNAL — create, review, publish and manage requests/offers.
3. DISCOVER — user-directed discovery of shared resources and active signals.
4. CONNECTIONS — incoming/outgoing requests and private conversations.
5. IDENTITY — profile, skills, resources, verification and privacy settings.

## Signal Composer
Single natural-language input supporting paste, typing and optional voice transcription. Optional attachments: images and documents. Before publishing, the interpretation layer proposes:
- intent_type: request or offer
- resource_domain: physical, economic or human
- resource_type and concise title
- description and specifications
- quantity, if stated
- approximate destination and distribution scope
- physical, remote or either
- budget/asking price and urgency only when supplied
The system must not invent missing values. Ambiguous requests are returned for clarification. The user reviews and approves the structured interpretation before publication.

## Distribution controls
Support 5 km, 25 km and 100 km radius; neighbourhood; city; region; country; selected countries; worldwide; selected users; and remote-only. Precise coordinates are not public and are not required in v1. Store only coarse location fields in signal records. If future geospatial precision is required, it must be separately consented and access-controlled.

## Matching and connection rules
- Match by semantic requirement/resource compatibility, geography, availability, connection mode and relevant verification evidence.
- Explain match reasons. A compatibility score is not a trust or safety certification.
- Provider sees only a privacy-filtered signal preview and may request a private connection.
- Requester sees provider profile and applicable verification details, then accepts or declines.
- Multiple providers can respond independently; no provider can see another provider's private conversation.
- No unsolicited direct message access, public exposure of contact details, or automatic contract/payment.

## Resource record
Domains: physical, economic, human.
Availability: available, temporarily unavailable, reserved, in negotiation, completed, verification pending.
Verification: self-declared, pending, verified, rejected.
Listing scope: private, network, public.
Owners retain control and must be able to update their resource availability.

## Safety and privacy
- RLS on all exposed tables.
- Resource visibility is owner-only unless explicitly shared.
- Full signal text is requester-only; provider receives a deliberately curated preview.
- Connection request creation and accept/decline transitions are server-authorized.
- Messages are visible only to conversation participants.
- Exact meeting locations/contact details are shared only by explicit user choice.
- Block/report, abuse review, rate limits, anti-spam and expiry controls are required before public launch.
- Verification of an account does not automatically verify every resource or transaction.

## Economic model
Keep MESH Score, MESH Points and MESH Pay distinct. Cash rewards require cleared revenue or buyer-funded settlement. The signal network does not create cash promises merely for publishing a request or responding to one. Commercial transactions and any platform fee require transparent user consent and separate policy.

## Explicitly deferred
Proactive/passive resource and opportunity discovery remains paused. Do not scan the network to infer opportunities or initiate signals without a user's explicit search, request, offer or consent.

## Implementation boundaries
- This migration is additive and separate from the existing music marketplace tables.
- Do not modify or replace the existing launch page.
- Do not apply this migration to production until staging database validation, RLS tests, and product review pass.
- AI parsing, signal routing, match scoring, notification delivery, request acceptance endpoints, and UI integration are separate server/UI deliverables. Do not claim them operational until implemented and tested.
- No Telegram bot, payout provider or real-money workflow is implied by this specification.

## Acceptance test scenarios
1. Requester creates a signal and only that requester can read the full signal.
2. Provider receives a safe preview only after a server-generated match.
3. Provider requests a private connection; requester can accept or decline.
4. An accepted request creates one conversation, idempotently.
5. Only the two participants can read/send messages in that conversation.
6. Multiple providers can independently request connection to one signal.
7. Private resources do not appear in discovery.
8. Unavailable resources are excluded from active matches.
9. Location preview never reveals exact coordinates or private contact details.
10. Expired, paused and closed signals are not routed.
