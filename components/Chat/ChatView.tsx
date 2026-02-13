import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles } from 'lucide-react';

const API_URL = import.meta.env.VITE_5W2H_CHAT_API_URL as string | undefined;

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export const ChatView: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setError(null);
    setLoading(true);

    if (!API_URL) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: 'Configure a variável VITE_5W2H_CHAT_API_URL no Vercel (e no .env.local em dev) com a URL da sua API de chat para ativar as respostas da IA.',
          timestamp: Date.now(),
        },
      ]);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          messages: messages.concat(userMsg).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) throw new Error(`API: ${res.status}`);

      const data = (await res.json()) as { reply?: string; message?: string; text?: string; content?: string };
      const replyText =
        data.reply ?? data.message ?? data.text ?? data.content ?? (typeof data === 'string' ? data : 'Resposta recebida.');

      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', content: replyText, timestamp: Date.now() },
      ]);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Erro ao chamar a API.';
      setError(errMsg);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: `Erro: ${errMsg}. Verifique a URL da API e CORS no Vercel.`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto w-full min-w-0">
      <div className="flex-1 flex flex-col rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden min-h-0 shadow-inner">
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 min-h-0"
        >
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 flex items-center justify-center mb-4 border border-slate-700/50">
                <Sparkles size={28} className="text-blue-400" />
              </div>
              <h3 className="text-slate-200 font-semibold text-lg mb-1">5W2H CHAT</h3>
              <p className="text-slate-500 text-sm max-w-xs">
                Envie uma mensagem. Quando a API estiver configurada no Vercel, a IA responderá aqui.
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

        <div className="shrink-0 p-4 border-t border-slate-800 bg-slate-900/80">
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
  );
};
