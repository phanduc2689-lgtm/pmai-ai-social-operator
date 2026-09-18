import { useCallback, useMemo, useState } from "react";
import { isPmaiError } from "./errors.ts";
import { HostBrowserAdapter } from "./host-browser.ts";
import { getEngine } from "./host.ts";
import { hasElectronHost } from "./ipc.ts";
import type { MediaAsset } from "./types.ts";

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
    run,
    createProfile: (
      name: string,
      mode: "ATTACH_EXISTING" | "MANAGED_PROFILE",
      extra?: { chromeDirectory?: string; userDataDir?: string; facebookLikely?: boolean },
    ) => run(() => engine.createProfile({ name, mode, ...extra })),
    markLoggedIn: (name: string, opts?: { seedDemo?: boolean }) => run(() => engine.markLoggedIn(name, opts)),
    selectPage: (id: string) => run(() => engine.selectPage(id)),
    addPage: (name: string, url: string) => run(() => engine.addPage({ name, url })),
    createDraft: (brief: string) => run(() => engine.createDraft(brief)),
    updateDraft: (id: string, body: string, media?: MediaAsset[]) => run(() => engine.updateDraft(id, body, media ?? [])),
    addImage: (id: string, file: { name: string; size: number; mimeType: string }) =>
      run(() => engine.addLocalImage(id, file)),
    submit: (id: string) => run(() => engine.submitForApproval(id)),
    decide: (id: string, d: "APPROVE" | "REJECT" | "CANCEL") => run(() => engine.decideApproval(id, d)),
    execute: (taskId: string) =>
      run(() => {
        const dir = engine.snapshot().profile?.chromeDirectory;
        const browser = hasElectronHost() ? new HostBrowserAdapter(dir) : undefined;
        return engine.executeTask(taskId, browser);
      }),
    confirm: (taskId: string, found: boolean) => run(() => engine.confirmVerification(taskId, found)),
    clone: (id: string) => run(() => engine.cloneContent(id)),
    setLlm: (p: "openai" | "gemini" | "anthropic" | "xai" | "mock", model: string, key: string | null) =>
      run(() => engine.setLlm(p, model, key)),
    testLlm: () => run(() => engine.testLlm()),
    clearKey: () => run(() => engine.clearLlmKey()),
    setBrand: engine.setBrandFacts.bind(engine),
    setIdle: engine.setIdle.bind(engine),
    reset: () => {
      engine.resetDemo();
      refresh();
    },
  };
}
