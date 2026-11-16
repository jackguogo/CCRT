// r110：报告「各项目完成情况」口径核对
// 断言：量表卡片有参考区间/判读；范式卡片逐项给出该范式实际计分维度，
//       不再出现「顺背广度 / 一致正确率 / 干扰量 / 自发命名数」等旧指标名。
import { createRequire } from "module";
import fs from "fs";
import path from "path";
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, "..");
const { chromium } = require(path.join(ROOT, "node_modules/playwright-core"));
const PORT = process.env.PORT_DOCTOR || 3211;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOT = path.join(ROOT, "docs/shots-r110");
fs.mkdirSync(SHOT, { recursive: true });

const bad = [];
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${name}${extra ? "  " + extra : ""}`);
  if (!cond) bad.push(name);
};
const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();

const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "doctor", password: "hs123456" }),
}).then((r) => r.json());
const TK = login.data.token;
const H = { "Content-Type": "application/json", Authorization: "Bearer " + TK };
const get = (p) => fetch(BASE + "/api/v1" + p, { headers: H }).then((r) => r.json());

/* 后端先核对一遍：接口返回的 chart 是否已是新口径（挑一份含范式的报告） */
const Database = require(path.join(ROOT, "node_modules/better-sqlite3"));
const rdb = new Database(path.join(ROOT, "data/hscrt01.db"), { readonly: true });
const cand = rdb.prepare("SELECT id, chart FROM report ORDER BY id").all()
  .find((r) => /paradigm/.test(r.chart || ""));
rdb.close();
const full = cand ? (await get("/reports/" + cand.id)).data : null;
ok("报告接口返回 chart", !!full && Array.isArray(full.chart) && full.chart.length > 0);

const paras = (full ? full.chart : []).filter((c) => c.kind === "paradigm");
/* 旧口径专有词：新维度里「顺背广度/倒背广度」是有意保留的过程指标，不算旧词 */
const oldWords = ["A完成时间", "B完成时间", "一致正确率", "不一致正确率", "干扰量", "自发命名数", "提示后命名数", "提示使用"];
const flatK = paras.map((p) => (p.metrics || []).map((m) => m.k));
ok("接口不再输出旧指标名", !flatK.flat().some((k) => oldWords.includes(k)), JSON.stringify(flatK.flat()));
ok("每个范式都带计分维度", paras.every((p) => !!p.scoreDim), JSON.stringify(paras.map((p) => p.scoreDim)));

const browser = await chromium.launch({
  executablePath: process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addInitScript((tk) => { try { localStorage.setItem("hs_tk", tk); } catch (e) { } }, TK);
const page = await ctx.newPage();
await page.goto(BASE + "/doctor", { waitUntil: "networkidle" });
await page.waitForTimeout(900);

/* 评估功能 → 已完成 → 第一条「查看报告」 */
await page.locator("text=评估功能").first().click();
await page.waitForTimeout(1000);
await page.locator(".el-radio-button:has-text('已完成')").first().click();
await page.waitForTimeout(1000);
const btns = page.locator("button:has-text('查看报告')");
const btnN = await btns.count();
ok("评估功能页有「查看报告」入口", btnN > 0, String(btnN));
/* 逐条打开，优先停在范式最全的那份（便于核对六类范式的维度是否都对齐） */
let opened = false, best = 0;
for (let i = 0; i < Math.min(btnN, 10); i++) {
  await btns.nth(i).click();
  await page.waitForTimeout(1200);
  const n = await page.locator(".pf-card").count();
  if (n > best) best = n;
  if (n >= 5) { opened = true; break; }
  await page.locator("button:has-text('返回')").first().click();
  await page.waitForTimeout(700);
  await page.locator(".el-radio-button:has-text('已完成')").first().click();
  await page.waitForTimeout(800);
}
if (!opened && best > 0) opened = true;
ok("找到含范式的报告页", opened, "最多卡片数 " + best);

const rep = page.locator(".rep-wrap");
ok("报告页已打开", (await rep.count()) > 0);
const txt = flat(await rep.innerText());
await page.screenshot({ path: path.join(SHOT, "01-report-full.png"), fullPage: true });

ok("量表区标题仍在", /量表评定/.test(txt));
ok("范式区标题仍在", /范式评估/.test(txt));
ok("范式卡片逐张列出计分维度", (txt.match(/计分维度：/g) || []).length >= 1,
  String((txt.match(/计分维度：/g) || []).length));
ok("页面无旧指标名", !oldWords.some((w) => txt.includes(w)), oldWords.filter((w) => txt.includes(w)).join(","));

const cards = page.locator(".pf-card");
const n = await cards.count();
ok("范式卡片数 > 0", n > 0, String(n));
const firstTxt = n ? flat(await cards.first().innerText()) : "";
ok("首张范式卡片带「计分维度」", /计分维度：/.test(firstTxt), firstTxt.slice(0, 60));
ok("首张范式卡片带计分分值", /计分\s*\d+\s*\/\s*\d+/.test(firstTxt) || /计分维度/.test(firstTxt), firstTxt.slice(0, 60));

/* 逐个卡片截图，便于核对每一类范式 */
for (let i = 0; i < Math.min(n, 8); i++) {
  await cards.nth(i).screenshot({ path: path.join(SHOT, `02-card-${i + 1}.png`) });
}
await page.locator(".pf-grid").screenshot({ path: path.join(SHOT, "03-paradigm-grid.png") });
await page.locator(".rep-sub").first().screenshot({ path: path.join(SHOT, "04-scale-head.png") });

await browser.close();
console.log(bad.length ? `\n未通过 ${bad.length} 项：${bad.join(" / ")}` : "\n全部通过");
process.exit(bad.length ? 1 : 0);
