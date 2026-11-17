"use client";

import { apiFetch } from "@/lib/session";

import React, { useState, useRef, useEffect } from "react";
import { buildAIGraphContextNodes, normalizeAIGraphPlan, AIGraphPlan } from "@/lib/aiGraph";
import { useCanvasStore } from "@/stores/canvasStore";
import { useUIStore } from "@/stores/uiStore";
import { useDataStore } from "@/stores/dataStore";
import { useDagStore } from "@/stores/dagStore";
import { getToken } from "@/stores/authStore";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  onApplyPlan: (plan: AIGraphPlan) => Promise<string[]>;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function AIPanel({ onApplyPlan }: Props) {
  const toggleAIPanel = useUIStore((s) => s.toggleAIPanel);
  const tables = useDataStore((s) => s.tables);
  const currentPageId = useCanvasStore((s) => s.currentPageId);
  const nodes = useDagStore((s) => s.nodes);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [tokenCount, setTokenCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const nodeCount = Object.keys(nodes).length;
  const existingNodeContext = buildAIGraphContextNodes(nodes, currentPageId);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const newMessage: ChatMessage = { role: "user", content: text };
    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const payload = JSON.stringify({
        messages: updatedMessages,
        context: {
          tables: tables.map((t) => ({
            name: t.name,
            columns: t.columns.map((c) => ({ name: c.name, type: c.type })),
          })),
          nodeCount,
          existingNodes: existingNodeContext.map((node) => ({
            ref: node.ref,
            type: node.type,
            status: node.status,
            summary: node.summary,
            columns: node.columns,
          })),
        },
      });

      let res: Response | null = null;
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api"}/ai/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
            cache: "no-store",
            body: payload,
          });
          break;
        } catch (err) {
          lastError = err;
          if (attempt === 0) {
            await wait(700);
            continue;
          }
        }
      }

      if (!res) {
        throw lastError instanceof Error
          ? lastError
          : new Error("No se pudo conectar con el servicio de IA.");
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const normalizedPlan = normalizeAIGraphPlan(data.plan, tables, existingNodeContext);
      const notes = normalizedPlan?.warnings ? [...normalizedPlan.warnings] : [];

      if (normalizedPlan && normalizedPlan.nodes.length > 0) {
        const applyWarnings = await onApplyPlan(normalizedPlan);
        notes.push(...applyWarnings);
      }

      const assistantReply =
        typeof data.reply === "string" && data.reply.trim()
          ? data.reply.trim()
          : normalizedPlan?.summary ?? "Preparé una respuesta, pero quedó vacía.";

      const assistantMessage =
        notes.length > 0
          ? `${assistantReply}\n\nNotas:\n${notes.map((note) => `- ${note}`).join("\n")}`
          : assistantReply;

      setMessages((prev) => [...prev, { role: "assistant", content: assistantMessage }]);
      if (data.usage) {
        setTokenCount((prev) => prev + data.usage.input_tokens + data.usage.output_tokens);
      }
    } catch (err) {
      const networkError =
        err instanceof TypeError && /fetch/i.test(err.message);
      const message = networkError
        ? "No pude conectar con el servicio de IA. La app pudo haberse reiniciado; recarga la página e inténtalo de nuevo."
        : err instanceof Error
          ? err.message
          : "Unknown error";

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${message}` },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const greeting = tables.length > 0
    ? `How can I help with your data exploration? I can see ${tables.length} table${tables.length !== 1 ? "s" : ""}.`
    : "How can I help with your data exploration?";

  return (
    <div className="panel flex flex-col" style={{ width: 300, maxHeight: "70vh", minHeight: 340 }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span style={{ color: "#8b5cf6" }}>✦</span>
          <span className="text-xs font-semibold text-gray-700">AI Assistant</span>
        </div>
        <button onClick={toggleAIPanel} className="text-gray-400 hover:text-gray-600 text-sm leading-none">✕</button>
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {/* Greeting */}
        <div className="text-xs text-gray-500 font-medium">{greeting}</div>

        {/* Context section */}
        {tables.length > 0 && (
          <div className="rounded-lg border border-gray-100 bg-gray-50 text-xs">
            <button
              onClick={() => setContextExpanded((v) => !v)}
              className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-left text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <span className="text-[10px]">{contextExpanded ? "▾" : "▸"}</span>
              <span className="font-medium">Context</span>
            </button>
            {contextExpanded && (
              <div className="px-2.5 pb-2 space-y-1">
                <div className="text-[10px] text-gray-500">
                  {tables.length} table{tables.length !== 1 ? "s" : ""} available
                </div>
                {tables.slice(0, 5).map((t) => (
                  <div key={t.name} className="text-[10px] text-gray-700">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-gray-400"> ({t.columns.length} cols)</span>
                  </div>
                ))}
                {tables.length > 5 && (
                  <div className="text-[10px] text-gray-400">+{tables.length - 5} more</div>
                )}
                {nodeCount > 0 && (
                  <div className="text-[10px] text-gray-500 mt-1">{nodeCount} node{nodeCount !== 1 ? "s" : ""} on canvas</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "user" ? (
              <div className="chat-bubble-user">{msg.content}</div>
            ) : (
              <div className="chat-bubble-ai whitespace-pre-wrap">{msg.content}</div>
            )}
          </div>
        ))}

        {/* Thinking indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="thinking-indicator">
              <span style={{ color: "#8b5cf6" }}>✦</span>
              <span className="text-[11px]">Thinking…</span>
              <div className="flex gap-1 ml-1">
                <div className="thinking-dot" />
                <div className="thinking-dot" />
                <div className="thinking-dot" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Token count + disclaimer */}
      <div className="px-3 py-1 border-t border-gray-50">
        <p className="text-[9px] text-gray-400 leading-tight">
          Studio collects all conversations to improve the AI experience.
        </p>
        {tokenCount > 0 && (
          <p className="text-[9px] text-gray-400">{tokenCount.toLocaleString()} tokens used</p>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 pb-3">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message…"
          disabled={loading}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-teal-400 disabled:opacity-50"
        />
        <button
          onClick={() => void sendMessage()}
          disabled={loading || !input.trim()}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white disabled:opacity-40 transition-opacity"
          style={{ background: "#14b8a6" }}
        >
          <span className="text-sm">➤</span>
        </button>
      </div>
    </div>
  );
}
