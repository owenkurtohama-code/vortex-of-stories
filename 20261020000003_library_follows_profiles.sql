-- =====================================================================
-- Vortex of Stories - Phase 1: reading library, progress, author follows,
-- author profiles, and support links (PayPal, Ko-fi, Patreon).
-- Requires 20261020000001_core.sql and 20261020000002_coins_provisional.sql.
-- Apply once, in order.
-- =====================================================================

-- ---------- Profile bio ----------
alter table public.profiles add column if not exists bio text;
alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles add constraint profiles_bio_length check (char_length(bio) <= 1000);
revoke update on public.profiles from authenticated;
grant update (display_name, bio) on public.profiles to authenticated;

-- ---------- Types and tables ----------
create type public.shelf_kind as enum ('favorite', 'reading', 'finished');

create table public.library_entries (
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  shelf public.shelf_kind not null,
  added_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create table public.reading_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create table public.author_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, author_id),
  constraint author_follow_not_self check (follower_id <> author_id)
);

create table public.author_support_links (
  author_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  url text not null,
  primary key (author_id, provider),
  constraint support_provider_known check (provider in ('paypal', 'kofi', 'patreon')),
  constraint support_url_https check (url ~* '^https://'),
  constraint support_url_length check (char_length(url) <= 300),
  constraint support_url_host check (
       (provider = 'paypal'  and url ~* '^https://(www\.)?(paypal\.me|paypal\.com)/')
    or (provider = 'kofi'    and url ~* '^https://(www\.)?ko-fi\.com/')
    or (provider = 'patreon' and url ~* '^https://(www\.)?patreon\.com/')
  )
);

-- ---------- Row Level Security ----------
alter table public.library_entries enable row level security;
alter table public.reading_progress enable row level security;
alter table public.author_follows enable row level security;
alter table public.author_support_links enable row level security;

create policy library_read_own on public.library_entries for select to authenticated
  using (user_id = auth.uid());
create policy progress_read_own on public.reading_progress for select to authenticated
  using (user_id = auth.uid());
create policy follows_read_own on public.author_follows for select to authenticated
  using (follower_id = auth.uid());
create policy support_public_read on public.author_support_links for select
  using (true);

revoke insert, update, delete on public.library_entries, public.reading_progress,
  public.author_follows, public.author_support_links from anon, authenticated;

-- ---------- Library ----------
create or replace function public.set_library_shelf(p_book uuid, p_shelf text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.assert_verified_member();
begin
  if p_shelf not in ('favorite', 'reading', 'finished') then raise exception 'invalid_shelf'; end if;
  if not exists (select 1 from public.books b where b.id = p_book and b.status = 'approved') then
    raise exception 'book_not_available';
  end if;
  insert into public.library_entries (user_id, book_id, shelf)
  values (v_user, p_book, p_shelf::public.shelf_kind)
  on conflict (user_id, book_id) do update
    set shelf = excluded.shelf, added_at = now();
end $$;

create or replace function public.remove_library_entry(p_book uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.assert_verified_member();
begin
  delete from public.library_entries where user_id = v_user and book_id = p_book;
end $$;

-- ---------- Reading progress (uses the same access rules as reading) ----------
create or replace function public.save_reading_progress(p_chapter uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.assert_verified_member();
  v_book uuid;
begin
  select g.book_id into v_book from public.get_chapter(p_chapter) g limit 1;
  if v_book is null then raise exception 'chapter_not_available'; end if;

  insert into public.reading_progress (user_id, book_id, chapter_id)
  values (v_user, v_book, p_chapter)
  on conflict (user_id, book_id) do update
    set chapter_id = excluded.chapter_id, updated_at = now();
end $$;

-- ---------- Author follows ----------
create or replace function public.follow_author(p_author uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.assert_verified_member();
begin
  if p_author = v_user then raise exception 'cannot_follow_self'; end if;
  if not exists (select 1 from public.books b where b.author_id = p_author and b.status = 'approved') then
    raise exception 'author_not_found';
  end if;
  insert into public.author_follows (follower_id, author_id) values (v_user, p_author)
  on conflict do nothing;
end $$;

create or replace function public.unfollow_author(p_author uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.assert_verified_member();
begin
  delete from public.author_follows where follower_id = v_user and author_id = p_author;
end $$;

-- ---------- Support links (authors with at least one approved book) ----------
create or replace function public.set_support_link(p_provider text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.assert_verified_member();
begin
  if not exists (select 1 from public.books b where b.author_id = v_user and b.status = 'approved') then
    raise exception 'author_only';
  end if;
  if p_provider not in ('paypal', 'kofi', 'patreon') then raise exception 'invalid_provider'; end if;

  begin
    insert into public.author_support_links (author_id, provider, url)
    values (v_user, p_provider, btrim(p_url))
    on conflict (author_id, provider) do update set url = excluded.url;
  exception when check_violation then
    raise exception 'support_link_invalid';
  end;
end $$;

create or replace function public.remove_support_link(p_provider text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.assert_verified_member();
begin
  delete from public.author_support_links where author_id = v_user and provider = p_provider;
end $$;

-- ---------- Public author profile (no email, no suspension details) ----------
create or replace function public.get_author_profile(p_username text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles%rowtype;
  v_books jsonb;
  v_links jsonb;
  v_followers int;
  v_following boolean := false;
begin
  select * into p from public.profiles where username = btrim(p_username)::citext;
  if not found or p.suspended then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'synopsis', b.synopsis)
                  order by b.created_at desc), '[]'::jsonb)
    into v_books
    from public.books b where b.author_id = p.id and b.status = 'approved';

  select coalesce(jsonb_agg(jsonb_build_object('provider', l.provider, 'url', l.url) order by l.provider), '[]'::jsonb)
    into v_links
    from public.author_support_links l where l.author_id = p.id;

  select count(*)::int into v_followers from public.author_follows f where f.author_id = p.id;

  if auth.uid() is not null then
    select exists (select 1 from public.author_follows f
                   where f.author_id = p.id and f.follower_id = auth.uid())
      into v_following;
  end if;

  return jsonb_build_object(
    'username', p.username,
    'display_name', p.display_name,
    'bio', p.bio,
    'followers', v_followers,
    'you_follow', v_following,
    'books', v_books,
    'support_links', v_links
  );
end $$;

-- ---------- Locking down the new functions ----------
revoke all on function public.set_library_shelf(uuid, text) from public;
revoke all on function public.remove_library_entry(uuid) from public;
revoke all on function public.save_reading_progress(uuid) from public;
revoke all on function public.follow_author(uuid) from public;
revoke all on function public.unfollow_author(uuid) from public;
revoke all on function public.set_support_link(text, text) from public;
revoke all on function public.remove_support_link(text) from public;
revoke all on function public.get_author_profile(text) from public;

grant execute on function public.set_library_shelf(uuid, text) to authenticated;
grant execute on function public.remove_library_entry(uuid) to authenticated;
grant execute on function public.save_reading_progress(uuid) to authenticated;
grant execute on function public.follow_author(uuid) to authenticated;
grant execute on function public.unfollow_author(uuid) to authenticated;
grant execute on function public.set_support_link(text, text) to authenticated;
grant execute on function public.remove_support_link(text) to authenticated;
grant execute on function public.get_author_profile(text) to anon, authenticated;
