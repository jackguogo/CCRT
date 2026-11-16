import { chromium } from "playwright-core";
import fs from "node:fs";
const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r79";
fs.mkdirSync(OUT, { recursive: true });
const errors = [], fails = [];
const ck = (n, c, e = "") => { console.log((c ? "✓ " : "✗ ") + n + (e ? "  " + e : "")); if (!c) fails.push(n); };

const b = await chromium.launch({ headless: true, executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell" });
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await c.newPage();
p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
p.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await p.goto("http://localhost:3210/admin", { waitUntil: "networkidle" });
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/l1-login.png` });

/* 版式与医生端一致 */
ck("书页式容器存在", (await p.locator(".lg-book").count()) === 1);
ck("左页品牌区存在", (await p.locator(".lg-brand").count()) === 1);
const pages = await p.locator(".lg-page").count();
ck("左右两页", pages === 2, "实际 " + pages);
const title = await p.locator(".lg-title").innerText();
ck("左页显示软件名", title.includes("认知功能障碍评估与训练软件"), title);
ck("左页显示公司名", (await p.locator(".lg-co").innerText()).includes("海思太科医疗科技"));
ck("右页标题为管理员登录", (await p.locator(".lg-hd h3").innerText()) === "管理员登录");
ck("有记住密码", (await p.locator(".lg-row .el-checkbox").count()) === 1);

/* 居中与尺寸 */
const box = await p.locator(".lg-book").boundingBox();
const vp = p.viewportSize();
ck("窗口水平居中", Math.abs((box.x + box.width / 2) - vp.width / 2) < 2, `中心 ${Math.round(box.x + box.width / 2)} / ${vp.width / 2}`);
ck("窗口垂直居中", Math.abs((box.y + box.height / 2) - vp.height / 2) < 2, `中心 ${Math.round(box.y + box.height / 2)} / ${vp.height / 2}`);
ck("窗口宽度 900", Math.round(box.width) === 900, box.width + "px");
const lp = await p.locator(".lg-brand").boundingBox();
ck("左页 420 宽", Math.round(lp.width) === 420, lp.width + "px");

/* 窄屏单栏 */
await p.setViewportSize({ width: 820, height: 900 });
await p.waitForTimeout(500);
const nb = await p.locator(".lg-book").boundingBox();
const nbBrand = await p.locator(".lg-brand").boundingBox();
ck("窄屏单栏（左页隐藏）", Math.round(nb.width) < 500 && nbBrand.y >= nb.y, `book=${Math.round(nb.width)} brandY=${Math.round(nbBrand.y)} bookY=${Math.round(nb.y)}`);
await p.screenshot({ path: `${OUT}/l2-narrow.png` });
await p.setViewportSize({ width: 1440, height: 900 });
await p.waitForTimeout(400);

/* 记住密码 */
await p.fill('input[placeholder="管理员账号"]', "admin");
await p.fill('input[placeholder="密码"]', "hs123456");
await p.click('.lg-row .el-checkbox');
await p.waitForTimeout(200);
await p.click("button:has-text('登 录')");
await p.waitForSelector(".lb-aside", { timeout: 15000 });
await p.waitForTimeout(1200);
const saved = await p.evaluate(() => localStorage.getItem("hs_remember_admin"));
ck("登录后写入记住密码", !!saved && saved.includes("admin"), saved || "(空)");

/* 退出后回填 */
await p.evaluate(() => { localStorage.removeItem("hs_atk"); });
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(800);
const u = await p.inputValue('input[placeholder="管理员账号"]');
const pw = await p.inputValue('input[placeholder="密码"]');
ck("重新打开回填账号密码", u === "admin" && pw === "hs123456", u + " / " + pw.length + " 位");
ck("记住密码保持勾选", await p.locator('.lg-row .el-checkbox').evaluate((e) => e.classList.contains("is-checked")));
await p.screenshot({ path: `${OUT}/l3-remembered.png` });

/* 取消勾选即清除 */
await p.click('.lg-row .el-checkbox');
await p.waitForTimeout(300);
const cleared = await p.evaluate(() => localStorage.getItem("hs_remember_admin"));
ck("取消勾选清除记录", cleared === null, String(cleared));

/* 非管理员账号被拦 */
await p.fill('input[placeholder="管理员账号"]', "doctor");
await p.fill('input[placeholder="密码"]', "hs123456");
await p.click("button:has-text('登 录')");
await p.waitForTimeout(1200);
const stillLogin = await p.locator(".lg-book").count();
ck("医生账号不能进管理端", stillLogin === 1);

ck("页面无脚本错误", errors.length === 0, errors.slice(0, 3).join(" ; "));
console.log(fails.length ? "\n✗ 失败 " + fails.length + " 项：" + fails.join("、") : "\n✓ 全部通过");
await b.close();
process.exit(fails.length ? 1 : 0);
