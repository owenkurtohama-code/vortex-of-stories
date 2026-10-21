-- =====================================================================
-- Vortex of Stories - Phase 1: administrator tools.
-- Account suspension (blocks sign-in and all actions), member search,
-- entitlement lookup, and audit log viewing.
-- Requires migrations 1 to 4. Apply once, in order.
-- =====================================================================

-- Suspends or restores an account. Sets profiles.suspended (blocks writes and reading beyond
-- guest access) and auth.users.banned_until (blocks sign-in).
-- VERIFY on the first test project: banned_until must exist in your Supabase auth schema.
create or replace function public.admin_set_suspended(p_user uuid, p_suspended boolean, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role public.app_role;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  if p_user = auth.uid() then raise exception 'cannot_suspend_self'; end if;

  select pr.role into v_role from public.profiles pr where pr.id = p_user;
  if not found then raise exception 'user_not_found'; end if;
  if v_role = 'admin' then raise exception 'cannot_suspend_admin'; end if;

  update public.profiles set suspended = p_suspended where id = p_user;
  update auth.users
     set banned_until = case when p_suspended then 'infinity'::timestamptz else null end
   where id = p_user;

  insert into public.admin_audit (actor_id, action, target, reason)
  values (auth.uid(), case when p_suspended then 'suspend_account' else 'restore_account' end,
          p_user::text, btrim(p_reason));
end $$;

-- Member lookup for administrators (username prefix search).
create or replace function public.admin_find_member(p_query text)
returns table (user_id uuid, username text, email text, role text, suspended boolean,
               email_verified boolean, premium_now boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  return query
    select p.id,
           p.username::text,
           u.email::text,
           p.role::text,
           p.suspended,
           (p.email_verified_at is not null),
           exists (select 1 from public.entitlements e
                   where e.user_id = p.id and e.revoked_at is null
                     and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now()))
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.username::text ilike btrim(coalesce(p_query, '')) || '%'
    order by p.username
    limit 25;
end $$;

-- All entitlements for one member, so an administrator can find an ID to revoke.
create or replace function public.admin_user_entitlements(p_user uuid)
returns setof public.entitlements
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select * from public.entitlements e where e.user_id = p_user order by e.starts_at desc;
end $$;

-- Audit log, newest first, capped at 500 rows per call.
create or replace function public.admin_list_audit(p_limit int default 100)
returns setof public.admin_audit
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select * from public.admin_audit a order by a.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

revoke all on function public.admin_set_suspended(uuid, boolean, text) from public;
revoke all on function public.admin_find_member(text) from public;
revoke all on function public.admin_user_entitlements(uuid) from public;
revoke all on function public.admin_list_audit(int) from public;
grant execute on function public.admin_set_suspended(uuid, boolean, text) to authenticated;
grant execute on function public.admin_find_member(text) to authenticated;
grant execute on function public.admin_user_entitlements(uuid) to authenticated;
grant execute on function public.admin_list_audit(int) to authenticated;
