import React, { useState, useMemo } from 'react';
import {
  Plus,
  Trash2,
  CalendarDays,
  Bell,
  BellOff,
  Clock,
  ChevronDown,
  ChevronRight,
  Pencil,
  X,
  Check,
  Users,
  Search,
} from 'lucide-react';
import type { AgendaItem, AgendaMember, AgendaStatus } from '../../types';
import type { AgendaEventInvite, AgendaInviteStatus, AgendaSharedUser, SharedAgendaEntry } from '../../services/agendaService';
import { Modal } from '../Shared/Modal';
import { GoogleCalendarPanel, type GoogleCalendarEvent, useGoogleCalendar } from './GoogleCalendarPanel';

interface AgendaViewProps {
  items: AgendaItem[];
  loading: boolean;
  onAdd: (item: Omit<AgendaItem, 'id' | 'status' | 'created_at'> & { status?: AgendaStatus }) => void;
  onSetStatus: (id: string, status: AgendaStatus) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, changes: Partial<Omit<AgendaItem, 'id' | 'status' | 'created_at'>>) => void;
  availableUsers: AgendaSharedUser[];
  incomingEventInvites: AgendaEventInvite[];
  outgoingEventInvites: AgendaEventInvite[];
  sharedAgendas: SharedAgendaEntry[];
  sharingLoading: boolean;
  systemNotificationsSupported: boolean;
  systemNotificationPermission: NotificationPermission;
  systemNotificationsEnabled: boolean;
  onEnableSystemNotifications: () => void | Promise<void>;
  onToggleSystemNotifications: () => void | Promise<void>;
  onRespondEventInvite: (
    ownerUid: string,
    eventId: string,
    status: Exclude<AgendaInviteStatus, 'pending'>,
    rejectionReason?: string,
  ) => Promise<string | null>;
}

const STATUS_CFG: Record<AgendaStatus, { label: string; cls: string; dot: string }> = {
  pendente: {
    label: 'Pendente',
    cls: 'text-slate-400 bg-slate-700/60 border-slate-600',
    dot: 'bg-slate-400',
  },
  em_andamento: {
    label: 'Em andamento',
    cls: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
    dot: 'bg-blue-400 animate-pulse',
  },
  concluido: {
    label: 'Concluído',
    cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
};

const INVITE_STATUS_CFG: Record<AgendaInviteStatus, { label: string; cls: string }> = {
  pending: {
    label: 'Aguardando aceite',
    cls: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  },
  accepted: {
    label: 'Aceito',
    cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  },
  declined: {
    label: 'Recusado',
    cls: 'text-red-300 bg-red-500/10 border-red-500/30',
  },
};

const STATUS_OPTIONS: AgendaStatus[] = ['pendente', 'em_andamento', 'concluido'];

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
}

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function toLocalISOString(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function isToday(ts: number): boolean {
  return dayKey(ts) === dayKey(Date.now());
}

function isTomorrow(ts: number): boolean {
  return dayKey(ts) === dayKey(Date.now() + 86400000);
}

function isPast(ts: number): boolean {
  return ts < Date.now() && !isToday(ts);
}

function dayLabel(ts: number): string {
  if (isToday(ts)) return 'Hoje';
  if (isTomorrow(ts)) return 'Amanhã';
  return fmtDate(ts);
}

function mergeUsers(base: AgendaSharedUser[], selected: AgendaMember[]): AgendaSharedUser[] {
  const byUid = new Map<string, AgendaSharedUser>();
  for (const user of base) byUid.set(user.uid, user);
  for (const user of selected) {
    if (!byUid.has(user.uid)) byUid.set(user.uid, user);
  }
  return Array.from(byUid.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function selectedMembers(users: AgendaSharedUser[], selectedIds: string[]): AgendaMember[] {
  const byUid = new Map(users.map((user) => [user.uid, user]));
  return selectedIds
    .map((uid) => byUid.get(uid))
    .filter((user): user is AgendaSharedUser => Boolean(user))
    .map(({ uid, nome, email }) => ({ uid, nome, email }));
}

function parseGoogleEventDate(value?: string): number | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const ts = new Date(normalized).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function googleEventToAgendaItem(event: GoogleCalendarEvent): AgendaItemEx | null {
  if (event.status === 'cancelled') return null;
  const startRaw = event.start.dateTime ?? event.start.date;
  const start = parseGoogleEventDate(startRaw);
  if (!start) return null;
  const end = parseGoogleEventDate(event.end.dateTime ?? event.end.date);
  return {
    id: `google:${event.id}`,
    titulo: event.summary?.trim() || 'Evento Google',
    descricao: event.description,
    data_hora: start,
    status: 'pendente',
    created_at: start,
    google_event_id: event.id,
    google_calendar_id: 'primary',
    google_html_link: event.htmlLink,
    google_end_hora: end ?? undefined,
    google_all_day: !!event.start.date,
    source: 'google',
  };
}

type Tab = 'pendente' | 'em_andamento' | 'concluido';

interface AgendaItemEx extends AgendaItem {
  ownerNome?: string;
  ownerUid?: string;
  google_html_link?: string;
  google_end_hora?: number;
  google_all_day?: boolean;
  source?: 'mavo' | 'google';
}

export const AgendaView: React.FC<AgendaViewProps> = ({
  items,
  loading,
  onAdd,
  onSetStatus,
  onDelete,
  onEdit,
  availableUsers,
  incomingEventInvites,
  outgoingEventInvites,
  sharedAgendas,
  sharingLoading,
  systemNotificationsSupported,
  systemNotificationPermission,
  systemNotificationsEnabled,
  onEnableSystemNotifications,
  onToggleSystemNotifications,
  onRespondEventInvite,
}) => {
  const googleCalendar = useGoogleCalendar();
  const [showGoogleCalendar, setShowGoogleCalendar] = useState(true);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataHora, setDataHora] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return toLocalISOString(d.getTime());
  });
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<Tab>('pendente');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showInvites, setShowInvites] = useState(false);
  const [decliningInviteKey, setDecliningInviteKey] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [inviteActionError, setInviteActionError] = useState<string | null>(null);
  const [googleSyncError, setGoogleSyncError] = useState<string | null>(null);
  const [savingAgendaEvent, setSavingAgendaEvent] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgendaItemEx | null>(null);

  const googleOnlyItems = useMemo<AgendaItemEx[]>(() => {
    const linkedGoogleIds = new Set(
      items
        .map((item) => item.google_event_id)
        .filter((id): id is string => Boolean(id)),
    );
    return googleCalendar.events
      .map(googleEventToAgendaItem)
      .filter((item): item is AgendaItemEx => Boolean(item))
      .filter((item) => !item.google_event_id || !linkedGoogleIds.has(item.google_event_id));
  }, [googleCalendar.events, items]);

  const allItems = useMemo<AgendaItemEx[]>(() => {
    const own: AgendaItemEx[] = items.map((i) => ({ ...i, source: 'mavo' }));
    const linkedSharedKeys = new Set(
      items
        .filter((item) => item.shared_owner_uid && item.shared_event_id)
        .map((item) => `${item.shared_owner_uid}:${item.shared_event_id}`),
    );
    const shared: AgendaItemEx[] = sharedAgendas.flatMap((entry) =>
      entry.items
        .filter((i) => !linkedSharedKeys.has(`${entry.ownerUid}:${i.id}`))
        .map((i) => ({ ...i, ownerNome: entry.ownerNome, ownerUid: entry.ownerUid })),
    );
    return [...own, ...shared, ...googleOnlyItems];
  }, [googleOnlyItems, items, sharedAgendas]);

  const byStatus = useMemo(() => {
    const sorted = [...allItems].sort((a, b) => a.data_hora - b.data_hora);
    return {
      pendente: sorted.filter((i) => i.status === 'pendente'),
      em_andamento: sorted.filter((i) => i.status === 'em_andamento'),
      concluido: sorted.filter((i) => i.status === 'concluido').reverse(),
    };
  }, [allItems]);

  const eventInvitesByEventId = useMemo(() => {
    const grouped = new Map<string, AgendaEventInvite[]>();
    for (const invite of outgoingEventInvites) {
      const current = grouped.get(invite.eventId) ?? [];
      current.push(invite);
      grouped.set(invite.eventId, current);
    }
    return grouped;
  }, [outgoingEventInvites]);

  const outgoingGroups = useMemo(() => {
    const grouped = new Map<string, { event: AgendaItem; invites: AgendaEventInvite[] }>();
    for (const invite of outgoingEventInvites) {
      const current = grouped.get(invite.eventId) ?? { event: invite.event, invites: [] };
      current.invites.push(invite);
      grouped.set(invite.eventId, current);
    }
    return Array.from(grouped.values()).sort((a, b) => a.event.data_hora - b.event.data_hora);
  }, [outgoingEventInvites]);

  const activeItems = byStatus[tab];

  const grouped = useMemo(() => {
    const map = new Map<string, AgendaItemEx[]>();
    for (const item of (tab !== 'concluido' ? activeItems : [])) {
      const k = dayKey(item.data_hora);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(item);
    }
    return map;
  }, [activeItems, tab]);

  const pendingIncomingInvites = useMemo(
    () => incomingEventInvites.filter((invite) => invite.status === 'pending'),
    [incomingEventInvites],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !dataHora) return;
    const participantes = selectedMembers(availableUsers, selectedMemberIds);
    const agendaItem: Omit<AgendaItem, 'id' | 'status' | 'created_at'> = {
      titulo: titulo.trim(),
      descricao: descricao.trim() || undefined,
      data_hora: new Date(dataHora).getTime(),
      participantes: participantes.length > 0 ? participantes : undefined,
    };

    setGoogleSyncError(null);
    setSavingAgendaEvent(true);
    try {
      if (googleCalendar.isConnected) {
        const googleEvent = await googleCalendar.createEvent({
          title: agendaItem.titulo,
          description: agendaItem.descricao,
          start: agendaItem.data_hora,
          end: agendaItem.data_hora + 60 * 60 * 1000,
        });
        agendaItem.google_event_id = googleEvent.id;
        agendaItem.google_calendar_id = 'primary';
      }
      onAdd(agendaItem);
    } catch (error) {
      setGoogleSyncError(error instanceof Error ? error.message : 'Erro ao criar evento no Google Calendar.');
      setSavingAgendaEvent(false);
      return;
    }

    setTitulo('');
    setDescricao('');
    setSelectedMemberIds([]);
    setShowForm(false);
    setSavingAgendaEvent(false);
  };

  const handleEditAgendaItem = async (
    item: AgendaItemEx,
    changes: Partial<Omit<AgendaItem, 'id' | 'status' | 'created_at'>>,
  ) => {
    if (item.google_event_id) {
      if (!googleCalendar.isConnected) {
        throw new Error('Conecte o Google Calendar para editar este evento.');
      }
      const start = changes.data_hora ?? item.data_hora;
      const originalDuration =
        item.google_end_hora && item.google_end_hora > item.data_hora
          ? item.google_end_hora - item.data_hora
          : 60 * 60 * 1000;
      await googleCalendar.updateEvent(item.google_event_id, {
        title: changes.titulo ?? item.titulo,
        description: changes.descricao ?? item.descricao,
        start,
        end: start + originalDuration,
        allDay: item.google_all_day,
      });
    }

    if (item.source !== 'google') {
      onEdit(item.id, changes);
    }
  };

  const handleSetItemStatus = (item: AgendaItemEx, status: AgendaStatus) => {
    if (item.ownerUid) {
      onAdd({
        titulo: item.titulo,
        descricao: item.descricao,
        data_hora: item.data_hora,
        shared_owner_uid: item.ownerUid,
        shared_owner_nome: item.ownerNome,
        shared_event_id: item.id,
        status,
      });
      return;
    }
    if (item.source === 'google') {
      onAdd({
        titulo: item.titulo,
        descricao: item.descricao,
        data_hora: item.data_hora,
        google_event_id: item.google_event_id,
        google_calendar_id: item.google_calendar_id,
        status,
      });
      return;
    }
    onSetStatus(item.id, status);
  };

  const handleAcceptInvite = async (invite: AgendaEventInvite) => {
    setInviteActionError(null);
    const err = await onRespondEventInvite(invite.ownerUid, invite.eventId, 'accepted');
    if (err) {
      setInviteActionError(err);
      return;
    }
    setDecliningInviteKey(null);
    setDeclineReason('');
  };

  const handleDeclineInvite = async (e: React.FormEvent, invite: AgendaEventInvite) => {
    e.preventDefault();
    const reason = declineReason.trim();
    if (!reason) {
      setInviteActionError('Informe o motivo da recusa.');
      return;
    }
    setInviteActionError(null);
    const err = await onRespondEventInvite(invite.ownerUid, invite.eventId, 'declined', reason);
    if (err) {
      setInviteActionError(err);
      return;
    }
    setDecliningInviteKey(null);
    setDeclineReason('');
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    onDelete(deleteTarget.id);
    if (editingId === deleteTarget.id) setEditingId(null);
    setDeleteTarget(null);
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'pendente', label: `Pendente (${byStatus.pendente.length})` },
    { id: 'em_andamento', label: `Em andamento (${byStatus.em_andamento.length})` },
    { id: 'concluido', label: `Concluído (${byStatus.concluido.length})` },
  ];

  const acceptedEventCount = sharedAgendas.reduce((acc, entry) => acc + entry.items.length, 0);
  const inviteBadgeCount =
    pendingIncomingInvites.length + outgoingEventInvites.filter((invite) => invite.status === 'pending').length;

  return (
    <div className={`${showGoogleCalendar ? 'max-w-6xl' : 'max-w-3xl'} mx-auto py-6 px-4 space-y-6`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays size={20} className="text-blue-400" />
          <h1 className="text-xl font-bold text-slate-100">Minha Agenda</h1>
          {acceptedEventCount > 0 && (
            <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full px-2 py-0.5 font-medium">
              +{acceptedEventCount} reunião{acceptedEventCount !== 1 ? 'ões' : ''} aceita{acceptedEventCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowInvites((v) => !v)}
            title="Convites de reuniões"
            className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              showInvites
                ? 'bg-purple-600/20 border-purple-500/40 text-purple-300'
                : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            <Users size={15} />
            {inviteBadgeCount > 0 && (
              <span className="text-[10px] bg-purple-500 text-white rounded-full px-1.5 py-0.5 -mr-1">
                {inviteBadgeCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowGoogleCalendar((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              showGoogleCalendar
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
            title="Google Calendar"
          >
            <CalendarDays size={15} /> Google Calendar
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            <Plus size={15} /> Novo evento
          </button>
        </div>
      </div>

      {showGoogleCalendar && <GoogleCalendarPanel calendar={googleCalendar} />}

      {pendingIncomingInvites.length > 0 && !showInvites && (
        <button
          type="button"
          onClick={() => setShowInvites(true)}
          className="w-full text-left rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 hover:border-amber-500/40 transition-colors"
        >
          Você tem {pendingIncomingInvites.length} convite{pendingIncomingInvites.length !== 1 ? 's' : ''} de reunião aguardando resposta.
        </button>
      )}

      {showInvites && (
        <div className="bg-slate-800/60 border border-purple-500/20 rounded-xl p-4 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users size={15} className="text-purple-400" />
              <span className="text-sm font-semibold text-slate-100">Convites de reuniões</span>
            </div>
            <button type="button" onClick={() => setShowInvites(false)} className="text-slate-500 hover:text-slate-300">
              <X size={14} />
            </button>
          </div>

          {systemNotificationsSupported && (
            <div className="flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Bell
                  size={14}
                  className={
                    systemNotificationPermission === 'granted' && systemNotificationsEnabled
                      ? 'text-emerald-400'
                      : systemNotificationPermission === 'denied'
                        ? 'text-red-400'
                        : 'text-amber-400'
                  }
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-200">Notificações do Windows</p>
                  <p className="text-[11px] text-slate-500">
                    {systemNotificationPermission === 'granted'
                      ? systemNotificationsEnabled
                        ? 'Ativas para novos convites.'
                        : 'Desativadas no Mavo.'
                      : systemNotificationPermission === 'denied'
                        ? 'Bloqueadas nas permissões do navegador.'
                        : 'Ative para receber avisos fora da tela do app.'}
                  </p>
                </div>
              </div>
              {systemNotificationPermission !== 'granted' ? (
                <button
                  type="button"
                  onClick={() => void onEnableSystemNotifications()}
                  className="shrink-0 px-3 py-2 rounded-lg border border-amber-500/40 text-amber-200 hover:bg-amber-500/10 text-xs font-medium"
                >
                  Ativar notificações
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void onToggleSystemNotifications()}
                  className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition-colors ${
                    systemNotificationsEnabled
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15'
                      : 'border-slate-600 bg-slate-800/60 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {systemNotificationsEnabled ? (
                    <>
                      <BellOff size={11} /> Desativar
                    </>
                  ) : (
                    <>
                      <Bell size={11} /> Ativar
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {incomingEventInvites.length > 0 && (
            <section className="space-y-2">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Convites recebidos</p>
              {inviteActionError && <p className="text-xs text-red-400">{inviteActionError}</p>}
              {incomingEventInvites.map((invite) => {
                const cfg = INVITE_STATUS_CFG[invite.status];
                const key = `${invite.ownerUid}:${invite.eventId}`;
                const isDeclining = decliningInviteKey === key;
                return (
                  <div key={key} className="bg-slate-900/50 border border-slate-700/60 rounded-lg px-3 py-3 space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-100 font-medium truncate">{invite.event.titulo}</p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {invite.ownerNome} · {fmtDateTime(invite.event.data_hora)}
                        </p>
                      </div>
                      <span className={`shrink-0 self-start rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                    </div>

                    {invite.event.descricao && (
                      <p className="text-xs text-slate-400 whitespace-pre-wrap">{invite.event.descricao}</p>
                    )}

                    {invite.status === 'pending' && (
                      isDeclining ? (
                        <form onSubmit={(e) => handleDeclineInvite(e, invite)} className="space-y-2">
                          <textarea
                            value={declineReason}
                            onChange={(e) => setDeclineReason(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-red-500 resize-none placeholder:text-slate-500"
                            placeholder="Motivo da recusa *"
                            rows={2}
                            autoFocus
                          />
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                              type="button"
                              onClick={() => {
                                setDecliningInviteKey(null);
                                setDeclineReason('');
                                setInviteActionError(null);
                              }}
                              className="flex-1 px-3 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 text-xs"
                            >
                              Cancelar
                            </button>
                            <button
                              type="submit"
                              disabled={sharingLoading}
                              className="flex-1 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium"
                            >
                              Enviar recusa
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => void handleAcceptInvite(invite)}
                            disabled={sharingLoading}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium"
                          >
                            <Check size={13} /> Aceitar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDecliningInviteKey(key);
                              setDeclineReason('');
                              setInviteActionError(null);
                            }}
                            disabled={sharingLoading}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50 text-xs font-medium"
                          >
                            <X size={13} /> Recusar
                          </button>
                        </div>
                      )
                    )}

                    {invite.status === 'accepted' && (
                      <p className="text-xs text-emerald-400">Você aceitou. Essa reunião aparece na sua agenda.</p>
                    )}

                    {invite.status === 'declined' && invite.rejectionReason && (
                      <p className="text-xs text-red-300">Você recusou: {invite.rejectionReason}</p>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          <section className="space-y-2 pt-2 border-t border-slate-700/50">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Respostas dos convidados</p>
            {outgoingGroups.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhuma reunião com membros convidados ainda.</p>
            ) : (
              outgoingGroups.map((group) => (
                <div key={group.event.id} className="bg-slate-900/50 border border-slate-700/60 rounded-lg px-3 py-3 space-y-2">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-100 font-medium truncate">{group.event.titulo}</p>
                    <p className="text-[11px] text-slate-500">{fmtDateTime(group.event.data_hora)}</p>
                  </div>
                  <div className="space-y-1.5">
                    {group.invites.map((invite) => {
                      const cfg = INVITE_STATUS_CFG[invite.status];
                      return (
                        <div key={`${group.event.id}-${invite.viewerUid}`} className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-slate-200 font-medium">{invite.viewerNome}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.cls}`}>
                              {cfg.label}
                            </span>
                          </div>
                          {invite.status === 'declined' && invite.rejectionReason && (
                            <p className="text-xs text-red-300 whitespace-pre-wrap">Motivo: {invite.rejectionReason}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
            placeholder="Título do evento *"
            autoFocus
            required
          />
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 resize-none"
            placeholder="Anotação / descrição (opcional)"
            rows={2}
          />
          <input
            type="datetime-local"
            value={dataHora}
            onChange={(e) => setDataHora(e.target.value)}
            className="agenda-datetime-input w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
            required
          />
          {googleSyncError && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {googleSyncError}
            </p>
          )}
          <MemberSelector
            users={availableUsers}
            selectedIds={selectedMemberIds}
            onChange={setSelectedMemberIds}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              disabled={savingAgendaEvent}
              className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingAgendaEvent}
              className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium"
            >
              {savingAgendaEvent ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      )}

      <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === t.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && allItems.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-8">Carregando...</p>
      )}

      {tab !== 'concluido' && (
        <div className="space-y-6">
          {grouped.size === 0 && !loading && (
            <div className="text-center py-12 text-slate-500">
              <CalendarDays size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum evento neste status.</p>
            </div>
          )}
          {Array.from(grouped.entries()).map(([key, dayItems]) => {
            const ts = dayItems[0].data_hora;
            return (
              <div key={key}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-semibold uppercase tracking-wider ${
                    isToday(ts) ? 'text-blue-400' : isPast(ts) ? 'text-red-400' : 'text-slate-400'
                  }`}>
                    {dayLabel(ts)}
                  </span>
                  <div className="flex-1 h-px bg-slate-800" />
                </div>
                <div className="space-y-2">
                  {dayItems.map((item) => (
                    <AgendaCard
                      key={`${item.ownerUid ?? 'own'}-${item.id}`}
                      item={item}
                      isEditing={editingId === item.id && !item.ownerUid}
                      isShared={!!item.ownerUid}
                      availableUsers={availableUsers}
                      eventInvites={eventInvitesByEventId.get(item.id) ?? []}
                      onStatusChange={(status) => handleSetItemStatus(item, status)}
                      onDelete={item.ownerUid || item.source === 'google' ? undefined : () => setDeleteTarget(item)}
                      onEdit={item.ownerUid || item.shared_owner_uid ? undefined : (_id, changes) => handleEditAgendaItem(item, changes)}
                      onStartEdit={() => setEditingId(item.id)}
                      onCancelEdit={() => setEditingId(null)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'concluido' && (
        <div className="space-y-2">
          {activeItems.length === 0 && !loading && (
            <p className="text-center text-sm text-slate-500 py-8">Nenhum evento concluído.</p>
          )}
          {activeItems.map((item) => (
            <AgendaCard
              key={`${item.ownerUid ?? 'own'}-${item.id}`}
              item={item}
              isEditing={editingId === item.id && !item.ownerUid}
              isShared={!!item.ownerUid}
              availableUsers={availableUsers}
              eventInvites={eventInvitesByEventId.get(item.id) ?? []}
              onStatusChange={(status) => handleSetItemStatus(item, status)}
              onDelete={item.ownerUid || item.source === 'google' ? undefined : () => setDeleteTarget(item)}
              onEdit={item.ownerUid || item.shared_owner_uid ? undefined : (_id, changes) => handleEditAgendaItem(item, changes)}
              onStartEdit={() => setEditingId(item.id)}
              onCancelEdit={() => setEditingId(null)}
            />
          ))}
        </div>
      )}

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Excluir evento da agenda"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm text-slate-200">
              Tem certeza que deseja excluir este evento da agenda?
            </p>
            {deleteTarget && (
              <p className="text-xs text-slate-500">
                {deleteTarget.titulo} · {fmtDateTime(deleteTarget.data_hora)}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-medium text-white"
            >
              Excluir
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

interface MemberSelectorProps {
  users: AgendaSharedUser[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

const MemberSelector: React.FC<MemberSelectorProps> = ({ users, selectedIds, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selected = useMemo(() => selectedMembers(users, selectedIds), [users, selectedIds]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) =>
      `${user.nome} ${user.email}`.toLowerCase().includes(q),
    );
  }, [query, users]);

  const toggle = (uid: string) => {
    if (selectedSet.has(uid)) {
      onChange(selectedIds.filter((id) => id !== uid));
      return;
    }
    onChange([...selectedIds, uid]);
  };

  return (
    <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-medium text-slate-300">
          <Users size={13} className="text-blue-400" />
          Convite para o evento
          {selected.length > 0 && (
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-200">
              {selected.length}
            </span>
          )}
        </span>
        <ChevronDown
          size={14}
          className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((user) => (
            <button
              type="button"
              key={user.uid}
              onClick={() => toggle(user.uid)}
              className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[11px] text-blue-200"
            >
              {user.nome}
              <X size={10} />
            </button>
          ))}
        </div>
      )}

      {open && (
        <>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar usuário cadastrado"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500 placeholder:text-slate-500"
            />
          </div>

          <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-slate-500 px-1 py-2">Nenhum usuário cadastrado encontrado.</p>
            ) : (
              filtered.map((user) => {
                const checked = selectedSet.has(user.uid);
                return (
                  <button
                    type="button"
                    key={user.uid}
                    onClick={() => toggle(user.uid)}
                    className={`w-full flex items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors ${
                      checked
                        ? 'border-blue-500/40 bg-blue-500/10'
                        : 'border-slate-800 bg-slate-950/30 hover:border-slate-700'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      checked ? 'border-blue-400 bg-blue-500 text-white' : 'border-slate-600'
                    }`}>
                      {checked && <Check size={11} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-slate-200 truncate">{user.nome}</span>
                      <span className="block text-[11px] text-slate-500 truncate">{user.email}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
};

interface AgendaCardProps {
  item: AgendaItemEx;
  isEditing: boolean;
  isShared: boolean;
  availableUsers: AgendaSharedUser[];
  eventInvites: AgendaEventInvite[];
  onStatusChange?: (status: AgendaStatus) => void | Promise<void>;
  onDelete?: () => void;
  onEdit?: (
    id: string,
    changes: Partial<Omit<AgendaItem, 'id' | 'status' | 'created_at'>>,
  ) => void | Promise<void>;
  onStartEdit: () => void;
  onCancelEdit: () => void;
}

const AgendaCard: React.FC<AgendaCardProps> = ({
  item,
  isEditing,
  isShared,
  availableUsers,
  eventInvites,
  onStatusChange,
  onDelete,
  onEdit,
  onStartEdit,
  onCancelEdit,
}) => {
  const overdue = item.status !== 'concluido' && isPast(item.data_hora);
  const cfg = STATUS_CFG[item.status] ?? STATUS_CFG.pendente;
  const memberOptions = useMemo(
    () => mergeUsers(availableUsers, item.participantes ?? []),
    [availableUsers, item.participantes],
  );
  const [editTitulo, setEditTitulo] = useState(item.titulo);
  const [editDescricao, setEditDescricao] = useState(item.descricao ?? '');
  const [editDataHora, setEditDataHora] = useState(toLocalISOString(item.data_hora));
  const [editMemberIds, setEditMemberIds] = useState(() => (item.participantes ?? []).map((member) => member.uid));
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);

  const handleStatusSelect = async (status: AgendaStatus) => {
    if (!onStatusChange || status === item.status) {
      setStatusMenuOpen(false);
      return;
    }
    setStatusChanging(true);
    try {
      await onStatusChange(status);
      setStatusMenuOpen(false);
    } finally {
      setStatusChanging(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitulo.trim() || !editDataHora) return;
    const participantes = selectedMembers(memberOptions, editMemberIds);
    setSavingEdit(true);
    setEditError(null);
    try {
      await onEdit?.(item.id, {
        titulo: editTitulo.trim(),
        descricao: editDescricao.trim() || undefined,
        data_hora: new Date(editDataHora).getTime(),
        participantes: participantes.length > 0 ? participantes : undefined,
      });
      onCancelEdit();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Erro ao editar evento.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleStartEdit = () => {
    setEditTitulo(item.titulo);
    setEditDescricao(item.descricao ?? '');
    setEditDataHora(toLocalISOString(item.data_hora));
    setEditMemberIds((item.participantes ?? []).map((member) => member.uid));
    setEditError(null);
    onStartEdit();
  };

  if (isEditing) {
    return (
      <form onSubmit={handleSaveEdit} className="bg-slate-800/80 border border-blue-500/40 rounded-xl p-3 space-y-2">
        <input
          type="text"
          value={editTitulo}
          onChange={(e) => setEditTitulo(e.target.value)}
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
          placeholder="Título *"
          autoFocus
          required
        />
        <textarea
          value={editDescricao}
          onChange={(e) => setEditDescricao(e.target.value)}
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 resize-none"
          placeholder="Anotação / descrição (opcional)"
          rows={2}
        />
        <input
          type="datetime-local"
          value={editDataHora}
          onChange={(e) => setEditDataHora(e.target.value)}
          className="agenda-datetime-input w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
          required
        />
        {item.source !== 'google' && (
          <MemberSelector users={memberOptions} selectedIds={editMemberIds} onChange={setEditMemberIds} />
        )}
        {editError && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {editError}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancelEdit}
            disabled={savingEdit}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 text-xs"
          >
            <X size={12} /> Cancelar
          </button>
          <button
            type="submit"
            disabled={savingEdit}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium"
          >
            <Check size={12} /> {savingEdit ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border transition-colors group ${
      isShared
        ? 'bg-purple-900/10 border-purple-800/30'
        : item.status === 'concluido'
          ? 'bg-slate-800/30 border-slate-800/60 opacity-60'
          : overdue
            ? 'bg-red-900/10 border-red-800/30'
            : 'bg-slate-800/50 border-slate-700/60 hover:border-slate-600'
    }`}>
      {onStatusChange ? (
        <div className="relative mt-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setStatusMenuOpen((open) => !open)}
            disabled={statusChanging}
            title="Selecionar status"
            className={`inline-flex min-w-[92px] items-center justify-between gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-all hover:opacity-90 disabled:opacity-60 ${cfg.cls}`}
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              <span className="truncate">{cfg.label}</span>
            </span>
            <ChevronDown size={10} className={`shrink-0 transition-transform ${statusMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {statusMenuOpen && (
            <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded-lg border border-slate-700 bg-slate-950 p-1 shadow-xl shadow-black/30">
              {STATUS_OPTIONS.map((status) => {
                const option = STATUS_CFG[status];
                const active = item.status === status;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => void handleStatusSelect(status)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors ${
                      active ? 'bg-slate-800 text-slate-100' : 'text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${option.dot}`} />
                      {option.label}
                    </span>
                    {active && <Check size={12} className="text-blue-300" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <span className={`mt-0.5 shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${cfg.cls}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      )}

      {onEdit ? (
        <button type="button" onClick={handleStartEdit} className="flex-1 min-w-0 text-left" title="Clique para editar">
          <CardBody item={item} overdue={overdue} isShared={isShared} eventInvites={eventInvites} />
        </button>
      ) : (
        <div className="flex-1 min-w-0">
          <CardBody item={item} overdue={overdue} isShared={isShared} eventInvites={eventInvites} />
        </div>
      )}

      <div className="flex items-center gap-1 shrink-0">
        {onEdit && (
          <button
            type="button"
            onClick={handleStartEdit}
            className="p-1 rounded text-slate-600 hover:text-blue-400 hover:bg-blue-500/10 transition-colors opacity-0 group-hover:opacity-100"
            title="Editar"
          >
            <Pencil size={12} />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Excluir"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
};

const CardBody: React.FC<{
  item: AgendaItem & { ownerNome?: string };
  overdue: boolean;
  isShared: boolean;
  eventInvites: AgendaEventInvite[];
}> = ({ item, overdue, isShared, eventInvites }) => {
  const inviteByViewer = new Map<string, AgendaEventInvite>(
    eventInvites.map((invite) => [invite.viewerUid, invite]),
  );
  return (
    <>
      {isShared && item.ownerNome && (
        <p className="text-[10px] text-purple-400 font-medium mb-0.5">Reunião de {item.ownerNome}</p>
      )}
      {!isShared && item.google_event_id && (
        <p className="text-[10px] text-blue-400 font-medium mb-0.5">Google Calendar</p>
      )}
      {!isShared && item.shared_owner_nome && (
        <p className="text-[10px] text-purple-400 font-medium mb-0.5">Reunião de {item.shared_owner_nome}</p>
      )}
      <p className={`text-sm font-medium ${item.status === 'concluido' ? 'line-through text-slate-400' : 'text-slate-100'}`}>
        {item.titulo}
      </p>
      {item.descricao && (
        <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">{item.descricao}</p>
      )}
      <div className="flex items-center gap-1.5 mt-1">
        <Clock size={11} className={overdue ? 'text-red-400' : 'text-slate-600'} />
        <span className={`text-[11px] ${overdue ? 'text-red-400' : 'text-slate-500'}`}>
          {fmtTime(item.data_hora)}
          {!isToday(item.data_hora) && !isTomorrow(item.data_hora) && (
            <span className="ml-1">· {fmtDate(item.data_hora)}</span>
          )}
        </span>
      </div>
      {!isShared && (item.participantes?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.participantes!.map((member) => {
            const invite = inviteByViewer.get(member.uid);
            const status: AgendaInviteStatus = invite?.status ?? 'pending';
            const cfg = INVITE_STATUS_CFG[status];
            return (
              <span
                key={member.uid}
                className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.cls}`}
                title={status === 'declined' && invite?.rejectionReason ? invite.rejectionReason : member.email}
              >
                <span className="truncate">{member.nome}</span>
                <span className="text-[9px] opacity-80">{cfg.label}</span>
              </span>
            );
          })}
        </div>
      )}
      {!isShared && eventInvites.some((invite) => invite.status === 'declined' && invite.rejectionReason) && (
        <div className="mt-1 space-y-1">
          {eventInvites
            .filter((invite) => invite.status === 'declined' && invite.rejectionReason)
            .map((invite) => (
              <p key={invite.viewerUid} className="text-[11px] text-red-300">
                {invite.viewerNome}: {invite.rejectionReason}
              </p>
            ))}
        </div>
      )}
    </>
  );
};
