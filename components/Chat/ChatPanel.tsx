import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_5W2H_CHAT_API_URL as string | undefined;

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export const ChatPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open, messages]);

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
        body: JSON.stringify({ message: text, messages: messages.concat(userMsg).map((m) => ({ role: m.role, content: m.content })) }),
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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-10 right-6 z-40 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg hover:shadow-xl transition-all touch-manipulation"
        aria-label="Abrir 5W2H Chat"
      >
        <MessageCircle size={18} />
        <span>5W2H CHAT</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-0 sm:p-4 sm:items-center sm:justify-center">
          <div className="absolute inset-0 bg-black/50 sm:bg-black/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            className="relative w-full sm:max-w-md h-[85vh] sm:h-[520px] flex flex-col bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between shrink-0 px-4 py-3 border-b border-slate-800 bg-slate-900/95">
              <div className="flex items-center gap-2">
                <MessageCircle size={20} className="text-blue-400" />
                <span className="font-semibold text-slate-100">5W2H CHAT</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
              {messages.length === 0 && (
                <p className="text-slate-500 text-sm text-center py-6">
                  Envie uma mensagem. Quando a API estiver configurada no Vercel, a IA responderá aqui.
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      m.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-200 border border-slate-700'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-lg px-3 py-2 bg-slate-800 border border-slate-700 flex items-center gap-2 text-slate-400 text-sm">
                    <Loader2 size={16} className="animate-spin" />
                    Pensando...
                  </div>
                </div>
              )}
              {error && <p className="text-red-400 text-xs text-center">{error}</p>}
            </div>

            <div className="shrink-0 p-3 border-t border-slate-800">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-500"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  aria-label="Enviar"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
