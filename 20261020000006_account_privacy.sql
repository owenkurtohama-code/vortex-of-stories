-- =====================================================================
-- Vortex of Stories - Phase 1: account settings, deletion, and data export.
-- Requires migrations 1 to 5. Apply once, in order.
--
-- Deletion is deliberately blocked for accounts that hold content or purchase history.
-- Those rules are PROVISIONAL until the owner decides retention (spec section 9).
-- =====================================================================

create or replace function public.delete_my_account(p_confirm text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'auth_required' using errcode = '42501'; end if;
  if p_confirm is distinct from 'DELETE' then raise exception 'confirmation_required'; end if;

  if exists (select 1 from public.entitlements e where e.user_id = v_user and e.source = 'admin_permanent') then
    raise exception 'designated_admin_cannot_delete';
  end if;
  if exists (select 1 from public.books b where b.author_id = v_user) then
    raise exception 'account_has_books';
  end if;
  if exists (select 1 from public.entitlements e
             where e.user_id = v_user and e.source in ('paid', 'coin_purchase')) then
    raise exception 'account_has_purchases';
  end if;
  if exists (select 1 from public.coin_ledger l where l.user_id = v_user) then
    raise exception 'account_has_coin_history';
  end if;

  -- Cascades to profile, library, progress, follows, chat messages and comments.
  delete from auth.users where id = v_user;
end $$;

-- Everything the signed-in member is entitled to receive, as one JSON document.
create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := public.assert_verified_member();
begin
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) - 'suspended' from public.profiles p where p.id = v_user),
    'entitlements', coalesce((select jsonb_agg(to_jsonb(e) order by e.starts_at)
                              from public.entitlements e where e.user_id = v_user), '[]'::jsonb),
    'payment_submissions', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                              from public.payment_submissions x where x.user_id = v_user), '[]'::jsonb),
    'library', coalesce((select jsonb_agg(to_jsonb(l)) from public.library_entries l where l.user_id = v_user), '[]'::jsonb),
    'reading_progress', coalesce((select jsonb_agg(to_jsonb(r)) from public.reading_progress r where r.user_id = v_user), '[]'::jsonb),
    'follows', coalesce((select jsonb_agg(to_jsonb(f)) from public.author_follows f where f.follower_id = v_user), '[]'::jsonb),
    'main_chat_messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at)
                              from public.main_chat_messages m where m.user_id = v_user), '[]'::jsonb),
    'book_chat_messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at)
                              from public.book_chat_messages m where m.user_id = v_user), '[]'::jsonb),
    'chapter_comments', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at)
                              from public.chapter_comments c where c.user_id = v_user), '[]'::jsonb),
    'reports_filed', coalesce((select jsonb_agg(to_jsonb(r)) from public.content_reports r where r.reporter_id = v_user), '[]'::jsonb),
    'coin_ledger', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at) from public.coin_ledger l where l.user_id = v_user), '[]'::jsonb),
    'books', coalesce((select jsonb_agg(jsonb_build_object(
                'title', b.title, 'synopsis', b.synopsis, 'status', b.status,
                'chapters', coalesce((select jsonb_agg(jsonb_build_object(
                    'position', c.position, 'title', c.title, 'body', c.body, 'published', c.published)
                    order by c.position) from public.chapters c where c.book_id = b.id), '[]'::jsonb)
              ) order by b.created_at)
              from public.books b where b.author_id = v_user), '[]'::jsonb)
  );
end $$;

revoke all on function public.delete_my_account(text) from public;
revoke all on function public.export_my_data() from public;
grant execute on function public.delete_my_account(text) to authenticated;
grant execute on function public.export_my_data() to authenticated;
