-- =====================================================================
-- Vortex of Stories - restore table privileges the website needs.
-- Row Level Security still decides which rows each person can see or change.
-- Safe to run more than once: GRANT is idempotent.
-- Requires migrations 1 to 6.
-- =====================================================================

-- Reading for guests: only what the policies allow anonymous visitors to see.
grant select on public.profiles, public.books, public.main_chat_messages,
  public.book_chat_messages, public.premium_packages, public.author_support_links
  to anon;

-- Reading for signed-in members.
grant select on public.profiles, public.books, public.chapters, public.main_chat_messages,
  public.book_chat_messages, public.chapter_comments, public.premium_packages,
  public.author_support_links, public.library_entries, public.reading_progress,
  public.author_follows, public.payment_submissions, public.entitlements,
  public.content_reports, public.coin_rules, public.coin_ledger
  to authenticated;

-- Authors create and edit their own books and chapters. Triggers still enforce approval rules.
grant insert, update on public.books, public.chapters to authenticated;

-- Members edit only their display name and bio.
grant update (display_name, bio) on public.profiles to authenticated;
