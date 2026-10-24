import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const file = process.argv[2] ?? "ARC_SILK_v117_Seller_Discovery_Fix.html";
const html = readFileSync(file, "utf8");
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];

assert.ok(html.includes('id="arcSellerStudioV118"'), "Seller Studio section is missing");
assert.ok(html.includes('data-view="arcSellerStudioV118"'), "Seller Studio navigation is missing");
assert.ok(html.includes("from('marketplace_listings').insert"), "Supabase listing create is missing");
assert.ok(html.includes("from('marketplace_listings').update"), "Supabase listing update is missing");
assert.ok(html.includes("functions.invoke('activate-seller'"), "Seller activation Edge Function is not used");
assert.ok(html.includes("functions.invoke('set-profile-visibility'"), "Profile visibility Edge Function is not used");
assert.ok(html.includes("functions.invoke('publish-listing'"), "Server-side listing publication function is not used");
assert.ok(html.includes("Publish to Marketplace"), "Seller Studio publish action is missing");
assert.ok(!html.includes("Submitted listings still require marketplace approval"), "Obsolete manual listing approval copy remains");
assert.ok(html.includes("duration>30"), "30-second preview cap validation is missing");
assert.ok(!html.includes("price_minor:Math.round(Number(x.price||0)*100)"), "Old 100x price conversion bug has returned");
assert.ok(!html.includes("http://localhost:8000"), "Unsafe localhost API fallback has returned");
assert.ok(scripts.length >= 10, "Unexpectedly few inline scripts were found");

for (const [index, match] of scripts.entries()) {
  try {
    new Function(match[1]);
  } catch (error) {
    throw new Error("Inline script " + (index + 1) + " failed syntax validation: " + error.message);
  }
}

const activate = readFileSync("supabase/functions/activate-seller/index.ts", "utf8");
const visibility = readFileSync("supabase/functions/set-profile-visibility/index.ts", "utf8");
const publish = readFileSync("supabase/functions/publish-listing/index.ts", "utf8");
for (const [name, source] of [["activate-seller", activate], ["set-profile-visibility", visibility], ["publish-listing", publish]]) {
  assert.ok(source.includes('req.method !== "POST"'), name + ": POST-only method guard is missing");
  assert.ok(source.includes("auth.getUser(token)"), name + ": server-side session validation is missing");
  assert.ok(source.includes('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")'), name + ": service role must come from environment");
  assert.ok(!/eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(source), name + ": token-like secret found in source");
}
assert.ok(activate.includes('.eq("status", "submitted")'), "Seller activation must count submitted listings only");
assert.ok(activate.includes("required_submitted_listings: 5"), "Seller activation must enforce the five-listing threshold");
assert.ok(visibility.includes("username.length < 3"), "Public visibility must validate username length");
assert.ok(visibility.includes("displayName.length < 2"), "Public visibility must validate display name");
assert.ok(publish.includes('eq("seller_id", user.id)'), "Publication must verify listing ownership");
assert.ok(publish.includes("!profile.is_seller || !profile.is_public"), "Publication must require an active public seller profile");
assert.ok(publish.includes("listing.preview_duration_seconds>30"), "Publication must enforce the 30-second preview cap");
assert.ok(publish.includes('status:"active"'), "Publication must set listing status to active");

console.log("ARC_SILK static checks passed: " + scripts.length + " inline scripts parsed; seller function contracts checked.");
