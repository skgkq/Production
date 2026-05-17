import { useEffect, useRef } from "react";
import { AGENT_THEME as T } from "./agentTheme";

function formatReply(text) {
  return text.split("\n").map((line, i) => (
    <span key={i}>
      {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={j}>{part.slice(2, -2)}</strong>;
        }
        return part;
      })}
      {i < text.split("\n").length - 1 && <br />}
    </span>
  ));
}

export default function AgentMessageList({ messages, typing }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  if (!messages.length && !typing) return null;

  return (
    <div style={{
      maxHeight: 200,
      overflowY: "auto",
      padding: "12px 14px",
      borderBottom: `1px solid ${T.faqDivider}`,
      background: T.panelBg,
    }}>
      {messages.map(msg => (
        <div
          key={msg.id}
          style={{
            display: "flex",
            justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            marginBottom: 10,
          }}
        >
          <div style={{
            maxWidth: "88%",
            padding: "8px 12px",
            borderRadius: msg.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
            fontSize: 13,
            lineHeight: 1.5,
            color: T.text,
            background: msg.role === "user" ? T.userBubble : T.botBubble,
            border: `1px solid ${msg.role === "user" ? T.userBubbleBorder : T.botBubbleBorder}`,
            whiteSpace: "pre-wrap",
          }}>
            {formatReply(msg.content)}
          </div>
        </div>
      ))}
      {typing && (
        <div style={{ fontSize: 12, color: T.textMuted, padding: "4px 0" }}>
          正在输入…
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
