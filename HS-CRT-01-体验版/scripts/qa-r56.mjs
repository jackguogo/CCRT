import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = "docs/shots-r56";
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1060 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

const shot = async (name, el) => {
  await page.waitForTimeout(700);
  if (el) await el.screenshot({ path: `${OUT}/${name}.png` });
  else await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
};

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });
await page.click('.lb-aside .el-menu-item:has-text("数据记录")');
await page.waitForTimeout(1800);

// 1) 默认患者（陈建国：3 次评估，含 1 条进行中）
await shot("01-assess-default");
const card = await page.$(".rec-pane");
await shot("02-assess-cards", card);

const probe1 = await page.evaluate(() => ({
  patientBar: document.querySelector(".rec-pick")?.innerText.replace(/\n/g, " | "),
  hasLab: !!document.querySelector(".rec-pick .rp-lab"),
  rows: [...document.querySelectorAll(".ra-row")].map(r => ({
    on: r.classList.contains("on"),
    text: r.innerText.replace(/\n/g, " | "),
  })),
  empty: document.querySelector(".rec-pane .el-empty__description")?.innerText || null,
}));
console.log("=== 默认患者\n" + JSON.stringify(probe1, null, 1));

// 2) 点击第 1 条（进行中，无报告）→ 空态提示
await page.click(".ra-row:first-child");
await page.waitForTimeout(600);
console.log("=== 点进行中记录\n" + JSON.stringify(await page.evaluate(() => ({
  onIdx: document.querySelector(".ra-row.on .ra-idx")?.innerText,
  empty: document.querySelector(".rec-pane .el-empty__description")?.innerText || null,
  hasReport: !!document.querySelector(".rec-pane .rec-rep-grid"),
})), null, 1));
await shot("03-pending");

// 3) 点击第 2 条（已完成，有报告）
await page.click(".ra-row:nth-child(2)");
await page.waitForTimeout(1200);
console.log("=== 点已完成记录\n" + JSON.stringify(await page.evaluate(() => ({
  onIdx: document.querySelector(".ra-row.on .ra-idx")?.innerText,
  hd: document.querySelector(".rec-rep-hd")?.innerText.replace(/\n/g, " | "),
  cards: document.querySelectorAll(".rec-pane .sc-card, .rec-pane .pf-card").length,
  radar: !!document.querySelector(".rec-pane svg"),
})), null, 1));
await shot("04-report");

// 4) 换患者：赵慧婷（2 次评估，都有报告）
await page.click('.rec-pick button:has-text("选择患者")');
await page.waitForTimeout(600);
await page.fill('.el-dialog:visible input[placeholder="搜索姓名 / 门诊号 / 科室"]', "赵慧");
await page.waitForTimeout(500);
await page.click('.el-dialog:visible .el-table__body tbody tr:first-child');
await page.waitForTimeout(1600);
await shot("05-patient2");

// 5) 窄屏检查
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(600);
await shot("06-narrow", await page.$(".rec-pane"));

console.log("errors:", errors.length ? errors.slice(0, 6) : "none");
await browser.close();
