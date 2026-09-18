export const ERROR_CODES = [
  "SCHEMA_INVALID",
  "POLICY_REJECTED",
  "APPROVAL_REQUIRED",
  "STALE_APPROVAL",
  "ACCOUNT_MISMATCH",
  "AUTH_LOGOUT",
  "CAPTCHA_REQUIRED",
  "CHECKPOINT",
  "UI_CHANGED",
  "NEEDS_VERIFICATION",
  "LLM_UNAVAILABLE",
  "BROWSER_CRASH",
  "NETWORK",
  "CAPABILITY_MISSING",
  "SECRET_FORBIDDEN",
  "IDEMPOTENT_REJECT",
  "PREVIEW_MISMATCH",
  "NOT_READY",
  "IDLE_BLOCKED",
  "EXPIRED_APPROVAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class PmaiError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "PmaiError";
    this.code = code;
  }
}

export function isPmaiError(e: unknown): e is PmaiError {
  return e instanceof PmaiError;
}
