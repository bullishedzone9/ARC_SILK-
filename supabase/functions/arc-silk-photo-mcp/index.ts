import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { pipeline } from "npm:@supabase/middleware@1";
import { withOAuthProtectedResource, withSupabase } from "npm:@supabase/server@1";
import { negotiateProtocolVersion, formatUploadOutcome } from "./helpers.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, mcp-session-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const tools = [
  { name: "list_photos", description: "List photos in the authenticated user's private ARC_SILK library. Returns short-lived signed image URLs.", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50 }, offset: { type: "integer", minimum: 0 } } } },
  { name: "search_photos", description: "Search the authenticated user's photo names, captions, and category labels.", inputSchema: { type: "object", properties: { query: { type: "string", maxLength: 120 }, limit: { type: "integer", minimum: 1, maximum: 50 } }, required: ["query"] } },
  { name: "update_photo_metadata", description: "Set a category label and/or caption for one of the user's photos.", inputSchema: { type: "object", properties: { path: { type: "string", minLength: 1, maxLength: 500 }, category: { type: "string", maxLength: 80 }, caption: { type: "string", maxLength: 500 } }, required: ["path"] } },
  { name: "delete_photo", description: "Permanently delete one photo and its metadata from the user's private library. Use only when explicitly requested.", inputSchema: { type: "object", properties: { path: { type: "string", minLength: 1, maxLength: 500 } }, required: ["path"] } },
  { name: "upload_photo", description: "Upload one image into the user's private library using base64-encoded image bytes. Maximum 10 MB.", inputSchema: { type: "object", properties: { filename: { type: "string", minLength: 1, maxLength: 150 }, content_type: { type: "string", enum: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"] }, base64_data: { type: "string", minLength: 1 }, category: { type: "string", maxLength: 80 }, caption: { type: "string", maxLength: 500 } }, required: ["filename", "content_type", "base64_data"] } }
];

function jsonrpc(id: unknown, result: unknown, status = 200) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result }), { status, headers: cors });
}
function errorResponse(id: unknown, code: number, message: string) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }), { status: 200, headers: cors });
}
function toolResult(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value, isError: false };
}
function safeFilename(name: string) {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "photo";
}

async function listAllFiles(supabase: any, userId: string) {
  const all: any[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage.from("arc-silk-photos").list(userId, {
      limit: pageSize,
      offset,
      sortBy: { column: "created_at", order: "desc" }
    });
    if (error) throw new Error("Could not read the complete private photo list.");
    const page = data ?? [];
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

function decodeBase64(value: string): Uint8Array {
  const raw = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.serve(pipeline([withOAuthProtectedResource(), withSupabase({ auth: "user" })], async (req: Request, ctx: object) => {\n  const { supabase } = ctx as { supabase: any };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Use POST for MCP JSON-RPC requests." }), { status: 405, headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Sign-in required." }), { status: 401, headers: cors });
  const token = auth.slice(7);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) return new Response(JSON.stringify({ error: "Server configuration missing." }), { status: 500, headers: cors });

  // Verify the user explicitly; all data operations use the RLS-scoped client from withSupabase.
  const authClient = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) return new Response(JSON.stringify({ error: "Invalid or expired session." }), { status: 401, headers: cors });

  let body: any;
  try { body = await req.json(); } catch { return errorResponse(null, -32700, "Parse error"); }
  const id = body?.id ?? null;
  if (body?.jsonrpc !== "2.0" || typeof body?.method !== "string") return errorResponse(id, -32600, "Invalid Request");

  if (body.method === "initialize") {
    const requestedVersion = body.params?.protocolVersion;
    const negotiated = negotiateProtocolVersion(requestedVersion);
    if (!negotiated) return errorResponse(id, -32602, "Invalid params: params.protocolVersion must be a string.");
    return jsonrpc(id, { protocolVersion: negotiated.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "arc-silk-photo-library", version: "0.1.1" } });
  }
  if (body.method === "notifications/initialized" || body.method === "ping") return jsonrpc(id, {});
  if (body.method === "tools/list") return jsonrpc(id, { tools });

  if (body.method !== "tools/call") return errorResponse(id, -32601, "Method not found");
  const name = body.params?.name;
  const args = body.params?.arguments ?? {};
  if (!tools.some(t => t.name === name)) return errorResponse(id, -32602, "Unknown tool");

  try {
    if (name === "list_photos") {
      const limit = Math.min(50, Math.max(1, Math.floor(Number(args.limit ?? 20) || 20)));
      const offset = Math.max(0, Math.floor(Number(args.offset ?? 0) || 0));
      const { data, error } = await supabase.storage.from("arc-silk-photos").list(user.id, { limit, offset, sortBy: { column: "created_at", order: "desc" } });
      if (error) throw new Error("Could not list private photos.");
      const photos = await Promise.all((data ?? []).filter((f: any) => f.name && !f.name.startsWith(".")).map(async (f: any) => {
        const path = user.id + "/" + f.name;
        const { data: signed, error: signedError } = await supabase.storage.from("arc-silk-photos").createSignedUrl(path, 900);
        const { data: meta } = await supabase.from("photo_library_metadata").select("category,caption").eq("user_id", user.id).eq("object_path", path).maybeSingle();
        return { name: f.name, path, created_at: f.created_at ?? null, category: meta?.category ?? null, caption: meta?.caption ?? null, signed_url: signedError ? null : signed?.signedUrl ?? null, url_expires_in_seconds: 900 };
      }));
      return jsonrpc(id, toolResult({ photos, returned: photos.length, next_offset: photos.length === limit ? offset + photos.length : null }));
    }

    if (name === "search_photos") {
      const query = String(args.query ?? "").trim().toLocaleLowerCase().slice(0, 120);
      const limit = Math.min(50, Math.max(1, Math.floor(Number(args.limit ?? 20) || 20)));
      const files = await listAllFiles(supabase, user.id);
      const { data: metadata, error: metaError } = await supabase.from("photo_library_metadata").select("object_path,category,caption").eq("user_id", user.id);
      if (metaError) throw new Error("Could not read photo labels.");
      const map = new Map((metadata ?? []).map((m: any) => [m.object_path, m]));
      const matched = (files ?? []).filter((f: any) => f.name && !f.name.startsWith(".")).map((f: any) => {
        const path = user.id + "/" + f.name; const m: any = map.get(path) ?? {};
        return { name: f.name, path, created_at: f.created_at ?? null, category: m.category ?? null, caption: m.caption ?? null };
      }).filter((f: any) => !query || [f.name, f.category, f.caption].some(v => typeof v === "string" && v.toLocaleLowerCase().includes(query))).slice(0, limit);
      const photos = await Promise.all(matched.map(async (f: any) => { const { data, error: e } = await supabase.storage.from("arc-silk-photos").createSignedUrl(f.path, 900); return { ...f, signed_url: e ? null : data?.signedUrl ?? null, url_expires_in_seconds: 900 }; }));
      return jsonrpc(id, toolResult({ query, photos, returned: photos.length }));
    }

    if (name === "update_photo_metadata") {
      const path = String(args.path ?? "");
      if (!path.startsWith(user.id + "/") || path.includes("..")) throw new Error("Photo path must belong to your own private library.");
      const exists = await listAllFiles(supabase, user.id);
      if (!exists.some((f: any) => user.id + "/" + f.name === path)) throw new Error("Photo not found in your private library.");
      const { data: current } = await supabase.from("photo_library_metadata").select("category,caption").eq("user_id", user.id).eq("object_path", path).maybeSingle();
      const category = args.category === undefined ? (current?.category ?? "Needs Review") : String(args.category).slice(0, 80);
      const caption = args.caption === undefined ? (current?.caption ?? "") : String(args.caption).slice(0, 500);
      const { error } = await supabase.from("photo_library_metadata").upsert({ user_id: user.id, object_path: path, category, caption, updated_at: new Date().toISOString() }, { onConflict: "user_id,object_path" });
      if (error) throw new Error("Could not save photo metadata.");
      return jsonrpc(id, toolResult({ updated: true, path, category, caption }));
    }

    if (name === "delete_photo") {
      const path = String(args.path ?? "");
      if (!path.startsWith(user.id + "/") || path.includes("..")) throw new Error("Photo path must belong to your own private library.");
      const files = await listAllFiles(supabase, user.id);
      if (!files.some((f: any) => user.id + "/" + f.name === path)) throw new Error("Photo not found in your private library.");
      const { error } = await supabase.storage.from("arc-silk-photos").remove([path]);
      if (error) throw new Error("Could not delete photo.");
      const { error: metaError } = await supabase.from("photo_library_metadata").delete().eq("user_id", user.id).eq("object_path", path);
      return jsonrpc(id, toolResult({ deleted: true, path, metadata_cleanup_warning: !!metaError }));
    }

    if (name === "upload_photo") {
      const filename = safeFilename(String(args.filename ?? ""));
      const contentType = String(args.content_type ?? "");
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"];
      if (!allowed.includes(contentType)) throw new Error("Unsupported image type.");
      const bytes = decodeBase64(String(args.base64_data ?? ""));
      if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("Image must be between 1 byte and 10 MB.");
      const path = user.id + "/" + Date.now() + "_" + crypto.randomUUID().slice(0, 8) + "_" + filename;
      const { error } = await supabase.storage.from("arc-silk-photos").upload(path, bytes, { contentType, upsert: false });
      if (error) throw new Error("Upload failed. Check file type and storage limits.");
      const category = String(args.category ?? "Needs Review").slice(0, 80);
      const caption = String(args.caption ?? "").slice(0, 500);
      const { error: metaError } = await supabase.from("photo_library_metadata").upsert({ user_id: user.id, object_path: path, category, caption, updated_at: new Date().toISOString() }, { onConflict: "user_id,object_path" });
      const { data: signed, error: signedError } = await supabase.storage.from("arc-silk-photos").createSignedUrl(path, 900);
      const outcome = formatUploadOutcome({
        path, category, caption,
        signedUrl: signedError ? null : signed?.signedUrl ?? null,
        metadataSaved: !metaError,
      });
      return jsonrpc(id, { ...toolResult(outcome.value), isError: outcome.isError });
    }
  } catch (e) {
    return jsonrpc(id, { ...toolResult({ error: e instanceof Error ? e.message : "Photo action failed." }), isError: true });
  }
  return errorResponse(id, -32602, "Invalid tool arguments");
}));
