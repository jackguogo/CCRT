/**
 * 第 65 轮截图 b：李文秀（3 次评估 / 44 次训练 / 已完成方案）数据记录各面板
 * 重点验证：每场训练项目数 = 方案项数（3 项）
 */
import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r65";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1060 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder*="账号"], input[placeholder*="用户名"]', "doctor");
await page.fill('input[type="password"]', "hs123456");
await page.keyboard.press("Enter");
await page.waitForTimeout(1800);

await page.click('text=数据记录');
await page.waitForTimeout(1200);
// 选择患者
const pick = page.locator('button:visible', { hasText: "选择患者" }).first();
if (await pick.count()) {
  await pick.click();
  await page.waitForTimeout(800);
  const dlg = page.locator('.el-dialog:visible');
  await dlg.locator('input').first().fill("李文秀");
  await page.waitForTimeout(600);
  const row = dlg.locator('tbody tr:visible').first();
  if (await row.count()) { await row.click(); await page.waitForTimeout(400); }
  const confirm = dlg.locator('button:visible', { hasText: /确定|选择/ }).last();
  if (await confirm.count()) await confirm.click();
  await page.waitForTimeout(1600);
}

const shot = async (n) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log("✓", n); };
await shot("08-liu-records");

// 顶部四块：评估记录 / 训练记录 / 依从性 / 训练效果
const blk = (i) => page.locator('.rec-blk:visible').nth(i);
const sub = async (t) => {
  const el = page.locator('.el-radio-button:visible', { hasText: t }).first();
  if (await el.count()) { await el.click(); await page.waitForTimeout(600); return true; }
  return false;
};

await blk(1).click(); await shot("09-liu-train-trend");
console.log(await sub("训练认知域") ? "  → 训练认知域" : "  ! 未找到子视图");
await shot("10-liu-train-domain");
console.log(await sub("训练完成情况") ? "  → 训练完成情况" : "  ! 未找到子视图");
await shot("11-liu-train-progress");
console.log(await sub("训练明细") ? "  → 训练明细" : "  ! 未找到子视图");
await shot("12-liu-train-detail");

await blk(2).click(); await shot("13-liu-adherence");
await blk(3).click(); await shot("14-liu-effect");
await browser.close();
