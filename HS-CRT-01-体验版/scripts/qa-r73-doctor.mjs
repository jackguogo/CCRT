import { chromium } from "playwright-core";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r73";
const errors = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await page.fill('input[placeholder="工号账号"]', "doctor");
await page.fill('input[placeholder="密码"]', "hs123456");
await page.click("button:has-text('登 录')");
await page.waitForSelector(".lb-banner", { timeout: 15000 });
await page.waitForTimeout(1200);

await page.click('.el-menu-item:has-text("患者信息")');
await page.waitForTimeout(800);
await page.click('button:has-text("登记患者")');
await page.waitForTimeout(1000);

const pick = async (label, shot) => {
  const box = await page.locator(`.el-dialog .el-form-item:has-text("${label}") .el-select__wrapper`).first().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${shot}` });
  const opts = await page.evaluate(() => [...document.querySelectorAll("li[role=option]")]
    .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map(el => el.textContent.trim()));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  return opts;
};

const edu = await pick("教育程度", "b2-doctor-edu.png");
const dept = await pick("科室", "b3-doctor-dept.png");
console.log("学历选项:", edu.join(" / "));
console.log("科室选项:", dept.join(" / "));
console.log("错误:", errors.length ? errors.slice(0, 5) : "无");
await browser.close();
