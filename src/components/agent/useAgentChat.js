import { useState, useCallback, useRef } from "react";
import { getAgentReply } from "./agentKnowledge";

let msgId = 0;
const nextId = () => `msg-${++msgId}`;

/**
 * 智能客服对话状态
 * @param {Object} [options]
 * @param {Object} [options.context] 业务上下文（算法、当前 Tab 等）
 * @param {(text: string) => Promise<string>} [options.onSend] 自定义回复（对接真实 API 时使用）
 */
export function useAgentChat({ context, onSend } = {}) {
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const contextRef = useRef(context);
  contextRef.current = context;

  const pushMessage = useCallback((role, content) => {
    setMessages(prev => [...prev, { id: nextId(), role, content, time: Date.now() }]);
  }, []);

  const sendMessage = useCallback(async (text) => {
    const trimmed = (text || "").trim();
    if (!trimmed || typing) return;

    pushMessage("user", trimmed);
    setTyping(true);

    try {
      let reply;
      if (onSend) {
        reply = await onSend(trimmed, contextRef.current);
      } else {
        await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
        reply = getAgentReply(trimmed, contextRef.current);
      }
      pushMessage("assistant", reply || "抱歉，暂时无法回答该问题。");
    } catch {
      pushMessage("assistant", "网络异常，请稍后再试。");
    } finally {
      setTyping(false);
    }
  }, [typing, onSend, pushMessage]);

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, typing, sendMessage, clearMessages };
}
