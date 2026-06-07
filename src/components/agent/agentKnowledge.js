/** 常见问题与规则回复（可后续替换为真实 LLM API） */

export const AGENT_FAQ = [
  { id: "faq-1", question: "如何生成排产计划？" },
  { id: "faq-2", question: "启发式算法和 HGNN+PPO 有什么区别？" },
  { id: "faq-3", question: "动态重排怎么用？会换算法吗？" },
  { id: "faq-4", question: "如何设置班次与午休约束？" },
  { id: "faq-5", question: "甘特图里黄色虚线框是什么意思？" },
  { id: "faq-6", question: "物料不足时系统会怎么处理？" },
  { id: "faq-7", question: "如何新增型号和工序？" },
  { id: "faq-8", question: "如何导出工单 PDF？" },
];

const FAQ_ANSWERS = {
  "faq-1": `生成排产步骤：
1. 在「本周计划」录入任务（型号、批次、优先级）
2. 在「型号配置」确认各工序工时与设备
3. 在「约束参数」设置人员、库存、班次
4. 顶部选择调度算法，点击「▶ 生成排产」
5. 自动跳转到「排产结果」查看甘特图或工单表`,

  "faq-2": `两种算法说明：
• **启发式算法**：前端本地计算，按优先级逐批安排工序，速度快，适合日常试排。
• **HGNN+PPO**：调用后端智能求解（需启动 \`python server.py\`），在柔性作业车间模型上优化设备分配与顺序，再映射到班次时间轴。
切换算法后需重新点击「生成排产」。`,

  "faq-3": `动态重排用于插单、设备故障等突发情况：
1. 在「排产结果」点击「🔄 动态重排」
2. 设置重排基准时刻（NOW 线）、可选故障窗口与新插单
3. 已完成/进行中的工序会冻结，未开始的工序重新安排

**算法一致性**：若当前选的是 HGNN+PPO，动态重排同样走后端智能重排；若为启发式，则走前端启发式重排。`,

  "faq-4": `在「约束参数」页可设置：
• **班次**：上班开始/结束时间（如 9:00–18:00）
• **午休**：午休起止时间（如 12:00–13:00）
• **计划天数**：本周覆盖的工作日数
排产时工序会自动跳过非工作时段与午休。`,

  "faq-5": `甘特图图例含义：
• 🔒 **实线块**：已完成或进行中被冻结的工序
• 🟡 **黄色虚线框**：动态重排后新安排的工序
• 红色 **NOW** 竖线：上次动态重排的基准时刻`,

  "faq-6": `点击「生成排产」前会校验原料 A/B、脱模剂库存。若不足，系统弹窗提示具体缺口并**阻止排产**，需先在「约束参数」调高库存或减少批次后再试。`,

  "faq-7": `在「型号配置」页：
• 点击「+ 新增型号」添加产品
• 每个型号可配置多道工序（设备、工时、清洗、AGV、用料等）
• 在「本周计划」的任务行中选择对应型号即可使用`,

  "faq-8": `生成排产后，在「排产结果」页点击「📄 导出 PDF」即可下载工单排程表，包含批次、工序、设备、起止时间等信息。`,
};

const KEYWORD_RULES = [
  { keys: ["启发式", "贪心", "greedy"], reply: FAQ_ANSWERS["faq-2"] },
  { keys: ["hgnn", "ppo", "智能"], reply: FAQ_ANSWERS["faq-2"] },
  { keys: ["重排", "插单", "故障", "动态"], reply: FAQ_ANSWERS["faq-3"] },
  { keys: ["班次", "午休", "上班", "约束"], reply: FAQ_ANSWERS["faq-4"] },
  { keys: ["甘特", "黄色", "虚线", "冻结", "now"], reply: FAQ_ANSWERS["faq-5"] },
  { keys: ["物料", "库存", "原料", "脱模"], reply: FAQ_ANSWERS["faq-6"] },
  { keys: ["型号", "工序", "配置"], reply: FAQ_ANSWERS["faq-7"] },
  { keys: ["pdf", "导出", "工单"], reply: FAQ_ANSWERS["faq-8"] },
  { keys: ["生成", "排产", "计划", "怎么"], reply: FAQ_ANSWERS["faq-1"] },
];

const DEFAULT_REPLY = `感谢您的提问。我是排产系统智能助手，可解答：
• 生成排产、算法选择
• 动态重排与甘特图
• 约束参数、型号配置
• 物料校验与 PDF 导出

请点击下方常见问题，或用更具体的关键词描述您的问题。`;

function contextHint(context) {
  if (!context) return "";
  const parts = [];
  if (context.algo === "hgnn-ppo") parts.push("当前算法：HGNN+PPO 智能调度");
  else if (context.algo === "greedy") parts.push("当前算法：启发式算法");
  if (context.tab) parts.push(`当前页面：${context.tab}`);
  if (context.hasEvents) parts.push("已有排产结果");
  return parts.length ? `\n\n（系统上下文：${parts.join(" · ")}）` : "";
}

export function getAgentReply(text, context) {
  const q = (text || "").trim();
  if (!q) return DEFAULT_REPLY;

  const faq = AGENT_FAQ.find(f => f.question === q);
  if (faq && FAQ_ANSWERS[faq.id]) {
    return FAQ_ANSWERS[faq.id] + contextHint(context);
  }

  const lower = q.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.keys.some(k => lower.includes(k.toLowerCase()) || q.includes(k))) {
      return rule.reply + contextHint(context);
    }
  }

  return DEFAULT_REPLY + contextHint(context);
}
