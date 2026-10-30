import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: cors });
const required = (v: unknown, max = 5000) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST required" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json(500, { error: "Server configuration incomplete" });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token || token === authHeader) return json(401, { error: "Authentication required" });

  const authClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json(401, { error: "Invalid session" });
  const actor = authData.user.id;
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const body = await req.json();
    const action = body?.action;

    if (action === "interpret_signal") {
      if (!required(body.description, 5000) || body.description.trim().length < 8) {
        return json(400, { error: "Describe the request or offer in at least 8 characters." });
      }
      const text = body.description.trim();
      const lower = text.toLowerCase();
      const intent = /\b(i need|looking for|seeking|want to find|require|need a)\b/.test(lower) ? "request"
        : /\b(i have|available|offering|i provide|for hire|for sale)\b/.test(lower) ? "offer" : null;
      const domain = /\b(skill|developer|engineer|designer|mechanic|teacher|consultant|professional|expert)\b/.test(lower) ? "human"
        : /\b(capacity|warehouse|transport|logistics|business|production|manufacturing|storage)\b/.test(lower) ? "economic"
        : /\b(machine|equipment|vehicle|material|food|farm|land|tool|generator|solar|building)\b/.test(lower) ? "physical" : null;
      const mode = /\b(remote|online|virtually|work from home)\b/.test(lower) ? "remote"
        : /\b(meet|near me|nearby|physical|in person)\b/.test(lower) ? "physical" : "either";
      return json(200, { interpretation: { intent_type: intent, resource_domain: domain, description: text, connection_mode: mode, needs_review: true }, limitations: "Rule-based draft only. Confirm or correct every field; this is not an LLM-generated interpretation." });
    }

    if (action === "create_resource") {
      if (!required(body.resource_type, 100) || !required(body.title, 140)) return json(400, { error: "Resource type and title are required." });
      const row = {
        owner_user_id: actor, resource_domain: body.resource_domain,
        resource_type: body.resource_type.trim(), title: body.title.trim(),
        description: typeof body.description === "string" ? body.description.slice(0, 10000) : "",
        availability_status: body.availability_status || "available",
        listing_scope: body.listing_scope || "network",
        city: typeof body.city === "string" ? body.city.slice(0,120) : null,
        region: typeof body.region === "string" ? body.region.slice(0,120) : null,
        country_code: typeof body.country_code === "string" ? body.country_code.toUpperCase() : null,
        remote_available: body.remote_available === true,
        attributes: body.attributes && typeof body.attributes === "object" && !Array.isArray(body.attributes) ? body.attributes : {},
      };
      const { data, error } = await db.from("mesh_resources").insert(row).select("id,resource_domain,resource_type,title,availability_status,listing_scope,city,region,country_code,created_at").single();
      if (error) return json(400, { error: error.message });
      return json(201, { resource: data });
    }

    if (action === "update_resource_status") {
      if (!required(body.resource_id, 80) || !["available","temporarily_unavailable","reserved","in_negotiation","completed","verification_pending"].includes(body.availability_status)) return json(400, { error: "Invalid resource or status." });
      const { data, error } = await db.from("mesh_resources").update({ availability_status: body.availability_status, updated_at: new Date().toISOString() }).eq("id", body.resource_id).eq("owner_user_id", actor).select("id,availability_status").single();
      if (error) return json(404, { error: "Resource not found or not owned by this account." });
      return json(200, { resource: data });
    }

    if (action === "create_signal") {
      if (body.approved !== true) return json(400, { error: "Review and explicitly approve the interpreted signal first." });
      if (!required(body.description, 5000) || body.description.trim().length < 8) return json(400, { error: "A clear description is required." });
      if (!["request","offer"].includes(body.intent_type) || !["radius","neighbourhood","city","region","country","selected_countries","worldwide","specific_users","remote"].includes(body.distribution_scope)) return json(400, { error: "Invalid intent or distribution scope." });
      const radius = body.distribution_scope === "radius" ? body.radius_km : null;
      if (body.distribution_scope === "radius" && ![5,25,100].includes(radius)) return json(400, { error: "Radius must be 5, 25 or 100 km." });
      const row = {
        requester_user_id: actor, intent_type: body.intent_type, description: body.description.trim(),
        structured_intent: body.structured_intent && typeof body.structured_intent === "object" ? body.structured_intent : {},
        resource_domain: ["physical","economic","human"].includes(body.resource_domain) ? body.resource_domain : null,
        resource_type: required(body.resource_type,100) ? body.resource_type.trim() : null,
        connection_mode: ["physical","remote","either"].includes(body.connection_mode) ? body.connection_mode : "either",
        distribution_scope: body.distribution_scope, radius_km: radius,
        city: typeof body.city === "string" ? body.city.slice(0,120) : null,
        region: typeof body.region === "string" ? body.region.slice(0,120) : null,
        country_code: typeof body.country_code === "string" ? body.country_code.toUpperCase() : null,
        destination_user_ids: body.distribution_scope === "specific_users" && Array.isArray(body.destination_user_ids) ? body.destination_user_ids.slice(0,50) : [],
        status: "open", expires_at: new Date(Date.now() + 7*86400000).toISOString(),
      };
      const { data, error } = await db.from("mesh_signals").insert(row).select("id,intent_type,description,distribution_scope,city,region,status,expires_at").single();
      if (error) return json(400, { error: error.message });
      return json(201, { signal: data });
    }

    if (action === "route_signal") {
      if (!required(body.signal_id,80)) return json(400,{error:"signal_id required"});
      const { data: signal, error: se } = await db.from("mesh_signals").select("*").eq("id",body.signal_id).eq("requester_user_id",actor).eq("status","open").single();
      if (se || !signal) return json(404,{error:"Open signal not found for this requester."});
      if (signal.expires_at && new Date(signal.expires_at).getTime() < Date.now()) return json(410,{error:"Signal expired."});
      let query = db.from("mesh_resources").select("id,owner_user_id,resource_domain,resource_type,title,description,city,region,country_code,remote_available,verification_status").eq("availability_status","available").in("listing_scope",["network","public"]).neq("owner_user_id",actor).limit(250);
      if (signal.resource_domain) query = query.eq("resource_domain",signal.resource_domain);
      if (signal.resource_type) query = query.ilike("resource_type",`%${signal.resource_type.replace(/[%_]/g,"").slice(0,80)}%`);
      if (signal.distribution_scope === "city" || signal.distribution_scope === "radius" || signal.distribution_scope === "neighbourhood") {
        if (signal.city) query = query.ilike("city",signal.city);
      } else if (signal.distribution_scope === "region" && signal.region) query = query.ilike("region",signal.region);
      else if (signal.distribution_scope === "country" && signal.country_code) query = query.eq("country_code",signal.country_code);
      if (signal.connection_mode === "remote") query = query.eq("remote_available",true);
      const { data: resources, error: re } = await query;
      if (re) return json(500,{error:"Resource matching query failed."});
      const matches = [];
      for (const resource of (resources || [])) {
        if (signal.distribution_scope === "specific_users" && !signal.destination_user_ids.includes(resource.owner_user_id)) continue;
        const score = (signal.resource_type && resource.resource_type.toLowerCase().includes(signal.resource_type.toLowerCase()) ? 70 : 45) + (resource.city && signal.city && resource.city.toLowerCase()===signal.city.toLowerCase()?20:0) + (resource.verification_status==="verified"?10:0);
        const preview = { intent_type:signal.intent_type, description:signal.description, resource_domain:signal.resource_domain, resource_type:signal.resource_type, city:signal.city, region:signal.region, connection_mode:signal.connection_mode };
        const { data: match, error: me } = await db.from("mesh_signal_matches").upsert({
          signal_id:signal.id, requester_user_id:actor, provider_user_id:resource.owner_user_id, resource_id:resource.id,
          compatibility_score:Math.min(score,100), match_reasons:[resource.city && signal.city && resource.city.toLowerCase()===signal.city.toLowerCase()?"Same city":"Resource category match",resource.verification_status==="verified"?"Resource marked verified":"Provider claim not independently verified"],safe_signal_preview:preview,status:"notified"
        },{onConflict:"signal_id,provider_user_id"}).select("id,provider_user_id,resource_id,compatibility_score,match_reasons").single();
        if (!me && match) matches.push(match);
      }
      return json(200,{signal_id:signal.id,match_count:matches.length,matches,notice:"Basic deterministic matching only; no push notifications are configured yet."});
    }

    if (action === "request_connection") {
      if (!required(body.match_id,80)) return json(400,{error:"match_id required"});
      const { data: match, error: me } = await db.from("mesh_signal_matches").select("id,signal_id,requester_user_id,provider_user_id,resource_id").eq("id",body.match_id).eq("provider_user_id",actor).single();
      if (me || !match) return json(404,{error:"No matching provider opportunity for this account."});
      const { data, error } = await db.from("mesh_connection_requests").insert({
        signal_id:match.signal_id,match_id:match.id,requester_user_id:match.requester_user_id,provider_user_id:actor,resource_id:match.resource_id,
        opening_message:required(body.opening_message,2000)?body.opening_message.trim():""
      }).select("id,status,signal_id,requester_user_id,provider_user_id,created_at").single();
      if (error) return json(409,{error:"A connection request may already exist, or the request could not be created."});
      return json(201,{connection_request:data,notice:"The requester must accept before private chat opens."});
    }

    if (action === "respond_connection") {
      if (!required(body.connection_request_id,80) || !["accepted","declined"].includes(body.decision)) return json(400,{error:"Valid request id and accept/decline decision required."});
      const { data: cr, error: ce } = await db.from("mesh_connection_requests").select("*").eq("id",body.connection_request_id).eq("requester_user_id",actor).eq("status","pending").single();
      if (ce || !cr) return json(404,{error:"Pending connection request not found for this requester."});
      const { data: changed, error: ue } = await db.from("mesh_connection_requests").update({status:body.decision,responded_at:new Date().toISOString()}).eq("id",cr.id).eq("status","pending").select("id").single();
      if (ue || !changed) return json(409,{error:"Connection request already handled."});
      if (body.decision === "declined") return json(200,{status:"declined"});
      const { data: convo, error: coe } = await db.from("mesh_conversations").insert({
        connection_request_id:cr.id,signal_id:cr.signal_id,requester_user_id:cr.requester_user_id,provider_user_id:cr.provider_user_id,status:"active"
      }).select("id,connection_request_id,status,created_at").single();
      if (coe) return json(500,{error:"Accepted request recorded, but conversation creation failed. Retry support required."});
      return json(200,{status:"accepted",conversation:convo});
    }

    if (action === "send_message") {
      if (!required(body.conversation_id,80) || !required(body.body,10000)) return json(400,{error:"Conversation and message body required."});
      const { data: conversation, error: ve } = await db.from("mesh_conversations").select("id,status,requester_user_id,provider_user_id").eq("id",body.conversation_id).single();
      if (ve || !conversation || conversation.status!=="active" || ![conversation.requester_user_id,conversation.provider_user_id].includes(actor)) return json(403,{error:"Active conversation access denied."});
      const { data, error } = await db.from("mesh_messages").insert({conversation_id:conversation.id,sender_user_id:actor,body:body.body.trim().slice(0,10000)}).select("id,conversation_id,sender_user_id,body,created_at").single();
      if (error) return json(400,{error:"Message could not be sent."});
      return json(201,{message:data});
    }

    if (action === "list_my_connections") {
      const { data, error } = await db.from("mesh_connection_requests").select("id,signal_id,requester_user_id,provider_user_id,opening_message,status,created_at,responded_at").or(`requester_user_id.eq.${actor},provider_user_id.eq.${actor}`).order("created_at",{ascending:false}).limit(100);
      if (error) return json(500,{error:"Could not load connection requests."});
      return json(200,{connections:data});
    }

    if (action === "list_my_matches") {
      const { data, error } = await db.from("mesh_signal_matches").select("id,signal_id,resource_id,compatibility_score,match_reasons,safe_signal_preview,status,created_at").eq("provider_user_id",actor).order("created_at",{ascending:false}).limit(100);
      if (error) return json(500,{error:"Could not load matches."});
      return json(200,{matches:data});
    }

    if (action === "list_messages") {
      if (!required(body.conversation_id,80)) return json(400,{error:"conversation_id required"});
      const { data: c } = await db.from("mesh_conversations").select("id,requester_user_id,provider_user_id,status").eq("id",body.conversation_id).single();
      if (!c || ![c.requester_user_id,c.provider_user_id].includes(actor)) return json(403,{error:"Conversation access denied."});
      const { data, error } = await db.from("mesh_messages").select("id,sender_user_id,body,created_at").eq("conversation_id",c.id).order("created_at").limit(200);
      if (error) return json(500,{error:"Could not load messages."});
      return json(200,{messages:data});
    }

    return json(400,{error:"Unknown action."});
  } catch (_error) {
    return json(400,{error:"Invalid request payload."});
  }
});
