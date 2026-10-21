-- =====================================================================
-- Vortex Coins - PHASE 2, PROVISIONAL.
-- Amounts come from the owner's notes. Items marked PROVISIONAL are not final until
-- the open coin questions in docs/01_MASTER_SPEC.md (section 9) are answered.
-- Riddles, chapter unlocks and profile pictures are deliberately NOT enabled here.
-- Apply after 20261020000001_core.sql.
-- =====================================================================

create table public.coin_rules (
  action text primary key,
  coins int not null check (coins > 0),
  enabled boolean not null default true,
  note text not null
);
insert into public.coin_rules (action, coins, enabled, note) values
  ('daily_login', 2, true, 'PROVISIONAL: qualifying day uses UTC until timezone is confirmed'),
  ('welcome_bonus', 10, true, 'PROVISIONAL: granted once, when email is verified'),
  ('riddle_correct', 4, false, 'Riddles are a later phase; disabled'),
  ('extra_message', 5, true, 'PROVISIONAL: one extra main-chat message for the current UTC day'),
  ('premium_month_purchase_coins', 500, true, 'PROVISIONAL: buys 1 month of Premium'),
  ('unlock_chapter', 30, false, 'DISABLED: conflicts with chapter access rules; see spec section 9'),
  ('profile_picture', 100, false, 'DISABLED: needs storage design');

alter table public.coin_rules enable row level security;
create policy coin_rules_read on public.coin_rules for select using (true);

create table public.coin_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta int not null check (delta <> 0),
  kind text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

alter table public.coin_ledger enable row level security;
create policy coin_ledger_read_own on public.coin_ledger for select to authenticated
  using (user_id = auth.uid());

-- Append-only: no update or delete, even from trusted code.
create or replace function public.forbid_ledger_change()
returns trigger language plpgsql as $$
begin
  raise exception 'coin ledger is append-only';
end $$;
create trigger trg_ledger_append_only before update or delete on public.coin_ledger
  for each row execute function public.forbid_ledger_change();

-- Internal: award once per idempotency key. Returns false if disabled or already awarded.
create or replace function public.award_coins(p_user uuid, p_action text, p_key text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_amount int;
  v_enabled boolean;
begin
  select r.coins, r.enabled into v_amount, v_enabled from public.coin_rules r where r.action = p_action;
  if not found or not v_enabled then return false; end if;

  perform pg_advisory_xact_lock(hashtext(p_user::text));
  insert into public.coin_ledger (user_id, delta, kind, idempotency_key)
  values (p_user, v_amount, p_action, p_key)
  on conflict (user_id, idempotency_key) do nothing;
  return found;
end $$;

-- Redefine the verification trigger to add the welcome bonus (the Premium grant from Phase 1 is unchanged).
create or replace function public.on_email_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.profiles set email_verified_at = new.email_confirmed_at where id = new.id;
    perform public.grant_first100(new.id);
    perform public.award_coins(new.id, 'welcome_bonus', 'welcome');
  end if;
  return new;
end $$;

create or replace function public.coin_balance()
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(l.delta), 0)::int from public.coin_ledger l where l.user_id = auth.uid();
$$;

create or replace function public.claim_daily_login()
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.assert_verified_member();
begin
  return public.award_coins(v_user, 'daily_login', 'daily:' || ((now() at time zone 'UTC')::date)::text);
end $$;

-- Spend with a client-generated request key. Retrying the same key never spends twice.
create or replace function public.spend_coins(p_kind text, p_request_key text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := public.assert_verified_member();
  v_cost int;
  v_enabled boolean;
  v_balance int;
  v_day date := (now() at time zone 'UTC')::date;
  v_start timestamptz;
begin
  if char_length(coalesce(p_request_key, '')) not between 8 and 100 then raise exception 'invalid_request_key'; end if;
  if p_kind not in ('extra_message', 'premium_month_purchase_coins') then raise exception 'unsupported_spend'; end if;

  select r.coins, r.enabled into v_cost, v_enabled from public.coin_rules r where r.action = p_kind;
  if not found or not v_enabled then raise exception 'unsupported_spend'; end if;

  perform pg_advisory_xact_lock(hashtext(v_user::text));
  select coalesce(sum(l.delta), 0) into v_balance from public.coin_ledger l where l.user_id = v_user;

  if exists (select 1 from public.coin_ledger l where l.user_id = v_user and l.idempotency_key = 'spend:' || p_request_key) then
    return v_balance;  -- already applied; return current balance
  end if;
  if v_balance < v_cost then raise exception 'insufficient_coins'; end if;

  insert into public.coin_ledger (user_id, delta, kind, idempotency_key)
  values (v_user, -v_cost, p_kind, 'spend:' || p_request_key);
  v_balance := v_balance - v_cost;

  if p_kind = 'extra_message' then
    insert into public.chat_daily_quota (user_id, day, extra_allowance) values (v_user, v_day, 1)
    on conflict (user_id, day) do update
      set extra_allowance = public.chat_daily_quota.extra_allowance + 1;
  else
    select greatest(now(), (
      select max(e.ends_at) from public.entitlements e
      where e.user_id = v_user and e.source in ('paid', 'coin_purchase') and e.revoked_at is null
    )) into v_start;
    insert into public.entitlements (user_id, source, starts_at, ends_at, reference)
    values (v_user, 'coin_purchase', v_start, v_start + interval '1 month', p_request_key);
  end if;

  return v_balance;
end $$;

revoke all on function public.award_coins(uuid, text, text) from public, anon, authenticated;
revoke all on function public.forbid_ledger_change() from public, anon, authenticated;
grant execute on function public.coin_balance() to authenticated;
grant execute on function public.claim_daily_login() to authenticated;
grant execute on function public.spend_coins(text, text) to authenticated;
revoke insert, update, delete on public.coin_ledger from anon, authenticated;

-- Explicit lockdown: functions created after the global revoke would otherwise be callable by PUBLIC.
revoke all on function public.spend_coins(text, text) from public;
revoke all on function public.claim_daily_login() from public;
revoke all on function public.coin_balance() from public;
revoke all on function public.on_email_confirmed() from public;
