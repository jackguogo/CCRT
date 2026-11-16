// bnt-data.js —— 波士顿命名测验（BNT）30 幅图与测验参数
// 项目顺序、编号与《波士顿命名测验记录单》一致（1、3、5 … 59 共 30 项）；
// 语义提示取记录单括号内的提示语原文；语音提示由主试给首字发音，不写死提示词。
// 图片素材：web/assets/bnt/bnt-01.png … bnt-30.png（按记录单顺序切自标准图册）。

const BNT_ITEMS = [
  { no: 1,  name: "床",        hint: "一种家具",           img: "/assets/bnt/bnt-01.png" },
  { no: 3,  name: "铅笔",      hint: "用来写字",           img: "/assets/bnt/bnt-02.png" },
  { no: 5,  name: "哨子",      hint: "用来吹的",           img: "/assets/bnt/bnt-03.png" },
  { no: 7,  name: "梳子",      hint: "整理头发用的",       img: "/assets/bnt/bnt-04.png" },
  { no: 9,  name: "锯子",      hint: "木匠用的",           img: "/assets/bnt/bnt-05.png" },
  { no: 11, name: "直升机",    hint: "飞行工具",           img: "/assets/bnt/bnt-06.png" },
  { no: 13, name: "章鱼",      hint: "一种海洋生物",       img: "/assets/bnt/bnt-07.png" },
  { no: 15, name: "衣架",      hint: "放在衣橱里的",       img: "/assets/bnt/bnt-08.png" },
  { no: 17, name: "骆驼",      hint: "一种动物",           img: "/assets/bnt/bnt-09.png" },
  { no: 19, name: "包子",      hint: "一种食物",           img: "/assets/bnt/bnt-10.png" },
  { no: 21, name: "球拍",      hint: "体育用品",           img: "/assets/bnt/bnt-11.png" },
  { no: 23, name: "火山",      hint: "一种山",             img: "/assets/bnt/bnt-12.png" },
  { no: 25, name: "飞镖",      hint: "用来投掷的",         img: "/assets/bnt/bnt-13.png" },
  { no: 27, name: "地球仪",    hint: "一种地图",           img: "/assets/bnt/bnt-14.png" },
  { no: 29, name: "海狸",      hint: "一种动物",           img: "/assets/bnt/bnt-15.png" },
  { no: 31, name: "犀牛",      hint: "一种动物",           img: "/assets/bnt/bnt-16.png" },
  { no: 33, name: "圆顶冰屋",  hint: "一种房子",           img: "/assets/bnt/bnt-17.png" },
  { no: 35, name: "多米诺骨牌", hint: "一种游戏",          img: "/assets/bnt/bnt-18.png" },
  { no: 37, name: "自动扶梯",  hint: "站在上面可以上升",   img: "/assets/bnt/bnt-19.png" },
  { no: 39, name: "吊床",      hint: "你可以躺在上面",     img: "/assets/bnt/bnt-20.png" },
  { no: 41, name: "鹈鹕",      hint: "一种鸟",             img: "/assets/bnt/bnt-21.png" },
  { no: 43, name: "金字塔",    hint: "建在埃及",           img: "/assets/bnt/bnt-22.png" },
  { no: 45, name: "独角兽",    hint: "神话动物",           img: "/assets/bnt/bnt-23.png" },
  { no: 47, name: "手风琴",    hint: "一种乐器",           img: "/assets/bnt/bnt-24.png" },
  { no: 49, name: "芦笋",      hint: "一种食物",           img: "/assets/bnt/bnt-25.png" },
  { no: 51, name: "门闩",      hint: "门上的一部分",       img: "/assets/bnt/bnt-26.png" },
  { no: 53, name: "卷轴",      hint: "一种文件",           img: "/assets/bnt/bnt-27.png" },
  { no: 55, name: "狮身人面像", hint: "建在埃及",          img: "/assets/bnt/bnt-28.png" },
  { no: 57, name: "花棚",      hint: "应用于花园里",       img: "/assets/bnt/bnt-29.png" },
  { no: 59, name: "量角器",    hint: "测量角度",           img: "/assets/bnt/bnt-30.png" },
];

const BNT_CFG = {
  seconds: 20,      // 每次回答时限
  cutoff: 24,       // 判读界值：> 24 分为正常
  max: 30,          // 总分 = 无提示正确数 + 语义提示后正确数
  items: BNT_ITEMS,
};

module.exports = { BNT_ITEMS, BNT_CFG };
