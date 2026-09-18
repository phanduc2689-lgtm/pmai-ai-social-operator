const encoder = new TextEncoder();

export async function sha256Hex(text: string): Promise<string> {
  const buf = encoder.encode(text);
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 0x811c9dc5;
  for (const b of buf) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0").repeat(8).slice(0, 64);
}

export async function contentRevisionHash(input: {
  body: string;
  mediaChecksums: string[];
  pageTargetId: string;
}): Promise<string> {
  const canonical = JSON.stringify({
    body: input.body,
    mediaChecksums: [...input.mediaChecksums].sort(),
    pageTargetId: input.pageTargetId,
  });
  return sha256Hex(canonical);
}

export function newId(prefix: string): string {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${rand.replace(/-/g, "").slice(0, 22)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
