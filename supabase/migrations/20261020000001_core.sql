-- =====================================================================
-- Vortex of Stories - core schema (Phase 1)
-- Apply ONCE to a NEW, EMPTY Supabase project. Not idempotent by design.
-- Documents: docs/01_MASTER_SPEC.md (rules), docs/02_ARCHITECTURE.md
-- =====================================================================

create extension if not exists citext;

-- ---------- Types ----------
create type public.app_role as enum ('reader', 'author', 'admin');
create type public.premium_source as enum ('paid', 'promo_first100', 'admin_grant', 'admin_permanent', 'coin_purchase');
create type public.book_status as enum ('draft', 'pending_review', 'approved', 'rejected', 'withdrawn');
create type public.payment_status as enum ('pending', 'approved', 'rejected');

-- ---------- Tables ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) <= 60),
  role public.app_role not null default 'reader',
  suspended boolean not null default false,
  email_verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.premium_packages (
  months int primary key check (months in (1, 3, 6, 12)),
  price_usd numeric(6, 2) not null check (price_usd > 0)
);
insert into public.premium_packages (months, price_usd) values (1, 9), (3, 25), (6, 49), (12, 96);

create table public.entitlements (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  source public.premium_source not null,
  starts_at timestamptz not null,
  ends_at timestamptz,                 -- NULL = permanent
  revoked_at timestamptz,
  reference text,
  created_at timestamptz not null default now(),
  constraint entitlement_window check (ends_at is null or ends_at > starts_at)
);
create index entitlements_user_idx on public.entitlements (user_id);
-- Exactly one designated permanent administrator account may exist.
create unique index entitlements_one_designated_admin
  on public.entitlements (source) where source = 'admin_permanent';

create table public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  package_months int not null references public.premium_packages(months),
  order_reference text not null check (char_length(order_reference) between 4 and 100),
  status public.payment_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
-- One Ko-fi order can never be claimed twice.
create unique index payment_order_reference_unique on public.payment_submissions (lower(order_reference));

create table public.promo_counters (
  key text primary key,
  granted int not null default 0 check (granted >= 0),
  cap int not null check (cap > 0)
);
insert into public.promo_counters (key, cap) values ('first100', 100);

create table public.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target text not null,
  reason text,
  created_at timestamptz not null default now()
);

create table public.books (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 200),
  synopsis text check (char_length(synopsis) <= 5000),
  status public.book_status not null default 'draft',
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  position int not null check (position > 0),
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) <= 200000),
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (book_id, position)
);

create table public.main_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.chat_daily_quota (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  used int not null default 0 check (used >= 0),
  extra_allowance int not null default 0 check (extra_allowance >= 0),
  primary key (user_id, day)
);

create table public.chapter_comments (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('chat_message', 'chapter_comment')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 3 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

-- ---------- Helper functions (defined before policies that use them) ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and not p.suspended
  );
$$;

-- Raises unless the caller is a signed-in, verified, non-suspended member.
create or replace function public.assert_verified_member()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  p public.profiles%rowtype;
begin
  if v_user is null then raise exception 'auth_required' using errcode = '42501'; end if;
  select * into p from public.profiles where id = v_user;
  if not found then raise exception 'profile_missing'; end if;
  if p.suspended then raise exception 'account_suspended' using errcode = '42501'; end if;
  if p.email_verified_at is null then raise exception 'email_not_verified' using errcode = '42501'; end if;
  return v_user;
end $$;

-- Own-status check for the signed-in user (no argument: users cannot query others).
create or replace function public.has_premium()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = auth.uid()
      and e.revoked_at is null
      and e.starts_at <= now()
      and (e.ends_at is null or e.ends_at > now())
  );
$$;

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.premium_packages enable row level security;
alter table public.entitlements enable row level security;
alter table public.payment_submissions enable row level security;
alter table public.promo_counters enable row level security;
alter table public.admin_audit enable row level security;
alter table public.books enable row level security;
alter table public.chapters enable row level security;
alter table public.main_chat_messages enable row level security;
alter table public.chat_daily_quota enable row level security;
alter table public.chapter_comments enable row level security;
alter table public.content_reports enable row level security;

create policy profiles_public_read on public.profiles for select using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

create policy packages_public_read on public.premium_packages for select using (true);

create policy entitlements_read_own on public.entitlements for select to authenticated
  using (auth.uid() = user_id);

create policy payments_read_own_or_admin on public.payment_submissions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy audit_admin_read on public.admin_audit for select to authenticated
  using (public.is_admin());

create policy books_read on public.books for select
  using (status = 'approved' or author_id = auth.uid() or public.is_admin());
create policy books_author_insert on public.books for insert to authenticated
  with check (author_id = auth.uid());
create policy books_author_update on public.books for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy chapters_owner_read on public.chapters for select to authenticated
  using (exists (select 1 from public.books b
                 where b.id = chapters.book_id and (b.author_id = auth.uid() or public.is_admin())));
create policy chapters_owner_insert on public.chapters for insert to authenticated
  with check (exists (select 1 from public.books b
                      where b.id = chapters.book_id and b.author_id = auth.uid()));
create policy chapters_owner_update on public.chapters for update to authenticated
  using (exists (select 1 from public.books b
                 where b.id = chapters.book_id and b.author_id = auth.uid()))
  with check (exists (select 1 from public.books b
                      where b.id = chapters.book_id and b.author_id = auth.uid()));
-- No delete policy on chapters: deletion is not permitted until D-018 is decided.

create policy main_chat_read on public.main_chat_messages for select using (not hidden);
create policy comments_read on public.chapter_comments for select to authenticated using (not hidden);
create policy reports_read_own_or_admin on public.content_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

-- promo_counters and chat_daily_quota: no client policies at all (functions only).

-- ---------- Privileged-field guard on profiles ----------
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql as $$
begin
  if (new.role is distinct from old.role
      or new.suspended is distinct from old.suspended
      or new.email_verified_at is distinct from old.email_verified_at)
     and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'privileged profile fields can only be changed by trusted server code';
  end if;
  return new;
end $$;
create trigger trg_guard_profile before update on public.profiles
  for each row execute function public.guard_profile_privileges();

revoke update on public.profiles from authenticated, anon;
grant update (display_name) on public.profiles to authenticated;

-- ---------- Sign-up and email verification ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- A username is required; sign-up fails if it is missing or invalid.
  insert into public.profiles (id, username, display_name)
  values (new.id, new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'username');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Atomic first-100 allocation. Advisory lock + row lock: concurrent verifications cannot exceed the cap.
create or replace function public.grant_first100(p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_granted int;
  v_cap int;
  v_suspended boolean;
begin
  perform pg_advisory_xact_lock(hashtext('promo_first100'));
  select p.suspended into v_suspended from public.profiles p where p.id = p_user;
  if coalesce(v_suspended, true) then return false; end if;
  if exists (select 1 from public.entitlements e where e.user_id = p_user and e.source = 'promo_first100') then
    return false;
  end if;
  select granted, cap into v_granted, v_cap from public.promo_counters where key = 'first100' for update;
  if v_granted >= v_cap then return false; end if;
  insert into public.entitlements (user_id, source, starts_at, ends_at, reference)
  values (p_user, 'promo_first100', now(), now() + interval '1 month', 'first100');
  update public.promo_counters set granted = granted + 1 where key = 'first100';
  return true;
end $$;

-- Eligibility starts at email verification (decision recorded in spec).
create or replace function public.on_email_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.profiles set email_verified_at = new.email_confirmed_at where id = new.id;
    perform public.grant_first100(new.id);
  end if;
  return new;
end $$;
create trigger trg_email_confirmed after update of email_confirmed_at on auth.users
  for each row execute function public.on_email_confirmed();

-- ---------- Publishing guards ----------
create or replace function public.guard_book_changes()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() then
      new.status := 'draft';
      new.review_reason := null;
    end if;
    return new;
  end if;

  -- Trusted server code (SECURITY DEFINER functions run as postgres) and admins may change anything.
  if current_user in ('postgres', 'supabase_admin', 'service_role') or public.is_admin() then
    return new;
  end if;

  if new.author_id is distinct from old.author_id then
    raise exception 'author cannot be changed';
  end if;
  if new.review_reason is distinct from old.review_reason then
    raise exception 'review reason is set by administrators';
  end if;
  if new.status is distinct from old.status then
    if not (
      (old.status in ('draft', 'rejected') and new.status = 'pending_review')
      or (new.status = 'withdrawn' and old.status in ('draft', 'pending_review', 'approved', 'rejected'))
    ) then
      raise exception 'status change not permitted';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_guard_book before insert or update on public.books
  for each row execute function public.guard_book_changes();

create or replace function public.guard_chapter_publish()
returns trigger language plpgsql as $$
declare
  v_status public.book_status;
begin
  if new.published then
    select b.status into v_status from public.books b where b.id = new.book_id;
    if v_status is distinct from 'approved' then
      raise exception 'book must be approved before its chapters can be published';
    end if;
    if tg_op = 'INSERT' then
      new.published_at := now();
    elsif not old.published then
      new.published_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_chapter before insert or update on public.chapters
  for each row execute function public.guard_chapter_publish();

-- ---------- Reading access (server-side guest cap) ----------
-- Guests: first 3 PUBLISHED chapters per approved book. Registered + verified members: all published chapters.
-- Author and admins: everything. Suspended accounts: nothing.
create or replace function public.get_chapter(p_chapter uuid)
returns table (chapter_id uuid, book_id uuid, chapter_position int, chapter_title text, chapter_body text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  c public.chapters%rowtype;
  b public.books%rowtype;
  v_suspended boolean := false;
  v_verified boolean := false;
  v_rank int;
begin
  select * into c from public.chapters where id = p_chapter;
  if not found then return; end if;
  select * into b from public.books where id = c.book_id;

  if v_user is not null and (v_user = b.author_id or public.is_admin()) then
    return query select c.id, c.book_id, c.position, c.title, c.body;
    return;
  end if;

  if b.status <> 'approved' or not c.published then return; end if;

  if v_user is not null then
    select coalesce(p.suspended, false), coalesce(p.email_verified_at is not null, false)
      into v_suspended, v_verified
      from public.profiles p where p.id = v_user;
    if v_suspended then return; end if;
  end if;

  if not v_verified then
    select count(*) into v_rank from public.chapters x
      where x.book_id = c.book_id and x.published and x.position <= c.position;
    if v_rank > 3 then return; end if;
  end if;

  return query select c.id, c.book_id, c.position, c.title, c.body;
end $$;

-- Chapter list for a book. Bodies are never included.
create or replace function public.book_chapter_index(p_book uuid)
returns table (chapter_id uuid, chapter_position int, chapter_title text, in_guest_preview boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  b public.books%rowtype;
begin
  select * into b from public.books where id = p_book;
  if not found then return; end if;

  if v_user is not null and (v_user = b.author_id or public.is_admin()) then
    return query select c.id, c.position, c.title, c.published
      from public.chapters c where c.book_id = p_book order by c.position;
    return;
  end if;

  if b.status <> 'approved' then return; end if;

  return query
    select x.id, x.position, x.title, x.rn <= 3
    from (
      select c.id, c.position, c.title, row_number() over (order by c.position) as rn
      from public.chapters c
      where c.book_id = p_book and c.published
    ) x
    order by x.position;
end $$;

-- ---------- Main community chat (10 messages per member per UTC day) ----------
create or replace function public.post_main_chat(p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.assert_verified_member();
  v_day date := (now() at time zone 'UTC')::date;
  v_body text := btrim(coalesce(p_body, ''));
  v_used int;
  v_allow int;
  v_id uuid;
begin
  if char_length(v_body) not between 1 and 1000 then raise exception 'message_length_invalid'; end if;

  insert into public.chat_daily_quota (user_id, day) values (v_user, v_day) on conflict do nothing;
  select q.used, q.extra_allowance into v_used, v_allow
    from public.chat_daily_quota q where q.user_id = v_user and q.day = v_day for update;

  if v_used >= 10 + v_allow then raise exception 'daily_chat_limit_reached'; end if;

  update public.chat_daily_quota q set used = q.used + 1 where q.user_id = v_user and q.day = v_day;
  insert into public.main_chat_messages (user_id, body) values (v_user, v_body) returning id into v_id;
  return v_id;
end $$;

-- ---------- Chapter comments (registered + verified; visible to registered members only, pending D-016) ----------
create or replace function public.post_chapter_comment(p_chapter uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.assert_verified_member();
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if char_length(v_body) not between 1 and 2000 then raise exception 'comment_length_invalid'; end if;
  if not exists (select 1 from public.get_chapter(p_chapter)) then raise exception 'chapter_not_available'; end if;
  insert into public.chapter_comments (chapter_id, user_id, body) values (p_chapter, v_user, v_body)
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.report_content(p_type text, p_target uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.assert_verified_member();
  v_id uuid;
begin
  if p_type not in ('chat_message', 'chapter_comment') then raise exception 'unknown_target_type'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 1000 then raise exception 'reason_required'; end if;
  insert into public.content_reports (reporter_id, target_type, target_id, reason)
  values (v_user, p_type, p_target, btrim(p_reason)) returning id into v_id;
  return v_id;
end $$;

-- ---------- Premium: manual Ko-fi verification ----------
-- Member submits their Ko-fi order reference. Nothing is granted here.
create or replace function public.submit_payment(p_website_username text, p_months int, p_order_reference text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.assert_verified_member();
  v_name citext;
  v_id uuid;
begin
  select pr.username into v_name from public.profiles pr where pr.id = v_user;
  if v_name <> btrim(coalesce(p_website_username, ''))::citext then raise exception 'username_mismatch'; end if;
  if not exists (select 1 from public.premium_packages where months = p_months) then
    raise exception 'unknown_package';
  end if;
  if char_length(btrim(coalesce(p_order_reference, ''))) not between 4 and 100 then
    raise exception 'order_reference_invalid';
  end if;
  insert into public.payment_submissions (user_id, package_months, order_reference)
  values (v_user, p_months, btrim(p_order_reference))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'order_reference_already_submitted';
end $$;

-- Admin verifies the Ko-fi order and approves or rejects. Approval adds time to the END of any existing paid period.
create or replace function public.review_payment(p_payment uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  pay public.payment_submissions%rowtype;
  v_start timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'reason_required'; end if;

  select * into pay from public.payment_submissions where id = p_payment for update;
  if not found then raise exception 'not_found'; end if;
  if pay.status <> 'pending' then raise exception 'already_reviewed'; end if;

  if p_approve then
    select greatest(now(), (
      select max(e.ends_at) from public.entitlements e
      where e.user_id = pay.user_id and e.source = 'paid' and e.revoked_at is null
    )) into v_start;

    insert into public.entitlements (user_id, source, starts_at, ends_at, reference)
    values (pay.user_id, 'paid', v_start, v_start + make_interval(months => pay.package_months), pay.id::text);

    update public.payment_submissions
      set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_note = btrim(p_note)
      where id = p_payment;
    insert into public.admin_audit (actor_id, action, target, reason)
      values (auth.uid(), 'approve_payment', p_payment::text, btrim(p_note));
  else
    update public.payment_submissions
      set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = btrim(p_note)
      where id = p_payment;
    insert into public.admin_audit (actor_id, action, target, reason)
      values (auth.uid(), 'reject_payment', p_payment::text, btrim(p_note));
  end if;
end $$;

-- ---------- Admin: Premium grants ----------
create or replace function public.admin_grant_premium(p_user uuid, p_reason text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'user_not_found'; end if;

  insert into public.entitlements (user_id, source, starts_at, ends_at, reference)
  values (p_user, 'admin_grant', now(), null, btrim(p_reason))
  returning id into v_id;

  insert into public.admin_audit (actor_id, action, target, reason)
  values (auth.uid(), 'grant_premium', p_user::text, btrim(p_reason));
  return v_id;
end $$;

create or replace function public.admin_revoke_entitlement(p_entitlement bigint, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  e public.entitlements%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;

  select * into e from public.entitlements where id = p_entitlement for update;
  if not found then raise exception 'not_found'; end if;
  if e.source = 'admin_permanent' then raise exception 'designated_admin_entitlement_is_protected'; end if;
  if e.revoked_at is not null then return; end if;

  update public.entitlements set revoked_at = now() where id = p_entitlement;
  insert into public.admin_audit (actor_id, action, target, reason)
  values (auth.uid(), 'revoke_entitlement', p_entitlement::text, btrim(p_reason));
end $$;

-- ---------- Admin: publishing review ----------
create or replace function public.review_book(p_book uuid, p_approve boolean, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not p_approve and char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;

  update public.books
    set status = case when p_approve then 'approved'::public.book_status else 'rejected'::public.book_status end,
        review_reason = case when p_approve then null else btrim(p_reason) end,
        updated_at = now()
    where id = p_book;
  if not found then raise exception 'not_found'; end if;

  insert into public.admin_audit (actor_id, action, target, reason)
  values (auth.uid(), case when p_approve then 'approve_book' else 'reject_book' end, p_book::text, btrim(coalesce(p_reason, 'approved')));
end $$;

-- ---------- Admin: moderation ----------
create or replace function public.admin_set_hidden(p_type text, p_target uuid, p_hidden boolean, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;

  if p_type = 'chat_message' then
    update public.main_chat_messages set hidden = p_hidden where id = p_target;
  elsif p_type = 'chapter_comment' then
    update public.chapter_comments set hidden = p_hidden where id = p_target;
  else
    raise exception 'unknown_target_type';
  end if;
  if not found then raise exception 'not_found'; end if;

  insert into public.admin_audit (actor_id, action, target, reason)
  values (auth.uid(), case when p_hidden then 'hide_content' else 'unhide_content' end,
          p_type || ':' || p_target::text, btrim(p_reason));
end $$;

create or replace function public.admin_review_report(p_report uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('resolved', 'dismissed') then raise exception 'invalid_status'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;

  update public.content_reports set status = p_status where id = p_report;
  if not found then raise exception 'not_found'; end if;

  insert into public.admin_audit (actor_id, action, target, reason)
  values (auth.uid(), 'review_report', p_report::text, btrim(p_reason));
end $$;

-- ---------- Append-only audit: clients can never write ----------
-- (Admin functions above write audit rows from trusted SECURITY DEFINER context.)

-- ---------- Privileges: deny by default, then grant only what the website needs ----------
revoke all on all functions in schema public from public;

revoke insert, update, delete on public.entitlements, public.payment_submissions, public.admin_audit,
  public.promo_counters, public.chat_daily_quota, public.main_chat_messages, public.chapter_comments,
  public.content_reports from anon, authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.get_chapter(uuid) to anon, authenticated;
grant execute on function public.book_chapter_index(uuid) to anon, authenticated;
grant execute on function public.has_premium() to authenticated;
grant execute on function public.post_main_chat(text) to authenticated;
grant execute on function public.post_chapter_comment(uuid, text) to authenticated;
grant execute on function public.report_content(text, uuid, text) to authenticated;
grant execute on function public.submit_payment(text, int, text) to authenticated;
grant execute on function public.review_payment(uuid, boolean, text) to authenticated;
grant execute on function public.review_book(uuid, boolean, text) to authenticated;
grant execute on function public.admin_grant_premium(uuid, text) to authenticated;
grant execute on function public.admin_revoke_entitlement(bigint, text) to authenticated;
grant execute on function public.admin_set_hidden(text, uuid, boolean, text) to authenticated;
grant execute on function public.admin_review_report(uuid, text, text) to authenticated;
