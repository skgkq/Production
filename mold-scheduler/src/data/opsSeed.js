/** 默认房间列表（占位，可在约束参数中修改） */
export const DEFAULT_ROOM_LIST = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * 工步×房间 0/1 占位矩阵（行=工步 id，列=房间号）
 * 1=可执行，0=不可。后续可在配置页粘贴替换。
 */
export const DEFAULT_ROOM_MATRIX = {
  M1: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 },
  M2: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 },
  H1: { 1: 0, 2: 1, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 },
  A1: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 },
  A2: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0, 6: 0, 7: 0, 8: 0 },
  Z1: { 1: 1, 2: 1, 3: 1, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 },
  C1: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1, 6: 0, 7: 0, 8: 0 },
  G1: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 0, 8: 0 },
  G2: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 0, 8: 0 },
  L1: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 1, 8: 0 },
  L2: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 1, 8: 0 },
  J1: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 },
  J2: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 },
  T1: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1, 6: 0, 7: 0, 8: 0 },
  T2: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1, 6: 0, 7: 0, 8: 0 },
  F1: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1, 6: 0, 7: 0, 8: 0 },
  F2: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1, 6: 0, 7: 0, 8: 0 },
};

const GROUP = "模具装配";

const OP_DEFS = [
  { id: "M1", name: "模具前处理",       subOps: "模具清洗、模具转运、模具涂模",           deps: [],              dur: 1.0, workers: 2 },
  { id: "M2", name: "模具预装准备",     subOps: "模具预组装、装配前准备",                 deps: ["M1"],          dur: 1.5, workers: 2 },
  { id: "H1", name: "壳体前处理",       subOps: "壳体检查、壳体涂模",                     deps: [],              dur: 1.0, workers: 2 },
  { id: "A1", name: "辅件准备",         subOps: "阀门准备、花板插管沸腾圈准备",           deps: [],              dur: 0.8, workers: 1 },
  { id: "A2", name: "水浴液压系统准备", subOps: "水浴液压系统准备",                       deps: [],              dur: 0.5, workers: 1 },
  { id: "Z1", name: "装配调缸",         subOps: "装配、调缸",                             deps: ["M2", "H1", "A1"], dur: 2.0, workers: 3 },
  { id: "C1", name: "多余模具清退",     subOps: "多余模具装配后清退",                     deps: ["Z1"],          dur: 0.5, workers: 1 },
  { id: "G1", name: "入缸",             subOps: "入缸",                                   deps: ["Z1", "A2"],    dur: 1.0, workers: 2 },
  { id: "G2", name: "壳体状态建立",     subOps: "壳体保温、壳体抽空",                     deps: ["G1"],          dur: 2.0, workers: 2 },
  { id: "L1", name: "料浆接收复核",     subOps: "接收推进剂料浆、复核料浆质量",           deps: [],              dur: 0.5, workers: 1 },
  { id: "L2", name: "分料",             subOps: "分料",                                   deps: ["L1", "G2"],    dur: 1.0, workers: 2 },
  { id: "J1", name: "浇注过程",         subOps: "浇注、保压、放气",                       deps: ["L2"],          dur: 3.0, workers: 3 },
  { id: "J2", name: "浇注后处理",       subOps: "浇注后处理",                             deps: ["J1"],          dur: 1.0, workers: 2 },
  { id: "T1", name: "转运资源准备",     subOps: "转运架准备",                             deps: [],              dur: 0.5, workers: 1 },
  { id: "T2", name: "产品转运",         subOps: "转运前准备、浇注产品转运",               deps: ["T1", "J2"],    dur: 1.0, workers: 2 },
  { id: "F1", name: "花板清理归位",     subOps: "花板刮药、花板清洗、花板归位",           deps: ["T2"],          dur: 1.0, workers: 2 },
  { id: "F2", name: "废料转运",         subOps: "废料转运",                               deps: ["F1"],          dur: 0.5, workers: 1 },
];

export function roomsFromMatrix(opId, matrix, roomList) {
  const row = matrix[opId] || {};
  return roomList.filter(r => row[r] === 1);
}

export function buildDefaultOps(roomList = DEFAULT_ROOM_LIST, matrix = DEFAULT_ROOM_MATRIX) {
  return OP_DEFS.map(def => ({
    ...def,
    group: GROUP,
    rooms: roomsFromMatrix(def.id, matrix, roomList),
  }));
}

export const DEFAULT_OPS = buildDefaultOps();

export const DEFAULT_PLAN = [
  { id: "t1", batches: 1, priority: 1, note: "" },
];

export const DEFAULT_CST = {
  shiftStart: 8,
  shiftEnd: 18,
  workDays: 5,
  roomList: [...DEFAULT_ROOM_LIST],
  totalWorkers: 4,
};

export const OP_COLORS = {
  M1: "#3b82f6", M2: "#2563eb", H1: "#10b981", A1: "#059669",
  A2: "#14b8a6", Z1: "#8b5cf6", C1: "#a78bfa", G1: "#f59e0b",
  G2: "#d97706", L1: "#ec4899", L2: "#db2777", J1: "#ef4444",
  J2: "#dc2626", T1: "#06b6d4", T2: "#0891b2", F1: "#84cc16",
  F2: "#65a30d",
};
