-- =====================================================================
-- READ-ONLY CHECKS. Run in the Supabase SQL Editor after all migrations.
-- Every result should match the "expected" note beside it.
-- =====================================================================

-- 1. Every public table has Row Level Security enabled. Expected: zero rows.
select c.relname as table_without_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- 2. Functions anonymous visitors can run. Expected exactly these four:
--    get_chapter, book_chapter_index (guest reading), get_author_profile (public author page), is_admin (row policies).
select p.proname as callable_by_anon
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and has_function_privilege('anon', p.oid, 'EXECUTE')
 order by p.proname;

-- 3. Key tables exist. Expected: 21 rows (one per table listed).
select t.table_name
  from information_schema.tables t
 where t.table_schema = 'public'
   and t.table_name in ('profiles', 'premium_packages', 'entitlements', 'payment_submissions',
     'promo_counters', 'admin_audit', 'books', 'chapters', 'main_chat_messages', 'chat_daily_quota',
     'chapter_comments', 'content_reports', 'coin_rules', 'coin_ledger', 'library_entries',
     'reading_progress', 'author_follows', 'author_support_links', 'app_settings',
     'book_chat_messages', 'book_chat_daily_quota')
 order by t.table_name;

-- 4. Promotion counter and packages are seeded. Expected: first100 with cap 100; four packages.
select key, granted, cap from public.promo_counters;
select months, price_usd from public.premium_packages order by months;

-- 5. Settings are seeded. Expected: main_chat_daily_limit 10, book_chat_daily_limit 30.
select key, value from public.app_settings order by key;

-- 6. Designated administrator is in place. Expected: one row, role admin, empty ends_at.
select p.username, p.role, e.source, e.ends_at
  from public.entitlements e join public.profiles p on p.id = e.user_id
 where e.source = 'admin_permanent';

-- 7. Auth settings the ban feature depends on. Expected: one row (column present).
select column_name from information_schema.columns
 where table_schema = 'auth' and table_name = 'users' and column_name = 'banned_until';
