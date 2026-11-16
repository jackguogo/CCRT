/**
 * 训练方案卡片：去掉底部「效果测试」标签后的核验截图
 * 断言：卡片底部只剩关卡进度条，无 .tp-play 文本；点击卡片仍能打开试玩弹窗（弹窗内合规标注保留）
 * 运行：Node 22（Playwright），工作目录 = HS-CRT-01-体验版/
 */
import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r69";
fs.mkdirSync(OUT, { recursive: true });

const bad = [];
const ok = (t, c, extra = "") => {
  console.log(`${c ? "✓" : "✗"} ${t}${extra ? "  " + extra : ""}`);
  if (!c) bad.push(t);
};

const browser = await chromium.launch({ headless: true, executablePath: EXE });

/* ---------- 医生端 ---------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
  await page.fill('input[placeholder="工号账号"]', "doctor");
  await page.fill('input[placeholder="密码"]', "hs123456");
  await page.click("button:has-text('登 录')");
  await page.waitForSelector(".lb-banner");
  await page.locator("button:visible, a:visible", { hasText: "方案管理" }).first().click();
  await page.waitForSelector(".tp-card");
  await page.waitForTimeout(700);

  const cards = await page.evaluate(() => ({
    n: document.querySelectorAll(".tp-card").length,
    play: document.querySelectorAll(".tp-play").length,
    footText: [...document.querySelectorAll(".tp-foot")].map(e => e.innerText.trim()),
    barW: [...document.querySelectorAll(".tp-levels")].map(e => Math.round(e.getBoundingClientRect().width)),
  }));
  ok("卡片数量正常", cards.n === 24, `${cards.n} 张`);
  ok("卡片底部不再有「效果测试」", cards.play === 0 && cards.footText.every(t => t === ""), cards.footText.filter(Boolean).join("|") || "全部为空");
  ok("关卡进度条铺满卡片底部", cards.barW.every(w => w > 150), `最窄 ${Math.min(...cards.barW)}px`);
  await page.locator(".tp-grid").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.locator(".tp-grid").screenshot({ path: `${OUT}/01-train-cards.png` });
  await page.locator(".tp-card").first().screenshot({ path: `${OUT}/01b-card-closeup.png` });

  /* 点击卡片仍能试玩，弹窗内合规标注保留 */
  await page.locator(".tp-card").first().click();
  await page.waitForSelector(".el-dialog.tp-dialog", { state: "visible" });
  await page.waitForTimeout(1500);
  const dlg = await page.evaluate(() => ({
    badge: (document.querySelector(".tp-dialog .tp-badge") || {}).innerText || "",
    tip: [...document.querySelectorAll(".tp-dialog .tip")].map(e => e.innerText.trim()).join(" | "),
    frame: document.querySelectorAll(".tp-dialog iframe").length,
  }));
  ok("点击卡片仍打开试玩弹窗", dlg.frame === 1);
  ok("弹窗内保留「不计入训练记录」标注", /不计入训练记录/.test(dlg.badge) && /不计入训练记录/.test(dlg.tip), dlg.badge);
  await page.screenshot({ path: `${OUT}/02-train-preview.png` });
  ok("医生端控制台无错误", errors.length === 0, errors.slice(0, 3).join(" | ") || "none");
  await page.close();
}

/* ---------- 管理端 ---------- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("http://localhost:3210/admin", { waitUntil: "networkidle" });
  await page.fill('input[placeholder="管理员账号"]', "admin");
  await page.fill('input[placeholder="密码"]', "hs123456");
  await page.click("button:has-text('登 录')");
  await page.waitForTimeout(1000);
  await page.click('.lb-aside .el-menu-item:has-text("量表与方案")');
  await page.waitForTimeout(800);
  await page.click('.el-tabs__item:has-text("训练方案")');
  await page.waitForTimeout(800);
  const cards = await page.evaluate(() => ({
    n: document.querySelectorAll(".tp-card").length,
    play: document.querySelectorAll(".tp-play").length,
  }));
  ok("管理端卡片也不再有「效果测试」", cards.n > 0 && cards.play === 0, `${cards.n} 张`);
  await page.screenshot({ path: `${OUT}/03-admin-cards.png` });
  ok("管理端无脚本错误", errors.length === 0, errors.slice(0, 3).join(" | ") || "none");
  await page.close();
}

await browser.close();
console.log(bad.length ? `\n✗ 失败 ${bad.length} 项：${bad.join(" / ")}` : "\n✓ 全部通过");
process.exit(bad.length ? 1 : 0);
