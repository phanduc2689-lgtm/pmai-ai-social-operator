export interface HostResult<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; stages?: { name: string; ok: boolean; detail?: string }[] };
}

type PmaiBridge = { invoke: (channel: string, payload?: unknown) => Promise<HostResult<unknown>> };

function installHttpBridge(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { pmai?: PmaiBridge };
  if (w.pmai?.invoke) return;
  const q = new URLSearchParams(window.location.search);
  const port = q.get("pmaiPort");
  const token = q.get("pmaiToken");
  if (!port || !token) return;
  w.pmai = {
    invoke: async (channel, payload) => {
      const r = await fetch(`http://127.0.0.1:${port}/pmai/invoke`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-pmai-token": token },
        body: JSON.stringify({ channel, payload }),
      });
      if (!r.ok) {
        return { ok: false, error: { code: "NOT_READY", message: `IPC HTTP ${r.status}` } };
      }
      return (await r.json()) as HostResult<unknown>;
    },
  };
}

export function hasElectronHost(): boolean {
  if (typeof window === "undefined") return false;
  installHttpBridge();
  return Boolean((window as unknown as { pmai?: PmaiBridge }).pmai?.invoke);
}

export async function hostInvoke<T>(channel: string, payload?: unknown): Promise<HostResult<T>> {
  if (!hasElectronHost()) {
    return {
      ok: false,
      error: {
        code: "NOT_READY",
        message: "Chưa chạy bản Electron. Trên Windows: npm run electron:dev để quét Chrome thật.",
      },
    };
  }
  try {
    const raw = await (window as unknown as { pmai: PmaiBridge }).pmai.invoke(channel, payload);
    return raw as HostResult<T>;
  } catch (e) {
    return { ok: false, error: { code: "NOT_READY", message: e instanceof Error ? e.message : "IPC lỗi" } };
  }
}
