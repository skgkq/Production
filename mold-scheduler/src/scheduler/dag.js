/**
 * DAG 工具：工序 deps 规范化、拓扑排序、环检测
 */

export function resolveOpDeps(op, ops, index) {
  if (Array.isArray(op.deps) && op.deps.length > 0) return [...op.deps];
  if (index > 0) return [ops[index - 1].id];
  return [];
}

export function normalizeOps(ops) {
  const errors = [];
  const ids = new Set();

  for (const op of ops) {
    if (!op.id) errors.push(`工序「${op.name || "?"}」缺少 id`);
    if (ids.has(op.id)) errors.push(`工序 id 重复：${op.id}`);
    ids.add(op.id);
  }

  const normalized = ops.map((op, i) => ({
    ...op,
    deps: resolveOpDeps(op, ops, i),
  }));

  for (const op of normalized) {
    for (const dep of op.deps) {
      if (!ids.has(dep)) errors.push(`工序 ${op.id} 的前置 ${dep} 不存在`);
    }
  }

  try {
    topologicalSort(normalized);
  } catch (e) {
    errors.push(e.message);
  }

  for (const op of normalized) {
    if (!op.rooms?.length) errors.push(`工序 ${op.id}（${op.name}）无可执行房间`);
  }

  return { ops: normalized, errors };
}

export function topologicalSort(ops) {
  const opById = Object.fromEntries(ops.map(o => [o.id, o]));
  const inDeg = Object.fromEntries(ops.map(o => [o.id, 0]));
  const adj = Object.fromEntries(ops.map(o => [o.id, []]));

  for (const op of ops) {
    for (const dep of op.deps) {
      if (!adj[dep]) throw new Error(`DAG 引用无效：${op.id} → ${dep}`);
      adj[dep].push(op.id);
      inDeg[op.id]++;
    }
  }

  const queue = ops.filter(o => inDeg[o.id] === 0).map(o => o.id);
  const order = [];

  while (queue.length) {
    const id = queue.shift();
    order.push(opById[id]);
    for (const next of adj[id] || []) {
      inDeg[next]--;
      if (inDeg[next] === 0) queue.push(next);
    }
  }

  if (order.length !== ops.length) {
    throw new Error("工序 DAG 存在环路，请检查前置依赖");
  }

  return order;
}

/** 获取依赖某工步的所有后继（传递闭包） */
export function getDependents(opId, ops) {
  const dependents = new Set();
  const queue = [opId];
  while (queue.length) {
    const cur = queue.shift();
    for (const op of ops) {
      if (op.deps.includes(cur) && !dependents.has(op.id)) {
        dependents.add(op.id);
        queue.push(op.id);
      }
    }
  }
  return dependents;
}

export function validateScheduleReadiness(ops) {
  return normalizeOps(ops).errors;
}
