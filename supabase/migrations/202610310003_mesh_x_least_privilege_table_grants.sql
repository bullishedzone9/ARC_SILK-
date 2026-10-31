-- Restrict browser roles to the minimum required table access.
-- Writes and connection workflows are performed by mesh-x-api using service_role.
REVOKE ALL PRIVILEGES ON TABLE
  public.mesh_signals,
  public.mesh_resources,
  public.mesh_signal_matches,
  public.mesh_connection_requests,
  public.mesh_conversations,
  public.mesh_messages
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.mesh_signals,
  public.mesh_resources,
  public.mesh_signal_matches,
  public.mesh_connection_requests,
  public.mesh_conversations,
  public.mesh_messages
TO authenticated;

GRANT ALL PRIVILEGES ON TABLE
  public.mesh_signals,
  public.mesh_resources,
  public.mesh_signal_matches,
  public.mesh_connection_requests,
  public.mesh_conversations,
  public.mesh_messages
TO service_role;
