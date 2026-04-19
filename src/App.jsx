import { useState, useMemo } from "react";

// ══════════════════════════════════════════════════════════════════
//  一号线日/周排产系统  v3
//  一台混合锅 · 多型号 · 班次约束 · 换产/清洗/AGV约束 · 工单输出
// ══════════════════════════════════════════════════════════════════

const PALETTE = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6",
                 "#ec4899","#06b6d4","#84cc16","#f43f5e","#a78bfa"];
const DAYS_ZH = ["周一","周二","周三","周四","周五","周六","周日"];
const EQ_ORDER = ["称量台","搅拌机","混合锅","成型台","整装区"];
const CLEAN_COL = "#94a3b8";

let _uid = 0;
const uid = () => `i${++_uid}`;

// ─── Default product types (型号) ────────────────────────────────
const DEFAULT_TYPES = [
  {
    id:"pt1", code:"A型", color:PALETTE[0],
    ops:[
      {id:"a1",name:"称量",    eq:"称量台",  dur:0.5, workers:1, cleanDur:0, agv:0, matA:25,  matB:10, release:0},
      {id:"a2",name:"预混",    eq:"搅拌机",  dur:1.0, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0},
      {id:"a3",name:"混合",    eq:"混合锅",  dur:3.0, workers:1, cleanDur:1, agv:0, isMix:true, matA:0, matB:0, release:0},
      {id:"a4",name:"模具装配",eq:"成型台",  dur:1.0, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0.2},
      {id:"a5",name:"成型",    eq:"成型台",  dur:4.0, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0},
      {id:"a6",name:"整装",    eq:"整装区",  dur:1.0, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0},
    ],
  },
  {
    id:"pt2", code:"B型", color:PALETTE[1],
    ops:[
      {id:"b1",name:"称量",    eq:"称量台",  dur:0.5, workers:1, cleanDur:0, agv:0, matA:25,  matB:10, release:0},
      {id:"b2",name:"预混",    eq:"搅拌机",  dur:1.5, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0},
      {id:"b3",name:"混合",    eq:"混合锅",  dur:4.0, workers:1, cleanDur:1, agv:0, isMix:true, matA:0, matB:0, release:0},
      {id:"b4",name:"模具装配",eq:"成型台",  dur:1.0, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0.2},
      {id:"b5",name:"成型",    eq:"成型台",  dur:5.0, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0},
      {id:"b6",name:"整装",    eq:"整装区",  dur:1.0, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0},
    ],
  },
  {
    id:"pt3", code:"C型", color:PALETTE[2],
    ops:[
      {id:"c1",name:"称量",    eq:"称量台",  dur:0.5, workers:1, cleanDur:0, agv:0, matA:25,  matB:10, release:0},
      {id:"c2",name:"预混",    eq:"搅拌机",  dur:1.0, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0},
      {id:"c3",name:"混合",    eq:"混合锅",  dur:2.5, workers:1, cleanDur:1, agv:0, isMix:true, matA:0, matB:0, release:0},
      {id:"c4",name:"模具装配",eq:"成型台",  dur:0.5, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0.2},
      {id:"c5",name:"成型",    eq:"成型台",  dur:3.0, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0},
      {id:"c6",name:"整装",    eq:"整装区",  dur:0.5, workers:1, cleanDur:0, agv:0, matA:0,   matB:0,  release:0},
    ],
  },
];

// ─── Default weekly plan ─────────────────────────────────────────
const DEFAULT_PLAN = [
  {id:"t1", typeId:"pt1", batches:1, priority:1, note:""},
  {id:"t2", typeId:"pt2", batches:1, priority:2, note:""},
];

// ─── Default constraints ─────────────────────────────────────────
const DEFAULT_CST = {
  totalWorkers   : 4,     // 可用人员总数
  stockMatA      : 200,   // 原料A库存
  stockMatB      : 80,    // 原料B库存
  stockRelease   : 10,    // 脱模剂库存
  shiftStart     : 9,     // 早班开始 09:00
  shiftEnd       : 18,    // 班次结束 18:00
  lunchStart     : 12,    // 午休开始
  lunchEnd       : 13,    // 午休结束
  workDays       : 5,     // 排产天数
};

// ══════════════════════════════════════════════════════════════════
//  Scheduler Core
// ══════════════════════════════════════════════════════════════════

// t = 以"本周一 00:00"为原点的绝对小时数
// 返回 >= t 的最早可工作时刻（跳过非班次时间和午休）
function nextWorkStart(t, cst) {
  for (let i = 0; i < 500; i++) {
    if (t >= cst.workDays * 24) return Infinity;
    const day = Math.floor(t / 24), h = t % 24;
    if (h < cst.shiftStart) { t = day * 24 + cst.shiftStart; continue; }
    if (h >= cst.shiftEnd)  { t = (day + 1) * 24 + cst.shiftStart; continue; }
    // 午休时段跳过
    if (h >= cst.lunchStart && h < cst.lunchEnd) { t = day * 24 + cst.lunchEnd; continue; }
    return t;
  }
  return Infinity;
}

// 检查 [start, start+dur) 是否跨越午休，若跨越返回false
function fitsWithoutLunch(start, dur, cst) {
  const day = Math.floor(start / 24);
  const ls = day * 24 + cst.lunchStart;
  const le = day * 24 + cst.lunchEnd;
  const end = start + dur;
  // 如果工序时间段和午休有重叠则不行
  if (start < le && end > ls) return false;
  return true;
}

function findSlot(tl, minStart, dur, cst, workerTl, workers) {
  let t = nextWorkStart(minStart, cst);

  for (let iter = 0; iter < 50000; iter++) {
    if (t === Infinity) return Infinity;
    t = nextWorkStart(t, cst);
    if (t === Infinity) return Infinity;

    // Must fit within same shift (before shift end)
    const dayBase = Math.floor(t / 24) * 24;
    const shiftEnd = dayBase + cst.shiftEnd;
    if (t + dur > shiftEnd) { t = nextWorkStart(shiftEnd, cst); continue; }

    // Must not cross lunch break
    if (!fitsWithoutLunch(t, dur, cst)) {
      t = dayBase + cst.lunchEnd;
      continue;
    }

    // Check no overlap with existing timeline blocks on this equipment
    const clash = (tl || []).find(s => s.start < t + dur && s.end > t);
    if (clash) { t = nextWorkStart(clash.end, cst); continue; }

    // Check worker availability: count concurrent workers in [t, t+dur)
    const maxConcurrent = peakWorkers(workerTl, t, t + dur);
    if (maxConcurrent + workers > cst.totalWorkers) {
      // Find next moment when a worker is freed
      const overlapping = workerTl.filter(s => s.start < t + dur && s.end > t);
      const nextFree = Math.min(...overlapping.map(s => s.end));
      t = nextWorkStart(nextFree, cst);
      continue;
    }

    return t;
  }
  return Infinity;
}

// 计算 [start, end) 时间段内的峰值并发人数
function peakWorkers(workerTl, start, end) {
  let max = 0;
  // 收集所有在范围内的时间点
  const points = new Set();
  for (const s of workerTl) {
    if (s.end <= start || s.start >= end) continue;
    points.add(Math.max(s.start, start));
    points.add(s.end);
  }
  for (const pt of points) {
    if (pt >= end) continue;
    let sum = 0;
    for (const s of workerTl) {
      if (s.start <= pt && s.end > pt) sum += s.workers;
    }
    if (sum > max) max = sum;
  }
  return max;
}

function runSchedule(plan, types, cst) {
  const tls  = {};   // eq → [{start,end}]
  const workerTl = []; // global worker timeline [{start,end,workers}]
  const addTL = (eq, start, end, workers) => {
    if (!tls[eq]) tls[eq] = [];
    tls[eq].push({ start, end });
    tls[eq].sort((a, b) => a.start - b.start);
    if (workers > 0) {
      workerTl.push({ start, end, workers });
    }
  };

  // Expand plan → sorted batch list
  const batches = [];
  let woCnt = 1;
  for (const task of [...plan].sort((a, b) => a.priority - b.priority)) {
    const pt = types.find(t => t.id === task.typeId);
    if (!pt) continue;
    for (let b = 0; b < task.batches; b++) {
      batches.push({ task, pt, batchNum: b + 1, wo: woCnt++ });
    }
  }

  const events = [];

  for (const batch of batches) {
    let prevEnd = 0;

    for (let i = 0; i < batch.pt.ops.length; i++) {
      const op = batch.pt.ops[i];
      const totalDur = op.dur + (op.cleanDur || 0) + (op.agv || 0);   // 工序总时长 = 加工 + 清洗 + AGV运输

      let minS = prevEnd;

      const start = findSlot(tls[op.eq], minS, totalDur, cst, workerTl, op.workers);
      const end   = start + totalDur;

      const extras = [op.cleanDur > 0 && `清洗${op.cleanDur}h`, op.agv > 0 && `AGV${op.agv}h`].filter(Boolean);
      const opLabel = op.name + (extras.length ? `(含${extras.join("+")})` : "");

      events.push({
        wo: `WO-${String(batch.wo).padStart(3, "0")}`,
        batchLabel: `${batch.pt.code}-批${batch.batchNum}`,
        batchNum: batch.batchNum,
        ptId: batch.pt.id, ptCode: batch.pt.code, ptColor: batch.pt.color,
        opName: opLabel,
        opIdx: i,
        eq: op.eq, start, end, dur: totalDur, workers: op.workers,
        isCleaning: false,
        note: batch.task.note,
      });
      addTL(op.eq, start, end, op.workers);
      prevEnd = end;
    }
  }

  return events.sort((a, b) => a.start - b.start);
}

// ══════════════════════════════════════════════════════════════════
//  Display Helpers
// ══════════════════════════════════════════════════════════════════

function fmtTime(t) {
  if (t == null || t === Infinity) return "—";
  const day = Math.floor(t / 24);
  const h   = t % 24;
  const hh  = Math.floor(h), mm = Math.round((h % 1) * 60);
  const label = day < DAYS_ZH.length ? DAYS_ZH[day] : `第${day + 1}天`;
  return `${label} ${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
}

function fmtDur(h) {
  const hrs = Math.floor(h), mins = Math.round((h % 1) * 60);
  return mins ? `${hrs}h${mins}m` : `${hrs}h`;
}

// ══════════════════════════════════════════════════════════════════
//  Design System
// ══════════════════════════════════════════════════════════════════

const C = {
  bg:"#f1f5f9", surface:"#ffffff", border:"#e2e8f0", border2:"#cbd5e1",
  t0:"#0f172a", t1:"#334155", t2:"#64748b", t3:"#94a3b8",
  accent:"#2563eb", accentBg:"#eff6ff", accentBdr:"#bfdbfe",
  dn:"#059669", dnBg:"#ecfdf5", dnBdr:"#a7f3d0",
  warn:"#d97706", warnBg:"#fffbeb",
  danger:"#dc2626", dangerBg:"#fef2f2",
  sh:"0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04)",
};

const Card = ({children, style={}}) => (
  <div style={{background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,
    boxShadow:C.sh,...style}}>{children}</div>
);

const SecHead = ({color=C.t2,icon="",children,style={}}) => (
  <p style={{margin:"0 0 10px",fontSize:10,fontWeight:700,letterSpacing:"0.13em",
    textTransform:"uppercase",color,display:"flex",alignItems:"center",gap:5,...style}}>
    {icon&&<span>{icon}</span>}{children}
  </p>
);

const Badge = ({color,bg,children,style={}}) => (
  <span style={{display:"inline-flex",alignItems:"center",padding:"2px 8px",
    borderRadius:99,fontSize:11,fontWeight:600,whiteSpace:"nowrap",
    background:bg||color+"18",color,border:`1px solid ${color}33`,
    marginRight:3,...style}}>{children}</span>
);

const Btn = ({onClick,disabled,primary,children,style={}}) => (
  <button onClick={onClick} disabled={disabled}
    style={{padding:"6px 16px",borderRadius:7,border:`1px solid ${primary?C.accent:C.border2}`,
      cursor:disabled?"not-allowed":"pointer",fontSize:12,fontWeight:600,
      background:primary?`linear-gradient(135deg,${C.accent},#1d4ed8)`:C.surface,
      color:primary?"white":C.t1,boxShadow:primary?"0 1px 3px rgba(0,0,0,.15)":"none",
      opacity:disabled?0.5:1,...style}}>{children}</button>
);

const NumInput = ({value,onChange,min=0,max=99,step=0.5,unit="",style={}}) => (
  <div style={{display:"flex",alignItems:"center",gap:4}}>
    <input type="number" min={min} max={max} step={step} value={value}
      onChange={e=>onChange(+e.target.value)}
      style={{width:64,padding:"4px 7px",borderRadius:5,border:`1px solid ${C.border2}`,
        background:C.surface,color:C.t0,fontSize:12,textAlign:"center",
        fontFamily:"monospace",outline:"none",...style}}/>
    {unit&&<span style={{fontSize:11,color:C.t3}}>{unit}</span>}
  </div>
);

const Stepper = ({value,onChange,min=1,max=10,color=C.t0}) => (
  <div style={{display:"flex",alignItems:"center",gap:4}}>
    <button onClick={()=>onChange(Math.max(min,value-1))}
      style={{width:22,height:22,borderRadius:4,border:`1px solid ${C.border2}`,
        cursor:"pointer",background:C.surface,color:C.t2,fontSize:14,padding:0,
        display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
    <span style={{fontSize:14,fontWeight:700,color,fontFamily:"monospace",
      minWidth:26,textAlign:"center"}}>{value}</span>
    <button onClick={()=>onChange(Math.min(max,value+1))}
      style={{width:22,height:22,borderRadius:4,border:`1px solid ${C.border2}`,
        cursor:"pointer",background:C.surface,color:C.t2,fontSize:14,padding:0,
        display:"flex",alignItems:"center",justifyContent:"center"}}>＋</button>
  </div>
);

// ══════════════════════════════════════════════════════════════════
//  Gantt Chart (SVG, working-hours only on X-axis)
// ══════════════════════════════════════════════════════════════════

function GanttChart({events, cst}) {
  if (!events.length) return (
    <div style={{textAlign:"center",padding:60,color:C.t3}}>
      <div style={{fontSize:44,marginBottom:12}}>📊</div>
      <p style={{fontSize:14,color:C.t2}}>请先点击「生成排产」</p>
    </div>
  );

  const shiftLen = cst.shiftEnd - cst.shiftStart;
  const maxT = events.reduce((mx,e)=>Math.max(mx,e.end),0);
  const totalDays = Math.min(cst.workDays, Math.ceil(maxT/24)+1);

  // Convert absolute hour → compressed display X (skip non-working hours)
  const toX = t => {
    const day = Math.floor(t/24);
    const h   = t%24;
    const dh  = Math.max(0, Math.min(h, cst.shiftEnd) - cst.shiftStart);
    return day * shiftLen + dh;
  };

  const activeEqs = EQ_ORDER.filter(eq => events.some(e=>e.eq===eq));
  const PX=44, ROW=42, LBL=82, HDR=46, PAD=12;
  const W = LBL + totalDays*shiftLen*PX + PAD;
  const H = HDR + activeEqs.length*ROW + 4;

  return (
    <div style={{overflowX:"auto",borderRadius:8,border:`1px solid ${C.border}`}}>
      <svg width={W} height={H} style={{display:"block"}}>
        <rect x={0} y={0} width={W} height={H} fill="#f8fafc"/>

        {/* Day bands + headers */}
        {Array.from({length:totalDays},(_,d)=>(
          <g key={d}>
            <rect x={LBL+d*shiftLen*PX} y={0} width={shiftLen*PX} height={H}
              fill={d%2===0?"#f8fafc":"#f1f5f9"}/>
            <line x1={LBL+d*shiftLen*PX} y1={0} x2={LBL+d*shiftLen*PX} y2={H}
              stroke="#cbd5e1" strokeWidth={1.5}/>
            <text x={LBL+(d+0.5)*shiftLen*PX} y={15} textAnchor="middle"
              fontSize={11} fontWeight="700" fill={C.t1} fontFamily="sans-serif">
              {DAYS_ZH[d]||`D${d+1}`}
            </text>
          </g>
        ))}

        {/* Hour ticks */}
        {Array.from({length:totalDays},(_,d)=>
          Array.from({length:shiftLen+1},(_,h)=>(
            <g key={`${d}-${h}`}>
              <line x1={LBL+(d*shiftLen+h)*PX} y1={28} x2={LBL+(d*shiftLen+h)*PX} y2={H}
                stroke={h===0?"#94a3b8":"#e2e8f0"} strokeWidth={1}/>
              {h<shiftLen&&(
                <text x={LBL+(d*shiftLen+h)*PX+2} y={26}
                  fontSize={8} fill={C.t3} fontFamily="monospace">
                  {String(cst.shiftStart+h).padStart(2,"0")}
                </text>
              )}
            </g>
          ))
        )}

        {/* Header divider */}
        <line x1={0} y1={HDR} x2={W} y2={HDR} stroke="#cbd5e1" strokeWidth={1.5}/>

        {/* Equipment rows */}
        {activeEqs.map((eq,ri)=>{
          const y = HDR + ri*ROW;
          return (
            <g key={eq}>
              {ri>0&&<line x1={0} y1={y} x2={W} y2={y} stroke="#f1f5f9" strokeWidth={1}/>}
              <rect x={0} y={y} width={LBL} height={ROW} fill="#f8fafc"/>
              <line x1={LBL} y1={y} x2={LBL} y2={y+ROW} stroke="#e2e8f0" strokeWidth={1}/>
              <text x={LBL-8} y={y+ROW/2+4} textAnchor="end"
                fontSize={11} fontWeight="600" fill={C.t1} fontFamily="sans-serif">{eq}</text>

              {events.filter(e=>e.eq===eq).map((evt,ei)=>{
                const x1 = LBL + toX(evt.start)*PX;
                const x2 = LBL + toX(evt.end)*PX;
                const bw = Math.max(x2-x1-2, 2);
                const col = evt.isCleaning ? CLEAN_COL : evt.ptColor;
                const alpha = evt.isCleaning ? 0.35 : 0.88;
                return (
                  <g key={ei}>
                    <rect x={x1+1} y={y+5} width={bw} height={ROW-10}
                      fill={col} opacity={alpha} rx={3}/>
                    {bw>28&&(
                      <text x={x1+bw/2+1} y={y+ROW/2+2} textAnchor="middle"
                        fontSize={9} fontWeight="700" fontFamily="sans-serif"
                        fill={evt.isCleaning?C.t2:"white"}>
                        {evt.isCleaning?"🧹清洗":evt.opName}
                      </text>
                    )}
                    {bw>50&&!evt.isCleaning&&(
                      <text x={x1+bw/2+1} y={y+ROW/2+12} textAnchor="middle"
                        fontSize={8} fontFamily="sans-serif"
                        fill="rgba(255,255,255,0.85)">
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
  );
}

// ══════════════════════════════════════════════════════════════════
//  Work Order Table (工单)
// ══════════════════════════════════════════════════════════════════

function WorkOrderTable({events}) {
  if (!events.length) return (
    <div style={{textAlign:"center",padding:60,color:C.t3}}>
      <p style={{fontSize:14,color:C.t2}}>请先生成排产方案</p>
    </div>
  );

  return (
    <div style={{overflowX:"auto",borderRadius:8,border:`1px solid ${C.border}`}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead>
          <tr style={{background:"#f8fafc"}}>
            {["工单号","批次","工序","设备","计划开始","计划完成","工时","人员","备注"].map(h=>(
              <th key={h} style={{padding:"8px 10px",textAlign:"left",fontSize:10,fontWeight:700,
                textTransform:"uppercase",color:C.t3,borderBottom:`1px solid ${C.border}`,
                whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map((e,i)=>{
            const isCl = e.isCleaning;
            return (
              <tr key={i} style={{background:isCl?"#f8fafc":i%2===0?C.surface:"#fafafa",
                borderBottom:`1px solid ${C.border}`}}>
                <td style={{padding:"7px 10px",fontFamily:"monospace",color:C.t3,fontSize:11}}>
                  {e.wo}
                </td>
                <td style={{padding:"7px 10px"}}>
                  {!isCl&&<Badge color={e.ptColor}>{e.batchLabel}</Badge>}
                  {isCl&&<span style={{fontSize:11,color:C.t3}}>{e.batchLabel}</span>}
                </td>
                <td style={{padding:"7px 10px"}}>
                  <span style={{fontWeight:isCl?400:600,color:isCl?C.t3:C.t0,
                    display:"flex",alignItems:"center",gap:4}}>
                    {isCl&&<span style={{fontSize:12}}>🧹</span>}
                    {e.opName}
                  </span>
                </td>
                <td style={{padding:"7px 10px",color:C.t1}}>{e.eq}</td>
                <td style={{padding:"7px 10px",fontFamily:"monospace",color:C.accent,fontSize:11}}>
                  {fmtTime(e.start)}
                </td>
                <td style={{padding:"7px 10px",fontFamily:"monospace",color:C.accent,fontSize:11}}>
                  {fmtTime(e.end)}
                </td>
                <td style={{padding:"7px 10px",fontFamily:"monospace",color:C.t1}}>
                  {fmtDur(e.dur)}
                </td>
                <td style={{padding:"7px 10px",color:C.t1}}>
                  {e.workers}人
                </td>
                <td style={{padding:"7px 10px",color:C.t3,fontSize:11}}>
                  {e.note||"—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  App
// ══════════════════════════════════════════════════════════════════

export default function App() {
  const [types,  setTypes]  = useState(DEFAULT_TYPES);
  const [plan,   setPlan]   = useState(DEFAULT_PLAN);
  const [cst,    setCst]    = useState(DEFAULT_CST);
  const [events, setEvents] = useState([]);
  const [tab,    setTab]    = useState("plan");       // plan | types | cst | result
  const [view,   setView]   = useState("gantt");      // gantt | workorder
  const [algo,   setAlgo]   = useState("greedy");     // greedy | hgnn-ppo
  const [loading, setLoading] = useState(false);
  const [openType, setOpenType] = useState({pt1:true});

  const typeMap = useMemo(()=>Object.fromEntries(types.map(t=>[t.id,t])),[types]);

  const generate = async () => {
    // 验证物料库存
    let needA = 0, needB = 0, needR = 0;
    for (const task of plan) {
      const pt = typeMap[task.typeId];
      if (!pt) continue;
      for (const op of pt.ops) {
        needA += (op.matA || 0) * task.batches;
        needB += (op.matB || 0) * task.batches;
        needR += (op.release || 0) * task.batches;
      }
    }
    const shortage = [];
    if (needA > cst.stockMatA) shortage.push(`原料A（需${needA}，库存${cst.stockMatA}）`);
    if (needB > cst.stockMatB) shortage.push(`原料B（需${needB}，库存${cst.stockMatB}）`);
    if (needR > cst.stockRelease) shortage.push(`脱模剂（需${needR}，库存${cst.stockRelease}）`);
    if (shortage.length) {
      alert("物料不足！\n" + shortage.join("\n"));
      return;
    }

    if (algo === "greedy") {
      const result = runSchedule(plan, types, cst);
      setEvents(result);
      setTab("result");
      setView("gantt");
    } else {
      // HGNN+PPO 智能调度 — 调用后端 API
      setLoading(true);
      try {
        const resp = await fetch("/api/schedule/hgnn-ppo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, types, cst, episodes: 300 }),
        });
        if (!resp.ok) throw new Error(`服务端错误: ${resp.status}`);
        const data = await resp.json();
        if (data.error) { alert("HGNN+PPO 求解失败: " + data.error); return; }
        setEvents(data.events || []);
        setTab("result");
        setView("gantt");
      } catch (e) {
        alert("HGNN+PPO 调度失败，请确保后端服务已启动 (python server.py)\n\n" + e.message);
      } finally {
        setLoading(false);
      }
    }
  };

  // Stats
  const makespan   = useMemo(()=>events.reduce((mx,e)=>Math.max(mx,e.end),0),[events]);
  const batchCount = useMemo(()=>new Set(events.map(e=>e.wo)).size,[events]);
  const opCount    = useMemo(()=>events.filter(e=>!e.isCleaning).length,[events]);
  const eqUtil     = useMemo(()=>{
    if (!makespan) return {};
    return Object.fromEntries(EQ_ORDER.map(eq=>{
      const busy = events.filter(e=>e.eq===eq&&!e.isCleaning)
        .reduce((s,e)=>s+e.dur,0);
      return [eq, Math.round(busy/makespan*100)];
    }));
  },[events,makespan]);

  const planBatches  = plan.reduce((s,t)=>s+t.batches,0);
  const missedTypes  = plan.filter(t=>!typeMap[t.typeId]);

  // ── 导出 PDF ──────────────────────────────────────────────────
  const exportPDF = () => {
    const algoLabel = algo === "greedy" ? "贪心算法" : "HGNN+PPO 智能调度";
    const utilItems = EQ_ORDER.filter(eq => events.some(e => e.eq === eq))
      .map(eq => `<span>${eq}: <b>${eqUtil[eq] || 0}%</b></span>`).join("  ");

    const rows = events.map((e, i) =>
      `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
        <td>${e.wo}</td><td>${e.batchLabel}</td><td>${e.opName}</td>
        <td>${e.eq}</td><td>${fmtTime(e.start)}</td><td>${fmtTime(e.end)}</td>
        <td>${fmtDur(e.dur)}</td><td>${e.workers}人</td><td>${e.note || "—"}</td>
      </tr>`
    ).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>排产工单</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
             color:#1e293b;padding:20px 30px;font-size:12px}
        h1{font-size:18px;text-align:center;margin-bottom:4px}
        .sub{text-align:center;color:#94a3b8;font-size:11px;margin-bottom:16px}
        .kpi{display:flex;justify-content:space-around;margin-bottom:12px;
             padding:10px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0}
        .kpi-item{text-align:center}
        .kpi-item .label{font-size:10px;color:#94a3b8;margin-bottom:2px}
        .kpi-item .val{font-size:15px;font-weight:800;font-family:monospace}
        .util{font-size:11px;color:#64748b;margin-bottom:14px;display:flex;gap:16px;flex-wrap:wrap}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th{background:#2563eb;color:#fff;font-size:10px;font-weight:700;
           text-transform:uppercase;padding:6px 8px;text-align:left}
        td{padding:5px 8px;border-bottom:1px solid #e2e8f0}
        @media print{
          body{padding:10px 15px}
          @page{size:A4 landscape;margin:10mm}
        }
      </style>
    </head><body>
      <h1>一号线排产工单</h1>
      <div class="sub">${new Date().toLocaleString("zh-CN")}  ·  ${algoLabel}</div>
      <div class="kpi">
        <div class="kpi-item"><div class="label">完工时间</div><div class="val">${fmtTime(makespan)}</div></div>
        <div class="kpi-item"><div class="label">批次总数</div><div class="val">${batchCount} 批</div></div>
        <div class="kpi-item"><div class="label">工序总数</div><div class="val">${opCount} 道</div></div>
        <div class="kpi-item"><div class="label">每日工时</div><div class="val">${cst.shiftEnd - cst.shiftStart}h/天</div></div>
      </div>
      <div class="util">设备利用率: ${utilItems}</div>
      <table>
        <thead><tr>
          <th>工单号</th><th>批次</th><th>工序</th><th>设备</th>
          <th>计划开始</th><th>计划完成</th><th>工时</th><th>人员</th><th>备注</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>`;

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.onafterprint = () => w.close();
    setTimeout(() => w.print(), 300);
  };

  // ── Mutations ──────────────────────────────────────────────────
  const addType = () => {
    const n = {
      id:uid(), code:`型号${types.length+1}`, color:PALETTE[types.length%PALETTE.length],
      ops:[
        {id:uid(),name:"称量",    eq:"称量台", dur:0.5,workers:1, cleanDur:0, agv:0, matA:25, matB:10, release:0},
        {id:uid(),name:"预混",    eq:"搅拌机", dur:1.0,workers:1, cleanDur:0, agv:0, matA:0,  matB:0,  release:0},
        {id:uid(),name:"混合",    eq:"混合锅", dur:3.0,workers:1, cleanDur:1, agv:0, isMix:true, matA:0, matB:0, release:0},
        {id:uid(),name:"模具装配",eq:"成型台", dur:1.0,workers:1, cleanDur:0, agv:0, matA:0,  matB:0,  release:0.2},
        {id:uid(),name:"成型",    eq:"成型台", dur:4.0,workers:1, cleanDur:0, agv:0, matA:0,  matB:0,  release:0},
        {id:uid(),name:"整装",    eq:"整装区", dur:1.0,workers:1, cleanDur:0, agv:0, matA:0,  matB:0,  release:0},
      ],
    };
    setTypes(p=>[...p,n]);
    setOpenType(p=>({...p,[n.id]:true}));
    setEvents([]);
  };

  const delType  = id => { setTypes(p=>p.filter(t=>t.id!==id)); setEvents([]); };
  const updType  = (id,k,v) => { setTypes(p=>p.map(t=>t.id===id?{...t,[k]:v}:t)); setEvents([]); };
  const updOp    = (tid,oid,k,v) => {
    setTypes(p=>p.map(t=>t.id!==tid?t:{...t,ops:t.ops.map(o=>o.id!==oid?o:{...o,[k]:v})}));
    setEvents([]);
  };

  const addTask  = () => {
    if (!types.length) return;
    const usedIds = plan.map(p=>p.typeId);
    const avail   = types.find(t=>!usedIds.includes(t.id)) || types[0];
    setPlan(p=>[...p,{id:uid(),typeId:avail.id,batches:1,priority:p.length+1,note:""}]);
    setEvents([]);
  };
  const delTask  = id => { setPlan(p=>p.filter(t=>t.id!==id)); setEvents([]); };
  const updTask  = (id,k,v) => { setPlan(p=>p.map(t=>t.id===id?{...t,[k]:v}:t)); setEvents([]); };
  const updCst   = (k,v) => { setCst(p=>({...p,[k]:v})); setEvents([]); };

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.t0,
      fontFamily:"'Segoe UI',system-ui,sans-serif"}}>

      {/* ── Top bar ── */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,
        boxShadow:"0 1px 3px rgba(0,0,0,.05)",position:"sticky",top:0,zIndex:10}}>
        <div style={{maxWidth:1080,margin:"0 auto",padding:"0 16px",
          display:"flex",justifyContent:"space-between",alignItems:"center",height:52}}>

          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{display:"flex",flexDirection:"column",gap:2}}>
              <div style={{width:20,height:3,borderRadius:2,background:C.accent}}/>
              <div style={{width:14,height:3,borderRadius:2,background:C.dn}}/>
              <div style={{width:17,height:3,borderRadius:2,background:C.warn}}/>
            </div>
            <div>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.14em",
                color:C.t3,textTransform:"uppercase",lineHeight:1}}>
                Production Planning · 一号线
              </div>
              <div style={{fontSize:16,fontWeight:800,color:C.t0,lineHeight:1.35,
                letterSpacing:"-0.02em"}}>
                日 / 周排产系统
              </div>
            </div>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{fontSize:11,color:C.t3}}>
              {planBatches} 批 · {types.length} 型号 · {cst.workDays}天计划
            </div>
            <select value={algo} onChange={e=>{setAlgo(e.target.value);setEvents([]);}}
              style={{padding:"5px 8px",borderRadius:6,border:`1px solid ${C.border2}`,
                fontSize:11,fontWeight:600,color:C.t1,background:C.surface,cursor:"pointer",
                outline:"none"}}>
              <option value="greedy">贪心算法</option>
              <option value="hgnn-ppo">HGNN+PPO 智能调度</option>
            </select>
            <Btn primary onClick={generate} disabled={loading}>
              {loading ? "⏳ 求解中..." : "▶ 生成排产"}
            </Btn>
          </div>
        </div>
      </div>

      <div style={{maxWidth:1080,margin:"0 auto",padding:"14px 16px"}}>

        {/* ── Tabs ── */}
        <div style={{display:"flex",gap:4,marginBottom:14,flexWrap:"wrap"}}>
          {[
            ["plan",   "📅 本周计划"],
            ["types",  "🧪 型号配置"],
            ["cst",    "⚙ 约束参数"],
            ["result", "📊 排产结果"],
          ].map(([id,lbl])=>(
            <button key={id} onClick={()=>setTab(id)}
              style={{padding:"6px 14px",borderRadius:7,
                border:`1px solid ${tab===id?C.accent:C.border}`,cursor:"pointer",
                fontSize:12,fontWeight:600,
                background:tab===id?C.accentBg:C.surface,
                color:tab===id?C.accent:C.t2}}>
              {lbl}
              {id==="result"&&events.length>0&&(
                <span style={{marginLeft:5,padding:"1px 6px",borderRadius:99,
                  background:C.accent,color:"white",fontSize:10}}>
                  {batchCount}批
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ══════ 本周计划 ══════ */}
        {tab==="plan"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:12}}>
            <Card style={{padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",marginBottom:14}}>
                <SecHead icon="📅">本周生产计划</SecHead>
                <Btn onClick={addTask}>＋ 新增任务</Btn>
              </div>

              {plan.length===0&&(
                <div style={{textAlign:"center",padding:32,color:C.t3,
                  background:"#f8fafc",borderRadius:8,border:`1px dashed ${C.border}`}}>
                  暂无任务，点击「新增任务」添加
                </div>
              )}

              {plan.map((task,idx)=>{
                const pt = typeMap[task.typeId];
                return (
                  <div key={task.id} style={{marginBottom:10,padding:"12px 14px",
                    borderRadius:9,border:`1px solid ${pt?pt.color+"44":C.border}`,
                    background:pt?pt.color+"08":C.surface}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>

                      {/* Priority */}
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <span style={{fontSize:11,color:C.t3}}>优先级</span>
                        <Stepper value={task.priority}
                          onChange={v=>updTask(task.id,"priority",v)}
                          min={1} max={10} color={C.accent}/>
                      </div>

                      {/* Product type */}
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:11,color:C.t3}}>型号</span>
                        <select value={task.typeId}
                          onChange={e=>updTask(task.id,"typeId",e.target.value)}
                          style={{padding:"4px 8px",borderRadius:6,
                            border:`1px solid ${C.border2}`,
                            background:C.surface,color:C.t0,fontSize:12,outline:"none"}}>
                          {types.map(t=>(
                            <option key={t.id} value={t.id}>{t.code}</option>
                          ))}
                        </select>
                        {pt&&<div style={{width:10,height:10,borderRadius:2,
                          background:pt.color,flexShrink:0}}/>}
                      </div>

                      {/* Batch count */}
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:11,color:C.t3}}>批次</span>
                        <Stepper value={task.batches}
                          onChange={v=>updTask(task.id,"batches",v)}
                          min={1} max={20} color={pt?.color||C.t0}/>
                        <span style={{fontSize:11,color:C.t3}}>锅</span>
                      </div>

                      {/* Note */}
                      <input value={task.note} placeholder="备注（可选）"
                        onChange={e=>updTask(task.id,"note",e.target.value)}
                        style={{flex:1,minWidth:80,padding:"4px 8px",borderRadius:5,
                          border:`1px solid ${C.border}`,background:C.surface,
                          color:C.t1,fontSize:11,outline:"none"}}/>

                      {/* Delete */}
                      <button onClick={()=>delTask(task.id)}
                        style={{padding:"3px 8px",borderRadius:4,
                          border:"1px solid #fecaca",cursor:"pointer",
                          background:"#fef2f2",color:C.danger,fontSize:11}}>✕</button>
                    </div>

                    {/* Process summary */}
                    {pt&&(
                      <div style={{marginTop:8,display:"flex",gap:4,flexWrap:"wrap"}}>
                        {pt.ops.map(op=>(
                          <span key={op.id} style={{fontSize:10,padding:"2px 7px",
                            borderRadius:4,background:pt.color+"15",color:pt.color,
                            border:`1px solid ${pt.color}33`}}>
                            {op.name} {fmtDur(op.dur)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>

            {/* Right: plan summary */}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <Card style={{padding:14}}>
                <SecHead icon="📋">计划汇总</SecHead>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:10}}>
                  {[
                    ["型号数", types.length+"种", C.accent],
                    ["总批次", planBatches+"锅",  C.dn],
                    ["排产天", cst.workDays+"天",  C.warn],
                    ["班次时", `${cst.shiftStart}:00-${cst.shiftEnd}:00`, C.t1],
                  ].map(([k,v,c])=>(
                    <div key={k} style={{padding:"8px 10px",background:"#f8fafc",
                      borderRadius:6,border:`1px solid ${C.border}`}}>
                      <div style={{fontSize:10,color:C.t3,marginBottom:2}}>{k}</div>
                      <div style={{fontSize:14,fontWeight:700,color:c,fontFamily:"monospace"}}>{v}</div>
                    </div>
                  ))}
                </div>
                {plan.map(task=>{
                  const pt = typeMap[task.typeId];
                  if (!pt) return null;
                  return (
                    <div key={task.id} style={{display:"flex",justifyContent:"space-between",
                      alignItems:"center",padding:"5px 0",
                      borderBottom:`1px solid ${C.border}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:8,height:8,borderRadius:2,background:pt.color}}/>
                        <span style={{fontSize:12,color:C.t1}}>{pt.code}</span>
                        <span style={{fontSize:11,color:C.t3}}>优先级{task.priority}</span>
                      </div>
                      <Badge color={pt.color}>{task.batches} 批</Badge>
                    </div>
                  );
                })}
              </Card>

              <Card style={{padding:14,border:`1px solid #fde68a`,background:C.warnBg}}>
                <SecHead color={C.warn} icon="💡">操作提示</SecHead>
                <div style={{fontSize:12,color:C.t1,lineHeight:1.7}}>
                  <div>① 调整优先级 → 高优先先排</div>
                  <div>② 在「型号配置」修改工艺参数</div>
                  <div>③ 在「约束参数」设置换产时间</div>
                  <div>④ 点击顶部「生成排产」出结果</div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ══════ 型号配置 ══════ */}
        {tab==="types"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:13,color:C.t2}}>
                配置各产品型号的工艺参数，排产时系统自动按此计算工时
              </div>
              <Btn onClick={addType}>＋ 新增型号</Btn>
            </div>

            {types.map(pt=>(
              <Card key={pt.id} style={{marginBottom:12,overflow:"hidden"}}>
                {/* Type header */}
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",
                  borderBottom:`1px solid ${C.border}`,background:pt.color+"08",
                  cursor:"pointer"}}
                  onClick={()=>setOpenType(p=>({...p,[pt.id]:!p[pt.id]}))}>
                  <div style={{width:12,height:12,borderRadius:3,background:pt.color,flexShrink:0}}/>
                  <input value={pt.code} onClick={e=>e.stopPropagation()}
                    onChange={e=>updType(pt.id,"code",e.target.value)}
                    style={{fontSize:14,fontWeight:700,color:pt.color,background:"transparent",
                      border:"none",outline:"none",width:80}}/>
                  <span style={{fontSize:11,color:C.t3}}>
                    {pt.ops.length} 道工序
                  </span>

                  <div style={{marginLeft:"auto",display:"flex",gap:12,alignItems:"center"}}
                    onClick={e=>e.stopPropagation()}>
                    <span style={{color:C.t3,fontSize:12}}>
                      {openType[pt.id]===false?"▼":"▲"}
                    </span>
                    <button onClick={e=>{e.stopPropagation();delType(pt.id);}}
                      style={{padding:"2px 8px",borderRadius:4,border:"1px solid #fecaca",
                        cursor:"pointer",background:"#fef2f2",color:C.danger,fontSize:11}}>✕</button>
                  </div>
                </div>

                {/* Operations table */}
                {openType[pt.id]!==false&&(
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}>
                      <thead>
                        <tr style={{background:"#f8fafc"}}>
                          {["#","工序名","设备","工时 (h)","清洗 (h)","AGV (h)","人员","原料A","原料B","脱模剂"].map((h,i)=>(
                            <th key={i} style={{padding:"7px 10px",fontSize:10,fontWeight:700,
                              textTransform:"uppercase",color:C.t3,textAlign:"left",
                              borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pt.ops.map((op,i)=>(
                          <tr key={op.id} style={{background:i%2===0?C.surface:"#f8fafc",
                            borderBottom:`1px solid ${C.border}`}}>
                            <td style={{padding:"7px 10px",fontSize:11,color:C.t3,
                              fontFamily:"monospace"}}>{i+1}</td>
                            <td style={{padding:"7px 10px"}}>
                              <input value={op.name} onChange={e=>updOp(pt.id,op.id,"name",e.target.value)}
                                style={{width:80,padding:"3px 7px",borderRadius:5,
                                  border:`1px solid ${C.border}`,background:C.surface,
                                  color:C.t0,fontSize:12,outline:"none"}}/>
                            </td>
                            <td style={{padding:"7px 10px"}}>
                              <select value={op.eq} onChange={e=>updOp(pt.id,op.id,"eq",e.target.value)}
                                style={{padding:"3px 7px",borderRadius:5,border:`1px solid ${C.border}`,
                                  background:C.surface,color:C.t0,fontSize:12,outline:"none"}}>
                                {EQ_ORDER.map(eq=><option key={eq} value={eq}>{eq}</option>)}
                              </select>
                            </td>
                            <td style={{padding:"7px 10px"}}>
                              <NumInput value={op.dur} step={0.5}
                                onChange={v=>updOp(pt.id,op.id,"dur",Math.max(0.5,v))}/>
                            </td>
                            <td style={{padding:"7px 10px"}}>
                              <NumInput value={op.cleanDur||0} step={0.5} min={0} max={8}
                                onChange={v=>updOp(pt.id,op.id,"cleanDur",Math.max(0,v))}/>
                            </td>
                            <td style={{padding:"7px 10px"}}>
                              <NumInput value={op.agv||0} step={0.1} min={0} max={8}
                                onChange={v=>updOp(pt.id,op.id,"agv",Math.max(0,v))}/>
                            </td>
                            <td style={{padding:"7px 10px"}}>
                              <Stepper value={op.workers}
                                onChange={v=>updOp(pt.id,op.id,"workers",v)}
                                min={1} max={8} color={C.t1}/>
                            </td>
                            <td style={{padding:"7px 10px"}}>
                              <NumInput value={op.matA||0} step={1} min={0} max={999}
                                onChange={v=>updOp(pt.id,op.id,"matA",v)}
                                style={{width:50}}/>
                            </td>
                            <td style={{padding:"7px 10px"}}>
                              <NumInput value={op.matB||0} step={1} min={0} max={999}
                                onChange={v=>updOp(pt.id,op.id,"matB",v)}
                                style={{width:50}}/>
                            </td>
                            <td style={{padding:"7px 10px"}}>
                              <NumInput value={op.release||0} step={0.1} min={0} max={99}
                                onChange={v=>updOp(pt.id,op.id,"release",v)}
                                style={{width:50}}/>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* ══════ 约束参数 ══════ */}
        {tab==="cst"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Card style={{padding:16}}>
              <SecHead icon="⏱">工艺约束</SecHead>

              {[
                ["totalWorkers",  "可用人员总数",   "同一时刻可并行工作的最大人数", 1, 20, 1, "人"],
                ["stockMatA",     "原料A库存",      "当前原料A的可用库存量",       0, 9999, 1, ""],
                ["stockMatB",     "原料B库存",      "当前原料B的可用库存量",       0, 9999, 1, ""],
                ["stockRelease",  "脱模剂库存",     "当前脱模剂的可用库存量",       0, 9999, 0.1, ""],
              ].map(([key,label,desc,min,max,step,unit])=>(
                <div key={key} style={{marginBottom:14,padding:"11px 14px",borderRadius:8,
                  border:`1px solid ${C.border}`,background:"#f8fafc"}}>
                  <div style={{display:"flex",justifyContent:"space-between",
                    alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:600,color:C.t0}}>{label}</span>
                    <NumInput value={cst[key]} min={min} max={max} step={step} unit={unit}
                      onChange={v=>updCst(key,Math.max(min,v))}/>
                  </div>
                  <div style={{fontSize:11,color:C.t3}}>{desc}</div>
                </div>
              ))}
            </Card>

            <Card style={{padding:16}}>
              <SecHead icon="🕐">班次 & 计划参数</SecHead>

              {[
                ["shiftStart",  "班次开始时间", "每天排产开始的小时数（24小时制）", 0, 23, 1, "时"],
                ["shiftEnd",    "班次结束时间", "每天排产结束的小时数（24小时制）", 1, 24, 1, "时"],
                ["lunchStart",  "午休开始时间", "午休开始的小时数（该时段不排产）",  0, 23, 1, "时"],
                ["lunchEnd",    "午休结束时间", "午休结束的小时数",                 1, 24, 1, "时"],
                ["workDays",    "排产天数",     "本次排产周期覆盖的工作日数量",      1, 14, 1, "天"],
              ].map(([key,label,desc,min,max,step,unit])=>(
                <div key={key} style={{marginBottom:14,padding:"11px 14px",borderRadius:8,
                  border:`1px solid ${C.border}`,background:"#f8fafc"}}>
                  <div style={{display:"flex",justifyContent:"space-between",
                    alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:600,color:C.t0}}>{label}</span>
                    <NumInput value={cst[key]} min={min} max={max} step={step} unit={unit}
                      onChange={v=>updCst(key,Math.max(min,v))}/>
                  </div>
                  <div style={{fontSize:11,color:C.t3}}>{desc}</div>
                </div>
              ))}

              <div style={{marginTop:4,padding:"10px 14px",borderRadius:8,
                background:C.accentBg,border:`1px solid ${C.accentBdr}`}}>
                <SecHead color={C.accent} icon="📌" style={{margin:"0 0 6px"}}>
                  当前有效配置
                </SecHead>
                <div style={{fontSize:12,color:C.accent,lineHeight:1.8}}>
                  <div>每日工作时间：{cst.shiftEnd-cst.shiftStart-(cst.lunchEnd-cst.lunchStart)} 小时（不含午休{cst.lunchEnd-cst.lunchStart}h）</div>
                  <div>班次：{String(cst.shiftStart).padStart(2,"0")}:00 — {String(cst.shiftEnd).padStart(2,"0")}:00 · 午休：{String(cst.lunchStart).padStart(2,"0")}:00 — {String(cst.lunchEnd).padStart(2,"0")}:00</div>
                  <div>混合后清洗：按型号工序配置 · 可用人员：{cst.totalWorkers}人</div>
                </div>
              </div>
            </Card>

            {/* Changeover note */}
            <Card style={{padding:14,gridColumn:"1/-1",
              border:`1px solid #fde68a`,background:C.warnBg}}>
              <SecHead color={C.warn} icon="⚠️">约束说明</SecHead>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,fontSize:12,color:C.t1}}>
                <div style={{padding:"8px 12px",background:C.surface,borderRadius:6,
                  borderLeft:"3px solid "+C.warn}}>
                  <strong style={{color:C.warn}}>工序清洗</strong><br/>
                  在型号配置中设置各工序的清洗时间，清洗期间该设备不可用。
                </div>
                <div style={{padding:"8px 12px",background:C.surface,borderRadius:6,
                  borderLeft:"3px solid "+C.dn}}>
                  <strong style={{color:C.dn}}>班次边界</strong><br/>
                  每道工序不跨班次执行。若当前班次剩余时间不足，自动顺延到下一天班次开始。
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ══════ 排产结果 ══════ */}
        {tab==="result"&&(
          <div>
            {events.length===0?(
              <Card style={{padding:60,textAlign:"center"}}>
                <div style={{fontSize:44,marginBottom:12}}>📋</div>
                <p style={{fontSize:14,color:C.t2,marginBottom:16}}>
                  尚未生成排产方案，请点击顶部「生成排产」按钮
                </p>
                <Btn primary onClick={generate} disabled={loading}>
                  {loading ? "⏳ 求解中..." : "▶ 立即生成排产"}
                </Btn>
              </Card>
            ):(
              <>
                {/* ── KPI cards ── */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",
                  gap:10,marginBottom:12}}>
                  {[
                    {l:"调度算法",v:algo==="greedy"?"贪心":"HGNN+PPO", c:algo==="greedy"?C.t1:"#7c3aed", s:algo==="greedy"?"默认":"智能调度"},
                    {l:"完工时间",v:fmtTime(makespan),    c:C.danger, s:"预计"},
                    {l:"批次总数",v:batchCount+"批",       c:C.accent, s:"已排"},
                    {l:"工序总数",v:opCount+"道",           c:C.dn,     s:"含清洗"},
                    {l:"班次工时",v:(cst.shiftEnd-cst.shiftStart)+"h/天",c:C.warn,     s:"每日"},
                  ].map(({l,v,c,s})=>(
                    <Card key={l} style={{padding:12,borderTop:`3px solid ${c}`}}>
                      <div style={{fontSize:10,color:C.t3,marginBottom:3}}>{l}</div>
                      <div style={{fontSize:18,fontWeight:800,color:c,
                        fontFamily:"monospace",letterSpacing:"-0.03em"}}>{v}</div>
                      <div style={{fontSize:10,color:C.t3,marginTop:3}}>{s}</div>
                    </Card>
                  ))}
                </div>

                {/* ── Equipment utilization ── */}
                <Card style={{padding:14,marginBottom:12}}>
                  <SecHead icon="🔧">设备利用率</SecHead>
                  <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
                    {EQ_ORDER.filter(eq=>events.some(e=>e.eq===eq)).map(eq=>(
                      <div key={eq} style={{flex:1,minWidth:120}}>
                        <div style={{display:"flex",justifyContent:"space-between",
                          marginBottom:4,fontSize:11}}>
                          <span style={{color:C.t1,fontWeight:600}}>{eq}</span>
                          <span style={{color:C.accent,fontFamily:"monospace",fontWeight:700}}>
                            {eqUtil[eq]||0}%
                          </span>
                        </div>
                        <div style={{background:C.border,borderRadius:3,height:5,overflow:"hidden"}}>
                          <div style={{width:`${eqUtil[eq]||0}%`,height:"100%",
                            background:C.accent,borderRadius:3}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* ── View toggle ── */}
                <div style={{display:"flex",gap:6,marginBottom:12}}>
                  {[["gantt","▦ 甘特图"],["workorder","📋 工单"]].map(([id,lbl])=>(
                    <button key={id} onClick={()=>setView(id)}
                      style={{padding:"6px 14px",borderRadius:7,
                        border:`1px solid ${view===id?C.accent:C.border}`,
                        cursor:"pointer",fontSize:12,fontWeight:600,
                        background:view===id?C.accentBg:C.surface,
                        color:view===id?C.accent:C.t2}}>{lbl}</button>
                  ))}
                  <Btn onClick={exportPDF} style={{marginLeft:4}}>📄 导出 PDF</Btn>
                  <div style={{flex:1}}/>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                    {[...new Set(events.map(e=>e.ptCode))].map(code=>{
                      const ev = events.find(e=>e.ptCode===code);
                      const cnt = new Set(events.filter(e=>e.ptCode===code&&!e.isCleaning)
                        .map(e=>e.batchLabel)).size;
                      return ev&&(
                        <Badge key={code} color={ev.ptColor}>{code} × {cnt}批</Badge>
                      );
                    })}
                    <Badge color={CLEAN_COL} bg={CLEAN_COL+"15"}>🧹 清洗</Badge>
                  </div>
                </div>

                {/* ── Views ── */}
                <Card style={{padding:16}}>
                  {view==="gantt"&&<GanttChart events={events} cst={cst}/>}
                  {view==="workorder"&&<WorkOrderTable events={events}/>}
                </Card>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
