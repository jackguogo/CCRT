/**
 * 伦敦塔测验（TOL，Tower of London）配置与题库
 *
 * 与汉诺塔的区别（记录单「评估内容参考」）：
 *   ① 三根柱子长度不同（本版柱高 4 / 3 / 2 颗）；
 *   ② 珠子没有大小之分，只分颜色；
 *   ③ 初始状态与目标状态多样化（不是单纯"全从 A 搬到 C"）；
 *   ④ 最初的版本是 3 颗珠子 —— 本版沿用 3 珠。
 *
 * 题目的「最少完成步数」不是手写的，是按状态空间 BFS 算出来的：
 *   柱容量 [4,3,2]、3 颗珠的合法状态共 26 个，任意两态都连通，最远 7 步，
 *   正好覆盖记录单要求的「正式测验最少完成步数 3–7 步」。
 *   校验脚本 scripts/qa-tol.mjs 会重算一遍并与此处 min 比对。
 *
 * 盘面表示：state = [柱A, 柱B, 柱C]，每个柱是从下到上排列的珠子编号数组。
 *   0 = 红，1 = 蓝，2 = 绿
 */

const TOL_COLORS = [
  { k: "r", name: "红", hex: "#e0554f", shade: "#b93f3a" },
  { k: "b", name: "蓝", hex: "#3f7fe0", shade: "#2c60b3" },
  { k: "g", name: "绿", hex: "#2f9e6b", shade: "#1f7b51" },
];

/* 三根柱子长度不同：A 最长（可放 4 颗）、B 中等（3 颗）、C 最短（2 颗） */
const TOL_PEGS = [
  { k: "A", name: "A 柱", cap: 4 },
  { k: "B", name: "B 柱", cap: 3 },
  { k: "C", name: "C 柱", cap: 2 },
];

/* 2 题练习 + 10 题正式；正式题最少步数 3,3,4,4,5,5,6,6,7,7 */
const TOL_ITEMS = [
  { id: "P1", prac: true, start: [[0, 1, 2], [], []], goal: [[0, 1], [2], []], min: 1 },
  { id: "P2", prac: true, start: [[0, 1], [2], []], goal: [[0], [1], [2]], min: 2 },

  { id: "T1", start: [[0, 2], [1], []], goal: [[0, 1], [2], []], min: 3 },
  { id: "T2", start: [[0, 1], [2], []], goal: [[], [0], [1, 2]], min: 3 },
  { id: "T3", start: [[0, 1], [2], []], goal: [[], [0, 2], [1]], min: 4 },
  { id: "T4", start: [[0], [1, 2], []], goal: [[1, 2], [], [0]], min: 4 },
  { id: "T5", start: [[0, 1], [2], []], goal: [[2], [0, 1], []], min: 5 },
  { id: "T6", start: [[0, 1], [], [2]], goal: [[1], [], [0, 2]], min: 5 },
  { id: "T7", start: [[0, 1], [], [2]], goal: [[2], [0, 1], []], min: 6 },
  { id: "T8", start: [[0, 1], [2], []], goal: [[1, 2], [0], []], min: 6 },
  { id: "T9", start: [[0, 1, 2], [], []], goal: [[], [0, 1], [2]], min: 7 },
  { id: "T10", start: [[0], [1], [2]], goal: [[], [0, 1], [2]], min: 7 },
];

const TOL_CFG = {
  runner: "tol",
  /* 单题限时（秒）：从题目呈现开始计时，超时记为未完成 */
  limitSec: 60,
  /* 前 2 题为练习，不计分 */
  practice: 2,
  /* 连续 3 题没有正确解决（未在最少步数内完成）可停止测验 */
  stopAfter: 3,
  /* 本题满分 = 正式题数（每答对一题得 1 分） */
  max: 10,
  beads: TOL_COLORS,
  pegs: TOL_PEGS,
  items: TOL_ITEMS,
};

module.exports = { TOL_COLORS, TOL_PEGS, TOL_ITEMS, TOL_CFG };
