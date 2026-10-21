# Architecture

## Components

| Part | Technology | Hosts / runs | Holds secrets? |
|---|---|---|---|
| Website | React 18 + Vite, HashRouter | GitHub Pages (static files) | No. Only the public anon key. |
| Database | Supabase Postgres | Supabase | Service-role key stays in the owner's Supabase dashboard only. |
| Authentication | Supabase Auth, email + password, email verification, password reset (PKCE) | Supabase | Passwords are hashed by Supabase; never stored by the app. |
| Trusted logic | Postgres functions (`SECURITY DEFINER`) | Supabase | No secrets. |
| Deployment | GitHub Actions to GitHub Pages | GitHub | Anon key and project URL are stored as repository variables. |

## Why this shape

- GitHub Pages serves static files only, so it cannot enforce roles, quotas, payments or balances. Those rules live in Postgres, which the browser cannot bypass.
- Row Level Security (RLS) limits what each role can read or write. Sensitive tables have no client insert or update policy at all. Clients change data only through the named functions.
- The Phase 1 trusted logic is written as Postgres functions. Edge Functions are not needed yet. They will be needed later for an automated payment webhook if one is ever approved.
- HashRouter (`#/book/...`) means refreshing a page or opening a link never hits a missing file on GitHub Pages.
- `base: './'` in Vite makes assets load from `https://<user>.github.io/<repo>/`.

## Data model (Phase 1)

- `profiles`: one row per account (username, role, suspended flag, verification time). Linked to `auth.users`.
- `premium_packages`: the four confirmed packages.
- `entitlements`: every Premium period, with source, start, optional end (NULL = permanent), and revocation time. One designated admin entitlement allowed (unique index).
- `payment_submissions`: Ko-fi order references awaiting verification. Unique order reference prevents double claims.
- `promo_counters`: the first-100 counter (granted, cap).
- `books`, `chapters`: publishing with separate approval and publication states.
- `main_chat_messages`, `chat_daily_quota`: main chat and its daily limit.
- `chapter_comments`, `content_reports`: discussion and moderation.
- `admin_audit`: append-only log of every privileged action (written by trusted functions only).

Phase 2 (`20261020000002_coins_provisional.sql`) adds `coin_rules`, `coin_ledger` (append-only), and the award and spend functions.

## Key guarantees and how they are enforced

| Requirement | Mechanism |
|---|---|
| Guests see only 3 chapters per book | `get_chapter` and `book_chapter_index` compute the rank of each published chapter on the server. Bodies are never returned by any listing. |
| Unverified or suspended accounts cannot act | `assert_verified_member()` in every write function. |
| First 100 cannot be exceeded under concurrency | Advisory lock plus `SELECT ... FOR UPDATE` on the counter, inside one transaction. |
| Premium is never granted by a redirect | Only `review_payment` (admin) creates `paid` entitlements. |
| No double grants from double clicks | `payment_order_reference_unique` index; `review_payment` locks the row and refuses non-pending items. |
| Paid time stacks, never overlaps | New start = greatest(now, latest paid end). |
| Admin cannot be created by registration | `profiles.role` cannot be changed by clients (column guard and no update grant). Set only by the owner's SQL. |
| Designated admin entitlement cannot be revoked by accident | `admin_revoke_entitlement` refuses `admin_permanent`. |
| Main chat limit cannot be bypassed by parallel requests | Row lock on the day's quota row inside `post_main_chat`. |
| Coins cannot be edited by clients, and cannot overdraw | No client write grant; ledger is append-only (trigger); spends hold an advisory lock per user and check balance. |
| Retries do not duplicate grants or spends | Unique idempotency key per ledger row; spend requests carry a client-generated key. |
| Drafts are never public | RLS on `books` and `chapters`; `get_chapter` checks status and publication. |
| Authors cannot approve their own work | `guard_book_changes` trigger, plus `review_book` requires `is_admin()`. |

## Security notes

- Only the anon key is in the browser. It is public by design. Never put the service-role key in `web/`, the repository, or a `VITE_` variable.
- Every table has RLS enabled. Functions are granted to `authenticated` (or `anon` for guest reads) only. The `revoke all on all functions ... from public` step prevents accidental exposure.
- Input is limited in length at the database level and rendered as plain text by React (no `dangerouslySetInnerHTML` is used).
- Error messages come from named codes; raw database text is not shown to users.
- Email enumeration: password-reset responses are the same whether or not the email exists.

## Visual theme

The live background is a canvas animation layered over the supplied artwork (`web/public/vortex-art.jpg`). It runs at up to 2x pixel density, uses about 900 particles on desktop and 420 on narrow screens, and pauses when the tab is hidden. It is disabled entirely for users who ask their device for reduced motion. On older phones the animation may still be heavy; if it is, lower the particle counts in `VortexBackground.jsx`.

## Known limits (honest)

- Premium offline downloads, theme personalization and author notes are not built in Phase 1 because their exact implementation is not specified. Entitlement checks exist (`has_premium()`), but the features that consume them are later work.
- Browser-based offline protection cannot be made DRM-proof.
- Supabase's default email service is rate-limited; production needs a custom SMTP provider.
- Nothing in this repository has been run against a live Supabase project yet. The owner's first test should follow docs/04.
