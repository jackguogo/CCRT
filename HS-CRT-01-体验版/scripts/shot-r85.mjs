/**
 * 第 85 轮：勾选框尺寸对齐医生端 + 底部导航悬浮常显
 */
import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r85";
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

const cb = await page.evaluate(() => {
  const i = document.querySelector(".pl-remember input");
  const r = i.getBoundingClientRect();
  const cs = getComputedStyle(i);
  const lb = document.querySelector(".pl-remember span");
  return { w: r.width, h: r.height, radius: cs.borderRadius, border: cs.borderWidth + " " + cs.borderColor, label: getComputedStyle(lb).fontSize };
});

const box = await page.locator(".pl-remember").boundingBox();
await page.screenshot({ path: `${OUT}/02-remember.png`, clip: { x: box.x - 6, y: box.y - 8, width: box.width + 12, height: box.height + 16 } });
await page.check("#lrem");
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/02b-remember-checked.png`, clip: { x: box.x - 6, y: box.y - 8, width: box.width + 12, height: box.height + 16 } });
await page.uncheck("#lrem");

await page.fill("#lu", ACCT);
await page.fill("#lpw", "hs123456");
await page.click("#lgo");
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}/03-tasks.png` });

const tabs = await page.evaluate(() => {
  const t = document.querySelector(".h5-tabs").getBoundingClientRect();
  const cs = getComputedStyle(document.querySelector(".h5-tabs"));
  return {
    left: Math.round(t.left), right: Math.round(t.right), bottom: Math.round(t.bottom),
    h: Math.round(t.height), radius: cs.borderRadius,
    winW: window.innerWidth, winH: window.innerHeight,
    shadow: cs.boxShadow.slice(0, 40),
  };
});

/* 长内容页：滚到底部后导航仍在视口内 */
await page.click('.h5-tabs a:has-text("记录")');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/04-records.png` });
const afterScroll = await page.evaluate(() => {
  const body = document.querySelector(".h5-body");
  body.scrollTop = body.scrollHeight;
  const t = document.querySelector(".h5-tabs").getBoundingClientRect();
  return { bottom: Math.round(t.bottom), winH: window.innerHeight, scrollTop: Math.round(body.scrollTop) };
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/05-records-bottom.png` });

await page.click('.h5-tabs a:has-text("我的")');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/06-me.png` });

await page.goto(`${BASE}#/train/4/LM-01`, { waitUntil: "networkidle" });
await page.waitForTimeout(1600);
await page.screenshot({ path: `${OUT}/07-train.png` });

console.log("勾选框:", JSON.stringify(cb));
console.log("底部导航:", JSON.stringify(tabs));
console.log("滚到底后:", JSON.stringify(afterScroll));
console.log("错误:", errs.length ? errs.slice(0, 3) : "无");
await browser.close();
