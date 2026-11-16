/**
 * 第 104 轮核对：Stroop 准备页去掉系统判定口径说明（原 .sk-ready-n 那段）
 *
 * 用法：先起临时实例
 *   PORT_ADMIN=3220 PORT_DOCTOR=3221 PORT_PATIENT=3222 ~/.nvm/versions/node/v20.19.6/bin/node server/index.js
 * 再跑：node scripts/shot-r104.mjs
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const require = createRequire(import.meta.url);
const PORT = process.env.PORT_DOCTOR || 3221;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const WEB = `http://127.0.0.1:${PORT}`;
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SHOT = path.join(__dir, "../docs/shots-r104");
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

const PLAN = "Stroop 准备页去说明核对（临时）";
const mk = await post("/assessments", {
  patientId: target.id, planName: PLAN, planId: 0,
  items: [{ type: "paradigm", code: "STROOP", name: "Stroop 色词测验（SCWT）" }], mode: "doctor",
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
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 160)));

await page.goto(`${WEB}/doctor?run=${rid}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1100);
await page.locator("button:has-text('开始评估')").first().click();
await page.waitForTimeout(800);

/* 卡片 A 准备页 */
const readyA = flat(await page.locator(".sk-ready").first().innerText());
ok("卡片 A 准备页无系统说明文字", !/被试开口即计时|逐格判定|自动停表|系统按/.test(readyA), readyA);
ok("卡片 A 准备页仍保留卡片名/题量/开始按钮",
  /卡片 A/.test(readyA) && /共 50 个/.test(readyA) && /准备，开始/.test(readyA), readyA);
ok("准备页不再有 .sk-ready-n 节点", (await page.locator(".sk-ready-n").count()) === 0, "");
await page.locator(".sk-ready").first().screenshot({ path: path.join(SHOT, "01-ready-a.png") });

/* 跑到卡片 C 准备页 */
const press = async (keys) => { for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(8); } };
for (const card of ["A", "B"]) {
  await page.locator(".sk-start").click();
  await page.waitForTimeout(250);
  await press(Array(50).fill("Space"));
  await page.waitForTimeout(350);
  await page.locator(".sk-next").click();
  await page.waitForTimeout(300);
}
const readyC = flat(await page.locator(".sk-ready").first().innerText());
ok("卡片 C 准备页无「系统按墨色判对错」说明", !/墨色|逐格判定|自动停表/.test(readyC), readyC);
ok("卡片 C 准备页为「卡片 C · 色词任务 / 读出字印刷的颜色…· 共 50 个」",
  /卡片 C · 色词任务/.test(readyC) && /共 50 个/.test(readyC), readyC);
await page.locator(".sk-ready").first().screenshot({ path: path.join(SHOT, "02-ready-c.png") });
await page.screenshot({ path: path.join(SHOT, "03-ready-c-full.png") });

await browser.close();

/* 清理 */
const Database = require("better-sqlite3");
const db = new Database(path.join(__dir, "../data/hscrt01.db"));
const purge = db.transaction((id) => {
  ["report", "assess_detail", "assess_score", "assess_answer"].forEach((t) => db.prepare(`DELETE FROM ${t} WHERE record_id=?`).run(id));
  db.prepare("DELETE FROM assess_record WHERE id=?").run(id);
});
const row = db.prepare("SELECT id, plan_name FROM assess_record WHERE id=?").get(rid);
if (row && row.plan_name === PLAN) purge(rid);
db.close();
console.log(`\n清理临时评估 #${rid}`);
console.log(bad.length ? `\n✗ ${bad.length} 项未通过：${bad.join(" / ")}` : "\n全部通过");
process.exit(bad.length ? 1 : 0);
