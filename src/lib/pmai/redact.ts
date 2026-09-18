const PATTERNS: RegExp[] = [
  /cookie/i,
  /authorization/i,
  /\bc_user\b/i,
  /\bxs\b/i,
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\bAIza[A-Za-z0-9_-]{8,}/g,
  /\bpassword\b/i,
  /\bbearer\s+[A-Za-z0-9._-]+/gi,
];

export function redact(text: string): string {
  let out = text;
  out = out.replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "sk-••••");
  out = out.replace(/\bAIza[A-Za-z0-9_-]{8,}/g, "AIza••••");
  out = out.replace(/bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ••••");
  if (PATTERNS.some((p) => p.test(out))) {
    out = out.replace(/([Cc]ookie\s*[:=]\s*)\S+/g, "$1[REDACTED]");
  }
  return out;
}

export function maskKey(key: string): string {
  if (!key) return "";
  const tail = key.slice(-4);
  return `••••${tail}`;
}

export function containsSecret(text: string): boolean {
  return /\bsk-[A-Za-z0-9_-]{10,}/.test(text) || /\bAIza[A-Za-z0-9_-]{10,}/.test(text);
}
