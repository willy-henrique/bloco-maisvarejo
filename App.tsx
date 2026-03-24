import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useUser } from './contexts/UserContext';
import { UserLogin } from './components/Auth/UserLogin';
import { Sidebar } from './components/Layout/Sidebar';
import { KanbanBoard } from './components/Dashboard/KanbanBoard';
import { BacklogView } from './components/Dashboard/BacklogView';
import { EstrategicoView } from './components/Dashboard/EstrategicoView';
import { QuadroEstrategico, DetalhePrioridadeModal } from './components/Dashboard/QuadroEstrategico';
import { PrioridadeModal } from './components/Dashboard/PrioridadeModal';
import { ActionItemModal } from './components/Dashboard/ActionItemModal';
import { PerformanceView } from './components/Dashboard/PerformanceView';
import { RoadmapView } from './components/Dashboard/RoadmapView';
import { OperacionalView } from './components/Dashboard/OperacionalView';
import type { ViewId } from './components/Layout/Sidebar';
import { useStrategicBoard } from './controllers/useStrategicBoard';
import { useRitmoGestao } from './controllers/useRitmoGestao';
import { StorageService } from './services/storageService';
import { isFirebaseConfigured, subscribeBoard, saveBoardNotes } from './services/firestoreSync';
import { listAllUsers } from './services/firebaseAuth';
import type { UserProfile } from './types/user';
import { mergeResponsaveisComPerfis } from './utils/mergeResponsaveisComPerfis';
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
} from 'lucide-react';
import { ActionItem, ItemStatus, UrgencyLevel } from './types';
import type { Prioridade } from './types';
import {
  responsavelIdsForLoggedUser,
  donoPrioridadeCorrespondeAoUsuario,
  nomeExibicaoWhoParaItem,
} from './components/Dashboard/responsavelSearchUtils';
import { tarefaAtribuidaAoUsuario } from './components/Dashboard/taskAssignmentUtils';
import { Toast, type ToastType } from './components/Shared/Toast';
import { ChatView } from './components/Chat/ChatView';
import { Modal } from './components/Shared/Modal';
import { EstrategicoGridIcon } from './components/icons/EstrategicoGridIcon';

function normKey(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
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
  const { isAuthenticated, encryptionKey, logout, profile, hasModuleAction, firebaseUser } = useUser();
  const [activeView, setActiveView] = useState<ViewId>('backlog');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [strategicNote, setStrategicNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ActionItem | null>(null);
  const [defaultStatusForNew, setDefaultStatusForNew] = useState<ItemStatus | null>(null);
  const [modalContext, setModalContext] = useState<'default' | 'backlog' | 'estrategico'>('default');
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [selectedPrioridade, setSelectedPrioridade] = useState<Prioridade | null>(null);
  const [prioridadeModalOpen, setPrioridadeModalOpen] = useState(false);
  const [prioridadeToDelete, setPrioridadeToDelete] = useState<Prioridade | null>(null);
  const [dashboardOpenConcluidas, setDashboardOpenConcluidas] = useState(false);
  const [tableOpenConcluidas, setTableOpenConcluidas] = useState(false);
  const [backlogOpenConcluidas, setBacklogOpenConcluidas] = useState(false);
  const [quadroVerConcluidas, setQuadroVerConcluidas] = useState(false);
  const [focusPrioridadeId, setFocusPrioridadeId] = useState<string | null>(null);
  const [tableOnlyPrioridadeId, setTableOnlyPrioridadeId] = useState<string | null>(null);
  const { items, loading, addItem, updateItem, deleteItem, updateStatus } = useStrategicBoard(encryptionKey ?? null);
  const ritmo = useRitmoGestao(encryptionKey ?? null);
  const [perfisCadastroUsuarios, setPerfisCadastroUsuarios] = useState<UserProfile[]>([]);
  const [workspaceAtivo, setWorkspaceAtivo] = useState<'all' | string>('all');
  const [empresasLocais, setEmpresasLocais] = useState<string[]>([]);
  const [empresasBloqueadas, setEmpresasBloqueadas] = useState<string[]>([]);

  const canSeeEmpresa = useCallback(
    (empresa?: string) => {
      if (!profile) return true;
      if (profile.role === 'administrador') return true;
      const empresasUser = Array.isArray(profile.empresas) ? profile.empresas : [];
      const hasAllFlag = empresasUser.some(
        (e) => e === '*' || e.toLowerCase() === 'todas'
      );
      if (hasAllFlag) return true;
      const nome = (empresa ?? '').trim();
      if (!nome) return false;
      return empresasUser.includes(nome);
    },
    [profile]
  );

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

      if (!profile || profile.role === 'administrador') {
        if (workspaceAtivo === 'all') return true;
        if (semEmpresa) return true;
        return sameCompany(em, ws);
      }

      if (!canSeeEmpresa(workspaceAtivo)) return false;
      if (workspaceAtivo === 'all') return semEmpresa;
      if (semEmpresa) return true;
      return sameCompany(em, ws);
    },
    [workspaceAtivo, canSeeEmpresa, profile]
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
          setPerfisCadastroUsuarios(all.filter((u) => u.ativo !== false));
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
    if (profile && profile.role !== 'administrador') {
      const empresasUser = Array.isArray(profile.empresas) ? profile.empresas : [];
      const hasAllFlag = empresasUser.some(
        (e) => e === '*' || e.toLowerCase() === 'todas'
      );
      if (!hasAllFlag) {
        const permitidas = new Set(empresasUser.map((e) => e.trim()).filter(Boolean));
        filtered = filtered.filter((nome) => permitidas.has(nome));
      }
    }
    return filtered;
  }, [empresasDisponiveis, empresasBloqueadas, profile]);

  // Garante que usuário restrito não fique em \"Todas as empresas\"
  useEffect(() => {
    if (!profile || profile.role === 'administrador') return;
    const empresasUser = Array.isArray(profile.empresas) ? profile.empresas : [];
    const hasAllFlag = empresasUser.some(
      (e) => e === '*' || e.toLowerCase() === 'todas'
    );
    if (hasAllFlag) return;
    if (workspaceAtivo === 'all' && empresasAtivas.length > 0) {
      setWorkspaceAtivo(empresasAtivas[0]);
    }
  }, [profile, workspaceAtivo, empresasAtivas]);

  const empresasInativas = useMemo(
    () => empresasDisponiveis.filter((nome) => empresasBloqueadas.includes(nome)),
    [empresasDisponiveis, empresasBloqueadas]
  );

  const itemsFiltrados = useMemo(
    () => items.filter((i) => matchWorkspace(i.empresa)),
    [items, matchWorkspace]
  );
  // Backlog é visão global por regra de negócio (todos os usuários veem os itens).
  const backlogViewItems = useMemo(() => items, [items]);


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
        dono_id: item.who,
        data_inicio: Date.now(),
        data_alvo: item.when ? new Date(item.when + 'T12:00:00').getTime() : Date.now(),
        status_prioridade:
          item.status === ItemStatus.BLOCKED
            ? 'Bloqueado'
            : item.status === ItemStatus.COMPLETED
            ? 'Concluido'
            : 'Execucao',
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

  /** Prioridade entra na lista mesmo com empresa “errada” se o usuário é dono ou tem tarefa no plano. */
  const prioridadeVisivelPorDemandaAtribuida = useCallback(
    (p: Prioridade) => {
      if (myResponsavelIdsForBoard.size === 0) return false;
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
        for (const t of ritmo.board.tarefas) {
          if (t.plano_id !== pl.id) continue;
          if (tarefaAtribuidaAoUsuario(t, myResponsavelIdsForBoard, responsaveisParaAtribuicao)) {
            return true;
          }
        }
      }
      return false;
    },
    [
      myResponsavelIdsForBoard,
      responsaveisParaAtribuicao,
      ritmo.board.planos,
      ritmo.board.tarefas,
    ],
  );

  const quadroPrioridades = useMemo<Prioridade[]>(() => {
    const todas = [...ritmo.board.prioridades, ...sinteticasFromItems];
    return todas.filter(
      (p) => matchWorkspace(p.empresa) || prioridadeVisivelPorDemandaAtribuida(p),
    );
  }, [
    ritmo.board.prioridades,
    sinteticasFromItems,
    matchWorkspace,
    prioridadeVisivelPorDemandaAtribuida,
  ]);

  const taticoPrioridades = quadroPrioridades;

  const idsPrioridadesEscopoRitmo = useMemo(
    () => new Set(quadroPrioridades.map((p) => p.id)),
    [quadroPrioridades],
  );

  /** Planos/tarefas das prioridades visíveis entram mesmo com empresa desalinhada (evita card vazio). */
  const ritmoPlanosEscopoVisivel = useMemo(
    () =>
      ritmo.board.planos.filter(
        (pl) => matchWorkspace(pl.empresa) || idsPrioridadesEscopoRitmo.has(pl.prioridade_id),
      ),
    [ritmo.board.planos, matchWorkspace, idsPrioridadesEscopoRitmo],
  );

  const idsPlanosEscopoVisivel = useMemo(
    () => new Set(ritmoPlanosEscopoVisivel.map((pl) => pl.id)),
    [ritmoPlanosEscopoVisivel],
  );

  const ritmoTarefasEscopoVisivel = useMemo(
    () =>
      ritmo.board.tarefas.filter(
        (t) => matchWorkspace(t.empresa) || idsPlanosEscopoVisivel.has(t.plano_id),
      ),
    [ritmo.board.tarefas, matchWorkspace, idsPlanosEscopoVisivel],
  );

  const perm = useMemo(
    () => ({
      backlog: {
        create: hasModuleAction('backlog', 'create'),
        edit: hasModuleAction('backlog', 'edit'),
        delete: hasModuleAction('backlog', 'delete'),
        workflow: hasModuleAction('backlog', 'workflow'),
      },
      dashboard: {
        create: hasModuleAction('dashboard', 'create'),
        edit: hasModuleAction('dashboard', 'edit'),
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
      },
      operacional: {
        // Regra de produto: Operacional edita apenas tarefas.
        planoWrite: false,
        tarefaWrite: hasModuleAction('operacional', 'tarefa_write'),
        tarefaAssign: hasModuleAction('operacional', 'tarefa_assign'),
        tarefaDelete: hasModuleAction('operacional', 'tarefa_delete'),
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
      if (updates.dono_id !== undefined) {
        const current = ritmo.board.prioridades.find((p) => p.id === id);
        const donoCanon = canonicalDonoIdForPersist(String(updates.dono_id));
        const antesCanon = current
          ? canonicalDonoIdForPersist(String(current.dono_id))
          : '';
        merged = { ...merged, dono_id: donoCanon };
        if (!antesCanon || normKey(donoCanon) !== normKey(antesCanon)) {
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

  if (!isAuthenticated) return <UserLogin />;

  return (
    <div className="flex h-screen min-h-dvh bg-slate-950 overflow-hidden text-slate-100">
      <Toast
        message={toast?.message ?? ''}
        type={toast?.type ?? 'success'}
        visible={toast !== null}
        onClose={() => setToast(null)}
      />
      <Sidebar
        activeView={activeView}
        setView={handleSetView}
        onLogout={logout}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        workspaceAtivo={workspaceAtivo}
        empresas={empresasAtivas}
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
              {activeView === 'backlog' && <ListTodo size={18} className="text-emerald-500 shrink-0" />}
              {activeView === 'performance' && <PieChart size={18} className="text-violet-500 shrink-0" />}
              {activeView === 'roadmap' && <Briefcase size={18} className="text-cyan-500 shrink-0" />}
              {activeView === 'ia' && <Bot size={18} className="text-blue-400 shrink-0" />}
              {activeView === 'workspace' && <ShieldCheck size={18} className="text-blue-400 shrink-0" />}
              {activeView === 'operacional' && <FileText size={18} className="text-emerald-400 shrink-0" />}
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
            <div className="relative hidden xl:block">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                placeholder="Pesquisar..."
                className="bg-slate-950/80 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-300 outline-none focus:border-slate-600 w-48 transition-all"
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

        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 p-3 sm:p-4 md:p-6">
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
                  val: activeView === 'backlog' ? backlogViewItems.length : itemsFiltrados.length,
                  icon: activeView === 'dashboard' ? EstrategicoGridIcon : ListTodo,
                },
                {
                  label: 'Em Execução',
                  val: (activeView === 'backlog' ? backlogViewItems : itemsFiltrados).filter(
                    (i) => i.status === ItemStatus.EXECUTING
                  ).length,
                  icon: Activity,
                },
                {
                  label: 'Bloqueios',
                  val: (activeView === 'backlog' ? backlogViewItems : itemsFiltrados).filter(
                    (i) => i.status === ItemStatus.BLOCKED
                  ).length,
                  icon: AlertCircle,
                },
                {
                  label: 'Concluídas',
                  val: (activeView === 'backlog' ? backlogViewItems : itemsFiltrados).filter(
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

          {activeView === 'ia' ? (
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
                  items={itemsFiltrados}
                  onStatusChange={updateStatus}
                  onOpenItem={(item) => openItemModal(item, undefined, 'estrategico')}
                  onAddInColumn={(status) => openItemModal(null, status, 'estrategico')}
                  onDelete={deleteItem}
                  forceOpenConcluidos={dashboardOpenConcluidas}
                  onGoToTatico={perm.dashboard.linkTatico ? handleGoToTaticoPriority : undefined}
                  displayWho={displayWhoKanban}
                  capabilities={{
                    canCreate: perm.dashboard.create,
                    canOpenDetail: hasModuleAction('dashboard', 'read'),
                    canDelete: perm.dashboard.delete,
                    canWorkflow: perm.dashboard.workflow,
                    canLinkTatico: perm.dashboard.linkTatico,
                  }}
                />
              )}
              {activeView === 'table' && (
                <EstrategicoView
                  prioridades={taticoPrioridades}
                  planos={ritmoPlanosEscopoVisivel}
                  tarefas={ritmoTarefasEscopoVisivel}
                  responsaveis={responsaveisParaAtribuicao}
                  computeStatusPlano={ritmo.computeStatusPlano}
                  onUpdatePrioridade={handleUpdatePrioridadeTatico}
                  onDeletePrioridade={handleDeletePrioridade}
                  loggedUserUid={profile?.uid}
                  loggedUserRole={profile?.role}
                  loggedUserName={profile?.nome}
                  loggedUserEmail={profile?.email}
                  loggedUserDisplayName={firebaseUser?.displayName ?? undefined}
                  focusPrioridadeId={focusPrioridadeId}
                  onlyPrioridadeId={tableOnlyPrioridadeId}
                  onAddPlano={ritmo.addPlano}
                  onUpdatePlano={ritmo.updatePlano}
                  onDeletePlano={ritmo.deletePlano}
                  onAddTarefa={ritmo.addTarefa}
                  onUpdateTarefa={ritmo.updateTarefa}
                  onDeleteTarefa={ritmo.deleteTarefa}
                  estrategicoCaps={{
                    prioridadeWrite: perm.table.prioridadeWrite,
                    planoWrite: perm.table.planoWrite,
                    planoDelete: perm.table.planoDelete,
                    verTodosPlanos: perm.table.verTodosPlanos,
                    tarefaWrite: perm.table.tarefaWrite,
                    tarefaAssign: perm.table.tarefaAssign,
                    tarefaDelete: perm.table.tarefaDelete,
                  }}
                />
              )}
              {activeView === 'operacional' && (
                <OperacionalView
                  prioridades={taticoPrioridades}
                  planos={ritmoPlanosEscopoVisivel}
                  tarefas={ritmoTarefasEscopoVisivel}
                  responsaveis={responsaveisParaAtribuicao}
                  computeStatusPlano={ritmo.computeStatusPlano}
                  loggedUserUid={profile?.uid}
                  loggedUserName={profile?.nome}
                  loggedUserEmail={profile?.email}
                  loggedUserDisplayName={firebaseUser?.displayName ?? undefined}
                  loggedUserRole={profile?.role}
                  onUpdatePlano={ritmo.updatePlano}
                  onDeletePlano={ritmo.deletePlano}
                  onAddTarefa={ritmo.addTarefa}
                  onUpdateTarefa={ritmo.updateTarefa}
                  onDeleteTarefa={ritmo.deleteTarefa}
                  operacionalCaps={{
                    planoWrite: perm.operacional.planoWrite,
                    tarefaWrite: perm.operacional.tarefaWrite,
                    tarefaAssign: perm.operacional.tarefaAssign,
                    tarefaDelete: perm.operacional.tarefaDelete,
                  }}
                />
              )}
              {activeView === 'backlog' && (
                <BacklogView
                  items={backlogViewItems}
                  onUpdate={updateItem}
                  onDelete={deleteItem}
                  onEditItem={(item) => openItemModal(item, undefined, 'backlog')}
                  onStatusChange={updateStatus}
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
              {activeView === 'performance' && <PerformanceView items={itemsFiltrados} />}
              {activeView === 'roadmap' && (
                <RoadmapView
                  items={itemsFiltrados}
                  onOpenItem={openItemModal}
                  canOpenItem={perm.roadmap.edit}
                />
              )}
              {activeView === 'quadro' && (
                <QuadroEstrategico
                  prioridades={quadroPrioridades}
                  planos={ritmoPlanosEscopoVisivel}
                  tarefas={ritmoTarefasEscopoVisivel}
                  responsaveis={responsaveisParaAtribuicao}
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

        {selectedPrioridade && (
          <DetalhePrioridadeModal
            prioridade={selectedPrioridade}
            planos={ritmo.board.planos}
            tarefas={ritmo.board.tarefas}
            responsaveis={responsaveisParaAtribuicao}
            computeStatusPlano={ritmo.computeStatusPlano}
            onClose={() => setSelectedPrioridade(null)}
            onUpdatePrioridade={async (id, updates) => {
              handleUpdatePrioridadeTatico(id, updates);
              const base = selectedPrioridade?.id === id ? selectedPrioridade : null;
              if (!base) return;
              const titulo = updates.titulo ?? base.titulo;
              const descricao = updates.descricao ?? base.descricao ?? '';
              const dono =
                updates.dono_id !== undefined
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
          responsaveis={responsaveisParaAtribuicao}
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
            });
            return true;
          }}
        />

        <ActionItemModal
          isOpen={modalOpen}
          onClose={closeItemModal}
          item={selectedItem}
          initialStatus={selectedItem === null ? defaultStatusForNew ?? undefined : undefined}
          onSave={addItem}
          onUpdate={updateItem}
          defaultEmpresa={workspaceAtivo === 'all' ? '' : workspaceAtivo}
          empresaSuggestions={empresasAtivas}
          loggedUserName={profile?.nome}
          lockWhoToLoggedUser={true}
          canEditWho={profile?.role === 'administrador'}
          hideWhereEmpresa={modalContext === 'backlog'}
          hideStatusUrgency={modalContext === 'backlog'}
          itemModalContext={modalContext}
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
          <span>MAVO 1.1</span>
        </footer>
      </main>
    </div>
  );
}

const App: React.FC = () => <AppContent />;

export default App;
