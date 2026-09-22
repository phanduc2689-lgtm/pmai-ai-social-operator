import { useState } from "react";
import { Check, CircleAlert, Download, Trash2 } from "lucide-react";
import { PmaiLogo } from "@/components/pmai-logo.tsx";
import { destGlyph, destKindLabel, destType } from "@/lib/pmai/dest.ts";
import { downloadPublicFile } from "@/lib/pmai/download.ts";
import { hasElectronHost, hostInvoke } from "@/lib/pmai/ipc.ts";
import type { DestinationType } from "@/lib/pmai/types.ts";
import type { usePmai } from "@/lib/pmai/use-pmai.ts";

const CLONE = `git clone https://github.com/phanduc2689-lgtm/pmai-ai-social-operator.git
cd pmai-ai-social-operator
CAI-DAT-WINDOWS.bat`;

export function Accounts({ api }: { api: ReturnType<typeof usePmai> }) {
  const { snap } = api;
  const [picker, setPicker] = useState<null | DestinationType>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("https://www.facebook.com/");
  const [newSessionName, setNewSessionName] = useState("");

  const sessions = snap.sessions.length
    ? snap.sessions
    : snap.profile
      ? [
          {
            id: snap.profile.id,
            enabled: true,
            profile: snap.profile,
            identity: snap.identity,
            pages: snap.pages,
            selectedPageId: snap.selectedPageId,
          },
        ]
      : [];

  async function submit() {
    if (!picker) return;
    const added = await api.addDestination(picker, name, url);
    if (added) {
      setPicker(null);
      setName("");
      setUrl("https://www.facebook.com/");
    }
  }

  async function addChromeSession() {
    const label = newSessionName.trim() || `Hồ sơ ${sessions.length + 1}`;
    if (hasElectronHost()) {
      const created = await hostInvoke<{ directory: string; displayName: string; userDataDir: string; facebookLikely?: boolean }>(
        "chrome.createProfile",
        { displayName: label },
      );
      if (!created.ok || !created.data) {
        api.setToast(created.error?.message ?? "Không tạo được hồ sơ Chrome");
        return;
      }
      await api.createProfile(created.data.displayName || label, "MANAGED_PROFILE", {
        chromeDirectory: created.data.directory,
        userDataDir: created.data.userDataDir,
        facebookLikely: created.data.facebookLikely,
      });
      const sid = api.engine.snapshot().activeSessionId || api.engine.snapshot().profile?.id;
      if (sid) await api.launchSession(sid);
    } else {
      await api.createProfile(label, "MANAGED_PROFILE");
    }
    setNewSessionName("");
  }

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="font-serif text-3xl">Không gian làm việc</h1>
      <p className="mt-2 text-sm text-muted">
        Mỗi session là một hồ sơ Chrome = một tài khoản Facebook. Chọn session để chạy — PMAI mở nhiều cửa sổ Chrome cùng lúc, mỗi cửa sổ một account.
      </p>

      <div className="mt-6 space-y-3">
        {sessions.map((s) => {
          const on = s.id === snap.activeSessionId || (!snap.activeSessionId && s.id === snap.profile?.id);
          return (
            <div
              key={s.id}
              className={`rounded-xl border p-4 ${on ? "border-accent bg-info-bg" : "border-border bg-surface"}`}
            >
              <div className="flex items-start gap-3">
                <label className="mt-1 flex size-11 items-center justify-center">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={s.enabled}
                    onChange={(e) => api.toggleSession(s.id, e.target.checked)}
                    aria-label={`Chọn session ${s.profile.name}`}
                  />
                </label>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => api.selectSession(s.id)}>
                  <p className="font-medium">{s.profile.name}</p>
                  <p className="text-xs text-muted">
                    {s.identity?.displayName ?? "Chưa đăng nhập"} · {s.identity?.sessionStatus ?? "UNKNOWN"} · {s.pages.length}{" "}
                    đích
                  </p>
                  {s.profile.chromeDirectory ? <p className="text-xs text-subtle">{s.profile.chromeDirectory}</p> : null}
                </button>
                {on ? <Check className="size-4 shrink-0" /> : null}
                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    type="button"
                    className="h-11 rounded-md border border-border px-3 text-xs"
                    onClick={() => api.launchSession(s.id)}
                  >
                    Mở Chrome
                  </button>
                  {s.identity?.sessionStatus !== "CONNECTED" ? (
                    <button
                      type="button"
                      className="h-11 rounded-md bg-accent px-3 text-xs text-accent-fg"
                      onClick={() => api.confirmLogin(s.id)}
                    >
                      Tôi đã đăng nhập
                    </button>
                  ) : null}
                </div>
              </div>
              {s.identity?.sessionStatus !== "CONNECTED" ? (
                <p className="mt-2 pl-14 text-xs text-muted">
                  Mở Chrome của đúng hồ sơ này, login Facebook trên cửa sổ đó, rồi bấm «Tôi đã đăng nhập». PMAI không lấy mật khẩu.
                </p>
              ) : null}
            </div>
          );
        })}

        <div className="rounded-xl border border-dashed border-border bg-surface p-4">
          <p className="text-sm font-medium">+ Thêm session / hồ sơ Chrome</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              className="h-11 min-w-40 flex-1 rounded-md border border-border px-3 text-sm"
              placeholder="Tên hồ sơ mới"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
            />
            <button type="button" className="h-11 rounded-md bg-accent px-4 text-sm text-accent-fg" onClick={() => void addChromeSession()}>
              Tạo session
            </button>
          </div>
        </div>

        {sessions.filter((s) => s.enabled).length > 0 && snap.tasks.some((t) => t.status === "QUEUED") ? (
          <button type="button" className="h-12 w-full rounded-md bg-accent text-sm font-medium text-accent-fg" onClick={() => api.executeEnabled()}>
            Chạy {sessions.filter((s) => s.enabled).length} session đã chọn
          </button>
        ) : null}

        <p className="pt-2 text-xs font-medium uppercase tracking-wide text-subtle">Đích Facebook của session đang chọn</p>
        {snap.pages.map((p) => {
          const kind = destType(p);
          const on = p.id === snap.selectedPageId;
          return (
            <div
              key={p.id}
              className={`flex w-full items-center gap-3 rounded-xl border p-4 ${on ? "border-accent bg-info-bg" : "border-border bg-surface"}`}
            >
              <button type="button" onClick={() => api.selectPage(p.id)} className="min-w-0 flex-1 text-left">
                <span className="block font-medium">
                  {destGlyph(kind)} {p.name}
                </span>
                <span className="text-xs text-muted">
                  {destKindLabel(kind)} · {p.status === "VERIFIED" ? "Ready" : p.status} · {p.url}
                </span>
              </button>
              {on ? <Check className="size-4 shrink-0" /> : null}
              <button type="button" className="shrink-0 text-muted hover:text-danger" onClick={() => api.removePage(p.id)} aria-label="Xóa đích">
                <Trash2 className="size-4" />
              </button>
            </div>
          );
        })}

        {picker ? (
          <div className="rounded-xl border border-accent bg-surface p-4">
            <p className="text-sm font-medium">Thêm {destKindLabel(picker)}</p>
            {picker === "PROFILE" ? (
              <p className="mt-1 text-xs text-muted">Lấy từ phiên Facebook đang login. Không nhập mật khẩu.</p>
            ) : picker === "GROUP" ? (
              <p className="mt-1 text-xs text-muted">Dán URL facebook.com/groups/… Không coi group là fanpage.</p>
            ) : (
              <p className="mt-1 text-xs text-muted">
                Fanpage cá nhân hoặc doanh nghiệp: facebook.com/ten-trang hoặc profile.php?id=… Không dùng URL group.
              </p>
            )}
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                className="h-11 rounded-md border border-border px-3 text-sm"
                placeholder={picker === "GROUP" ? "Tên group" : picker === "PROFILE" ? "Tên hiển thị" : "Tên Fanpage"}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="h-11 rounded-md border border-border px-3 text-sm"
                placeholder={
                  picker === "GROUP"
                    ? "https://www.facebook.com/groups/…"
                    : picker === "PROFILE"
                      ? "https://www.facebook.com/profile.php?id=…"
                      : "https://www.facebook.com/ten-trang hoặc profile.php?id=…"
                }
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {picker === "PROFILE" ? (
                <button type="button" className="h-11 rounded-md bg-accent px-4 text-sm text-accent-fg" onClick={() => api.addProfileFromSession()}>
                  Thêm từ phiên hiện tại
                </button>
              ) : null}
              <button type="button" className="h-11 rounded-md bg-accent px-4 text-sm text-accent-fg" onClick={() => void submit()}>
                Thêm {destKindLabel(picker)}
              </button>
              <button type="button" className="h-11 rounded-md border border-border px-4 text-sm" onClick={() => setPicker(null)}>
                Hủy
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-surface p-4">
            <p className="text-sm font-medium">+ Thêm đích Facebook</p>
            <p className="mt-1 text-xs text-muted">Bạn muốn thêm loại nào?</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {(["PROFILE", "PAGE", "GROUP"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className="h-16 rounded-md border border-border px-3 text-left text-sm hover:border-accent hover:bg-info-bg"
                  onClick={() => {
                    setPicker(t);
                    setName("");
                    setUrl(
                      t === "GROUP"
                        ? "https://www.facebook.com/groups/"
                        : t === "PROFILE"
                          ? "https://www.facebook.com/profile.php?id="
                          : "https://www.facebook.com/",
                    );
                  }}
                >
                  <span className="block font-medium">
                    {destGlyph(t)} {destKindLabel(t)}
                  </span>
                  <span className="text-xs text-muted">{t === "PAGE" ? "Facebook Page" : t === "GROUP" ? "Facebook Group" : "Facebook Profile"}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function Logs({ api }: { api: ReturnType<typeof usePmai> }) {
  const { snap, needsCheck } = api;
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="font-serif text-3xl">Nhật ký</h1>
      {needsCheck.map((t) => (
        <div key={t.id} className="mt-4 flex items-start gap-2 rounded-md bg-warn-bg p-3 text-sm">
          <CircleAlert className="mt-0.5 size-4 text-warn" />
          Task {t.id.slice(-6)} cần kiểm tra kết quả.
        </div>
      ))}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left font-sans text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-subtle">
              <th className="py-2">Thời gian</th>
              <th>Hành động</th>
              <th>Kết quả</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {snap.activities.map((a) => (
              <tr key={a.id} className="border-b border-border/60">
                <td className="py-2 align-top text-xs text-muted">{a.at.slice(11, 19)}</td>
                <td className="align-top">{a.action}</td>
                <td className="align-top">{a.result}</td>
                <td className="align-top text-muted">{a.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function HelpScreen() {
  const steps = [
    ["1. Cài bản thật trên Windows", "Clone GitHub rồi chạy CAI-DAT-WINDOWS.bat. Preview web không gắn được Chrome của bạn."],
    ["2. Hồ sơ Chrome", "Mỗi tài khoản Facebook một hồ sơ PMAI / một cửa sổ Chrome. Tài khoản → thêm session, tick để chạy nhiều cửa sổ cùng lúc."],
    ["3. Đăng nhập", "Nếu Facebook đã login, bước này tự xong. Nếu thấy màn login: login tay trên cửa sổ Chrome."],
    ["4. Chọn đích đăng", "Tài khoản → Thêm đích: Trang cá nhân, Fanpage, hoặc Group. Không gộp 3 loại thành một «Trang»."],
    ["5. Soạn nháp", "Tạo bài đăng → Soạn bản nháp. Sửa chữ, thêm ảnh local. Chưa mở composer Facebook."],
    ["6. Duyệt & cho phép đăng", "Gửi duyệt → Duyệt & cho phép đăng. Chrome mới gõ bài và bấm Đăng."],
    ["7. Kết quả", "SUCCESS = đã ghi permalink. Cần kiểm tra kết quả = có thể đã lên — không đăng lại ngay."],
  ];
  const electron = hasElectronHost();
  return (
    <section className="mx-auto max-w-2xl">
      <PmaiLogo className="mb-4 h-9" />
      <h1 className="font-serif text-3xl">Hướng dẫn sử dụng</h1>
      <p className="mt-2 text-sm text-muted">AI soạn nháp — bạn duyệt — Chrome trên máy mới đăng.</p>
      <pre className="mt-3 overflow-x-auto rounded-md bg-code p-3 font-mono text-xs text-code-fg">{CLONE}</pre>
      {!electron ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadPublicFile("/PMAI-HDSD-MVP1.docx", "PMAI-HDSD-MVP1.docx")}
            className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 font-sans text-sm font-medium text-accent-fg"
          >
            <Download className="size-4" strokeWidth={1.75} />
            Tải HDSD Word
          </button>
        </div>
      ) : null}
      <ol className="mt-8 space-y-4">
        {steps.map(([t, d]) => (
          <li key={t} className="rounded-xl border border-border bg-surface p-4">
            <h2 className="font-sans text-sm font-medium">{t}</h2>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function SettingsScreen({ api }: { api: ReturnType<typeof usePmai> }) {
  const { snap } = api;
  const [provider, setProvider] = useState(snap.llm.provider);
  const [model, setModel] = useState(snap.llm.model);
  const [key, setKey] = useState("");
  const [facts, setFacts] = useState(snap.brandFacts);

  return (
    <section className="mx-auto max-w-xl space-y-8">
      <h1 className="font-serif text-3xl">Cài đặt</h1>
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-sans text-sm font-medium">AI · BYOK</h2>
        <p className="mt-1 text-sm text-muted">Bạn tự trả phí nhà cung cấp. Key không hiện lại đầy đủ, không vào log.</p>
        <select className="mt-3 h-11 w-full rounded-md border border-border px-3" value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>
          <option value="mock">Demo (không gọi API)</option>
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
          <option value="anthropic">Anthropic</option>
          <option value="xai">xAI / Grok</option>
        </select>
        <input className="mt-2 h-11 w-full rounded-md border border-border px-3" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" />
        <input
          className="mt-2 h-11 w-full rounded-md border border-border px-3"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="API key — dán một lần"
          autoComplete="off"
        />
        <p className="mt-2 text-xs text-muted">
          Đang dùng: {snap.llm.provider} {snap.llm.keyMasked || "(không có khóa)"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="h-11 rounded-md bg-accent px-4 text-sm text-accent-fg" onClick={() => api.setLlm(provider, model, key || null)}>
            Lưu
          </button>
          <button type="button" className="h-11 rounded-md border border-border px-4 text-sm" onClick={() => api.testLlm()}>
            Kiểm tra kết nối
          </button>
          <button type="button" className="h-11 rounded-md border border-border px-4 text-sm" onClick={() => api.clearKey()}>
            Xóa khóa API
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-sans text-sm font-medium">Brand Facts</h2>
        {(["hotline", "pageName", "priceNote", "policyNote"] as const).map((k) => (
          <input
            key={k}
            className="mt-2 h-11 w-full rounded-md border border-border px-3"
            placeholder={k}
            value={facts[k]}
            onChange={(e) => setFacts({ ...facts, [k]: e.target.value })}
          />
        ))}
        <button
          type="button"
          className="mt-3 h-11 rounded-md bg-accent px-4 text-sm text-accent-fg"
          onClick={() => {
            api.setBrand(facts);
            api.refresh();
          }}
        >
          Lưu Brand Facts
        </button>
      </div>
      <button type="button" className="text-sm text-muted underline" onClick={() => api.reset()}>
        Xóa dữ liệu local (demo)
      </button>
    </section>
  );
}
