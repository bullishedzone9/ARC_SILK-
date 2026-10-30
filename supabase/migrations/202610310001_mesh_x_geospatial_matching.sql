-- MESH-X geospatial matching fields. Applied to ARC-SILK project.
alter table public.mesh_resources
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;
alter table public.mesh_signals
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists selected_country_codes text[] not null default '{}';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='mesh_resources_latitude_range') then
    alter table public.mesh_resources add constraint mesh_resources_latitude_range check (latitude is null or latitude between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname='mesh_resources_longitude_range') then
    alter table public.mesh_resources add constraint mesh_resources_longitude_range check (longitude is null or longitude between -180 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname='mesh_signals_latitude_range') then
    alter table public.mesh_signals add constraint mesh_signals_latitude_range check (latitude is null or latitude between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname='mesh_signals_longitude_range') then
    alter table public.mesh_signals add constraint mesh_signals_longitude_range check (longitude is null or longitude between -180 and 180);
  end if;
end $$;