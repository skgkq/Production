/** 后端 API 根地址。本地开发留空，走 Vite 代理；线上/cpolar 填 .env 中 VITE_API_BASE */
const raw = (import.meta.env.VITE_API_BASE || "").trim().replace(/\/$/, "");

export const API_BASE = raw;

export function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
}
