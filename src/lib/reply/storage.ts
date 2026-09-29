import {
  DEFAULT_REPLIES,
  DEFAULT_SELECTION,
  freshThread,
  normalizeSelection,
  type GeminiSettings,
  type LogEntry,
  type Selection,
  type ThreadComment,
} from "./catalog.ts";

export interface PersistedReply {
  selection: Selection;
  postUrl: string;
  replyDraft: string;
  likeWithReply: boolean;
  comments: ThreadComment[];
  logs: LogEntry[];
  gemini: GeminiSettings;
}

export const STORAGE_KEY = "pmai.reply.v1";

export const DEFAULT_GEMINI: GeminiSettings = {
  model: "gemini-2.5-flash",
  apiKey: "",
  auto: false,
};

export function defaultPersisted(postUrl = ""): PersistedReply {
  return {
    selection: DEFAULT_SELECTION,
    postUrl,
    replyDraft: DEFAULT_REPLIES.join("\n"),
    likeWithReply: true,
    comments: freshThread(),
    logs: [],
    gemini: DEFAULT_GEMINI,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function loadPersisted(): PersistedReply | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const base = defaultPersisted();
    const selection = isRecord(parsed.selection)
      ? normalizeSelection({
          accountId: String(parsed.selection.accountId ?? ""),
          browserId: String(parsed.selection.browserId ?? ""),
          identityId: String(parsed.selection.identityId ?? ""),
          destinationId: String(parsed.selection.destinationId ?? ""),
        })
      : base.selection;
    const comments = Array.isArray(parsed.comments) ? parsed.comments.filter(isComment) : base.comments;
    const known = new Set(base.comments.map((row) => row.id));
    const commentIds = new Set(comments.map((row) => row.id));
    const thread =
      known.size === commentIds.size && [...known].every((id) => commentIds.has(id)) ? comments : base.comments;
    const logs = Array.isArray(parsed.logs) ? parsed.logs.filter(isLog).slice(0, 300) : [];
    const geminiRaw = isRecord(parsed.gemini) ? parsed.gemini : {};
    return {
      selection,
      postUrl: typeof parsed.postUrl === "string" ? parsed.postUrl : "",
      replyDraft: typeof parsed.replyDraft === "string" ? parsed.replyDraft : base.replyDraft,
      likeWithReply: parsed.likeWithReply !== false,
      comments: thread,
      logs,
      gemini: {
        model: geminiRaw.model === "gemini-2.5-pro" ? "gemini-2.5-pro" : "gemini-2.5-flash",
        apiKey: typeof geminiRaw.apiKey === "string" ? geminiRaw.apiKey : "",
        auto: geminiRaw.auto === true,
      },
    };
  } catch {
    return null;
  }
}

function isComment(value: unknown): value is ThreadComment {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.author === "string" &&
    typeof value.body === "string" &&
    (value.role === "author" || value.role === "customer") &&
    typeof value.liked === "boolean"
  );
}

function isLog(value: unknown): value is LogEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.at === "string" &&
    typeof value.action === "string" &&
    (value.result === "OK" || value.result === "SKIP" || value.result === "FAIL")
  );
}

export function savePersisted(state: PersistedReply): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
