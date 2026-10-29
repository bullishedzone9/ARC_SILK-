import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(401, { error: "authentication_required" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Required Supabase function environment variables are missing.");
    return json(500, { error: "server_configuration_error" });
  }

  try {
    const token = authHeader.slice("Bearer ".length);
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return json(401, { error: "invalid_session" });

    let body: { is_public?: unknown };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "invalid_json" });
    }
    if (typeof body.is_public !== "boolean") {
      return json(400, { error: "is_public_boolean_required" });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("user_id, username, display_name, is_public, is_seller")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile lookup failed:", profileError.message);
      return json(500, { error: "profile_lookup_failed" });
    }
    if (!profile) return json(404, { error: "profile_not_found" });

    if (body.is_public) {
      // This function writes with the service-role client, so database triggers that
      // depend on auth.uid() cannot be the only eligibility check.
      if (!profile.is_seller) {
        return json(403, { error: "seller_activation_required" });
      }

      const { count: qualifyingCount, error: countError } = await admin
        .from("marketplace_listings")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", authData.user.id)
        .in("status", ["submitted", "active"]);

      if (countError) {
        console.error("Qualifying listing count failed:", countError.message);
        return json(500, { error: "listing_check_failed" });
      }
      if ((qualifyingCount ?? 0) < 5) {
        return json(422, {
          error: "seller_requirements_not_met",
          qualifying_listings: qualifyingCount ?? 0,
          required_listings: 5,
          remaining: 5 - (qualifyingCount ?? 0),
        });
      }

      const username = (profile.username ?? "").trim();
      const displayName = (profile.display_name ?? "").trim();
      if (username.length < 3 || displayName.length < 2) {
        return json(422, {
          error: "profile_incomplete",
          required_fields: ["username (at least 3 characters)", "display_name (at least 2 characters)"],
        });
      }
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
        return json(422, { error: "invalid_username_format" });
      }
    }

    const { error: updateError } = await admin
      .from("profiles")
      .update({ is_public: body.is_public })
      .eq("user_id", authData.user.id);

    if (updateError) {
      if (updateError.code === "23505") return json(409, { error: "username_already_taken" });
      console.error("Profile visibility update failed:", updateError.message);
      return json(500, { error: "visibility_update_failed" });
    }

    const { data: verified, error: verifyError } = await admin
      .from("profiles")
      .select("is_public")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (verifyError || !verified || verified.is_public !== body.is_public) {
      console.error("Profile visibility verification failed:", verifyError?.message);
      return json(500, { error: "visibility_update_unverified" });
    }

    return json(200, {
      ok: true,
      is_public: verified.is_public,
      message: verified.is_public ? "Profile is now public." : "Profile is private.",
    });
  } catch (error) {
    console.error("Unexpected profile visibility error:", error);
    return json(500, { error: "internal_error" });
  }
});