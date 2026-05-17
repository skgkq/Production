import { AGENT_THEME as T } from "./agentTheme";

export default function AgentFAQList({ items, onSelect, disabled }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", background: T.panelBg }}>
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(item.question)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            border: "none",
            borderBottom: i < items.length - 1 ? `1px solid ${T.faqDivider}` : "none",
            background: T.panelBg,
            cursor: disabled ? "not-allowed" : "pointer",
            textAlign: "left",
            opacity: disabled ? 0.6 : 1,
            transition: "background 0.15s",
          }}
          onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = T.faqHover; }}
          onMouseLeave={e => { e.currentTarget.style.background = T.panelBg; }}
        >
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: T.faqBullet, flexShrink: 0,
          }} />
          <span style={{ flex: 1, fontSize: 13, color: T.textSecondary, lineHeight: 1.45 }}>
            {item.question}
          </span>
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none" style={{ flexShrink: 0 }}>
            <path d="M1 1l6 6-6 6" stroke={T.faqChevron} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ))}
    </div>
  );
}
