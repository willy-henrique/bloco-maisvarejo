import React, { useState, useRef, useEffect, useMemo, useCallback, type KeyboardEvent } from 'react';
import { Send, ChevronLeft, Search, Trash2, MessageSquare, Plus, X, ArrowLeft, Pencil, Check } from 'lucide-react';
import {
  DELETED_MESSAGE_TEXT,
  DELETE_FOR_EVERYONE_WINDOW_MS,
  canDeletePrivateMessageForEveryone,
  getConversationPreviewForUser,
  isConversationVisibleForUser,
  type ConversationMeta,
  type DeletePrivateMessageScope,
  type PrivateChatMessage,
} from '../../services/chatService';
import { Modal } from '../Shared/Modal';

// ─── tipos ────────────────────────────────────────────────────────────────────

export interface TeamChatUser {
  uid: string;
  nome: string;
  email: string;
}

interface TeamChatViewProps {
  currentUid: string;
  availableUsers: TeamChatUser[];
  conversations: ConversationMeta[];
  activeChatId: string | null;
  activeOtherUid: string | null;
  messages: PrivateChatMessage[];
  loadingConvs: boolean;
  loadingMsgs: boolean;
  sending: boolean;
  error: string | null;
  onOpenConversation: (user: TeamChatUser) => Promise<void>;
  onSwitchConversation: (chatId: string, otherUid: string) => void;
  onCloseConversation: () => void;
  onSend: (texto: string) => Promise<void>;
  onEditMessage: (messageId: string, texto: string) => Promise<void>;
  onDeleteMessage: (message: PrivateChatMessage, scope: DeletePrivateMessageScope) => Promise<void>;
  onClearConversation: () => Promise<void>;
  onMarkRead: (chatId: string) => void;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function initials(nome: string) {
  return nome.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase();
}

function fmtHour(ts: number) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtShort(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return fmtHour(ts);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function fmtDayLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date(today); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === y.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

function dayKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];
function avatarBg(uid: string) {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

const Av = React.memo(function Av({ uid, nome, size = 34 }: { uid: string; nome: string; size?: number }) {
  return (
    <div
      style={{ width: size, height: size, background: avatarBg(uid), fontSize: size * 0.38, flexShrink: 0 }}
      className="rounded-full flex items-center justify-center font-semibold text-white select-none"
    >
      {initials(nome)}
    </div>
  );
});

const DeleteMessageModal = React.memo(function DeleteMessageModal({
  message,
  currentUid,
  deletingScope,
  onClose,
  onDelete,
}: {
  message: PrivateChatMessage | null;
  currentUid: string;
  deletingScope: DeletePrivateMessageScope | null;
  onClose: () => void;
  onDelete: (scope: DeletePrivateMessageScope) => void;
}) {
  const isOpen = Boolean(message);
  const isOwn = message?.senderUid === currentUid;
  const canDeleteEveryone = Boolean(message && isOwn && canDeletePrivateMessageForEveryone(message));
  const expired = Boolean(message && isOwn && !message.deletedForEveryone && !canDeleteEveryone);
  const minutes = Math.round(DELETE_FOR_EVERYONE_WINDOW_MS / 60000);
  const busy = deletingScope !== null;

  return (
    <Modal isOpen={isOpen} onClose={busy ? () => {} : onClose} title="Apagar mensagem" maxWidth="sm">
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-200">
          {canDeleteEveryone
            ? 'Escolha como deseja apagar esta mensagem.'
            : 'Esta mensagem será removida apenas da sua conversa.'}
        </p>

        {expired && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
            O prazo de {minutes} minutos para apagar para todos acabou. Agora só é possível apagar para você.
          </p>
        )}

        {message?.deletedForEveryone && (
          <p className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs leading-relaxed text-slate-300">
            Esta mensagem já foi apagada para todos. Você ainda pode remover o aviso da sua conversa.
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-[40px] rounded-lg border border-slate-700 px-4 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onDelete('me')}
            disabled={busy}
            className="min-h-[40px] rounded-lg bg-slate-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-600 disabled:opacity-50"
          >
            {deletingScope === 'me' ? 'Apagando...' : 'Apagar para mim'}
          </button>
          {canDeleteEveryone && (
            <button
              type="button"
              onClick={() => onDelete('everyone')}
              disabled={busy}
              className="min-h-[40px] rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
            >
              {deletingScope === 'everyone' ? 'Apagando...' : 'Apagar para todos'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
});

const ClearConversationModal = React.memo(function ClearConversationModal({
  otherName,
  isOpen,
  clearing,
  onClose,
  onConfirm,
}: {
  otherName: string;
  isOpen: boolean;
  clearing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal isOpen={isOpen} onClose={clearing ? () => {} : onClose} title="Apagar conversa" maxWidth="sm">
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-200">
          Apagar a conversa com {otherName}? As mensagens somem apenas para você. A outra pessoa continua com o histórico.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={clearing}
            className="min-h-[40px] rounded-lg border border-slate-700 px-4 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={clearing}
            className="min-h-[40px] rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
          >
            {clearing ? 'Apagando...' : 'Apagar só para mim'}
          </button>
        </div>
      </div>
    </Modal>
  );
});

// ─── Nova conversa overlay ────────────────────────────────────────────────────

const NewChatOverlay = React.memo(function NewChatOverlay({
  currentUid,
  availableUsers,
  onSelect,
  onClose,
}: {
  currentUid: string;
  availableUsers: TeamChatUser[];
  onSelect: (u: TeamChatUser) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const lq = q.toLowerCase();
    return availableUsers
      .filter((u) => u.uid !== currentUid && (!lq || u.nome.toLowerCase().includes(lq) || u.email.toLowerCase().includes(lq)))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [availableUsers, currentUid, q]);

  return (
    <div className="flex flex-col h-full" style={{ background: '#0b1728' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg transition-colors"
          style={{ color: '#9fb6d8' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#9fb6d8')}
        >
          <ArrowLeft size={16} />
        </button>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b8c7dc' }}>
          Nova conversa
        </span>
      </div>

      {/* Search */}
      <div className="px-3 pb-2 shrink-0">
        <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 border" style={{ background: '#12243a', borderColor: '#24364d' }}>
          <Search size={12} className="shrink-0" style={{ color: '#9fb6d8' }} />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar colaborador…"
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400"
            style={{ color: '#f8fafc' }}
          />
          {q && (
            <button type="button" onClick={() => setQ('')}>
              <X size={11} style={{ color: '#9fb6d8' }} />
            </button>
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-center text-xs pt-8" style={{ color: '#94a3b8' }}>Nenhum resultado.</p>
        )}
        {filtered.map((user) => (
          <button
            key={user.uid}
            type="button"
            onClick={() => onSelect(user)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
            onMouseEnter={(e) => (e.currentTarget.style.background = '#111f30')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '')}
          >
            <Av uid={user.uid} nome={user.nome} size={34} />
            <div className="min-w-0">
              <p className="text-[13px] font-medium truncate" style={{ color: '#f8fafc' }}>{user.nome}</p>
              <p className="text-[11px] truncate" style={{ color: '#9fb6d8' }}>{user.email}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
});

// ─── Sidebar (conversas existentes) ──────────────────────────────────────────

const Sidebar = React.memo(function Sidebar({
  currentUid,
  availableUsers,
  conversations,
  activeChatId,
  onSelectConv,
  onNewChat,
}: {
  currentUid: string;
  availableUsers: TeamChatUser[];
  conversations: ConversationMeta[];
  activeChatId: string | null;
  onSelectConv: (conv: ConversationMeta, otherUser: TeamChatUser) => void;
  onNewChat: () => void;
}) {
  // Resolve o outro usuário de cada conversa
  const convList = useMemo(() => {
    return conversations
      .filter((conv) => isConversationVisibleForUser(conv, currentUid))
      .map((conv) => {
        const otherUid = conv.participants.find((p) => p !== currentUid) ?? '';
        const found = availableUsers.find((u) => u.uid === otherUid);
        const nome = found?.nome ?? conv.participantNames[otherUid] ?? otherUid;
        const email = found?.email ?? '';
        return { conv, otherUser: { uid: otherUid, nome, email } as TeamChatUser, preview: getConversationPreviewForUser(conv, currentUid) };
      })
      .sort((a, b) => (b.preview.at ?? 0) - (a.preview.at ?? 0));
  }, [conversations, availableUsers, currentUid]);

  return (
    <div className="flex flex-col h-full" style={{ background: '#0b1728' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} style={{ color: '#9fb6d8' }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#b8c7dc' }}>
            Mensagens
          </span>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          title="Nova conversa"
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
          style={{ background: '#143156', color: '#dbeafe' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#1d4ed8';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#143156';
            e.currentTarget.style.color = '#dbeafe';
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {convList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4 pb-8">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#12243a' }}>
              <MessageSquare size={18} style={{ color: '#60a5fa' }} />
            </div>
            <div className="text-center">
              <p className="text-xs font-medium" style={{ color: '#cbd5e1' }}>Sem conversas ainda</p>
              <p className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>
                Clique em <strong style={{ color: '#3b82f6' }}>+</strong> para iniciar
              </p>
            </div>
          </div>
        ) : (
          convList.map(({ conv, otherUser, preview }) => {
            const unread = conv.unread[currentUid] ?? 0;
            const active = conv.chatId === activeChatId;

            return (
              <button
                key={conv.chatId}
                type="button"
                onClick={() => onSelectConv(conv, otherUser)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all relative"
                style={{ background: active ? '#132943' : undefined }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#10233a'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = ''; }}
              >
                {active && (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full" style={{ background: '#3b82f6' }} />
                )}
                <Av uid={otherUser.uid} nome={otherUser.nome} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline gap-1">
                    <span
                      className="text-[13px] truncate"
                      style={{ color: '#f8fafc', fontWeight: unread > 0 ? 700 : 600 }}
                    >
                      {otherUser.nome}
                    </span>
                    {preview.at && (
                      <span className="text-[10px] shrink-0" style={{ color: unread > 0 ? '#93c5fd' : '#8aa4c2' }}>
                        {fmtShort(preview.at)}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center mt-0.5">
                    <span className="text-[11px] truncate pr-1" style={{ color: unread > 0 ? '#c7d2fe' : '#9fb6d8' }}>
                      {preview.text || '—'}
                    </span>
                    {unread > 0 && (
                      <span
                        className="shrink-0 min-w-[16px] h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center px-1"
                        style={{ background: '#3b82f6' }}
                      >
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
});

// ─── Chat Panel ───────────────────────────────────────────────────────────────

const ChatPanel = React.memo(function ChatPanel({
  currentUid, activeChatId, otherUser, messages, loadingMsgs,
  sending, error, onSend, onEditMessage, onDeleteMessage, onClearConversation, onBack, showBack,
}: {
  currentUid: string;
  activeChatId: string | null;
  otherUser: TeamChatUser | null;
  messages: PrivateChatMessage[];
  loadingMsgs: boolean;
  sending: boolean;
  error: string | null;
  onSend: (t: string) => Promise<void>;
  onEditMessage: (id: string, text: string) => Promise<void>;
  onDeleteMessage: (message: PrivateChatMessage, scope: DeletePrivateMessageScope) => Promise<void>;
  onClearConversation: () => Promise<void>;
  onBack: () => void;
  showBack: boolean;
}) {
  const [text, setText] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PrivateChatMessage | null>(null);
  const [deletingScope, setDeletingScope] = useState<DeletePrivateMessageScope | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [showClearChat, setShowClearChat] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);

  useEffect(() => {
    if (atBottom.current) listRef.current?.scrollTo({ top: 9999999 });
  }, [messages]);

  useEffect(() => {
    if (!loadingMsgs) setTimeout(() => listRef.current?.scrollTo({ top: 9999999 }), 50);
  }, [loadingMsgs, activeChatId]);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  const doSend = useCallback(async () => {
    const t = text.trim();
    if (!t || sending) return;
    setText('');
    if (taRef.current) taRef.current.style.height = 'auto';
    await onSend(t);
    setTimeout(() => listRef.current?.scrollTo({ top: 9999999 }), 80);
  }, [text, sending, onSend]);

  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px';
  }, []);

  const handleTextareaKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void doSend(); }
  }, [doSend]);

  const doDelete = useCallback(async (scope: DeletePrivateMessageScope) => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setDeletingScope(scope);
    try {
      await onDeleteMessage(deleteTarget, scope);
      setDeleteTarget(null);
    } finally {
      setDeletingId(null);
      setDeletingScope(null);
    }
  }, [deleteTarget, onDeleteMessage]);

  const doClearChat = useCallback(async () => {
    setClearingChat(true);
    try {
      await onClearConversation();
      setShowClearChat(false);
    } finally {
      setClearingChat(false);
    }
  }, [onClearConversation]);

  const startEdit = useCallback((msg: PrivateChatMessage) => {
    setEditingId(msg.id);
    setEditingText(msg.texto);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingText('');
  }, []);

  const doEdit = useCallback(async () => {
    if (!editingId) return;
    const next = editingText.trim();
    if (!next) return;
    setSavingEditId(editingId);
    try {
      await onEditMessage(editingId, next);
      cancelEdit();
    } finally {
      setSavingEditId(null);
    }
  }, [editingId, editingText, onEditMessage, cancelEdit]);

  const grouped = useMemo(() => {
    const m = new Map<string, PrivateChatMessage[]>();
    for (const msg of messages) {
      const k = dayKey(msg.createdAt);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(msg);
    }
    return Array.from(m.entries());
  }, [messages]);

  if (!activeChatId || !otherUser) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3" style={{ background: '#071321' }}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#12243a' }}>
          <MessageSquare size={20} style={{ color: '#60a5fa' }} />
        </div>
        <p className="text-sm" style={{ color: '#cbd5e1' }}>Selecione ou inicie uma conversa</p>
      </div>
    );
  }

  return (
    <>
    <div className="flex flex-col h-full" style={{ background: '#071321' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 shrink-0 border-b"
        style={{ borderColor: '#24364d', background: '#0d1b2a' }}
      >
        {showBack && (
          <button type="button" onClick={onBack} style={{ color: '#9fb6d8' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#9fb6d8')}
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <Av uid={otherUser.uid} nome={otherUser.nome} size={32} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold" style={{ color: '#f8fafc' }}>{otherUser.nome}</p>
          {otherUser.email && (
            <p className="text-[11px] truncate" style={{ color: '#9fb6d8' }}>{otherUser.email}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowClearChat(true)}
          className="w-8 h-8 rounded-lg flex items-center justify-center border transition-colors"
          style={{ color: '#fecaca', background: '#2a1620', borderColor: '#7f1d1d' }}
          title="Apagar conversa"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Mensagens */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-5 py-4 min-h-0"
      >
        {loadingMsgs && (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs" style={{ color: '#94a3b8' }}>Carregando…</span>
          </div>
        )}

        {!loadingMsgs && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Av uid={otherUser.uid} nome={otherUser.nome} size={40} />
            <p className="text-xs" style={{ color: '#cbd5e1' }}>Diga olá para {otherUser.nome}!</p>
          </div>
        )}

        {!loadingMsgs && grouped.map(([dk, dayMsgs]) => (
          <div key={dk}>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px" style={{ background: '#24364d' }} />
              <span className="text-[10px] uppercase tracking-widest" style={{ color: '#8db3eb' }}>
                {fmtDayLabel(dayMsgs[0].createdAt)}
              </span>
              <div className="flex-1 h-px" style={{ background: '#24364d' }} />
            </div>

            <div className="flex flex-col gap-0.5">
              {dayMsgs.map((msg, idx) => {
                const isOwn = msg.senderUid === currentUid;
                const prev = dayMsgs[idx - 1];
                const next = dayMsgs[idx + 1];
                const samePrev = prev?.senderUid === msg.senderUid;
                const sameNext = next?.senderUid === msg.senderUid;
                const showTime = !sameNext || (next && dayKey(next.createdAt) !== dk);
                const isDel = deletingId === msg.id;
                const isEditing = editingId === msg.id;
                const isSavingEdit = savingEditId === msg.id;
                const isDeletedForEveryone = msg.deletedForEveryone === true;

                const br = isOwn
                  ? `14px 4px ${sameNext ? '4px' : '14px'} 14px`
                  : `4px 14px 14px ${sameNext ? '4px' : '14px'}`;

                return (
                  <div
                    key={msg.id}
                    className={`flex items-end gap-2 group ${isOwn ? 'flex-row-reverse' : 'flex-row'} ${samePrev ? 'mt-0.5' : 'mt-3'}`}
                  >
                    {!isOwn && (
                      <div className="w-7 shrink-0">
                        {!sameNext && <Av uid={msg.senderUid} nome={msg.senderNome} size={26} />}
                      </div>
                    )}

                    <div className={`flex items-end gap-1 max-w-[62%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                      {!isEditing && (
                        <div className="flex items-center gap-1 mb-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                          {isOwn && !isDeletedForEveryone && (
                            <button
                              type="button"
                              disabled={isDel}
                              onClick={() => startEdit(msg)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center border transition-colors disabled:opacity-40"
                              style={{ color: '#bfdbfe', background: '#10233a', borderColor: '#244768' }}
                              title="Editar mensagem"
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isDel}
                            onClick={() => setDeleteTarget(msg)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center border transition-colors disabled:opacity-40"
                            style={{ color: '#fecaca', background: '#2a1620', borderColor: '#7f1d1d' }}
                            title="Apagar mensagem"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}

                      <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                        {!isOwn && !samePrev && (
                          <p className="text-[10px] mb-0.5 ml-0.5" style={{ color: '#aac0de' }}>{msg.senderNome}</p>
                        )}
                        {isEditing ? (
                          <div
                            className="w-[min(520px,78vw)] rounded-2xl border p-2"
                            style={{ background: '#10233a', borderColor: '#3b82f6' }}
                          >
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') cancelEdit();
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  void doEdit();
                                }
                              }}
                              className="w-full min-h-[72px] resize-none rounded-xl border bg-transparent px-3 py-2 text-[13px] leading-relaxed outline-none placeholder:text-slate-400"
                              style={{ color: '#f8fafc', borderColor: '#244768' }}
                              autoFocus
                            />
                            <div className="mt-2 flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="w-8 h-8 rounded-lg flex items-center justify-center border"
                                style={{ color: '#cbd5e1', borderColor: '#475569', background: '#0b1728' }}
                                title="Cancelar edicao"
                              >
                                <X size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void doEdit()}
                                disabled={isSavingEdit || !editingText.trim()}
                                className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-40"
                                style={{ color: '#fff', background: '#2563eb' }}
                                title="Salvar edicao"
                              >
                                <Check size={15} />
                              </button>
                            </div>
                          </div>
                        ) : (
	                          <div
	                            className={`px-3 py-1.5 text-[13px] leading-relaxed break-words whitespace-pre-wrap transition-opacity ${isDeletedForEveryone ? 'italic' : ''}`}
	                            style={{
	                              borderRadius: br,
	                              background: isDeletedForEveryone ? '#12243a' : isOwn ? '#2563eb' : '#172a43',
	                              color: isDeletedForEveryone ? '#9fb6d8' : isOwn ? '#ffffff' : '#e5eefc',
	                              opacity: isDel ? 0.3 : 1,
	                            }}
	                          >
	                            {isDeletedForEveryone ? DELETED_MESSAGE_TEXT : msg.texto}
	                          </div>
                        )}
                        {showTime && (
	                          <p className="text-[9px] mt-0.5 mx-0.5" style={{ color: '#8aa4c2' }}>
	                            {fmtHour(msg.createdAt)}{msg.editedAt && !isDeletedForEveryone ? ' · editada' : ''}
	                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="px-4 py-3 shrink-0 border-t" style={{ borderColor: '#24364d', background: '#0d1b2a' }}>
        {error && <p className="text-[11px] mb-2" style={{ color: '#ef4444' }}>{error}</p>}
        <div className="flex items-end gap-2">
          <div
            className="flex-1 rounded-xl px-3 py-2 border transition-colors"
            style={{ background: '#12243a', borderColor: '#24364d' }}
            onFocusCapture={(e) => (e.currentTarget.style.borderColor = '#3b82f6')}
            onBlurCapture={(e) => (e.currentTarget.style.borderColor = '#24364d')}
          >
            <textarea
              ref={taRef}
              value={text}
              onChange={handleTextareaChange}
              onKeyDown={handleTextareaKeyDown}
              placeholder={`Mensagem para ${otherUser.nome}…`}
              rows={1}
              className="w-full bg-transparent text-[13px] outline-none resize-none leading-relaxed placeholder:text-slate-400"
              style={{ color: '#f8fafc', maxHeight: 96 }}
            />
          </div>
          <button
            type="button"
            onClick={() => void doSend()}
            disabled={!text.trim() || sending}
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:opacity-25"
            style={{ background: '#1d4ed8' }}
          >
            <Send size={14} className="text-white translate-x-px" />
          </button>
        </div>
      </div>
    </div>
    <DeleteMessageModal
      message={deleteTarget}
      currentUid={currentUid}
      deletingScope={deletingScope}
      onClose={() => setDeleteTarget(null)}
      onDelete={(scope) => void doDelete(scope)}
    />
    <ClearConversationModal
      otherName={otherUser.nome}
      isOpen={showClearChat}
      clearing={clearingChat}
      onClose={() => setShowClearChat(false)}
      onConfirm={() => void doClearChat()}
    />
    </>
  );
});

// ─── Root ─────────────────────────────────────────────────────────────────────

export const TeamChatView: React.FC<TeamChatViewProps> = ({
  currentUid, availableUsers, conversations, activeChatId, activeOtherUid,
  messages, loadingConvs, loadingMsgs, sending, error,
  onOpenConversation, onSwitchConversation, onCloseConversation, onSend, onEditMessage, onDeleteMessage, onClearConversation, onMarkRead,
}) => {
  const [mobileChat, setMobileChat] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);

  const otherUser = useMemo(() => {
    if (!activeOtherUid) return null;
    const found = availableUsers.find((u) => u.uid === activeOtherUid);
    if (found) return found;
    const conv = conversations.find((c) => c.chatId === activeChatId);
    return conv
      ? { uid: activeOtherUid, nome: conv.participantNames[activeOtherUid] ?? activeOtherUid, email: '' }
      : null;
  }, [activeOtherUid, availableUsers, conversations, activeChatId]);

  useEffect(() => {
    if (activeChatId) onMarkRead(activeChatId);
  }, [activeChatId, onMarkRead]);

  const handleSelectUser = useCallback(async (user: TeamChatUser) => {
    setShowNewChat(false);
    setMobileChat(true);
    await onOpenConversation(user);
  }, [onOpenConversation]);

  const handleSelectConv = useCallback((conv: ConversationMeta, user: TeamChatUser) => {
    setMobileChat(true);
    onSwitchConversation(conv.chatId, user.uid);
  }, [onSwitchConversation]);

  const handleBack = useCallback(() => {
    setMobileChat(false);
    onCloseConversation();
  }, [onCloseConversation]);

  const handleClearConversation = useCallback(async () => {
    await onClearConversation();
    setMobileChat(false);
  }, [onClearConversation]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Painel esquerdo */}
      <div
        className={`${mobileChat ? 'hidden sm:flex' : 'flex'} flex-col shrink-0 border-r relative`}
        style={{ width: 240, borderColor: '#24364d' }}
      >
        {loadingConvs ? (
          <div className="flex items-center justify-center h-full" style={{ background: '#0b1728' }}>
            <span className="text-xs" style={{ color: '#94a3b8' }}>Carregando…</span>
          </div>
        ) : showNewChat ? (
          <NewChatOverlay
            currentUid={currentUid}
            availableUsers={availableUsers}
            onSelect={(u) => void handleSelectUser(u)}
            onClose={() => setShowNewChat(false)}
          />
        ) : (
          <Sidebar
            currentUid={currentUid}
            availableUsers={availableUsers}
            conversations={conversations}
            activeChatId={activeChatId}
            onSelectConv={(conv, user) => void handleSelectConv(conv, user)}
            onNewChat={() => setShowNewChat(true)}
          />
        )}
      </div>

      {/* Chat */}
      <div className={`${!mobileChat ? 'hidden sm:flex' : 'flex'} flex-col flex-1 min-w-0`}>
        <ChatPanel
          currentUid={currentUid}
          activeChatId={activeChatId}
          otherUser={otherUser}
          messages={messages}
          loadingMsgs={loadingMsgs}
          sending={sending}
          error={error}
          onSend={onSend}
          onEditMessage={onEditMessage}
          onDeleteMessage={onDeleteMessage}
          onClearConversation={handleClearConversation}
          onBack={handleBack}
          showBack={mobileChat}
        />
      </div>
    </div>
  );
};
