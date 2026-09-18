import { useEffect, useRef, useState } from "react";
import { PmaiLogo } from "@/components/pmai-logo.tsx";
import { hasElectronHost, hostInvoke } from "@/lib/pmai/ipc.ts";
import type { usePmai } from "@/lib/pmai/use-pmai.ts";
import type { ConnectionMode } from "@/lib/pmai/types.ts";

type ChromeRow = {
  directory: string;
  displayName: string;
  facebookLikely: boolean;
  locked: boolean;
  userDataDir: string;
};

type Observation = { url: string; title: string; pageState: string; pageName: string | null };

const CLONE = `git clone https://github.com/phanduc2689-lgtm/pmai-ai-social-operator.git
cd pmai-ai-social-operator
CAI-DAT-WINDOWS.bat`;

export function FirstRun({ api }: { api: ReturnType<typeof usePmai> }) {
  const { snap } = api;
  const [name, setName] = useState("Hồ sơ 1");
  const [mode, setMode] = useState<ConnectionMode>("ATTACH_EXISTING");
  const [fbName, setFbName] = useState("Facebook");
  const [chromeList, setChromeList] = useState<ChromeRow[]>([]);
  const [picked, setPicked] = useState("");
  const [scanMsg, setScanMsg] = useState("Đang tìm hồ sơ Chrome…");
  const [cdp, setCdp] = useState(false);
  const [locked, setLocked] = useState(false);
  const [live, setLive] = useState<Observation | null>(null);
  const [pageName, setPageName] = useState("");
  const [pageUrl, setPageUrl] = useState("https://www.facebook.com/");
  const electron = hasElectronHost();
  const autoTried = useRef(false);

  async function scanChrome() {
    const r = await hostInvoke<ChromeRow[]>("chrome.listProfiles");
    const st = await hostInvoke<{
      cdpAvailable: boolean;
      locked: boolean;
      live: boolean;
      picked: ChromeRow | null;
    }>("chrome.status");
    if (!r.ok) {
      setScanMsg(r.error?.message ?? "Cửa sổ này là preview web — chưa gắn Chrome. Cài từ Git trên Windows.");
      return null;
    }
    const list = r.data ?? [];
    setChromeList(list);
    setCdp(Boolean(st.ok && st.data?.cdpAvailable));
    setLocked(Boolean(st.ok && st.data?.locked));
    const auto =
      (st.ok && st.data?.picked ? list.find((p) => p.directory === st.data?.picked?.directory) : null) ??
      list.find((p) => p.facebookLikely && !p.locked) ??
      list.find((p) => p.facebookLikely) ??
      list[0];
    if (auto) {
      setPicked(auto.directory);
      setName(auto.displayName);
      setScanMsg(
        auto.facebookLikely
          ? `Đã chọn sẵn hồ sơ có Facebook: ${auto.displayName}`
          : `Tìm thấy ${list.length} hồ sơ. Chưa thấy dấu hiệu Facebook — chọn hồ sơ rồi kết nối.`,
      );
    } else {
      setScanMsg("Không thấy User Data của Chrome. Cài Google Chrome rồi chạy bản Electron.");
    }
    return { list, auto, cdp: Boolean(st.ok && st.data?.cdpAvailable), locked: Boolean(st.ok && st.data?.locked) };
  }

  async function connectChrome(directory?: string, row?: ChromeRow) {
    const dir = directory || picked || "Default";
    const sel = row || chromeList.find((p) => p.directory === dir);
    const launched = await hostInvoke<{
      profile: ChromeRow | null;
      observation: Observation;
      cdpAvailable: boolean;
      liveMode: string | null;
    }>("chrome.autoConnect", { directory: dir, reuse: true });
    if (!launched.ok) {
      api.setToast(launched.error?.message ?? "Không mở được Chrome");
      return;
    }
    await api.createProfile(sel?.displayName || name, "ATTACH_EXISTING", {
      chromeDirectory: dir,
      userDataDir: sel?.userDataDir,
      facebookLikely: sel?.facebookLikely,
    });
    const obs = launched.data?.observation;
    setLive(obs ?? null);
    setCdp(Boolean(launched.data?.cdpAvailable));
    if (obs && obs.pageState !== "login") {
      const display = obs.pageName || sel?.displayName || "Facebook";
      setFbName(display);
      await api.markLoggedIn(display, { seedDemo: false });
      if (obs.url && /facebook\.com\/.+/i.test(obs.url) && !/facebook\.com\/?(login|watch|reel|marketplace)?\/?$/i.test(obs.url)) {
        const guessed = obs.pageName || "Trang Facebook";
        setPageName(guessed);
        setPageUrl(obs.url.replace(/\/$/, ""));
      }
    } else {
      api.setToast("Chrome đã mở nhưng Facebook chưa login — đăng nhập tay trên cửa sổ Chrome, rồi bấm Tôi đã đăng nhập.");
    }
  }

  useEffect(() => {
    void (async () => {
      const scanned = await scanChrome();
      if (!electron || autoTried.current || snap.firstRunStep > 1 || !scanned?.auto) return;
      if (scanned.auto.locked && !scanned.cdp) {
        setScanMsg(
          `Hồ sơ «${scanned.auto.displayName}» đang bị Chrome khóa. Đóng HẾT cửa sổ Google Chrome, hoặc chạy open-chrome-debug.bat, rồi bấm Kết nối.`,
        );
        return;
      }
      autoTried.current = true;
      await connectChrome(scanned.auto.directory, scanned.auto);
    })();
  }, []);

  return (
    <section className="mx-auto max-w-xl">
      <PmaiLogo className="mb-6 h-9" />
      <p className="font-sans text-xs font-medium tracking-[0.2em] text-accent uppercase">Bắt đầu · Chrome có sẵn</p>
      <h1 className="mt-2 font-serif text-3xl">Tự chọn hồ sơ Chrome đã login Facebook</h1>
      <p className="mt-2 font-sans text-sm text-muted">
        Không hỏi mật khẩu. Không copy cookie. PMAI quét User Data Chrome trên máy này, ưu tiên hồ sơ đã có Facebook, rồi gắn CDP.
      </p>
      {!electron ? (
        <div className="mt-4 rounded-xl border border-warn/40 bg-warn-bg p-4 text-sm">
          <p className="font-medium">Cửa sổ này là preview — chưa gắn Chrome thật.</p>
          <p className="mt-1 text-muted">Trên Windows, clone repo rồi chạy file cài:</p>
          <pre className="mt-2 overflow-x-auto rounded-md bg-code p-3 font-mono text-[11px] text-code-fg">{CLONE}</pre>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">
          CDP 9222: {cdp ? "đã mở — gắn vào Chrome đang chạy" : "chưa mở"}.{" "}
          {locked ? "Chrome đang khóa hồ sơ: đóng hết cửa sổ Chrome hoặc chạy open-chrome-debug.bat." : "Hồ sơ chưa khóa."}
          {live ? ` · ${live.pageState} · ${live.url}` : ""}
        </p>
      )}
      <ol className="mt-8 space-y-6">
        <li className={`rounded-xl border bg-surface p-5 ${snap.firstRunStep === 1 ? "border-accent" : "border-border"}`}>
          <p className="font-sans text-xs text-subtle">Bước 1</p>
          <h2 className="font-sans text-lg font-medium">Hồ sơ Chrome</h2>
          <p className="mt-1 text-sm text-muted">{scanMsg}</p>
          <ul className="mt-3 space-y-2">
            {chromeList.map((p) => (
              <li key={p.directory}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(p.directory);
                    setName(p.displayName);
                    setMode("ATTACH_EXISTING");
                  }}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-3 text-left text-sm ${
                    picked === p.directory ? "border-accent bg-info-bg" : "border-border"
                  }`}
                >
                  <span>
                    <span className="block font-medium">{p.displayName}</span>
                    <span className="text-xs text-muted">{p.directory}</span>
                  </span>
                  <span className="text-xs">
                    {p.facebookLikely ? "Facebook có vẻ đã login" : "Chưa thấy Facebook"}
                    {p.locked ? " · Chrome đang mở" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-40"
              disabled={snap.firstRunStep > 1 || (!picked && mode === "ATTACH_EXISTING")}
              onClick={() => (mode === "ATTACH_EXISTING" && picked ? connectChrome() : api.createProfile(name, mode))}
            >
              {picked ? "Kết nối hồ sơ đã chọn" : "Tạo hồ sơ PMAI"}
            </button>
            <button type="button" className="h-11 rounded-md border border-border px-3 text-sm" onClick={() => void scanChrome()}>
              Quét lại
            </button>
            <button
              type="button"
              className="h-11 rounded-md border border-border px-3 text-sm"
              onClick={() => setMode(mode === "ATTACH_EXISTING" ? "MANAGED_PROFILE" : "ATTACH_EXISTING")}
            >
              {mode === "ATTACH_EXISTING" ? "Dùng hồ sơ PMAI quản lý" : "Quay lại Chrome có sẵn"}
            </button>
          </div>
          {mode === "MANAGED_PROFILE" ? (
            <input
              className="mt-3 h-11 w-full rounded-md border border-border px-3"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên hồ sơ PMAI"
            />
          ) : null}
        </li>
        <li className={`rounded-xl border bg-surface p-5 ${snap.firstRunStep === 2 ? "border-accent" : "border-border"}`}>
          <p className="font-sans text-xs text-subtle">Bước 2</p>
          <h2 className="font-sans text-lg font-medium">Xác nhận phiên Facebook</h2>
          <p className="mt-1 text-sm text-muted">
            Nếu Chrome đã login, bước này tự xong. Nếu thấy màn login: đăng nhập tay trên cửa sổ Chrome, rồi bấm nút dưới.
          </p>
          <input
            className="mt-3 h-11 w-full rounded-md border border-border px-3"
            value={fbName}
            onChange={(e) => setFbName(e.target.value)}
            placeholder="Tên hiển thị"
          />
          <button
            type="button"
            className="mt-3 h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-40"
            disabled={snap.firstRunStep < 2 || snap.firstRunStep > 2}
            onClick={() => api.markLoggedIn(fbName, { seedDemo: electron ? false : true })}
          >
            Tôi đã đăng nhập
          </button>
        </li>
        <li className={`rounded-xl border bg-surface p-5 ${snap.firstRunStep === 3 ? "border-accent" : "border-border"}`}>
          <p className="font-sans text-xs text-subtle">Bước 3</p>
          <h2 className="font-sans text-lg font-medium">Chọn trang đích</h2>
          <p className="mt-1 text-sm text-muted">Dán URL Page Facebook thật sẽ nhận bài — không phải tên hồ sơ Chrome.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              className="h-11 rounded-md border border-border px-3 text-sm"
              placeholder="Tên Trang"
              value={pageName}
              onChange={(e) => setPageName(e.target.value)}
            />
            <input
              className="h-11 rounded-md border border-border px-3 text-sm"
              placeholder="https://www.facebook.com/ten-trang"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="mt-2 h-11 rounded-md border border-border px-4 text-sm disabled:opacity-40"
            disabled={snap.firstRunStep < 3}
            onClick={async () => {
              const p = await api.addPage(pageName, pageUrl);
              if (p) await api.selectPage(p.id);
            }}
          >
            Thêm trang và chọn
          </button>
          <ul className="mt-3 space-y-2">
            {snap.pages.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex h-12 w-full items-center justify-between rounded-md border border-border px-3 text-left text-sm hover:bg-info-bg"
                  onClick={() => api.selectPage(p.id)}
                >
                  <span>{p.name}</span>
                  <span className="text-xs text-muted">{p.url.replace("https://www.facebook.com/", "/")}</span>
                </button>
              </li>
            ))}
          </ul>
        </li>
      </ol>
    </section>
  );
}
