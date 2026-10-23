import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const file = process.argv[2] ?? "ARC_SILK_v117_Seller_Discovery_Fix.html";
const html = readFileSync(file, "utf8");
const scripts = [...html.matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi)];

assert.ok(html.includes('id="arcSellerStudioV118"'), "Seller Studio section is missing");
assert.ok(html.includes('data-view="arcSellerStudioV118"'), "Seller Studio navigation is missing");
assert.ok(html.includes("from('marketplace_listings').insert"), "Supabase listing create is missing");
assert.ok(html.includes("from('marketplace_listings').update"), "Supabase listing update is missing");
assert.ok(html.includes("functions.invoke('activate-seller'"), "Seller activation Edge Function is not used");
assert.ok(html.includes("functions.invoke('set-profile-visibility'"), "Profile visibility Edge Function is not used");
assert.ok(html.includes("duration>30"), "30-second preview cap validation is missing");
assert.ok(!html.includes("price_minor:Math.round(Number(x.price||0)*100)"), "Old 100x price conversion bug has returned");
assert.ok(!html.includes("http://localhost:8000"), "Unsafe localhost API fallback has returned");

for (const [index, match] of scripts.entries()) {
  try {
    new Function(match[1]);
  } catch (error) {
    throw new Error(`Inline script ${index + 1} failed syntax validation: ${error.message}`);
  }
}

console.log(`ARC_SILK static checks passed: ${scripts.length} inline scripts parsed.`);
