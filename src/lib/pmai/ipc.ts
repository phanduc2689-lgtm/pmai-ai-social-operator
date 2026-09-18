export interface HostResult<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

type PmaiBridge = { invoke: (channel: string, payload?: unknown) => Promise<HostResult<unknown>> };

export function hasElectronHost(): boolean {
  if (typeof window === "undefined") return false;
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
