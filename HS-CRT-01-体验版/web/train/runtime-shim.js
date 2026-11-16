/* runtime-shim.js —— 单关卡独立页面的运行时补丁
   说明：train/*.html 是把 patient.html 内嵌的 Games 引擎（games.js）与单关卡外壳拼装成的独立可玩页。
   引擎依赖 patient.html 的若干全局，外壳已补齐大部分，但以下两个在抽取时遗漏，导致点击“开始训练”时报
   "$ is not defined" / "GOAL is not defined"。本文件仅做最小补齐，不改动引擎与外壳逻辑。 */
window.$ = function (sel) { return document.querySelector(sel); };
window.GOAL = window.GOALS;
