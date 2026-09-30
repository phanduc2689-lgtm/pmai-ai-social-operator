import { useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeComment,
  destinationsFor,
  findAccount,
  findBrowser,
  findDestination,
  findIdentity,
  humanTypeMs,
  normalizeSelection,
  parsePostUrl,
  pickReply,
  planDelays,
  replyLines,
  SAMPLE_POST_URL,
  type GeminiSettings,
  type LogEntry,
  type Selection,
  type ThreadComment,
} from "./catalog.ts";
import {
  clearPersisted,
  defaultPersisted,
  loadPersisted,
  savePersisted,
  type PersistedReply,
} from "./storage.ts";
import { hasElectronHost, hostInvoke } from "../pmai/ipc.ts";

export type NavId = "home" | "reply" | "logs" | "settings";
export type RunKind = "reply" | "like" | null;

export type Phase =
  | { type: "idle" }
  | { type: "scrolling"; commentId: string }
  | { type: "click-reply"; commentId: string }
  | { type: "typing"; commentId: string; draft: string; full: string; progress: number }
  | { type: "sending"; commentId: string; via: "arrow" | "enter"; draft: string }
  | { type: "liking"; commentId: string };

const initial = defaultPersisted();

interface LiveRow {
  id: string;
  author: string;
  body: string;
  liked: boolean;
  role: "author" | "customer";
  timeLabel: string;
  initials: string;
  tone: 0 | 1 | 2 | 3 | 4 | 5;
}

function asThread(row: LiveRow): ThreadComment {
  const tone = row.tone >= 0 && row.tone <= 5 ? row.tone : 0;
  return {
    id: row.id,
    author: row.author,
    initials: row.initials || "FB",
    tone,
    timeLabel: row.timeLabel || "",
    body: row.body,
    role: row.role === "author" ? "author" : "customer",
    liked: Boolean(row.liked),
    reply: null,
    replyAt: null,
  };
}

function isSampleThread(rows: ThreadComment[]) {
  return rows.some((row) => row.id === "c-author" || /^c\d+$/.test(row.id));
}

function newLog(partial: Omit<LogEntry, "id" | "at">): LogEntry {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...partial,
  };
}

class QueueAbort extends Error {
  constructor() {
    super("QUEUE_ABORT");
    this.name = "QueueAbort";
  }
}

export function useOperator() {
  const [nav, setNav] = useState<NavId>("reply");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selection, setSelectionState] = useState<Selection>(initial.selection);
  const [postUrl, setPostUrl] = useState(initial.postUrl);
  const [replyDraft, setReplyDraft] = useState(initial.replyDraft);
  const [likeWithReply, setLikeWithReply] = useState(initial.likeWithReply);
  const [comments, setComments] = useState<ThreadComment[]>(initial.comments);
  const [logs, setLogs] = useState<LogEntry[]>(initial.logs);
  const [gemini, setGemini] = useState<GeminiSettings>(initial.gemini);
  const [hydrated, setHydrated] = useState(false);
  const [phase, setPhase] = useState<Phase>({ type: "idle" });
  const [running, setRunning] = useState<RunKind>(null);
  const [paused, setPaused] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [liveMode, setLiveMode] = useState(() => hasElectronHost());
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");

  const commentsRef = useRef(comments);
  const linesRef = useRef<string[]>(replyLines(replyDraft));
  const likeRef = useRef(likeWithReply);
  const geminiRef = useRef(gemini);
  commentsRef.current = comments;
  linesRef.current = replyLines(replyDraft);
  likeRef.current = likeWithReply;
  geminiRef.current = gemini;

  const ctrl = useRef({ runId: 0, paused: false, waiters: [] as Array<() => void> });
  const busyRef = useRef(false);
  const scannedUrl = useRef("");
  const scanLock = useRef(false);

  useEffect(() => {
    const saved = loadPersisted();
    if (saved) {
      setSelectionState(saved.selection);
      setPostUrl(saved.postUrl);
      setReplyDraft(saved.replyDraft);
      setLikeWithReply(saved.likeWithReply);
      setComments(saved.comments);
      setLogs(saved.logs);
      setGemini(saved.gemini);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const handle = window.setTimeout(() => {
      const snapshot: PersistedReply = {
        selection,
        postUrl,
        replyDraft,
        likeWithReply,
        comments,
        logs,
        gemini,
      };
      savePersisted(snapshot);
    }, 200);
    return () => window.clearTimeout(handle);
  }, [hydrated, selection, postUrl, replyDraft, likeWithReply, comments, logs, gemini]);

  const lines = useMemo(() => replyLines(replyDraft), [replyDraft]);
  const urlState = useMemo(() => parsePostUrl(postUrl), [postUrl]);
  const readyDestinations = useMemo(() => destinationsFor(selection, true), [selection]);
  const hiddenDestinations = useMemo(() => destinationsFor(selection, false).filter((d) => d.status !== "READY"), [selection]);
  const account = findAccount(selection.accountId);
  const browser = findBrowser(selection.browserId);
  const identity = findIdentity(selection.identityId);
  const destination = findDestination(selection.destinationId);
  const destinationReady = destination?.status === "READY";
  const customers = comments.filter((row) => row.role === "customer");
  const pending = customers.filter((row) => !row.reply);

  function pushLog(partial: Omit<LogEntry, "id" | "at">) {
    setLogs((prev) => [newLog(partial), ...prev].slice(0, 300));
  }

  function setSelection(update: Selection | ((prev: Selection) => Selection)) {
    setSelectionState((prev) => normalizeSelection(typeof update === "function" ? update(prev) : update));
  }

  async function scanLive(force = false) {
    if (!hasElectronHost()) {
      setLiveMode(false);
      return;
    }
    const url = postUrl.trim();
    if (!parsePostUrl(url).ok) {
      setScanError("Dán URL bài viết Facebook trước.");
      return;
    }
    if (!force && scannedUrl.current === url && !isSampleThread(commentsRef.current)) return;
    if (scanLock.current) return;
    scanLock.current = true;
    setLiveMode(true);
    setScanning(true);
    setScanError("");
    if (isSampleThread(commentsRef.current)) {
      setComments([]);
      commentsRef.current = [];
    }
    const pageName = destination?.name || identity?.name || "";
    try {
      const res = await hostInvoke<{ comments: LiveRow[]; pageUrl: string }>("chrome.replyScan", { url, pageName });
      setScanning(false);
      if (!res.ok || !res.data) {
        const message = res.error?.message ?? "Không đọc được comment trên Chrome.";
        setScanError(message);
        pushLog({ action: "Quét comment", target: "Chrome", detail: message, result: "FAIL" });
        return;
      }
      scannedUrl.current = url;
      const next = res.data.comments.map(asThread);
      setComments(next);
      commentsRef.current = next;
      const customers = next.filter((row) => row.role === "customer").length;
      pushLog({
        action: "Quét comment",
        target: "Chrome",
        detail: `${customers} comment khách · bài thật`,
        result: "OK",
      });
    } finally {
      scanLock.current = false;
      setScanning(false);
    }
  }

  useEffect(() => {
    if (step !== 3 || !hasElectronHost()) return;
    if (!parsePostUrl(postUrl).ok) return;
    void scanLive(false);
  }, [step, postUrl]);

  async function likeOne(id: string) {
    if (busyRef.current) return;
    const row = commentsRef.current.find((comment) => comment.id === id);
    if (!row || row.liked) return;
    if (hasElectronHost()) {
      const res = await hostInvoke<{ results: { id: string; ok: boolean }[] }>("chrome.replyLike", {
        url: postUrl.trim(),
        targets: [{ id: row.id, author: row.author, body: row.body }],
      });
      if (!res.ok || !res.data?.results.some((item) => item.ok)) {
        pushLog({
          action: "Like",
          target: row.author,
          detail: res.error?.message ?? "Không thấy nút Thích trên Chrome",
          result: "FAIL",
        });
        return;
      }
      setComments((prev) => prev.map((comment) => (comment.id === id ? { ...comment, liked: true } : comment)));
      pushLog({ action: "Like", target: row.author, detail: "Chrome", result: "OK" });
      return;
    }
    setComments((prev) => prev.map((comment) => (comment.id === id ? { ...comment, liked: true } : comment)));
    pushLog({ action: "Like", target: row.author, detail: "Like lẻ", result: "OK" });
  }

  function bumpRun() {
    ctrl.current.runId += 1;
    ctrl.current.paused = false;
    const waiters = ctrl.current.waiters.splice(0);
    waiters.forEach((release) => release());
    setPaused(false);
    return ctrl.current.runId;
  }

  async function gate(runId: number) {
    if (ctrl.current.runId !== runId) throw new QueueAbort();
    while (ctrl.current.paused && ctrl.current.runId === runId) {
      await new Promise<void>((resolve) => {
        ctrl.current.waiters.push(resolve);
      });
    }
    if (ctrl.current.runId !== runId) throw new QueueAbort();
  }

  async function sleep(ms: number, runId: number) {
    let left = ms;
    while (left > 0) {
      await gate(runId);
      const slice = Math.min(40, left);
      const started = Date.now();
      await new Promise((resolve) => setTimeout(resolve, slice));
      left -= Date.now() - started;
    }
    await gate(runId);
  }

  function stop(silent = false) {
    const wasRunning = busyRef.current || ctrl.current.paused;
    bumpRun();
    busyRef.current = false;
    setRunning(null);
    setPhase({ type: "idle" });
    setActiveId(null);
    if (!silent && wasRunning) {
      pushLog({ action: "Dừng", target: "Hàng đợi", detail: "Người vận hành dừng giữa chừng", result: "SKIP" });
    }
  }

  function pause() {
    if (!running || ctrl.current.paused) return;
    ctrl.current.paused = true;
    setPaused(true);
    pushLog({ action: "Tạm dừng", target: "Hàng đợi", detail: "Giữ nguyên đoạn đang gõ", result: "OK" });
  }

  function resume() {
    if (!ctrl.current.paused) return;
    ctrl.current.paused = false;
    setPaused(false);
    const waiters = ctrl.current.waiters.splice(0);
    waiters.forEach((release) => release());
    pushLog({ action: "Tiếp tục", target: "Hàng đợi", detail: "Chạy tiếp từ chỗ đã dừng", result: "OK" });
  }

  function commentKey(author: string, body: string) {
  return `${author.replace(/\s+/g, " ").trim()}\n${body.replace(/\s+/g, " ").trim().slice(0, 160)}`;
}

async function runLiveReplies(ids: string[]) {
    const pool = linesRef.current;
    if (busyRef.current || pool.length === 0 || !urlState.ok) return;
    const runId = bumpRun();
    busyRef.current = true;
    setRunning("reply");
    setLiveMode(true);
    setScanError("");
    if (isSampleThread(commentsRef.current)) {
      setComments([]);
      commentsRef.current = [];
    }
    const pageName = destination?.name || identity?.name || "";
    const real = commentsRef.current.filter((row) => row.role === "customer" && !isSampleThread([row]));
    const selected = real.filter((row) => ids.includes(row.id) && !row.reply);
    const onlyKeys = selected.length > 0 && selected.length < real.length ? selected.map((row) => commentKey(row.author, row.body)) : [];
    const doneKeys = commentsRef.current.filter((row) => row.reply).map((row) => commentKey(row.author, row.body));
    pushLog({ action: "Mở bài", target: "Chrome", detail: `${postUrl.trim()} · kéo và trả lời bằng mẫu ngẫu nhiên`, result: "OK" });
    let lastLine: string | null = null;
    let failures = 0;
    let sent = 0;
    let reset = true;
    try {
      for (let step = 0; step < 40; step += 1) {
        await gate(runId);
        const text = pickReply(linesRef.current, lastLine);
        lastLine = text;
        setPhase({ type: "scrolling", commentId: "live" });
        const res = await hostInvoke<{
          done: boolean;
          skipped?: boolean;
          author: string;
          body: string;
          key: string;
          via: "enter";
          typedMs: number;
          liked: boolean;
          detail?: string;
        }>("chrome.replyNext", {
          url: postUrl.trim(),
          pageName,
          text,
          likeAfter: likeRef.current,
          reset,
          doneKeys,
          onlyKeys,
        });
        reset = false;
        if (ctrl.current.runId !== runId) break;
        if (!res.ok || !res.data) {
          failures += 1;
          const message = res.error?.message ?? "Không gửi được";
          setScanError(message);
          pushLog({ action: "Lỗi Chrome", target: "Bài viết", detail: message, result: "FAIL" });
          if (failures >= 3 || /checkpoint|captcha/i.test(message)) break;
          continue;
        }
        if (res.data.done) break;
        const key = res.data.key || commentKey(res.data.author, res.data.body);
        if (!doneKeys.includes(key)) doneKeys.push(key);
        if (res.data.skipped) {
          failures += 1;
          pushLog({
            action: "Bỏ qua",
            target: res.data.author || "Comment",
            detail: res.data.detail || "Không mở được ô Trả lời",
            result: "SKIP",
          });
          if (failures >= 5) break;
          continue;
        }
        failures = 0;
        sent += 1;
        const replyAt = new Date().toISOString();
        const existing = commentsRef.current.find((row) => commentKey(row.author, row.body) === key);
        const activeId = existing?.id || `fb-live-${sent}`;
        if (existing) {
          commentsRef.current = commentsRef.current.map((row) =>
            row.id === existing.id ? { ...row, reply: text, replyAt, liked: row.liked || Boolean(res.data?.liked) } : row,
          );
        } else {
          const row = asThread({
            id: activeId,
            author: res.data.author,
            body: res.data.body,
            liked: Boolean(res.data.liked),
            role: "customer",
            timeLabel: "",
            initials: res.data.author.slice(0, 2).toUpperCase(),
            tone: 0,
          });
          row.reply = text;
          row.replyAt = replyAt;
          commentsRef.current = [...commentsRef.current, row];
        }
        setComments(commentsRef.current);
        setActiveId(activeId);
        setPhase({ type: "sending", commentId: activeId, via: "enter", draft: text });
        pushLog({
          action: "Gửi Enter",
          target: res.data.author,
          detail: `${(res.data.typedMs / 1000).toFixed(1)} giây · ${text}`,
          result: "OK",
        });
        if (res.data.liked) pushLog({ action: "Like", target: res.data.author, detail: "Kèm sau reply", result: "OK" });
        await sleep(350, runId);
      }
      if (ctrl.current.runId === runId) {
        pushLog({ action: "Xong hàng đợi", target: "Chrome", detail: `${sent} comment đã trả lời`, result: sent ? "OK" : "SKIP" });
        setPhase({ type: "idle" });
        setActiveId(null);
        if (!sent) setScanError("Không thấy comment khách trong hộp thoại. Mở đúng bài, kéo comment hiện ra, rồi chạy lại.");
      }
    } catch (error) {
      if (!(error instanceof QueueAbort)) throw error;
    } finally {
      if (ctrl.current.runId === runId) {
        setRunning(null);
        busyRef.current = false;
      }
    }
  }

  async function runReplies(ids: string[]) {
    if (hasElectronHost()) {
      await runLiveReplies(ids);
      return;
    }
    const pool = linesRef.current;
    if (busyRef.current || pool.length === 0 || !urlState.ok || !destinationReady) return;
    const runId = bumpRun();
    busyRef.current = true;
    setRunning("reply");
    const modeNote = geminiRef.current.auto
      ? "Gemini chưa nối — vẫn lấy ngẫu nhiên trong danh sách"
      : "Ngẫu nhiên trong danh sách";
    pushLog({
      action: "Mở bài",
      target: destination?.name ?? "Đích",
      detail: `${postUrl.trim()} · ${modeNote}`,
      result: "OK",
    });
    let lastLine: string | null = null;
    try {
      for (let index = 0; index < ids.length; index += 1) {
        const id = ids[index];
        await gate(runId);
        const comment = commentsRef.current.find((row) => row.id === id);
        if (!comment || comment.role !== "customer" || comment.reply) {
          pushLog({
            action: "Bỏ qua",
            target: comment?.author ?? id,
            detail: "Đã có reply hoặc không phải khách",
            result: "SKIP",
          });
          continue;
        }
        const intent = analyzeComment(comment.body);
        setActiveId(id);
        setPhase({ type: "scrolling", commentId: id });
        pushLog({ action: "Sang comment", target: comment.author, detail: intent.label, result: "OK" });
        await sleep(640, runId);

        setPhase({ type: "click-reply", commentId: id });
        pushLog({ action: "Bấm Trả lời", target: comment.author, detail: intent.label, result: "OK" });
        await sleep(420, runId);

        const text = pickReply(linesRef.current, lastLine);
        lastLine = text;
        const total = humanTypeMs();
        const delays = planDelays(text, total);
        const chars = Array.from(text);
        let draft = "";
        pushLog({
          action: "Gõ",
          target: comment.author,
          detail: `${(total / 1000).toFixed(1)} giây · ${text}`,
          result: "OK",
        });
        for (let cursor = 0; cursor < chars.length; cursor += 1) {
          draft += chars[cursor];
          setPhase({
            type: "typing",
            commentId: id,
            draft,
            full: text,
            progress: (cursor + 1) / chars.length,
          });
          await sleep(delays[cursor] ?? 0, runId);
        }

        const via: "arrow" | "enter" = index % 3 === 2 ? "enter" : "arrow";
        setPhase({ type: "sending", commentId: id, via, draft: text });
        await sleep(340, runId);
        const replyAt = new Date().toISOString();
        setComments((prev) => prev.map((row) => (row.id === id ? { ...row, reply: text, replyAt } : row)));
        pushLog({
          action: via === "arrow" ? "Gửi mũi tên" : "Gửi Enter",
          target: comment.author,
          detail: text,
          result: "OK",
        });

        if (likeRef.current && !comment.liked) {
          await sleep(480, runId);
          setPhase({ type: "liking", commentId: id });
          await sleep(260, runId);
          setComments((prev) => prev.map((row) => (row.id === id ? { ...row, liked: true } : row)));
          pushLog({ action: "Like", target: comment.author, detail: "Kèm sau reply", result: "OK" });
        }
        await sleep(360, runId);
      }
      if (ctrl.current.runId === runId) {
        pushLog({
          action: "Xong hàng đợi",
          target: "Reply",
          detail: `${ids.length} comment`,
          result: "OK",
        });
        setPhase({ type: "idle" });
        setActiveId(null);
      }
    } catch (error) {
      if (!(error instanceof QueueAbort)) throw error;
    } finally {
      if (ctrl.current.runId === runId) {
        setRunning(null);
        busyRef.current = false;
      }
    }
  }

  async function likeLive() {
    if (busyRef.current) return;
    const targets = commentsRef.current.filter((row) => row.role === "customer" && !row.liked);
    if (targets.length === 0) return;
    const runId = bumpRun();
    busyRef.current = true;
    setRunning("like");
    pushLog({ action: "Like hàng loạt", target: "Chrome", detail: `${targets.length} comment`, result: "OK" });
    try {
      const res = await hostInvoke<{ results: { id: string; ok: boolean; detail: string }[] }>("chrome.replyLike", {
        url: postUrl.trim(),
        targets: targets.map((row) => ({ id: row.id, author: row.author, body: row.body })),
      });
      if (ctrl.current.runId !== runId) return;
      if (!res.ok || !res.data) {
        pushLog({ action: "Lỗi Chrome", target: "Like", detail: res.error?.message ?? "Không like được", result: "FAIL" });
      } else {
        const okIds = new Set(res.data.results.filter((row) => row.ok).map((row) => row.id));
        setComments((prev) => prev.map((row) => (okIds.has(row.id) ? { ...row, liked: true } : row)));
        pushLog({
          action: "Xong hàng đợi",
          target: "Like",
          detail: `${okIds.size}/${targets.length} trên Chrome`,
          result: "OK",
        });
      }
      setPhase({ type: "idle" });
      setActiveId(null);
    } finally {
      if (ctrl.current.runId === runId) {
        setRunning(null);
        busyRef.current = false;
      }
    }
  }

  async function likeAll() {
    if (hasElectronHost()) {
      await likeLive();
      return;
    }
    if (busyRef.current) return;
    const runId = bumpRun();
    busyRef.current = true;
    setRunning("like");
    const targets = commentsRef.current.filter((row) => !row.liked);
    pushLog({
      action: "Like hàng loạt",
      target: destination?.name ?? "Bài viết",
      detail: `${targets.length} comment chưa like`,
      result: "OK",
    });
    try {
      for (const comment of targets) {
        await gate(runId);
        setActiveId(comment.id);
        setPhase({ type: "liking", commentId: comment.id });
        await sleep(800 + Math.floor(Math.random() * 401), runId);
        setComments((prev) => prev.map((row) => (row.id === comment.id ? { ...row, liked: true } : row)));
        pushLog({ action: "Like", target: comment.author, detail: "Hàng loạt", result: "OK" });
      }
      if (ctrl.current.runId === runId) {
        pushLog({ action: "Xong hàng đợi", target: "Like", detail: `${targets.length} comment`, result: "OK" });
        setPhase({ type: "idle" });
        setActiveId(null);
      }
    } catch (error) {
      if (!(error instanceof QueueAbort)) throw error;
    } finally {
      if (ctrl.current.runId === runId) {
        setRunning(null);
        busyRef.current = false;
      }
    }
  }

  function goto(next: 1 | 2 | 3) {
    if (running || paused) stop();
    setStep(next);
  }

  function resetThread() {
    if (running || paused) stop(true);
    clearPersisted();
    scannedUrl.current = "";
    setComments([]);
    commentsRef.current = [];
    setLogs([
      newLog({
        action: "Xóa dữ liệu local",
        target: "Reply",
        detail: "Đã xóa pmai.reply.v1. Không còn bài mẫu.",
        result: "OK",
      }),
    ]);
    if (hasElectronHost() && parsePostUrl(postUrl).ok) {
      void scanLive(true);
    }
  }

  function clearLogs() {
    setLogs([]);
  }

  function useSampleUrl() {
    setPostUrl(SAMPLE_POST_URL);
  }

  const composerFor =
    phase.type === "click-reply" || phase.type === "typing" || phase.type === "sending" ? phase.commentId : null;
  const draft =
    phase.type === "typing" || phase.type === "sending" ? phase.draft : "";
  const typing = phase.type === "typing";
  const sendVia = phase.type === "sending" ? phase.via : null;

  return {
    nav,
    setNav,
    step,
    goto,
    selection,
    setSelection,
    postUrl,
    setPostUrl,
    useSampleUrl,
    replyDraft,
    setReplyDraft,
    lines,
    likeWithReply,
    setLikeWithReply,
    comments,
    logs,
    gemini,
    setGemini,
    phase,
    running,
    paused,
    activeId,
    liveMode,
    scanning,
    scanError,
    scanLive,
    urlState,
    readyDestinations,
    hiddenDestinations,
    account,
    browser,
    identity,
    destination,
    destinationReady,
    customers,
    pending,
    composerFor,
    draft,
    typing,
    sendVia,
    pushLog,
    pause,
    resume,
    stop: () => stop(false),
    runReplies,
    likeAll,
    likeOne,
    resetThread,
    clearLogs,
  };
}

export type Operator = ReturnType<typeof useOperator>;
