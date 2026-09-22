import { useCallback, useMemo, useState } from "react";
import { FakeBrowserAdapter } from "./browser.ts";
import { isPmaiError } from "./errors.ts";
import { HostBrowserAdapter } from "./host-browser.ts";
import { getEngine } from "./host.ts";
import { hasElectronHost, hostInvoke } from "./ipc.ts";
import { looksLikeMediaId, resolveMediaSource } from "./media.ts";
import { rememberPreview } from "./media-preview.ts";
import type { ContactTemplate, DestinationType, MediaAsset, VoiceProfile } from "./types.ts";

export type LocalFileMeta = {
  name: string;
  size: number;
  mimeType: string;
  localPath?: string;
  sourceUrl?: string;
  previewUrl?: string;
};

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    s += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(s);
}

async function persistPickedFile(file: File): Promise<string | undefined> {
  const native = (file as File & { path?: string }).path?.trim();
  if (native && !looksLikeMediaId(native)) return native;
  if (!hasElectronHost()) return undefined;
  const saved = await hostInvoke<{ path: string }>("chrome.saveMedia", {
    name: file.name,
    mimeType: file.type,
    base64: await fileToBase64(file),
  });
  if (!saved.ok || !saved.data?.path) return undefined;
  return saved.data.path;
}

export function usePmai() {
  const engine = getEngine();
  const [snap, setSnap] = useState(() => engine.snapshot());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(() => setSnap(engine.snapshot()), [engine]);

  const run = useCallback(
    async <T,>(fn: () => Promise<T> | T): Promise<T | undefined> => {
      setBusy(true);
      setToast(null);
      try {
        const r = await fn();
        refresh();
        return r;
      } catch (e) {
        const msg = isPmaiError(e) ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : "Lỗi";
        setToast(msg);
        refresh();
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [engine, refresh],
  );

  const gate = useMemo(() => engine.canCreatePost(), [snap, engine]);
  const lights = useMemo(() => engine.lights(), [snap, engine]);
  const pendingApprovals = snap.approvals.filter((a) => a.status === "PENDING");
  const needsCheck = snap.tasks.filter((t) => t.status === "NEEDS_VERIFICATION");

  return {
    engine,
    snap,
    busy,
    toast,
    setToast,
    gate,
    lights,
    pendingApprovals,
    needsCheck,
    refresh,
    createProfile: (
      name: string,
      mode: "ATTACH_EXISTING" | "MANAGED_PROFILE",
      extra?: { chromeDirectory?: string; userDataDir?: string; facebookLikely?: boolean },
    ) => run(() => engine.createProfile({ name, mode, ...extra })),
    markLoggedIn: (name: string, opts?: { seedDemo?: boolean }) => run(() => engine.markLoggedIn(name, opts)),
    selectPage: (id: string) => run(() => engine.selectPage(id)),
    addPage: (name: string, url: string) => run(() => engine.addPage({ name, url })),
    addDestination: (type: DestinationType, name: string, url: string) =>
      run(() => engine.addDestination({ type, name, url })),
    addProfileFromSession: async () => {
      const identity = engine.snapshot().identity;
      let url = identity?.profileUrl || "";
      let name = identity?.displayName || "Trang cá nhân";
      if (hasElectronHost()) {
        const obs = await hostInvoke<{ url?: string; pageName?: string }>("chrome.observe");
        if (obs.ok) {
          url = obs.data?.url || url;
          name = identity?.displayName && identity.displayName !== "Chưa đăng nhập" ? identity.displayName : obs.data?.pageName || name;
        }
      }
      if (!url || !/facebook\.com/i.test(url)) {
        url = "https://www.facebook.com/me";
      }
      return run(() => engine.addDestination({ type: "PROFILE", name, url }));
    },
    removePage: (id: string) => run(() => engine.removePage(id)),
    createDraft: (brief: string) => run(() => engine.createDraft(brief)),
    updateDraft: (id: string, body: string, media?: MediaAsset[]) => run(() => engine.updateDraft(id, body, media ?? [])),
    addImage: (id: string, file: LocalFileMeta) => run(() => engine.addLocalMedia(id, file)),
    addMedia: (id: string, file: LocalFileMeta) => run(() => engine.addLocalMedia(id, file)),
    toggleMedia: (contentId: string, mediaId: string, attach: boolean) =>
      run(() => engine.toggleMediaAttach(contentId, mediaId, attach)),
    removeMedia: (contentId: string, mediaId: string) => run(() => engine.removeMedia(contentId, mediaId)),
    ingestFiles: async (contentId: string, files: FileList | File[]) => {
      const list = Array.from(files);
      for (const file of list) {
        const localPath = await persistPickedFile(file);
        const before = engine.snapshot().contents.find((c) => c.id === contentId);
        const added = await run(() =>
          engine.addLocalMedia(contentId, {
            name: file.name,
            size: file.size,
            mimeType: file.type,
            localPath,
          }),
        );
        const after = added ?? engine.snapshot().contents.find((c) => c.id === contentId);
        const newMed = after?.media.find((m) => !before?.media.some((x) => x.id === m.id));
        if (newMed) rememberPreview(newMed.id, URL.createObjectURL(file));
        if (hasElectronHost() && !localPath) {
          setToast("NOT_READY: Không lưu được path file. Dùng «Chọn từ máy» (hộp thoại PMAI, không phải Open của Facebook).");
        }
      }
    },
    pickFromDisk: async (contentId: string) => {
      const picked = await hostInvoke<
        | { files: { path?: string; localPath?: string; name: string; size: number; mimeType: string }[] }
        | { path?: string; localPath?: string; name: string; size: number; mimeType: string }[]
      >("chrome.pickImages");
      const list = Array.isArray(picked.data)
        ? picked.data
        : picked.data && "files" in picked.data
          ? picked.data.files
          : [];
      if (!picked.ok) {
        if (picked.error) setToast(picked.error.message);
        return false;
      }
      if (!list.length) return false;
      let added = 0;
      for (const f of list) {
        const localPath = (f.path || f.localPath || "").trim();
        if (!localPath || looksLikeMediaId(localPath) || looksLikeMediaId(f.name)) continue;
        await run(() =>
          engine.addLocalMedia(contentId, {
            name: f.name,
            size: f.size,
            mimeType: f.mimeType,
            localPath,
          }),
        );
        added += 1;
      }
      if (!added) {
        setToast("NOT_READY: Hộp thoại không trả path Windows. Thử lại «Chọn ảnh/video».");
        return false;
      }
      return true;
    },
    importMediaUrl: async (contentId: string, url: string) => {
      const u = url.trim();
      if (!u) return;
      let localPath: string | undefined;
      let sourceUrl: string | undefined;
      try {
        const resolved = resolveMediaSource(u);
        if (resolved.kind === "http") sourceUrl = resolved.value;
        else localPath = resolved.value;
      } catch (e) {
        setToast(e instanceof Error ? e.message : "URL/path không hợp lệ");
        return;
      }
      if (hasElectronHost()) {
        const r = await hostInvoke<{ path: string }>("chrome.resolveMedia", { source: u });
        if (r.ok && r.data?.path) localPath = r.data.path;
        else if (!r.ok) {
          setToast(r.error?.message ?? "Không resolve được media");
          return;
        }
      }
      const name = (localPath || u).split(/[/\\]/).pop()?.split("?")[0] || "media.bin";
      await run(() =>
        engine.addLocalMedia(contentId, {
          name,
          size: 0,
          mimeType: /\.(mp4|mov|webm)$/i.test(name) ? "video/mp4" : "image/jpeg",
          sourceUrl,
          localPath,
        }),
      );
    },
    submit: (id: string) => run(() => engine.submitForApproval(id)),
    decide: (id: string, d: "APPROVE" | "REJECT" | "CANCEL") => run(() => engine.decideApproval(id, d)),
    execute: (taskId: string) =>
      run(() => {
        const session = engine.sessionOwningTask(taskId);
        const dir = session?.profile?.chromeDirectory || session?.profile?.id || engine.snapshot().profile?.chromeDirectory;
        const browser = hasElectronHost() ? new HostBrowserAdapter(dir) : undefined;
        return engine.executeTask(taskId, browser);
      }),
    executeEnabled: () =>
      run(() =>
        engine.executeEnabledSessions((sessionId) => {
          const s = engine.snapshot().sessions.find((x) => x.id === sessionId);
          const dir = s?.profile.chromeDirectory || s?.profile.id;
          if (hasElectronHost()) return new HostBrowserAdapter(dir);
          const dest = s?.pages.find((p) => p.id === s.selectedPageId) ?? s?.pages[0];
          return new FakeBrowserAdapter({
            pageName: dest?.name,
            pageUrl: dest?.url,
          });
        }),
      ),
    selectSession: (id: string) => run(() => engine.selectSession(id)),
    toggleSession: (id: string, enabled: boolean) => run(() => engine.toggleSessionEnabled(id, enabled)),
    launchSession: async (sessionId: string) => {
      const s = engine.snapshot().sessions.find((x) => x.id === sessionId);
      const dir = s?.profile.chromeDirectory || s?.profile.id;
      if (!dir) {
        setToast("Session chưa gắn hồ sơ Chrome.");
        return;
      }
      await engine.selectSession(sessionId);
      if (!hasElectronHost()) {
        refresh();
        return;
      }
      const launched = await hostInvoke("chrome.autoConnect", { directory: dir, profileId: dir, reuse: true });
      if (!launched.ok) setToast(launched.error?.message ?? "Không mở được Chrome");
      refresh();
    },
    confirm: (taskId: string, found: boolean) => run(() => engine.confirmVerification(taskId, found)),
    clone: (id: string) => run(() => engine.cloneContent(id)),
    setLlm: (p: "openai" | "gemini" | "anthropic" | "xai" | "mock", model: string, key: string | null) =>
      run(() => engine.setLlm(p, model, key)),
    testLlm: () => run(() => engine.testLlm()),
    clearKey: () => run(() => engine.clearLlmKey()),
    setBrand: engine.setBrandFacts.bind(engine),
    setVoice: (v: VoiceProfile) => {
      engine.setVoice(v);
      refresh();
    },
    setContact: (t: ContactTemplate[], append: boolean) => {
      engine.setContactTemplates(t, append);
      refresh();
    },
    setIdle: engine.setIdle.bind(engine),
    reset: () => {
      engine.resetDemo();
      refresh();
    },
  };
}
