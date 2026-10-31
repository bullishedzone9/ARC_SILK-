-- MESH-X v1 foundation. Staging only; do not apply to production without review.
-- Cash distributions are backed by cleared campaign revenue/settlement, never by points alone.

create table if not exists public.mesh_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 3 and 140),
  description text not null default '' check (char_length(description) <= 10000),
  contribution_type text not null check (contribution_type in ('signal','relay','build')),
  acceptance_criteria jsonb not null default '{}'::jsonb,
  currency text not null check (currency in ('NGN','USD','USDT','USDC')),
  budget_amount numeric(20,8) not null check (budget_amount > 0),
  contributor_share_bps integer not null default 7000 check (contributor_share_bps between 0 and 10000),
  status text not null default 'draft' check (status in ('draft','funding_pending','funded','active','paused','closed','cancelled')),
  funding_status text not null default 'unfunded' check (funding_status in ('unfunded','pending','cleared','partially_refunded','refunded','disputed')),
  cleared_amount numeric(20,8) not null default 0 check (cleared_amount >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cleared_amount <= budget_amount)
);

create table if not exists public.mesh_contributions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.mesh_campaigns(id) on delete restrict,
  contributor_user_id uuid not null references auth.users(id) on delete restrict,
  contribution_type text not null check (contribution_type in ('signal','relay','build')),
  submission_ref text,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'submitted' check (status in ('submitted','under_review','accepted','rejected','disputed','reversed')),
  score integer not null default 0 check (score between 0 and 1000000),
  points_awarded bigint not null default 0 check (points_awarded >= 0),
  reviewer_user_id uuid references auth.users(id) on delete set null,
  review_note text check (review_note is null or char_length(review_note) <= 2000),
  reviewed_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mesh_revenue_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.mesh_campaigns(id) on delete restrict,
  source_type text not null check (source_type in ('customer_payment','buyer_settlement','refund','chargeback','fee','adjustment')),
  currency text not null check (currency in ('NGN','USD','USDT','USDC')),
  amount numeric(20,8) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','cleared','failed','reversed')),
  provider text,
  provider_reference text,
  idempotency_key text not null unique,
  cleared_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create table if not exists public.mesh_point_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  campaign_id uuid references public.mesh_campaigns(id) on delete restrict,
  contribution_id uuid references public.mesh_contributions(id) on delete restrict,
  entry_type text not null check (entry_type in ('award','reversal','allocation','expiry','adjustment')),
  points_delta bigint not null check (points_delta <> 0),
  reason text not null check (char_length(reason) between 2 and 500),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.mesh_reward_allocations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.mesh_campaigns(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  currency text not null check (currency in ('NGN','USD','USDT','USDC')),
  amount numeric(20,8) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','available','payout_pending','paid','failed','reversed','disputed')),
  source_revenue_event_id uuid references public.mesh_revenue_events(id) on delete restrict,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  provider_reference text,
  unique (provider_reference)
);

create table if not exists public.mesh_payout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  allocation_id uuid not null references public.mesh_reward_allocations(id) on delete restrict,
  currency text not null check (currency in ('NGN','USDT','USDC')),
  network text,
  destination_fingerprint text not null,
  amount numeric(20,8) not null check (amount > 0),
  status text not null default 'requested' check (status in ('requested','compliance_review','processing','paid','failed','cancelled')),
  provider text,
  provider_reference text,
  idempotency_key text not null unique,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (provider, provider_reference)
);

create index if not exists mesh_campaigns_status_created_idx on public.mesh_campaigns(status, created_at desc);
create index if not exists mesh_contributions_user_created_idx on public.mesh_contributions(contributor_user_id, created_at desc);
create index if not exists mesh_contributions_campaign_status_idx on public.mesh_contributions(campaign_id, status);
create index if not exists mesh_point_ledger_user_created_idx on public.mesh_point_ledger(user_id, created_at desc);
create index if not exists mesh_allocations_user_status_idx on public.mesh_reward_allocations(user_id, status);
create index if not exists mesh_payout_user_status_idx on public.mesh_payout_requests(user_id, status);

alter table public.mesh_campaigns enable row level security;
alter table public.mesh_contributions enable row level security;
alter table public.mesh_revenue_events enable row level security;
alter table public.mesh_point_ledger enable row level security;
alter table public.mesh_reward_allocations enable row level security;
alter table public.mesh_payout_requests enable row level security;

-- Authenticated users may read published campaign metadata only.
create policy "mesh_campaigns_read_published"
on public.mesh_campaigns for select to authenticated
using (status in ('funded','active','paused','closed'));

-- Users may read only their own contribution records, points, allocations and payout requests.
create policy "mesh_contributions_read_own"
on public.mesh_contributions for select to authenticated
using (contributor_user_id = auth.uid());

create policy "mesh_point_ledger_read_own"
on public.mesh_point_ledger for select to authenticated
using (user_id = auth.uid());

create policy "mesh_allocations_read_own"
on public.mesh_reward_allocations for select to authenticated
using (user_id = auth.uid());

create policy "mesh_payout_requests_read_own"
on public.mesh_payout_requests for select to authenticated
using (user_id = auth.uid());

-- Intentionally no client policies for writes, revenue events, or admin/review actions.
-- Server-side Edge Functions with verified identity and restricted service credentials must perform these actions.
-- Do not expose service-role credentials to the browser or Telegram Mini App.
