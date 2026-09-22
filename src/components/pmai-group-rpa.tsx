import { useMemo, useState } from "react";
import { destType, destinationsOf, allPagesOf } from "@/lib/pmai/dest.ts";
import { hasElectronHost } from "@/lib/pmai/ipc.ts";
import { HostBrowserAdapter } from "@/lib/pmai/host-browser.ts";
import type { usePmai } from "@/lib/pmai/use-pmai.ts";

export function GroupRpa({ api }: { api: ReturnType<typeof usePmai> }) {
  const { snap, engine, refresh, setToast } = api;
  const groups = destinationsOf(allPagesOf(snap), "GROUP");
  const selected = groups.find((g) => g.id === snap.selectedPageId) ?? groups[0] ?? null;
  const [busyScan, setBusyScan] = useState(false);
  const posts = useMemo(
    () => (snap.groupPosts ?? []).filter((p) => !selected || p.pageTargetId === selected.id),
    [snap.groupPosts, selected],
  );
  const potential = posts.filter((p) => p.bucket === "POTENTIAL");
  const skipped = posts.filter((p) => p.bucket !== "POTENTIAL");

  async function scan() {
    if (!selected) {
      setToast("Thêm đích Group trong Tài khoản trước.");
      return;
    }
    api.selectPage(selected.id);
    setBusyScan(true);
    setToast(null);
    try {
      let raw: { author?: string; text: string; permalink?: string | null }[] = [];
      if (hasElectronHost()) {
        const session = engine.sessionOwningPage(selected.id);
        const dir = session?.profile.chromeDirectory || session?.profile.id;
        const adapter = new HostBrowserAdapter(dir);
        await adapter.launchProfile(dir || selected.id);
        raw =
          (await adapter.scrapeGroup?.({
            url: selected.url,
            maxScrolls: snap.groupRpa.maxScrollRounds,
            maxPosts: snap.groupRpa.maxPosts,
          })) ?? [];
      } else {
        raw = [
          { author: "Hà", text: "Ae cho hỏi combo Hạ Long 2N1Đ nào ổn, đi cuối tuần này 4 người?" },
          { author: "Minh", text: "Xin review homestay Sapa gần Fansipan, đi 2 người." },
          { author: "Shop", text: "Inbox em ngay hotline đặt combo giá sốc" },
          { author: "HR", text: "Tuyển dụng nhân viên sale tour, lương cứng 8tr" },
          { author: "Vy", text: "Check-in Sapa hôm nay trời đẹp quá" },
        ];
      }
      engine.ingestScrapedPosts(selected.id, raw);
      for (const p of engine
        .snapshot()
        .groupPosts.filter((x) => x.pageTargetId === selected.id && x.bucket === "POTENTIAL" && !x.commentDraft)) {
        await engine.generateGroupComment(p.id);
      }
      refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Quét group lỗi");
    } finally {
      setBusyScan(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="font-serif text-3xl">Comment group</h1>
      <p className="mt-2 text-sm text-muted">
        Cuộn feed group đã tham gia → lọc bài tiềm năng → AI soạn comment → bạn duyệt → Chrome mới gõ phím. Mặc định chỉ
        gõ, không tự bấm Gửi.
      </p>
      <div className="mt-5 rounded-xl border border-border bg-surface p-4">
        <p className="font-sans text-xs font-medium uppercase tracking-wide text-subtle">Group đang quét</p>
        {groups.length ? (
          <select
            className="mt-2 h-11 w-full rounded-md border border-border px-3"
            value={selected?.id ?? ""}
            onChange={(e) => api.selectPage(e.target.value)}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-2 text-sm text-muted">Chưa có đích Group. Vào Tài khoản → Thêm đích → Group.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="h-11 rounded-md bg-accent px-4 text-sm text-accent-fg"
            disabled={!selected || busyScan}
            onClick={() => void scan()}
          >
            {busyScan ? "Đang cuộn / cào…" : hasElectronHost() ? "Quét group trên Chrome" : "Chạy demo phân loại"}
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(snap.groupRpa?.autoSubmitComment)}
              onChange={(e) => {
                engine.setGroupRpa({ autoSubmitComment: e.target.checked });
                refresh();
              }}
            />
            Tự bấm Gửi sau khi duyệt (mặc định tắt)
          </label>
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-subtle">Tiềm năng</p>
          <p className="mt-1 font-serif text-2xl">{potential.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-subtle">Bỏ qua</p>
          <p className="mt-1 font-serif text-2xl">{skipped.length}</p>
        </div>
      </div>
      <h2 className="mt-8 font-serif text-2xl">Bài tiềm năng</h2>
      <ul className="mt-3 space-y-3">
        {potential.map((p) => (
          <li key={p.id} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs text-subtle">
              {p.author || "Ẩn danh"} · {p.intent || "—"} · {(p.destinations || []).join(", ") || "chưa rõ"} · điểm {p.score}
            </p>
            <p className="mt-2 text-sm">{p.text.slice(0, 320)}</p>
            <textarea
              className="mt-3 min-h-24 w-full rounded-md border border-border p-2 text-sm"
              value={p.commentDraft}
              onChange={(e) => {
                engine.updateGroupComment(p.id, e.target.value);
                refresh();
              }}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="h-10 rounded-md border border-border px-3 text-sm"
                onClick={async () => {
                  await engine.generateGroupComment(p.id);
                  refresh();
                }}
              >
                AI sinh lại
              </button>
              <button
                type="button"
                className="h-10 rounded-md bg-accent px-3 text-sm text-accent-fg"
                onClick={async () => {
                  try {
                    await engine.submitGroupComment(p.id);
                    refresh();
                    setToast("Đã gửi duyệt comment. Vào tab Duyệt.");
                  } catch (e) {
                    setToast(e instanceof Error ? e.message : "Không gửi duyệt được");
                  }
                }}
              >
                Gửi duyệt comment
              </button>
            </div>
          </li>
        ))}
      </ul>
      <h2 className="mt-10 font-serif text-2xl">Bài bỏ qua</h2>
      <ul className="mt-3 space-y-2">
        {skipped.slice(0, 20).map((p) => (
          <li key={p.id} className="rounded-lg border border-border px-3 py-2 text-sm">
            <span className="text-xs text-subtle">{p.skipReason || p.bucket}</span>
            <p className="mt-1 text-muted">{p.text.slice(0, 180)}</p>
          </li>
        ))}
      </ul>
      {selected && destType(selected) !== "GROUP" ? <p className="mt-4 text-sm text-warn">Đích đang chọn không phải Group.</p> : null}
    </section>
  );
}
