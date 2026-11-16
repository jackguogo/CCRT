import { chromium } from "playwright-core";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r73";
const errors = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto("http://localhost:3212/patient", { waitUntil: "networkidle" });
await page.waitForTimeout(700);
// 登录页默认是手机号+验证码，家属账号走「使用任务账号登录」
await page.click("#lacct");
await page.waitForTimeout(500);
await page.fill("#lu", "FAM-MZ260032");
await page.fill("#lpw", "hs123456");
await page.click("#lgo");
await page.waitForTimeout(1600);
await page.click('.h5-tabs a:has-text("我的")');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/p6-family.png` });
const meText = await page.locator("#pbody").innerText();

// 越权检查：家属访问其他患者档案
const forbidden = await page.evaluate(async () => {
  const tk = localStorage.getItem("hs_ptk");
  const r = await fetch("/api/v1/patients/1", { headers: { Authorization: "Bearer " + tk } });
  return r.status;
});

console.log("家属页:", meText.split("\n").slice(0, 5).join(" | "));
console.log("越权访问其他患者:", forbidden, forbidden === 403 ? "（已拦截）" : "（异常）");
console.log("错误:", errors.length ? errors.slice(0, 5) : "无");
await browser.close();
