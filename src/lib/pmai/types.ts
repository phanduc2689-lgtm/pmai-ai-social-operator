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
  | "SCHEDULED"
  | "RUNNING"
  | "SUCCESS"
  | "NEEDS_VERIFICATION"
  | "FAILED"
  | "REJECTED"
  | "CANCELLED"
  | "STALE_APPROVAL"
  | "MISSED";

export type ScheduleMode = "NOW" | "SCHEDULED";

export type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "EDITED_APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "STALE"
  | "CONSUMED";

export type DestinationType = "PROFILE" | "PAGE" | "GROUP";

export type GroupPostBucket = "SKIP" | "POTENTIAL" | "UNKNOWN";

export interface GroupPostRecord {
  id: string;
  pageTargetId: string;
  fingerprint: string;
  author: string;
  text: string;
  permalink: string | null;
  bucket: GroupPostBucket;
  skipReason: string | null;
  intent: string | null;
  destinations: string[];
  services: string[];
  score: number;
  reasons: string[];
  commentDraft: string;
  seenAt: string;
}

export interface GroupRpaSettings {
  maxScrollRounds: number;
  maxPosts: number;
  maxCommentsPerHour: number;
  autoSubmitComment: boolean;
}

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
  profileUrl?: string;
  facebookId?: string;
}

export interface PageTarget {
  id: string;
  identityId: string;
  name: string;
  url: string;
  status: PageStatus;
  /** PROFILE | PAGE | GROUP. Missing on v1 rows → inferred from URL. */
  type?: DestinationType;
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
  type: "SAVE_LOCAL_DRAFT" | "PUBLISH_CONTENT" | "COMMENT_GROUP_POST";
  contentId: string;
  pageTargetId: string;
  status: TaskStatus;
  errorCode: string | null;
  permalink: string | null;
  createdAt: string;
  /** NOW = publish after approve. SCHEDULED = wait until scheduledAt (local clock). */
  scheduleMode?: ScheduleMode;
  /** Instant stored as ISO. Interpreted from the machine's local timezone at compose time. */
  scheduledAt?: string | null;
  /** Set when the scheduler claims a due task so it cannot be claimed twice. */
  claimedAt?: string | null;
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

export interface WorkspaceSession {
  id: string;
  enabled: boolean;
  profile: BrowserProfile;
  identity: FacebookIdentity | null;
  pages: PageTarget[];
  selectedPageId: string | null;
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
  /** Active session mirror — keep for existing UI / persist v2. */
  profile: BrowserProfile | null;
  identity: FacebookIdentity | null;
  pages: PageTarget[];
  selectedPageId: string | null;
  /** Each session = one Chrome profile = one Facebook account. */
  sessions: WorkspaceSession[];
  activeSessionId: string | null;
  contents: ContentItem[];
  tasks: Task[];
  approvals: Approval[];
  activities: Activity[];
  groupPosts: GroupPostRecord[];
  groupRpa: GroupRpaSettings;
  firstRunStep: 1 | 2 | 3 | 4;
}

export interface SubmitSchedule {
  mode?: ScheduleMode;
  /** ISO instant. Preferred when the caller already converted local date+time. */
  scheduledAt?: string;
  /** Local calendar date YYYY-MM-DD from the date picker. */
  date?: string;
  /** Local clock HH:MM from the time picker. */
  time?: string;
}
