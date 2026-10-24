import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
function json(status:number,body:Record<string,unknown>){return new Response(JSON.stringify(body),{status,headers:corsHeaders});}
const currencies=new Set(["NGN","USD","GBP","EUR","USDC","BTC"]);
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method !== "POST")return json(405,{error:"method_not_allowed"});
 const authHeader=req.headers.get("Authorization");
 if(!authHeader?.startsWith("Bearer "))return json(401,{error:"authentication_required"});
 const supabaseUrl=Deno.env.get("SUPABASE_URL"),anonKey=Deno.env.get("SUPABASE_ANON_KEY"),serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!supabaseUrl||!anonKey||!serviceRoleKey){console.error("Required function environment variables are missing.");return json(500,{error:"server_configuration_error"});}
 try{
  const token=authHeader.slice("Bearer ".length);
  const userClient=createClient(supabaseUrl,anonKey,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authHeader}}});
  const {data:userData,error:userError}=await userClient.auth.getUser(token),user=userData.user;
  if(userError||!user)return json(401,{error:"invalid_session"});
  let input:unknown;try{input=await req.json();}catch{return json(400,{error:"invalid_json"});}
  if(!input||typeof input!=="object"||!("listing_id" in input)||typeof (input as {listing_id?:unknown}).listing_id!=="string")return json(400,{error:"listing_id_required"});
  const listingId=(input as {listing_id:string}).listing_id;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(listingId))return json(400,{error:"invalid_listing_id"});
  const admin=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:profile,error:profileError}=await admin.from("profiles").select("is_seller,is_public").eq("user_id", user.id).maybeSingle();
  if(profileError){console.error("Seller profile lookup failed:",profileError.message);return json(500,{error:"profile_lookup_failed"});}
  if(!profile||!profile.is_seller||!profile.is_public)return json(403,{error:"public_seller_profile_required"});
  const {data:listing,error:listingError}=await admin.from("marketplace_listings").select("id,seller_id,title,description,listing_type,category,price,currency,preview_url,preview_duration_seconds,status").eq("id", listingId).eq("seller_id", user.id).maybeSingle();
  if(listingError){console.error("Listing lookup failed:",listingError.message);return json(500,{error:"listing_lookup_failed"});}
  if(!listing)return json(404,{error:"owned_listing_not_found"});
  if(listing.status==="active")return json(200,{ok:true,status:"active",already_published:true});
  if(listing.status!=="submitted")return json(409,{error:"only_submitted_listings_can_be_published"});
  if(typeof listing.title!=="string"||listing.title.trim().length<3||listing.title.length>120||typeof listing.category!=="string"||listing.category.trim().length<2||listing.category.length>80||typeof listing.description!=="string"||listing.description.length>5000||!["service","digital_product"].includes(listing.listing_type)||!currencies.has(listing.currency)||(typeof listing.price!=="number"&&typeof listing.price!=="string")||!Number.isFinite(Number(listing.price))||Number(listing.price)<=0)return json(422,{error:"listing_metadata_invalid"});
  if(listing.preview_url!==null){let preview:URL;try{preview=new URL(listing.preview_url);}catch{return json(422,{error:"preview_url_invalid"});}if(preview.protocol!=="https:")return json(422,{error:"preview_url_must_use_https"});if(!Number.isInteger(listing.preview_duration_seconds)||listing.preview_duration_seconds<1||listing.preview_duration_seconds>30)return json(422,{error:"preview_duration_must_be_1_to_30_seconds"});}
  const {data:updated,error:updateError}=await admin.from("marketplace_listings").update({status:"active",updated_at:new Date().toISOString()}).eq("id", listingId).eq("seller_id", user.id).eq("status","submitted").select("id,status").maybeSingle();
  if(updateError){console.error("Listing publication failed:",updateError.message);return json(500,{error:"publication_failed"});}
  if(!updated)return json(409,{error:"listing_state_changed_retry"});
  return json(200,{ok:true,listing_id:updated.id,status:updated.status,manual_listening_review:false});
 }catch(error){console.error("Unexpected listing publication error:",error);return json(500,{error:"internal_error"});}
});
