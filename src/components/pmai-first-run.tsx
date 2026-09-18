import { useEffect, useState } from "react";
import { PmaiLogo } from "@/components/pmai-logo.tsx";
import { hasElectronHost, hostInvoke } from "@/lib/pmai/ipc.ts";
import type { usePmai } from "@/lib/pmai/use-pmai.ts";

type ChromeRow = {
  id?: string;
  directory: string;
  displayName: string;
  facebookLikely: boolean;
  locked: boolean;
  userDataDir: string;
  kind?: string;
};

type Observation = { url: string; title: string; pageState: string; pageName: string | null };

const CLONE = `git clone https://github.com/phanduc2689-lgtm/pmai-ai-social-operator.git
cd pmai-ai-social-operator
CAI-DAT-WINDOWS.bat`;

export function FirstRun({ api }: { api: ReturnType<typeof usePmai> }) {
  const { snap } = api;
  const [name, setName] = useState("Hồ sơ 1");
  const [fbName, setFbName] = useState("Facebook");
  const [chromeList, setChromeList] = useState<ChromeRow[]>([]);
  const [picked, setPicked] = useState("");
  const [scanMsg, setScanMsg] = useState("Đang tải hồ sơ PMAI…");
  const [cdp, setCdp] = useState(false);
  const [live, setLive] = useState<Observation | null>(null);
  const [pageName, setPageName] = useState("");
  const [pageUrl, setPageUrl] = useState("https://www.facebook.com/");
  const electron = hasElectronHost();

  async function scanChrome() {
    const r = await hostInvoke<ChromeRow[]>("chrome.listProfiles");
    const st = await hostInvoke<{ cdpAvailable: boolean; live: boolean; picked: ChromeRow | null }>("chrome.status");
    if (!r.ok) {
      setScanMsg(r.error?.message ?? "Cửa sổ này là preview web — chưa gắn Chrome. Cài từ Git trên Windows.");
      return null;
    }
    const list = r.data ?? [];
    setChromeList(list);
    setCdp(Boolean(st.ok && st.data?.cdpAvailable));
    if (!list.length) {
      setScanMsg("Chưa có hồ sơ PMAI. Tạo hồ sơ mới — Chrome sẽ mở cửa sổ riêng. Login Facebook một lần, lần sau giữ nguyên session.");
      return { list, auto: null };
    }
    const auto = list.find((p) => p.facebookLikely && !p.locked) ?? list.find((p) => !p.locked) ?? list[0];
    if (auto) {
      setPicked(auto.directory);
      setName(auto.displayName);
      setScanMsg(
        auto.facebookLikely
          ? `Đã có hồ sơ «${auto.displayName}» đã login Facebook. Mở lại để dùng session cũ.`
          : `Đã có ${list.length} hồ sơ PMAI. Mở hồ sơ rồi login Facebook nếu cửa sổ còn trống.`,
      );
    }
    return { list, auto };
  }

  async function openProfile(directory?: string, row?: ChromeRow) {
    const dir = directory || picked;
    const sel = row || chromeList.find((p) => p.directory === dir);
    if (!dir) {
      api.setToast("Chọn hồ sơ hoặc tạo hồ sơ mới.");
      return;
    }
    const launched = await hostInvoke<{
      profile: ChromeRow | null;
      observation: Observation;
      cdpAvailable: boolean;
    }>("chrome.autoConnect", { directory: dir, profileId: dir, reuse: true });
    if (!launched.ok) {
      api.setToast(launched.error?.message ?? "Không mở được Chrome");
      return;
    }
    await api.createProfile(sel?.displayName || name, "MANAGED_PROFILE", {
      chromeDirectory: dir,
      userDataDir: sel?.userDataDir,
      facebookLikely: sel?.facebookLikely,
    });
    const obs = launched.data?.observation;
    setLive(obs ?? null);
    setCdp(Boolean(launched.data?.cdpAvailable));
    if (obs && obs.pageState !== "login" && obs.pageState !== "unknown") {
      const display = obs.pageName || sel?.displayName || "Facebook";
      setFbName(display);
      await api.markLoggedIn(display, { seedDemo: false });
    } else {
      api.setToast("Cửa sổ Chrome PMAI đã mở. Login Facebook trên cửa sổ đó (một lần), rồi bấm Tôi đã đăng nhập.");
    }
  }

  async function createNew() {
    const created = await hostInvoke<ChromeRow>("chrome.createProfile", { displayName: name || "Hồ sơ PMAI" });
    if (!created.ok || !created.data) {
      api.setToast(created.error?.message ?? "Không tạo được hồ sơ");
      return;
    }
    setPicked(created.data.directory);
    await scanChrome();
    await openProfile(created.data.directory, created.data);
  }

  async function cloneSelected() {
    if (!picked) {
      api.setToast("Chọn hồ sơ nguồn để copy session.");
      return;
    }
    const cloned = await hostInvoke<ChromeRow>("chrome.cloneProfile", {
      sourceId: picked,
      displayName: `${name || "Hồ sơ"} (bản sao)`,
    });
    if (!cloned.ok || !cloned.data) {
      api.setToast(cloned.error?.message ?? "Không copy được session");
      return;
    }
    setPicked(cloned.data.directory);
    await scanChrome();
    await openProfile(cloned.data.directory, cloned.data);
  }

  useEffect(() => {
    void scanChrome();
  }, []);

  return (
    <section className="mx-auto max-w-xl">
      <PmaiLogo className="mb-6 h-9" />
      <p className="font-sans text-xs font-medium tracking-[0.2em] text-accent uppercase">Hồ sơ PMAI · session riêng</p>
      <h1 className="mt-2 font-serif text-3xl">Mỗi tài khoản Facebook một cửa sổ Chrome riêng</h1>
      <p className="mt-2 font-sans text-sm text-muted">
        Chrome 136+ không cho debug User Data mặc định. PMAI tạo hồ sơ trong
        <span className="font-mono text-xs"> %LOCALAPPDATA%\PMAI\profiles</span>. Login một lần — lần sau mở lại cùng folder là giữ session. Copy session chỉ nhân bản hồ sơ PMAI, không lấy cookie Chrome thường.
      </p>
      {!electron ? (
        <div className="mt-4 rounded-xl border border-warn/40 bg-warn-bg p-4 text-sm">
          <p className="font-medium">Cửa sổ này là preview — chưa gắn Chrome thật.</p>
          <pre className="mt-2 overflow-x-auto rounded-md bg-code p-3 font-mono text-[11px] text-code-fg">{CLONE}</pre>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">
          CDP: {cdp ? "đã mở" : "chưa mở"}.{live ? ` · ${live.pageState} · ${live.url}` : ""}
        </p>
      )}
      <ol className="mt-8 space-y-6">
        <li className={`rounded-xl border bg-surface p-5 ${snap.firstRunStep === 1 ? "border-accent" : "border-border"}`}>
          <p className="font-sans text-xs text-subtle">Bước 1</p>
          <h2 className="font-sans text-lg font-medium">Hồ sơ Chrome do PMAI quản lý</h2>
          <p className="mt-1 text-sm text-muted">{scanMsg}</p>
          <input
            className="mt-3 h-11 w-full rounded-md border border-border px-3"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên hồ sơ mới"
          />
          <ul className="mt-3 space-y-2">
            {chromeList.map((p) => (
              <li key={p.directory}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(p.directory);
                    setName(p.displayName);
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
                    {p.facebookLikely ? "Đã có session Facebook" : "Chưa login"}
                    {p.locked ? " · Đang mở" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-40"
              disabled={snap.firstRunStep > 1 || !picked}
              onClick={() => void openProfile()}
            >
              Mở hồ sơ đã lưu
            </button>
            <button type="button" className="h-11 rounded-md border border-border px-3 text-sm" onClick={() => void createNew()}>
              Tạo hồ sơ mới
            </button>
            <button type="button" className="h-11 rounded-md border border-border px-3 text-sm" onClick={() => void cloneSelected()}>
              Copy session sang hồ sơ mới
            </button>
            <button type="button" className="h-11 rounded-md border border-border px-3 text-sm" onClick={() => void scanChrome()}>
              Làm mới
            </button>
          </div>
        </li>
        <li className={`rounded-xl border bg-surface p-5 ${snap.firstRunStep === 2 ? "border-accent" : "border-border"}`}>
          <p className="font-sans text-xs text-subtle">Bước 2</p>
          <h2 className="font-sans text-lg font-medium">Login Facebook trên cửa sổ vừa mở</h2>
          <p className="mt-1 text-sm text-muted">
            Lần đầu: đăng nhập tay trên Chrome PMAI. Không đăng nhập trên Chrome thường. Session nằm trong folder hồ sơ — lần sau không nhập lại.
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
          <p className="mt-1 text-sm text-muted">Dán URL Page Facebook thật sẽ nhận bài.</p>
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
