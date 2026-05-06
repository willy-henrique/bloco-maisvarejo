import { useState, useEffect, useCallback } from 'react';
import {
  ensurePrivateChat,
  sendPrivateMessage,
  markConversationRead,
  editPrivateMessage,
  deletePrivateMessage,
  clearPrivateChatForMe,
  canDeletePrivateMessageForEveryone,
  isConversationVisibleForUser,
  subscribeMyConversations,
  subscribePrivateChatMessages,
  type ConversationMeta,
  type DeletePrivateMessageScope,
  type PrivateChatMessage,
} from '../services/chatService';

export interface ChatUser {
  uid: string;
  nome: string;
}

export interface AvailableChatUser {
  uid: string;
  nome: string;
  email: string;
}

function totalUnreadFor(conversations: ConversationMeta[], uid: string): number {
  return conversations.reduce((sum, c) => {
    if (!isConversationVisibleForUser(c, uid)) return sum;
    return sum + (c.unread[uid] ?? 0);
  }, 0);
}

function conversationsAreEqual(a: ConversationMeta[], b: ConversationMeta[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.chatId !== right.chatId ||
      left.lastMessage !== right.lastMessage ||
      left.lastMessageAt !== right.lastMessageAt ||
      left.participants.join('|') !== right.participants.join('|') ||
      JSON.stringify(left.unread) !== JSON.stringify(right.unread) ||
      JSON.stringify(left.clearedAt) !== JSON.stringify(right.clearedAt) ||
      JSON.stringify(left.lastMessageHiddenAt) !== JSON.stringify(right.lastMessageHiddenAt) ||
      JSON.stringify(left.lastVisibleMessage) !== JSON.stringify(right.lastVisibleMessage) ||
      JSON.stringify(left.lastVisibleMessageAt) !== JSON.stringify(right.lastVisibleMessageAt)
    ) {
      return false;
    }
  }
  return true;
}

export function useChatUnread(currentUser: ChatUser | null) {
  const [totalUnread, setTotalUnread] = useState(0);

  useEffect(() => {
    if (!currentUser) {
      setTotalUnread(0);
      return;
    }

    const unsub = subscribeMyConversations(currentUser.uid, (convs) => {
      const nextTotal = totalUnreadFor(convs, currentUser.uid);
      setTotalUnread((prev) => (prev === nextTotal ? prev : nextTotal));
    });

    return () => unsub?.();
  }, [currentUser?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  return totalUnread;
}

export function useChat(currentUser: ChatUser | null) {
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeOtherUid, setActiveOtherUid] = useState<string | null>(null);
  const [messages, setMessages] = useState<PrivateChatMessage[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeClearedAt =
    currentUser && activeChatId
      ? conversations.find((c) => c.chatId === activeChatId)?.clearedAt[currentUser.uid] ?? 0
      : 0;

  // ─── Subscreve minhas conversas ───────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) {
      setConversations([]);
      setLoadingConvs(false);
      return;
    }
    setLoadingConvs(true);
    const unsub = subscribeMyConversations(currentUser.uid, (convs) => {
      setConversations((prev) => (conversationsAreEqual(prev, convs) ? prev : convs));
      setLoadingConvs(false);
    });
    if (!unsub) setLoadingConvs(false);
    return () => unsub?.();
  }, [currentUser?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Subscreve mensagens do chat ativo ────────────────────────────────────
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    setLoadingMsgs(true);
    if (!currentUser) {
      setMessages([]);
      setLoadingMsgs(false);
      return;
    }
    const unsub = subscribePrivateChatMessages(activeChatId, currentUser.uid, activeClearedAt, (msgs) => {
      setMessages(msgs);
      setLoadingMsgs(false);
    });
    if (!unsub) setLoadingMsgs(false);
    return () => unsub?.();
  }, [activeChatId, activeClearedAt, currentUser?.uid]);

  // ─── Abre conversa com outro usuário ─────────────────────────────────────
  const openConversation = useCallback(
    async (otherUser: AvailableChatUser) => {
      if (!currentUser) return;
      setActiveOtherUid(otherUser.uid);
      const chatId = await ensurePrivateChat(
        currentUser.uid,
        currentUser.nome,
        otherUser.uid,
        otherUser.nome,
      );
      setActiveChatId(chatId);
      markConversationRead(chatId, currentUser.uid).catch(() => {});
    },
    [currentUser],
  );

  // ─── Fecha conversa ───────────────────────────────────────────────────────
  const closeConversation = useCallback(() => {
    setActiveChatId(null);
    setActiveOtherUid(null);
    setMessages([]);
  }, []);

  // ─── Envia mensagem ───────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (texto: string) => {
      if (!currentUser || !activeChatId || !texto.trim()) return;
      const conv = conversations.find((c) => c.chatId === activeChatId);
      const receiverUid = conv?.participants.find((p) => p !== currentUser.uid) ?? activeOtherUid ?? '';
      if (!receiverUid) return;
      setSending(true);
      setError(null);
      try {
        await sendPrivateMessage(
          activeChatId,
          currentUser.uid,
          currentUser.nome,
          receiverUid,
          texto,
        );
      } catch (e) {
        setError('Falha ao enviar mensagem. Tente novamente.');
        console.error('Falha ao enviar mensagem.', e);
      } finally {
        setSending(false);
      }
    },
    [currentUser, activeChatId, activeOtherUid, conversations],
  );

  // ─── Abre conversa existente (sem chamar ensurePrivateChat) ─────────────
  // Evita reescrita desnecessária no Firestore que apagava o preview/histórico
  const switchToConversation = useCallback(
    (chatId: string, otherUid: string) => {
      setActiveChatId(chatId);
      setActiveOtherUid(otherUid);
      if (currentUser) markConversationRead(chatId, currentUser.uid).catch(() => {});
    },
    [currentUser],
  );

  // ─── Edita mensagem ───────────────────────────────────────────────────────
  const editMessage = useCallback(
    async (messageId: string, texto: string) => {
      if (!activeChatId || !texto.trim()) return;
      try {
        await editPrivateMessage(activeChatId, messageId, texto);
      } catch (e) {
        setError('Falha ao editar mensagem. Tente novamente.');
        console.error('Falha ao editar mensagem.', e);
      }
    },
    [activeChatId],
  );

  // ─── Apaga mensagem ───────────────────────────────────────────────────────
  const deleteMessage = useCallback(
    async (message: PrivateChatMessage, scope: DeletePrivateMessageScope) => {
      if (!activeChatId || !currentUser) return;
      if (
        scope === 'everyone' &&
        (message.senderUid !== currentUser.uid || !canDeletePrivateMessageForEveryone(message))
      ) {
        setError('O prazo para apagar para todos acabou. Você ainda pode apagar só para você.');
        return;
      }
      try {
        await deletePrivateMessage(activeChatId, message.id, currentUser.uid, scope, message.createdAt);
      } catch (e) {
        const expired = e instanceof Error && e.message === 'DELETE_FOR_EVERYONE_EXPIRED';
        setError(expired ? 'O prazo para apagar para todos acabou.' : 'Falha ao apagar mensagem. Tente novamente.');
        console.error('Falha ao apagar mensagem.', e);
      }
    },
    [activeChatId, currentUser],
  );

  // ─── Apaga conversa somente para mim ───────────────────────────────────────
  const clearConversation = useCallback(
    async () => {
      if (!activeChatId || !currentUser) return;
      try {
        await clearPrivateChatForMe(activeChatId, currentUser.uid);
        closeConversation();
      } catch (e) {
        setError('Falha ao apagar conversa. Tente novamente.');
        console.error('Falha ao apagar conversa.', e);
      }
    },
    [activeChatId, closeConversation, currentUser],
  );

  // ─── Marca conversa como lida ─────────────────────────────────────────────
  const markRead = useCallback(
    (chatId: string) => {
      if (!currentUser) return;
      markConversationRead(chatId, currentUser.uid).catch(() => {});
    },
    [currentUser],
  );

  // ─── Total de não lidas ───────────────────────────────────────────────────
  const totalUnread = conversations.reduce((sum, c) => {
    if (!currentUser || !isConversationVisibleForUser(c, currentUser.uid)) return sum;
    return sum + (c.unread[currentUser.uid] ?? 0);
  }, 0);

  return {
    conversations,
    activeChatId,
    activeOtherUid,
    messages,
    loadingConvs,
    loadingMsgs,
    sending,
    error,
    totalUnread,
    openConversation,
    switchToConversation,
    closeConversation,
    sendMessage,
    editMessage,
    deleteMessage,
    clearConversation,
    markRead,
  };
}
