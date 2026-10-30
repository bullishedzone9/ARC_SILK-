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


const validGeo = (lat: unknown, lon: unknown) =>
  typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
  typeof lon === "number" && Number.isFinite(lon) && lon >= -180 && lon <= 180;
const distanceKm = (aLat:number,aLon:number,bLat:number,bLon:number) => {
  const rad=(v:number)=>v*Math.PI/180;
  const dLat=rad(bLat-aLat), dLon=rad(bLon-aLon);
  const h=Math.sin(dLat/2)**2+Math.cos(rad(aLat))*Math.cos(rad(bLat))*Math.sin(dLon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
};
const geoAllows = (scope:string, origin:any, target:any) => {
  if (scope==="worldwide" || scope==="remote") return true;
  if (scope==="specific_users") return true;
  if (scope==="city" || scope==="neighbourhood") return !!origin.city && !!target.city && origin.city.toLowerCase()===target.city.toLowerCase();
  if (scope==="region") return !!origin.region && !!target.region && origin.region.toLowerCase()===target.region.toLowerCase();
  if (scope==="country") return !!origin.country_code && origin.country_code===target.country_code;
  if (scope==="selected_countries") return Array.isArray(origin.selected_country_codes) && origin.selected_country_codes.includes(target.country_code);
  if (scope==="radius") return validGeo(origin.latitude,origin.longitude) && validGeo(target.latitude,target.longitude) && distanceKm(origin.latitude,origin.longitude,target.latitude,target.longitude)<=origin.radius_km;
  return false;
};

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
        latitude: validGeo(body.latitude,body.longitude) ? body.latitude : null,
        longitude: validGeo(body.latitude,body.longitude) ? body.longitude : null,
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
        latitude: validGeo(body.latitude,body.longitude) ? body.latitude : null,
        longitude: validGeo(body.latitude,body.longitude) ? body.longitude : null,
        selected_country_codes: Array.isArray(body.selected_country_codes) ? body.selected_country_codes.filter((x:any)=>typeof x==="string" && /^[A-Z]{2}$/.test(x)).slice(0,50) : [],
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
      if (se || !signal) return json(404,{error:"Open signal not found for this account."});
      if (signal.expires_at && new Date(signal.expires_at).getTime() < Date.now()) return json(410,{error:"Signal expired."});
      if (signal.distribution_scope==="radius" && !validGeo(signal.latitude,signal.longitude)) return json(400,{error:"Add a valid latitude and longitude to use radius matching."});
      const matches:any[]=[];
      if (signal.intent_type==="request") {
        let q=db.from("mesh_resources").select("id,owner_user_id,resource_domain,resource_type,title,description,city,region,country_code,latitude,longitude,remote_available,verification_status").eq("availability_status","available").in("listing_scope",["network","public"]).neq("owner_user_id",actor).limit(500);
        if(signal.resource_domain) q=q.eq("resource_domain",signal.resource_domain);
        if(signal.resource_type) q=q.ilike("resource_type",`%${signal.resource_type.replace(/[%_]/g,"").slice(0,80)}%`);
        if(signal.connection_mode==="remote" || signal.distribution_scope==="remote") q=q.eq("remote_available",true);
        const {data:resources,error:re}=await q;
        if(re) return json(500,{error:"Resource matching query failed."});
        for(const resource of resources||[]){
          if(signal.distribution_scope==="specific_users" && !signal.destination_user_ids.includes(resource.owner_user_id)) continue;
          if(!geoAllows(signal.distribution_scope,signal,resource)) continue;
          const typeScore=signal.resource_type && resource.resource_type.toLowerCase().includes(signal.resource_type.toLowerCase())?70:45;
          const locationScore=resource.city&&signal.city&&resource.city.toLowerCase()===signal.city.toLowerCase()?20:0;
          const verified=resource.verification_status==="verified"?10:0;
          const score=Math.min(typeScore+locationScore+verified,100);
          const preview={intent_type:"request",description:signal.description,resource_domain:signal.resource_domain,resource_type:signal.resource_type,city:signal.city,region:signal.region,country_code:signal.country_code,connection_mode:signal.connection_mode};
          const {data:match,error:me}=await db.from("mesh_signal_matches").upsert({
            signal_id:signal.id,requester_user_id:actor,provider_user_id:resource.owner_user_id,resource_id:resource.id,
            compatibility_score:score,match_reasons:[locationScore?"Same city":"Resource category match",verified?"Provider marked verified":"Provider claim not independently verified"],
            safe_signal_preview:preview,status:"notified"
          },{onConflict:"signal_id,provider_user_id"}).select("id,provider_user_id,resource_id,compatibility_score,match_reasons").single();
          if(!me&&match) matches.push(match);
        }
      } else {
        let q=db.from("mesh_signals").select("id,requester_user_id,description,resource_domain,resource_type,connection_mode,distribution_scope,radius_km,city,region,country_code,latitude,longitude,selected_country_codes,destination_user_ids").eq("intent_type","request").eq("status","open").neq("requester_user_id",actor).limit(500);
        if(signal.resource_domain) q=q.eq("resource_domain",signal.resource_domain);
        if(signal.resource_type) q=q.ilike("resource_type",`%${signal.resource_type.replace(/[%_]/g,"").slice(0,80)}%`);
        const {data:requests,error:re}=await q;
        if(re) return json(500,{error:"Request-side matching query failed."});
        for(const request of requests||[]){
          const offerLocation={city:signal.city,region:signal.region,country_code:signal.country_code,latitude:signal.latitude,longitude:signal.longitude};
          if(request.distribution_scope==="specific_users" && !request.destination_user_ids.includes(actor)) continue;
          if(!geoAllows(signal.distribution_scope,signal,request)) continue;
          if(request.distribution_scope==="remote" && signal.connection_mode==="physical") continue;
          if(!geoAllows(request.distribution_scope,request,offerLocation)) continue;
          if(request.connection_mode==="remote" && signal.connection_mode==="physical") continue;
          const typeScore=request.resource_type&&signal.resource_type.toLowerCase().includes(request.resource_type.toLowerCase())?70:45;
          const locationScore=request.city&&signal.city&&request.city.toLowerCase()===signal.city.toLowerCase()?20:0;
          const preview={intent_type:"request",description:request.description,resource_domain:request.resource_domain,resource_type:request.resource_type,city:request.city,region:request.region,country_code:request.country_code,offer:{description:signal.description,resource_type:signal.resource_type,city:signal.city,region:signal.region,country_code:signal.country_code}};
          const {data:match,error:me}=await db.from("mesh_signal_matches").upsert({
            signal_id:request.id,requester_user_id:request.requester_user_id,provider_user_id:actor,resource_id:null,
            compatibility_score:Math.min(typeScore+locationScore,100),
            match_reasons:[locationScore?"Same city":"Resource category match","Offer/request intent pair"],
            safe_signal_preview:preview,status:"notified"
          },{onConflict:"signal_id,provider_user_id"}).select("id,provider_user_id,resource_id,compatibility_score,match_reasons").single();
          if(!me&&match) matches.push(match);
        }
      }
      return json(200,{signal_id:signal.id,intent_type:signal.intent_type,match_count:matches.length,matches,notice:"Request and offer matching enabled. Geographic filtering uses city/region/country or coordinates for radius. No push notifications configured."});
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
      const { data: result, error } = await db.rpc("mesh_x_respond_connection_atomic", {
        p_request_id: body.connection_request_id, p_actor: actor, p_decision: body.decision,
      });
      if (error || !result?.length) return json(409,{error:"Connection request could not be processed."});
      if (body.decision === "declined") return json(200,{status:"declined"});
      return json(200,{status:"accepted",conversation:{id:result[0].conversation_id,status:"active"}});
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
