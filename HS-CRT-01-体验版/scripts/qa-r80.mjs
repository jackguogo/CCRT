import { chromium } from "playwright-core";
import fs from "node:fs";
const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r80";
fs.mkdirSync(OUT, { recursive: true });
const errors = [], fails = [];
const ck = (n, c, e = "") => { console.log((c ? "✓ " : "✗ ") + n + (e ? "  " + e : "")); if (!c) fails.push(n); };

const b = await chromium.launch({ headless: true, executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell" });
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const p = await c.newPage();
p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
p.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await p.goto("http://127.0.0.1:3212/patient", { waitUntil: "networkidle" });
await p.waitForTimeout(800);

/* 浏览器顶部标题 */
ck("页面标题为「认知功能训练软件」", (await p.title()) === "认知功能训练软件", await p.title());

/* 登录页元素 */
const bodyTxt = await p.locator(".pt-login").innerText();
ck("显示 logo 图片", (await p.locator(".pl-logo img").count()) === 1);
const logoSrc = await p.locator(".pl-logo img").getAttribute("src");
ck("logo 用医生端同一张图", logoSrc === "/assets/logo.png", logoSrc);
ck("显示名称「认知功能训练软件」", (await p.locator(".pl-name").innerText()).trim() === "认知功能训练软件");
ck("只有账号与密码两个输入框", (await p.locator(".pl-field input").count()) === 2);
ck("账号占位为「任务账号」", (await p.locator("#lu").getAttribute("placeholder")) === "任务账号");
ck("密码占位为「密码」", (await p.locator("#lpw").getAttribute("placeholder")) === "密码");
ck("有记住密码", (await p.locator(".pl-remember").count()) === 1);
/* 勾选框尺寸对齐医生端（14×14、1px 浅灰描边），形状为正方形（圆角 ≤2px） */
const cb = await p.evaluate(() => {
  const i = document.querySelector(".pl-remember input");
  const r = i.getBoundingClientRect(); const cs = getComputedStyle(i);
  return { w: r.width, h: r.height, radius: parseFloat(cs.borderRadius), bw: cs.borderWidth };
});
ck("勾选框 14×14 与医生端一致", cb.w === 14 && cb.h === 14, `${cb.w}×${cb.h}`);
ck("勾选框为正方形（圆角 ≤2px）", cb.radius <= 2, cb.radius + "px · 描边 " + cb.bw);
ck("有登录按钮", (await p.locator(".pl-btn").innerText()).replace(/\s/g, "") === "登录");
ck("无解释性小字（无手机号/验证码/体验账号/免责）",
  !/手机号|验证码|体验账号|仅供|诊断功能|指导/.test(bodyTxt), bodyTxt.replace(/\n/g, " | "));
ck("无第三方登录链接", (await p.locator(".pt-login a").count()) === 0);
await p.screenshot({ path: `${OUT}/p1-login.png` });

/* 密码可见切换 */
await p.click("#leye");
await p.waitForTimeout(200);
ck("点击眼睛切换为明文", (await p.locator("#lpw").getAttribute("type")) === "text");
await p.click("#leye");
await p.waitForTimeout(200);
ck("再次点击回到密文", (await p.locator("#lpw").getAttribute("type")) === "password");

/* 空提交提示 */
await p.click(".pl-btn");
await p.waitForTimeout(400);
ck("空提交提示", (await p.locator(".pl-err").innerText()).includes("请输入任务账号与密码"), await p.locator(".pl-err").innerText());

/* 记住密码 + 登录 */
await p.fill("#lu", "PAT-MZ260812");
await p.fill("#lpw", "hs123456");
await p.check("#lrem");
await p.click(".pl-btn");
await p.waitForSelector(".h5-tabs", { timeout: 15000 });
await p.waitForTimeout(1200);
const saved = await p.evaluate(() => localStorage.getItem("hs_remember_patient"));
ck("勾选后写入记住密码", !!saved && saved.includes("PAT-MZ260812"), saved || "(空)");
await p.screenshot({ path: `${OUT}/p2-tasks.png` });

/* 任务页无本人核对提示 */
const tasksTxt = await p.locator(".h5-body").innerText();
ck("任务页无「如信息不是您本人」", !tasksTxt.includes("如信息不是您本人"), tasksTxt.split("\n").slice(-3).join(" | "));

/* 我的页 */
await p.click('.h5-tabs a[href="#/me"]');
await p.waitForTimeout(1000);
const meTxt = await p.locator(".h5-body").innerText();
ck("我的页无版本与公司信息", !meTxt.includes("HS-CRT-01") && !meTxt.includes("海思太科"), meTxt.replace(/\n/g, " | "));
ck("我的页无使用说明", !meTxt.includes("使用说明"));
ck("我的页无去绑定入口", (await p.locator('.h5-body a[href="#/bind"]').count()) === 0);
await p.screenshot({ path: `${OUT}/p3-me.png` });

/* 退出后回填 */
await p.evaluate(() => { localStorage.removeItem("hs_ptk"); location.hash = "#/login"; });
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(900);
ck("重新打开回填账号", (await p.inputValue("#lu")) === "PAT-MZ260812");
ck("重新打开回填密码", (await p.inputValue("#lpw")) === "hs123456");
ck("记住密码保持勾选", await p.locator("#lrem").isChecked());
await p.screenshot({ path: `${OUT}/p4-remembered.png` });

/* 取消勾选并登录后清除 */
await p.uncheck("#lrem");
await p.click(".pl-btn");
await p.waitForSelector(".h5-tabs", { timeout: 15000 });
await p.waitForTimeout(900);
const cleared = await p.evaluate(() => localStorage.getItem("hs_remember_patient"));
ck("取消勾选后不再保存", cleared === null, String(cleared));

ck("页面无脚本错误", errors.length === 0, errors.slice(0, 3).join(" ; "));
console.log(fails.length ? "\n✗ 失败 " + fails.length + " 项：" + fails.join("、") : "\n✓ 全部通过");
await b.close();
process.exit(fails.length ? 1 : 0);
