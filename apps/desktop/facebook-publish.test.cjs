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
});
