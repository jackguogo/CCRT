import { chromium } from "playwright-core";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r73";
const errors = [];
const API = "http://localhost:3210/api/v1";
const CODE = "CA-04";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});

const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const admin = await adminCtx.newPage();
admin.on("pageerror", (e) => errors.push("admin pageerror: " + e.message));
await admin.goto("http://localhost:3210/admin", { waitUntil: "networkidle" });
await admin.fill('input[placeholder="管理员账号"]', "admin");
await admin.fill('input[placeholder="密码"]', "hs123456");
await admin.click("button:has-text('登 录')");
await admin.waitForSelector(".lb-aside", { timeout: 15000 });
await admin.waitForTimeout(1200);
const adminToken = await admin.evaluate(() => localStorage.getItem("hs_atk") || "");

const catalogEnabled = async (code) => {
  const r = await fetch(`${API}/admin/catalog?kind=training`, { headers: { Authorization: "Bearer " + adminToken } });
  const d = (await r.json()).data.rows.find(x => x.code === code);
  return d ? d.enabled : null;
};

await admin.click('.el-menu-item:has-text("项目配置")');
await admin.waitForTimeout(1000);
await admin.click('.el-tabs__item:has-text("训练方案")');
await admin.waitForTimeout(900);

const row = admin.locator(`.el-table__body tr:has-text("${CODE}")`).first();
await row.locator("button:has-text('停用')").click();
await admin.waitForTimeout(1400);
const afterOff = await catalogEnabled(CODE);
await admin.screenshot({ path: `${OUT}/a13-catalog-off.png` });

// 医生端：训练卡片应不含该项目
const docCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const doc = await docCtx.newPage();
doc.on("pageerror", (e) => errors.push("doctor pageerror: " + e.message));
await doc.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
await doc.fill('input[placeholder="工号账号"]', "doctor");
await doc.fill('input[placeholder="密码"]', "hs123456");
await doc.click("button:has-text('登 录')");
await doc.waitForSelector(".lb-banner", { timeout: 15000 });
await doc.waitForTimeout(1500);
await doc.click('.el-menu-item:has-text("方案管理")');
await doc.waitForTimeout(1500);
const cardsOff = await doc.locator(".tp-code").allInnerTexts();
await doc.screenshot({ path: `${OUT}/a14-doctor-train-off.png` });

// 恢复启用
await row.locator("button:has-text('启用')").click();
await admin.waitForTimeout(1400);
const afterOn = await catalogEnabled(CODE);

await doc.reload({ waitUntil: "networkidle" });
await doc.waitForTimeout(1800);
await doc.click('.el-menu-item:has-text("方案管理")');
await doc.waitForTimeout(1500);
const cardsOn = await doc.locator(".tp-code").allInnerTexts();

console.log("管理端停用后 enabled:", afterOff);
console.log("医生端训练卡片数（停用后）:", cardsOff.length, "含", CODE, ":", cardsOff.some(t => t.includes(CODE)));
console.log("管理端恢复后 enabled:", afterOn);
console.log("医生端训练卡片数（恢复后）:", cardsOn.length, "含", CODE, ":", cardsOn.some(t => t.includes(CODE)));
console.log("错误:", errors.length ? errors.slice(0, 4) : "无");
await browser.close();
