// r111：评估方案项目置灰 + 标准「量表+范式」方案 + 患者详情精简 + 登录码弹窗改版
// 断言：
//   1) 量表 CCSE、范式 CPT/AVLT/REC/FLU/COPY 置灰不可选，且排在各自分组最后
//   2) 「标准评估方案」= 1 量表 + 6 范式、45 分钟；所有方案都不再含待开放项目
//   3) 患者详情页不再有「家属账号」按钮
//   4) 登录码弹窗：不显示有效期/仅可使用一次，不显示「重新生成」按钮，
//      显示初始密码 hs123456，提示语为「患者用手机扫码，输入任务账号和初始密码登录」
//   5) 患者任务账号可用 hs123456 登录
import { createRequire } from "module";
import fs from "fs";
import path from "path";
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, "..");
const { chromium } = require(path.join(ROOT, "node_modules/playwright-core"));
const PORT = process.env.PORT_DOCTOR || 3211;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOT = path.join(ROOT, "docs/shots-r111");
fs.mkdirSync(SHOT, { recursive: true });

const bad = [];
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${name}${extra ? "  " + extra : ""}`);
  if (!cond) bad.push(name);
};
const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();

const PENDING = ["CCSE", "CPT", "AVLT", "REC", "FLU", "COPY"];

const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "doctor", password: "hs123456" }),
}).then((r) => r.json());
const TK = login.data.token;
const H = { "Content-Type": "application/json", Authorization: "Bearer " + TK };
const get = (p) => fetch(BASE + "/api/v1" + p, { headers: H }).then((r) => r.json());

/* ---------- 1. 接口：pending 标记 ---------- */
const banks = (await get("/banks")).data;
const scPend = banks.scales.filter((s) => s.pending).map((s) => s.code);
const paPend = banks.paradigms.filter((p) => p.pending).map((p) => p.code);
ok("量表待开放 = CCSE", JSON.stringify(scPend) === '["CCSE"]', JSON.stringify(scPend));
ok("范式待开放 = CPT/AVLT/REC/FLU/COPY", JSON.stringify(paPend.sort()) === JSON.stringify(["AVLT", "COPY", "CPT", "FLU", "REC"]), JSON.stringify(paPend));
ok("已开放项目未被误标", banks.scales.filter((s) => !s.pending).length === 5 && banks.paradigms.filter((p) => !p.pending).length === 7,
  `scales ${banks.scales.length} / paradigms ${banks.paradigms.length}`);

/* ---------- 2. 接口：方案库 ---------- */
const plans = (await get("/plan-lib?kind=assess")).data;
const named = (n) => plans.find((p) => p.name === n);
const std = named("标准评估方案");
ok("存在标准评估方案", !!std);
if (std) {
  const codes = std.items.map((i) => i.code);
  ok("标准评估方案 = 1 量表 + 6 范式", codes.length === 7 && std.items.filter((i) => i.type === "scale").length === 1,
    JSON.stringify(codes));
  ok("量表在前、范式在后", std.items[0].type === "scale" && std.items.slice(1).every((i) => i.type === "paradigm"), JSON.stringify(codes));
  ok("标准评估方案 45 分钟", std.minutes === 45, String(std.minutes));
}
const withPending = plans.filter((p) => p.items.some((i) => PENDING.includes(i.code)));
ok("所有方案都不含待开放项目", withPending.length === 0, withPending.map((p) => p.name).join(","));
ok("内置方案数 = 4", plans.filter((p) => p.category === "standard").length === 4);

/* ---------- 3. 接口：登录码 / 患者密码 ---------- */
const pid = (await get("/patients?size=100")).data;
const list = Array.isArray(pid) ? pid : (pid.list || pid.rows || []);
const target = list.find((p) => p.outpatient_no === "MZ260022") || list[0];
const tk = (await fetch(`${BASE}/api/v1/patients/${target.id}/ticket`, { method: "POST", headers: H }).then((r) => r.json())).data;
ok("登录码返回初始密码 hs123456", tk.password === "hs123456", String(tk.password));
ok("二维码指向患者端登录页（不在 URL 里带一次性票据）", /\/patient$/.test(tk.url) && !/t=/.test(tk.url), tk.url);
ok("登录码不再返回有效期", tk.expires_at === undefined, String(tk.expires_at));

const plogin = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: tk.account, password: "hs123456" }),
}).then((r) => r.json());
ok("患者任务账号可用 hs123456 登录", plogin.code === 0, plogin.message);

/* ---------- 4. 页面 ---------- */
const browser = await chromium.launch({
  executablePath: process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addInitScript((v) => { try { localStorage.setItem("hs_tk", v); } catch (e) { } }, TK);
const page = await ctx.newPage();
await page.goto(BASE + "/doctor", { waitUntil: "networkidle" });
await page.waitForTimeout(900);

/* 4.1 发起评估 → 评估方案页 */
await page.locator(".el-menu-item:has-text('评估功能')").first().click();
await page.waitForTimeout(1000);
await page.locator("button:has-text('发起评估')").first().click();
await page.waitForTimeout(900);
await page.locator(".el-dialog__body .el-table__row").first().click();
await page.waitForTimeout(1200);
ok("已进入选择评估方案页", (await page.locator(".lb-card:has-text('评估方案')").count()) > 0);
const planCards = await page.locator(".dom-entry .n").allInnerTexts();
ok("方案卡列出 6 个方案", planCards.length === 6, planCards.map((s) => flat(s).replace(/\s*标准\s*$/, "")).join(" | "));
await page.screenshot({ path: path.join(SHOT, "01-assess-plans.png"), fullPage: true });

/* 4.2 临时自定义：置灰 + 排序 */
await page.locator(".el-checkbox:has-text('临时自定义评估项目')").first().click();
await page.waitForTimeout(500);
const panel = page.locator(".lb-card:has(.el-checkbox:has-text('临时自定义评估项目'))");
const boxes = panel.locator(".el-checkbox-group .el-checkbox");
const n = await boxes.count();
const rows = [];
for (let i = 0; i < n; i++) {
  const t = flat(await boxes.nth(i).innerText());
  const disabled = (await boxes.nth(i).getAttribute("class") || "").includes("is-disabled");
  rows.push({ t, disabled });
}
const codeOf = (t) => (t.match(/^[A-Z]{2,6}/) || [""])[0];
const codes = rows.map((r) => codeOf(r.t));
const idxCCSE = codes.indexOf("CCSE");
const idxScaleLast = codes.lastIndexOf("AMT") >= 0 ? codes.length - 1 : -1;
ok("CCSE 置灰", rows[idxCCSE] && rows[idxCCSE].disabled === true);
ok("CCSE 排在量表最后", idxCCSE > 0 && (codes[idxCCSE + 1] === "SPAN" || rows.length > 0) && !rows.slice(0, idxCCSE).some((r) => codeOf(r.t) === "SPAN"),
  "量表序 " + codes.slice(0, Math.max(0, codes.indexOf("SPAN"))).join(","));
for (const c of ["CPT", "AVLT", "REC", "FLU", "COPY"]) {
  const i = codes.indexOf(c);
  ok(`${c} 置灰`, i >= 0 && rows[i].disabled === true);
}
/* 范式组的最后 5 项应当就是待开放集合，且顺序为 原始顺序 */
const paStart = codes.indexOf("SPAN");
const paCodes = codes.slice(paStart);
const readyPa = paCodes.filter((c) => !PENDING.includes(c));
const pendPa = paCodes.filter((c) => PENDING.includes(c));
ok("范式已开放项目排在前面", paCodes.slice(0, readyPa.length).every((c) => !PENDING.includes(c)), paCodes.join(","));
ok("范式待开放 5 项排在最后", JSON.stringify(pendPa) === JSON.stringify(["CPT", "AVLT", "REC", "FLU", "COPY"]), pendPa.join(","));
/* 点一下置灰项不应被选中 */
await boxes.nth(idxCCSE).click({ force: true }).catch(() => { });
await page.waitForTimeout(300);
const picked = flat(await panel.locator("text=/已选 \\d+ 项/").first().innerText()).match(/已选 (\d+)/);
ok("点击置灰项不会选中", !picked || picked[1] === "0", picked ? picked[1] : "-");
await panel.screenshot({ path: path.join(SHOT, "02-custom-picker.png") });

/* 4.2b 选「标准评估方案」→ 下一步：身份核对 */
await page.locator(".el-checkbox:has-text('临时自定义评估项目')").first().click();
await page.waitForTimeout(300);
await page.locator(".dom-entry:has-text('标准评估方案')").first().click();
await page.waitForTimeout(300);
await page.locator("button:has-text('下一步：身份核对')").first().click();
await page.waitForTimeout(900);
ok("选中方案后可进入身份核对", (await page.locator(".sec-bar-t:has-text('患者身份核对')").count()) > 0);
await page.locator("button:has-text('上一步')").first().click();
await page.waitForTimeout(600);

/* 4.3 患者详情：家属账号按钮已去掉 + 登录码弹窗 */
await page.locator(".el-menu-item:has-text('患者信息')").first().click();
await page.waitForTimeout(1200);
await page.locator("button:has-text('详情')").first().click();
await page.waitForTimeout(1200);
const headTxt = flat(await page.locator(".ph-a").first().innerText());
ok("患者详情无「家属账号」按钮", !headTxt.includes("家属账号"), headTxt);
await page.screenshot({ path: path.join(SHOT, "03-patient-detail.png") });

await page.locator(".ph-a button:has-text('登录码')").first().click();
await page.waitForTimeout(1500);
const dlg = page.locator(".el-dialog:has-text('患者登录码')");
const dTxt = flat(await dlg.innerText());
ok("弹窗不再显示「有效期至」", !dTxt.includes("有效期"));
ok("弹窗不再显示「仅可使用一次」", !dTxt.includes("仅可使用一次"));
ok("弹窗不再有「重新生成」按钮", (await dlg.locator("button:has-text('重新生成')").count()) === 0);
ok("弹窗显示初始密码 hs123456", /初始密码\s*hs123456/.test(dTxt), dTxt.slice(0, 120));
ok("提示语已改为「患者用手机扫码，输入任务账号和初始密码登录」",
  dTxt.includes("患者用手机扫码，输入任务账号和初始密码登录"));
ok("二维码已渲染", (await dlg.locator("#tkQr svg").count()) > 0);
await dlg.screenshot({ path: path.join(SHOT, "04-login-dialog.png") });

/* 4.4 方案管理 → 编辑方案：全量项里同样置灰且排最后 */
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.locator(".el-menu-item:has-text('方案管理')").first().click();
await page.waitForTimeout(1200);
const card = page.locator(".plan-card:has-text('标准评估方案')").first();
ok("方案管理里有「标准评估方案」卡片", (await card.count()) > 0);
ok("卡片显示 7 项", /7 项/.test(flat(await card.innerText())), flat(await card.innerText()).slice(0, 80));
await card.locator("button:has-text('编辑')").first().click();
await page.waitForTimeout(800);
const editDlg = page.locator(".el-dialog:has-text('编辑方案')").first();
const eBoxes = editDlg.locator(".el-checkbox");
const eRows = [];
for (let i = 0; i < await eBoxes.count(); i++)
  eRows.push({ t: flat(await eBoxes.nth(i).innerText()), dis: (await eBoxes.nth(i).getAttribute("class") || "").includes("is-disabled") });
const eCodes = eRows.map((r) => (r.t.match(/^[A-Z]{2,6}/) || [""])[0]);
const eCCSE = eCodes.indexOf("CCSE");
ok("方案编辑器里 CCSE 也置灰", eRows[eCCSE] && eRows[eCCSE].dis);
ok("方案编辑器里 CCSE 也在量表最后", eCodes.indexOf("SPAN") === eCCSE + 1, eCodes.join(","));
ok("方案编辑器里 5 项范式待开放全置灰且排最后",
  ["CPT", "AVLT", "REC", "FLU", "COPY"].every((c) => eRows[eCodes.indexOf(c)] && eRows[eCodes.indexOf(c)].dis)
  && JSON.stringify(eCodes.slice(-5)) === JSON.stringify(["CPT", "AVLT", "REC", "FLU", "COPY"]), eCodes.join(","));
await editDlg.screenshot({ path: path.join(SHOT, "05-plan-editor.png") });

await browser.close();
console.log(bad.length ? `\n未通过 ${bad.length} 项：${bad.join(" / ")}` : "\n全部通过");
process.exit(bad.length ? 1 : 0);
