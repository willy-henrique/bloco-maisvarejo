import React from 'react';
import { TeamChatView, type TeamChatUser } from './TeamChatView';
import { useChat, type ChatUser } from '../../controllers/useChat';

interface TeamChatScreenProps {
  currentUser: ChatUser | null;
  availableUsers: TeamChatUser[];
}

export const TeamChatScreen = React.memo(function TeamChatScreen({
  currentUser,
  availableUsers,
}: TeamChatScreenProps) {
  const chat = useChat(currentUser);

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
