import React from 'react';
import { TeamChatView, type TeamChatUser } from './TeamChatView';
import { useChat, type ChatUser } from '../../controllers/useChat';
import { useGeneralChat } from '../../controllers/useGeneralChat';

interface TeamChatScreenProps {
  currentUser: ChatUser | null;
  availableUsers: TeamChatUser[];
  onlineUids: Set<string>;
}

export const TeamChatScreen = React.memo(function TeamChatScreen({
  currentUser,
  availableUsers,
  onlineUids,
}: TeamChatScreenProps) {
  const chat = useChat(currentUser);
  const generalChat = useGeneralChat(currentUser);
  const generalMentionUsers = React.useMemo(() => {
    const byUid = new Map<string, TeamChatUser>();
    if (currentUser?.uid) {
      byUid.set(currentUser.uid, { uid: currentUser.uid, nome: currentUser.nome, email: '' });
    }
    for (const user of availableUsers) {
      if (user.uid) byUid.set(user.uid, user);
    }
    return Array.from(byUid.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [availableUsers, currentUser]);
  // +1 para incluir o usuário atual
  const memberCount = availableUsers.length + 1;

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
      onlineUids={onlineUids}
      onOpenConversation={chat.openConversation}
      onSwitchConversation={chat.switchToConversation}
      onCloseConversation={chat.closeConversation}
      onSend={chat.sendMessage}
      onEditMessage={chat.editMessage}
      onDeleteMessage={chat.deleteMessage}
      onClearConversation={chat.clearConversation}
      onMarkRead={chat.markRead}
      generalMessages={generalChat.messages}
      generalChatLoading={generalChat.loading}
      generalChatSending={generalChat.sending}
      generalChatError={generalChat.error}
      generalChatHasUnread={generalChat.hasUnread}
      generalChatMemberCount={memberCount}
      generalMentionUsers={generalMentionUsers}
      onGeneralChatMarkRead={generalChat.markRead}
      onSendGeneralMessage={generalChat.sendMessage}
    />
  );
});
