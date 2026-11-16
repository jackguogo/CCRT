/**
 * 截图：ADAS-Cog 长分档（>8 档）在评分页的降级形态
 * 背景：分档按钮 ≤8 档时显示「分值 + 判据」，>8 档时改为纯分值按钮 + 选中档判据单行，
 *       否则 ADAS A06（13 档）、A05（9 档）的判据文字会把一行撑爆。
 * 流程：建临时 ADAS 评估 → 打开评分页 → 截 A06 行 → 物理删除临时记录（不留痕）。
 */
import { chromium } from "/Users/lionz/.workbuddy-ai/binaries/node/workspace/node_modules/playwright-core/index.mjs";
import { execFileSync } from "node:child_process";
import path from "path";
import fs from "node:fs";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const EXE = "/Users/lionz/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUT = path.join(__dir, "../docs/shots-r59");
const BASE = "http://localhost:3211/api/v1";
fs.mkdirSync(OUT, { recursive: true });

const login = await fetch(`${BASE}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "doctor", password: "hs123456" }),
}).then((r) => r.json());
const H = { "Content-Type": "application/json", Authorization: "Bearer " + login.data.token };
const get = (p) => fetch(BASE + p, { headers: H }).then((r) => r.json());
const post = (p, b) => fetch(BASE + p, { method: "POST", headers: H, body: JSON.stringify(b) }).then((r) => r.json());

const pats = (await get("/patients")).data.list || (await get("/patients")).data;
const running = new Set(((await get("/assessments")).data || []).filter((a) => a.status === "进行中").map((a) => a.patient_id));
const target = pats.find((p) => !running.has(p.id));
if (!target) { console.log("没有可用患者"); process.exit(1); }

const mk = await post("/assessments", {
  patientId: target.id, planName: "ADAS 长分档截图（临时）", planId: 0,
  items: [{ type: "scale", code: "ADAS", name: "阿尔茨海默病评定量表-认知部分（ADAS-Cog）" }], mode: "doctor",
});
const rid = mk.data.recordId;
await post(`/assessments/${rid}/record-item`, { code: "ADAS" });
console.log(`临时评估 #${rid} · ${target.name}`);

/* 清理函数：跑在 Node 22 的脚本不能直接 require better-sqlite3（按 Node 20 编译，
   NODE_MODULE_VERSION 115），交给 Node 20 子进程删除，避免留下临时评估污染临床数据。 */
const NODE20 = "/Users/lionz/.nvm/versions/node/v20.19.6/bin/node";
const DB = path.join(__dir, "../data/hscrt01.db");
const purge = () => {
  const code = `
const Database = require("better-sqlite3");
const db = new Database(${JSON.stringify(DB)});
const id = ${rid};
db.transaction((id) => {
  db.prepare("DELETE FROM report WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_detail WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_score WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_answer WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_record WHERE id=?").run(id);
})(id);
console.log(db.prepare("SELECT COUNT(*) c FROM assess_record WHERE id=?").get(id).c);
db.close();
`;
  const left = execFileSync(NODE20, ["-e", code], { encoding: "utf8" }).trim();
  console.log(left === "0" ? `✓ 临时评估 #${rid} 已清理` : `! 临时评估 #${rid} 清理失败（剩 ${left}）`);
};
/* 用 try/finally 兜住：中途任何断言/选择器失败都要清理，否则残留一条进行中评估 */
try {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1120 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));

  await page.goto("http://localhost:3211/doctor", { waitUntil: "networkidle" });
  await page.fill('input[placeholder*="账号"], input[placeholder*="用户名"]', "doctor");
  await page.fill('input[type="password"]', "hs123456");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1800);
  await page.goto(`http://localhost:3211/doctor?run=${rid}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const dlg = page.locator('.el-message-box:visible').first();
  if (await dlg.count()) { await page.keyboard.press("Escape"); await page.waitForTimeout(400); }

  const revBtn = page.locator('button:visible', { hasText: "评分并提交" }).first();
  await revBtn.click();
  await page.waitForTimeout(2200);
  if (await dlg.count()) { await page.keyboard.press("Escape"); await page.waitForTimeout(400); }

  /* 定位 A06（13 档）那一行，点一个非当前分档位，再截「分值按钮 + 判据单行」 */
  const info = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.rv-row')];
    const row = rows.find((r) => r.querySelectorAll('.rv-band').length > 8);
    if (!row) return null;
    const n = row.querySelectorAll('.rv-band').length;
    const btns = [...row.querySelectorAll('.rv-band')];
    const cur = Number((row.querySelector('.rv-score b') || {}).textContent || -1);
    const t = btns.find((b) => Number(b.querySelector('.rv-band-v').textContent) !== cur) || btns[0];
    if (t) t.click();
    const main = document.querySelector(".el-main");
    if (main) main.scrollTop = Math.max(0, row.offsetTop - 260);
    const desc = (row.querySelector('.rv-band-desc') || {}).textContent || "";
    return { bands: n, desc: desc.trim().slice(0, 40) };
  });
  await page.waitForTimeout(600);
  if (!info) console.log("! 未找到 >8 档题目");
  else console.log(`✓ 长分档题：${info.bands} 档，选中档判据「${info.desc}」`);
  await page.screenshot({ path: path.join(OUT, "07-review-longbands.png") });
  console.log("✓ 07-review-longbands");
  console.log("控制台错误:", errs.length ? errs.slice(0, 3) : "none");
  await browser.close();
} finally {
  await purge();
}
