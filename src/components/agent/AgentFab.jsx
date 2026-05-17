import { AGENT_THEME as T } from "./agentTheme";

function ChatSparkleIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <path
        d="M8 6.5c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2v9.5c0 1.1-.9 2-2 2h-3.2l-2.8 2.4c-.6.5-1.5.1-1.5-.7V17.5H10c-1.1 0-2-.9-2-2V6.5z"
        fill="white"
        fillOpacity="0.95"
      />
      <rect x="10.5" y="9" width="7" height="1.6" rx="0.8" fill="#1d4ed8" fillOpacity="0.35" />
      <rect x="10.5" y="12.2" width="5" height="1.6" rx="0.8" fill="#1d4ed8" fillOpacity="0.35" />
      <path
        d="M19.5 17.5l1.2 2.4 2.6.4-1.9 1.8.45 2.6-2.35-1.2-2.35 1.2.45-2.6-1.9-1.8 2.6-.4z"
        fill="white"
      />
    </svg>
  );
}

export default function AgentFab({ open, onClick, style }) {
  return (
    <button
      type="button"
      aria-label={open ? "关闭智能助手" : "打开智能助手"}
      aria-expanded={open}
      onClick={onClick}
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        width: T.fabSize,
        height: T.fabSize,
        borderRadius: "50%",
        border: "none",
        cursor: "pointer",
        background: T.fabGradient,
        boxShadow: T.fabShadow,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: T.zIndex,
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        transform: open ? "scale(0.92)" : "scale(1)",
        ...style,
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = open ? "scale(0.92)" : "scale(1.06)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = open ? "scale(0.92)" : "scale(1)"; }}
    >
      {open ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      ) : (
        <ChatSparkleIcon />
      )}
    </button>
  );
}
