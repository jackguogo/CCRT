import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r26";
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const R = {};

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

// 登录
await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });

// 进评估功能
await page.click('.lb-aside .el-menu-item:has-text("评估功能")');
await page.waitForSelector(".el-table__row", { timeout: 10000 });
await page.waitForTimeout(800);

// 三个 tab 文案
R.tabs = await page.$$eval(".el-radio-button", (els) => els.map((e) => e.innerText.trim()));
await page.screenshot({ path: `${OUT}/01-assess-running.png` });

// ---- 已完成 tab：操作列只能有「查看报告」----
await page.click('.el-radio-button:has-text("已完成")');
await page.waitForTimeout(900);
R.doneOpBtns = await page.$$eval(".list-card .el-table__body-wrapper .el-table__row", (trs) =>
  trs.slice(0, 5).map((tr) => {
    const tds = tr.querySelectorAll("td");
    const last = tds[tds.length - 1];
    return [...last.querySelectorAll("button")].map((b) => b.innerText.trim()).filter(Boolean);
  }));
await page.screenshot({ path: `${OUT}/02-assess-done.png` });

// ---- 审核中 tab → 打开审核页 ----
await page.click('.el-radio-button:has-text("审核中")');
await page.waitForTimeout(900);
R.reviewRows = await page.$$eval(".list-card .el-table__body-wrapper .el-table__row", (trs) =>
  trs.map((tr) => [...tr.querySelectorAll("td")].slice(0, 4).map((td) => td.innerText.trim()).join(" / ")));
await page.screenshot({ path: `${OUT}/03-assess-reviewing.png` });

await page.click('.list-card .el-table__body-wrapper .el-table__row button:has-text("审核评估")');
await page.waitForSelector(".rv-card", { timeout: 15000 });
await page.waitForTimeout(1000);

// 1) 顶部按钮只剩「返回评估情况表」
R.phBtns = await page.$$eval(".ph-a button", (bs) => bs.map((b) => b.innerText.trim()).filter(Boolean));
// 2) 审核合计区应为 0
R.rvSumCount = await page.$$eval(".rv-sum", (e) => e.length);
// 3) 全部满分 / 全部清零 按钮应不存在
R.setAllBtns = await page.$$eval("button", (bs) =>
  bs.map((b) => b.innerText.trim()).filter((t) => t.includes("全部满分") || t.includes("全部清零")));
// 5) 口述文本
R.recSpeech = await page.$$eval(".rec-speech", (els) =>
  els.map((e) => e.innerText.trim()).slice(0, 6));
R.recSpeechCount = R.recSpeech.length;
// 底部吸底操作区
R.rvFoot = await page.$eval(".rv-foot", (e) => e.innerText.replace(/\n/g, " | ").trim()).catch(() => null);
await page.screenshot({ path: `${OUT}/04-review-page.png`, fullPage: false });
await page.screenshot({ path: `${OUT}/05-review-full.png`, fullPage: true });

// 滚动到口述题区域截图
const sp = await page.$(".rec-speech");
if (sp) {
  await sp.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/06-review-speech.png` });
}

// ---- 施测层口述区（进行中记录）----
await page.click('.ph-a button:has-text("返回评估情况表")');
await page.waitForTimeout(800);
await page.click('.el-radio-button:has-text("进行中")');
await page.waitForTimeout(900);
await page.click('.list-card .el-table__body-wrapper .el-table__row button:has-text("继续评估")');
await page.waitForTimeout(1500);
R.runUrl = page.url();

// 找口述题（有 .quiz-oral 或口述提示）
const oralTip = await page.$(".quiz-oraltip");
R.oralTip = oralTip ? await oralTip.innerText() : null;
R.oralTextEl = await page.$$eval(".quiz-oraltext", (e) => e.length);
if (oralTip) {
  await page.screenshot({ path: `${OUT}/07-quiz-oral.png` });
}

// 遍历题目找到口述题，验证口述文本回显
const nextSel = "button:has-text('下一题'), button:has-text('下一项')";
for (let i = 0; i < 20; i++) {
  const has = await page.$(".quiz-oraltip");
  const txt = await page.$$eval(".quiz-oraltext", (els) => els.map((e) => e.innerText.trim()));
  if (has && txt.length) { R.quizOralSample = txt; break; }
  const nb = await page.$(nextSel);
  if (!nb) break;
  await nb.click().catch(() => {});
  await page.waitForTimeout(600);
}
R.quizOralAll = await page.$$eval(".quiz-oraltext", (els) => els.map((e) => e.innerText.trim()));

R.errors = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
