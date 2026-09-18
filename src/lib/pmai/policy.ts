import { PmaiError } from "./errors.ts";
import type { TaskType } from "./schema.ts";

export type PolicyDecision = "ALLOW" | "WAIT_APPROVAL" | "DENY";

const RULES: Record<TaskType, { decision: PolicyDecision; requireApproval: boolean }> = {
  SAVE_LOCAL_DRAFT: { decision: "ALLOW", requireApproval: false },
  PUBLISH_CONTENT: { decision: "WAIT_APPROVAL", requireApproval: true },
};

export function evaluatePolicy(type: string): {
  decision: PolicyDecision;
  requireApproval: boolean;
} {
  if (/mass_|bypass_|spoof_|evade_/i.test(type)) {
    return { decision: "DENY", requireApproval: true };
  }
  if (type === "SAVE_LOCAL_DRAFT" || type === "PUBLISH_CONTENT") {
    return RULES[type];
  }
  return { decision: "DENY", requireApproval: true };
}

export function assertPublishAllowed(input: {
  approvalStatus: string;
  pageTargetId: string;
  approvalPageTargetId: string;
  revisionHash: string;
  approvalRevisionHash: string;
}): void {
  if (input.approvalStatus !== "APPROVED" && input.approvalStatus !== "EDITED_APPROVED") {
    throw new PmaiError("APPROVAL_REQUIRED", "Không được mở composer trước khi duyệt.");
  }
  if (input.pageTargetId !== input.approvalPageTargetId) {
    throw new PmaiError("ACCOUNT_MISMATCH", "Approval không khớp Trang đích.");
  }
  if (input.revisionHash !== input.approvalRevisionHash) {
    throw new PmaiError("STALE_APPROVAL", "Nội dung đã đổi sau khi duyệt.");
  }
}
