/**
 * 第 66 轮截图：训练方案库（卡片网格 / 域筛选 / 效果测试弹窗 / 试玩启动）
 * 注意：主内容滚动容器是 .el-main，fullPage 截不到内部滚动，必须先设 scrollTop。
 */
import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r66";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner");
await page.click('.lb-aside .el-menu-item:has-text("方案管理")');
await page.waitForTimeout(900);
await page.waitForSelector(".tp-card");

const scrollTrain = async () => {
  await page.evaluate(() => {
    const main = document.querySelector(".el-main");
    const sec = document.getElementById("sec-train");
    if (main && sec) main.scrollTop += sec.getBoundingClientRect().top - main.getBoundingClientRect().top - 14;
  });
  await page.waitForTimeout(450);
};

await scrollTrain();
await page.screenshot({ path: `${OUT}/01-train-cards.png` });

await page.click('.tp-filters .tp-chip.ca');
await page.waitForTimeout(400);
await scrollTrain();
await page.screenshot({ path: `${OUT}/02-filter-ca.png` });
await page.click('.tp-filters .tp-chip.all');
await page.waitForTimeout(300);

await page.locator(".tp-card").first().click();
await page.waitForSelector(".el-dialog.tp-dialog", { state: "visible" });
await page.waitForSelector("#tpFrame");
await page.waitForTimeout(1300);
await page.screenshot({ path: `${OUT}/03-preview-dialog.png` });

const frame = page.frameLocator("#tpFrame");
await frame.locator('.hd .chip[data-lv="1"]').click();
await page.waitForTimeout(400);
await frame.locator("#stage #go").click();   // 关卡说明 → 会话入口
await page.waitForTimeout(350);
await frame.locator("#stage #go").click();   // 会话入口 → 真实刺激
await page.waitForTimeout(1100);
await page.screenshot({ path: `${OUT}/04-preview-play.png` });

/* 管理端同步效果 */
const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
await admin.goto("http://localhost:3210/admin", { waitUntil: "networkidle" });
await admin.fill('input[placeholder="管理员账号"]', "admin");
await admin.fill('input[placeholder="密码"]', "hs123456");
await admin.click("button:has-text('登 录')");
await admin.waitForTimeout(1000);
await admin.click('.lb-aside .el-menu-item:has-text("量表与方案")');
await admin.waitForTimeout(800);
await admin.click('.el-tabs__item:has-text("训练方案")');
await admin.waitForTimeout(700);
await admin.locator(".tp-card").first().click();
await admin.waitForSelector(".el-dialog.tp-dialog", { state: "visible" });
await admin.waitForSelector("#tpFrame");
await admin.waitForTimeout(1100);
await admin.screenshot({ path: `${OUT}/05-admin-preview.png` });
await admin.close();

await browser.close();
console.log("截图完成：", fs.readdirSync(OUT).join(", "));
