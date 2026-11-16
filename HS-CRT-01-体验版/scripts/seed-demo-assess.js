// 生成演示数据：3 条「审核中」+ 3 条「已完成（含报告）」
const BASE = "http://127.0.0.1:3211/api/v1";
const { drawClock, drawPentagons, drawCube } = require("./demo-draw-png");
const { speechOf } = require("./demo-speech");

let TK = "";
const api = async (path, opt = {}) => {
  const r = await fetch(BASE + path, {
    method: opt.method || "GET",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + TK },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error(path + " → " + j.message);
  return j.data;
};

const expectVals = () => {
  const d = new Date(), m = d.getMonth() + 1;
  return {
    "@year": String(d.getFullYear()), "@month": String(m), "@day": String(d.getDate()),
    "@weekday": ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][d.getDay()],
    "@season": (m <= 2 || m === 12) ? "冬季" : m <= 5 ? "春季" : m <= 8 ? "夏季" : "秋季",
  };
};
const DRAW = { K1: () => drawPentagons(), Q18: () => drawPentagons(), M03: () => drawClock(), CUBE: () => drawCube() };
// 定向力等无标准答案的填空题：按题目语义填合理值，避免出现「城市=教师」这类穿帮数据
const TEXT = { Q06: "杭州市", Q07: "西湖区", Q08: "北山街道", Q09: "3", Q10: "西湖区人民医院" };
const TEXT_ARR = {
  M16: ["2026", "10", "29", "星期四", "西湖区人民医院", "杭州市"],
  M09: ["93", "86", "79", "72", "65"],
};

const itemMax = (it) => it.scoring === "item" ? (it.max || 0)
  : (it.parts || []).reduce((a, p) => a + (p.max != null ? p.max : 1), 0);

// 生成一条作答：fill/order/choice 有标准答案时按 80% 概率答对
function makeAnswer(it, seed, code) {
  const ev = expectVals();
  const parts = [];
  let spoken = 0;
  (it.parts || []).forEach((p, pi) => {
    if (p.mode === "draw") { parts.push(DRAW[it.id] ? DRAW[it.id]() : drawClock()); return; }
    if (p.mode === "paper") { parts.push("拿起纸张 → 对折 1 次 → 放在地上"); return; }
    if (p.mode === "judge") { parts.push(""); spoken += 2 + ((seed + pi) % 3); return; }
    if (p.mode === "fill" || p.mode === "order" || p.mode === "choice") {
      if (p.expect) {
        const ok = (seed + pi) % 5 !== 0;
        parts.push(ok ? (ev[p.expect] || p.expect) : (p.mode === "order" ? "1,3,2,4,5,6,7,8" : "不确定"));
      } else {
        const arr = TEXT_ARR[it.id];
        parts.push(arr ? (arr[pi] || "—") : (TEXT[it.id] || "正常"));
      }
      return;
    }
    parts.push("");
  });
  const a = { parts };
  if (spoken) {
    a.spoken = spoken;
    a.speech = speechOf(code, it.id, it);
  }
  return a;
}

// 审核评分：有标准答案的按自动判定，其余按正确率折算
function makeScores(it, ans, ratio, seed) {
  const out = {};
  const ev = expectVals();
  const got = (ans && ans.parts) || [];
  // 整题给分（scoring:"item"）：直接按正确率折算 0..max
  if (it.scoring === "item") {
    const mx = it.max || 0;
    const answered = got.some(v => v !== "" && v != null);
    return answered ? Math.round(mx * ratio) : 0;
  }
  let s = 0;
  (it.parts || []).forEach((p, i) => {
    const m = p.max != null ? p.max : 1;
    if (p.mode === "fill" || p.mode === "order" || p.mode === "choice") {
      if (p.expect && String(got[i] || "").trim() === String(ev[p.expect] || p.expect).trim()) s += m;
    } else if (p.mode === "draw" || p.mode === "paper") {
      if (got[i]) s += Math.round(m * ratio);
    } else {
      if ((seed + i) % 10 < ratio * 10) s += m;
    }
  });
  out[it.id] = Math.min(s, itemMax(it));
  return out[it.id];
}

const PLANS = {
  quick: { name: "快速筛查方案", id: 1, items: [{ type: "scale", code: "MMSE" }] },
  std: { name: "标准筛查方案", id: 2, items: [{ type: "scale", code: "MMSE" }, { type: "scale", code: "MoCA" }] },
  std2: { name: "标准评估方案", id: 4, items: [{ type: "scale", code: "MoCA" }, { type: "paradigm", code: "TMT" }, { type: "paradigm", code: "AVLT" }] },
  mem: { name: "记忆与执行专项", id: 8, items: [{ type: "paradigm", code: "AVLT" }, { type: "paradigm", code: "TMT" }, { type: "paradigm", code: "STROOP" }] },
  full: {
    name: "全面评估方案", id: 3, items: [{ type: "scale", code: "MMSE" }, { type: "scale", code: "MoCA" },
      { type: "paradigm", code: "SPAN" }, { type: "paradigm", code: "TMT" }, { type: "paradigm", code: "STROOP" },
      { type: "paradigm", code: "AVLT" }, { type: "paradigm", code: "BNT" }, { type: "paradigm", code: "CDT" }],
  },
};

const NEW_PATIENTS = [
  { name: "王秀英", sex: "女", birth_date: "1952-04-18", education: "小学", dept: "神经内科", phone: "13800001021", history: "记忆力下降 1 年余，家属代诉常忘事。", plan: "std", mode: "review" },
  { name: "李国强", sex: "男", birth_date: "1948-11-03", education: "高中", dept: "神经内科", phone: "13800001022", history: "高血压病史 10 年，近半年反应变慢。", plan: "quick", mode: "review" },
  { name: "张桂芳", sex: "女", birth_date: "1955-07-26", education: "初中", dept: "老年科", phone: "13800001023", history: "间断头晕，注意力不集中 6 个月。", plan: "full", mode: "review" },
  { name: "刘志远", sex: "男", birth_date: "1950-02-14", education: "大学及以上", dept: "神经内科", phone: "13800001024", history: "主诉记不住近期事项，工作能力下降。", plan: "full", mode: "done" },
  { name: "陈美玲", sex: "女", birth_date: "1958-09-08", education: "高中", dept: "康复科", phone: "13800001025", history: "脑外伤后认知功能减退，规律随访。", plan: "std2", mode: "done" },
  { name: "杨建国", sex: "男", birth_date: "1945-12-30", education: "小学", dept: "老年科", phone: "13800001026", history: "糖尿病史，家属反映近期言语减少。", plan: "mem", mode: "done" },
];

(async () => {
  TK = (await api("/auth/login", { method: "POST", body: { username: "doctor", password: "hs123456" } })).token;
  const banks = await api("/banks");
  const metaOf = (code) => banks.scales.find(s => s.code === code) || banks.paradigms.find(p => p.code === code);

  for (const [ni, np] of NEW_PATIENTS.entries()) {
    const pl = PLANS[np.plan];
    const { id: pid } = await api("/patients", { method: "POST", body: {
      name: np.name, sex: np.sex, birth_date: np.birth_date, education: np.education,
      dept: np.dept, phone: np.phone, history: np.history,
      id_card: "", outpatient_no: "", guardian: "",
    } });
    const { recordId } = await api("/assessments", { method: "POST", body: {
      patientId: pid, planName: pl.name, planId: pl.id, items: pl.items, mode: "doctor",
    } });
    const ratio = [0.82, 0.7, 0.62, 0.9, 0.78, 0.55][ni];
    const scoreMap = {};
    for (const item of pl.items) {
      const meta = metaOf(item.code);
      const answers = {};
      (meta.items || []).forEach((it, k) => { answers[it.id] = makeAnswer(it, ni * 7 + k, item.code); });
      await api("/assessments/" + recordId + "/answers", { method: "POST", body: { code: item.code, answers } });
      await api("/assessments/" + recordId + "/record-item", { method: "POST", body: { code: item.code } });
      const sc = {};
      (meta.items || []).forEach((it, k) => { sc[it.id] = makeScores(it, answers[it.id], ratio, ni * 3 + k); });
      scoreMap[item.code] = sc;
    }
    if (np.mode === "done") {
      for (const [code, scores] of Object.entries(scoreMap))
        await api("/assessments/" + recordId + "/review-scores", { method: "POST", body: { code, scores } });
      const r = await api("/assessments/" + recordId + "/complete-review", { method: "POST" });
      console.log(`[已完成] ${np.name} 记录#${recordId} 报告 ${r.reportNo}`);
    } else {
      // 其中一条留一点已保存的评分，用于展示「已保存草稿」
      if (ni === 1) {
        const code = pl.items[0].code;
        await api("/assessments/" + recordId + "/review-scores", { method: "POST", body: { code, scores: scoreMap[code] } });
      }
      console.log(`[审核中] ${np.name} 记录#${recordId} 方案 ${pl.name}`);
    }
  }
})();
