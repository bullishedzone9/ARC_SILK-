export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-03-26"] as const;
export const DEFAULT_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export function negotiateProtocolVersion(requested: unknown): { protocolVersion: string; requestedSupported: boolean } | null {
  if (typeof requested !== "string") return null;
  if ((SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)) {
    return { protocolVersion: requested, requestedSupported: true };
  }
  return { protocolVersion: DEFAULT_PROTOCOL_VERSION, requestedSupported: false };
}

export function formatUploadOutcome(input: {
  path: string;
  category: string;
  caption: string;
  signedUrl: string | null;
  metadataSaved: boolean;
}) {
  if (input.metadataSaved) {
    return {
      isError: false,
      value: { uploaded: true, path: input.path, category: input.category, caption: input.caption, signed_url: input.signedUrl, metadata_saved: true, url_expires_in_seconds: 900 },
    };
  }
  return {
    isError: true,
    value: {
      uploaded: true, path: input.path, category: input.category, caption: input.caption,
      signed_url: input.signedUrl, metadata_saved: false, partial_failure: true,
      recovery: { tool: "update_photo_metadata", path: input.path, instruction: "The image is stored, but its category/caption was not saved. Retry metadata using update_photo_metadata with this path." },
      url_expires_in_seconds: 900,
    },
  };
}
