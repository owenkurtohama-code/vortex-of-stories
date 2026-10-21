# Acceptance tests

Record the date, tester, result (PASS / FAIL), and notes for each test. A test counts as passed only when you have actually run it.

Legend: **[UI]** run in the website. **[SQL]** run in the Supabase SQL Editor as a checking step (run inside a transaction and roll back if you are on a live project).

## 1. Guest access

| # | Test | Type | Expected |
|---|---|---|---|
| G1 | Open the site logged out, view Stories | UI | Only approved books appear. Draft and pending books do not. |
| G2 | Open chapters 1, 2 and 3 of an approved book | UI | All three open. |
| G3 | Open chapter 4 by URL | UI | The message "not available to you" appears; no text is shown. |
| G4 | Call `get_chapter` for chapter 4 as anonymous | SQL (as anon) | Zero rows. |
| G5 | List chapters as a guest | UI | Chapters 1 to 3 link to reading; others show a sign-in prompt. Bodies never appear. |
| G6 | Guest tries to post in chat | UI | No form appears; read-only notice shown. |
| G7 | Guest calls `post_main_chat` directly | SQL (as anon) | Error `auth_required`. |

## 2. Registration and authentication

| # | Test | Type | Expected |
|---|---|---|---|
| A1 | Register with username `ab` | UI | Refused: username must be 3 to 20 characters. |
| A2 | Register with a password under 8 characters | UI | Refused. |
| A3 | Register a valid account | UI | "Account created" message; verification email arrives. |
| A4 | Sign in before verifying | UI | Sign-in succeeds, but posting and reading chapter 4 stay blocked with a verify prompt. |
| A5 | Verify email, then read chapter 4 | UI | Opens. |
| A6 | Google sign-in option | UI | Not present. |
| A7 | Forgot password for a real and a fake email | UI | Same message in both cases. |
| A8 | Complete password reset from the email link | UI | New password works; old one is refused. |
| A9 | Sign out | UI | Member-only links disappear; chapter 4 is locked again. |
| A10 | Username collision | UI | Clear error; no account created. |
| A11 | Check that a new account cannot set its own role | SQL (as the user) | `update profiles set role='admin'` is refused. |

## 3. First-100 promotion

| # | Test | Type | Expected |
|---|---|---|---|
| F1 | Verify one account | SQL (check after UI test) | `entitlements` has one `promo_first100` row ending one month later. |
| F2 | Verify the same account twice | SQL | Still one promo row. |
| F3 | Simulate 105 verifications in parallel (test project only) | SQL | Exactly 100 `promo_first100` rows; `promo_counters.granted = 100`. |
| F4 | Admin account verified | SQL | Admin does not consume a promo slot. |

## 4. Publishing

| # | Test | Type | Expected |
|---|---|---|---|
| P1 | Author creates a book | UI | Saved as draft. |
| P2 | Author tries to set status to approved | SQL (as the author) | Refused (`status change not permitted`). |
| P3 | Author submits for review | UI | Status becomes pending review. |
| P4 | Pending book visible to public | UI as guest | Not visible. |
| P5 | Admin rejects with a reason | UI | Author sees the reason; book is not public. |
| P6 | Admin approves | UI | Book appears on Stories. |
| P7 | Author adds chapter, publishes | UI | Chapter readable by verified members. |
| P8 | Publish a chapter of an unapproved book | SQL | Refused. |
| P9 | Author A edits Author B's book | SQL (as A) | Zero rows affected. |
| P10 | Author withdraws an approved book | UI | Book and chapters disappear from public routes immediately. |

## 5. Premium and payments

| # | Test | Type | Expected |
|---|---|---|---|
| M1 | Premium page lists four packages before any redirect | UI | 1, 3, 6 and 12 months with prices $9, $25, $49, $96. |
| M2 | Choose a package, then open Ko-fi | UI | Ko-fi page opens only after a package is selected. |
| M3 | Submit an order reference | UI | Status pending. No Premium. |
| M4 | Submit the same order reference again (any account) | UI | Refused: already submitted. |
| M5 | Submit with a different website username | SQL (as user) | Refused: `username_mismatch`. |
| M6 | Admin approves a 1-month order | UI | Premium active; expiry about one month later. |
| M7 | Approve a second order while paid time remains | SQL | New period starts at the old end; total time is additive. |
| M8 | Admin rejects an order | UI | Status rejected; no entitlement. |
| M9 | Approve an already approved order (double click) | SQL | Refused: `already_reviewed`. |
| M10 | Expired paid period | SQL with a past date (test project) | `has_premium()` returns false. |
| M11 | Revoke a paid entitlement (refund) | UI | Premium removed; audit row written. |

## 6. Admin Premium

| # | Test | Type | Expected |
|---|---|---|---|
| AP1 | Admin grants Premium to a member with a reason | UI | Entitlement `admin_grant`, no end date; audit row. |
| AP2 | Grant with no reason | UI | Refused. |
| AP3 | Grant to 50 accounts | UI | All succeed; no numeric limit. |
| AP4 | Revoke an admin grant | UI | Removed; audit row. |
| AP5 | Revoke the designated admin entitlement | UI or SQL | Refused: protected. |
| AP6 | Admin grant does not remove paid time | SQL | Paid rows unchanged. |
| AP7 | Non-admin calls `admin_grant_premium` | SQL (as member) | `forbidden`. |

## 7. Community and moderation

| # | Test | Type | Expected |
|---|---|---|---|
| C1 | Post 10 messages in one UTC day | UI | All succeed. |
| C2 | 11th message | UI | Refused: daily limit. |
| C3 | Ten parallel posts from one account (test project) | SQL | Exactly 10 succeed. |
| C4 | Message and comment exceed length | UI/SQL | Refused. |
| C5 | Report a message with a reason | UI | Report created. |
| C6 | Report without a reason | UI | Refused. |
| C7 | Admin hides a message | UI | Hidden for everyone; audit row. |
| C8 | Message HTML `<script>` text | UI | Shown as plain text. |
| C9 | Suspended account posts | SQL | `account_suspended`. |

## 8. Reader and navigation

| # | Test | Type | Expected |
|---|---|---|---|
| R1 | Previous and next links | UI | Correct order. |
| R2 | Open a chapter ID that does not exist | UI | Locked message; no error details. |
| R3 | Refresh on a deep link | UI on GitHub Pages | Page loads (HashRouter). |

## 9. Responsive and accessibility

| # | Test | Type | Expected |
|---|---|---|---|
| X1 | Phone width (about 375px) | Manual | All pages usable; no sideways scrolling. |
| X2 | Keyboard only | Manual | Every control reachable; focus visible. |
| X3 | Screen reader on Login and Register | Manual | Labels and error messages read aloud. |
| X4 | Contrast of text on backgrounds | Tool check | Meets WCAG AA. Check with a contrast checker before launch. |
| X5 | Reduced-motion setting | Manual | No animation (the site has none beyond transitions). |

## 10. Deployment

| # | Test | Type | Expected |
|---|---|---|---|
| D1 | Push to `main` | GitHub | Workflow runs; green tick. |
| D2 | Build without the two variables | GitHub | Build still runs; the site shows the "Missing" message. |
| D3 | Repository search for secrets | Manual | No real keys or passwords in files. |
| D4 | Migrations on a clean project | SQL | Both files apply once without error. |

## 11. Recovery

| # | Test | Type | Expected |
|---|---|---|---|
| B1 | Create a backup and restore it into a test project | Manual | Data matches. |
| B2 | Written rollback steps exist | Manual | docs/03 Part H. |

## 12. Visual theme

| # | Test | Type | Expected |
|---|---|---|---|
| V1 | Open the site on a desktop | Manual | Vortex animates; artwork visible behind content; text readable. |
| V2 | Open on a phone | Manual | Animation runs smoothly; no sideways scrolling; text readable. |
| V3 | Switch to another browser tab for 10 seconds, then return | Manual | Animation resumes without a jump or error. |
| V4 | Enable "reduce motion" in the operating system, reload | Manual | No animation; artwork shows as a still image. |
| V5 | Browser console during use | Manual | No errors. |

## Known gaps not covered yet

- Coins (migration 2): tests C1 to C3 pattern applies; write coin tests before enabling the feature in the UI.
- Book of the Year, riddles, seasonal promotions: not built.
- Offline downloads and theme personalization: not built.
- Load testing: not performed.
