// cdt-data.js —— 画钟测验（CDT）六种评分法
// 依据评估规范表 11-1～表 11-5 与 7 分评分法说明整理，逐项「有 / 无」勾选，勾中即累加该项分值。
// 3/4/5/10/30 分法为正向得分（越高越好，低于界值提示执行功能下降）；
// 7 分法为错误计分（勾中即扣分项，得分越高执行功能越差，≤ 3 分为正常）。

const CDT_SCALES = [
  {
    k: "s3", name: "3 分评分法", max: 3, cut: 3, direction: "higher_better",
    rule: "评分 < 3 分表明执行功能下降",
    source: "表 11-1",
    items: [
      { id: "circle", label: "画好一个封闭的圆", pts: 1 },
      { id: "digits", label: "正确标出 12 个数字", pts: 1 },
      { id: "hands", label: "将指针置于正确的位置", pts: 1 },
    ],
  },
  {
    k: "s4", name: "4 分评分法", max: 4, cut: 4, direction: "higher_better",
    rule: "评分 < 4 分表明执行功能下降",
    source: "表 11-2",
    items: [
      { id: "circle", label: "画好一个封闭的圆", pts: 1 },
      { id: "digits", label: "12 个数字均没有遗漏", pts: 1 },
      { id: "order", label: "数字的位置及顺序准确", pts: 1 },
      { id: "hands", label: "将指针置于正确的位置", pts: 1 },
    ],
  },
  {
    k: "s5", name: "5 分评分法", max: 5, cut: 5, direction: "higher_better",
    rule: "评分 < 5 分表明执行功能下降",
    source: "表 11-3",
    items: [
      { id: "circle", label: "画好一个封闭的圆", pts: 1 },
      { id: "digits", label: "12 个数字均没有遗漏", pts: 1 },
      { id: "order", label: "数字的位置及顺序正确", pts: 1 },
      { id: "two", label: "画出 2 个指针", pts: 1 },
      { id: "hands", label: "将指针置于正确的位置", pts: 1 },
    ],
  },
  {
    k: "s7", name: "7 分评分法", max: 7, cut: 3, direction: "lower_better",
    rule: "得分越高表示执行功能越差，≤ 3 分为正常",
    source: "7 分评分法说明",
    note: "要求被试在已有的圆圈内画出钟面。用 2 条线把钟面分成 4 个象限：一条线通过 12 和中央点，另一条线垂直平分第一条线；从 12 开始顺时针计数每个象限中的数字，每个数字只计一次（落在直线上的数字归入参考线顺时针方向的象限）。每个象限应有 3 个数字，数目有错即按该项计分。",
    items: [
      { id: "q1", label: "第一象限数字数目有错误", pts: 1 },
      { id: "q2", label: "第二象限数字数目有错误", pts: 1 },
      { id: "q3", label: "第三象限数字数目有错误", pts: 1 },
      { id: "q4", label: "第四象限数字数目有错误", pts: 4 },
    ],
  },
  {
    k: "s10", name: "10 分评分法", max: 10, cut: 9, direction: "higher_better",
    rule: "评分 < 9 分表明执行功能下降",
    source: "表 11-4",
    items: [
      { id: "circle", label: "画好一个封闭的圆", pts: 2 },
      { id: "digits", label: "12 个数字的位置及顺序正确", pts: 4 },
      { id: "hands", label: "指针的位置和大小正确", pts: 4 },
    ],
  },
  {
    k: "s30", name: "30 分评分法", max: 30, cut: 19, direction: "higher_better",
    rule: "评分 < 19 分表明执行功能下降",
    source: "表 11-5",
    items: [
      { id: "anchor", label: "锚定「12, 3, 6, 9」四个点", pts: 4 },
      { id: "allnum", label: "写出所有数字", pts: 4 },
      { id: "inside", label: "所有数字在钟面圆圈内", pts: 3 },
      { id: "center", label: "中央点位置准确", pts: 1 },
      { id: "whole", label: "钟面完整", pts: 1 },
      { id: "two", label: "有时针和分针", pts: 2 },
      { id: "cw", label: "数字顺时针排列", pts: 1 },
      { id: "seq", label: "1～12 数字次序正确", pts: 1 },
      { id: "sym", label: "「12, 3, 6, 9」分不对称", pts: 2, tip: "按表 11-5 原文" },
      { id: "other8", label: "其他 8 个数字的位置", pts: 3 },
      { id: "hour", label: "时针指向正确", pts: 2 },
      { id: "minute", label: "分针指向正确", pts: 2 },
      { id: "longer", label: "分针比时针长", pts: 2 },
      { id: "arrow", label: "时针和分针都有箭头", pts: 2 },
    ],
  },
];

const CDT_DEFAULT_SCALE = "s10";

module.exports = { CDT_SCALES, CDT_DEFAULT_SCALE };
