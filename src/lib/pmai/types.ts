export type ProfileStatus = "DISCONNECTED" | "LAUNCHING" | "RUNNING" | "CRASHED";
export type SessionStatus =
  | "UNKNOWN"
  | "CONNECTED"
  | "AUTH_REQUIRED"
  | "CAPTCHA"
  | "CHECKPOINT"
  | "RESTRICTED";
export type PageStatus = "UNSELECTED" | "VERIFIED" | "MISMATCH" | "NO_PERMISSION";

export type ContentStatus =
  | "GENERATING"
  | "DRAFT"
  | "READY"
  | "IN_REVIEW"
  | "APPROVED_SNAPSHOT"
  | "PUBLISHED"
  | "STALE"
  | "ARCHIVED";

export type TaskStatus =
  | "PENDING"
  | "VALIDATING"
  | "WAITING_APPROVAL"
  | "QUEUED"
  | "RUNNING"
  | "SUCCESS"
  | "NEEDS_VERIFICATION"
  | "FAILED"
  | "REJECTED"
  | "CANCELLED"
  | "STALE_APPROVAL";

export type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "EDITED_APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "STALE"
  | "CONSUMED";

export type ConnectionMode = "ATTACH_EXISTING" | "MANAGED_PROFILE";

export type MediaKind = "image" | "video";
export type MediaUploadState = "PENDING" | "READY" | "FAILED";

export interface BrowserProfile {
  id: string;
  name: string;
  mode: ConnectionMode;
  status: ProfileStatus;
  createdAt: string;
  chromeDirectory?: string;
  userDataDir?: string;
  facebookLikely?: boolean;
}

export interface FacebookIdentity {
  id: string;
  profileId: string;
  displayName: string;
  sessionStatus: SessionStatus;
}

export interface PageTarget {
  id: string;
  identityId: string;
  name: string;
  url: string;
  status: PageStatus;
}

export interface MediaAsset {
  id: string;
  type: MediaKind;
  name: string;
  checksum: string;
  mimeType: string;
  size: number;
  /** Absolute filesystem path — required for Chrome setInputFiles. */
  localPath?: string;
  /** Remote URL that was downloaded to a temp file. */
  sourceUrl?: string;
  /** Tick: include this file when publishing. Default true. */
  attach?: boolean;
  uploadState?: MediaUploadState;
}

export interface ContentItem {
  id: string;
  pageTargetId: string;
  body: string;
  brief: string;
  media: MediaAsset[];
  status: ContentStatus;
  revisionHash: string;
  unverifiedClaims: string[];
  aiGenerated: boolean;
  humanModified: boolean;
}

export interface Approval {
  id: string;
  taskId: string;
  contentId: string;
  pageTargetId: string;
  contentRevisionHash: string;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt: string | null;
}

export interface Task {
  id: string;
  type: "SAVE_LOCAL_DRAFT" | "PUBLISH_CONTENT";
  contentId: string;
  pageTargetId: string;
  status: TaskStatus;
  errorCode: string | null;
  permalink: string | null;
  createdAt: string;
}

export interface Activity {
  id: string;
  at: string;
  taskId: string | null;
  action: string;
  result: string;
  detail: string;
}

export interface BrandFacts {
  hotline: string;
  pageName: string;
  priceNote: string;
  policyNote: string;
}

export interface VoiceProfile {
  enabled: boolean;
  samples: string[];
  notes: string;
}

export interface ContactTemplate {
  id: string;
  name: string;
  body: string;
  isDefault: boolean;
}

export interface LlmSettingsPublic {
  provider: "openai" | "gemini" | "anthropic" | "xai" | "mock";
  model: string;
  keyMasked: string;
  hasKey: boolean;
  lastPing: string | null;
}

export interface WorkspaceState {
  id: string;
  name: string;
  operatorName: string;
  brandFacts: BrandFacts;
  voice: VoiceProfile;
  contactTemplates: ContactTemplate[];
  appendFooter: boolean;
  idleCloseMinutes: number;
  keepBrowserOpen: boolean;
  llm: LlmSettingsPublic;
  profile: BrowserProfile | null;
  identity: FacebookIdentity | null;
  pages: PageTarget[];
  selectedPageId: string | null;
  contents: ContentItem[];
  tasks: Task[];
  approvals: Approval[];
  activities: Activity[];
  firstRunStep: 1 | 2 | 3 | 4;
}
