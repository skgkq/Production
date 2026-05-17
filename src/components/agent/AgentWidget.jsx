import { useState, useMemo } from "react";
import AgentFab from "./AgentFab";
import AgentPanel from "./AgentPanel";
import { useAgentChat } from "./useAgentChat";

const TAB_LABELS = {
  plan: "本周计划",
  types: "型号配置",
  cst: "约束参数",
  result: "排产结果",
};

/**
 * 智能客服浮窗 — 可嵌入任意页面
 * @param {Object} props
 * @param {string} [props.title]
 * @param {Object} [props.context] 业务上下文 { algo, tab, hasEvents }
 * @param {(text: string, ctx: Object) => Promise<string>} [props.onSend] 自定义 AI 回复
 * @param {Array} [props.faqItems] 自定义 FAQ 列表
 */
export default function AgentWidget({
  title = "智能客服助手",
  context: contextProp,
  onSend,
  faqItems,
}) {
  const [open, setOpen] = useState(false);

  const context = useMemo(() => {
    if (!contextProp) return {};
    return {
      ...contextProp,
      tab: TAB_LABELS[contextProp.tab] || contextProp.tab,
    };
  }, [contextProp]);

  const { messages, typing, sendMessage } = useAgentChat({ context, onSend });

  const handleToggle = () => setOpen(v => !v);
  const handleClose = () => setOpen(false);

  return (
    <>
      <AgentPanel
        open={open}
        title={title}
        messages={messages}
        typing={typing}
        onClose={handleClose}
        onSend={sendMessage}
        faqItems={faqItems}
      />
      <AgentFab open={open} onClick={handleToggle} />
    </>
  );
}
