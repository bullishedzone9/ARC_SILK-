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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

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
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    const user = userData.user;
    if (userError || !user) {
      return json(401, { error: "invalid_session" });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("user_id, is_seller")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile lookup failed:", profileError.message);
      return json(500, { error: "profile_lookup_failed" });
    }
    if (!profile) {
      return json(404, { error: "profile_not_found" });
    }
    if (profile.is_seller) {
      return json(200, { ok: true, already_active: true, submitted_listings_required: 5 });
    }

    const { count, error: countError } = await admin
      .from("marketplace_listings")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", user.id)
      .eq("status", "submitted");

    if (countError) {
      console.error("Submitted listing count failed:", countError.message);
      return json(500, { error: "listing_check_failed" });
    }
    const submittedCount = count ?? 0;
    if (submittedCount < 5) {
      return json(422, {
        error: "seller_requirements_not_met",
        submitted_listings: submittedCount,
        required_submitted_listings: 5,
        remaining: 5 - submittedCount,
      });
    }

    const { error: updateError } = await admin
      .from("profiles")
      .update({ is_seller: true })
      .eq("user_id", user.id)
      .eq("is_seller", false);

    if (updateError) {
      console.error("Seller activation failed:", updateError.message);
      return json(500, { error: "seller_activation_failed" });
    }

    const { data: updatedProfile, error: verifyError } = await admin
      .from("profiles")
      .select("is_seller")
      .eq("user_id", user.id)
      .maybeSingle();

    if (verifyError || !updatedProfile?.is_seller) {
      console.error("Seller activation verification failed:", verifyError?.message);
      return json(500, { error: "seller_activation_unverified" });
    }

    return json(200, {
      ok: true,
      seller_active: true,
      submitted_listings: submittedCount,
      required_submitted_listings: 5,
    });
  } catch (error) {
    console.error("Unexpected seller activation error:", error);
    return json(500, { error: "internal_error" });
  }
});