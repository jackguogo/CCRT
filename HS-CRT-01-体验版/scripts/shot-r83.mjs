/**
 * 第 83 轮：患者端顶部栏 / 底部栏 / 登录页勾选框 截图核对
 * 只截图，不做数据写入（不进训练引擎，只到评估说明页）
 */
import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r83";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3212/patient";
const ACCT = "PAT-MZ260915";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push(e.message));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/01-login.png` });
/* 勾选框局部放大 */
const box = await page.locator(".pl-remember").boundingBox();
await page.screenshot({ path: `${OUT}/02-remember.png`, clip: { x: box.x - 6, y: box.y - 8, width: box.width + 12, height: box.height + 16 } });
await page.check("#lrem");
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/02b-remember-checked.png`, clip: { x: box.x - 6, y: box.y - 8, width: box.width + 12, height: box.height + 16 } });
await page.uncheck("#lrem");

await page.fill("#lu", ACCT);
await page.fill("#lpw", "hs123456");
await page.click("#lgo");
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}/03-tasks.png` });

await page.click('.h5-tabs a:has-text("记录")');
await page.waitForTimeout(1400);
await page.screenshot({ path: `${OUT}/04-records.png` });

await page.click('.h5-tabs a:has-text("我的")');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/05-me.png` });

/* 训练进行中：底部栏是否常显（/train/start 只读，不写库） */
await page.goto(`${BASE}#/train/4/LM-01`, { waitUntil: "networkidle" });
await page.waitForTimeout(1600);
await page.screenshot({ path: `${OUT}/06-train.png` });
const para = await page.evaluate(() => ({
  tabs: document.querySelectorAll(".h5-tabs").length,
  tabOn: document.querySelector(".h5-tabs a.on")?.innerText.trim() || "",
  title: document.querySelector("#ptitle")?.innerText || "",
  sub: document.querySelector("#psub")?.innerText || "",
  back: !!document.querySelector(".h5-top .back"),
}));

/* 顶部栏几何 */
await page.goto(`${BASE}#/tasks`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const geo = await page.evaluate(() => {
  const top = document.querySelector(".h5-top").getBoundingClientRect();
  const ttl = document.querySelector(".h5-top .ttl").getBoundingClientRect();
  const tabs = document.querySelector(".h5-tabs").getBoundingClientRect();
  return {
    topH: Math.round(top.height),
    ttlCenter: Math.round(ttl.left + ttl.width / 2),
    viewCenter: Math.round(window.innerWidth / 2),
    tabsBottom: Math.round(tabs.bottom),
    winH: window.innerHeight,
    sub: document.querySelector("#psub")?.innerText || "",
  };
});

console.log("评估说明页:", JSON.stringify(para));
console.log("顶部栏:", JSON.stringify(geo));
console.log("错误:", errs.length ? errs.slice(0, 3) : "无");
await browser.close();
