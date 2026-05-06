import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useUser } from './contexts/UserContext';
import { UserLogin } from './components/Auth/UserLogin';
import { Sidebar } from './components/Layout/Sidebar';
const KanbanBoard = React.lazy(() => import('./components/Dashboard/KanbanBoard').then(m => ({ default: m.KanbanBoard })));
const BacklogView = React.lazy(() => import('./components/Dashboard/BacklogView').then(m => ({ default: m.BacklogView })));
const EstrategicoView = React.lazy(() => import('./components/Dashboard/EstrategicoView').then(m => ({ default: m.EstrategicoView })));
const QuadroEstrategico = React.lazy(() => import('./components/Dashboard/QuadroEstrategico').then(m => ({ default: m.QuadroEstrategico })));
const DetalhePrioridadeModal = React.lazy(() => import('./components/Dashboard/QuadroEstrategico').then(m => ({ default: m.DetalhePrioridadeModal })));
const PrioridadeModal = React.lazy(() => import('./components/Dashboard/PrioridadeModal').then(m => ({ default: m.PrioridadeModal })));
const ActionItemModal = React.lazy(() => import('./components/Dashboard/ActionItemModal').then(m => ({ default: m.ActionItemModal })));
const PerformanceView = React.lazy(() => import('./components/Dashboard/PerformanceView').then(m => ({ default: m.PerformanceView })));
const RoadmapView = React.lazy(() => import('./components/Dashboard/RoadmapView').then(m => ({ default: m.RoadmapView })));
const OperacionalView = React.lazy(() => import('./components/Dashboard/OperacionalView').then(m => ({ default: m.OperacionalView })));
const AgendaView = React.lazy(() => import('./components/Dashboard/AgendaView').then(m => ({ default: m.AgendaView })));
const ChatView = React.lazy(() => import('./components/Chat/ChatView').then(m => ({ default: m.ChatView })));
import { useAgenda } from './controllers/useAgenda';
import type { ViewId } from './components/Layout/Sidebar';
import { useStrategicBoard } from './controllers/useStrategicBoard';
import { useRitmoGestao } from './controllers/useRitmoGestao';
import { StorageService } from './services/storageService';
import { isFirebaseConfigured, subscribeBoard, saveBoardNotes } from './services/firestoreSync';
import { listAllUsers } from './services/firebaseAuth';
import {
  getConversationPreviewForUser,
  isConversationVisibleForUser,
  subscribeMyConversations,
} from './services/chatService';
import { isDeveloperEmail } from './config/developer';
import { subscribeAppSettings, getDefaultAppSettings } from './services/appSettings';
import type { UserProfile } from './types/user';
import type { AppSettings } from './types/appSettings';
import { mergeResponsaveisComPerfis } from './utils/mergeResponsaveisComPerfis';
import { resolvePrimaryExternalLinkForWorkspace } from './utils/externalWorkspaceLinks';
import {
  Plus,
  Search,
  Activity,
  Target,
  Menu,
  ListTodo,
  AlertCircle,
  PieChart,
  Briefcase,
  Bot,
  ShieldCheck,
  FileText,
  Bell,
} from 'lucide-react';
import { ActionItem, ItemStatus, UrgencyLevel } from './types';
import type { Observer, Prioridade } from './types';
import {
  responsavelIdsForLoggedUser,
  donoPrioridadeCorrespondeAoUsuario,
  nomeExibicaoWhoParaItem,
} from './components/Dashboard/responsavelSearchUtils';
import {
  canViewByOwnershipOrObserver,
  tarefaAtribuidaAoUsuario,
  userIsObserver,
} from './components/Dashboard/taskAssignmentUtils';
import { Toast, type ToastType } from './components/Shared/Toast';
import { Modal } from './components/Shared/Modal';
import { EstrategicoGridIcon } from './components/icons/EstrategicoGridIcon';

const MAVO_NOTIFICATIONS_ENABLED_KEY = '@Mavo:SystemNotificationsEnabled';
const NOTIFICATION_BODY_MAX_LENGTH = 140;

function compactNotificationText(value: string, max = NOTIFICATION_BODY_MAX_LENGTH): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).trimEnd()}...`;
}

function pageIsVisible(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible';
}

type AssignmentNotificationTarget = {
  key: string;
  assignedToMe: boolean;
  title: string;
  body: string;
  view: ViewId;
  createdBy?: string;
};

const TeamChatScreen = React.lazy(() =>
  import('./components/Dashboard/TeamChatScreen').then((module) => ({ default: module.TeamChatScreen })),
);

function normKey(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

function userLocalPart(email?: string | null): string {
  const raw = (email ?? '').trim();
  if (!raw.includes('@')) return raw;
  return raw.split('@')[0]?.trim() ?? '';
}

function normalizeWorkspaceName(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

function profileAllowedWorkspaces(profile?: UserProfile | null): string[] {
  const raw = Array.isArray(profile?.empresas) ? profile.empresas : [];
  return raw
    .map((empresa) => empresa.trim())
    .filter((empresa) => {
      const normalized = normalizeWorkspaceName(empresa);
      return normalized !== '' && normalized !== '*' && normalized !== 'todas';
    });
}

function profileHasAllWorkspaceAccess(profile?: UserProfile | null): boolean {
  if (!profile) return true;
  const raw = Array.isArray(profile.empresas) ? profile.empresas : [];
  const hasAllFlag = raw.some((empresa) => {
    const normalized = normalizeWorkspaceName(empresa);
    return normalized === '*' || normalized === 'todas';
  });
  if (hasAllFlag) return true;
  return profile.role === 'administrador' && raw.length === 0;
}

/**
 * Empresa gravada na prioridade/planos/tarefas deve ser visível ao dono.
 * Se ele só tem acesso a outras empresas que a do classificador, usa a primeira empresa permitida dele.
 */
function empresaParaDemandaDoDono(
  assignee: UserProfile | undefined,
  workspaceClassificador: string,
): string {
  const cw = workspaceClassificador.trim();
  if (!assignee) return cw;

  const raw = Array.isArray(assignee.empresas) ? assignee.empresas : [];
  const list = raw.map((e) => e.trim()).filter(Boolean);
  const hasAll = list.some((e) => e === '*' || e.toLowerCase() === 'todas');
  if (hasAll) return cw;
  if (list.length === 0) return cw;
  if (cw) {
    const hit = list.find((e) => e.toLowerCase() === cw.toLowerCase());
    if (hit) return hit;
  }
  return list[0];
}

function AppContent() {
  const { isAuthenticated, encryptionKey, logout, profile, hasModuleAction, firebaseUser, loading: authLoading } = useUser();
  const agenda = useAgenda(firebaseUser?.uid ?? null, profile);
  const [activeView, setActiveView] = useState<ViewId>('backlog');
  const chatUser = useMemo(
    () => firebaseUser ? { uid: firebaseUser.uid, nome: profile?.nome?.trim() || firebaseUser.email || firebaseUser.uid } : null,
    [firebaseUser?.uid, firebaseUser?.email, profile?.nome],
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [strategicNote, setStrategicNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ActionItem | null>(null);
  const [defaultStatusForNew, setDefaultStatusForNew] = useState<ItemStatus | null>(null);
  const [modalContext, setModalContext] = useState<'default' | 'backlog' | 'estrategico'>('default');
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [systemNotificationPermission, setSystemNotificationPermission] = useState<NotificationPermission>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
    return Notification.permission;
  });
  const [systemNotificationsEnabled, setSystemNotificationsEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(MAVO_NOTIFICATIONS_ENABLED_KEY) !== 'false';
  });
  const [showSystemNotificationPrompt, setShowSystemNotificationPrompt] = useState(false);
  /** Filtro do campo "Pesquisar..." no header (Estratégico, Backlog, Desempenho, Roadmap). */
  const [headerSearchQuery, setHeaderSearchQuery] = useState('');
  const [selectedPrioridade, setSelectedPrioridade] = useState<Prioridade | null>(null);
  const [prioridadeModalOpen, setPrioridadeModalOpen] = useState(false);
  const [prioridadeToDelete, setPrioridadeToDelete] = useState<Prioridade | null>(null);
  const [dashboardOpenConcluidas, setDashboardOpenConcluidas] = useState(false);
  const [tableOpenConcluidas, setTableOpenConcluidas] = useState(false);
  const [backlogOpenConcluidas, setBacklogOpenConcluidas] = useState(false);
  const [quadroVerConcluidas, setQuadroVerConcluidas] = useState(false);
  const [focusPrioridadeId, setFocusPrioridadeId] = useState<string | null>(null);
  const focusedPrioridadeId = useRef<string | null>(null);
  const agendaInviteNotificationsReady = useRef(false);
  const seenAgendaInviteKeys = useRef<Set<string>>(new Set());
  const activeViewRef = useRef<ViewId>(activeView);
  const chatNotificationsReady = useRef(false);
  const seenChatMessageAtByConversation = useRef<Map<string, number>>(new Map());
  const assignmentNotificationsReady = useRef(false);
  const assignmentStateByKey = useRef<Map<string, boolean>>(new Map());
  const [tableOnlyPrioridadeId, setTableOnlyPrioridadeId] = useState<string | null>(null);
  const { items, loading, addItem, updateItem, deleteItem, updateStatus } = useStrategicBoard(encryptionKey ?? null);
  const ritmo = useRitmoGestao(encryptionKey ?? null);
  const [perfisCadastroUsuarios, setPerfisCadastroUsuarios] = useState<UserProfile[]>([]);
  const [workspaceAtivo, setWorkspaceAtivo] = useState<'all' | string>('all');
  const [empresasLocais, setEmpresasLocais] = useState<string[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => getDefaultAppSettings());
  const [empresasBloqueadas, setEmpresasBloqueadas] = useState<string[]>([]);
  const canEditTaskDueDate = profile?.role === 'administrador' || appSettings.tarefaPermiteAlterarData;
  const hasAllWorkspaceAccess = useMemo(() => profileHasAllWorkspaceAccess(profile), [profile]);
  const allowedWorkspaceNames = useMemo(() => profileAllowedWorkspaces(profile), [profile]);
  const allowedWorkspaceKeys = useMemo(
    () => new Set(allowedWorkspaceNames.map((empresa) => normalizeWorkspaceName(empresa))),
    [allowedWorkspaceNames],
  );

  const canSeeEmpresa = useCallback(
    (empresa?: string) => {
      if (!profile) return true;
      if (hasAllWorkspaceAccess) return true;
      const nome = (empresa ?? '').trim();
      if (!nome) return false;
      return allowedWorkspaceKeys.has(normalizeWorkspaceName(nome));
    },
    [profile, hasAllWorkspaceAccess, allowedWorkspaceKeys]
  );

  const requestSystemNotifications = useCallback(async () => {
    setShowSystemNotificationPrompt(false);

    if (typeof window === 'undefined' || !('Notification' in window)) {
      setToast({ message: 'Este navegador não suporta notificações do Windows.', type: 'error' });
      return;
    }

    if (Notification.permission === 'granted') {
      setSystemNotificationPermission('granted');
      setSystemNotificationsEnabled(true);
      localStorage.setItem(MAVO_NOTIFICATIONS_ENABLED_KEY, 'true');
      setToast({ message: 'Notificações do Mavo ativadas.', type: 'success' });
      return;
    }

    if (Notification.permission === 'denied') {
      setSystemNotificationPermission('denied');
      setToast({
        message: 'Notificações bloqueadas. Libere nas permissões do navegador para este site.',
        type: 'error',
      });
      return;
    }

    const permission = await Notification.requestPermission();
    setSystemNotificationPermission(permission);
    if (permission === 'granted') {
      setSystemNotificationsEnabled(true);
      localStorage.setItem(MAVO_NOTIFICATIONS_ENABLED_KEY, 'true');
    }
    setToast({
      message:
        permission === 'granted'
          ? 'Notificações do Mavo ativadas.'
          : 'Permissão de notificação não foi ativada.',
      type: permission === 'granted' ? 'success' : 'error',
    });
  }, []);

  const toggleSystemNotifications = useCallback(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setToast({ message: 'Este navegador não suporta notificações do Windows.', type: 'error' });
      return;
    }

    if (Notification.permission !== 'granted') {
      void requestSystemNotifications();
      return;
    }

    setSystemNotificationsEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(MAVO_NOTIFICATIONS_ENABLED_KEY, String(next));
      setToast({
        message: next ? 'Notificações do Mavo ativadas.' : 'Notificações do Mavo desativadas.',
        type: 'success',
      });
      return next;
    });
  }, [requestSystemNotifications]);

  const dispatchSystemNotification = useCallback(
    (
      title: string,
      options: NotificationOptions,
      onClick?: () => void,
    ): boolean => {
      if (
        !systemNotificationsEnabled ||
        typeof window === 'undefined' ||
        !('Notification' in window) ||
        Notification.permission !== 'granted'
      ) {
        return false;
      }

      try {
        const notification = new Notification(title, options);
        notification.onclick = () => {
          window.focus();
          onClick?.();
          notification.close();
        };
        return true;
      } catch {
        return false;
      }
    },
    [systemNotificationsEnabled],
  );

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  useEffect(() => {
    if (!isAuthenticated) {
      setShowSystemNotificationPrompt(false);
      return;
    }
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setSystemNotificationPermission(Notification.permission);
    if (Notification.permission === 'default') {
      setShowSystemNotificationPrompt(true);
    }
  }, [isAuthenticated, firebaseUser?.uid]);

  useEffect(() => {
    agendaInviteNotificationsReady.current = false;
    seenAgendaInviteKeys.current = new Set();
    chatNotificationsReady.current = false;
    seenChatMessageAtByConversation.current = new Map();
    assignmentNotificationsReady.current = false;
    assignmentStateByKey.current = new Map();
  }, [firebaseUser?.uid]);

  useEffect(() => {
    if (!isAuthenticated || !chatUser || !isFirebaseConfigured) {
      chatNotificationsReady.current = false;
      seenChatMessageAtByConversation.current = new Map();
      return;
    }

    const uid = chatUser.uid;
    const unsub = subscribeMyConversations(uid, (conversations) => {
      const previous = seenChatMessageAtByConversation.current;
      const nextSeen = new Map<string, number>();
      const incoming = conversations
        .filter((conv) => isConversationVisibleForUser(conv, uid))
        .map((conv) => {
          const preview = getConversationPreviewForUser(conv, uid);
          const lastAt = preview.at ?? conv.lastMessageAt ?? 0;
          if (lastAt > 0) nextSeen.set(conv.chatId, lastAt);
          return { conv, preview, lastAt };
        })
        .filter(({ conv, lastAt }) => {
          if (!chatNotificationsReady.current) return false;
          if (lastAt <= 0) return false;
          if ((conv.unread[uid] ?? 0) <= 0) return false;
          return lastAt > (previous.get(conv.chatId) ?? 0);
        });

      seenChatMessageAtByConversation.current = nextSeen;

      if (!chatNotificationsReady.current) {
        chatNotificationsReady.current = true;
        return;
      }
      if (incoming.length === 0) return;
      if (activeViewRef.current === 'chat' && pageIsVisible()) return;

      const first = incoming[0];
      const otherUid = first.conv.participants.find((participant) => participant !== uid) ?? '';
      const otherName = first.conv.participantNames[otherUid] || 'Usuário';
      const message =
        incoming.length === 1
          ? `Nova mensagem de ${otherName}`
          : `${incoming.length} conversas com novas mensagens`;

      setToast({ message, type: 'success' });
      dispatchSystemNotification(
        incoming.length === 1 ? `Mensagem de ${otherName}` : 'Novas mensagens no Mavo',
        {
          body:
            incoming.length === 1
              ? compactNotificationText(first.preview.text || 'Nova mensagem recebida.')
              : message,
          tag: incoming.length === 1 ? `private-chat-${first.conv.chatId}-${first.lastAt}` : 'private-chat-batch',
        },
        () => setActiveView('chat'),
      );
    });

    return () => unsub?.();
  }, [isAuthenticated, chatUser, dispatchSystemNotification]);

  useEffect(() => {
    if (!agenda.incomingEventInvitesReady) return;

    const pendingInvites = agenda.incomingEventInvites.filter((invite) => invite.status === 'pending');
    const currentKeys = new Set(
      pendingInvites.map((invite) => `${invite.ownerUid}:${invite.eventId}`),
    );

    if (!agendaInviteNotificationsReady.current) {
      seenAgendaInviteKeys.current = currentKeys;
      agendaInviteNotificationsReady.current = true;
      return;
    }

    const newInvites = pendingInvites.filter(
      (invite) => !seenAgendaInviteKeys.current.has(`${invite.ownerUid}:${invite.eventId}`),
    );

    seenAgendaInviteKeys.current = currentKeys;

    if (newInvites.length === 0) return;

    const first = newInvites[0];
    const message =
      newInvites.length === 1
        ? `Novo convite para evento: ${first.event.titulo}`
        : `${newInvites.length} novos convites para eventos`;

    setToast({ message, type: 'success' });

    if (
      systemNotificationsEnabled &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      const notification = new Notification('Convite para evento', {
        body:
          newInvites.length === 1
            ? `${first.ownerNome} convidou você para "${first.event.titulo}".`
            : message,
        tag: newInvites.length === 1 ? `agenda-${first.ownerUid}-${first.eventId}` : 'agenda-new-invites',
      });
      notification.onclick = () => {
        window.focus();
        setActiveView('agenda');
        notification.close();
      };
    }
  }, [agenda.incomingEventInvites, agenda.incomingEventInvitesReady, systemNotificationsEnabled]);

  const matchWorkspace = useCallback(
    (empresa?: string) => {
      const em = (empresa ?? '').trim();
      /** Dados antigos sem `empresa`: aparecem no workspace atual (evita lista vazia após classificar dono). */
      const semEmpresa = em === '';

      if (!semEmpresa && !canSeeEmpresa(empresa)) return false;

      const ws =
        workspaceAtivo === 'all' ? '' : String(workspaceAtivo).trim();
      const sameCompany = (a: string, b: string) =>
        a.toLowerCase() === b.toLowerCase();

      if (!profile || hasAllWorkspaceAccess) {
        if (workspaceAtivo === 'all') return true;
        if (semEmpresa) return true;
        return sameCompany(em, ws);
      }

      if (workspaceAtivo === 'all') {
        if (semEmpresa) return false;
        return canSeeEmpresa(empresa);
      }
      if (!canSeeEmpresa(workspaceAtivo)) return false;
      if (semEmpresa) return true;
      return sameCompany(em, ws);
    },
    [workspaceAtivo, canSeeEmpresa, profile, hasAllWorkspaceAccess]
  );

  // Mantém uma lista local de empresas, sempre sincronizada com o controller
  // e também derivada dos dados já existentes (itens, prioridades, planos, tarefas, backlog).
  useEffect(() => {
    const fromController = Array.isArray(ritmo.empresas) ? ritmo.empresas : [];

    const fromData = new Set<string>();
    items.forEach((i) => {
      if (i.empresa) fromData.add(i.empresa);
    });
    ritmo.board.backlog.forEach((b) => {
      if (b.empresa) fromData.add(b.empresa);
    });
    ritmo.board.prioridades.forEach((p) => {
      if (p.empresa) fromData.add(p.empresa);
    });
    ritmo.board.planos.forEach((p) => {
      if (p.empresa) fromData.add(p.empresa);
    });
    ritmo.board.tarefas.forEach((t) => {
      if (t.empresa) fromData.add(t.empresa);
    });

    setEmpresasLocais((prev) => {
      const merged = new Set<string>([...prev, ...fromController, ...fromData]);
      return Array.from(merged);
    });
  }, [ritmo.empresas, ritmo.board.backlog, ritmo.board.prioridades, ritmo.board.planos, ritmo.board.tarefas, items]);

  useEffect(() => {
    if (!isAuthenticated || !encryptionKey || !isFirebaseConfigured) {
      setPerfisCadastroUsuarios([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const all = await listAllUsers();
        if (!cancelled) {
          setPerfisCadastroUsuarios(
            all.filter((u) => u.ativo !== false && !isDeveloperEmail(u.email)),
          );
        }
      } catch {
        if (!cancelled) setPerfisCadastroUsuarios([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, encryptionKey]);

  const responsaveisParaAtribuicao = useMemo(
    () => mergeResponsaveisComPerfis(ritmo.responsaveis, perfisCadastroUsuarios),
    [ritmo.responsaveis, perfisCadastroUsuarios],
  );

  const responsaveisEscopoAtribuicao = useMemo(() => {
    if (profile?.role === 'administrador' && hasAllWorkspaceAccess) {
      return responsaveisParaAtribuicao;
    }
    const canAssignCross =
      (profile?.role === 'administrador' && allowedWorkspaceKeys.size > 1) ||
      hasModuleAction('table', 'cross_workspace_assign') ||
      hasModuleAction('operacional', 'cross_workspace_assign');
    if (canAssignCross) return responsaveisParaAtribuicao;

    const minhasEmpresas =
      allowedWorkspaceKeys.size > 0
        ? allowedWorkspaceKeys
        : new Set((profile?.empresas ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean));
    const alvoWorkspace = workspaceAtivo === 'all' ? null : String(workspaceAtivo).trim().toLowerCase();
    const byUid = new Map<string, UserProfile>(perfisCadastroUsuarios.map((u) => [normKey(u.uid), u]));
    const filtered = responsaveisParaAtribuicao.filter((r) => {
      const user = byUid.get(normKey(r.id));
      if (!user) return true;
      const userEmpresas = (user.empresas ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
      if (userEmpresas.includes('*') || userEmpresas.includes('todas')) return true;
      if (alvoWorkspace) return userEmpresas.includes(alvoWorkspace);
      return userEmpresas.some((e) => minhasEmpresas.has(e));
    });
    return filtered;
  }, [
    profile?.role,
    profile?.empresas,
    hasAllWorkspaceAccess,
    allowedWorkspaceKeys,
    workspaceAtivo,
    hasModuleAction,
    perfisCadastroUsuarios,
    responsaveisParaAtribuicao,
  ]);

  const displayWhoKanban = useCallback(
    (who: string) => nomeExibicaoWhoParaItem(who, responsaveisParaAtribuicao, perfisCadastroUsuarios),
    [responsaveisParaAtribuicao, perfisCadastroUsuarios],
  );

  /** Grava sempre o uid do cadastro quando o responsável escolhido é um usuário Firebase (alinha filtro “meu perfil”). */
  const canonicalDonoIdForPersist = useCallback(
    (selectedId: string): string => {
      const sid = selectedId.trim();
      if (!sid) return sid;
      const perfilByUid = perfisCadastroUsuarios.find((u) => normKey(u.uid) === normKey(sid));
      if (perfilByUid) return perfilByUid.uid;
      const r = responsaveisParaAtribuicao.find((x) => normKey(x.id) === normKey(sid));
      if (!r?.nome?.trim()) return sid;
      const perfilByNome = perfisCadastroUsuarios.find(
        (u) => u.ativo !== false && normKey(u.nome) === normKey(r.nome),
      );
      return perfilByNome?.uid ?? sid;
    },
    [perfisCadastroUsuarios, responsaveisParaAtribuicao],
  );

  const empresasDisponiveis = useMemo(() => empresasLocais, [empresasLocais]);

  const empresasAtivas = useMemo(() => {
    let filtered = empresasDisponiveis.filter((nome) => !empresasBloqueadas.includes(nome));
    if (profile && !hasAllWorkspaceAccess) {
      filtered = filtered.filter((nome) => allowedWorkspaceKeys.has(normalizeWorkspaceName(nome)));
    }
    return filtered;
  }, [empresasDisponiveis, empresasBloqueadas, profile, hasAllWorkspaceAccess, allowedWorkspaceKeys]);

  const podeVerTodasEmpresasNoSeletor = useMemo(() => {
    if (!profile) return true;
    if (hasAllWorkspaceAccess) return true;
    return empresasAtivas.length > 1;
  }, [profile, hasAllWorkspaceAccess, empresasAtivas]);

  // Garante que usuário restrito não fique em \"Todas as empresas\"
  useEffect(() => {
    if (!profile) return;
    if (hasAllWorkspaceAccess) return;
    if (workspaceAtivo === 'all') {
      if (empresasAtivas.length === 1) {
        setWorkspaceAtivo(empresasAtivas[0]);
      }
      return;
    }
    const currentAllowed =
      empresasAtivas.some((nome) => normalizeWorkspaceName(nome) === normalizeWorkspaceName(workspaceAtivo));
    if (currentAllowed) return;
    if (empresasAtivas.length > 0) {
      setWorkspaceAtivo(empresasAtivas[0]);
    }
  }, [profile, hasAllWorkspaceAccess, workspaceAtivo, empresasAtivas]);

  const empresasInativas = useMemo(
    () => empresasDisponiveis.filter((nome) => empresasBloqueadas.includes(nome)),
    [empresasDisponiveis, empresasBloqueadas]
  );

  const sinteticasFromItems = useMemo<Prioridade[]>(() => {
    return items
      .filter(
        (item) =>
          item.status !== ItemStatus.BACKLOG &&
          !ritmo.board.prioridades.some(
            (p) => p.titulo === item.what && p.dono_id === item.who
          )
      )
      .map((item) => ({
        id: `legacy-${item.id}`,
        titulo: item.what,
        descricao: item.why,
        link: item.link,
        dono_id: item.who,
        data_inicio: Date.now(),
        data_alvo: item.when ? new Date(item.when + 'T12:00:00').getTime() : Date.now(),
        status_prioridade:
          item.status === ItemStatus.BLOCKED
            ? 'Bloqueado'
            : item.status === ItemStatus.COMPLETED
            ? 'Concluido'
            : 'Execucao',
        created_by: item.created_by ?? '',
        empresa: item.empresa,
      }));
  }, [items, ritmo.board.prioridades]);

  /** Ids/nomes do usuário logado para cruzar com dono_id / tarefas (independente da empresa gravada). */
  const myResponsavelIdsForBoard = useMemo(
    () =>
      responsavelIdsForLoggedUser(profile?.uid, profile?.nome, responsaveisParaAtribuicao, {
        email: profile?.email,
        displayName: firebaseUser?.displayName ?? undefined,
      }),
    [
      profile?.uid,
      profile?.nome,
      profile?.email,
      firebaseUser?.displayName,
      responsaveisParaAtribuicao,
    ],
  );

  const currentUserIdentityKeys = useMemo(() => {
    const keys = new Set<string>();
    const add = (v: string | null | undefined) => {
      const n = normKey(v);
      if (n) keys.add(n);
    };
    add(profile?.uid);
    add(profile?.nome);
    add(profile?.email);
    add(userLocalPart(profile?.email));
    add(firebaseUser?.displayName ?? undefined);
    for (const id of myResponsavelIdsForBoard) add(id);
    return keys;
  }, [
    profile?.uid,
    profile?.nome,
    profile?.email,
    firebaseUser?.displayName,
    myResponsavelIdsForBoard,
  ]);

  const isCreatedByMe = useCallback(
    (createdBy?: string, fallbackOwnerLike?: string) => {
      const creator = (createdBy ?? '').trim();
      if (creator) {
        if (
          donoPrioridadeCorrespondeAoUsuario(
            creator,
            myResponsavelIdsForBoard,
            responsaveisParaAtribuicao,
          )
        ) {
          return true;
        }
        if (currentUserIdentityKeys.has(normKey(creator))) return true;
      }
      const fallback = (fallbackOwnerLike ?? '').trim();
      if (!fallback) return false;
      return donoPrioridadeCorrespondeAoUsuario(
        fallback,
        myResponsavelIdsForBoard,
        responsaveisParaAtribuicao,
      );
    },
    [myResponsavelIdsForBoard, responsaveisParaAtribuicao, currentUserIdentityKeys],
  );

  const identityMatchesLoggedUser = useCallback(
    (value?: string | null) => {
      const raw = (value ?? '').trim();
      if (!raw) return false;
      if (currentUserIdentityKeys.has(normKey(raw))) return true;
      return donoPrioridadeCorrespondeAoUsuario(
        raw,
        myResponsavelIdsForBoard,
        responsaveisParaAtribuicao,
      );
    },
    [currentUserIdentityKeys, myResponsavelIdsForBoard, responsaveisParaAtribuicao],
  );

  const canUserAccessActionItem = useCallback(
    (item: ActionItem) => {
      if (profile?.role === 'administrador') return true;
      return (
        isCreatedByMe(item.created_by, item.who) ||
        donoPrioridadeCorrespondeAoUsuario(
          item.who,
          myResponsavelIdsForBoard,
          responsaveisParaAtribuicao,
        )
      );
    },
    [profile?.role, isCreatedByMe, myResponsavelIdsForBoard, responsaveisParaAtribuicao],
  );

  const matchWorkspaceStrict = useCallback(
    (empresa?: string | null): boolean => {
      const em = (empresa ?? '').trim();
      const ws = String(workspaceAtivo).trim().toLowerCase();

      // Sem empresa (legado): quando um workspace específico está selecionado,
      // mantém visível para não "sumir" com itens antigos ao trocar de filtro.
      if (!em) {
        return ws !== 'all';
      }

      if (ws === 'all') return canSeeEmpresa(em);
      return em.toLowerCase() === ws;
    },
    [workspaceAtivo, canSeeEmpresa],
  );

  const canReadCrossWorkspaceGlobal = useMemo(() => {
    if (profile?.role === 'administrador') {
      return hasAllWorkspaceAccess || allowedWorkspaceKeys.size > 1;
    }
    return (
      hasModuleAction('table', 'cross_workspace_view') ||
      hasModuleAction('operacional', 'cross_workspace_view')
    );
  }, [profile?.role, hasAllWorkspaceAccess, allowedWorkspaceKeys, hasModuleAction]);

  const matchWorkspaceRitmo = useCallback(
    (empresa?: string | null): boolean => {
      if (workspaceAtivo !== 'all') return matchWorkspaceStrict(empresa);
      const nome = (empresa ?? '').trim();
      if (nome && !canSeeEmpresa(nome)) return false;
      if (canReadCrossWorkspaceGlobal) return true;
      return matchWorkspaceStrict(empresa);
    },
    [workspaceAtivo, canReadCrossWorkspaceGlobal, matchWorkspaceStrict, canSeeEmpresa],
  );

  const backlogViewItems = useMemo(() => {
    return items.filter((i) => {
      if (i.empresa?.trim() && !canSeeEmpresa(i.empresa)) return false;
      // Regra de backlog: usuário enxerga apenas itens do workspace em foco
      // OU itens criados por ele mesmo (mesmo que em outro workspace).
      if (matchWorkspaceStrict(i.empresa)) return true;
      return isCreatedByMe(i.created_by, i.who);
    });
  }, [items, canSeeEmpresa, matchWorkspaceStrict, isCreatedByMe]);

  useEffect(() => {
    if (!isAuthenticated || !isFirebaseConfigured) {
      setAppSettings(getDefaultAppSettings());
      return;
    }
    const unsub = subscribeAppSettings(setAppSettings);
    return () => unsub();
  }, [isAuthenticated]);

  /**
   * Estratégico (Kanban): por padrão todos veem iniciativas do workspace.
   * Se `appSettings.estrategicoFiltrarKanbanPorWho` estiver ativo (Painel Admin), só administrador vê o quadro completo;
   * demais usuários só veem cartões cujo WHO corresponde a eles.
   */
  const itemsFiltrados = useMemo(() => {
    const base = items.filter((i) => matchWorkspaceStrict(i.empresa));
    if (profile?.role === 'administrador') return base;
    if (myResponsavelIdsForBoard.size === 0) return [];
    const porResponsavelOuCriador = base.filter((i) =>
      canUserAccessActionItem(i) || donoPrioridadeCorrespondeAoUsuario(
        i.who,
        myResponsavelIdsForBoard,
        responsaveisParaAtribuicao,
      ),
    );
    if (!appSettings.estrategicoFiltrarKanbanPorWho) return porResponsavelOuCriador;
    return porResponsavelOuCriador;
  }, [
    items,
    matchWorkspaceStrict,
    canUserAccessActionItem,
    appSettings.estrategicoFiltrarKanbanPorWho,
    profile?.role,
    myResponsavelIdsForBoard,
    responsaveisParaAtribuicao,
  ]);

  const filterActionItemsByHeaderSearch = useCallback(
    (list: ActionItem[]) => {
      const needle = headerSearchQuery.trim().toLowerCase();
      if (!needle) return list;
      return list.filter((i) => {
        const whoResolved = displayWhoKanban(i.who);
        const creatorResolved = displayWhoKanban(i.created_by ?? '');
        const haystack = [
          i.what,
          i.why,
          i.where,
          i.how,
          i.notes,
          i.homologationActions,
          i.link,
          i.empresa,
          i.who,
          whoResolved,
          i.created_by,
          creatorResolved,
          String(i.status ?? ''),
          String(i.urgency ?? ''),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(needle);
      });
    },
    [headerSearchQuery, displayWhoKanban],
  );

  const itemsFiltradosComPesquisa = useMemo(
    () => filterActionItemsByHeaderSearch(itemsFiltrados),
    [itemsFiltrados, filterActionItemsByHeaderSearch],
  );

  const backlogViewItemsComPesquisa = useMemo(
    () => filterActionItemsByHeaderSearch(backlogViewItems),
    [backlogViewItems, filterActionItemsByHeaderSearch],
  );

  /** Prioridade entra na lista mesmo com empresa “errada” se o usuário é dono, WHO de algum plano ou tem tarefa atribuída. */
  const prioridadeVisivelPorDemandaAtribuida = useCallback(
    (p: Prioridade) => {
      if (isCreatedByMe(p.created_by, p.dono_id)) return true;
      if (myResponsavelIdsForBoard.size === 0) return false;
      if (canViewByOwnershipOrObserver([p.dono_id], p.observadores, myResponsavelIdsForBoard, responsaveisParaAtribuicao)) {
        return true;
      }
      if (
        donoPrioridadeCorrespondeAoUsuario(
          p.dono_id,
          myResponsavelIdsForBoard,
          responsaveisParaAtribuicao,
        )
      ) {
        return true;
      }
      for (const pl of ritmo.board.planos) {
        if (pl.prioridade_id !== p.id) continue;
        if (isCreatedByMe(pl.created_by, pl.who_id)) return true;
        if (canViewByOwnershipOrObserver([pl.who_id], pl.observadores, myResponsavelIdsForBoard, responsaveisParaAtribuicao)) {
          return true;
        }
        if (
          donoPrioridadeCorrespondeAoUsuario(
            pl.who_id,
            myResponsavelIdsForBoard,
            responsaveisParaAtribuicao,
          )
        ) {
          return true;
        }
        for (const t of ritmo.board.tarefas) {
          if (t.plano_id !== pl.id) continue;
          if (isCreatedByMe(t.created_by, t.responsavel_id)) return true;
          if (canViewByOwnershipOrObserver([t.responsavel_id], t.observadores, myResponsavelIdsForBoard, responsaveisParaAtribuicao)) {
            return true;
          }
          if (tarefaAtribuidaAoUsuario(t, myResponsavelIdsForBoard, responsaveisParaAtribuicao)) {
            return true;
          }
        }
      }
      return false;
    },
    [
      myResponsavelIdsForBoard,
      isCreatedByMe,
      responsaveisParaAtribuicao,
      ritmo.board.planos,
      ritmo.board.tarefas,
    ],
  );

  const quadroPrioridades = useMemo<Prioridade[]>(() => {
    const todas = [...ritmo.board.prioridades, ...sinteticasFromItems];
    const porEmpresa = todas.filter((p) => matchWorkspaceRitmo(p.empresa));
    if (profile?.role === 'administrador') return porEmpresa;
    // Cross-workspace: inclui prioridades de outros workspaces quando o usuário é WHO de
    // algum plano filho ou tem tarefa atribuída — independente do workspace da prioridade.
    return todas.filter((p) => prioridadeVisivelPorDemandaAtribuida(p));
  }, [
    ritmo.board.prioridades,
    sinteticasFromItems,
    matchWorkspaceRitmo,
    profile?.role,
    myResponsavelIdsForBoard,
    prioridadeVisivelPorDemandaAtribuida,
  ]);

  const taticoPrioridades = quadroPrioridades;

  const idsPrioridadesEscopoRitmo = useMemo(
    () => new Set(quadroPrioridades.map((p) => p.id)),
    [quadroPrioridades],
  );

  const ritmoPlanosEscopoVisivel = useMemo(
    () => {
      const base = ritmo.board.planos.filter((pl) => {
        // Cross-workspace: plano atribuído ao usuário como WHO — sempre visível.
        if (
          myResponsavelIdsForBoard.size > 0 &&
          donoPrioridadeCorrespondeAoUsuario(pl.who_id, myResponsavelIdsForBoard, responsaveisParaAtribuicao)
        ) return true;
        // Planos que contêm tarefas atribuídas ao usuário sempre são visíveis,
        // independente do workspace — para não bloquear a visão da tarefa atribuída.
        const hasTarefaAtribuida = ritmo.board.tarefas.some(
          (t) =>
            t.plano_id === pl.id &&
            tarefaAtribuidaAoUsuario(t, myResponsavelIdsForBoard, responsaveisParaAtribuicao),
        );
        if (hasTarefaAtribuida) return true;
        return (
          (!pl.empresa?.trim() || canSeeEmpresa(pl.empresa)) &&
          (matchWorkspaceRitmo(pl.empresa) || idsPrioridadesEscopoRitmo.has(pl.prioridade_id))
        );
      });
      if (profile?.role === 'administrador') return base;
      if (myResponsavelIdsForBoard.size === 0) {
        return base.filter((pl) => isCreatedByMe(pl.created_by, pl.who_id));
      }
      return base.filter(
        (pl) =>
          isCreatedByMe(pl.created_by, pl.who_id) ||
          canViewByOwnershipOrObserver([pl.who_id], pl.observadores, myResponsavelIdsForBoard, responsaveisParaAtribuicao) ||
          donoPrioridadeCorrespondeAoUsuario(
            pl.who_id,
            myResponsavelIdsForBoard,
            responsaveisParaAtribuicao,
          ),
      );
    },
    [
      ritmo.board.planos,
      ritmo.board.tarefas,
      canSeeEmpresa,
      matchWorkspaceRitmo,
      idsPrioridadesEscopoRitmo,
      profile?.role,
      myResponsavelIdsForBoard,
      isCreatedByMe,
      responsaveisParaAtribuicao,
    ],
  );

  const idsPlanosEscopoVisivel = useMemo(
    () => new Set(ritmoPlanosEscopoVisivel.map((pl) => pl.id)),
    [ritmoPlanosEscopoVisivel],
  );

  const ritmoTarefasEscopoVisivel = useMemo(
    () => {
      const base = ritmo.board.tarefas.filter((t) => {
        // Tarefas atribuídas ao usuário são sempre visíveis, independente do workspace.
        // Isso resolve o bug de cross-workspace: canSeeEmpresa não pode bloquear tarefas
        // que foram explicitamente delegadas ao usuário logado.
        if (tarefaAtribuidaAoUsuario(t, myResponsavelIdsForBoard, responsaveisParaAtribuicao)) return true;
        // Para as demais, aplicar filtro de empresa + workspace normalmente.
        return (
          (!t.empresa?.trim() || canSeeEmpresa(t.empresa)) &&
          (matchWorkspaceRitmo(t.empresa) || idsPlanosEscopoVisivel.has(t.plano_id))
        );
      });
      if (profile?.role === 'administrador') return base;
      if (myResponsavelIdsForBoard.size === 0) {
        return base.filter((t) => isCreatedByMe(t.created_by, t.responsavel_id));
      }
      return base.filter(
        (t) =>
          isCreatedByMe(t.created_by, t.responsavel_id) ||
          canViewByOwnershipOrObserver([t.responsavel_id], t.observadores, myResponsavelIdsForBoard, responsaveisParaAtribuicao) ||
          tarefaAtribuidaAoUsuario(t, myResponsavelIdsForBoard, responsaveisParaAtribuicao),
      );
    },
    [
      ritmo.board.tarefas,
      canSeeEmpresa,
      matchWorkspaceRitmo,
      idsPlanosEscopoVisivel,
      profile?.role,
      myResponsavelIdsForBoard,
      isCreatedByMe,
      responsaveisParaAtribuicao,
    ],
  );

  const perm = useMemo(
    () => ({
      backlog: {
        create: hasModuleAction('backlog', 'create'),
        edit: hasModuleAction('backlog', 'edit'),
        workspaceEdit: hasModuleAction('backlog', 'workspace_edit'),
        delete: hasModuleAction('backlog', 'delete'),
        workflow: hasModuleAction('backlog', 'workflow'),
      },
      dashboard: {
        create: hasModuleAction('dashboard', 'create'),
        edit: hasModuleAction('dashboard', 'edit'),
        workspaceEdit: hasModuleAction('dashboard', 'workspace_edit'),
        delete: hasModuleAction('dashboard', 'delete'),
        workflow: hasModuleAction('dashboard', 'workflow'),
        linkTatico: hasModuleAction('dashboard', 'link_tatico'),
      },
      table: {
        prioridadeWrite: hasModuleAction('table', 'prioridade_write'),
        planoWrite: hasModuleAction('table', 'plano_write'),
        planoDelete: hasModuleAction('table', 'plano_delete'),
        verTodosPlanos: hasModuleAction('table', 'ver_todos_planos'),
        tarefaWrite: hasModuleAction('table', 'tarefa_write'),
        tarefaAssign: hasModuleAction('table', 'tarefa_assign'),
        tarefaDelete: hasModuleAction('table', 'tarefa_delete'),
        observerEdit: hasModuleAction('table', 'observer_edit'),
        crossWorkspaceView: hasModuleAction('table', 'cross_workspace_view'),
        crossWorkspaceAssign: hasModuleAction('table', 'cross_workspace_assign'),
      },
      operacional: {
        // Regra de produto: Operacional edita apenas tarefas.
        planoWrite: false,
        tarefaWrite: hasModuleAction('operacional', 'tarefa_write'),
        tarefaAssign: hasModuleAction('operacional', 'tarefa_assign'),
        tarefaDelete: hasModuleAction('operacional', 'tarefa_delete'),
        observerEdit: hasModuleAction('operacional', 'observer_edit'),
        crossWorkspaceView: hasModuleAction('operacional', 'cross_workspace_view'),
        crossWorkspaceAssign: hasModuleAction('operacional', 'cross_workspace_assign'),
      },
      roadmap: {
        edit: hasModuleAction('roadmap', 'edit'),
      },
      ia: {
        send: hasModuleAction('ia', 'send'),
      },
    }),
    [hasModuleAction, profile]
  );

  const canCrossWorkspaceViewCurrent = useMemo(() => {
    if (profile?.role === 'administrador') return true;
    if (activeView === 'table') return perm.table.crossWorkspaceView;
    if (activeView === 'operacional') return perm.operacional.crossWorkspaceView;
    return false;
  }, [profile?.role, activeView, perm.table.crossWorkspaceView, perm.operacional.crossWorkspaceView]);

  const canCrossWorkspaceAssignCurrent = useMemo(() => {
    if (profile?.role === 'administrador') return true;
    if (activeView === 'table') return perm.table.crossWorkspaceAssign;
    if (activeView === 'operacional') return perm.operacional.crossWorkspaceAssign;
    return false;
  }, [profile?.role, activeView, perm.table.crossWorkspaceAssign, perm.operacional.crossWorkspaceAssign]);

  const handleGoToTaticoPriority = useCallback(
    (item: ActionItem) => {
      const match =
        taticoPrioridades.find((p) => p.titulo === item.what && p.dono_id === item.who) ?? null;

      // Garante que o focus mude mesmo se clicar duas vezes na mesma prioridade.
      setFocusPrioridadeId(null);
      requestAnimationFrame(() => setFocusPrioridadeId(match?.id ?? null));
      setTableOnlyPrioridadeId(match?.id ?? null);
      setActiveView('table');
    },
    [taticoPrioridades]
  );

  const handleSetView = useCallback((view: ViewId) => {
    // Ao abrir Tático pelo menu lateral, volta para visão completa.
    if (view === 'table') {
      setTableOnlyPrioridadeId(null);
      setFocusPrioridadeId(null);
    }
    setActiveView(view);
  }, []);

  const handleWorkspaceShortcutClick = useCallback(() => {
    if (workspaceAtivo === 'all') {
      setToast({
        message: 'Selecione um workspace específico para abrir o link externo.',
        type: 'error',
      });
      return;
    }
    const target = resolvePrimaryExternalLinkForWorkspace(
      profile?.externalWorkspaceLinks,
      workspaceAtivo
    );
    if (!target?.url?.trim()) {
      setToast({
        message: 'Sem link externo configurado para este workspace.',
        type: 'error',
      });
      return;
    }
    window.open(target.url, '_blank', 'noopener,noreferrer');
  }, [workspaceAtivo, profile?.externalWorkspaceLinks]);

  const handleOpenWorkspaceExternalLink = useCallback((url: string) => {
    const href = url.trim();
    if (!href) {
      setToast({ message: 'Link externo inválido.', type: 'error' });
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
  }, []);

  const openItemModal = useCallback(
    (
      item: ActionItem | null,
      statusForNew?: ItemStatus,
      context: 'default' | 'backlog' | 'estrategico' = 'default'
    ) => {
      setSelectedItem(item);
      setDefaultStatusForNew(item === null && statusForNew ? statusForNew : null);
      setModalContext(context);
      setModalOpen(true);
    },
    []
  );

  const closeItemModal = useCallback(() => {
    setModalOpen(false);
    setSelectedItem(null);
    setDefaultStatusForNew(null);
    setModalContext('default');
  }, []);

  const notesUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!encryptionKey) return;
    StorageService.getStrategicNote(encryptionKey).then(setStrategicNote).catch(() => setStrategicNote(''));
    if (isFirebaseConfigured) {
      const unsub = subscribeBoard(encryptionKey, () => {}, setStrategicNote);
      notesUnsubRef.current = unsub ?? null;
      return () => {
        if (notesUnsubRef.current) notesUnsubRef.current();
        notesUnsubRef.current = null;
      };
    }
  }, [encryptionKey]);

  const saveNote = useCallback(async () => {
    if (!encryptionKey) return;
    setNoteSaving(true);
    try {
      await StorageService.saveStrategicNote(strategicNote, encryptionKey);
      if (isFirebaseConfigured) await saveBoardNotes(strategicNote, encryptionKey);
      setToast({ message: 'Decisão salva e criptografada com sucesso.', type: 'success' });
    } catch (e) {
      setToast({ message: 'Erro ao salvar. Faça login novamente.', type: 'error' });
    } finally {
      setNoteSaving(false);
    }
  }, [encryptionKey, strategicNote]);

  const handleAddNew = () => {
    if (activeView === 'backlog' && !perm.backlog.create) {
      setToast({ message: 'Sem permissão para criar itens no Backlog.', type: 'error' });
      return;
    }
    if (activeView === 'dashboard' && !perm.dashboard.create) {
      setToast({ message: 'Sem permissão para criar no quadro Estratégico.', type: 'error' });
      return;
    }
    if (
      activeView !== 'backlog' &&
      activeView !== 'dashboard' &&
      !perm.dashboard.create
    ) {
      setToast({ message: 'Sem permissão para criar novas iniciativas.', type: 'error' });
      return;
    }
    openItemModal(
      null,
      activeView === 'backlog' ? ItemStatus.BACKLOG : undefined,
      activeView === 'backlog' ? 'backlog' : activeView === 'dashboard' ? 'estrategico' : 'default'
    );
  };
  const handleAddPrioridade = () => setPrioridadeModalOpen(true);
  const loadingAny = loading || ritmo.loading;

  useEffect(() => {
    if (!isAuthenticated || !profile || myResponsavelIdsForBoard.size === 0) {
      assignmentNotificationsReady.current = false;
      assignmentStateByKey.current = new Map();
      return;
    }
    if (loadingAny) return;

    const assignedOwner = (value: string) =>
      donoPrioridadeCorrespondeAoUsuario(
        value,
        myResponsavelIdsForBoard,
        responsaveisParaAtribuicao,
      );
    const observing = (observadores: Observer[] | undefined) =>
      userIsObserver(observadores, myResponsavelIdsForBoard);
    const targets: AssignmentNotificationTarget[] = [];
    const addTarget = (target: AssignmentNotificationTarget) => targets.push(target);

    items.forEach((item) => {
      addTarget({
        key: `legacy-action:${item.id}:owner`,
        assignedToMe: assignedOwner(item.who),
        title: 'Nova iniciativa para você',
        body: `Você foi definido como responsável por "${item.what}".`,
        view: item.status === ItemStatus.BACKLOG ? 'backlog' : 'dashboard',
        createdBy: item.created_by,
      });
    });

    ritmo.board.prioridades.forEach((prioridade) => {
      addTarget({
        key: `prioridade:${prioridade.id}:owner`,
        assignedToMe: assignedOwner(prioridade.dono_id),
        title: 'Nova prioridade para você',
        body: `Você foi definido como responsável por "${prioridade.titulo}".`,
        view: 'table',
        createdBy: prioridade.created_by,
      });
      addTarget({
        key: `prioridade:${prioridade.id}:observer`,
        assignedToMe: observing(prioridade.observadores),
        title: 'Novo acompanhamento para você',
        body: `Você foi adicionado como observador da prioridade "${prioridade.titulo}".`,
        view: 'table',
        createdBy: prioridade.created_by,
      });
    });

    ritmo.board.planos.forEach((plano) => {
      addTarget({
        key: `plano:${plano.id}:owner`,
        assignedToMe: assignedOwner(plano.who_id),
        title: 'Novo plano para você',
        body: `Você foi definido como responsável pelo plano "${plano.titulo}".`,
        view: 'table',
        createdBy: plano.created_by,
      });
      addTarget({
        key: `plano:${plano.id}:observer`,
        assignedToMe: observing(plano.observadores),
        title: 'Novo acompanhamento para você',
        body: `Você foi adicionado como observador do plano "${plano.titulo}".`,
        view: 'table',
        createdBy: plano.created_by,
      });
    });

    ritmo.board.tarefas.forEach((tarefa) => {
      addTarget({
        key: `tarefa:${tarefa.id}:owner`,
        assignedToMe: tarefaAtribuidaAoUsuario(
          tarefa,
          myResponsavelIdsForBoard,
          responsaveisParaAtribuicao,
        ),
        title: 'Nova tarefa para você',
        body: `Você foi definido como responsável pela tarefa "${tarefa.titulo}".`,
        view: 'operacional',
        createdBy: tarefa.created_by,
      });
      addTarget({
        key: `tarefa:${tarefa.id}:observer`,
        assignedToMe: observing(tarefa.observadores),
        title: 'Novo acompanhamento para você',
        body: `Você foi adicionado como observador da tarefa "${tarefa.titulo}".`,
        view: 'operacional',
        createdBy: tarefa.created_by,
      });
    });

    const previous = assignmentStateByKey.current;
    const nextState = new Map(targets.map((target) => [target.key, target.assignedToMe]));
    const wasReady = assignmentNotificationsReady.current;
    assignmentStateByKey.current = nextState;

    if (!wasReady) {
      assignmentNotificationsReady.current = true;
      return;
    }

    const newAssignments = targets.filter(
      (target) =>
        target.assignedToMe &&
        previous.get(target.key) !== true &&
        !identityMatchesLoggedUser(target.createdBy),
    );

    if (newAssignments.length === 0) return;

    const first = newAssignments[0];
    const message =
      newAssignments.length === 1
        ? first.body
        : `Você recebeu ${newAssignments.length} novas atribuições/acompanhamentos.`;

    setToast({ message: compactNotificationText(message, 120), type: 'success' });
    dispatchSystemNotification(
      newAssignments.length === 1 ? first.title : 'Novas demandas para você',
      {
        body: compactNotificationText(message),
        tag:
          newAssignments.length === 1
            ? `assignment-${first.key}`
            : `assignment-batch-${Date.now()}`,
      },
      () => setActiveView(first.view),
    );
  }, [
    isAuthenticated,
    profile,
    loadingAny,
    items,
    ritmo.board.prioridades,
    ritmo.board.planos,
    ritmo.board.tarefas,
    myResponsavelIdsForBoard,
    responsaveisParaAtribuicao,
    identityMatchesLoggedUser,
    dispatchSystemNotification,
  ]);

  const handleOpenPrioridade = useCallback(
    (p: Prioridade) => {
      if (p.id.startsWith('legacy-')) {
        const legacyId = p.id.replace('legacy-', '');
        const item = items.find((i) => i.id === legacyId) ?? null;
        if (item) {
          openItemModal(item);
          return;
        }
      }
      setSelectedPrioridade(p);
    },
    [items, openItemModal]
  );

  const handleUpdatePrioridadeTatico = useCallback(
    (id: string, updates: Partial<Prioridade>) => {
      if (id.startsWith('legacy-')) {
        const legacyId = id.replace('legacy-', '');
        const status = updates.status_prioridade;
        if (status) {
          let itemStatus: ItemStatus | null = null;
          if (status === 'Execucao') itemStatus = ItemStatus.EXECUTING;
          else if (status === 'Bloqueado') itemStatus = ItemStatus.BLOCKED;
          else if (status === 'Concluido') itemStatus = ItemStatus.COMPLETED;
          if (itemStatus) {
            updateStatus(legacyId, itemStatus);
          }
        }
        if (updates.dono_id !== undefined) {
          const donoCanon = canonicalDonoIdForPersist(String(updates.dono_id)).trim();
          if (donoCanon) {
            const currentItem = items.find((i) => i.id === legacyId);
            const antesCanon = currentItem
              ? canonicalDonoIdForPersist(String(currentItem.who))
              : '';
            const patch: Partial<ActionItem> = { who: donoCanon };
            if (!antesCanon || normKey(donoCanon) !== normKey(antesCanon)) {
              const assignee = perfisCadastroUsuarios.find(
                (u) => u.ativo !== false && normKey(u.uid) === normKey(donoCanon),
              );
              const wsClass =
                workspaceAtivo === 'all' ? '' : String(workspaceAtivo).trim();
              patch.empresa = empresaParaDemandaDoDono(assignee, wsClass);
            }
            void updateItem(legacyId, patch);
          }
        }
        return;
      }
      let merged: Partial<Prioridade> = { ...updates };
      const prioridadeAtual = ritmo.board.prioridades.find((p) => p.id === id);
      const donoImutavelPorBacklog = Boolean(prioridadeAtual?.origem_backlog_id);
      if (donoImutavelPorBacklog && merged.dono_id !== undefined) {
        const { dono_id: _ignoreDono, ...rest } = merged;
        merged = rest;
      }
      if (updates.dono_id !== undefined) {
        const current = prioridadeAtual;
        const donoCanon = canonicalDonoIdForPersist(String(updates.dono_id));
        const antesCanon = current
          ? canonicalDonoIdForPersist(String(current.dono_id))
          : '';
        if (!donoImutavelPorBacklog) {
          merged = { ...merged, dono_id: donoCanon };
        }
        if (!donoImutavelPorBacklog && (!antesCanon || normKey(donoCanon) !== normKey(antesCanon))) {
          const assignee = perfisCadastroUsuarios.find(
            (u) => u.ativo !== false && normKey(u.uid) === normKey(donoCanon),
          );
          const wsClass =
            workspaceAtivo === 'all' ? '' : String(workspaceAtivo).trim();
          merged = { ...merged, empresa: empresaParaDemandaDoDono(assignee, wsClass) };
        }
      }
      ritmo.updatePrioridade(id, merged);
    },
    [
      ritmo,
      updateStatus,
      updateItem,
      items,
      workspaceAtivo,
      canonicalDonoIdForPersist,
      perfisCadastroUsuarios,
    ]
  );

  const performDeletePrioridade = useCallback(
    (p: Prioridade) => {
      if (p.id.startsWith('legacy-')) {
        const legacyId = p.id.replace('legacy-', '');
        deleteItem(legacyId);
        return;
      }
      ritmo.deletePrioridade(p.id);
      const match = items.find((i) => i.what === p.titulo && i.who === p.dono_id);
      if (match) deleteItem(match.id);
    },
    [items, deleteItem, ritmo]
  );

  const handleDeletePrioridade = useCallback((p: Prioridade) => {
    setPrioridadeToDelete(p);
  }, []);

  const handleTaticoFocusConsumed = useCallback(() => {
    focusedPrioridadeId.current = null;
    setFocusPrioridadeId(null);
  }, []);

  if (authLoading || !isAuthenticated) return <UserLogin />;

  return (
    <div className="flex h-screen min-h-dvh bg-slate-950 overflow-hidden text-slate-100">
      <Toast
        message={toast?.message ?? ''}
        type={toast?.type ?? 'success'}
        visible={toast !== null}
        onClose={() => setToast(null)}
      />
      <Modal
        isOpen={showSystemNotificationPrompt}
        onClose={() => setShowSystemNotificationPrompt(false)}
        title="Notificações do Mavo"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="shrink-0 w-10 h-10 rounded-lg bg-blue-600/20 text-blue-300 flex items-center justify-center">
              <Bell size={20} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-100">
                Deseja receber notificações do sistema Mavo?
              </p>
              <p className="text-xs leading-relaxed text-slate-400">
                O Mavo pode avisar pelo Windows quando chegarem mensagens, convites e novas atribuições.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setShowSystemNotificationPrompt(false)}
              className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 hover:bg-slate-800"
            >
              Agora não
            </button>
            <button
              type="button"
              onClick={() => void requestSystemNotifications()}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium text-white"
            >
              Permitir notificações
            </button>
          </div>
        </div>
      </Modal>
      <Sidebar
        activeView={activeView}
        setView={handleSetView}
        onLogout={logout}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        workspaceAtivo={workspaceAtivo}
        empresas={empresasAtivas}
        allowAllWorkspaces={podeVerTodasEmpresasNoSeletor}
        onChangeWorkspace={(ws) => setWorkspaceAtivo(ws)}
        onCreateWorkspace={(nome) => {
          const trimmed = nome.trim();
          if (!trimmed) return;
          setEmpresasLocais((prev) =>
            prev.includes(trimmed) ? prev : [...prev, trimmed]
          );
          ritmo.addEmpresa(trimmed);
          setWorkspaceAtivo(trimmed);
        }}
        userRole={profile?.role}
        allowedViews={profile?.views}
        userName={profile?.nome}
        notificationsSupported={typeof window !== 'undefined' && 'Notification' in window}
        notificationPermission={systemNotificationPermission}
        notificationsEnabled={systemNotificationsEnabled}
        onToggleNotifications={toggleSystemNotifications}
        onWorkspaceShortcutClick={handleWorkspaceShortcutClick}
        externalWorkspaceLinks={profile?.externalWorkspaceLinks}
        onOpenWorkspaceExternalLink={handleOpenWorkspaceExternalLink}
        chatCurrentUser={chatUser}
      />

      <main className="flex-1 flex flex-col overflow-hidden relative min-h-0">
        <header className="h-14 min-h-[52px] bg-slate-900/95 border-b border-slate-800 flex items-center justify-between px-3 sm:px-4 md:px-6 z-30 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2.5 min-h-[44px] min-w-[44px] text-slate-400 hover:text-white bg-slate-800/80 rounded-lg touch-manipulation"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2.5">
              {activeView === 'dashboard' && (
                <EstrategicoGridIcon
                  size={18}
                  strokeWidth={2}
                  className="text-blue-400 shrink-0"
                />
              )}
              {activeView === 'table' && <Target size={18} className="text-blue-500 shrink-0" />}
              {activeView === 'backlog' && <ListTodo size={18} className="text-blue-500 shrink-0" />}
              {activeView === 'performance' && <PieChart size={18} className="text-violet-500 shrink-0" />}
              {activeView === 'roadmap' && <Briefcase size={18} className="text-cyan-500 shrink-0" />}
              {activeView === 'ia' && <Bot size={18} className="text-blue-400 shrink-0" />}
              {activeView === 'workspace' && <ShieldCheck size={18} className="text-blue-400 shrink-0" />}
              {activeView === 'operacional' && <FileText size={18} className="text-blue-500 shrink-0" />}
              <h2 className="text-base font-semibold text-slate-100 tracking-tight">
                {activeView === 'workspace' && 'Workspaces'}
                {activeView === 'dashboard' && 'Estratégico'}
                {activeView === 'table' && 'Tático'}
                {activeView === 'backlog' && 'Backlog'}
                {activeView === 'performance' && 'Desempenho'}
                {activeView === 'roadmap' && 'Roadmap 2026'}
                {activeView === 'ia' && '5W2H CHAT'}
                {activeView === 'operacional' && 'Operacional'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative hidden md:block min-w-0 max-w-[min(100%,14rem)]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                type="search"
                value={headerSearchQuery}
                onChange={(e) => setHeaderSearchQuery(e.target.value)}
                placeholder="Pesquisar..."
                autoComplete="off"
                aria-label="Pesquisar iniciativas e backlog"
                className="bg-slate-950/80 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-300 outline-none focus:border-slate-600 w-full md:w-48 transition-all"
              />
            </div>
            {activeView === 'quadro' && ritmo.podeAdicionarPrioridade && (
              <button
                onClick={handleAddPrioridade}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 min-h-[44px] rounded-lg flex items-center gap-2 transition-colors shrink-0 touch-manipulation"
              >
                <Plus size={16} /> <span className="hidden sm:inline">Nova prioridade</span>
              </button>
            )}
            {activeView !== 'ia' &&
              activeView !== 'quadro' &&
              activeView !== 'table' &&
              activeView !== 'operacional' &&
              ((activeView === 'backlog' && perm.backlog.create) ||
                (activeView === 'dashboard' && perm.dashboard.create) ||
                (activeView !== 'backlog' &&
                  activeView !== 'dashboard' &&
                  perm.dashboard.create)) && (
                <button
                  onClick={handleAddNew}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 min-h-[44px] rounded-lg flex items-center gap-2 transition-colors shrink-0 touch-manipulation"
                >
                  <Plus size={16} /> <span className="hidden sm:inline">Novo</span>
                </button>
              )}
          </div>
        </header>

        <React.Suspense fallback={
          <div className="flex-1 flex items-center justify-center bg-slate-950">
            <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
          </div>
        }>
        <div className={activeView === 'chat' ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'flex-1 overflow-y-auto overflow-x-hidden min-h-0 p-3 sm:p-4 md:p-6'}>
          {activeView === 'quadro' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 sm:mb-6">
              {[
                {
                  label: 'Prioridades ativas',
                  val: ritmo.prioridadesAtivas.filter((p) => matchWorkspace(p.empresa)).length,
                  color: 'blue',
                  icon: Target,
                },
                {
                  label: 'Em execução',
                  val: ritmo.board.prioridades.filter(
                    (p) => p.status_prioridade === 'Execucao' && matchWorkspace(p.empresa)
                  ).length,
                  color: 'amber',
                  icon: Activity,
                },
                {
                  label: 'Bloqueadas',
                  val: ritmo.board.prioridades.filter(
                    (p) => p.status_prioridade === 'Bloqueado' && matchWorkspace(p.empresa)
                  ).length,
                  color: 'red',
                  icon: AlertCircle,
                },
                {
                  label: 'Concluídas',
                  val: ritmo.board.prioridades.filter(
                    (p) => p.status_prioridade === 'Concluido' && matchWorkspace(p.empresa)
                  ).length,
                  color: 'emerald',
                  icon: Target,
                },
              ].map((stat, i) => (
                <div
                  key={i}
                  className={`bg-slate-900/50 p-4 rounded-lg border border-slate-800 flex items-center gap-3 hover:border-slate-700 transition-colors ${
                    stat.label === 'Concluídas' ? 'cursor-pointer' : ''
                  }`}
                  onClick={stat.label === 'Concluídas' ? () => setQuadroVerConcluidas(true) : undefined}
                >
                  <div className="p-2 rounded-lg bg-slate-800 text-slate-400">
                    <stat.icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{stat.label}</p>
                    <p className="text-xl font-semibold text-slate-100 tabular-nums">{stat.val}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {(activeView === 'dashboard' || activeView === 'backlog') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 sm:mb-6">
              {[
                {
                  label: 'Ações Totais',
                  val:
                    activeView === 'backlog'
                      ? backlogViewItemsComPesquisa.length
                      : itemsFiltradosComPesquisa.length,
                  icon: activeView === 'dashboard' ? EstrategicoGridIcon : ListTodo,
                },
                {
                  label: 'Em Execução',
                  val: (activeView === 'backlog' ? backlogViewItemsComPesquisa : itemsFiltradosComPesquisa).filter(
                    (i) => i.status === ItemStatus.EXECUTING
                  ).length,
                  icon: Activity,
                },
                {
                  label: 'Bloqueios',
                  val: (activeView === 'backlog' ? backlogViewItemsComPesquisa : itemsFiltradosComPesquisa).filter(
                    (i) => i.status === ItemStatus.BLOCKED
                  ).length,
                  icon: AlertCircle,
                },
                {
                  label: 'Concluídas',
                  val: (activeView === 'backlog' ? backlogViewItemsComPesquisa : itemsFiltradosComPesquisa).filter(
                    (i) => i.status === ItemStatus.COMPLETED
                  ).length,
                  icon: Target,
                },
              ].map((stat, i) => (
                <div
                  key={i}
                  className={`bg-slate-900/50 p-4 rounded-lg border border-slate-800 flex items-center gap-3 hover:border-slate-700 transition-colors ${
                    stat.label === 'Concluídas' ? 'cursor-pointer' : ''
                  }`}
                  onClick={
                    stat.label === 'Concluídas'
                      ? () => {
                          if (activeView === 'dashboard') setDashboardOpenConcluidas(true);
                          if (activeView === 'table') setTableOpenConcluidas(true);
                          if (activeView === 'backlog') setBacklogOpenConcluidas(true);
                        }
                      : undefined
                  }
                >
                  <div className="p-2 rounded-lg bg-slate-800 text-slate-400">
                    <stat.icon size={18} strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{stat.label}</p>
                    <p className="text-xl font-semibold text-slate-100 tabular-nums">{stat.val}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeView === 'agenda' ? (
            <AgendaView
              items={agenda.items}
              loading={agenda.loading}
              onAdd={agenda.addItem}
              onCycleStatus={agenda.cycleStatus}
              onDelete={agenda.deleteItem}
              onEdit={agenda.updateItem}
              availableUsers={agenda.availableUsers}
              incomingEventInvites={agenda.incomingEventInvites}
              outgoingEventInvites={agenda.outgoingEventInvites}
              sharedAgendas={agenda.sharedAgendas}
              sharingLoading={agenda.sharingLoading}
              systemNotificationsSupported={typeof window !== 'undefined' && 'Notification' in window}
              systemNotificationPermission={systemNotificationPermission}
              systemNotificationsEnabled={systemNotificationsEnabled}
              onEnableSystemNotifications={requestSystemNotifications}
              onToggleSystemNotifications={toggleSystemNotifications}
              onRespondEventInvite={agenda.respondEventInvite}
            />
          ) : activeView === 'chat' ? (
              <TeamChatScreen
                currentUser={chatUser}
                availableUsers={agenda.availableUsers}
              />
          ) : activeView === 'ia' ? (
            <div className="pb-8 h-full min-h-0 flex flex-col">
              <ChatView canSend={perm.ia.send} />
            </div>
          ) : activeView === 'workspace' ? (
            <div className="pb-8 max-w-xl">
              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">Workspaces por empresa</h3>
                    <p className="text-[11px] text-slate-500">
                      Crie e gerencie empresas para separar backlog, prioridades e planos por contexto.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                    Empresas ativas
                  </label>
                  {empresasAtivas.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Nenhuma empresa ainda. Crie a primeira abaixo.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {empresasAtivas.map((nome) => (
                        <li
                          key={nome}
                          className="flex items-center justify-between gap-2 bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2"
                        >
                          <button
                            type="button"
                            onClick={() => setWorkspaceAtivo(nome)}
                            className={`text-xs font-medium px-2 py-1 rounded-full border ${
                              workspaceAtivo === nome
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-slate-500'
                            }`}
                          >
                            {nome}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEmpresasBloqueadas((prev) =>
                                prev.includes(nome) ? prev : [...prev, nome]
                              );
                              if (workspaceAtivo === nome) setWorkspaceAtivo('all');
                            }}
                            className="text-[11px] px-2 py-1 rounded-lg border border-red-500/60 text-red-400 hover:bg-red-500/10"
                          >
                            Bloquear
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {empresasInativas.length > 0 && (
                  <div className="space-y-2">
                    <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                      Empresas bloqueadas
                    </label>
                    <ul className="space-y-2">
                      {empresasInativas.map((nome) => (
                        <li
                          key={nome}
                          className="flex items-center justify-between gap-2 bg-slate-900/40 border border-slate-800 rounded-lg px-3 py-2"
                        >
                          <span className="text-xs text-slate-400 line-through">{nome}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setEmpresasBloqueadas((prev) => prev.filter((n) => n !== nome))
                            }
                            className="text-[11px] px-2 py-1 rounded-lg border border-emerald-500/60 text-emerald-400 hover:bg-emerald-500/10"
                          >
                            Reativar
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
                }

                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                    Nova empresa
                  </label>
                  <form
                    className="flex flex-col sm:flex-row gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.target as HTMLFormElement;
                      const input = form.elements.namedItem('novaEmpresa') as HTMLInputElement | null;
                      const nome = input?.value.trim() ?? '';
                      if (!nome) return;
                      setEmpresasLocais((prev) =>
                        prev.includes(nome) ? prev : [...prev, nome]
                      );
                      ritmo.addEmpresa(nome);
                      setWorkspaceAtivo(nome);
                      if (input) input.value = '';
                    }}
                  >
                    <input
                      name="novaEmpresa"
                      type="text"
                      placeholder="Ex.: Cliente XPTO · Unidade 01"
                      className="flex-1 bg-slate-950/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-blue-500"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium text-white shrink-0"
                    >
                      Criar workspace
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ) : loadingAny ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-slate-500 text-xs uppercase tracking-wider">Carregando...</p>
            </div>
          ) : (
            <div className="pb-8">
              {activeView === 'dashboard' && (
                <KanbanBoard
                  items={itemsFiltradosComPesquisa}
                  onStatusChange={updateStatus}
                  onOpenItem={(item) => openItemModal(item, undefined, 'estrategico')}
                  onQuickUpdateWho={(id, who) => updateItem(id, { who })}
                  onAddInColumn={(status) => openItemModal(null, status, 'estrategico')}
                  onDelete={deleteItem}
                  forceOpenConcluidos={dashboardOpenConcluidas}
                  onGoToTatico={perm.dashboard.linkTatico ? handleGoToTaticoPriority : undefined}
                  responsaveis={responsaveisParaAtribuicao}
                  displayWho={displayWhoKanban}
                  capabilities={{
                    canCreate: perm.dashboard.create,
                    canOpenDetail: hasModuleAction('dashboard', 'read'),
                    canDelete: perm.dashboard.delete,
                    canWorkflow: perm.dashboard.workflow,
                    canLinkTatico: perm.dashboard.linkTatico,
                    canEditIndicator: perm.dashboard.edit,
                  }}
                />
              )}
              {activeView === 'table' && (
                <EstrategicoView
                  prioridades={taticoPrioridades}
                  planos={ritmoPlanosEscopoVisivel}
                  tarefas={ritmoTarefasEscopoVisivel}
                  responsaveis={responsaveisParaAtribuicao}
                  whoUsers={responsaveisParaAtribuicao}
                  observerUsers={responsaveisParaAtribuicao}
                  perfisCadastro={perfisCadastroUsuarios}
                  computeStatusPlano={ritmo.computeStatusPlano}
                  onUpdatePrioridade={handleUpdatePrioridadeTatico}
                  onDeletePrioridade={handleDeletePrioridade}
                  loggedUserUid={profile?.uid}
                  loggedUserRole={profile?.role}
                  loggedUserName={profile?.nome}
                  loggedUserEmail={profile?.email}
                  loggedUserDisplayName={firebaseUser?.displayName ?? undefined}
                  focusPrioridadeId={focusPrioridadeId}
                  focusCardId={focusedPrioridadeId.current}
                  onFocusConsumed={handleTaticoFocusConsumed}
                  onlyPrioridadeId={tableOnlyPrioridadeId}
                  onAddPlano={(p) =>
                    ritmo.addPlano({
                      ...p,
                      created_by: firebaseUser?.uid ?? '',
                      workspace_id: p.empresa || '',
                      workspace_origem: workspaceAtivo === 'all' ? '' : workspaceAtivo,
                    })
                  }
                  onUpdatePlano={ritmo.updatePlano}
                  onDeletePlano={ritmo.deletePlano}
                  onAddTarefa={(t) =>
                    ritmo.addTarefa({
                      ...t,
                      created_by: firebaseUser?.uid ?? '',
                      workspace_id: t.empresa || '',
                      workspace_origem: workspaceAtivo === 'all' ? '' : workspaceAtivo,
                    })
                  }
                  onUpdateTarefa={ritmo.updateTarefa}
                  onDeleteTarefa={ritmo.deleteTarefa}
                  onAddObserver={(entity, entityId, userId) =>
                    ritmo.addObserver(entity, entityId, userId, 'follower')
                  }
                  onRemoveObserver={(entity, entityId, userId) =>
                    ritmo.removeObserver(entity, entityId, userId)
                  }
                  estrategicoCaps={{
                    prioridadeWrite: perm.table.prioridadeWrite,
                    planoWrite: perm.table.planoWrite,
                    planoDelete: perm.table.planoDelete,
                    verTodosPlanos: perm.table.verTodosPlanos,
                    tarefaWrite: perm.table.tarefaWrite,
                    tarefaAssign: perm.table.tarefaAssign || perm.table.tarefaWrite,
                    tarefaDelete: perm.table.tarefaDelete,
                    tarefaEditPrazo: canEditTaskDueDate,
                    observerEdit: perm.table.observerEdit,
                  }}
                />
              )}
              {activeView === 'operacional' && (
                <OperacionalView
                  prioridades={taticoPrioridades}
                  planos={ritmoPlanosEscopoVisivel}
                  tarefas={ritmoTarefasEscopoVisivel}
                  responsaveis={responsaveisParaAtribuicao}
                  whoUsers={responsaveisParaAtribuicao}
                  observerUsers={responsaveisParaAtribuicao}
                  computeStatusPlano={ritmo.computeStatusPlano}
                  loggedUserUid={profile?.uid}
                  loggedUserName={profile?.nome}
                  loggedUserEmail={profile?.email}
                  loggedUserDisplayName={firebaseUser?.displayName ?? undefined}
                  loggedUserRole={profile?.role}
                  onUpdatePlano={ritmo.updatePlano}
                  onDeletePlano={ritmo.deletePlano}
                  onAddTarefa={(t) =>
                    ritmo.addTarefa({
                      ...t,
                      created_by: firebaseUser?.uid ?? '',
                      workspace_id: t.empresa || '',
                      workspace_origem: workspaceAtivo === 'all' ? '' : workspaceAtivo,
                    })
                  }
                  onUpdateTarefa={ritmo.updateTarefa}
                  onDeleteTarefa={ritmo.deleteTarefa}
                  onAddObserver={(entity, entityId, userId) =>
                    ritmo.addObserver(entity, entityId, userId, 'follower')
                  }
                  onRemoveObserver={(entity, entityId, userId) =>
                    ritmo.removeObserver(entity, entityId, userId)
                  }
                  operacionalCaps={{
                    planoWrite: perm.operacional.planoWrite,
                    tarefaWrite: perm.operacional.tarefaWrite,
                    tarefaAssign: perm.operacional.tarefaAssign || perm.operacional.tarefaWrite,
                    tarefaDelete: perm.operacional.tarefaDelete,
                    tarefaEditPrazo: canEditTaskDueDate,
                    observerEdit: perm.operacional.observerEdit,
                  }}
                />
              )}
              {activeView === 'backlog' && (
                <BacklogView
                  items={backlogViewItemsComPesquisa}
                  onUpdate={updateItem}
                  onDelete={deleteItem}
                  onEditItem={(item) => openItemModal(item, undefined, 'backlog')}
                  onStatusChange={(id, status) => {
                    if (status === ItemStatus.ACTIVE && ritmo.board.backlog.some((b) => b.id === id)) {
                      const novaId = ritmo.promoverBacklogAPrioridade(id);
                      if (novaId) {
                        focusedPrioridadeId.current = novaId;
                        setActiveView('table');
                        return;
                      }
                    }
                    updateStatus(id, status);
                    if (status === ItemStatus.ACTIVE) {
                      setActiveView('dashboard');
                    }
                  }}
                  displayWho={displayWhoKanban}
                  responsaveis={responsaveisParaAtribuicao}
                  currentUserId={firebaseUser?.uid}
                  isAdmin={profile?.role === 'administrador'}
                  onAddNew={
                    perm.backlog.create
                      ? () => openItemModal(null, ItemStatus.BACKLOG, 'backlog')
                      : undefined
                  }
                  capabilities={{
                    canCreate: perm.backlog.create,
                    canEdit: perm.backlog.edit,
                    canDelete: perm.backlog.delete,
                    canWorkflow: perm.backlog.workflow,
                  }}
                />
              )}
              {activeView === 'performance' && (
                <PerformanceView items={itemsFiltradosComPesquisa} displayWho={displayWhoKanban} />
              )}
              {activeView === 'roadmap' && (
                <RoadmapView
                  items={itemsFiltradosComPesquisa}
                  onOpenItem={openItemModal}
                  canOpenItem={perm.roadmap.edit}
                  displayWho={displayWhoKanban}
                />
              )}
              {activeView === 'quadro' && (
                <QuadroEstrategico
                  prioridades={quadroPrioridades}
                  planos={ritmoPlanosEscopoVisivel}
                  tarefas={ritmoTarefasEscopoVisivel}
                  responsaveis={responsaveisEscopoAtribuicao}
                  computeStatusPlano={ritmo.computeStatusPlano}
                  onStatusChange={(id, status) => ritmo.updatePrioridade(id, { status_prioridade: status })}
                  onOpenPrioridade={handleOpenPrioridade}
                  podeAdicionarPrioridade={ritmo.podeAdicionarPrioridade}
                  onAddPrioridade={handleAddPrioridade}
                  onDeletePrioridade={handleDeletePrioridade}
                  forceOpenConcluidas={quadroVerConcluidas}
                />
              )}
            </div>
          )}
        </div>
        </React.Suspense>

        {selectedPrioridade && (
          <DetalhePrioridadeModal
            prioridade={selectedPrioridade}
            planos={ritmo.board.planos}
            tarefas={ritmo.board.tarefas}
            responsaveis={responsaveisEscopoAtribuicao}
            computeStatusPlano={ritmo.computeStatusPlano}
            onClose={() => setSelectedPrioridade(null)}
            onUpdatePrioridade={async (id, updates) => {
              handleUpdatePrioridadeTatico(id, updates);
              const base = selectedPrioridade?.id === id ? selectedPrioridade : null;
              if (!base) return;
              const titulo = updates.titulo ?? base.titulo;
              const descricao = updates.descricao ?? base.descricao ?? '';
              const donoImutavelPorBacklog = Boolean(base.origem_backlog_id);
              const dono =
                !donoImutavelPorBacklog && updates.dono_id !== undefined
                  ? canonicalDonoIdForPersist(String(updates.dono_id))
                  : base.dono_id;
              const dataAlvoMs = updates.data_alvo ?? base.data_alvo;
              const whenIso = new Date(dataAlvoMs).toISOString().slice(0, 10);
              const candidato = items.find(
                (i) => i.what === titulo && i.who === dono
              );
              if (candidato) {
                await updateItem(candidato.id, {
                  what: titulo,
                  why: descricao,
                  who: dono,
                  when: whenIso,
                });
              }
            }}
          />
        )}

        {prioridadeToDelete && (
          <Modal
            isOpen={true}
            onClose={() => setPrioridadeToDelete(null)}
            title="Remover prioridade"
            maxWidth="sm"
          >
            <div className="space-y-4 text-sm text-slate-200">
              <p>
                Você realmente deseja remover a prioridade{' '}
                <span className="font-semibold">
                  &quot;{prioridadeToDelete.titulo || 'Sem título'}&quot;
                </span>
                ?
              </p>
              <p className="text-xs text-slate-500">
                Esta ação não pode ser desfeita e também remove a iniciativa vinculada na Matriz
                5W2H / quadro de Prioridades, quando existir.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPrioridadeToDelete(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 border border-slate-600 rounded-lg hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (prioridadeToDelete) {
                      performDeletePrioridade(prioridadeToDelete);
                      setPrioridadeToDelete(null);
                    }
                  }}
                  className="px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
                >
                  Remover
                </button>
              </div>
            </div>
          </Modal>
        )}

        <PrioridadeModal
          isOpen={prioridadeModalOpen}
          onClose={() => setPrioridadeModalOpen(false)}
          responsaveis={responsaveisEscopoAtribuicao}
          defaultEmpresa={workspaceAtivo === 'all' ? '' : workspaceAtivo}
          empresaSuggestions={empresasAtivas}
          onSave={(item) => {
            if (item.empresa && !empresasDisponiveis.includes(item.empresa)) {
              ritmo.addEmpresa(item.empresa);
            }
            const donoCanon = canonicalDonoIdForPersist(item.dono_id);
            const assigneeNova = perfisCadastroUsuarios.find(
              (u) => u.ativo !== false && normKey(u.uid) === normKey(donoCanon),
            );
            const wsClass =
              workspaceAtivo === 'all' ? '' : String(workspaceAtivo).trim();
            const itemNorm = {
              ...item,
              dono_id: donoCanon,
              empresa: empresaParaDemandaDoDono(assigneeNova, wsClass),
              created_by: firebaseUser?.uid ?? '',
              workspace_id: wsClass || item.empresa || '',
              workspace_origem: wsClass,
            };
            const ok = ritmo.addPrioridade(itemNorm);
            if (!ok) {
              setToast({
                message: 'Máximo de 3 prioridades ativas. Conclua uma para liberar vaga.',
                type: 'error',
              });
              return false;
            }
            // Espelha a prioridade criada no quadro de Prioridades (Kanban),
            // para que apareça também como cartão no dashboard.
            const whenIso = new Date(itemNorm.data_alvo).toISOString().slice(0, 10);
            addItem({
              what: itemNorm.titulo,
              why: itemNorm.descricao,
              where: '',
              when: whenIso,
              who: itemNorm.dono_id,
              how: '',
              status: ItemStatus.ACTIVE,
              urgency: UrgencyLevel.MEDIUM,
              notes: '',
              empresa: itemNorm.empresa,
              created_by: itemNorm.created_by,
            });
            return true;
          }}
        />

        <ActionItemModal
          isOpen={modalOpen}
          onClose={closeItemModal}
          item={selectedItem}
          initialStatus={selectedItem === null ? defaultStatusForNew ?? undefined : undefined}
          onSave={(item) => {
            const adminCriandoBacklogEmTodasEmpresas =
              modalContext === 'backlog' &&
              selectedItem === null &&
              profile?.role === 'administrador' &&
              workspaceAtivo === 'all';
            const podeEditarEmpresaBacklog =
              (appSettings.backlogPermiteAlterarEmpresa && perm.backlog.workspaceEdit) ||
              adminCriandoBacklogEmTodasEmpresas;
            const workspaceCriacao =
              workspaceAtivo !== 'all'
                ? String(workspaceAtivo).trim()
                : adminCriandoBacklogEmTodasEmpresas
                ? ''
                : (empresasAtivas[0] ?? '').trim();
            const empresaDigitada = item.empresa?.trim() ?? '';
            if (adminCriandoBacklogEmTodasEmpresas && !empresaDigitada) {
              setToast({
                type: 'error',
                message: 'Selecione a empresa/workspace para criar o item no Backlog quando estiver em "Todas as empresas".',
              });
              return false;
            }
            const empresa =
              modalContext === 'backlog'
                ? podeEditarEmpresaBacklog
                  ? (empresaDigitada || workspaceCriacao)
                  : (workspaceCriacao || empresaDigitada)
                : (empresaDigitada || workspaceCriacao);
            addItem({
              ...item,
              empresa,
              created_by: firebaseUser?.uid ?? '',
            });
            return true;
          }}
          onUpdate={updateItem}
          defaultEmpresa={
            modalContext === 'backlog' &&
            selectedItem === null &&
            profile?.role === 'administrador' &&
            workspaceAtivo === 'all'
              ? ''
              : workspaceAtivo === 'all'
              ? (empresasAtivas[0] ?? '')
              : workspaceAtivo
          }
          empresaSuggestions={modalContext === 'backlog' ? empresasDisponiveis : empresasAtivas}
          loggedUserName={profile?.nome}
          lockWhoToLoggedUser={true}
          canEditWho={
            modalContext !== 'backlog' &&
            (activeView === 'roadmap' ? perm.roadmap.edit : perm.dashboard.edit)
          }
          responsaveis={responsaveisParaAtribuicao}
          hideWhereEmpresa={modalContext === 'backlog'}
          hideStatusUrgency={modalContext === 'backlog'}
          canEditEmpresa={
            modalContext === 'backlog'
              ? perm.backlog.workspaceEdit
              : perm.dashboard.workspaceEdit
          }
          canEditBacklogEmpresa={
            (appSettings.backlogPermiteAlterarEmpresa && perm.backlog.workspaceEdit) ||
            (
              modalContext === 'backlog' &&
              selectedItem === null &&
              profile?.role === 'administrador' &&
              workspaceAtivo === 'all'
            )
          }
          canEditBacklogDate={appSettings.backlogPermiteAlterarData}
          itemModalContext={modalContext}
          currentUserId={firebaseUser?.uid ?? undefined}
          resolveUserDisplay={displayWhoKanban}
          readOnly={
            selectedItem !== null &&
            (modalContext === 'backlog'
              ? !perm.backlog.edit
              : activeView === 'roadmap'
              ? !perm.roadmap.edit
              : !perm.dashboard.edit)
          }
        />

        <footer className="h-8 min-h-[32px] bg-slate-900/95 border-t border-slate-800 px-3 sm:px-4 flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-wider z-30 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Conectado
          </div>
          <span>MAVO 2.1.0</span>
        </footer>
      </main>
    </div>
  );
}

const App: React.FC = () => <AppContent />;

export default App;
