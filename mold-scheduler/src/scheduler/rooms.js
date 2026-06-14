/**
 * 房间资格矩阵解析与房间时间线
 */

export function parseRoomMatrix(text, opIds, roomList) {
  const lines = text
    .trim()
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  if (!lines.length) return null;

  const matrix = {};
  for (const line of lines) {
    const parts = line.split(/[\s,，\t]+/).filter(Boolean);
    if (parts.length < 2) continue;
    const opId = parts[0].toUpperCase();
    if (!opIds.includes(opId)) continue;
    const row = {};
    for (let i = 0; i < roomList.length; i++) {
      const val = parseInt(parts[i + 1], 10);
      row[roomList[i]] = val === 1 ? 1 : 0;
    }
    matrix[opId] = row;
  }
  return Object.keys(matrix).length ? matrix : null;
}

export function matrixToRooms(matrix, opId, roomList) {
  const row = matrix?.[opId] || {};
  return roomList.filter(r => row[r] === 1);
}

export function applyMatrixToOps(ops, matrix, roomList) {
  return ops.map(op => ({
    ...op,
    rooms: matrixToRooms(matrix, op.id, roomList),
  }));
}

export function matrixToText(matrix, opIds, roomList) {
  return opIds
    .map(id => {
      const row = matrix[id] || {};
      const cells = roomList.map(r => (row[r] === 1 ? "1" : "0"));
      return `${id} ${cells.join(" ")}`;
    })
    .join("\n");
}

export function initRoomTimelines(roomList, frozenEvents = []) {
  const tls = Object.fromEntries(roomList.map(r => [r, []]));
  for (const e of frozenEvents) {
    const room = e.room;
    if (room != null && tls[room]) {
      tls[room].push({ start: e.start, end: e.end });
    }
  }
  for (const r of Object.keys(tls)) {
    tls[r].sort((a, b) => a.start - b.start);
  }
  return tls;
}

export function validateRoomMatrix(ops, roomList) {
  const errors = [];
  for (const op of ops) {
    if (!op.rooms?.length) {
      errors.push(`工步 ${op.id}（${op.name}）在房间矩阵中无可执行房间（全为 0）`);
    }
    for (const r of op.rooms || []) {
      if (!roomList.includes(r)) {
        errors.push(`工步 ${op.id} 引用了未定义房间 ${r}`);
      }
    }
  }
  return errors;
}
