import { useState } from "react";
import { AGENT_THEME as T } from "./agentTheme";

export default function AgentInput({ onSend, disabled, placeholder }) {
  const [text, setText] = useState("");

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSend(text);
    setText("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{
      padding: "12px 14px 14px",
      background: T.inputBg,
      borderTop: `1px solid ${T.faqDivider}`,
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          style={{ marginTop: 10, flexShrink: 0, opacity: 0.45 }}>
          <path
            d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3 8.2 13.9 2 9.4h7.6z"
            stroke={T.textMuted}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={3}
          style={{
            flex: 1,
            resize: "none",
            border: `1px solid ${T.inputBorder}`,
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
            lineHeight: 1.5,
            fontFamily: "inherit",
            background: T.inputFieldBg,
            color: T.text,
            outline: "none",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          style={{
            padding: "7px 22px",
            fontSize: 13,
            fontWeight: 600,
            color: disabled || !text.trim() ? T.sendBtnTextDisabled : T.sendBtnText,
            background: disabled || !text.trim() ? T.sendBtnBgDisabled : T.sendBtnBg,
            border: `1px solid ${disabled || !text.trim() ? T.sendBtnBorder : T.accent}`,
            borderRadius: 8,
            cursor: disabled || !text.trim() ? "not-allowed" : "pointer",
            boxShadow: disabled || !text.trim() ? "none" : "0 1px 2px rgba(37,99,235,.25)",
            transition: "background 0.15s, border-color 0.15s",
          }}
          onMouseEnter={e => {
            if (!disabled && text.trim()) e.currentTarget.style.background = T.accentHover;
          }}
          onMouseLeave={e => {
            if (!disabled && text.trim()) e.currentTarget.style.background = T.sendBtnBg;
          }}
        >
          发送
        </button>
      </div>
    </div>
  );
}
