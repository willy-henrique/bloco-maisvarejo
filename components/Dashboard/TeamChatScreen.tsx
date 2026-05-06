import React, { useEffect, useRef } from 'react';
import { TeamChatView, type TeamChatUser } from './TeamChatView';
import { useChat, type ChatUser } from '../../controllers/useChat';

interface TeamChatScreenProps {
  currentUser: ChatUser | null;
  availableUsers: TeamChatUser[];
  systemNotificationsEnabled: boolean;
}

export const TeamChatScreen = React.memo(function TeamChatScreen({
  currentUser,
  availableUsers,
  systemNotificationsEnabled,
}: TeamChatScreenProps) {
  const chat = useChat(currentUser);
  const seenPrivateMsgIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    seenPrivateMsgIds.current = new Set();
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!chat.activeChatId || chat.loadingMsgs) return;
    const newMsgs = chat.messages.filter(
      (m) => !m.deletedForEveryone && m.senderUid !== (currentUser?.uid ?? '') && !seenPrivateMsgIds.current.has(m.id),
    );
    newMsgs.forEach((m) => seenPrivateMsgIds.current.add(m.id));
    if (newMsgs.length === 0) return;

    if (
      systemNotificationsEnabled &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      const first = newMsgs[0];
      const notification = new Notification(`Mensagem de ${first.senderNome}`, {
        body: first.texto.slice(0, 100) + (first.texto.length > 100 ? '...' : ''),
        tag: `private-chat-${first.id}`,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  }, [chat.messages, chat.loadingMsgs, chat.activeChatId, currentUser?.uid, systemNotificationsEnabled]);

  return (
    <TeamChatView
      currentUid={currentUser?.uid ?? ''}
      availableUsers={availableUsers}
      conversations={chat.conversations}
      activeChatId={chat.activeChatId}
      activeOtherUid={chat.activeOtherUid}
      messages={chat.messages}
      loadingConvs={chat.loadingConvs}
      loadingMsgs={chat.loadingMsgs}
      sending={chat.sending}
      error={chat.error}
      onOpenConversation={chat.openConversation}
      onSwitchConversation={chat.switchToConversation}
      onCloseConversation={chat.closeConversation}
      onSend={chat.sendMessage}
      onEditMessage={chat.editMessage}
      onDeleteMessage={chat.deleteMessage}
      onClearConversation={chat.clearConversation}
      onMarkRead={chat.markRead}
    />
  );
});
