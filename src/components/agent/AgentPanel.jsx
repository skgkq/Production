import AgentHeader from "./AgentHeader";
import AgentFAQList from "./AgentFAQList";
import AgentMessageList from "./AgentMessageList";
import AgentInput from "./AgentInput";
import { AGENT_FAQ } from "./agentKnowledge";
import { AGENT_THEME as T } from "./agentTheme";

export default function AgentPanel({
  open,
  title = "智能客服助手",
  messages,
  typing,
  onClose,
  onSend,
  faqItems = AGENT_FAQ,
}) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label={title}
      style={{
        position: "fixed",
        right: 24,
        bottom: 92,
        width: T.width,
        height: T.height,
        background: T.panelBg,
        borderRadius: 10,
        boxShadow: T.panelShadow,
        border: `1px solid ${T.panelBorder}`,
        display: "flex",
        flexDirection: "column",
        zIndex: T.zIndex,
        overflow: "hidden",
        animation: "agentPanelIn 0.22s ease-out",
      }}
    >
      <style>{`
        @keyframes agentPanelIn {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <AgentHeader title={title} onClose={onClose} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
        <AgentMessageList messages={messages} typing={typing} />
        <AgentFAQList
          items={faqItems}
          onSelect={onSend}
          disabled={typing}
        />
      </div>
      <AgentInput
        onSend={onSend}
        disabled={typing}
        placeholder="很高兴为您服务，请描述您的问题"
      />
    </div>
  );
}
