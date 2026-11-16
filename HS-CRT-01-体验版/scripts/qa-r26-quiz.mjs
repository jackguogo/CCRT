import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r26";
fs.mkdirSync(OUT, { recursive: true });
const R = {};
const errors = [];

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

// 登录拿 token（同 context 共享 localStorage）
await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });

// 打开施测窗口（?run=19 周明远 / MMSE）
await page.goto("http://localhost:3211/doctor?run=19", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// 进入评估执行页后，点量表卡上的「开始评估 / 继续评估」进入施测层
R.runCards = await page.$$eval(".item-card .head .t", (els) => els.map((e) => e.innerText.replace(/\n/g, " ").trim()));
await page.click(".item-card button:has-text('评估')");
await page.waitForTimeout(2000);

R.url = page.url();
R.quizOpen = !!(await page.$(".quiz-oral, .quiz-stage, .quiz-foot"));
R.oralTip = await page.$eval(".quiz-oraltip", (e) => e.innerText.trim()).catch(() => null);
R.oralText = await page.$$eval(".quiz-oraltext", (els) => els.map((e) => e.innerText.trim()));
R.micBtn = !!(await page.$(".quiz-mic"));
R.oralErr = await page.$eval(".quiz-oralerr", (e) => e.innerText.trim()).catch(() => null);

// 当前题号与题干
R.curQ = await page.$eval(".quiz-q, .quiz-title, .quiz-stem", (e) => e.innerText.trim()).catch(() => null);

await page.screenshot({ path: `${OUT}/07-quiz-oral.png` });

// 遍历题目，收集所有出现口述区的题目
const seen = [];
for (let i = 0; i < 25; i++) {
  const tip = await page.$eval(".quiz-oraltip", (e) => e.innerText.trim()).catch(() => null);
  if (tip) {
    const txt = await page.$$eval(".quiz-oraltext", (els) => els.map((e) => e.innerText.trim()));
    const stem = await page.$eval(".quiz-q, .quiz-stem", (e) => e.innerText.trim()).catch(() => "");
    seen.push({ i, stem: stem.slice(0, 40), tip, txt });
    if (txt.length) {
      await page.screenshot({ path: `${OUT}/08-quiz-oral-speech.png` });
      break;
    }
  }
  const nb = await page.$(".quiz-foot button.primary");
  if (!nb) break;
  await nb.click().catch(() => {});
  await page.waitForTimeout(500);
}
R.oralItems = seen;

R.errors = errors;
console.log(JSON.stringify(R, null, 2));
await browser.close();
