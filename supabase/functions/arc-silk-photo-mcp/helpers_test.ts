import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DEFAULT_PROTOCOL_VERSION, formatUploadOutcome, negotiateProtocolVersion } from "./helpers.ts";

Deno.test("accepts supported protocol version", () =>
  assertEquals(negotiateProtocolVersion("2025-03-26"), {
    protocolVersion: "2025-03-26",
    requestedSupported: true,
  }));

Deno.test("falls back to supported version for unknown version", () =>
  assertEquals(negotiateProtocolVersion("2099-01-01"), {
    protocolVersion: DEFAULT_PROTOCOL_VERSION,
    requestedSupported: false,
  }));

Deno.test("rejects a missing protocol version", () =>
  assertEquals(negotiateProtocolVersion(undefined), null));

Deno.test("rejects a non-string protocol version", () =>
  assertEquals(negotiateProtocolVersion(20250326), null));

Deno.test("metadata failure reports partial upload and recovery", () => {
  const r = formatUploadOutcome({
    path: "user-123/photo.png",
    category: "Family",
    caption: "Test",
    signedUrl: null,
    metadataSaved: false,
  });
  assertEquals(r.isError, true);
  assertEquals(r.value.uploaded, true);
  assertEquals(r.value.metadata_saved, false);
  assertEquals(r.value.partial_failure, true);
  if (!r.value.recovery) throw new Error("Expected recovery instructions");
  const recovery = r.value.recovery;
  assertEquals(recovery.tool, "update_photo_metadata");
  assertEquals(recovery.path, "user-123/photo.png");
  assertEquals(recovery.instruction.includes("update_photo_metadata"), true);
});

Deno.test("successful metadata persistence reports complete upload", () => {
  const r = formatUploadOutcome({
    path: "user-123/photo.png",
    category: "Family",
    caption: "Test",
    signedUrl: "https://example.invalid/signed",
    metadataSaved: true,
  });
  assertEquals(r.isError, false);
  assertEquals(r.value.uploaded, true);
  assertEquals(r.value.metadata_saved, true);
  assertEquals("partial_failure" in r.value, false);
});
