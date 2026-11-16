/**
 * 患者端 H5 全流程回归（第 81 轮口径）
 * 覆盖：任务账号+密码登录 → 任务 / 记录 / 我的 → 退出 → 记住密码 → 扫码免密登录
 * 说明：原 qa-r73-patient 覆盖的「手机号+验证码登录」「#/bind 绑定手机号」已在第 80 轮下线，
 *       本脚本按当前实现重写，文件名随轮次更新。
 */
import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "/Users/lionz/WorkBuddy AI/认知功能障碍评估与训练/HS-CRT-01-体验版/docs/shots-r81";
fs.mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:3212/patient";
const DOC = "http://localhost:3211";
const ACCT = "PAT-MZ260812";
const PW = "hs123456";   // 患者任务账号初始密码（r111 起与医护的 123456 区分）

let pass = 0, fail = 0;
const errors = [];
const ok = (c, msg, extra = "") => {
  if (c) { pass++; console.log(`✓ ${msg}${extra ? "  " + extra : ""}`); }
  else { fail++; console.log(`✗ ${msg}${extra ? "  " + extra : ""}`); }
};

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const newCtx = async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  p.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // 故意触发的 400（错误密码、登录码复用）会打印资源加载失败，属预期
    if (/Failed to load resource/.test(t)) return;
    errors.push("console: " + t);
  });
  return { c, p };
};

/* ---------------- 1. 未登录 = 登录页 ---------------- */
const { c: ctx, p: page } = await newCtx();
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/p1-login.png` });

ok(await page.locator(".pt-login").count() === 1, "未登录进入登录页");
ok(await page.locator(".h5-tabs").count() === 0, "登录页无底部页签");
ok((await page.locator(".pl-name").innerText()).trim() === "认知功能训练软件", "名称为「认知功能训练软件」");
ok(await page.locator(".pl-logo img").getAttribute("src") === "/assets/logo.png", "logo 与医生端同图");
ok(await page.locator(".pl-field input").count() === 2, "只有账号与密码两个输入框");
const loginTxt = (await page.locator(".pt-login").innerText()).replace(/\s+/g, " ").trim();
ok(!/手机号|验证码|短信|体验账号|仅供|免责|说明/.test(loginTxt), "无解释性小字", loginTxt.slice(0, 60));

/* ---------------- 2. 错误密码 ---------------- */
await page.fill("#lu", ACCT);
await page.fill("#lpw", "000000");
await page.click("#lgo");
await page.waitForTimeout(1200);
ok(/密码|错误|不正确/.test(await page.locator("#lerr").innerText()), "错误密码给出提示", (await page.locator("#lerr").innerText()).trim());

/* ---------------- 3. 正确登录 → 任务页 ---------------- */
await page.fill("#lpw", PW);
await page.check("#lrem");
await page.click("#lgo");
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}/p2-tasks.png` });
ok(await page.locator(".pt-login").count() === 0, "登录后离开登录页");
ok((await page.locator("#ptitle").innerText()).includes("今日任务"), "进入今日任务", await page.locator("#ptitle").innerText());
const tabs = (await page.locator(".h5-tabs").innerText()).replace(/\s+/g, "/");
ok(/任务/.test(tabs) && /记录/.test(tabs) && /我的/.test(tabs), "底部页签为 任务/记录/我的", tabs);

const taskTxt = await page.locator("#pbody").innerText();
ok(!taskTxt.includes("如信息不是您本人"), "任务页无「如信息不是您本人」提示");
ok(!/量表|MMSE|MoCA|ADAS|得分|总分|分档/.test(taskTxt), "任务页不泄漏量表名与得分");

/* ---------------- 4. 记录页 ---------------- */
await page.click('.h5-tabs a:has-text("记录")');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/p3-records.png`, fullPage: true });
const recTxt = await page.locator("#pbody").innerText();
ok(recTxt.includes("本周训练"), "记录页显示本周训练进度");
ok(!/量表|MMSE|MoCA|总分|分档/.test(recTxt), "记录页不泄漏量表与总分");

/* ---------------- 5. 我的页 ---------------- */
await page.click('.h5-tabs a:has-text("我的")');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/p4-me.png`, fullPage: true });
const meTxt = await page.locator("#pbody").innerText();
ok(meTxt.includes("任务账号"), "我的页显示任务账号", meTxt.split("\n").slice(0, 3).join(" | "));
ok(!/HS-CRT|V1\.0|海思太科|使用说明|绑定|去绑定/.test(meTxt), "我的页无版本/公司/使用说明/绑定入口");

/* ---------------- 6. 记住密码 ---------------- */
const saved = await page.evaluate(() => localStorage.getItem("hs_remember_patient"));
ok(!!saved && JSON.parse(saved).u === ACCT, "登录后写入记住密码", saved);
const savedPw = saved ? atob(JSON.parse(saved).p) : "";
ok(savedPw === PW, "密码以 base64 存储（非明文）");

/* ---------------- 7. 退出 → 回填 ---------------- */
await page.click("button:has-text('退出登录')");
await page.waitForTimeout(1000);
ok(await page.locator(".pt-login").count() === 1, "退出后回到登录页");
ok(await page.inputValue("#lu") === ACCT, "重新打开回填账号", await page.inputValue("#lu"));
ok(await page.inputValue("#lpw") === PW, "重新打开回填密码");
ok(await page.isChecked("#lrem"), "记住密码保持勾选");

await page.uncheck("#lrem");
await page.waitForTimeout(400);
ok(await page.evaluate(() => localStorage.getItem("hs_remember_patient")) === null, "取消勾选后不再保存");

/* ---------------- 8. 扫码免密登录 ---------------- */
const lr = await fetch(`${DOC}/api/v1/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "doctor", password: "hs123456" }),
});
const dtk = (await lr.json()).data.token;
const pl = await (await fetch(`${DOC}/api/v1/patients?kw=${encodeURIComponent("陈建国")}`, {
  headers: { Authorization: "Bearer " + dtk },
})).json();
const pid = (pl.data || [])[0]?.id;
ok(!!pid, "找到患者", "id=" + pid);

const t1 = await (await fetch(`${DOC}/api/v1/patients/${pid}/ticket`, {
  method: "POST", headers: { Authorization: "Bearer " + dtk },
})).json();
ok(!!t1.data?.ticket, "生成一次性登录码");
ok(/\/patient#\/sso\?t=/.test(t1.data?.url || ""), "登录码 URL 指向患者端 sso", t1.data?.url);

const { c: c2, p: p2 } = await newCtx();
await p2.goto(t1.data.url, { waitUntil: "networkidle" });
await p2.waitForTimeout(1800);
await p2.screenshot({ path: `${OUT}/p5-sso.png` });
ok(await p2.locator(".pt-login").count() === 0, "扫码后免登录直接进入");
ok((await p2.locator("#ptitle").innerText()).includes("今日任务"), "扫码后落在今日任务");

/* 同一票据二次使用应失效 */
const { c: c3, p: p3 } = await newCtx();
await p3.goto(t1.data.url, { waitUntil: "networkidle" });
await p3.waitForTimeout(1500);
const reuse = await p3.locator("#lerr").innerText().catch(() => "");
ok(/已使用|无效|过期/.test(reuse), "同一登录码二次使用被拒", reuse.trim());
await p3.screenshot({ path: `${OUT}/p6-sso-reuse.png` });

/* ---------------- 9. 顶部栏 / 底部栏（第 82 轮） ---------------- */
const { c: c4, p: p4 } = await newCtx();
await p4.goto(BASE, { waitUntil: "networkidle" });
await p4.waitForTimeout(600);
await p4.fill("#lu", "PAT-MZ260915");
await p4.fill("#lpw", PW);
await p4.click("#lgo");
await p4.waitForTimeout(1800);

const hd = await p4.evaluate(() => {
  const top = document.querySelector(".h5-top");
  const ttl = document.querySelector(".h5-top .ttl").getBoundingClientRect();
  const tabs = document.querySelector(".h5-tabs").getBoundingClientRect();
  const cs = getComputedStyle(top);
  return {
    center: Math.round(ttl.left + ttl.width / 2),
    viewCenter: Math.round(window.innerWidth / 2),
    topText: top.innerText.replace(/\s+/g, ""),
    borderW: cs.borderBottomWidth,
    tabsBottom: Math.round(tabs.bottom),
    winH: window.innerHeight,
    tabsN: document.querySelectorAll(".h5-tabs a").length,
  };
});
ok(Math.abs(hd.center - hd.viewCenter) <= 1, "顶部标题水平居中", `${hd.center} / ${hd.viewCenter}`);
ok(!/周明远/.test(hd.topText), "顶部不显示患者姓名", hd.topText);
ok(hd.borderW === "0px", "顶部无分隔线", hd.borderW);
const gapBottom = hd.winH - hd.tabsBottom;
ok(hd.tabsN === 3 && gapBottom > 0 && gapBottom <= 14, "底部导航悬浮在视口下沿", `${hd.tabsN} 页签 · 距底 ${gapBottom}px`);

/* 本周场次进度与达标提示（任务不按天分配，按 freq 次/周提示，不锁训练） */
const taskTxt2 = await p4.locator("#pbody").innerText();
const wk = await p4.evaluate(async () => {
  const r = await fetch("/api/v1/my/tasks", { headers: { Authorization: "Bearer " + localStorage.getItem("hs_ptk") } });
  return (await r.json()).data.week;
});
ok(new RegExp(`本周 ${wk.done}/${wk.target} 次`).test(taskTxt2), "任务页显示本周场次进度", `本周 ${wk.done}/${wk.target} 次`);
ok(wk.done >= wk.target ? /可继续巩固/.test(taskTxt2) : !/可继续巩固/.test(taskTxt2),
  "达标提示与本周场次一致", `${wk.done}/${wk.target} · ${wk.done >= wk.target ? "已达标" : "未达标"}`);
ok(await p4.locator(".ptask button").count() > 0, "达标后任务仍可点（不锁训练）");

/* 长内容滚到底后导航不随内容走 */
await p4.click('.h5-tabs a:has-text("记录")');
await p4.waitForTimeout(1500);
const sc = await p4.evaluate(() => {
  const b = document.querySelector(".h5-body");
  b.scrollTop = b.scrollHeight;
  const t = document.querySelector(".h5-tabs").getBoundingClientRect();
  return { bottom: Math.round(t.bottom), scrolled: Math.round(b.scrollTop) };
});
ok(sc.scrolled > 100, "记录页内容可滚动", sc.scrolled + "px");
ok(Math.abs(sc.bottom - hd.tabsBottom) <= 1, "滚到底部后导航仍悬浮原位", `${sc.bottom} / ${hd.tabsBottom}`);
/* 场次与项次分开统计：一次训练含多个项目只算 1 场 */
const recTxt2 = await p4.locator("#pbody").innerText();
const acc = recTxt2.match(/累计训练\s*(\d+)\s*次\s*·\s*(\d+)\s*项/);
ok(!!acc && +acc[1] < +acc[2], "记录页累计区分场次与项次", acc ? `${acc[1]} 场 / ${acc[2]} 项` : recTxt2.slice(0, 40));

/* 训练进行中：底部栏仍常显、「任务」高亮 */
const plan = await p4.evaluate(async () => {
  const r = await fetch("/api/v1/my/tasks", { headers: { Authorization: "Bearer " + localStorage.getItem("hs_ptk") } });
  const d = await r.json();
  return (d.data?.planItems || [])[0] || null;
});
if (plan) {
  await p4.goto(`${BASE}#/train/${plan.planId}/${plan.program}`, { waitUntil: "networkidle" });
  await p4.waitForTimeout(1600);
  await p4.screenshot({ path: `${OUT}/p7-train-tabs.png` });
  const tr = await p4.evaluate(() => ({
    tabs: document.querySelectorAll(".h5-tabs").length,
    on: document.querySelector(".h5-tabs a.on")?.innerText.trim() || "",
    sub: document.querySelector("#psub")?.innerText || "",
    back: !!document.querySelector(".h5-top .back"),
  }));
  ok(tr.tabs === 1, "训练进行中底部栏仍显示");
  ok(tr.on === "任务", "训练中「任务」页签高亮", tr.on);
  ok(!!tr.sub && !!tr.back, "训练中顶部有返回与进度副标题", `${tr.back ? "返回" : "无返回"} · ${tr.sub}`);
} else {
  console.log("· 跳过训练页断言（当前患者无进行中方案）");
}

/* ---------------- 10. 无脚本错误 ---------------- */
ok(errors.length === 0, "页面无脚本错误", errors.slice(0, 3).join(" ; "));

await browser.close();
console.log(`\n${fail === 0 ? "✓ 全部通过" : "✗ 失败 " + fail + " 项"}  （${pass} 通过 / ${fail} 失败）`);
process.exit(fail === 0 ? 0 : 1);
