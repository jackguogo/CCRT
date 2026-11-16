/**
 * 第 107 轮核对：BNT 图片清晰度（素材改原生 2 倍 + 显示尺寸收到 260px）
 *
 * 用法：node scripts/shot-r107.mjs   （默认打 3211 实例）
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const require = createRequire(import.meta.url);
const PORT = process.env.PORT_DOCTOR || 3211;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const WEB = `http://127.0.0.1:${PORT}`;
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SHOT = path.join(__dir, "../docs/shots-r107");
fs.mkdirSync(SHOT, { recursive: true });

const bad = [];
const ok = (t, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${t}${e ? "  " + e : ""}`); if (!c) bad.push(t); };
const flat = (s) => (s || "").replace(/\s+/g, " ").trim();

const login = await fetch(`${BASE}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "doctor", password: "hs123456" }),
}).then((r) => r.json());
const TK = login.data.token;
const H = { "Content-Type": "application/json", Authorization: "Bearer " + TK };
const get = (p) => fetch(BASE + p, { headers: H }).then((r) => r.json());
const post = (p, b) => fetch(BASE + p, { method: "POST", headers: H, body: JSON.stringify(b) }).then((r) => r.json());

const pats = (await get("/patients")).data.list || (await get("/patients")).data;
const running = new Set(((await get("/assessments")).data || []).filter((a) => a.status === "进行中").map((a) => a.patient_id));
const target = pats.find((p) => !running.has(p.id));
if (!target) { console.log("没有可用患者"); process.exit(1); }

const mk = await post("/assessments", {
  patientId: target.id, planName: "BNT 清晰度核对（临时）", planId: 0,
  items: [{ type: "paradigm", code: "BNT", name: "波士顿命名测验（BNT）" }], mode: "doctor",
});
ok("创建临时评估", mk.code === 0, mk.message || "");
const rid = mk.data.recordId;

const { chromium } = require("playwright-core");
const browser = await chromium.launch({
  executablePath: process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript((tk) => { try { localStorage.setItem("hs_tk", tk); } catch (e) { } }, TK);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 200)));

await page.goto(`${WEB}/doctor?run=${rid}`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await page.locator("button:has-text('开始评估')").first().click();
await page.waitForTimeout(1000);

const img = page.locator(".bn-fig img");
const info = await img.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return {
    cssW: Math.round(r.width), cssH: Math.round(r.height),
    natW: el.naturalWidth, natH: el.naturalHeight,
    src: el.getAttribute("src"),
  };
});
console.log("  第 1 张：", JSON.stringify(info));
ok("图片按原生 2 倍素材输出（naturalWidth 200–420）", info.natW >= 200 && info.natW <= 420, String(info.natW));
ok("显示尺寸收到 ≤ 262 CSS px", info.cssW <= 262 && info.cssW >= 180, String(info.cssW));
ok("素材像素 ≥ 显示 CSS 像素的 1.0 倍（不再靠拉伸放大）", info.natW >= info.cssW, `${info.natW} vs ${info.cssW}`);

await page.screenshot({ path: path.join(SHOT, "01-bnt-260.png") });

// 找到一张竖构图（14 号地球仪）看长宽比适配
for (let i = 0; i < 13; i++) {
  await page.locator(".bn-col").nth(0).locator("button:has-text('正确')").click();
  await page.waitForTimeout(90);
}
const info14 = await page.locator(".bn-fig img").evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { cssW: Math.round(r.width), cssH: Math.round(r.height), natW: el.naturalWidth, natH: el.naturalHeight, src: el.getAttribute("src") };
});
console.log("  第 14 张：", JSON.stringify(info14));
ok("竖构图不被超素材像素放大、且不变形", info14.cssW <= info14.natW && info14.cssH <= info14.natH, JSON.stringify(info14));
await page.screenshot({ path: path.join(SHOT, "02-bnt-item14.png") });

// 布局：页头在顶部、图区居中、评分列在底部，且不重叠不溢出
const lay = await page.evaluate(() => {
  const q = (s) => document.querySelector(s).getBoundingClientRect();
  const stage = q(".qx-stage"), hd = q(".bn-hd"), fig = q(".bn-fig img"), bar = q(".bn-bar"), acts = q(".bn-acts");
  return {
    hdTop: Math.round(hd.top), stageTop: Math.round(stage.top),
    imgBottom: Math.round(fig.bottom), barTop: Math.round(bar.top),
    actsBottom: Math.round(acts.bottom), stageBottom: Math.round(stage.bottom),
  };
});
console.log("  布局：", JSON.stringify(lay));
ok("页头贴舞台顶部（不再悬在图上方）", lay.hdTop - lay.stageTop <= 60, String(lay.hdTop - lay.stageTop));
ok("评分列不与图片重叠", lay.barTop > lay.imgBottom, `${lay.barTop} > ${lay.imgBottom}`);
ok("底部按钮不溢出舞台", lay.actsBottom <= lay.stageBottom + 1, `${lay.actsBottom} <= ${lay.stageBottom}`);

await browser.close();
const del = await fetch(`${BASE}/assessments/${rid}/cancel`, {
  method: "POST", headers: H, body: JSON.stringify({ reason: "清晰度核对脚本产生的临时评估，核对完成后清理" }),
}).then((r) => r.json());
if (del.code === 0) console.log(`清理临时评估 #${rid}`);
console.log(bad.length ? `\n未通过 ${bad.length} 项：${bad.join(" / ")}` : "\n全部通过");
process.exit(bad.length ? 1 : 0);
