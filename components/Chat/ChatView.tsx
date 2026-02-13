import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Sparkles, MessageSquarePlus, Trash2, MessageCircle, ChevronRight } from 'lucide-react';

const STORAGE_KEY = '@Estrategico:ChatConversations';

const ENV_URL = import.meta.env.VITE_5W2H_CHAT_API_URL as string | undefined;
const API_URL =
  ENV_URL && typeof ENV_URL === 'string' && ENV_URL.trim() && !ENV_URL.trim().toLowerCase().startsWith('gsk')
    ? ENV_URL.trim()
    : '/api/chat';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveConversations(conversations: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    // quota or disabled
  }
}

function generateId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function titleFromFirstMessage(content: string): string {
  const t = content.trim().slice(0, 50);
  return t ? (t.length >= 50 ? `${t}…` : t) : 'Nova conversa';
}

export const ChatView: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const current = currentId ? conversations.find((c) => c.id === currentId) : null;

  const persistConversations = useCallback((next: Conversation[]) => {
    setConversations(next);
    saveConversations(next);
  }, []);

  useEffect(() => {
    if (currentId && current) setMessages(current.messages);
    else if (!currentId) setMessages([]);
  }, [currentId]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const startNewConversation = useCallback(() => {
    setCurrentId(null);
    setMessages([]);
    setError(null);
    setSidebarOpen(false);
  }, []);

  const selectConversation = useCallback((id: string) => {
    setCurrentId(id);
    setSidebarOpen(false);
  }, []);

  const deleteConversation = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      const next = conversations.filter((c) => c.id !== id);
      persistConversations(next);
      if (currentId === id) {
        setCurrentId(null);
        setMessages([]);
      }
    },
    [conversations, currentId, persistConversations]
  );

  const saveCurrentMessages = useCallback(
    (nextMessages: ChatMessage[], title?: string) => {
      if (currentId) {
        const conv = conversations.find((c) => c.id === currentId);
        if (conv) {
          const updated: Conversation = {
            ...conv,
            messages: nextMessages,
            title: title ?? conv.title,
            updatedAt: Date.now(),
          };
          persistConversations(conversations.map((c) => (c.id === currentId ? updated : c)));
          return;
        }
      }
      const newConv: Conversation = {
        id: generateId(),
        title: title ?? 'Nova conversa',
        messages: nextMessages,
        updatedAt: Date.now(),
      };
      persistConversations([newConv, ...conversations]);
      setCurrentId(newConv.id);
    },
    [currentId, conversations, persistConversations]
  );

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    const nextMessages = [...messages, userMsg];
    const isNewConversation = !currentId && messages.length === 0;
    const newTitle = isNewConversation ? titleFromFirstMessage(text) : undefined;

    setMessages(nextMessages);
    setInput('');
    setError(null);
    setLoading(true);
    saveCurrentMessages(nextMessages, newTitle);

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) throw new Error(`API: ${res.status}`);

      const data = (await res.json()) as { reply?: string; message?: string; text?: string; content?: string };
      const replyText =
        data.reply ?? data.message ?? data.text ?? data.content ?? (typeof data === 'string' ? data : 'Resposta recebida.');

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: replyText,
        timestamp: Date.now(),
      };
      const withReply = [...nextMessages, assistantMsg];
      setMessages(withReply);
      saveCurrentMessages(withReply);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Erro ao chamar a API.';
      setError(errMsg);
      const errAssistant: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: `Erro: ${errMsg}. No Vercel, defina GROQ_API_KEY em Settings > Environment Variables e faça redeploy.`,
        timestamp: Date.now(),
      };
      const withErr = [...nextMessages, errAssistant];
      setMessages(withErr);
      saveCurrentMessages(withErr);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div className="h-full flex min-h-0 rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
      {/* Sidebar: conversas salvas */}
      <aside
        className={`shrink-0 flex flex-col border-r border-slate-800 bg-slate-900/80 transition-all ${
          sidebarOpen ? 'w-56 sm:w-64' : 'w-0 overflow-hidden'
        }`}
      >
        <div className="p-3 border-b border-slate-800 flex items-center justify-between min-h-[52px]">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">
            Conversas
          </span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 text-slate-500 hover:text-white rounded lg:hidden"
            aria-label="Fechar lista"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <button
          type="button"
          onClick={startNewConversation}
          className="m-2 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-sm font-medium transition-colors"
        >
          <MessageSquarePlus size={18} />
          Nova conversa
        </button>
        <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-0.5">
          {conversations.length === 0 && (
            <p className="text-slate-500 text-xs px-3 py-4">Nenhuma conversa salva.</p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => selectConversation(c.id)}
              onKeyDown={(e) => e.key === 'Enter' && selectConversation(c.id)}
              className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-colors ${
                currentId === c.id ? 'bg-blue-600/20 text-blue-100' : 'hover:bg-slate-800/60 text-slate-300'
              }`}
            >
              <MessageCircle size={14} className="shrink-0 text-slate-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{c.title}</p>
                <p className="text-[10px] text-slate-500">{formatDate(c.updatedAt)}</p>
              </div>
              <button
                type="button"
                onClick={(e) => deleteConversation(e, c.id)}
                className="shrink-0 p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                aria-label="Excluir conversa"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Área principal: mensagens + input */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        {!sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="absolute left-3 top-3 z-10 p-2 rounded-lg bg-slate-800/90 text-slate-400 hover:text-white border border-slate-700"
            aria-label="Abrir conversas"
          >
            <MessageCircle size={18} />
          </button>
        )}
        <div className="flex-1 flex flex-col min-h-0 p-4 sm:p-5">
          <div ref={listRef} className="flex-1 overflow-y-auto space-y-4 min-h-0">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 flex items-center justify-center mb-4 border border-slate-700/50">
                  <Sparkles size={28} className="text-blue-400" />
                </div>
                <h3 className="text-slate-200 font-semibold text-lg mb-1">5W2H CHAT</h3>
                <p className="text-slate-500 text-sm max-w-xs">
                  Envie uma mensagem. A IA é especializada em 5W2H e planejamento estratégico. As conversas são salvas automaticamente.
                </p>
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[90%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-md shadow-lg'
                      : 'bg-slate-800/80 text-slate-200 border border-slate-700/80 rounded-bl-md'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-slate-800/80 border border-slate-700/80 flex items-center gap-2 text-slate-400 text-sm">
                  <Loader2 size={18} className="animate-spin shrink-0" />
                  <span>Pensando...</span>
                </div>
              </div>
            )}
            {error && <p className="text-red-400/90 text-xs text-center">{error}</p>}
          </div>

          <div className="shrink-0 pt-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="flex gap-3"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Digite sua mensagem..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 transition-all"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="shrink-0 px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium text-sm transition-colors flex items-center gap-2"
                aria-label="Enviar"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                <span className="hidden sm:inline">Enviar</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
