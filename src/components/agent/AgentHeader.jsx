import { AGENT_THEME as T } from "./agentTheme";

function RobotIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="8" width="14" height="10" rx="3" fill="white" fillOpacity="0.95" />
      <circle cx="9.5" cy="13" r="1.3" fill={T.headerBg} />
      <circle cx="14.5" cy="13" r="1.3" fill={T.headerBg} />
      <path d="M10 16h4" stroke={T.headerBg} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M12 4v3" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="3" r="1.2" fill="white" />
    </svg>
  );
}

export default function AgentHeader({ title, onClose }) {
  return (
    <div
      style={{
        background: T.headerBg,
        color: T.headerText,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        borderRadius: "10px 10px 0 0",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: "rgba(255,255,255,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <RobotIcon />
        </div>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
      </div>
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        style={{
          background: "transparent", border: "none", color: "white",
          cursor: "pointer", padding: 4, lineHeight: 1,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}