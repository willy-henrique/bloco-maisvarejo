import { useState, useEffect, useCallback } from 'react';
import {
  sendGeneralMessage,
  markGeneralChatRead,
  subscribeGeneralChatMessages,
  subscribeGeneralChatMeta,
  type GeneralChatMessage,
} from '../services/generalChatService';
import type { ChatUser } from './useChat';

export function useGeneralChat(currentUser: ChatUser | null) {
  const [messages, setMessages] = useState<GeneralChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeGeneralChatMessages((msgs) => {
      setMessages(msgs);
      setLoading(false);
    });
    if (!unsub) setLoading(false);
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const uid = currentUser.uid;
    const unsub = subscribeGeneralChatMeta((meta) => {
      if (!meta.lastMessageAt) {
        setHasUnread(false);
        return;
      }
      const lastRead = meta.lastReadAt[uid] ?? 0;
      setHasUnread(meta.lastMessageAt > lastRead);
    });
    return () => unsub?.();
  }, [currentUser?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const markRead = useCallback(() => {
    if (!currentUser) return;
    markGeneralChatRead(currentUser.uid).catch(() => {});
    setHasUnread(false);
  }, [currentUser]);

  const sendMessage = useCallback(
    async (texto: string, replyTo?: GeneralChatMessage['replyTo']) => {
      if (!currentUser || !texto.trim()) return;
      setSending(true);
      setError(null);
      try {
        await sendGeneralMessage(currentUser.uid, currentUser.nome, texto, replyTo);
      } catch (e) {
        setError('Falha ao enviar mensagem. Tente novamente.');
        console.error('Falha ao enviar mensagem.', e);
      } finally {
        setSending(false);
      }
    },
    [currentUser],
  );

  return { messages, loading, sending, error, hasUnread, markRead, sendMessage };
}
