# Vortex of Stories - Master Specification v1.1

Status: owner-approved for generation on 20 October 2026, with the items in section 9 still provisional.
Supersedes: Vortex_of_Stories_Master_Specification_v1.docx (v1.0). The earlier document is kept only as history.

Fresh start: nothing from the old build is reused. The old GitHub repository and Supabase project are to be deleted by the owner, and this project uses a new repository and a new Supabase project.

## 1. Product

Vortex of Stories is a story-reading, writing, publishing and community platform. Guests can discover books and read the first three chapters of each. Registered members read further, follow the community, and can buy or be granted Premium. Authors publish through an approved workflow. Administrators approve books, verify payments, grant Premium, and moderate content.

## 2. Decision log

| ID | Question | Decision | Status |
|---|---|---|---|
| D-001 | Second item to retain from old build | None. Everything from the old build is removed. | CONFIRMED |
| D-002 | Design image | Supplied (vortex-art.jpg). Used as the logo and the live background theme: an animated vortex drawn over the artwork, which stops for reduced-motion users and in hidden tabs. | CONFIRMED |
| D-003 | Google Sign-In | Dropped. Email and password only. | CONFIRMED |
| D-004 | Architecture | React + Vite; GitHub Pages (static hosting); Supabase (database, authentication, trusted SQL functions). New repository and new Supabase project. | CONFIRMED |
| D-005 | Reading beyond chapter 3 | Guests: first 3 published chapters per book. Any registered, email-verified member: all published chapters, with no Premium needed. | CONFIRMED |
| D-006 | First-100 promotion | First 100 eligible members get 1 month of Premium. | CONFIRMED |
| D-007 | Holiday / seasonal Premium | Not built in Phase 1. Specified later. | DEFERRED |
| D-008 | Buying while subscribed | New purchase time is added to the end of the existing paid period. Refunds are handled by admin revocation under a documented policy. | CONFIRMED (refund policy: see section 9) |
| D-009 | Ko-fi verification | Manual verification by an administrator is acceptable. A redirect, return visit, screenshot or claim never grants Premium. | CONFIRMED |
| D-010 | Permanent administrator | The designated administrator account (owenkurtohama@gmail.com) receives permanent Premium. Set by the owner's one-time SQL step. Registration order never creates an admin. | CONFIRMED |
| D-011 | Admin-granted Premium | The admin can grant permanent Premium to any account, with no limit, and revoke it. Each action is logged with who, when and why. Kept separate from paid and promotional Premium. | CONFIRMED |
| D-012 | Eligibility for first 100 | Begins when the email address is verified. Allocation is atomic. | CONFIRMED |
| D-013 | Permanent admin does not use a promo slot | Confirmed. | CONFIRMED |
| D-014 | Manual Ko-fi process | Buyer submits Ko-fi order reference and website username. Admin checks the real Ko-fi record and approves. Duplicate order references are rejected. | CONFIRMED |
| D-015 | Phasing | Phase 1: accounts, reading, publishing, Premium, discussions. Coins, riddles, Book of the Year and seasonal promotions later. Their requirements are documented so the database can accommodate them. | CONFIRMED |
| D-016 | Old project removal | Owner deletes the old GitHub repository and Supabase project personally, after the checklist in docs/03. The owner has stated nothing is to be kept. | CONFIRMED |
| D-017 | Coins: earning | Correct riddle +4 (later phase). Daily login +2. New member +10 at email verification. | PROVISIONAL |
| D-018 | Coins: spending | Extra main-chat message 5 coins. Premium 500 coins for 1 month. Unlock locked chapter 30 and profile picture 100: NOT enabled (see section 9). | PROVISIONAL |
| D-019 | Coins: rules | Balances only change on the server. Every change is recorded in an append-only ledger. Spends are atomic. Failed purchases deduct nothing. Coins have no cash value and cannot be transferred. | CONFIRMED (no cash value and no transfer: owner to confirm) |

## 3. Roles and entitlements

Roles and entitlements are separate. A person can be an author and a Premium member at the same time.

- **Guest:** browse, read the first three published chapters of each approved book, read the main chat, view Premium information. Cannot post, comment, report, buy, or read further.
- **Registered reader (email verified):** everything a guest can do, plus all published chapters, chapter comments, main-chat posting (10 messages per UTC day), reporting, and Premium purchase requests.
- **Premium entitlement:** an active entitlement from one of four sources: `paid`, `promo_first100`, `admin_grant`, `admin_permanent`, or `coin_purchase`. Premium adds the confirmed benefits (section 4). It grants no admin power and no extra voting weight.
- **Author:** creates books, submits them for review, adds chapters, publishes chapters once the book is approved. Cannot edit another author's books or change approval status.
- **Administrator:** approves or rejects books, verifies payments, grants and revokes Premium, hides content, reviews reports, and reads the audit log. Admin status is set manually during deployment only.
- **Suspended account:** blocked from reading beyond guest access and from every write action. Enforced on the server.

## 4. Premium

- Packages: 1 month $9; 3 months $25; 6 months $49; 12 months $96 (USD). All four are shown before the owner's Ko-fi page is opened.
- Confirmed benefits: expanded themes and personalization; Premium-only author notes and theory sections; offline downloads of individual eligible chapters (not whole books). No other benefits are included unless approved.
- Paid time stacks onto the end of the current paid period.
- Premium does not change admin rights or Book of the Year voting.

## 5. Chapters and publishing

- A new book is saved as a draft, then submitted for review. Only an administrator can approve it, and a rejection must include a reason.
- Once a book is approved, its author may publish chapters without a separate review for each one.
- Approval status and chapter publication are separate. A withdrawn book is hidden from the public, and its chapters cannot be read through any route.
- Drafts are never returned by public routes.
- Chapter deletion is not offered in Phase 1; editing history and deletion rules are open (D-018 in the earlier register).

## 6. Community

- Main chat: registered, verified members may send 10 messages per UTC day. The limit is enforced atomically in the database. Guests can read.
- Chapter comments: registered, verified members only, pending owner decision D-016.
- Reports: any verified member can report a message or comment. Administrators review reports and hide content with a logged reason.

## 7. Phase 2+ (documented, not built in Phase 1)

- **Coins:** see section 9.
- **Riddles:** answers validated on the server; secret answers never sent to browsers before closing. Rules (attempts, hints, scoring, prizes) are open.
- **Book of the Year:** one vote per member per book per cycle, enforced by a unique constraint. "Official member" is open.
- **Seasonal promotions:** configurable by admins with start and end times. Dates and stacking are open.

## 8. Explicitly out of scope

Video hosting, live streaming, private direct messages, cryptocurrency, cash payouts, whole-book downloads, ratings and reviews, AI-generated writing or moderation, and any payment provider other than Ko-fi. None may be added without a new owner decision.

## 9. Provisional and open items

These must be confirmed by the owner before the affected phase is built. Nothing marked here is treated as final.

1. **Coin amounts (PROVISIONAL):** the figures in D-017 and D-018 come from the owner's notes. Confirm them.
2. **Chapter unlock with coins (CONFLICT):** the coin notes describe "unlocking a locked chapter," but the confirmed access rules (D-005) make all published chapters readable by any verified member. Which chapters are "locked" must be defined before this feature exists. It is disabled.
3. **Profile picture for 100 coins (OPEN):** needs a storage and image-validation design. Disabled.
4. **Daily-login day boundary (OPEN):** the schema uses UTC. Confirm the owner's timezone or approve UTC.
5. **Extra chat message scope:** the owner's screenshot says main community chat only. Confirm.
6. **Coins with no cash value and no transfer:** confirm.
7. **Refund and chargeback policy (OPEN):** administrators can revoke time manually. Confirm whether this manual process is acceptable.
8. **Account deletion (OPEN):** not implemented. Deletion of an account with coin history is blocked by design (the ledger is append-only) until a policy is set.
9. **Notifications and emails (OPEN):** none in Phase 1.
10. **Terms, privacy policy, age rules, copyright and community rules (OPEN, owner approval required before launch).** This specification is not legal advice.
11. **Email delivery:** the default Supabase email service is limited and is not suitable for launch. A custom SMTP provider is required before public launch (see docs/03).
12. **Designated administrator:** owenkurtohama@gmail.com, applied through supabase/setup/designate_admin.sql after the owner registers and verifies that email.
