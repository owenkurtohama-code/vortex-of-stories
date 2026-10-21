-- =====================================================================
-- Vortex of Stories - Phase 1: book-specific chat, configurable limits,
-- and moderation for book chat.
-- Requires migrations 1 to 3. Apply once, in order.
-- =====================================================================

-- ---------- Configurable limits (values are changeable by the owner through SQL) ----------
create table public.app_settings (
  key text primary key,
  value int not null check (value >= 0),
  note text not null
);
alter table public.app_settings enable row level security;   -- no client policies: server functions only

insert into public.app_settings (key, value, note) values
  ('main_chat_daily_limit', 10, 'Confirmed: 10 main-chat messages per member per UTC day'),
  ('book_chat_daily_limit', 30, 'PROVISIONAL placeholder: owner has not decided the book-chat limit');

-- ---------- Book chat ----------
create table public.book_chat_messages (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index book_chat_book_idx on public.book_chat_messages (book_id, created_at desc);

create table public.book_chat_daily_quota (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  used int not null default 0 check (used >= 0),
  primary key (user_id, day)
);

alter table public.book_chat_messages enable row level security;
alter table public.book_chat_daily_quota enable row level security;

-- Readable by guests only while the book is approved and the message is not hidden.
create policy book_chat_read on public.book_chat_messages for select
  using (not hidden and exists (
    select 1 from public.books b where b.id = book_chat_messages.book_id and b.status = 'approved'));

revoke insert, update, delete on public.book_chat_messages, public.book_chat_daily_quota from anon, authenticated;

create or replace function public.post_book_chat(p_book uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.assert_verified_member();
  v_day date := (now() at time zone 'UTC')::date;
  v_body text := btrim(coalesce(p_body, ''));
  v_limit int;
  v_used int;
  v_id uuid;
begin
  if char_length(v_body) not between 1 and 1000 then raise exception 'message_length_invalid'; end if;
  if not exists (select 1 from public.books b where b.id = p_book and b.status = 'approved') then
    raise exception 'book_not_available';
  end if;

  select s.value into v_limit from public.app_settings s where s.key = 'book_chat_daily_limit';

  insert into public.book_chat_daily_quota (user_id, day) values (v_user, v_day) on conflict do nothing;
  select q.used into v_used from public.book_chat_daily_quota q
    where q.user_id = v_user and q.day = v_day for update;

  if v_used >= coalesce(v_limit, 30) then raise exception 'daily_book_chat_limit_reached'; end if;

  update public.book_chat_daily_quota q set used = q.used + 1 where q.user_id = v_user and q.day = v_day;
  insert into public.book_chat_messages (book_id, user_id, body) values (p_book, v_user, v_body)
    returning id into v_id;
  return v_id;
end $$;

-- ---------- Main chat: now reads its limit from app_settings (same behaviour, configurable) ----------
create or replace function public.post_main_chat(p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.assert_verified_member();
  v_day date := (now() at time zone 'UTC')::date;
  v_body text := btrim(coalesce(p_body, ''));
  v_limit int;
  v_used int;
  v_allow int;
  v_id uuid;
begin
  if char_length(v_body) not between 1 and 1000 then raise exception 'message_length_invalid'; end if;

  select s.value into v_limit from public.app_settings s where s.key = 'main_chat_daily_limit';

  insert into public.chat_daily_quota (user_id, day) values (v_user, v_day) on conflict do nothing;
  select q.used, q.extra_allowance into v_used, v_allow
    from public.chat_daily_quota q where q.user_id = v_user and q.day = v_day for update;

  if v_used >= coalesce(v_limit, 10) + v_allow then raise exception 'daily_chat_limit_reached'; end if;

  update public.chat_daily_quota q set used = q.used + 1 where q.user_id = v_user and q.day = v_day;
  insert into public.main_chat_messages (user_id, body) values (v_user, v_body) returning id into v_id;
  return v_id;
end $$;

-- ---------- Reports and moderation now cover book chat ----------
alter table public.content_reports drop constraint if exists content_reports_target_type_check;
alter table public.content_reports add constraint content_reports_target_type_check
  check (target_type in ('chat_message', 'chapter_comment', 'book_chat_message'));

create or replace function public.report_content(p_type text, p_target uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.assert_verified_member();
  v_id uuid;
begin
  if p_type not in ('chat_message', 'chapter_comment', 'book_chat_message') then
    raise exception 'unknown_target_type';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 1000 then raise exception 'reason_required'; end if;
  insert into public.content_reports (reporter_id, target_type, target_id, reason)
  values (v_user, p_type, p_target, btrim(p_reason)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_set_hidden(p_type text, p_target uuid, p_hidden boolean, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;

  if p_type = 'chat_message' then
    update public.main_chat_messages set hidden = p_hidden where id = p_target;
  elsif p_type = 'chapter_comment' then
    update public.chapter_comments set hidden = p_hidden where id = p_target;
  elsif p_type = 'book_chat_message' then
    update public.book_chat_messages set hidden = p_hidden where id = p_target;
  else
    raise exception 'unknown_target_type';
  end if;
  if not found then raise exception 'not_found'; end if;

  insert into public.admin_audit (actor_id, action, target, reason)
  values (auth.uid(), case when p_hidden then 'hide_content' else 'unhide_content' end,
          p_type || ':' || p_target::text, btrim(p_reason));
end $$;

-- ---------- Grants ----------
revoke all on function public.post_book_chat(uuid, text) from public;
revoke all on function public.post_main_chat(text) from public;
revoke all on function public.report_content(text, uuid, text) from public;
revoke all on function public.admin_set_hidden(text, uuid, boolean, text) from public;
grant execute on function public.post_book_chat(uuid, text) to authenticated;
grant execute on function public.post_main_chat(text) to authenticated;
grant execute on function public.report_content(text, uuid, text) to authenticated;
grant execute on function public.admin_set_hidden(text, uuid, boolean, text) to authenticated;
