/**
 * 第 95 轮验证：数字广度（SPAN）刺激序列换成《数字广度测验记录表》原始数字后，
 * 施测页（练习 → 开始 → 顺背 3 位）显示是否与记录表一致。
 *
 * 用法：先起临时实例
 *   PORT_ADMIN=3220 PORT_DOCTOR=3221 PORT_PATIENT=3222 \
 *   "/Users/lionz/.nvm/versions/node/v20.19.6/bin/node" server/index.js
 * 再跑：node scripts/qa-span-seqs.mjs
 *
 * 结束时按 record_id 物理删除临时评估（已完成的记录 /cancel 会拒绝）。
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const PORT = process.env.PORT_DOCTOR || 3221;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const WEB = `http://127.0.0.1:${PORT}`;
const __dir = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dir, "../docs/shots-r95");
fs.mkdirSync(SHOT_DIR, { recursive: true });

const bad = [];
const ok = (t, c, e = "") => { console.log(`${c ? "✓" : "✗"} ${t}${e ? "  " + e : ""}`); if (!c) bad.push(t); };

const login = await fetch(`${BASE}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "doctor", password: "hs123456" }),
}).then((r) => r.json());
const TK = login.data.token;
const H = { "Content-Type": "application/json", Authorization: "Bearer " + TK };
const get = (p) => fetch(BASE + p, { headers: H }).then((r) => r.json());
const post = (p, b) => fetch(BASE + p, { method: "POST", headers: H, body: JSON.stringify(b) }).then((r) => r.json());

/* 找一个没有进行中评估的患者 */
const pats = (await get("/patients")).data.list || (await get("/patients")).data;
const running = new Set(((await get("/assessments")).data || []).filter((a) => a.status === "进行中").map((a) => a.patient_id));
const target = pats.find((p) => !running.has(p.id));
if (!target) { console.log("没有可用患者"); process.exit(1); }
console.log(`临时患者：${target.name}（p${target.id}）`);

const mk = await post("/assessments", {
  patientId: target.id, planName: "SPAN 序列校验（临时）", planId: 0,
  items: [{ type: "paradigm", code: "SPAN", name: "数字广度测验" }], mode: "doctor",
});
ok("创建临时评估", mk.code === 0, mk.message || `#${mk.data && mk.data.recordId}`);
const rid = mk.data.recordId;

/* 施测页截图 */
const { chromium } = createRequire(import.meta.url)("playwright-core");
const browser = await chromium.launch({
  executablePath: process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript((tk) => { try { localStorage.setItem("hs_tk", tk); } catch (e) { } }, TK);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 120)));

await page.goto(`${WEB}/doctor?run=${rid}`, { waitUntil: "networkidle" });
const startBtn = page.locator("button:has-text('开始评估')").first();
if (await startBtn.count()) { await startBtn.click(); }
else { console.log("未找到「开始评估」，页面文本：", (await page.locator("body").innerText()).slice(0, 300)); }
await page.waitForTimeout(1200);

const stage = page.locator(".sp-body");
if (await startBtn.count()) { await page.waitForTimeout(1500); }
const hasStage = (await stage.count()) > 0;
ok("进入数字广度施测界面", hasStage, hasStage ? "" : (await page.locator("body").innerText()).slice(0, 160).replace(/\s+/g, " "));

const digitText = async () => (await page.locator(".sp-digits").innerText().catch(() => "")).replace(/\s+/g, "");
const tagText = async () => (await page.locator(".sp-tag").innerText().catch(() => "")).trim();

if (hasStage) {
  /* 单试流程：确认初始只显示占位点 → 点「开始念读」逐个出现 → 念完自动隐藏 → 录入作答 */
  const runTrial = async (label, answer, shot) => {
    const dots = await digitText();
    ok(`${label}：未念读时不显示数字`, /^[·]+$/.test(dots), `实际「${dots}」`);
    if (shot) await stage.screenshot({ path: path.join(SHOT_DIR, shot.replace(".png", "-idle.png")) });
    await page.locator(".sp-read.start").click();
    await page.waitForTimeout(1100);
    const part = await digitText();
    if (answer.length >= 3) {
      const shown = part.replace(/·/g, "").length;
      ok(`${label}：念读中逐个出现（约 1 个/秒）`, shown >= 1 && shown < answer.length, `1.1s 时已显示 ${shown}/${answer.length}`);
      if (shot) await stage.screenshot({ path: path.join(SHOT_DIR, shot.replace(".png", "-reading.png")) });
    }
    await page.waitForSelector(".sp-masked", { timeout: 12000 });
    ok(`${label}：念完数字自动隐藏`, (await page.locator(".sp-digits").count()) === 0);
    if (shot) await stage.screenshot({ path: path.join(SHOT_DIR, shot) });
  };

  /* 练习：顺背 1 位 2 个 + 2 位 2 个，答对后自动进下一试 */
  const PRACTICE = ["8", "3", "69", "28"];
  for (let i = 0; i < PRACTICE.length; i++) {
    await page.waitForTimeout(500);
    await runTrial(`练习第 ${i + 1} 试`, PRACTICE[i], i === 0 ? "01-span-masked-idle.png" : "");
    for (const ch of PRACTICE[i]) await page.keyboard.press(ch);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1900);
  }

  await page.waitForTimeout(600);
  ok("练习结束进入「开始」确认页", (await tagText()).indexOf("准备开始") >= 0, await tagText());
  await stage.screenshot({ path: path.join(SHOT_DIR, "02-span-ready.png") });

  await page.locator(".sp-big:has-text('开 始')").click();
  await page.waitForTimeout(900);

  /* 顺背 3 位第 1 试：念读 → 隐藏 → 键入 582（应判正确，即证明序列是 5-8-2） */
  await runTrial("顺背 3 位第 1 试", "582", "03-span-fwd-3-masked.png");
  for (const ch of "582") await page.keyboard.press(ch);
  await page.waitForTimeout(300);
  await stage.screenshot({ path: path.join(SHOT_DIR, "04-span-fwd-3-typed.png") });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  const fb = (await page.locator(".sp-fb").innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("键入 582 判为正确（序列 = 5-8-2）", /正确/.test(fb), fb.slice(0, 80));
  await stage.screenshot({ path: path.join(SHOT_DIR, "05-span-fwd-3-ok.png") });

  /* 顺背 3 位第 2 试：故意答错 000，从反馈里读回正确顺序应为 6-9-4 */
  await page.waitForTimeout(1500);
  await runTrial("顺背 3 位第 2 试", "694", "");
  for (const ch of "000") await page.keyboard.press(ch);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const fb2 = (await page.locator(".sp-fb").innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("3 位第 2 试正确顺序 = 6 9 4", /6 9 4/.test(fb2), fb2.slice(0, 80));

  /* 3 位第 2 试答错（第 1 试已对，长度不终止）→ 应进入顺背 4 位第 1 试 */
  await page.waitForTimeout(1600);
  const tag4 = await tagText();
  ok("3 位第 2 试答错 → 进入顺背 4 位", /顺背\s*4\s*位/.test(tag4), tag4);
  await runTrial("顺背 4 位第 1 试", "6439", "06-span-fwd-4-masked.png");
}

await browser.close();

/* 清理：物理删除临时评估及其明细/作答/报告 */
const Database = createRequire(import.meta.url)("better-sqlite3");
const db = new Database(path.join(__dir, "../data/hscrt01.db"));
const purge = db.transaction((id) => {
  db.prepare("DELETE FROM report WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_detail WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_score WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_answer WHERE record_id=?").run(id);
  db.prepare("DELETE FROM assess_record WHERE id=?").run(id);
});
const row = db.prepare("SELECT id, plan_name FROM assess_record WHERE id=?").get(rid);
if (row && row.plan_name === "SPAN 序列校验（临时）") purge(rid);
db.close();
console.log(`\n清理临时评估 #${rid}`);

console.log(bad.length ? `\n✗ ${bad.length} 项未通过：${bad.join(" / ")}` : "\n全部通过");
process.exit(bad.length ? 1 : 0);
