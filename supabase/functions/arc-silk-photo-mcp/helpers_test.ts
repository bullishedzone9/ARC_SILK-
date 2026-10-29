import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DEFAULT_PROTOCOL_VERSION, formatUploadOutcome, negotiateProtocolVersion } from "./helpers.ts";
Deno.test("accepts supported protocol version", () => assertEquals(negotiateProtocolVersion("2025-03-26"), {protocolVersion:"2025-03-26",requestedSupported:true}));
Deno.test("falls back to supported version for unknown version", () => assertEquals(negotiateProtocolVersion("2099-01-01"), {protocolVersion:DEFAULT_PROTOCOL_VERSION,requestedSupported:false}));
Deno.test("missing version selects supported default", () => assertEquals(negotiateProtocolVersion(undefined).protocolVersion,DEFAULT_PROTOCOL_VERSION));
Deno.test("metadata failure reports partial upload and recovery", () => {
 const r=formatUploadOutcome({path:"user-123/photo.png",category:"Family",caption:"Test",signedUrl:null,metadataSaved:false});
 assertEquals(r.isError,true); assertEquals(r.value.uploaded,true); assertEquals(r.value.metadata_saved,false);
 assertEquals(r.value.partial_failure,true); assertEquals(r.value.recovery.tool,"update_photo_metadata"); assertEquals(r.value.recovery.path,"user-123/photo.png");
});
Deno.test("successful metadata persistence reports complete upload", () => {
 const r=formatUploadOutcome({path:"user-123/photo.png",category:"Family",caption:"Test",signedUrl:"https://example.invalid/signed",metadataSaved:true});
 assertEquals(r.isError,false); assertEquals(r.value.uploaded,true); assertEquals(r.value.metadata_saved,true); assertEquals("partial_failure" in r.value,false);
});
