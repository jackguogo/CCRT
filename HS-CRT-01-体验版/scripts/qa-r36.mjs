import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r36";
fs.mkdirSync(OUT, { recursive: true });
const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const errors = [];

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });

await page.click('.lb-aside .el-menu-item:has-text("训练功能")');
await page.waitForTimeout(1200);

// 进入训练中患者的训练方案页（杨建国已完成评估、未开始训练）
await page.click('#sec-train-list button:has-text("选择患者配置训练方案")');
await page.waitForTimeout(1200);
await page.click('.el-dialog:visible .el-table__body tbody tr:has-text("杨建国")');
await page.waitForSelector(".lb-pagehead .ph-t:has-text('训练方案')", { timeout: 15000 });
await page.waitForTimeout(1800);

const layout = await page.evaluate(() => ({
  title: document.querySelector(".lb-pagehead .ph-t")?.innerText.trim(),
  backBtn: [...document.querySelectorAll(".lb-pagehead .ph-a button")].map(b => b.innerText.trim()),
  cards: [...document.querySelectorAll(".lb-card .head .t")].map(t => t.innerText.replace(/\s+/g, " ").trim()),
  hasRadar: !!document.querySelector("svg[aria-label='认知域画像']"),
  radarLabels: [...document.querySelectorAll("svg[aria-label='认知域画像'] text")].map(t => t.textContent.trim()),
  resHead: [...document.querySelectorAll(".lb-card .el-table")][0] ? [...document.querySelectorAll(".lb-card .el-table")][0].querySelectorAll("th").length : 0,
  buttons: [...document.querySelectorAll(".lb-card button")].filter(b => /生成|推送/.test(b.innerText)).map(b => ({ t: b.innerText.trim(), disabled: b.disabled })),
}));
console.log("标题:", layout.title, "| 返回按钮:", JSON.stringify(layout.backBtn));
console.log("卡片:", JSON.stringify(layout.cards));
console.log("雷达:", layout.hasRadar, JSON.stringify(layout.radarLabels));
console.log("按钮(初始):", JSON.stringify(layout.buttons));
await page.screenshot({ path: OUT + "/01-prescribe.png", fullPage: true });

// 评估项目结果表内容
const resTable = await page.evaluate(() => {
  const card = [...document.querySelectorAll(".lb-card")].find(c => c.querySelector(".head .t")?.innerText.includes("评估项目结果"));
  if (!card) return null;
  return {
    head: [...card.querySelectorAll(".el-table__header th")].map(t => t.innerText.trim()).filter(Boolean),
    rows: [...card.querySelectorAll(".el-table__body tbody tr")].map(tr => [...tr.querySelectorAll("td")].map(td => td.innerText.replace(/\s+/g, " ").trim()).join(" | ")),
  };
});
console.log("评估项目结果:", JSON.stringify(resTable.head));
resTable.rows.forEach(r => console.log("  ", r));

// 生成方案
await page.click('.lb-card button:has-text("生成训练方案")');
await page.waitForTimeout(1800);
const afterGen = await page.evaluate(() => [...document.querySelectorAll(".lb-card button")].filter(b => /生成|推送/.test(b.innerText)).map(b => ({ t: b.innerText.trim(), disabled: b.disabled })));
console.log("按钮(生成后):", JSON.stringify(afterGen));
await page.screenshot({ path: OUT + "/02-generated.png", fullPage: true });

// 推送患者
await page.click('.lb-card button:has-text("推送患者")');
await page.waitForTimeout(1800);
const afterPush = await page.evaluate(() => [...document.querySelectorAll(".lb-card button")].filter(b => /生成|推送/.test(b.innerText)).map(b => ({ t: b.innerText.trim(), disabled: b.disabled })));
console.log("按钮(推送后):", JSON.stringify(afterPush));
await page.screenshot({ path: OUT + "/03-pushed.png", fullPage: true });

// 返回
await page.click('.lb-pagehead .ph-a button:has-text("返回")');
await page.waitForTimeout(1200);
const back = await page.evaluate(() => ({
  secBar: document.querySelector("#sec-train-list .sec-bar-t")?.innerText.trim(),
  tabs: [...document.querySelectorAll(".list-card .el-radio-button")].map(b => b.innerText.replace(/\s+/g, " ").trim()),
}));
console.log("返回后:", JSON.stringify(back));
await page.screenshot({ path: OUT + "/04-back-train.png" });

console.log("errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
