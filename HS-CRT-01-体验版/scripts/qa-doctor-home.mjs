import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/screenshots";
fs.mkdirSync(OUT, { recursive: true });
const errors = [];

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/30-doctor-home.png` });

// 逐项点菜单，校验高亮
const menus = ["工作台", "患者信息", "评估功能", "方案管理", "训练功能", "数据记录"];
const report = [];
for (const m of menus) {
  await page.click(`.lb-aside .el-menu-item:has-text("${m}")`);
  await page.waitForTimeout(700);
  const act = await page.$$eval(".lb-aside .el-menu-item", (els) =>
    els.filter((e) => e.classList.contains("is-active")).map((e) => e.textContent.trim()));
  const title = await page.textContent(".lb-page-title").catch(() => "");
  report.push({ click: m, active: act, title: (title || "").trim() });
  if (m !== "工作台") await page.screenshot({ path: `${OUT}/31-menu-${menus.indexOf(m)}.png` });
}

// 回到工作台再截一张（含统计卡）
await page.click('.lb-aside .el-menu-item:has-text("工作台")');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/30b-doctor-home.png` });

const banner = await page.$eval(".lb-banner", (el) => ({
  h2: el.querySelector("h2")?.textContent.trim(),
  p: el.querySelector("p")?.textContent.trim() || null,
  btns: [...el.querySelectorAll(".el-button")].map((b) => b.textContent.trim()),
  img: el.querySelector("img")?.getAttribute("src"),
  imgBox: el.querySelector("img")?.getBoundingClientRect().toJSON(),
}));
const stats = await page.$$eval(".lb-stat", (els) => els.map((e) => e.querySelector(".k").textContent.trim() + "=" + e.querySelector(".v").textContent.trim()));
const headerRight = await page.$eval(".lb-header .h-right", (e) => e.textContent.trim()).catch(() => "(none)");

console.log(JSON.stringify({ report, banner, stats, headerRight, errors }, null, 2));
await browser.close();
