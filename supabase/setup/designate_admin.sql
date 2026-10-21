-- =====================================================================
-- DESIGNATED ADMINISTRATOR SETUP  (run ONCE, manually, by the owner)
-- Run in the Supabase SQL Editor of the NEW project, AFTER the owner has
-- registered with this email address, verified it, and signed in once.
-- The account is matched by email. Registration order never creates an admin.
-- =====================================================================

update public.profiles p
   set role = 'admin'
  from auth.users u
 where u.id = p.id
   and lower(u.email) = lower('owenkurtohama@gmail.com');

insert into public.entitlements (user_id, source, starts_at, ends_at, reference)
select p.id, 'admin_permanent', now(), null, 'designated administrator'
  from public.profiles p
  join auth.users u on u.id = p.id
 where lower(u.email) = lower('owenkurtohama@gmail.com')
   and not exists (select 1 from public.entitlements e where e.source = 'admin_permanent');

-- Verify: exactly one row, role 'admin', empty ends_at.
select p.username, p.role, e.source, e.ends_at
  from public.entitlements e
  join public.profiles p on p.id = e.user_id
 where e.source = 'admin_permanent';
