import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r63";
fs.mkdirSync(OUT, { recursive: true });
const errors = [];

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1060 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });

// 数据记录 → 选患者 → 训练效果
await page.click('.lb-aside .el-menu-item:has-text("数据记录")');
await page.waitForTimeout(1200);
await page.click(".rec-pick button:has-text('选择患者')");
await page.waitForTimeout(800);
await page.fill('.el-dialog input[placeholder="搜索姓名 / 门诊号 / 科室"]', "李文秀");
await page.waitForTimeout(600);
await page.locator(".el-dialog .el-table__body tr").first().click();
await page.waitForTimeout(1800);
await page.locator(".rec-blk:has-text('训练效果')").click();
await page.waitForTimeout(1500);

const box = async (sel) => {
  const el = page.locator(sel).first();
  if (!(await el.count())) return null;
  const b = await el.boundingBox();
  return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
};
console.log("rec-pane:", await box(".rec-pane:visible"));
console.log("grid:", await box(".rec-pane:visible > div[style*='grid-template-columns']"));
console.log("左 mini-h:", await box(".rec-pane:visible .mini-h"));
console.log("rep-body:", await box(".rec-pane:visible .rep-body"));
console.log("rep-radar:", await box(".rec-pane:visible .rep-radar"));
console.log("svg:", await box(".rec-pane:visible .rep-radar svg"));
console.log("cmp-pick:", await box(".rec-pane:visible .cmp-pick"));
console.log("cmp-side:", await box(".rec-pane:visible .cmp-side"));
console.log("右 bars:", await box(".rec-pane:visible .cmp-side .rep-doms"));
console.log("右 table:", await box(".rec-pane:visible .cmp-side .el-table"));
const cols = await page.locator(".rec-pane:visible > div[style*='grid-template-columns'] > div").all();
for (let i = 0; i < cols.length; i++) {
  const b = await cols[i].boundingBox();
  console.log(`列${i + 1}:`, b && { y: Math.round(b.y), h: Math.round(b.height) });
}
const mins = await page.locator(".rec-pane .mini-h").allInnerTexts();
console.log("mini-h 列表:", mins.map(s => s.replace(/\s+/g, " ").trim()));
await page.screenshot({ path: `${OUT}/00-effect-before.png`, fullPage: true });
console.log("\nerrors:", errors.length ? errors : "none");
await browser.close();
