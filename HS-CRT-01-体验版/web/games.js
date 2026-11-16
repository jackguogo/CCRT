/* games.js —— 训练引擎：DSM-5 六域 24 方案逐项实现
   每个方案按 PRD 第7章关卡参数表逐关差异化；关卡判定统一走服务端 /train/result（表7-1规则）。
   依赖 patient.html 全局：$, pad, setPad, HUD, TRAIN, recordTrial, settleView, speak, toast, esc, rnd, shuffle, API */
window.Games = (function () {
  let seq = 0;            // 会话序号：切换界面后旧定时器全部失效
  let C = null;           // 当前会话上下文
  const alive = (id) => id === seq;
  const stage = (inner) => pad(HUD() + `<div class="pcard center" style="min-height:330px">${inner}</div>`);
  const finish = () => {
    const secs = Math.round((Date.now() - TRAIN.startAt) / 1000);
    API.post("/train/result", { planId: TRAIN.planId, program: TRAIN.program, level: TRAIN.level, durationS: secs, trials: TRAIN.trials })
      .then(r => settleView(r)).catch(e => toast(e.message, false));
  };
  const T = (ms, fn, id) => setTimeout(() => { if (alive(id)) fn(); }, ms);
  const IV = (ms, fn, id) => setInterval(() => { if (!alive(id)) { return; } fn(); }, ms);
  const beep = (() => {
    let ac = null;
    return (times = 1) => {
      try {
        ac = ac || new (window.AudioContext || window.webkitAudioContext)();
        for (let i = 0; i < times; i++) {
          const o = ac.createOscillator(), g = ac.createGain();
          o.frequency.value = 660; o.type = "sine"; o.connect(g); g.connect(ac.destination);
          g.gain.setValueAtTime(0.12, ac.currentTime + i * 0.35);
          g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + i * 0.35 + 0.22);
          o.start(ac.currentTime + i * 0.35); o.stop(ac.currentTime + i * 0.35 + 0.24);
        }
      } catch (e) {}
    };
  })();

  const GOAL = {
    "CA-01": "屏幕依次出现图案，看到 🐱 就快速点击按钮，其他图案不要点；高关卡会出现双目标与计数副任务。",
    "CA-02": "在干扰物中找出全部目标图案并逐个点击，越快越好，注意限时。",
    "CA-03": "先比较左边数字与右边数字谁大，再回答刚才出现了几个声音/彩点，两题都要答对。",
    "CA-04": "按当前规则对数字作答：奇偶 / 大小(50) / 比5。规则会切换，低关卡有线索提示，高关卡凭记忆。",
    "EX-01": "按【文字的颜色】选择按钮，不要按字的意思；不一致比例与限时随关卡提高。",
    "EX-02": "按顺序点击节点连线：A型数字顺序，B型数字-汉字交替；限时内完成，点错会扣分。",
    "EX-03": "点击木桩选中顶部彩球，再点目标木桩移动；把布局摆成目标样子，步数越少越好。",
    "EX-04": "正背/倒背数字，或 n-back：当前数字与前面第N个相同时点【相同】。",
    "LM-01": "记住数字串后按序（或倒序）输入；高关卡有干扰数字，注意只回忆第一串。",
    "LM-02": "听词表→回忆输入→干扰→延迟回忆（→再认），逐关加长词表与延迟。",
    "LM-03": "先记住图案位置，延迟后点击两张相同图案的卡片完成配对。",
    "LM-04": "按购物清单在货架中找齐商品；【稍后执行】的商品要在清单找完后再点。",
    "LA-01": "说出/输入图片名称；可按当前关卡的提示政策求助（语义→首字）。",
    "LA-02": "限时说出规定类别的词语，由工作人员协助输入，词库自动校验。",
    "LA-03": "按题目类型作答：词图配对 / 近义 / 反义 / 找不同类 / 抽象词。",
    "LA-04": "听语音指令后按顺序点击屏上的物品；注意“不要点…”的条件。",
    "VP-01": "图形辨别：完全一样吗？缺了哪一块？重叠图形有几种？",
    "VP-02": "数一数堆叠的立方体，或选择与目标剪影一致的积木组合。",
    "VP-03": "旋转/镜像判断，以及记住箭头路线后按顺序复现。",
    "VP-04": "照着浅色底稿在触屏上临摹；系统按覆盖要素自动判定，医生可复核。",
    "SC-01": "看人脸表情选择对应的情绪词；低强度与混合表情难度更高。",
    "SC-02": "读一段小故事，推断人物的想法、意图或下一步行为。",
    "SC-03": "选择社交情境中最得体的做法。",
    "SC-04": "判断一句话的言外之意：客套 / 比喻 / 讽刺 / 委婉。",
  };

  /* ================= 各方案引擎 ================= */
  const E = {};

  /* —— CA-01 信号捕捉（stream · CPT）—— */
  E["CA-01"] = (P) => {
    const id = seq;
    const pool = ["🐶", "🐰", "🦊", "🐻", "🐼", "🐸"];
    const targets = P.dual ? ["🐱", "🐶"] : ["🐱"];
    const distract = pool.slice(0, Math.max(1, P.distr));
    const endAt = Date.now() + (P.dur || 180) * 1000;
    let subCount = 0, subAnswered = 0, subRight = 0;
    const step = () => {
      if (!alive(id)) return;
      if (Date.now() >= endAt) return finish();
      const isT = Math.random() < (P.ratio || 0.25);
      const stim = isT ? rnd(targets) : rnd(distract);
      const dualNow = P.dual && Math.random() < 0.18;
      if (dualNow) { subCount = Math.floor(Math.random() * 4) + 1; subAnswered = 0; }
      stage(`<div class="playtip">看到 ${targets.join(" ")} 就点【目标】；其他不要点${P.dual ? "；出现彩色边框时记住闪烁次数" : ""}</div>
        <div class="stim" id="sg" style="${dualNow ? "box-shadow:0 0 0 6px #f59e08" : ""}">${stim}</div>
        <button class="pbtn primary xl" id="hit" style="max-width:320px">目 标</button>
        <div class="muted" id="subq"></div>`);
      setPad( TRAIN.session.name, `　剩余 ${Math.ceil((endAt - Date.now()) / 1000)}s`);
      const t0 = performance.now();
      let done = false;
      $("#hit").onclick = () => {
        if (done) return; done = true;
        recordTrial(isT, performance.now() - t0);
        if (dualNow && subAnswered === 0) { subAnswered = 1; subRight += subCount >= 1 ? 0 : 0; }
        $("#sg").style.background = isT ? "#dcfce7" : "#fee2e2";
        T(200, step, id);
      };
      // 副任务：双关卡下随机出现的彩点计数（刺激后作答）
      if (dualNow) {
        let flashes = 0;
        const iv = IV(420, () => {
          flashes++;
          if (flashes > subCount) { clearInterval(iv); if (alive(id)) askSub(); }
        }, id);
      }
      T((P.isi || 1200), () => {
        if (!done) { recordTrial(false, P.isi || 1200, true); }
        if (dualNow && subAnswered === 0) askSub(true);
        else T(150, step, id);
      }, id);
      function askSub(timeout) {
        const el = $("#subq"); if (!el) return;
        el.innerHTML = `<div class="playtip">刚才边框闪烁了几次？</div><div class="row" style="justify-content:center" id="sp"></div>`;
        $("#sp").innerHTML = [1, 2, 3, 4, 5].map(n => `<button class="pbtn sm" data-n="${n}">${n}</button>`).join("");
        $("#sp").querySelectorAll("[data-n]").forEach(b => b.onclick = () => {
          recordTrial(+b.dataset.n === subCount, 1000);
          el.innerHTML = ""; T(150, step, id);
        });
      }
    };
    step();
  };

  /* —— CA-02 目标搜索（grid）—— */
  E["CA-02"] = (P) => {
    const id = seq;
    const pool = P.sim >= 3 ? ["🍎", "🍏", "🍑", "🍅", "🥭"] : ["🍎", "🍌", "🍇", "🍓", "🍊", "🍑", "🍍", "🥝"];
    const boards = 4; let b = 0, found = 0, miss = 0;
    const build = () => {
      if (!alive(id)) return;
      if (b >= boards) return finish();
      b++;
      const target = rnd(pool);
      const cells = Array.from({ length: P.n }, () => ({ e: rnd(pool.filter(x => x !== target)), isT: false }));
      shuffle(cells.map((_, i) => i)).slice(0, Math.min(P.targets, P.n)).forEach(i => { cells[i].e = target; cells[i].isT = true; });
      stage(`<div class="playtip">找出全部 <b style="font-size:22px">${target}</b>（共 ${Math.min(P.targets, P.n)} 个）${P.tl ? " · 限时 " + P.tl + " 秒" : ""}</div>
        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;max-width:520px" id="g"></div>
        <div class="muted" id="pr">第 ${b}/${boards} 板 · 已找到 0</div>`);
      setPad( TRAIN.session.name, `　第 ${b}/${boards} 板`);
      const t0 = performance.now();
      $("#g").innerHTML = cells.map((c, i) => `<button class="pbtn sm" style="font-size:26px;padding:10px" data-i="${i}">${c.e}</button>`).join("");
      $("#g").querySelectorAll("[data-i]").forEach(btn => btn.onclick = () => {
        const c = cells[+btn.dataset.i];
        if (c.isT && !btn.disabled) {
          found++; btn.disabled = true; btn.style.opacity = .3;
          recordTrial(true, performance.now() - t0);
          $("#pr").textContent = `第 ${b}/${boards} 板 · 已找到 ${found}`;
          if (found >= Math.min(P.targets, P.n)) { found = 0; T(400, build, id); }
        } else if (!btn.disabled) { miss++; recordTrial(false, performance.now() - t0); btn.style.background = "#fee2e2"; T(250, () => btn.style.background = "", id); }
      });
      if (P.tl) T(P.tl * 1000, () => { if ($("#g")) { toast("时间到", false); found = 0; build(); } }, id);
    };
    build();
  };

  /* —— CA-03 一心二用（双任务）—— */
  E["CA-03"] = (P) => {
    const id = seq;
    const dur = (P.dur || 240) * 1000, endAt = Date.now() + dur;
    const step = () => {
      if (!alive(id)) return;
      if (Date.now() >= endAt) return finish();
      const a = Math.floor(Math.random() * 90) + 5, b2 = Math.floor(Math.random() * 90) + 5;
      const beeps = Math.floor(Math.random() * 3) + (P.dual >= 3 ? 2 : 1);
      stage(`<div class="playtip">第一步：左边和右边哪个大？</div>
        <div class="stim">${a} <span style="font-size:28px;color:#94a3b8">vs</span> ${b2}</div>
        <div class="row" style="justify-content:center" id="cmp"></div>
        <div id="sec" style="display:none"><div class="playtip">第二步：刚才响了几声？</div>
        <div class="row" style="justify-content:center" id="sp"></div></div>`);
      setPad( TRAIN.session.name, `　剩余 ${Math.ceil((endAt - Date.now()) / 1000)}s`);
      beep(beeps);
      const t0 = performance.now();
      const right = a > b2 ? `${a}大` : `${b2}大`;
      $("#cmp").innerHTML = [`${a}大`, `${b2}大`].map(x => `<button class="pbtn" data-v="${x}">${x}</button>`).join("");
      $("#cmp").querySelectorAll("[data-v]").forEach(btn => btn.onclick = () => {
        const mainOK = btn.dataset.v === right;
        $("#cmp").style.display = "none"; $("#sec").style.display = "block";
        $("#sp").innerHTML = [1, 2, 3, 4, 5].map(n => `<button class="pbtn sm" data-n="${n}">${n}声</button>`).join("");
        $("#sp").querySelectorAll("[data-n]").forEach(b3 => b3.onclick = () => {
          recordTrial(mainOK && +b3.dataset.n === beeps, performance.now() - t0);
          T(200, step, id);
        });
      });
    };
    step();
  };

  /* —— CA-04 快速切换（stream · 任务转换）—— */
  E["CA-04"] = (P) => {
    const id = seq;
    const dur = (P.dur || 240) * 1000, endAt = Date.now() + dur;
    const RULES = P.rules === 3 ? ["奇偶", "大小", "比5"] : ["奇偶", "大小"];
    let rule = rnd(RULES), since = 0;
    const OPTS = { "奇偶": ["奇数", "偶数"], "大小": ["大于50", "小于50"], "比5": ["大于5", "小于5"] };
    const judge = (n, r) => r === "奇偶" ? (n % 2 ? "奇数" : "偶数") : r === "大小" ? (n > 50 ? "大于50" : "小于50") : (n > 5 ? "大于5" : "小于5");
    const step = () => {
      if (!alive(id)) return;
      if (Date.now() >= endAt) return finish();
      since++;
      if (P.switch === 1 || since >= (P.switch || 5)) { rule = rnd(RULES); since = 0; }
      const n = Math.floor(Math.random() * 99) + 1;
      const right = judge(n, rule);
      const buttons = P.cue ? OPTS[rule] : Object.values(OPTS).flat();
      stage(`<div class="playtip">当前规则：${P.cue === 1 ? `<b style="color:#0e9f6e">${rule}</b>` : P.cue === 2 ? `<b style="color:#d97706">线索已弱化，注意判断</b>` : "<b style='color:#dc2626'>无线索，凭记忆判断</b>"}</div>
        <div class="stim">${n}</div><div class="row" style="justify-content:center;flex-wrap:wrap" id="bs"></div>`);
      setPad( TRAIN.session.name, `　剩余 ${Math.ceil((endAt - Date.now()) / 1000)}s`);
      const t0 = performance.now();
      let done = false;
      $("#bs").innerHTML = buttons.map(o => `<button class="pbtn" data-v="${o}">${o}</button>`).join("");
      $("#bs").querySelectorAll("[data-v]").forEach(btn => btn.onclick = () => {
        if (done) return; done = true;
        recordTrial(btn.dataset.v === right, performance.now() - t0);
        T(220, step, id);
      });
      T(3800, () => { if (!done) { done = true; recordTrial(false, 3800, true); T(150, step, id); } }, id);
    };
    step();
  };

  /* —— EX-01 色词辨析（stream · Stroop）—— */
  E["EX-01"] = (P) => {
    const id = seq;
    const colors = [["红", "#dc2626"], ["蓝", "#2563eb"], ["绿", "#16a34a"], ["黄", "#d97706"]];
    const dur = (P.dur || 240) * 1000, endAt = Date.now() + dur;
    const step = () => {
      if (!alive(id)) return;
      if (Date.now() >= endAt) return finish();
      const word = rnd(colors)[0];
      const incong = Math.random() < (P.inc || 0);
      const ink = incong ? rnd(colors.filter(c => c[0] !== word))[1] : colors.find(c => c[0] === word)[1];
      const noise = P.extra === "视觉干扰" ? `<div style="position:absolute;inset:0;pointer-events:none;opacity:.25">${Array.from({ length: 14 }, () => `<span style="position:absolute;left:${Math.random() * 90}%;top:${Math.random() * 90}%;color:${rnd(colors)[1]};font-size:22px">${rnd(["■", "●", "▲"])}</span>`).join("")}</div>` : "";
      stage(`<div class="playtip">按【文字的颜色】选择，不要按字的意思${P.extra ? "（" + P.extra + "）" : ""}</div>
        <div style="position:relative;width:100%"><div class="stim" style="color:${ink}">${word}</div>${noise}</div>
        <div class="row" style="justify-content:center" id="bs"></div>`);
      setPad( TRAIN.session.name, `　剩余 ${Math.ceil((endAt - Date.now()) / 1000)}s`);
      const t0 = performance.now();
      let done = false;
      $("#bs").innerHTML = colors.map(c => `<button class="colorbtn" style="background:${c[1]}" data-c="${c[1]}">${c[0]}</button>`).join("");
      $("#bs").querySelectorAll("[data-c]").forEach(btn => btn.onclick = () => {
        if (done) return; done = true;
        recordTrial(btn.dataset.c === ink, performance.now() - t0);
        T(220, step, id);
      });
      if (P.extra === "声音干扰") beep(1);
      T(P.rtl || 3000, () => { if (!done) { done = true; recordTrial(false, P.rtl || 3000, true); T(150, step, id); } }, id);
    };
    step();
  };

  /* —— EX-02 智慧连线（TMT）—— */
  E["EX-02"] = (P) => {
    const id = seq;
    const parts = P.mode === "AB" ? ["A", "B"] : [P.mode];
    let pi = 0, errors = 0;
    const build = () => {
      if (!alive(id)) return;
      if (pi >= parts.length) return finish();
      const part = parts[pi];
      const n = Math.min(P.n, 20);
      const labels = part === "A" ? Array.from({ length: n }, (_, i) => String(i + 1))
        : Array.from({ length: n }, (_, i) => i % 2 === 0 ? String(i / 2 + 1) : "甲乙丙丁戊己庚辛"[Math.floor(i / 2)]);
      stage(`<div class="playtip">${part === "A" ? "按 1→2→…→" + n : "按 1→甲→2→乙…交替"} 顺序点击 · 限时 ${P.tl} 秒</div>
        <svg viewBox="0 0 100 78" style="width:100%;height:320px" id="sv"></svg><div class="muted" id="er"></div>`);
      setPad( TRAIN.session.name, `　${part} 型`);
      const cols = 4, rows = Math.ceil(n / cols);
      const cells = shuffle(Array.from({ length: cols * rows }, (_, i) => ({ x: 10 + (i % cols) * 26 + Math.random() * 8, y: 10 + Math.floor(i / cols) * (66 / rows) + Math.random() * 4 }))).slice(0, n);
      let idx = 0; const t0 = performance.now();
      cells.forEach((pos, i) => {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", pos.x); c.setAttribute("cy", pos.y); c.setAttribute("r", 6.5);
        c.setAttribute("fill", "#eff6ff"); c.setAttribute("stroke", "#2563eb"); c.style.cursor = "pointer";
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", pos.x); t.setAttribute("y", pos.y + 2.6); t.setAttribute("text-anchor", "middle");
        t.setAttribute("font-size", 5.4); t.textContent = labels[i];
        c.onclick = () => {
          if (!alive(id)) return;
          if (labels[i] === labels[idx]) { c.setAttribute("fill", "#dcfce7"); idx++; recordTrial(true, performance.now() - t0); if (idx >= n) { pi++; T(350, build, id); } }
          else { errors++; $("#er").textContent = `点错 ${errors} 次`; recordTrial(false, performance.now() - t0); c.setAttribute("fill", "#fee2e2"); T(260, () => c.setAttribute("fill", "#eff6ff"), id); }
        };
        $("#sv").appendChild(c); $("#sv").appendChild(t);
      });
      T(P.tl * 1000, () => { if (alive(id) && idx < n) { toast("超时，本板结束", false); recordTrial(false, P.tl * 1000, true); pi++; T(300, build, id); } }, id);
    };
    build();
  };

  /* —— EX-03 宝塔规划（tower）—— */
  E["EX-03"] = (P) => {
    const id = seq;
    const items = 3; let k = 0, solved = 0, totalMoves = 0, t0 = performance.now(), timeAll = 0;
    const make = () => {
      // 从单塔初始状态出发，随机执行 P.moves 次合法移动得到目标，保证最优步数≤P.moves
      const start = { A: Array.from({ length: P.balls }, (_, i) => i), B: [], C: [] };
      const goal = JSON.parse(JSON.stringify(start));
      const pegs = ["A", "B", "C"];
      for (let m = 0; m < P.moves; m++) {
        const from = pegs.filter(p => goal[p].length);
        const f = rnd(from), b = goal[f].pop();
        const to = rnd(pegs.filter(p => p !== f && goal[p].length < 3));
        goal[to].push(b);
      }
      return { start, goal };
    };
    const render = (it) => {
      const draw = (cfg, goalMode) => ["A", "B", "C"].map((peg, pi2) => `<div style="text-align:center;${goalMode ? "" : "cursor:pointer"}" ${goalMode ? "" : `data-peg="${peg}"`}>
        <div style="height:130px;display:flex;flex-direction:column-reverse;align-items:center;gap:4px">
        ${cfg[peg].map(b2 => `<div style="width:54px;height:34px;border-radius:8px;background:${["#dc2626", "#16a34a", "#d97706", "#7c3aed", "#2563eb"][b2]};${!goalMode && sel === peg && b2 === cfg[peg][cfg[peg].length - 1] ? "outline:3px solid #2563eb" : ""}"></div>`).join("")}
        <div style="width:70px;height:8px;background:#94a3b8;border-radius:4px"></div><div class="muted">${peg}</div></div></div>`).join("");
      stage(`<div class="playtip">摆成上方目标布局（最优约 ${P.moves} 步 · 限时 ${P.tl}s）</div>
        <div class="row" style="gap:24px;justify-content:center" id="goal">${draw(it.goal, true)}</div>
        <div class="row" style="gap:24px;justify-content:center;margin-top:10px" id="board"></div>
        <div class="muted" id="mv">第 ${k + 1}/${items} 题 · 已移动 0 步</div>`);
      setPad( TRAIN.session.name, `　第 ${k + 1} 题`);
      let sel = null, moves = 0;
      const board = $("#board"); board.innerHTML = draw(it.start, false);
      const onPeg = (peg) => {
        if (!alive(id)) return;
        if (sel === null) { if (it.start[peg].length) sel = peg; }
        else if (sel === peg) sel = null;
        else {
          const b2 = it.start[sel].pop();
          if (b2 !== undefined && it.start[peg].length < 3) { it.start[peg].push(b2); moves++; totalMoves++; }
          else if (b2 !== undefined) it.start[sel].push(b2);
          sel = null;
          if (JSON.stringify(it.start) === JSON.stringify(it.goal)) {
            solved++; timeAll += (performance.now() - t0) / 1000;
            recordTrial(moves <= Math.max(P.moves + 2, P.balls + 1), performance.now() - t0);
            k++; if (k >= items) return finish();
            toast(`完成（${moves} 步）`, true); t0 = performance.now(); moves = 0;
            return T(500, () => render(make()), id);
          }
        }
        board.innerHTML = draw(it.start, false);
        bindPegs();
      };
      const bindPegs = () => board.querySelectorAll("[data-peg]").forEach(el => el.onclick = () => onPeg(el.dataset.peg));
      bindPegs();
      T(P.tl * 1000, () => { if (alive(id) && k < items && board.innerHTML) { recordTrial(false, P.tl * 1000, true); k++; if (k >= items) finish(); else { t0 = performance.now(); render(make()); } } }, id);
    };
    render(make());
  };

  /* —— EX-04 / LM-01 数字正倒背 / n-back —— */
  const spanEngine = (P, opt = {}) => {
    const id = seq;
    const trials = opt.trials || 6; let t = 0;
    const next = () => {
      if (!alive(id)) return;
      if (t >= trials) return finish();
      t++;
      if (P.mode === "nback") {
        const stream = Array.from({ length: 14 }, () => Math.floor(Math.random() * 10));
        let i = 0;
        stage(`<div class="playtip">当前数字与前面第 <b>${P.len}</b> 个相同时点【相同】，否则点【不同】</div>
          <div class="stim" id="s">·</div><div class="row" id="ab"></div><div class="muted">第 ${t}/${trials} 轮</div>`);
        setPad( TRAIN.session.name, `　${t}/${trials} 轮`);
        const step2 = () => {
          if (!alive(id)) return;
          if (i >= stream.length) return T(300, next, id);
          $("#s").textContent = stream[i]; speak(String(stream[i]));
          const isT = i >= P.len && stream[i] === stream[i - P.len];
          const t0 = performance.now();
          $("#ab").innerHTML = `<button class="pbtn" id="no">不同</button><button class="pbtn primary" id="yes">相同</button>`;
          $("#yes").onclick = () => { recordTrial(isT, performance.now() - t0); i++; step2(); };
          $("#no").onclick = () => { recordTrial(!isT, performance.now() - t0); i++; step2(); };
          T(2600, () => { if (i < stream.length && $("#s").textContent == stream[i]) { recordTrial(false, 2600, true); i++; step2(); } }, id);
        };
        step2();
      } else {
        const len = Math.max(2, P.len + (Math.random() < 0.4 ? (Math.random() < 0.5 ? -1 : 1) : 0));
        const digits = Array.from({ length: len }, () => Math.floor(Math.random() * 10));
        let shown = 0, input = "";
        const distract = P.distr ? Array.from({ length: 2 }, () => Math.floor(Math.random() * 10)) : null;
        stage(`<div class="playtip">${P.mode === "fwd" ? "按顺序" : "【倒着】"}输入刚出现的数字${P.chan === "听觉" ? "（仅语音报数）" : ""}${distract ? "；<b style='color:#dc2626'>忽略中间插入的干扰数</b>" : ""}</div>
          <div class="stim" id="d">·</div><div class="stim" style="font-size:30px" id="inp">　</div>
          <div class="row" id="kb" style="justify-content:center"></div>
          <div class="row"><button class="pbtn sm" id="del">删除</button><button class="pbtn primary sm" id="ok2">确定</button></div>
          <div class="muted">第 ${t}/${trials} 轮</div>`);
        setPad( TRAIN.session.name, `　${t}/${trials} 轮`);
        const seqAll = distract ? [...digits.slice(0, Math.ceil(len / 2)), ...distract, ...digits.slice(Math.ceil(len / 2))] : digits;
        const show = () => {
          if (shown >= seqAll.length) return kb();
          if (P.chan === "听觉") { $("#d").textContent = "🔊"; } else $("#d").textContent = seqAll[shown];
          speak(String(seqAll[shown]));
          shown++; T((P.speed || 800) + 250, () => { $("#d").textContent = "·"; T(220, show, id); }, id);
        };
        const kb = () => {
          const t0 = performance.now();
          $("#kb").innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(n => `<button class="pbtn sm" data-k="${n}">${n}</button>`).join("");
          $("#kb").querySelectorAll("[data-k]").forEach(b2 => b2.onclick = () => { input += b2.dataset.k; $("#inp").textContent = input; });
          $("#del").onclick = () => { input = input.slice(0, -1); $("#inp").textContent = input || "　"; };
          $("#ok2").onclick = () => {
            const target = P.mode === "fwd" ? digits.join("") : [...digits].reverse().join("");
            recordTrial(input === target, performance.now() - t0);
            next();
          };
        };
        show();
      }
    };
    next();
  };
  E["EX-04"] = spanEngine;
  E["LM-01"] = spanEngine;

  /* —— LM-02 词海拾贝（mini-AVLT）—— */
  E["LM-02"] = (P) => {
    const id = seq;
    const POOL_A = "皮球 国旗 树木 咖啡 火车 阳光 苹果 课本 雨伞 钢琴 汽车 月亮".split(" ");
    const POOL_B = "沙发 钢笔 冬天 香蕉 轮船 星星 面包 花瓶 帽子 电话 草地 眼镜".split(" ");
    const POOL_T = "医院 老师 公园 医生 市场 车站 工厂 学校 邮局 商店 医院 药房".split(" ");
    const listA = shuffle(POOL_A).slice(0, P.len);
    const listB = shuffle(POOL_B).slice(0, Math.min(P.len, 10));
    const listT = shuffle(POOL_T).slice(0, P.len);
    let trialIdx = 0;
    const learn = () => {
      if (!alive(id)) return;
      if (trialIdx >= (P.trials || 2)) return delayPhase();
      trialIdx++;
      stage(`<div class="playtip">认真听词表（第 ${trialIdx}/${P.trials || 2} 遍），结束后尽量回忆</div>
        <button class="pbtn primary" id="ls">🔊 播放词表</button>
        <input id="w" placeholder="回忆的词用空格分隔（工作人员可代录）" style="width:100%;max-width:460px;font-size:15px;padding:12px;display:none">
        <button class="pbtn primary sm" id="ok" style="display:none">提交回忆</button>`);
      setPad( TRAIN.session.name, `　学习 ${trialIdx}/${P.trials || 2}`);
      $("#ls").onclick = () => {
        $("#ls").disabled = true;
        listA.forEach((w, i) => T(i * 1100, () => speak(w), id));
        T(listA.length * 1100 + 400, () => { $("#w").style.display = "block"; $("#ok").style.display = "inline-block"; }, id);
      };
      $("#ok").onclick = () => {
        const words = $("#w").value.split(/[，,、\s]+/).filter(Boolean);
        const right = words.filter(w => listA.some(l => l === w || l.includes(w))).length;
        recordTrial(right >= Math.max(2, Math.ceil(P.len * 0.5)), 0);
        recordTrial(right > 0, 0);
        T(300, learn, id);
      };
    };
    const delayPhase = () => {
      if (!alive(id)) return;
      if (P.inter) {
        stage(`<div class="playtip">干扰词表：听完后回忆这一组</div>
          <button class="pbtn primary" id="ls2">🔊 播放干扰词表</button>
          <input id="w2" style="width:100%;max-width:460px;font-size:15px;padding:12px;display:none" placeholder="回忆干扰词表">
          <button class="pbtn primary sm" id="ok2" style="display:none">提交</button>`);
        $("#ls2").onclick = () => { $("#ls2").disabled = true; listB.forEach((w, i) => T(i * 1100, () => speak(w), id));
          T(listB.length * 1100 + 400, () => { $("#w2").style.display = "block"; $("#ok2").style.display = "inline-block"; }, id); };
        $("#ok2").onclick = () => { recordTrial(true, 0); countdown(); };
      } else countdown();
    };
    const countdown = () => {
      let left = Math.min(P.delay || 30, 60);
      stage(`<div class="playtip">请从100连续减7心算，${left}秒后回忆第一组词表</div><div class="stim" id="cd">${left}</div>`);
      const iv = IV(1000, () => { left--; const el = $("#cd"); if (el) el.textContent = left; if (left <= 0) { clearInterval(iv); recall(); } }, id);
    };
    const recall = () => {
      stage(`<div class="playtip">请回忆第一组词表（尽量多说）</div>
        <input id="dw" style="width:100%;max-width:460px;font-size:15px;padding:12px" placeholder="用空格分隔">
        <button class="pbtn primary sm" id="ok3">提交回忆</button>`);
      $("#ok3").onclick = () => {
        const words = $("#dw").value.split(/[，,、\s]+/).filter(Boolean);
        const right = words.filter(w => listA.some(l => l === w || l.includes(w))).length;
        recordTrial(right >= Math.max(2, Math.ceil(P.len * 0.4)), 0);
        if (P.recog) recogPhase(); else if (P.theme) themePhase(); else finish();
      };
    };
    const recogPhase = () => {
      const foils = shuffle(POOL_B.concat(POOL_T)).slice(0, 6);
      const items = shuffle([...listA.map(w => [w, 1]), ...foils.map(w => [w, 0])]);
      let i = 0;
      const ask = () => {
        if (!alive(id)) return;
        if (i >= items.length) return P.theme ? themePhase() : finish();
        stage(`<div class="playtip">这个词在第一组词表里出现过吗？</div><div class="stim" style="font-size:36px">${items[i][0]}</div>
          <div class="row"><button class="pbtn" id="no">没有</button><button class="pbtn primary" id="yes">出现过</button></div>
          <div class="muted">再认 ${i + 1}/${items.length}</div>`);
        $("#yes").onclick = () => { recordTrial(!!items[i][1], 0); i++; ask(); };
        $("#no").onclick = () => { recordTrial(!items[i][1], 0); i++; ask(); };
      };
      ask();
    };
    const themePhase = () => {
      stage(`<div class="playtip">主题切换：听新词表并回忆（场景类）</div>
        <button class="pbtn primary" id="ls3">🔊 播放新词表</button>
        <input id="w3" style="width:100%;max-width:460px;font-size:15px;padding:12px;display:none" placeholder="回忆新词表">
        <button class="pbtn primary sm" id="ok4" style="display:none">提交</button>`);
      $("#ls3").onclick = () => { $("#ls3").disabled = true; listT.forEach((w, i) => T(i * 1100, () => speak(w), id));
        T(listT.length * 1100 + 400, () => { $("#w3").style.display = "block"; $("#ok4").style.display = "inline-block"; }, id); };
      $("#ok4").onclick = () => {
        const words = $("#w3").value.split(/[，,、\s]+/).filter(Boolean);
        recordTrial(words.filter(w => listT.some(l => l === w || l.includes(w))).length >= 2, 0);
        finish();
      };
    };
    learn();
  };

  /* —— LM-03 图像配对 —— */
  E["LM-03"] = (P) => {
    const id = seq;
    const base = P.sim ? ["😊", "😃", "😄", "😅", "🙂", "😉", "😍", "🤗", "😙", "😚"] : ["🍎", "🌟", "🎈", "🚗", "🌳", "🏠", "🐟", "🎁", "⚽", "☂️", "🔔", "📕"];
    const boards = 2; let b = 0;
    const build = () => {
      if (!alive(id)) return;
      if (b >= boards) return finish();
      b++;
      const picks = shuffle(base).slice(0, Math.min(P.pairs, 6));
      const cards = shuffle(picks.flatMap(p => [{ e: p, pair: p }, { e: p, pair: p }]));
      stage(`<div class="playtip">先记住每张卡的位置（${P.memo} 秒），隐藏后延迟 ${P.delay || 0} 秒，再点击两张相同图案完成配对</div>
        <div id="grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-width:440px"></div>
        <div class="muted" id="st">记忆阶段…</div>`);
      setPad( TRAIN.session.name, `　第 ${b}/${boards} 板`);
      const grid = $("#grid");
      grid.innerHTML = cards.map((c, i) => `<button class="pbtn sm" style="font-size:26px" data-i="${i}">${c.e}</button>`).join("");
      T(P.memo * 1000, () => {
        if (!alive(id)) return;
        grid.innerHTML = cards.map((c, i) => `<button class="pbtn sm" style="font-size:26px" data-i="${i}">❓</button>`).join("");
        $("#st").textContent = P.delay ? `延迟 ${P.delay} 秒…` : "开始配对：点击两张相同图案";
        T((P.delay || 0) * 1000, () => {
          if (!alive(id)) return;
          $("#st").textContent = "点击两张相同图案的卡片";
          let open = [], donePairs = 0; const t0 = performance.now();
          grid.querySelectorAll("[data-i]").forEach(btn => btn.onclick = () => {
            if (btn.disabled) return;
            const c = cards[+btn.dataset.i];
            btn.textContent = c.e; btn.disabled = true; open.push({ c, btn });
            if (open.length === 2) {
              const [x, y] = open; open = [];
              const okP = x.c.pair === y.c.pair;
              recordTrial(okP, performance.now() - t0);
              if (okP) { donePairs++; if (donePairs >= picks.length) T(450, build, id); }
              else T(650, () => { x.btn.textContent = "❓"; y.btn.textContent = "❓"; x.btn.disabled = false; y.btn.disabled = false; }, id);
            }
          });
        }, id);
      }, id);
    };
    build();
  };

  /* —— LM-04 超市购物（场景寻物 + 前瞻记忆）—— */
  E["LM-04"] = (P) => {
    const id = seq;
    const goods = ["🍎", "🍞", "🥛", "🥚", "🍌", "🧀", "🍅", "🥕", "🐟", "🍪", "🍜", "🧻", "🧴", "🍫", "🥜", "🌽", "🧅", "🥔"];
    const similar = { "🍎": ["🍑", "🍅"], "🍌": ["🥒", "🌽"], "🥛": ["🧴"], "🍞": ["🍪", "🧀"], "🥚": ["🧅", "🥔"], "🍅": ["🍎", "🥕"], "🥕": ["🥔", "🧅"] };
    const list = shuffle(goods).slice(0, Math.min(P.items, 8));
    const pmList = P.pm ? shuffle(goods.filter(g => !list.includes(g))).slice(0, Math.min(P.pm, 4)) : [];
    const cells = [];
    for (let z = 0; z < P.zones * 2; z++) cells.push(...shuffle(goods).slice(0, 4));
    while (cells.length < P.zones * 8) cells.push(rnd(goods));
    if (P.sim) cells.forEach((g, i) => { const s = similar[g]; if (s && Math.random() < 0.4) cells[i] = rnd(s); });
    const found = new Set(), pmDone = new Set();
    stage(`<div class="playtip">购物清单：${list.join(" ")}${pmList.length ? `<br><span style="color:#b45309">稍后执行（清单找完后再点）：${pmList.join(" ")}</span>` : ""}${P.tl ? " · 限时 " + (P.tl === 1 ? 120 : 90) + " 秒" : ""}</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-width:460px" id="shelf"></div>
      <div class="muted" id="pr"></div>`);
    setPad( TRAIN.session.name, `　清单 ${list.length} + 稍后 ${pmList.length}`);
    const t0 = performance.now();
    const render = () => {
      $("#shelf").innerHTML = cells.map((g, i) => `<button class="pbtn sm" style="font-size:24px" data-i="${i}">${g}</button>`).join("");
      $("#pr").textContent = `已找到 ${found.size}/${list.length} · 稍后任务 ${pmDone.size}/${pmList.length}`;
      $("#shelf").querySelectorAll("[data-i]").forEach(btn => btn.onclick = () => {
        if (!alive(id)) return;
        const g = cells[+btn.dataset.i];
        if (list.includes(g) && !found.has(g)) { found.add(g); btn.disabled = true; btn.style.opacity = .3; recordTrial(true, performance.now() - t0); }
        else if (list.includes(g) && found.has(g)) { /* ignore */ }
        else if (pmList.includes(g) && !pmDone.has(g)) {
          if (found.size < list.length) { recordTrial(false, performance.now() - t0); toast("这是【稍后执行】的，先把清单找完", false); return; }
          pmDone.add(g); btn.disabled = true; btn.style.opacity = .3; recordTrial(true, performance.now() - t0);
        } else recordTrial(false, performance.now() - t0);
        if (found.size >= list.length && pmDone.size >= pmList.length) { toast("采购完成！", true); finish(); }
        else render();
      });
      if (P.tl) T((P.tl === 1 ? 120 : 90) * 1000, () => { if (alive(id) && $("#shelf")) { recordTrial(false, 1000, true); finish(); } }, id);
    };
    render();
  };

  /* —— LA-01 看图命名 —— */
  E["LA-01"] = (P) => {
    const id = seq;
    const TIERS = {
      1: [["🐱", "猫"], ["🐶", "狗"], ["🍎", "苹果"], ["🚗", "汽车"], ["🌞", "太阳"], ["🐟", "鱼"], ["🌳", "树"], ["🏠", "房子"]],
      2: [["🐘", "大象"], ["🦒", "长颈鹿"], ["✈️", "飞机"], ["⌚", "手表"], ["✏️", "铅笔"], ["🍓", "草莓"], ["🚲", "自行车"], ["🔦", "手电筒"]],
      3: [["🐙", "章鱼"], ["🍄", "蘑菇"], ["🎸", "吉他"], ["🍍", "菠萝"], ["⚓", "锚"], ["🕯️", "蜡烛"], ["🧲", "磁铁"], ["🎒", "书包"]],
      4: [["🐫", "骆驼"], ["🦉", "猫头鹰"], ["🎺", "小号"], ["🥁", "鼓"], ["🪑", "椅子"], ["🧹", "扫把"], ["🪣", "水桶"], ["🧭", "指南针"]],
      5: [["🦘", "袋鼠"], ["🦔", "刺猬"], ["🗿", "雕像"], ["🪐", "星球"], ["⛺", "帐篷"], ["🛖", "小屋"], ["🪢", "绳结"], ["🪙", "硬币"]],
    };
    const VERB = [["🏃", "跑步"], ["🍚", "吃饭"], ["🛌", "睡觉"], ["📖", "读书"], ["🚿", "洗澡"]];
    let items;
    if (P.verb) items = VERB.slice(0, P.n);
    else if (P.cat) items = [["🔨", "锤子"], ["🪚", "锯子"], ["🔩", "螺丝"], ["🪛", "螺丝刀"], ["🧰", "工具箱"], ["⚙️", "齿轮"], ["🪜", "梯子"], ["🧱", "砖头"]].slice(0, P.n);
    else items = shuffle(TIERS[Math.min(P.freq || 1, 5)]).slice(0, Math.min(P.n || 8, 8));
    let i = 0;
    const ask = () => {
      if (!alive(id)) return;
      if (i >= items.length) return finish();
      const [emoji, ans] = items[i];
      stage(`<div class="stim" style="font-size:96px">${emoji}</div>
        <input id="nm" placeholder="请说出名称（工作人员代为输入）" style="width:320px;font-size:17px;padding:12px">
        <div class="row">
          ${P.hint >= 2 ? `<button class="pbtn sm" id="h1">💡 类别提示</button>` : ""}
          ${P.hint >= 1 ? `<button class="pbtn sm" id="h2">💡 首字提示</button>` : ""}
          <button class="pbtn primary sm" id="ok">确定</button></div>
        <div class="muted" id="hb"></div><div class="muted">第 ${i + 1}/${items.length} 项${P.tl ? " · 限时" : ""}</div>`);
      setPad( TRAIN.session.name, `　${i + 1}/${items.length}`);
      let used = 0; const t0 = performance.now();
      const cat = { "猫": "动物", "狗": "动物", "苹果": "水果", "汽车": "交通工具", "太阳": "天体", "鱼": "动物", "树": "植物", "房子": "建筑", "大象": "动物", "长颈鹿": "动物", "飞机": "交通工具", "手表": "物品", "铅笔": "文具", "草莓": "水果", "自行车": "交通工具", "手电筒": "用品", "章鱼": "动物", "蘑菇": "菌类", "吉他": "乐器", "菠萝": "水果", "锚": "船具", "蜡烛": "用品", "磁铁": "物品", "书包": "用品", "骆驼": "动物", "猫头鹰": "动物", "小号": "乐器", "鼓": "乐器", "椅子": "家具", "扫把": "工具", "水桶": "工具", "指南针": "仪器", "袋鼠": "动物", "刺猬": "动物", "雕像": "艺术品", "星球": "天体", "帐篷": "用品", "小屋": "建筑", "绳结": "物品", "硬币": "钱币", "跑步": "运动", "吃饭": "日常", "睡觉": "日常", "读书": "学习", "洗澡": "日常", "锤子": "工具", "锯子": "工具", "螺丝": "零件", "螺丝刀": "工具", "工具箱": "工具", "齿轮": "零件", "梯子": "工具", "砖头": "建材" }[ans] || "物品";
      if ($("#h1")) $("#h1").onclick = () => { used = Math.max(used, 1); if (hintLevel < 1) hintLevel = 1; $("#hb").textContent = "类别：" + cat; speak("类别是，" + cat); };
      if ($("#h2")) $("#h2").onclick = () => { used = 2; hintLevel = 2; $("#hb").textContent = "第一个字：" + ans[0]; speak("第一个字是，" + ans[0]); };
      $("#ok").onclick = () => {
        const v = $("#nm").value.trim();
        recordTrial(!!v && (ans.includes(v) || v.includes(ans) || v === ans), performance.now() - t0);
        i++; T(250, ask, id);
      };
      if (P.tl) T(20000, () => { if (alive(id) && $("#ok")) { recordTrial(false, 20000, true); i++; ask(); } }, id);
    };
    ask();
  };

  /* —— LA-02 词汇风暴 —— */
  E["LA-02"] = (P) => {
    const id = seq;
    const LEX = {
      "水果": "苹果 香蕉 梨 桃子 西瓜 葡萄 草莓 橘子 橙子 柚子 柠檬 芒果 菠萝 椰子 枣 樱桃 猕猴桃 李子 杏 柿子 哈密瓜 荔枝 龙眼 石榴 枇杷 甘蔗 杨梅 山竹 火龙果 柚柠檬".split(" "),
      "动物": "老虎 狮子 大象 猴子 熊猫 兔子 老鼠 猫 狗 狼 豹 鹿 熊 狐狸 蛇 青蛙 鱼 鸟 乌鸦 鸽子 老鹰 大雁 蜜蜂 蝴蝶 蚂蚁 蚕 乌龟 虾 螃蟹 鲸鱼 鲨鱼 鹅 鸭子 鸡 骆驼 刺猬 松鼠 海豚 企鹅 河马 斑马 驴 恐龙 燕子 喜鹊 孔雀".split(" "),
      "工具": "锤子 螺丝刀 扳手 钳子 锯子 斧头 铲子 锄头 镰刀 剪刀 尺子 钻头 锉刀 抹布 扫把 拖把 水桶 刷子 钉子 铁丝 电钻 电锯 卷尺 梯子 锹 镐 链条 轴承".split(" "),
      "大": "大小 多 高 长 好 快 强 山 河 水 大学 大夫 大家 大米 大脑 大王 大地 大气 大师 大厦 大海 大河 大会 大声 大方 大力 大战 大树 大路 大门 大雨 大风 大火 大雪 大雁 大蒜 大葱 大豆 大麦".split(" "),
      "水": "水果 水杯 水桶 水池 水泵 水果店 水彩笔 水稻 水银 水蒸气 水库 水沟 水塔 水鸟 水草 水痘 水兵 水手 水杉 水獭 水球 水域 水位 水质 水系 水线 水运 水灾 水战 水珠".split(" "),
    };
    const cat = P.cat === "双类别" ? ["水果", "动物"] : P.cat === "复合约束" ? ["大"] : [LEX[P.cat] ? P.cat : "水果"];
    let part = 0; const got = new Set();
    const THRESH = [3, 4, 5, 5, 6, 6, 7, 7, 8, 8];
    const run = () => {
      if (!alive(id)) return;
      const c = cat[Math.min(part, cat.length - 1)];
      const need = THRESH[Math.min(TRAIN.level - 1, 9)];
      let left = P.dur || 60; const start = performance.now();
      stage(`<div class="playtip">请说出类别【${c}】的词语，达到 ${need} 个即通过${P.dual ? "（请保持节奏，不要停顿太久）" : ""}</div>
        <input id="w" placeholder="输入一个词，回车确认" style="width:320px;font-size:16px;padding:12px">
        <div class="stim" style="font-size:30px" id="cd"></div><div class="muted" id="cnt">已说 0 个</div>`);
      setPad( TRAIN.session.name, `　${part + 1}/${cat.length}`);
      const iv = IV(400, () => {
        left = Math.max(0, Math.round((P.dur || 60) - (performance.now() - start) / 1000));
        if ($("#cd")) $("#cd").textContent = left + "s";
        if ($("#cnt")) $("#cnt").textContent = `已说 ${got.size} / ${need}`;
        if (left <= 0) {
          clearInterval(iv);
          recordTrial(got.size >= need, (P.dur || 60) * 1000);
          part++;
          if (part >= cat.length) finish(); else { got.clear(); run(); }
        }
      }, id);
      $("#w").onkeydown = e => {
        if (e.key !== "Enter") return;
        const v = $("#w").value.trim(); if (!v) return;
        const pool = LEX[c] || [];
        if (pool.some(x => v === x || (x.length > 1 && (v.includes(x) || x.includes(v))))) got.add(v);
        else toast("这个词好像不属于该类别", false);
        $("#w").value = ""; $("#w").focus();
      };
    };
    run();
  };

  /* —— LA-03 词图匹配 —— */
  const BANK_L3 = {
    wg: [["🍎", "苹果"], ["🚌", "公交车"], ["⏰", "闹钟"], ["☂️", "雨伞"], ["🔑", "钥匙"], ["🎂", "蛋糕"], ["⚽", "足球"], ["🕯️", "蜡烛"], ["🧢", "帽子"], ["🪥", "牙刷"], ["🎺", "小号"], ["🧊", "冰块"], ["🪟", "窗户"], ["🛁", "浴缸"], ["🧺", "篮子"], ["🪑", "椅子"]],
    syn: [["开心", "快乐", "难过"], ["立刻", "马上", "缓慢"], ["美丽", "漂亮", "丑陋"], ["安静", "宁静", "喧闹"], ["帮助", "协助", "阻碍"], ["强壮", "结实", "瘦弱"], ["聪明", "机智", "愚笨"], [" famous", "著名", "无名"], ["寒冷", "冰冷", "炎热"], ["危险", "凶险", "安全"], ["高兴", "愉快", "伤心"], ["仔细", "认真", "马虎"]],
    ant: [["高", "矮"], ["快", "慢"], ["大", "小"], ["白天", "黑夜"], ["热", "冷"], ["多", "少"], ["开", "关"], ["进", "退"], ["厚", "薄"], ["宽", "窄"], ["胖", "瘦"], ["明", "暗"]],
    rel: [["医生", "医院"], ["老师", "学校"], ["司机", "方向盘"], ["农民", "田地"], ["厨师", "厨房"], ["画家", "画笔"], ["法官", "法庭"], ["飞行员", "飞机"], ["渔夫", "渔网"], ["学生", "课本"], ["售票员", "车票"], ["园丁", "花园"]],
    odd: [["香蕉 苹果 萝卜 橘子", "萝卜"], ["铅笔 毛笔 钢笔 扫把", "扫把"], ["白菜 青菜 花菜 拖鞋", "拖鞋"], ["火车 汽车 飞机 楼房", "楼房"], ["红色 绿色 颜色 黄色", "颜色"], ["医生 护士 病人 教师", "教师"], ["米饭 面条 包子 饮料", "饮料"], ["老虎 狮子 蔬菜 大象", "蔬菜"], ["苹果 香蕉 桌子 橘子", "桌子"], ["游泳 跑步 下棋 跳高", "下棋"]],
    abs: [["希望", "期待", "失望"], ["骄傲", "自豪", "羞愧"], ["宽容", "包容", "计较"], ["勤奋", "勤恳", "懒惰"], ["诚实", "诚信", "虚伪"], ["勇敢", "无畏", "胆怯"], ["团结", "齐心", "分裂"], ["谦虚", "虚心", "自负"]],
  };
  E["LA-03"] = (P) => {
    const id = seq;
    const type = P.type === "mix" ? rnd(["wg", "syn", "ant", "odd"]) : P.type;
    let items = [];
    const pick = (arr, k) => shuffle(arr).slice(0, k);
    if (type === "wg") items = pick(BANK_L3.wg, Math.min(P.n || 8, 12)).map(([e, w]) => {
      const wrong = shuffle(BANK_L3.wg.map(x => x[1]).filter(x => x !== w)).slice(0, (P.opts || 3) - 1);
      return { media: e, q: "哪个词和图片相符？", opts: shuffle([w, ...wrong]), a: 0 };
    });
    else if (type === "syn") items = pick(BANK_L3.syn, Math.min(P.n || 8, 10)).map(([w, s]) => {
      const wrong = shuffle(BANK_L3.syn.flat().concat(BANK_L3.abs.flat()).filter(x => x !== s && x !== w)).slice(0, (P.opts || 3) - 1);
      return { q: `“${w}”的近义词是？`, opts: shuffle([s, ...wrong]), a: 0 };
    });
    else if (type === "ant") items = pick(BANK_L3.ant, Math.min(P.n || 8, 10)).map(([w, s]) => {
      const wrong = shuffle(BANK_L3.ant.flat().filter(x => x !== s && x !== w)).slice(0, (P.opts || 2) - 1);
      return { q: `“${w}”的反义词是？`, opts: shuffle([s, ...wrong]), a: 0 };
    });
    else if (type === "rel") items = pick(BANK_L3.rel, Math.min(P.n || 8, 10)).map(([a, b]) => {
      const wrong = shuffle(BANK_L3.rel.map(x => x[1]).filter(x => x !== b)).slice(0, (P.opts || 3) - 1);
      return { q: `“${a}”与哪个词的对应关系是“职业—工作场所/工具”？`, opts: shuffle([b, ...wrong]), a: 0 };
    });
    else if (type === "odd") items = pick(BANK_L3.odd, Math.min(P.n || 8, 10)).map(([words, odd]) => {
      const others = words.split(" ").filter(x => x !== odd);
      return { q: `找出不同类的一个：<b>${words.split(" ").join("　")}</b>`, opts: shuffle([odd, ...others.slice(0, (P.opts || 4) - 1)]), a: 0 };
    });
    else items = pick(BANK_L3.abs, Math.min(P.n || 8, 8)).map(([w, s]) => {
      const wrong = shuffle(BANK_L3.abs.flat().filter(x => x !== s && x !== w)).slice(0, 2);
      return { q: `“${w}”最接近的词是？`, opts: shuffle([s, ...wrong]), a: 0 };
    });
    items = items.map(fixA);
    let i = 0;
    const ask = () => {
      if (!alive(id)) return;
      if (i >= items.length) return finish();
      const q = items[i];
      stage(`${q.media ? `<div class="stim" style="font-size:76px">${q.media}</div>` : ""}
        <div class="playtip" style="font-size:16px">${q.q}</div>
        <div class="row" style="justify-content:center;flex-wrap:wrap" id="ops"></div>
        <div class="muted" id="fb"></div><div class="muted">${i + 1}/${items.length}${P.tl ? " · 限时" : ""}</div>`);
      setPad( TRAIN.session.name, `　${i + 1}/${items.length}`);
      const t0 = performance.now();
      $("#ops").innerHTML = q.opts.map(o => `<button class="pbtn" data-v="${esc(o)}" style="min-width:120px">${esc(o)}</button>`).join("");
      $("#ops").querySelectorAll("[data-v]").forEach(btn => btn.onclick = () => {
        recordTrial(btn.dataset.v === q.opts[q.a], performance.now() - t0);
        $("#fb").textContent = btn.dataset.v === q.opts[q.a] ? "✓ 答对了" : "✗ 正确答案：" + q.opts[q.a];
        $("#fb").style.color = btn.dataset.v === q.opts[q.a] ? "#15803d" : "#dc2626";
        $("#ops").querySelectorAll("button").forEach(x => x.disabled = true);
        T(850, () => { i++; ask(); }, id);
      });
      if (P.tl) T(P.tl * 1000, () => { if (alive(id) && $("#ops") && !$("#ops").querySelector("button").disabled) { recordTrial(false, P.tl * 1000, true); i++; ask(); } }, id);
    };
    ask();
  };

  /* —— LA-04 听指令行动 —— */
  E["LA-04"] = (P) => {
    const id = seq;
    const OBJ = ["🍌", "🍎", "🧺", "⏰", "📖", "🪑", "🥕", "🔑"];
    const items = 5;
    let i = 0;
    const ask = () => {
      if (!alive(id)) return;
      if (i >= items) return finish();
      const objs = shuffle(OBJ).slice(0, 6);
      const steps = Math.min(P.steps || 1, 3);
      const seqObjs = shuffle(objs).slice(0, steps);
      let text, rightSeq;
      if (P.neg && i === items - 1) {
        const target = seqObjs[0]; const avoid = objs.find(o => !seqObjs.includes(o));
        text = `不要点【${avoid}】，请点【${target}】`;
        rightSeq = [target];
      } else {
        text = "请依次点击：" + seqObjs.join(" → ");
        rightSeq = seqObjs;
      }
      stage(`<div class="playtip">听语音指令后按顺序点击物品（可点🔊重听）</div>
        <button class="pbtn sm" id="rp">🔊 重听指令</button>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-width:420px" id="objs"></div>
        <div class="muted" id="pr">第 ${i + 1}/${items} 题 · 已点 0/${rightSeq.length}</div><div class="muted" id="fb"></div>`);
      setPad( TRAIN.session.name, `　${i + 1}/${items}`);
      const say = () => speak(text);
      $("#objs").innerHTML = shuffle(objs).map(o => `<button class="pbtn" style="font-size:34px" data-o="${o}">${o}</button>`).join("");
      let idx = 0; const t0 = performance.now();
      $("#objs").querySelectorAll("[data-o]").forEach(btn => btn.onclick = () => {
        if (!alive(id) || btn.disabled) return;
        if (btn.dataset.o === rightSeq[idx]) {
          idx++; btn.disabled = true; btn.style.opacity = .3;
          $("#pr").textContent = `第 ${i + 1}/${items} 题 · 已点 ${idx}/${rightSeq.length}`;
          if (idx >= rightSeq.length) { recordTrial(true, performance.now() - t0); i++; T(500, ask, id); }
        } else { recordTrial(false, performance.now() - t0); $("#fb").textContent = "顺序不对，请重新按指令来"; $("#fb").style.color = "#dc2626"; }
      });
      $("#rp").onclick = say; say();
    };
    ask();
  };

  /* —— VP-01 火眼金睛 —— */
  const poly = (n, r, rot = 0, color = "#2563eb") => {
    const pts = Array.from({ length: n }, (_, i) => {
      const a = rot - Math.PI / 2 + i * 2 * Math.PI / n;
      return `${60 + Math.cos(a) * r},${44 + Math.sin(a) * r}`;
    }).join(" ");
    return `<polygon points="${pts}" fill="none" stroke="${color}" stroke-width="3"/>`;
  };
  E["VP-01"] = (P) => {
    const id = seq;
    const n = P.n || 8; let i = 0;
    const gen = () => {
      const type = P.type === "mix" ? rnd(["same", "missing", "overlap"]) : P.type;
      if (type === "same") {
        const sides = rnd([3, 4, 5, 6]), rot = rnd([0, .4, .8]);
        const same = Math.random() < 0.5;
        const rot2 = same ? rot : rot + rnd([.25, -.3]);
        return { q: "两个图形完全一样吗？（注意旋转）", svg: `<svg viewBox="0 0 240 90" style="height:110px">${poly(sides, 30, rot)}<text x="115" y="50" font-size="20" fill="#94a3b8">vs</text><g transform="translate(120,0)">${poly(sides, 30, rot2)}</g></svg>`, opts: ["一样", "不一样"], a: same ? 0 : 1 };
      }
      if (type === "missing") {
        const cells = shuffle(["▲", "●", "■", "◆"]).slice(0, 4);
        const hide = Math.floor(Math.random() * 4);
        const opts = shuffle(cells);
        return { q: "左图中缺失的是哪个图案？", svg: `<div style="font-size:34px;letter-spacing:6px">${cells.map((c, k) => k === hide ? "⬜" : c).join("")}</div>`, opts, a: opts.indexOf(cells[hide]) };
      }
      const k = P.k || 2;
      const shapes = shuffle(["circle", "rect", "tri", "diamond"]).slice(0, k);
      const svgs = { circle: '<circle cx="60" cy="44" r="30" fill="rgba(37,99,235,.4)" stroke="#2563eb" stroke-width="2"/>', rect: '<rect x="35" y="18" width="52" height="52" fill="rgba(220,38,38,.35)" stroke="#dc2626" stroke-width="2"/>', tri: '<polygon points="60,12 92,72 28,72" fill="rgba(22,163,74,.35)" stroke="#16a34a" stroke-width="2"/>', diamond: '<polygon points="60,10 92,44 60,78 28,44" fill="rgba(217,119,6,.35)" stroke="#d97706" stroke-width="2"/>' };
      return { q: `重叠图形里有几种图形？`, svg: `<svg viewBox="0 0 120 90" style="height:110px">${shapes.map(s => svgs[s]).join("")}</svg>`, opts: ["2种", "3种", "4种"].slice(0, Math.max(2, k - 1)), a: k - 2 };
    };
    const ask = () => {
      if (!alive(id)) return;
      if (i >= n) return finish();
      const q = gen();
      stage(`${q.svg}<div class="playtip" style="font-size:16px">${q.q}</div>
        <div class="row" style="justify-content:center" id="ops"></div><div class="muted">${i + 1}/${n}</div>`);
      setPad( TRAIN.session.name, `　${i + 1}/${n}`);
      const t0 = performance.now();
      $("#ops").innerHTML = shuffle(q.opts.map((o, oi) => ({ o, oi }))).map(x => `<button class="pbtn" data-oi="${x.oi}">${esc(x.o)}</button>`).join("");
      $("#ops").querySelectorAll("[data-oi]").forEach(btn => btn.onclick = () => {
        recordTrial(+btn.dataset.oi === q.a, performance.now() - t0);
        T(350, () => { i++; ask(); }, id);
      });
      if (P.tl) T(P.tl * 1000, () => { if (alive(id) && $("#ops") && $("#ops").children.length) { recordTrial(false, P.tl * 1000, true); i++; ask(); } }, id);
    };
    ask();
  };

  /* —— VP-02 巧手拼搭（立方体计数 + 剪影匹配）—— */
  const cubeSVG = (cols) => {
    // cols: 每列高度数组，画等距立方体堆
    const w = 26, h = 15;
    let s = "";
    cols.forEach((c, x) => { for (let z = 0; z < c; z++) {
      const X = 20 + x * w - z * 10, Y = 70 - x * 7 - z * 15;
      s += `<g><polygon points="${X},${Y} ${X + w},${Y} ${X + w},${Y + h} ${X},${Y + h}" fill="#93c5fd" stroke="#1e40af"/>
      <polygon points="${X},${Y} ${X + 10},${Y - 7} ${X + w + 10},${Y - 7} ${X + w},${Y}" fill="#bfdbfe" stroke="#1e40af"/>
      <polygon points="${X + w},${Y} ${X + w + 10},${Y - 7} ${X + w + 10},${Y + h - 7} ${X + w},${Y + h}" fill="#60a5fa" stroke="#1e40af"/></g>`;
    } });
    return `<svg viewBox="0 0 150 100" style="height:120px">${s}</svg>`;
  };
  const silSVG = (grid, color = "#2563eb") => {
    const cell = 24;
    let s = "";
    grid.forEach((row, y) => row.forEach((v, x) => { if (v) s += `<rect x="${x * cell}" y="${y * cell}" width="${cell - 3}" height="${cell - 3}" rx="4" fill="${color}"/>`; }));
    return `<svg viewBox="0 0 ${grid[0].length * cell} ${grid.length * cell}" style="height:110px">${s}</svg>`;
  };
  E["VP-02"] = (P) => {
    const id = seq;
    const n = P.type === "mix" ? 6 : 5; let i = 0;
    const gen = () => {
      const type = P.type === "mix" ? rnd(["cube", "sil"]) : (P.type === "cube" ? "cube" : P.type === "tangram" ? "sil" : "cube");
      if (type === "cube") {
        const layer = P.layer || 1;
        const cols = Array.from({ length: 3 + Math.floor(Math.random() * 2) }, () => Math.floor(Math.random() * layer) + 1);
        const count = cols.reduce((a, b2) => a + b2, 0);
        const opts = shuffle([...new Set([count, count + 1, Math.max(1, count - 1), count + 2])]).slice(0, 4);
        return { q: "图中共有几个小立方体？（注意被挡住的）", svg: cubeSVG(cols), opts, a: opts.indexOf(count) };
      }
      const base = [[1, 1, 0], [0, 1, 1], [0, 1, 0]];
      const rot = (g) => g[0].map((_, x) => g.map(r => r[x]).reverse());
      const variants = [base, rot(base), rot(rot(base)), rot(rot(rot(base)))];
      const target = rnd(variants);
      const answer = rnd(variants);
      const opts = shuffle(variants);
      return { q: "哪个积木组合与目标剪影一致（可旋转）？", svg: `<div style="display:flex;gap:24px;align-items:center;justify-content:center">${silSVG(target, "#94a3b8")}<b class="muted">→</b>${silSVG(answer, "#2563eb")}</div>`, opts: opts.map((_, k) => String(k + 1)), a: opts.indexOf(answer), optRender: opts.map(v => silSVG(v, "#2563eb")) };
    };
    const ask = () => {
      if (!alive(id)) return;
      if (i >= n) return finish();
      const q = gen();
      stage(`${q.svg}<div class="playtip" style="font-size:15px">${q.q}</div>
        <div class="row" style="justify-content:center;flex-wrap:wrap" id="ops"></div><div class="muted">${i + 1}/${n}</div>`);
      setPad( TRAIN.session.name, `　${i + 1}/${n}`);
      const t0 = performance.now();
      $("#ops").innerHTML = q.opts.map((o, k) => q.optRender ? `<button class="pbtn" data-oi="${k}" style="padding:6px">${q.optRender[k]}</button>` : `<button class="pbtn" data-oi="${k}" style="min-width:80px">${o}</button>`).join("");
      $("#ops").querySelectorAll("[data-oi]").forEach(btn => btn.onclick = () => {
        recordTrial(+btn.dataset.oi === q.a, performance.now() - t0);
        T(400, () => { i++; ask(); }, id);
      });
    };
    ask();
  };

  /* —— VP-03 空间旋转（真实图形旋转 + 路线复现）—— */
  E["VP-03"] = (P) => {
    const id = seq;
    const n = P.type === "route" ? 2 : (P.n || 8); let i = 0;
    const genRot = () => {
      const shape = `<polygon points="60,10 88,32 78,68 42,68 32,32" fill="#dbeafe" stroke="#2563eb" stroke-width="3"/><circle cx="60" cy="30" r="7" fill="#dc2626"/>`;
      const mirror = Math.random() < (P.type === "mirror" ? 0.6 : 0.3);
      const deg = P.ang || 90;
      const probe = `<g transform="translate(120,0) ${mirror ? "scale(-1,1) translate(-120,0)" : ""} rotate(${deg} 60 44)">${shape}</g>`;
      return { q: mirror ? "右边是左边的镜像吗？" : `右边是左边图形旋转${deg}°后的样子吗？`, svg: `<svg viewBox="0 0 240 90" style="height:120px">${shape}${probe}</svg>`, opts: ["相同", "镜像"], a: mirror ? 1 : 0 };
    };
    const genRoute = (cb) => {
      const dirs = ["⬆️", "➡️", "⬇️", "⬅️"];
      const seg = P.seg || 3;
      const path = Array.from({ length: seg }, () => rnd(dirs));
      stage(`<div class="playtip">记住箭头路线（${path.length} 步，5秒后隐藏）</div>
        <div style="font-size:40px;letter-spacing:8px" id="pth">${path.join("")}</div>`);
      setPad( TRAIN.session.name, "　路线记忆");
      T(5000, () => {
        if (!alive(id)) return;
        stage(`<div class="playtip">按顺序复现刚才的路线</div><div class="row" style="justify-content:center" id="ps"></div>
          <div class="muted" id="pr">0/${path.length}</div>`);
        $("#ps").innerHTML = dirs.map(d => `<button class="pbtn" data-d="${d}" style="font-size:26px">${d}</button>`).join("");
        let idx = 0; const t0 = performance.now();
        $("#ps").querySelectorAll("[data-d]").forEach(btn => btn.onclick = () => {
          recordTrial(btn.dataset.d === path[idx], performance.now() - t0);
          idx++;
          $("#pr").textContent = `${idx}/${path.length}`;
          if (idx >= path.length) cb();
        });
      }, id);
    };
    const ask = () => {
      if (!alive(id)) return;
      if (i >= n) return finish();
      if (P.type === "route" || (P.type === "mix" && i % 3 === 2)) return genRoute(() => { i++; ask(); });
      const q = genRot();
      stage(`${q.svg}<div class="playtip" style="font-size:16px">${q.q}</div>
        <div class="row" style="justify-content:center" id="ops"></div><div class="muted">${i + 1}/${n}</div>`);
      setPad( TRAIN.session.name, `　${i + 1}/${n}`);
      const t0 = performance.now();
      $("#ops").innerHTML = q.opts.map(o => `<button class="pbtn" data-v="${o}" style="min-width:110px">${o}</button>`).join("");
      $("#ops").querySelectorAll("[data-v]").forEach(btn => btn.onclick = () => {
        recordTrial(btn.dataset.v === q.opts[q.a], performance.now() - t0);
        T(350, () => { i++; ask(); }, id);
      });
      if (P.tl) T(P.tl * 1000, () => { if (alive(id) && $("#ops") && $("#ops").children.length) { recordTrial(false, P.tl * 1000, true); i++; ask(); } }, id);
    };
    ask();
  };

  /* —— VP-04 妙笔临摹（底稿 + 覆盖率自动判定）—— */
  const TARGETS = {
    line_circle: [[[20, 60], [180, 60]], (() => { const p = []; for (let a = 0; a <= 2 * Math.PI; a += 0.15) p.push([100 + 45 * Math.cos(a), 120 + 45 * Math.sin(a)]); return p; })()],
    square_triangle: [[[30, 40], [90, 40], [90, 100], [30, 100], [30, 40]], [[120, 100], [150, 45], [180, 100], [120, 100]]],
    cube3d: [[[50, 60], [110, 60], [110, 120], [50, 120], [50, 60]], [[110, 60], [140, 40], [140, 100], [110, 120]], [[50, 60], [80, 40], [140, 40]]],
    pentagons: [((() => { const p = []; for (let a = 0; a <= 2 * Math.PI; a += 0.2) p.push([80 + 38 * Math.cos(a), 90 + 38 * Math.sin(a)]); return p; })()), ((() => { const p = []; for (let a = 0; a <= 2 * Math.PI; a += 0.2) p.push([130 + 38 * Math.cos(a), 90 + 38 * Math.sin(a)]); return p; })())],
    clock_face: [((() => { const p = []; for (let a = 0; a <= 2 * Math.PI; a += 0.12) p.push([100 + 62 * Math.cos(a), 110 + 62 * Math.sin(a)]); return p; })()),
      ...Array.from({ length: 12 }, (_, k) => { const a = k * Math.PI / 6; return [100 + 62 * Math.cos(a), 110 + 62 * Math.sin(a), 100 + 52 * Math.cos(a), 110 + 52 * Math.sin(a)]; })],
    clock_full: [((() => { const p = []; for (let a = 0; a <= 2 * Math.PI; a += 0.12) p.push([100 + 62 * Math.cos(a), 110 + 62 * Math.sin(a)]); return p; })()), [[100, 110], [100, 65]], [[100, 110], [135, 95]]],
    house_tree: [[[40, 90], [40, 150], [100, 150], [100, 90], [40, 90]], [[30, 90], [70, 50], [110, 90]], [[140, 150], [140, 90]], [[120, 90], [140, 60], [160, 90], [140, 90]]],
    mirror: [[[40, 70], [60, 50], [80, 70], [60, 90], [40, 70]], [[130, 70], [150, 50], [170, 70], [150, 90], [130, 70]]],
    timed: [[[40, 60], [100, 60], [100, 120], [40, 120], [40, 60]], ((() => { const p = []; for (let a = 0; a <= 2 * Math.PI; a += 0.15) p.push([150 + 32 * Math.cos(a), 90 + 32 * Math.sin(a)]); return p; })())],
    complex: [[[30, 100], [30, 150], [80, 150], [80, 100], [30, 100]], [[24, 100], [55, 70], [86, 100]], [[120, 150], [120, 100]], [[104, 100], [120, 76], [136, 100], [120, 100]], [[160, 70], [170, 60], [180, 70], [175, 82], [165, 82], [160, 70]]],
  };
  E["VP-04"] = (P) => {
    const id = seq;
    const paths = TARGETS[P.shape] || TARGETS.line_circle;
    const drawBase = () => {
      let s = "";
      paths.forEach(p => {
        if (p.length === 4 && typeof p[2] === "number") s += `<line x1="${p[0]}" y1="${p[1]}" x2="${p[2]}" y2="${p[3]}" stroke="#cbd5e1" stroke-width="3"/>`;
        else s += `<polyline points="${p.map(q => q.join(",")).join(" ")}" fill="none" stroke="#cbd5e1" stroke-width="3"/>`;
      });
      return s;
    };
    stage(`<div class="playtip">照着浅色底稿临摹（要素覆盖≥70%判定通过，医生可复核）</div>
      <canvas class="board" id="cv" height="300"></canvas>
      <div class="row" style="justify-content:center;margin-top:8px">
        <button class="pbtn sm" id="undo">↩ 撤销</button><button class="pbtn sm" id="clr">🗑 清除</button>
        <button class="pbtn primary" id="fin2">完成本关</button></div><div class="muted" id="hintbox"></div>`);
    setPad( TRAIN.session.name, `　第 ${TRAIN.level} 关`);
    const cv = $("#cv"); cv.width = Math.min($("#padbox").clientWidth - 90, 420); cv.height = 240;
    const ctx = cv.getContext("2d");
    const bg = new Image();
    bg.onload = () => ctx.drawImage(bg, 0, 0, cv.width, cv.height);
    bg.src = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${cv.width}" height="${cv.height}">${drawBase()}</svg>`);
    ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.strokeStyle = "#0f172a";
    let drawing = false, cur = null; const strokes = [];
    const pos = e => { const r = cv.getBoundingClientRect(); const sx = cv.width / r.width, sy = cv.height / r.height; return [(e.clientX - r.left) * sx, (e.clientY - r.top) * sy]; };
    cv.onpointerdown = e => { drawing = true; cur = [pos(e)]; strokes.push(cur); e.preventDefault(); };
    cv.onpointermove = e => { if (!drawing) return; cur.push(pos(e)); const p = cur; ctx.beginPath(); ctx.moveTo(...p[p.length - 2]); ctx.lineTo(...p[p.length - 1]); ctx.stroke(); e.preventDefault(); };
    cv.onpointerup = cv.onpointerleave = () => { drawing = false; };
    const redraw = () => { ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(bg, 0, 0, cv.width, cv.height); ctx.strokeStyle = "#0f172a"; for (const s of strokes) { ctx.beginPath(); s.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.stroke(); } };
    $("#undo").onclick = () => { strokes.pop(); redraw(); };
    $("#clr").onclick = () => { strokes.length = 0; redraw(); };
    $("#fin2").onclick = () => {
      // 自动要素判定：沿目标路径采样，检查画布墨迹覆盖
      const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
      const inkAt = (x, y) => {
        const R = 14;
        for (let dy = -R; dy <= R; dy += 4) for (let dx = -R; dx <= R; dx += 4) {
          const px = Math.round(x + dx), py = Math.round(y + dy);
          if (px < 0 || py < 0 || px >= cv.width || py >= cv.height) continue;
          const k = (py * cv.width + px) * 4;
          if (img[k + 3] > 60 && img[k] < 120) return true;
        }
        return false;
      };
      let pts = 0, hit = 0;
      paths.forEach(p => {
        if (p.length === 4 && typeof p[2] === "number") { pts++; if (inkAt(p[0], p[1]) && inkAt(p[2], p[3])) hit++; }
        else for (let k = 0; k < p.length; k += Math.max(1, Math.floor(p.length / 10))) { pts++; if (inkAt(p[k][0], p[k][1])) hit++; }
      });
      const cov = pts ? hit / pts : 0;
      recordTrial(cov >= 0.7, Date.now() - TRAIN.startAt);
      toast(`要素覆盖 ${Math.round(cov * 100)}%`, cov >= 0.7);
      finish();
    };
  };

  /* —— SC-01 察言观色（SVG人脸情绪）—— */
  const faceSVG = (emotion, intensity = 1, ctxText = "") => {
    const s = (v) => v * intensity;
    const cfg = {
      "开心": { brow: -s(4), mouth: `M ${50 - s(16)} ${68 - s(2)} Q 50 ${68 + s(14)} ${50 + s(16)} ${68 - s(2)}`, blush: 1 },
      "难过": { brow: s(5), mouth: `M ${50 - s(15)} ${72 + s(2)} Q 50 ${72 - s(10)} ${50 + s(15)} ${72 + s(2)}`, tear: intensity < 1 },
      "生气": { brow: `M ${38 - s(4)} ${34 - s(3)} L ${46 + s(2)} ${34 + s(5)} M ${62 - s(2)} ${34 + s(5)} L ${54 + s(4)} ${34 - s(3)}`, mouth: `M ${50 - s(13)} ${72 + s(2)} Q 50 ${72 - s(8)} ${50 + s(13)} ${72 + s(2)}`, flush: 1 },
      "害怕": { brow: `M 38 ${36 - s(2)} L 46 ${32 - s(4)} M 62 ${32 - s(4)} L 54 ${36 - s(2)}`, mouth: `<ellipse cx="50" cy="${70 + s(2)}" rx="${s(8)}" ry="${s(9)}" fill="none" stroke="#334155" stroke-width="2.5"/>`, sweat: 1 },
      "惊讶": { brow: -s(9), mouth: `<ellipse cx="50" cy="71" rx="${s(7)}" ry="${s(9)}" fill="none" stroke="#334155" stroke-width="2.5"/>` },
      "讨厌": { mouth: `M ${50 - s(14)} ${66 + s(4)} Q 50 ${70 - s(3)} ${50 + s(14)} ${66 + s(4)}`, tongue: 1 },
    }[emotion] || {};
    return `<svg viewBox="0 0 100 100" style="height:170px">
      <circle cx="50" cy="52" r="38" fill="#fef3c7" stroke="#eab308" stroke-width="2"/>
      ${cfg.brow && typeof cfg.brow === "number"
        ? `<path d="M 37 ${40 + cfg.brow} L 46 ${40 + cfg.brow * 0.6} M 54 ${40 + cfg.brow * 0.6} L 63 ${40 + cfg.brow}" stroke="#334155" stroke-width="2.5" fill="none"/>`
        : (cfg.brow ? `<path d="${cfg.brow}" stroke="#334155" stroke-width="2.5" fill="none"/>` : `<path d="M 37 40 L 46 40 M 54 40 L 63 40" stroke="#334155" stroke-width="2.5"/>`)}
      <circle cx="43" cy="50" r="3.4" fill="#334155"/><circle cx="57" cy="50" r="3.4" fill="#334155"/>
      ${cfg.mouth && cfg.mouth.startsWith("M") ? `<path d="${cfg.mouth}" stroke="#334155" stroke-width="2.5" fill="none"/>` : (cfg.mouth || "")}
      ${cfg.tear ? `<path d="M 60 56 q 3 6 0 9" stroke="#60a5fa" stroke-width="2.5" fill="none"/>` : ""}
      ${cfg.flush ? `<circle cx="34" cy="60" r="5" fill="rgba(220,38,38,.25)"/><circle cx="66" cy="60" r="5" fill="rgba(220,38,38,.25)"/>` : ""}
      ${cfg.blush ? `<circle cx="35" cy="61" r="4.5" fill="rgba(244,114,182,.3)"/><circle cx="65" cy="61" r="4.5" fill="rgba(244,114,182,.3)"/>` : ""}
      ${cfg.sweat ? `<path d="M 76 30 q 4 6 0 10" stroke="#60a5fa" stroke-width="2.5" fill="none"/>` : ""}
    </svg>`;
  };
  E["SC-01"] = (P) => {
    const id = seq;
    const ALL = ["开心", "难过", "生气", "害怕", "惊讶", "讨厌"];
    const ks = ALL.slice(0, Math.min(P.k || 4, 6));
    const n = P.n || 8; let i = 0;
    const ask = () => {
      if (!alive(id)) return;
      if (i >= n) return finish();
      const emo = rnd(ks);
      const intensity = P.strong ? 1.2 : 0.6;
      const face = faceSVG(emo, P.mix && i % 4 === 3 ? 0.45 : intensity);
      const wrong = shuffle(ks.filter(k => k !== emo)).slice(0, Math.max(1, ks.length - 1));
      const opts = shuffle([emo, ...wrong]);
      stage(`${face}${P.ctx ? `<div class="muted">情境：${esc(rnd(["看到生日蛋糕", "玩具被弄坏了", "被大声吼了", "听到巨响", "收到意外礼物", "闻到臭味"]))}</div>` : ""}
        <div class="playtip" style="font-size:16px">图中是什么情绪？</div>
        <div class="row" style="justify-content:center" id="ops"></div><div class="muted">${i + 1}/${n}</div>`);
      setPad( TRAIN.session.name, `　${i + 1}/${n}`);
      const t0 = performance.now();
      $("#ops").innerHTML = opts.map(o => `<button class="pbtn" data-v="${o}" style="min-width:96px">${o}</button>`).join("");
      $("#ops").querySelectorAll("[data-v]").forEach(btn => btn.onclick = () => {
        recordTrial(btn.dataset.v === emo, performance.now() - t0);
        T(350, () => { i++; ask(); }, id);
      });
      if (P.tl) T(P.tl * 1000, () => { if (alive(id) && $("#ops") && $("#ops").children.length) { recordTrial(false, P.tl * 1000, true); i++; ask(); } }, id);
    };
    ask();
  };

  /* —— SC-02 / SC-03 / SC-04 题库驱动 —— */
  const mcqEngine = (BANK) => (P) => {
    const id = seq;
    const lvl = Math.min(TRAIN.level, 10);
    let pool = (BANK[lvl - 1] || BANK[BANK.length - 1]).slice();
    pool = shuffle(pool);
    let i = 0;
    const ask = () => {
      if (!alive(id)) return;
      if (i >= pool.length) return finish();
      const q = pool[i];
      stage(`${q.svg || ""}<div class="playtip" style="font-size:15.5px;line-height:1.9">${esc(q.q)}</div>
        <div class="row" style="justify-content:center;flex-wrap:wrap" id="ops"></div>
        <div class="muted" id="fb"></div><div class="muted">${i + 1}/${pool.length}</div>`);
      setPad( TRAIN.session.name, `　${i + 1}/${pool.length}`);
      const t0 = performance.now();
      $("#ops").innerHTML = q.opts.map((o, oi) => `<button class="pbtn" data-oi="${oi}" style="min-width:130px;max-width:330px">${esc(o)}</button>`).join("");
      $("#ops").querySelectorAll("[data-oi]").forEach(btn => btn.onclick = () => {
        recordTrial(+btn.dataset.oi === q.a, performance.now() - t0);
        $("#fb").textContent = +btn.dataset.oi === q.a ? "✓ 答对了" : "✗ 再想想";
        $("#fb").style.color = +btn.dataset.oi === q.a ? "#15803d" : "#dc2626";
        $("#ops").querySelectorAll("button").forEach(x => x.disabled = true);
        T(700, () => { i++; ask(); }, id);
      });
    };
    ask();
  };
  const SC2 = [
    [["小明把饼干藏进盒子后出门，妈妈把饼干移到抽屉。小明回来会去哪找？", ["盒子里", "抽屉里"], 0], ["小红看到小刚把玩具放床下，小红离开后小刚把玩具放进柜子。小红以为玩具在哪？", ["床下", "柜子里"], 0], ["小华以为妈妈在厨房，其实妈妈在花园。小华找妈妈会先去？", ["厨房", "花园"], 0], ["小丽把糖藏在书里，哥哥趁她不在把糖换到了笔筒。小丽回来先找？", ["书里", "笔筒"], 0]],
    [["小刚把小丽的画藏了起来。小丽会认为是谁拿的？", ["小刚", "不知道，她没看见"], 1], ["奶奶把老花镜放进抽屉，爷爷看见了并挪到了桌上。奶奶回来先找哪里？", ["抽屉", "桌上"], 0], ["明明告诉红红他在公园，其实他在书店。红红想找他玩会去？", ["公园", "书店"], 0], ["小狗把骨头埋在树下，另一只狗看见了并挖走。第一只狗回来会去？", ["树下", "别处找"], 0]],
    [["下雨了，小丽没带伞却很开心，为什么？", ["有人会来接她", "她喜欢淋雨"], 0], ["小华考试不及格却笑了，最可能因为？", ["他并不在意这门课", "他看错了分数"], 0], ["妈妈加班到很晚才回家，还给孩子带了礼物，孩子为什么高兴？", ["妈妈惦记着自己", "礼物很贵"], 0], ["小刚把作业借给同学抄，老师批评了他。小刚觉得委屈，因为？", ["他只是想帮助同学", "老师冤枉他打架"], 0]],
    [["老师当众表扬小明，小明脸红了。他的心情是？", ["害羞又高兴", "生气"], 0], ["爷爷把孙子最爱的糖收了起来，孙子看到爷爷藏糖。孙子会去哪里找？", ["爷爷藏的地方", "他以为爷爷忘了，其实他看到了"], 0], ["小芳发现好朋友和别人玩，没叫她。她最可能的心情？", ["有点失落", "为朋友高兴"], 0], ["爸爸答应周末去动物园，临时加班没去成。孩子最可能觉得？", ["失望", "无所谓"], 0]],
    [["小刚故意踩了小明的脚还没道歉，小明会怎么想小刚？", ["小刚是故意的，很生气", "小刚是不小心的"], 0], ["小红把妈妈准备的惊喜派对说漏了嘴。妈妈会怎么想？", ["小红不小心说漏了", "小红故意捣乱"], 0], ["老师问“谁没有交作业”，没人回答。其实小华没交。小华的心情是？", ["紧张，怕被发现", "轻松"], 0], ["两个同学都想当组长，最后一人当选。落选的同学嘴上说“无所谓”，心里可能？", ["有些失落", "真的无所谓"], 0]],
    [["小美对小明说“你的画真好看”，但语气很敷衍。小明应该明白？", ["她可能不是真心的", "她非常喜欢"], 0], ["爸爸对妈妈说“孩子的房间真‘整洁’啊”（房间很乱）。爸爸的意思是？", ["该收拾房间了", "房间真的干净"], 0], ["小刚听说小红“在背后说他坏话”，但其实那是别人说的。小刚应该？", ["先核实再判断", "直接不理小红"], 0], ["奶奶总把好菜留给孙子，自己吃剩的。孙子长大后明白了奶奶是？", ["疼爱他", "不爱吃好菜"], 0]],
  ];
  const SC3 = [
    [["公交车上看到老人上车，最恰当的做法？", ["主动让座", "装作没看见", "把脸转向窗外"], 0], ["在医院排队时有人插队，最好？", ["礼貌提醒请排队", "大声斥责", "直接推走"], 0], ["邻居深夜很吵，最合适的做法？", ["友好敲门提醒", "报警投诉", "对着墙敲打"], 0]],
    [["同学不小心碰掉了你的文具，你会？", ["说没关系，一起捡", "马上报告老师", "推他一下"], 0], ["朋友比赛输了很难过，你会？", ["安慰并鼓励他", "嘲笑他", "假装没看见"], 0], ["朋友向你倾诉烦恼，你应该？", ["认真倾听并安慰", "打断他讲自己的事", "告诉其他人"], 0]],
    [["想借同桌的橡皮，最礼貌的说法？", ["“请问可以借我用一下吗？”", "“把橡皮给我。”", "直接拿走"], 0], ["不小心踩到别人的脚，应该？", ["马上道歉", "怪他放脚的位置", "装作没事"], 0], ["收到不喜欢的礼物，最得体的回应？", ["谢谢对方的心意", "当面说不喜欢", "扔在一边"], 0]],
    [["到别人家做客，主人端来水果，应该？", ["道谢后适量取用", "全部吃完", "不吃并推远"], 0], ["别人正在打电话，你有急事要说，应该？", ["先示意，等他讲完", "直接大声插话", "把电话抢过来"], 0], ["借了同学的书，最应该注意的是？", ["按时归还并道谢", "随手乱画", "不还也没事"], 0]],
    [["两位同学吵架找你评理，最合适的做法？", ["听双方说完再劝和", "直接帮熟悉的一方", "转身走开"], 0], ["小组成员意见不一致，最好？", ["讨论后表决或折中", "坚持己见不商量", "随便他们去吧"], 0], ["发现好朋友拿了别人的东西，你会？", ["私下提醒他去归还", "当众揭发", "帮他保密"], 0]],
    [["排队买票时有人很着急想插队，最得体的做法？", ["说明先来后到，可建议他求助工作人员", "默许插队", "与他争吵"], 0], ["同桌总抄你的作业，你会？", ["讲解思路但不给抄", "继续给他抄", "告诉全班"], 0], ["长辈说话时你应该？", ["等对方说完再表达自己", "随时打断", "低头玩手机"], 0]],
    [["同事把你的功劳说成了他的，你会？", ["找合适时机客观澄清", "当众吵起来", "闷不做声不再合作"], 0], ["新来的同事总做错事拖累进度，最好？", ["耐心示范并给建议", "向所有人抱怨", "干脆不给他任务"], 0], ["聚会上有人讲了让你不适的玩笑，最得体的回应？", ["平静表达自己的感受", "当场翻脸", "憋在心里疏远所有人"], 0]],
  ];
  const SC4 = [
    [["“你可真行啊，又迟到了！”的意思是？", ["批评迟到", "表扬他", "无关的话"], 0], ["“欢迎欢迎，以后常来玩啊！”（初次见面的客套）说明？", ["礼节性说法，不必当真天天来", "真的要求你天天来", "讨厌你"], 0], ["“请留步，就不远送了”是？", ["送客的客套话", "让客人快走", "生气了"], 0]],
    [["“他跑得像兔子一样快”是说？", ["跑得快", "养兔子", "害怕"], 0], ["“月亮像一只小船挂在天上”用的是？", ["比喻", "批评", "命令"], 0], ["“他的手像冰一样凉”说明？", ["手很凉", "他刚洗过手", "他有超能力"], 0]],
    [["“这天气热得能把人烤熟”是说？", ["天气非常热", "真的会被烤", "在厨房"], 0], ["“教室里静得连针掉地上都能听见”是说？", ["非常安静", "教室很小", "有人在缝衣服"], 0], ["“他的心像被掏空了一样”是说？", ["非常空虚难过", "做了手术", "心脏有问题"], 0]],
    [["朋友说“改天一定请你吃饭”，可能意思是？", ["客套话，不一定真的请", "明天一定请", "讨厌你"], 0], ["“你看看都几点了？”（对孩子说）的意思是？", ["该睡觉/别迟到了", "想让他学看钟", "问时间"], 0], ["“这孩子，真是拿你没办法”（笑着说的）表达？", ["无奈中的疼爱", "真的讨厌", "要惩罚"], 0]],
    [["“这主意真是‘好’极了！”（说话人翻白眼）意思是？", ["这主意很糟糕", "主意真好", "没意见"], 0], ["同事说“你可真忙啊”（他刚找你三次都没空）意思是？", ["有些不满", "夸你勤奋", "问候"], 0], ["“哦，您可真是大忙人呢”电话里的语气冷淡，说明？", ["对方有意见", "对方崇拜你", "打错了"], 0]],
    [["“我是不是该谢谢您呢？”（生气时说）意思是？", ["不满，反话", "真的感谢", "在提问"], 0], ["“行，都听你的。”（吵完架后冷冷地说）可能表示？", ["并不服气", "完全同意", "很开心"], 0], ["“随便你吧。”（叹气后说）通常表示？", ["失望、不想再争", "尊重你的选择并开心", "没听懂"], 0]],
  ];
  E["SC-02"] = mcqEngine(SC2);
  E["SC-03"] = mcqEngine(SC3);
  E["SC-04"] = mcqEngine(SC4);

  /* ================= 会话入口 ================= */
  function run(T) {
    seq++;                              // 使旧的定时器失效
    const P = T.params || {};
    hintLevel = 0;
    const eng = E[T.program];
    if (!eng) { toast("该方案引擎即将上线", false); return; }
    stage(`<div style="font-size:40px">${(typeof ICONS !== "undefined" && ICONS[T.program]) || (window.hsIcon ? hsIcon(T.program) : "")}</div>
      <div style="font-size:21px;font-weight:800">${T.session.name} · 第 ${T.level} 关</div>
      <div style="font-size:14.5px;color:#475569;text-align:center;max-width:460px;line-height:1.9">${GOAL[T.program] || esc(T.session.desc)}</div>
      <div class="muted">${T.session.locked ? "难度已由医生固定" : "根据表现自动升降关"} · 正确率≥80%且达标通过</div>
      <button class="pbtn primary xl" id="go" style="max-width:320px">开始训练</button>`);
    setPad(T.session.name, `　第 ${T.level} 关`);
    $("#go").onclick = () => { TRAIN.startAt = Date.now(); eng(P); };
  }
  return { run, stop: () => { seq++; } };
})();
