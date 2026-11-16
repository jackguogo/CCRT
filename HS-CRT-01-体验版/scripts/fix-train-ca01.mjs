/**
 * 批量修正 24 个训练页（web/train/*.html）中的 CA-01「信号捕捉」引擎与 HUD 计分显示。
 * 这些页面由同一套引擎拼装，除 DATA/GOALS 外内容一致，故按锚点整块替换。
 *
 * 修正点：
 *   1) CPT 计分口径：干扰图案未点击 = 正确抑制（计对），此前一律记为错，导致正确率上限只有目标比例，永远无法通过；
 *   2) 每关固定 30 个刺激即结算（此前只靠 180s 计时，点完也停不下来）；
 *   3) 点击后给出命中 / 错报 / 漏报 / 正确抑制的即时反馈；
 *   4) 双目标任务真正可见地闪烁并可作答（此前只计数不显示，且副任务逻辑空转）；
 *   5) HUD 的得分改为按已记录的正确试次渲染，避免每次刷新刺激时归零。
 *
 * 运行：Node 20（无外部依赖）  node scripts/fix-train-ca01.mjs
 */
import fs from "node:fs";
import path from "node:path";

const DIR = "web/train";

const CA01 = `  /* —— CA-01 信号捕捉（stream · CPT）——
     计分口径：目标出现并点击＝命中；目标出现未点＝漏报；干扰出现未点＝正确抑制（计对）；干扰出现点击＝错报。
     每关固定 30 个刺激（与其它方案「固定轮次」一致），满 30 个或到达时长上限即结算。 */
  E["CA-01"] = (P) => {
    const id = seq;
    const pool = ["🐶", "🐰", "🦊", "🐻", "🐼", "🐸"];
    const targets = P.dual ? ["🐱", "🐶"] : ["🐱"];
    const distract = pool.slice(0, Math.max(1, P.distr));
    const CAP = 30;
    const isi = P.isi || 1200;
    const endAt = Date.now() + (P.dur || 180) * 1000;
    let shown = 0;

    const syncHUD = () => {
      const n = TRAIN.trials.filter(t => t.correct).length;
      const s = $("#score"), st = $("#star");
      if (s) s.textContent = n;
      if (st) st.textContent = n;
    };

    const step = () => {
      if (!alive(id)) return;
      if (shown >= CAP || Date.now() >= endAt) return finish();
      shown++;
      const isT = Math.random() < (P.ratio || 0.25);
      const stim = isT ? rnd(targets) : rnd(distract);
      const dualNow = !!P.dual && shown % 6 === 0;
      const flashes = dualNow ? Math.floor(Math.random() * 3) + 2 : 0;
      // 副任务刺激留出闪烁时间，避免患者反应过快时没看完就进入作答
      const win = dualNow ? Math.max(isi, flashes * 2 * 420 + 700) : isi;

      stage(\`<div class="playtip">看到 \${targets.join(" ")} 就点【目标】；其他图案不要点\${dualNow ? "；边框闪烁后回答次数" : ""}</div>
        <div class="stim" id="sg">\${stim}</div>
        <button class="pbtn primary xl" id="hit" style="max-width:320px">目 标</button>
        <div class="muted" id="fb">第 \${shown} / \${CAP} 个</div>\`);
      setPad("🎯 " + TRAIN.session.name, \`　第 \${shown} / \${CAP} 个\`);
      syncHUD();

      let answered = false, subDone = false;
      const t0 = performance.now();
      const settle = (correct, rt, miss, tag) => {
        answered = true;
        recordTrial(correct, rt, miss);
        syncHUD();
        const el = $("#sg"), fb = $("#fb");
        if (el) { el.style.boxShadow = "none"; el.style.background = correct ? "#dcfce7" : "#fee2e2"; el.style.borderColor = correct ? "#22c55e" : "#ef4444"; }
        if (fb) { fb.textContent = tag; fb.style.color = correct ? "#15803d" : "#b91c1c"; }
      };

      const askSub = () => {
        if (!alive(id) || subDone) return;
        subDone = true;
        stage(\`<div class="playtip">刚才边框闪烁了几次？</div>
          <div class="row" id="sp"></div>
          <div class="muted">选择后继续下一题</div>\`);
        setPad("🎯 " + TRAIN.session.name, \`　第 \${shown} / \${CAP} 个 · 副任务\`);
        syncHUD();
        let done = false;
        const answer = (ok) => {
          if (done || !alive(id)) return;
          done = true;
          recordTrial(ok, 900, false);
          syncHUD();
          T(220, step, id);
        };
        $("#sp").innerHTML = [1, 2, 3, 4, 5].map(n => \`<button class="pbtn sm" data-n="\${n}">\${n}</button>\`).join("");
        $("#sp").querySelectorAll("[data-n]").forEach(b => { b.onclick = () => answer(+b.dataset.n === flashes); });
        T(8000, () => answer(false), id);
      };

      $("#hit").onclick = () => {
        if (answered) return;
        settle(isT, performance.now() - t0, false, isT ? "✓ 命中目标" : "✗ 这是干扰图案");
        T(dualNow ? 320 : 260, dualNow ? askSub : step, id);
      };

      // 闪烁：亮 → 灭 计一次，共 flashes 次
      if (dualNow) {
        let k = 0;
        const iv = IV(420, () => {
          const el = $("#sg");
          if (el) el.style.boxShadow = (k % 2 === 0) ? "0 0 0 9px #f59e0b" : "none";
          k++;
          if (k >= flashes * 2) clearInterval(iv);
        }, id);
      }

      T(win, () => {
        if (!alive(id) || answered) return;
        settle(!isT, win, isT, isT ? "✗ 漏报目标" : "✓ 正确抑制");
        T(dualNow ? 320 : 260, dualNow ? askSub : step, id);
      }, id);
    };
    step();
  };

`;

const HUD_NEW = `window.HUD = function (extra) {
  const n = (TRAIN && TRAIN.trials) ? TRAIN.trials.filter(function (t2) { return t2.correct; }).length : 0;
  return '<div class="hud"><span>' + ICONS[TRAIN.program] + "</span><span>第 <b>" + TRAIN.level + "</b> 关</span>"
    + '<span>得分 <b id="score" class="num">' + n + '</b></span><span>⭐×<b id="star" class="num">' + n + "</b></span>" + (extra || "")
    + '<span class="sp"><button onclick="useHint()">💡 提示</button>'
    + '<button onclick="showIntro()">⏸ 暂停</button></span></div>';
};`;

const files = fs.readdirSync(DIR).filter(f => f.endsWith(".html") && f !== "index.html");
let ok = 0, skip = 0;
for (const f of files) {
  const p = path.join(DIR, f);
  let s = fs.readFileSync(p, "utf8");
  const before = s;

  const reCA = /  \/\* —— CA-01 信号捕捉（stream · CPT）—— \*\/[\s\S]*?(?=\n  \/\* —— CA-02 目标搜索（grid）—— \*\/)/;
  if (reCA.test(s)) s = s.replace(reCA, CA01.trimEnd());

  const reHUD = /window\.HUD = function \(extra\) \{[\s\S]*?\n\};/;
  if (reHUD.test(s)) s = s.replace(reHUD, HUD_NEW);

  if (s !== before) { fs.writeFileSync(p, s); ok++; } else { skip++; console.log("— 未匹配：", f); }
}
console.log(`已更新 ${ok} 个训练页${skip ? `，${skip} 个未匹配` : ""}`);
