"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  isExactPublishName,
  isExactNextName,
  isExactSaveName,
  normalizeLabel,
  pickFooterPublish,
} = require("./facebook-publish.cjs");

describe("exact CTA names", () => {
  it("accepts Đăng / Post and rejects Đăng ngay", () => {
    assert.equal(isExactPublishName("Đăng"), true);
    assert.equal(isExactPublishName("Post"), true);
    assert.equal(isExactPublishName("Đăng ngay"), false);
    assert.equal(isExactPublishName("Đăng bài"), false);
    assert.equal(isExactPublishName("Đăng lên Facebook"), false);
    assert.equal(isExactPublishName("Đăng ẩn danh"), false);
  });

  it("normalizes NBSP / ZWSP so footer Đăng still matches", () => {
    assert.equal(isExactPublishName("Đăng\u00a0"), true);
    assert.equal(isExactPublishName("\u200bĐăng"), true);
    assert.equal(normalizeLabel("  Đăng  "), "Đăng");
  });

  it("does not treat Tiếp cận… as Tiếp", () => {
    assert.equal(isExactNextName("Tiếp"), true);
    assert.equal(isExactNextName("Next"), true);
    assert.equal(
      isExactNextName("Tiếp cận nhiều người hơn khi bạn chia sẻ bài viết trong các nhóm phù hợp."),
      false,
    );
  });

  it("recognizes Lưu / Save", () => {
    assert.equal(isExactSaveName("Lưu"), true);
    assert.equal(isExactSaveName("Save"), true);
    assert.equal(isExactSaveName("Lưu nháp"), false);
  });
});

describe("footer pairing", () => {
  it("picks footer Đăng even when the modal ancestor also contains Đăng ngay", () => {
    const nodes = [
      {
        id: "dang-ngay-row",
        text: "Đăng ngay",
        aria: "",
        visible: true,
        ancestorIds: ["body", "modal"],
      },
      {
        id: "save",
        text: "Lưu",
        aria: "",
        visible: true,
        ancestorIds: ["body", "modal", "footer"],
      },
      {
        id: "publish",
        text: "Đăng",
        aria: "",
        visible: true,
        ancestorIds: ["body", "modal", "footer"],
      },
    ];
    assert.equal(pickFooterPublish(nodes), "publish");
  });

  it("does not pick Đăng ngay as the publish button", () => {
    const nodes = [
      { id: "row", text: "Đăng ngay", aria: "", visible: true, ancestorIds: ["modal"] },
      { id: "save", text: "Lưu", aria: "", visible: true, ancestorIds: ["modal", "footer"] },
      { id: "publish", text: "Đăng", aria: "", visible: true, ancestorIds: ["modal", "footer"] },
    ];
    assert.notEqual(pickFooterPublish(nodes), "row");
    assert.equal(pickFooterPublish(nodes), "publish");
  });

  it("matches div[role=button] labeled via aria, not only <button>", () => {
    const nodes = [
      { id: "save", text: "", aria: "Lưu", visible: true, ancestorIds: ["footer"] },
      { id: "publish", text: "", aria: "Đăng", visible: true, ancestorIds: ["footer"] },
    ];
    assert.equal(pickFooterPublish(nodes), "publish");
  });

  it("returns null when there is no exact Đăng", () => {
    const nodes = [
      { id: "row", text: "Đăng ngay", aria: "", visible: true, ancestorIds: ["modal"] },
      { id: "save", text: "Lưu", aria: "", visible: true, ancestorIds: ["modal"] },
    ];
    assert.equal(pickFooterPublish(nodes), null);
  });
});

async function withChromium(fn) {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    return;
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    return;
  }
  try {
    await fn(browser);
  } finally {
    await browser.close();
  }
}

describe("composer fixture — footer Đăng, not Đăng ngay", () => {
  it("clicks exact Đăng in a settings layer that also contains Đăng ngay", async () => {
    await withChromium(async (browser) => {
      const { publishFromComposer } = require("./facebook-publish.cjs");
      const page = await browser.newPage();
      await page.setContent(`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"></head>
<body>
  <div id="layer" aria-modal="true" role="dialog" style="position:fixed;inset:0;background:#fff">
    <h2>Cài đặt bài viết</h2>
    <div id="schedule-row" role="button" tabindex="0">Đăng ngay</div>
    <p>Ai có thể xem bài viết này</p>
    <div id="footer" style="display:flex;gap:12px;margin-top:24px">
      <div role="button" id="save" tabindex="0">Lưu</div>
      <div role="button" id="publish" tabindex="0"><span>Đăng</span></div>
    </div>
  </div>
  <script>
    window.__cta = null;
    document.getElementById("schedule-row").addEventListener("click", () => { window.__cta = "dang-ngay"; });
    document.getElementById("save").addEventListener("click", () => { window.__cta = "save"; });
    document.getElementById("publish").addEventListener("click", () => {
      window.__cta = "publish";
      document.getElementById("layer").remove();
    });
  </script>
</body></html>`);
      const result = await publishFromComposer(page, { hasMedia: false });
      assert.equal(result.ok, true);
      assert.equal(await page.evaluate(() => window.__cta), "publish");
    });
  });

  it("still finds Đăng when the layer has no role=dialog", async () => {
    await withChromium(async (browser) => {
      const { publishFromComposer } = require("./facebook-publish.cjs");
      const page = await browser.newPage();
      await page.setContent(`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"></head>
<body>
  <div id="layer">
    <div>Cài đặt bài viết</div>
    <div id="schedule-row">Đăng ngay</div>
    <div id="footer">
      <div tabindex="0" id="save">Lưu</div>
      <div tabindex="0" id="publish">Đăng</div>
    </div>
  </div>
  <script>
    window.__cta = null;
    document.getElementById("schedule-row").addEventListener("click", () => { window.__cta = "dang-ngay"; });
    document.getElementById("publish").addEventListener("click", () => {
      window.__cta = "publish";
      document.getElementById("layer").remove();
    });
  </script>
</body></html>`);
      const result = await publishFromComposer(page, { hasMedia: false });
      assert.equal(result.ok, true);
      assert.equal(await page.evaluate(() => window.__cta), "publish");
    });
  });

  it("PROFILE: clicks Đăng on Tạo bài viết, never Tiếp", async () => {
    await withChromium(async (browser) => {
      const { publishFromComposer } = require("./facebook-publish.cjs");
      const page = await browser.newPage();
      await page.setContent(`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"></head>
<body>
  <div role="dialog" aria-modal="true" id="composer">
    <h2>Tạo bài viết</h2>
    <div contenteditable="true">Bạn đang nghĩ gì?</div>
    <div id="next" role="button" tabindex="0">Tiếp</div>
    <div id="publish" role="button" tabindex="0">Đăng</div>
  </div>
  <script>
    window.__cta = null;
    document.getElementById("next").addEventListener("click", () => { window.__cta = "next"; });
    document.getElementById("publish").addEventListener("click", () => {
      window.__cta = "publish";
      document.getElementById("composer").remove();
    });
  </script>
</body></html>`);
      const result = await publishFromComposer(page, { hasMedia: false, destinationType: "PROFILE" });
      assert.equal(result.ok, true);
      assert.equal(await page.evaluate(() => window.__cta), "publish");
    });
  });

  it("PAGE video: Tạo bài viết → Tiếp → Chỉnh sửa thước phim → Tiếp → Cài đặt thước phim → Đăng", async () => {
    await withChromium(async (browser) => {
      const { publishFromComposer } = require("./facebook-publish.cjs");
      const page = await browser.newPage();
      await page.setContent(`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"></head>
<body>
  <div id="composer" role="dialog" aria-modal="true">
    <h2>Tạo bài viết</h2>
    <p>Khám phá cùng PMAI.</p>
    <video width="240" height="140"></video>
    <div id="next1" role="button" tabindex="0">Tiếp</div>
  </div>
  <script>
    window.__steps = [];
    function show(html) { document.body.innerHTML = html; bind(); }
    function bind() {
      const n1 = document.getElementById("next1");
      if (n1) n1.addEventListener("click", () => {
        window.__steps.push("composer-next");
        show(\`<div id="reel" role="dialog" aria-modal="true">
          <h2>Chỉnh sửa thước phim</h2>
          <div id="next2" role="button" tabindex="0">Tiếp</div>
        </div>\`);
      });
      const n2 = document.getElementById("next2");
      if (n2) n2.addEventListener("click", () => {
        window.__steps.push("reel-next");
        show(\`<div id="settings" role="dialog" aria-modal="true">
          <h2>Cài đặt thước phim</h2>
          <div id="save" role="button" tabindex="0">Lưu</div>
          <div id="publish" role="button" tabindex="0">Đăng</div>
        </div>\`);
      });
      const pub = document.getElementById("publish");
      if (pub) pub.addEventListener("click", () => {
        window.__steps.push("publish");
        document.getElementById("settings").remove();
      });
    }
    bind();
  </script>
</body></html>`);
      const result = await publishFromComposer(page, {
        hasMedia: false,
        destinationType: "PAGE",
        hasVideo: true,
        humanPauseMs: 0,
      });
      assert.equal(result.ok, true);
      assert.deepEqual(await page.evaluate(() => window.__steps), ["composer-next", "reel-next", "publish"]);
    });
  });

  it("PAGE: dismisses Chat trực tiếp popup with Lúc khác, never Thêm nút, then Đăng", async () => {
    await withChromium(async (browser) => {
      const { publishFromComposer } = require("./facebook-publish.cjs");
      const page = await browser.newPage();
      await page.setContent(`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"></head>
<body>
  <div id="settings" role="dialog" aria-modal="true">
    <h2>Cài đặt thước phim</h2>
    <div id="save" role="button" tabindex="0">Lưu</div>
    <div id="publish" role="button" tabindex="0">Đăng</div>
  </div>
  <div id="cta" role="dialog" aria-modal="true" style="position:fixed;inset:20% 20%;background:#fff;z-index:9">
    <h2>Chat trực tiếp với khách hàng</h2>
    <p>Bạn có thể thêm nút "Gửi tin nhắn" vào bài viết.</p>
    <div id="later" role="button" tabindex="0">Lúc khác</div>
    <div id="add" role="button" tabindex="0">Thêm nút</div>
  </div>
  <script>
    window.__cta = null;
    document.getElementById("add").addEventListener("click", () => { window.__cta = "add"; });
    document.getElementById("later").addEventListener("click", () => {
      window.__cta = "later";
      document.getElementById("cta").remove();
    });
    document.getElementById("publish").addEventListener("click", () => {
      if (document.getElementById("cta")) { window.__cta = "publish-blocked"; return; }
      window.__cta = "publish";
      document.getElementById("settings").remove();
    });
  </script>
</body></html>`);
      const result = await publishFromComposer(page, { hasMedia: false, destinationType: "PAGE", humanPauseMs: 0 });
      assert.equal(result.ok, true);
      assert.equal(await page.evaluate(() => window.__cta), "publish");
    });
  });

  it("PAGE: popup appears after Đăng — click Lúc khác then Đăng again", async () => {
    await withChromium(async (browser) => {
      const { publishFromComposer } = require("./facebook-publish.cjs");
      const page = await browser.newPage();
      await page.setContent(`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"></head>
<body>
  <div id="settings" role="dialog" aria-modal="true">
    <h2>Cài đặt bài viết</h2>
    <div id="save" role="button" tabindex="0">Lưu</div>
    <div id="publish" role="button" tabindex="0">Đăng</div>
  </div>
  <script>
    window.__steps = [];
    function showCta() {
      if (document.getElementById("cta")) return;
      const wrap = document.createElement("div");
      wrap.id = "cta";
      wrap.setAttribute("role", "dialog");
      wrap.innerHTML = '<h2>Chat trực tiếp với khách hàng</h2><span id="later">Lúc khác</span><span id="add">Thêm nút</span>';
      document.body.appendChild(wrap);
      document.getElementById("later").addEventListener("click", () => {
        window.__steps.push("later");
        wrap.remove();
      });
      document.getElementById("add").addEventListener("click", () => { window.__steps.push("add"); });
    }
    let published = false;
    document.getElementById("publish").addEventListener("click", () => {
      window.__steps.push("publish");
      if (!published) {
        published = true;
        showCta();
        return;
      }
      document.getElementById("settings").remove();
    });
  </script>
</body></html>`);
      const result = await publishFromComposer(page, { hasMedia: false, destinationType: "PAGE" });
      assert.equal(result.ok, true);
      const steps = await page.evaluate(() => window.__steps);
      assert.equal(steps.includes("later"), true);
      assert.equal(steps.includes("add"), false);
      assert.ok(steps.filter((s) => s === "publish").length >= 2);
    });
  });

  it("PAGE: Lúc khác only dismisses with a real mouse click (React ignores DOM click)", async () => {
    await withChromium(async (browser) => {
      const { publishFromComposer } = require("./facebook-publish.cjs");
      const page = await browser.newPage();
      await page.setContent(`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"></head>
<body>
  <div id="settings" role="dialog" aria-modal="true">
    <h2>Cài đặt bài viết</h2>
    <div id="save" role="button" tabindex="0">Lưu</div>
    <div id="publish" role="button" tabindex="0">Đăng</div>
  </div>
  <div id="cta" role="dialog" aria-modal="true" style="position:fixed;inset:15% 20%;background:#fff;z-index:20;padding:24px">
    <h2>Chat trực tiếp với khách hàng</h2>
    <div id="laterWrap" role="button" tabindex="0" style="display:inline-block;padding:12px 20px;color:#1877f2">
      <span id="later">Lúc khác</span>
    </div>
    <div id="add" role="button" tabindex="0" style="display:inline-block;padding:12px 20px;background:#1877f2;color:#fff">Thêm nút</div>
  </div>
  <script>
    window.__cta = null;
    document.getElementById("later").addEventListener("click", (e) => { e.stopPropagation(); });
    document.getElementById("laterWrap").addEventListener("mousedown", () => {
      window.__cta = "later";
      document.getElementById("cta").remove();
    });
    document.getElementById("add").addEventListener("click", () => { window.__cta = "add"; });
    document.getElementById("publish").addEventListener("click", () => {
      if (document.getElementById("cta")) return;
      window.__cta = window.__cta === "later" ? "publish" : window.__cta;
      document.getElementById("settings").remove();
    });
  </script>
</body></html>`);
      const result = await publishFromComposer(page, { hasMedia: false, destinationType: "PAGE" });
      assert.equal(result.ok, true);
      assert.equal(await page.evaluate(() => window.__cta), "publish");
    });
  });
});
