-- MESH-X 5D Signal Network foundation.
-- Staged in GitHub only. Not applied to any Supabase database.
-- Proactive/passive resource discovery is intentionally out of scope.

create table if not exists public.mesh_resources (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  resource_domain text not null check (resource_domain in ('physical','economic','human')),
  resource_type text not null check (char_length(btrim(resource_type)) between 2 and 100),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  description text not null default '' check (char_length(description) <= 10000),
  availability_status text not null default 'available'
    check (availability_status in ('available','temporarily_unavailable','reserved','in_negotiation','completed','verification_pending')),
  listing_scope text not null default 'network'
    check (listing_scope in ('private','network','public')),
  city text,
  region text,
  country_code text,
  remote_available boolean not null default false,
  available_until timestamptz,
  verification_status text not null default 'self_declared'
    check (verification_status in ('self_declared','pending','verified','rejected')),
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (city is null or char_length(city) <= 120),
  check (region is null or char_length(region) <= 120),
  check (country_code is null or country_code ~ '^[A-Z]{2}$')
);

create table if not exists public.mesh_signals (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  intent_type text not null check (intent_type in ('request','offer')),
  description text not null check (char_length(btrim(description)) between 8 and 5000),
  structured_intent jsonb not null default '{}'::jsonb,
  resource_domain text check (resource_domain is null or resource_domain in ('physical','economic','human')),
  resource_type text,
  connection_mode text not null default 'either'
    check (connection_mode in ('physical','remote','either')),
  distribution_scope text not null
    check (distribution_scope in ('radius','neighbourhood','city','region','country','selected_countries','worldwide','specific_users','remote')),
  radius_km integer check (radius_km is null or radius_km in (5,25,100)),
  city text,
  region text,
  country_code text,
  destination_user_ids uuid[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft','open','paused','fulfilled','expired','closed')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  check ((distribution_scope = 'radius' and radius_km is not null) or distribution_scope <> 'radius')
);

create table if not exists public.mesh_signal_matches (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null references public.mesh_signals(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  provider_user_id uuid not null references auth.users(id) on delete restrict,
  resource_id uuid references public.mesh_resources(id) on delete set null,
  compatibility_score numeric(5,2) check (compatibility_score is null or compatibility_score between 0 and 100),
  match_reasons jsonb not null default '[]'::jsonb,
  safe_signal_preview jsonb not null default '{}'::jsonb,
  status text not null default 'detected'
    check (status in ('detected','notified','viewed','dismissed','expired','connected')),
  created_at timestamptz not null default now(),
  unique (signal_id, provider_user_id),
  check (requester_user_id <> provider_user_id)
);

create table if not exists public.mesh_connection_requests (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null references public.mesh_signals(id) on delete restrict,
  match_id uuid references public.mesh_signal_matches(id) on delete set null,
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  provider_user_id uuid not null references auth.users(id) on delete restrict,
  resource_id uuid references public.mesh_resources(id) on delete set null,
  opening_message text not null default '' check (char_length(opening_message) <= 2000),
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled','expired')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (signal_id, provider_user_id),
  check (requester_user_id <> provider_user_id)
);

create table if not exists public.mesh_conversations (
  id uuid primary key default gen_random_uuid(),
  connection_request_id uuid not null unique references public.mesh_connection_requests(id) on delete restrict,
  signal_id uuid not null references public.mesh_signals(id) on delete restrict,
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  provider_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active','closed','reported')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (requester_user_id <> provider_user_id)
);

create table if not exists public.mesh_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.mesh_conversations(id) on delete restrict,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  attachment_metadata jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mesh_resources_domain_availability_idx
  on public.mesh_resources(resource_domain, availability_status, country_code, city);
create index if not exists mesh_resources_owner_updated_idx
  on public.mesh_resources(owner_user_id, updated_at desc);
create index if not exists mesh_signals_status_created_idx
  on public.mesh_signals(status, created_at desc);
create index if not exists mesh_signals_requester_created_idx
  on public.mesh_signals(requester_user_id, created_at desc);
create index if not exists mesh_signal_matches_provider_status_idx
  on public.mesh_signal_matches(provider_user_id, status, created_at desc);
create index if not exists mesh_signal_matches_requester_idx
  on public.mesh_signal_matches(requester_user_id, created_at desc);
create index if not exists mesh_connection_requests_provider_status_idx
  on public.mesh_connection_requests(provider_user_id, status, created_at desc);
create index if not exists mesh_connection_requests_requester_idx
  on public.mesh_connection_requests(requester_user_id, created_at desc);
create index if not exists mesh_messages_conversation_created_idx
  on public.mesh_messages(conversation_id, created_at);

alter table public.mesh_resources enable row level security;
alter table public.mesh_signals enable row level security;
alter table public.mesh_signal_matches enable row level security;
alter table public.mesh_connection_requests enable row level security;
alter table public.mesh_conversations enable row level security;
alter table public.mesh_messages enable row level security;

-- Resource owners can manage their own resources. Public/network discovery exposes
-- only explicitly shared resources; private resources remain owner-only.
create policy "mesh_resources_read_shared_or_owned"
on public.mesh_resources for select to authenticated
using (
  owner_user_id = (select auth.uid())
  or (listing_scope in ('network','public') and availability_status = 'available')
);

create policy "mesh_resources_insert_own"
on public.mesh_resources for insert to authenticated
with check (owner_user_id = (select auth.uid()));

create policy "mesh_resources_update_own"
on public.mesh_resources for update to authenticated
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

-- Signals are private to their creator. Providers receive a privacy-filtered
-- preview through their own match record, not direct access to the full signal.
create policy "mesh_signals_read_own"
on public.mesh_signals for select to authenticated
using (requester_user_id = (select auth.uid()));

create policy "mesh_signals_insert_own"
on public.mesh_signals for insert to authenticated
with check (requester_user_id = (select auth.uid()));

create policy "mesh_signals_update_own"
on public.mesh_signals for update to authenticated
using (requester_user_id = (select auth.uid()))
with check (requester_user_id = (select auth.uid()));

create policy "mesh_signal_matches_read_participant"
on public.mesh_signal_matches for select to authenticated
using (
  provider_user_id = (select auth.uid())
  or requester_user_id = (select auth.uid())
);

-- Connection requests are readable only by the two participants.
-- Creation and state transitions are reserved for authenticated server endpoints.
create policy "mesh_connection_requests_read_participant"
on public.mesh_connection_requests for select to authenticated
using (
  requester_user_id = (select auth.uid())
  or provider_user_id = (select auth.uid())
);

create policy "mesh_conversations_read_participant"
on public.mesh_conversations for select to authenticated
using (
  requester_user_id = (select auth.uid())
  or provider_user_id = (select auth.uid())
);

create policy "mesh_messages_read_conversation_participant"
on public.mesh_messages for select to authenticated
using (
  exists (
    select 1
    from public.mesh_conversations c
    where c.id = conversation_id
      and (c.requester_user_id = (select auth.uid())
        or c.provider_user_id = (select auth.uid()))
  )
);

create policy "mesh_messages_send_as_conversation_participant"
on public.mesh_messages for insert to authenticated
with check (
  sender_user_id = (select auth.uid())
  and exists (
    select 1
    from public.mesh_conversations c
    where c.id = conversation_id
      and c.status = 'active'
      and (c.requester_user_id = (select auth.uid())
        or c.provider_user_id = (select auth.uid()))
  )
);

-- No client write policies for match generation, connection-request decisions,
-- conversation creation, verification, or revenue/accounting records.
-- These operations must be performed by authenticated server endpoints.
