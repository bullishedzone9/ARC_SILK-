-- MESH-X revenue allocation engine (staged only; not applied to Supabase).
-- This migration adds a single-use, service-role-only allocation operation.
-- It allocates only against cleared customer/buyer receipts net of cleared refunds,
-- chargebacks, and fees. It never converts points into an unfunded cash promise.

create table if not exists public.mesh_distribution_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.mesh_campaigns(id) on delete restrict,
  currency text not null check (currency in ('NGN','USD','USDT','USDC')),
  gross_receipts numeric(20,8) not null check (gross_receipts >= 0),
  deductions numeric(20,8) not null check (deductions >= 0),
  contributor_pool numeric(20,8) not null check (contributor_pool >= 0),
  total_eligible_points numeric(30,0) not null check (total_eligible_points > 0),
  allocation_count integer not null default 0 check (allocation_count >= 0),
  status text not null default 'allocated' check (status in ('allocated','reversed')),
  created_at timestamptz not null default now()
);

alter table public.mesh_distribution_runs enable row level security;
revoke all on public.mesh_distribution_runs from anon, authenticated;
grant select on public.mesh_distribution_runs to service_role;

create schema if not exists mesh_private;
revoke all on schema mesh_private from public, anon, authenticated;
grant usage on schema mesh_private to service_role;

create or replace function mesh_private.allocate_campaign_rewards(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, mesh_private
as $$
declare
  v_campaign public.mesh_campaigns%rowtype;
  v_currency text;
  v_gross numeric(20,8);
  v_deductions numeric(20,8);
  v_net numeric(20,8);
  v_pool numeric(20,8);
  v_points numeric(30,0);
  v_count integer;
  v_run_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  select * into v_campaign
  from public.mesh_campaigns
  where id = p_campaign_id
  for update;

  if not found then
    raise exception 'campaign_not_found' using errcode = 'P0002';
  end if;

  if v_campaign.status not in ('closed','active') then
    raise exception 'campaign_not_ready_for_distribution' using errcode = '55000';
  end if;

  if exists (
    select 1 from public.mesh_distribution_runs
    where campaign_id = p_campaign_id and status = 'allocated'
  ) then
    raise exception 'campaign_already_distributed' using errcode = '23505';
  end if;

  select currency into v_currency
  from public.mesh_revenue_events
  where campaign_id = p_campaign_id and status = 'cleared'
  group by currency
  order by currency
  limit 1;

  if v_currency is null then
    raise exception 'no_cleared_revenue' using errcode = '55000';
  end if;

  if exists (
    select 1 from public.mesh_revenue_events
    where campaign_id = p_campaign_id and status = 'cleared' and currency <> v_currency
  ) then
    raise exception 'mixed_currency_campaign_not_supported' using errcode = '22023';
  end if;

  select
    coalesce(sum(amount) filter (where source_type in ('customer_payment','buyer_settlement')),0),
    coalesce(sum(amount) filter (where source_type in ('refund','chargeback','fee')),0)
  into v_gross, v_deductions
  from public.mesh_revenue_events
  where campaign_id = p_campaign_id
    and status = 'cleared'
    and currency = v_currency;

  v_net := greatest(v_gross - v_deductions, 0);
  v_pool := round(v_net * v_campaign.contributor_share_bps / 10000.0, 8);

  select coalesce(sum(points_awarded),0)
  into v_points
  from public.mesh_contributions
  where campaign_id = p_campaign_id and status = 'accepted' and points_awarded > 0;

  if v_net <= 0 or v_pool <= 0 then
    raise exception 'no_funded_contributor_pool' using errcode = '55000';
  end if;

  if v_points <= 0 then
    raise exception 'no_eligible_contributions' using errcode = '55000';
  end if;

  insert into public.mesh_distribution_runs
    (campaign_id,currency,gross_receipts,deductions,contributor_pool,total_eligible_points,status)
  values
    (p_campaign_id,v_currency,v_gross,v_deductions,v_pool,v_points,'allocated')
  returning id into v_run_id;

  with user_points as (
    select contributor_user_id, sum(points_awarded)::numeric(30,0) as points
    from public.mesh_contributions
    where campaign_id = p_campaign_id and status = 'accepted' and points_awarded > 0
    group by contributor_user_id
  ),
  shares as (
    select contributor_user_id,
      round(v_pool * points / v_points, 8) as reward_amount
    from user_points
  )
  insert into public.mesh_reward_allocations
    (campaign_id,user_id,currency,amount,status,source_revenue_event_id,idempotency_key)
  select p_campaign_id, contributor_user_id, v_currency, reward_amount, 'available',
    (select id from public.mesh_revenue_events
     where campaign_id = p_campaign_id and status = 'cleared'
       and source_type in ('customer_payment','buyer_settlement')
     order by cleared_at nulls last, created_at
     limit 1),
    'mesh-distribution:' || v_run_id::text || ':' || contributor_user_id::text
  from shares
  where reward_amount > 0
  on conflict (idempotency_key) do nothing;

  get diagnostics v_count = row_count;

  update public.mesh_distribution_runs
  set allocation_count = v_count
  where id = v_run_id;

  return jsonb_build_object(
    'status','allocated',
    'campaign_id',p_campaign_id,
    'distribution_run_id',v_run_id,
    'currency',v_currency,
    'gross_receipts',v_gross,
    'deductions',v_deductions,
    'net_cleared_revenue',v_net,
    'contributor_pool',v_pool,
    'eligible_points',v_points,
    'allocations_created',v_count
  );
end;
$$;

revoke all on function mesh_private.allocate_campaign_rewards(uuid) from public, anon, authenticated;
grant execute on function mesh_private.allocate_campaign_rewards(uuid) to service_role;
