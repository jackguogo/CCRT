// span-data.js —— 数字广度测验（SPAN）刺激序列与条目定义
//
// 序列来源：**照《数字广度测验记录表》逐条录入**（顺背 3–12 位、倒背 2–10 位，每长度 2 试），
// 与记录表行序完全一致，主试按「第 1 试 → 第 2 试」顺序念读；同一份记录可复核、跨次施测刺激一致。
// 注意：倒背表内列出的是**主试念读顺序**，被试须反序背出（由 reversed 生成 expect）。
// 序列本身不在此处二次改写（不加零、不调位），如需更换刺激材料，直接改下方两张表。
//
// 计分：一个长度 = 1 题（含 2 个作答单元），每正确背出 1 个序列计 1 分。
//   顺背 3–12 位 × 2 试 = 20 分；倒背 2–10 位 × 2 试 = 18 分；总分上限 38 分。

/* 顺背序列：长度 → [第 1 试, 第 2 试] */
const FWD_SEQ = {
  3: ["582", "694"],
  4: ["6439", "7286"],
  5: ["42731", "75836"],
  6: ["619473", "392487"],
  7: ["5971428", "4179386"],
  8: ["58192647", "38295174"],
  9: ["275862584", "713942568"],
  10: ["5274913746", "4725916253"],
  11: ["41638246359", "36149751427"],
  12: ["749613596825", "694719742592"],
};

/* 倒背序列：长度 → [第 1 试, 第 2 试]（此处为**主试念读**的顺序，登记为反序时由 reversed 生成） */
const BWD_SEQ = {
  2: ["24", "58"],
  3: ["629", "415"],
  4: ["3279", "4968"],
  5: ["15286", "61843"],
  6: ["539418", "724856"],
  7: ["8129365", "4739128"],
  8: ["94376258", "72819653"],
  9: ["631943658", "941538572"],
  10: ["6452679386", "5162743859"],
};

/* 练习（测试）序列：顺背 1 位 2 个、2 位 2 个；倒背 1 位 2 个 */
const PRACTICE = {
  fwd: [
    { len: 1, seq: "8" }, { len: 1, seq: "3" },
    { len: 2, seq: "69" }, { len: 2, seq: "28" },
  ],
  bwd: [{ len: 1, seq: "1" }, { len: 1, seq: "7" }],
};

const pad2 = (n) => String(n).padStart(2, "0");
const reversed = (s) => s.split("").reverse().join("");
const spoken = (s) => s.split("").join(" — ");

const SPAN_CFG = {
  fwdStart: 3, fwdEnd: 12, bwdStart: 2, bwdEnd: 10, trialsPerLen: 2,
  practiceFwd: [1, 2], practiceBwd: [1],
};

/* 条目（喂给施测引擎）：parts[i].shown = 主试念读的序列，parts[i].expect = 被试应输入的序列 */
const SPAN_ITEMS = [];

PRACTICE.fwd.forEach((p, i) => {
  SPAN_ITEMS.push({
    id: "PF" + pad2(i + 1), g: "顺背练习", demo: true, len: p.len,
    t: `顺背练习 ${p.len} 位（第 ${(i % 2) + 1} 个）`,
    parts: [{ l: "第 " + ((i % 2) + 1) + " 试", mode: "fill", expect: p.seq, shown: p.seq }],
  });
});

Object.keys(FWD_SEQ).forEach((len) => {
  SPAN_ITEMS.push({
    id: "F" + pad2(len), g: "顺背", len: Number(len), t: `顺背 ${len} 位`,
    parts: FWD_SEQ[len].map((s, i) => ({ l: `第 ${i + 1} 试`, mode: "fill", expect: s, shown: s })),
  });
});

PRACTICE.bwd.forEach((p, i) => {
  SPAN_ITEMS.push({
    id: "PB" + pad2(i + 1), g: "倒背练习", demo: true, len: p.len,
    t: `倒背练习 ${p.len} 位（第 ${i + 1} 个）`,
    parts: [{ l: "第 " + (i + 1) + " 试", mode: "fill", expect: reversed(p.seq), shown: p.seq }],
  });
});

Object.keys(BWD_SEQ).forEach((len) => {
  SPAN_ITEMS.push({
    id: "B" + pad2(len), g: "倒背", len: Number(len), t: `倒背 ${len} 位`,
    parts: BWD_SEQ[len].map((s, i) => ({ l: `第 ${i + 1} 试`, mode: "fill", expect: reversed(s), shown: s })),
  });
});

/* 逐题施测指导（评分页 / 报告页据此复核每个试次） */
const SPAN_ITEM_GUIDE = {};
SPAN_ITEMS.forEach((it) => {
  const dir = it.g.indexOf("倒背") >= 0 ? "倒背" : "顺背";
  const seqTxt = it.parts.map((p, i) => `${spoken(p.shown)}（第 ${i + 1} 试）`).join("、");
  if (it.demo) {
    SPAN_ITEM_GUIDE[it.id] = {
      p: `${dir === "倒背" ? "请倒着背出来" : "请照样背出来"}：${seqTxt}。`,
      o: "练习试次：只读一遍；被试答对、答错都进入下一试，不计分。",
      bands: [],
      n: "练习用于确认被试听懂「照样背 / 倒着背」，不计入总分。",
    };
    return;
  }
  SPAN_ITEM_GUIDE[it.id] = {
    p: `请${dir === "倒背" ? "倒着背出来" : "照样背出来"}：${seqTxt}。`,
    o: dir === "倒背"
      ? "每秒 1 个数字念读，只读一遍；示意被试按相反顺序背出，不示范、不重复念读。"
      : "每秒 1 个数字念读，只读一遍；念完再示意被试按同样顺序背出，不重复、不分段提示。",
    bands: [[2, "2 试均正确"], [1, "1 试正确"], [0, "2 试均错误"]],
    n: "每正确背出 1 个序列计 1 分；同一长度两试均错误即终止该方向测验。",
  };
});

module.exports = { SPAN_CFG, SPAN_ITEMS, SPAN_ITEM_GUIDE, FWD_SEQ, BWD_SEQ, PRACTICE };
