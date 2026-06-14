import { Card } from "antd";
import { DAYS_ZH } from "../scheduler/shift.js";

function formatTime(t) {
  const day = Math.floor(t / 24);
  const h = Math.floor(t % 24);
  const m = Math.round((t % 1) * 60);
  return `${DAYS_ZH[day] || `D${day + 1}`} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function GanttByRoom({ events, cst, collapseGroup }) {
  if (!events.length) return null;

  const shiftLen = cst.shiftEnd - cst.shiftStart;
  const maxT = events.reduce((mx, e) => Math.max(mx, e.end), 0);
  const totalDays = Math.min(cst.workDays, Math.ceil(maxT / 24) + 1);

  const toX = t => {
    const day = Math.floor(t / 24);
    const h = t % 24;
    const dh = Math.max(0, Math.min(h, cst.shiftEnd) - cst.shiftStart);
    return day * shiftLen + dh;
  };

  const activeRooms = cst.roomList.filter(r => events.some(e => e.room === r));
  const PX = 44, ROW = 40, LBL = 80, HDR = 44, PAD = 12;
  const W = LBL + totalDays * shiftLen * PX + PAD;
  const H = HDR + activeRooms.length * ROW + 4;

  let displayEvents = events;
  if (collapseGroup) {
    const grouped = {};
    for (const e of events) {
      const key = `${e.room}|${e.opGroup || e.opName}|${e.batchLabel}`;
      if (!grouped[key]) {
        grouped[key] = { ...e, start: e.start, end: e.end, opName: e.opGroup || e.opName };
      } else {
        grouped[key].start = Math.min(grouped[key].start, e.start);
        grouped[key].end = Math.max(grouped[key].end, e.end);
      }
    }
    displayEvents = Object.values(grouped);
  }

  return (
    <Card size="small" bodyStyle={{ padding: 0 }}>
      <div style={{ overflowX: "auto" }}>
        <svg width={W} height={H} style={{ display: "block", background: "#fafafa" }}>
          {Array.from({ length: totalDays }, (_, d) => (
            <g key={d}>
              <rect
                x={LBL + d * shiftLen * PX} y={0} width={shiftLen * PX} height={H}
                fill={d % 2 === 0 ? "#fafafa" : "#f5f5f5"}
              />
              <line
                x1={LBL + d * shiftLen * PX} y1={0} x2={LBL + d * shiftLen * PX} y2={H}
                stroke="#d9d9d9" strokeWidth={1}
              />
              <text
                x={LBL + (d + 0.5) * shiftLen * PX} y={14} textAnchor="middle"
                fontSize={11} fontWeight={600} fill="#434343" fontFamily="sans-serif"
              >
                {DAYS_ZH[d] || `D${d + 1}`}
              </text>
            </g>
          ))}

          {Array.from({ length: totalDays }, (_, d) =>
            Array.from({ length: shiftLen + 1 }, (_, h) => (
              <g key={`${d}-${h}`}>
                <line
                  x1={LBL + (d * shiftLen + h) * PX} y1={26}
                  x2={LBL + (d * shiftLen + h) * PX} y2={H}
                  stroke={h === 0 ? "#bfbfbf" : "#f0f0f0"} strokeWidth={1}
                />
                {h < shiftLen && (
                  <text
                    x={LBL + (d * shiftLen + h) * PX + 2} y={24}
                    fontSize={9} fill="#8c8c8c" fontFamily="monospace"
                  >
                    {String(cst.shiftStart + h).padStart(2, "0")}
                  </text>
                )}
              </g>
            ))
          )}

          <line x1={0} y1={HDR} x2={W} y2={HDR} stroke="#d9d9d9" strokeWidth={1} />

          {activeRooms.map((room, ri) => {
            const y = HDR + ri * ROW;
            return (
              <g key={room}>
                {ri > 0 && <line x1={0} y1={y} x2={W} y2={y} stroke="#f0f0f0" strokeWidth={1} />}
                <rect x={0} y={y} width={LBL} height={ROW} fill="#fafafa" />
                <line x1={LBL} y1={y} x2={LBL} y2={y + ROW} stroke="#f0f0f0" strokeWidth={1} />
                <text
                  x={LBL - 8} y={y + ROW / 2 + 4} textAnchor="end"
                  fontSize={11} fontWeight={600} fill="#262626" fontFamily="sans-serif"
                >
                  R{room}
                </text>

                {displayEvents.filter(e => e.room === room).map((evt, ei) => {
                  const x1 = LBL + toX(evt.start) * PX;
                  const x2 = LBL + toX(evt.end) * PX;
                  const bw = Math.max(x2 - x1 - 2, 2);
                  const label = evt.opGroup && !collapseGroup
                    ? `${evt.opGroup}·${evt.opName}`
                    : evt.opName;
                  return (
                    <g key={ei}>
                      <rect
                        x={x1 + 1} y={y + 4} width={bw} height={ROW - 8}
                        fill={evt.color} opacity={0.92} rx={2}
                        stroke="#fff" strokeWidth={0.5}
                      />
                      {bw > 28 && (
                        <text
                          x={x1 + bw / 2 + 1} y={y + ROW / 2 + 1} textAnchor="middle"
                          fontSize={9} fontWeight={600} fontFamily="sans-serif" fill="#fff"
                        >
                          {label}
                        </text>
                      )}
                      {bw > 52 && (
                        <text
                          x={x1 + bw / 2 + 1} y={y + ROW / 2 + 11} textAnchor="middle"
                          fontSize={8} fontFamily="sans-serif" fill="rgba(255,255,255,0.9)"
                        >
                          {evt.batchLabel}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </Card>
  );
}

export { formatTime };
