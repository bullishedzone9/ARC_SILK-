-- MESH-X query-path indexes for foreign-key joins and participant lookups.
create index if not exists mesh_connection_requests_match_id_idx on public.mesh_connection_requests(match_id);
create index if not exists mesh_connection_requests_resource_id_idx on public.mesh_connection_requests(resource_id);
create index if not exists mesh_conversations_requester_user_id_idx on public.mesh_conversations(requester_user_id);
create index if not exists mesh_conversations_provider_user_id_idx on public.mesh_conversations(provider_user_id);
create index if not exists mesh_conversations_signal_id_idx on public.mesh_conversations(signal_id);
create index if not exists mesh_messages_sender_user_id_idx on public.mesh_messages(sender_user_id);
create index if not exists mesh_signal_matches_resource_id_idx on public.mesh_signal_matches(resource_id);
