const baseUrl = (process.env.ARC_SILK_SUPABASE_URL || "https://kvmmuorfaioiqxstxkmn.supabase.co").replace(/\/$/, "");
const functions = ["activate-seller", "set-profile-visibility", "publish-listing"];

for (const name of functions) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${baseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: controller.signal,
    });
    if (response.status !== 401) {
      const body = (await response.text()).slice(0, 200).replace(/[\r\n]+/g, " ");
      throw new Error(`${name}: expected unauthenticated request to return 401; got ${response.status}. Response: ${body}`);
    }
    console.log(`PASS ${name}: unauthenticated POST rejected with HTTP 401`);
  } finally {
    clearTimeout(timeout);
  }
}
console.log("Live unauthenticated boundary smoke checks passed. This does not verify authenticated customer flows.");
