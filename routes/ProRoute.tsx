/**
 * /pro — Protótipo completo: todas as telas do sistema com suporte a itens avulsos.
 *
 * Conceito avulso: tarefas sem plano e planos sem prioridade (sentinel '__avulso__').
 * Nenhum componente de UI foi duplicado — todos são os mesmos do sistema principal.
 *
 * Telas com avulso ativo: Gerencial e Operacional.
 * Telas em observação (dados reais): Estratégico, Backlog, Desempenho, Roadmap, IA.
 */
import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  Menu, FileText, Plus, X, Target, ListTodo,
  PieChart, Briefcase, Bot, Search, Activity, AlertCircle, CalendarDays, MessageSquare,
} from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useRitmoGestao } from '../controllers/useRitmoGestao';
import { useStrategicBoard } from '../controllers/useStrategicBoard';
import { listAllUsers } from '../services/firebaseAuth';
import type { UserProfile } from '../types/user';
import { Sidebar } from '../components/Layout/Sidebar';
import { OperacionalView } from '../components/Dashboard/OperacionalView';
import { EstrategicoView } from '../components/Dashboard/EstrategicoView';
import { BacklogView } from '../components/Dashboard/BacklogView';
import { PerformanceView } from '../components/Dashboard/PerformanceView';
import { RoadmapView } from '../components/Dashboard/RoadmapView';
import { KanbanBoard } from '../components/Dashboard/KanbanBoard';
import { ActionItemModal } from '../components/Dashboard/ActionItemModal';
import { ChatView } from '../components/Chat/ChatView';
import { AgendaView } from '../components/Dashboard/AgendaView';
import { useAgenda } from '../controllers/useAgenda';
import { EstrategicoGridIcon } from '../components/icons/EstrategicoGridIcon';
import { mergeResponsaveisComPerfis } from '../utils/mergeResponsaveisComPerfis';
import { nomeExibicaoWhoParaItem } from '../components/Dashboard/responsavelSearchUtils';
import type { ViewId } from '../components/Layout/Sidebar';
import type { PlanoDeAcao, Prioridade, Tarefa } from '../types';
import type { ActionItem } from '../types';
import { ItemStatus } from '../types';

// ── Sentinel ──────────────────────────────────────────────────────────────────
const AVULSO = '__avulso__';

function buildSyntheticPrioridade(uid: string): Prioridade {
  return {
    id: AVULSO,
    titulo: 'Itens Avulsos',
    descricao: 'Planos e tarefas sem prioridade ativa vinculada.',
    dono_id: uid,
    data_inicio: Date.now(),
    data_alvo: Date.now() + 365 * 86400_000,
    status_prioridade: 'Execucao',
    empresa: '',
    created_by: uid,
  };
}

function buildSyntheticPlanoAvulso(uid: string): PlanoDeAcao {
  return {
    id: AVULSO,
    prioridade_id: AVULSO,
    titulo: 'Tarefas Avulsas',
    what: 'Tarefas sem plano de ação vinculado.',
    why: 'Registro rápido sem necessidade de hierarquia.',
    who_id: uid,
    when_inicio: Date.now(),
    when_fim: Date.now() + 30 * 86400_000,
    how: '',
    status_plano: 'Execucao',
    empresa: '',
    created_by: uid,
  };
}

// ── Modal: Novo plano avulso ──────────────────────────────────────────────────

function NovoPlanoModal({
  uid,
  onClose,
  onSave,
}: {
  uid: string;
  onClose: () => void;
  onSave: (p: Omit<PlanoDeAcao, 'id'>) => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [prazo, setPrazo] = useState(
    () => new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10),
  );

  function submit() {
    const t = titulo.trim();
    if (!t) return;
    onSave({
      prioridade_id: AVULSO,
      titulo: t,
      what: t,
      why: '',
      who_id: uid,
      when_inicio: Date.now(),
      when_fim: new Date(prazo + 'T12:00:00').getTime(),
      how: '',
      status_plano: 'Execucao',
      empresa: '',
      created_by: uid,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md space-y-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Novo plano avulso</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Criado em{' '}
              <span className="text-blue-400">Itens Avulsos</span> — vincule a uma prioridade quando quiser.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-500 hover:text-slate-300 rounded">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Título</label>
            <input
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') onClose();
              }}
              placeholder="Descreva o plano..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Prazo</label>
            <input
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs rounded-lg text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!titulo.trim()}
            className="px-4 py-2 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
          >
            Criar plano
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ProContent ────────────────────────────────────────────────────────────────

function ProContent() {
  const { profile, encryptionKey, logout, firebaseUser } = useUser();
  const agenda = useAgenda(firebaseUser?.uid ?? null);
  const ritmo = useRitmoGestao(encryptionKey ?? null);
  const { items, loading: loadingItems, addItem, updateItem, deleteItem, updateStatus } =
    useStrategicBoard(encryptionKey ?? null);

  const [activeView, setActiveView] = useState<ViewId>('backlog');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNovoPlano, setShowNovoPlano] = useState(false);
  const [perfisCadastro, setPerfisCadastro] = useState<UserProfile[]>([]);

  useEffect(() => {
    let cancelled = false;
    listAllUsers().then((all) => {
      if (!cancelled) setPerfisCadastro(all);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ActionItem | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<ItemStatus>(ItemStatus.BACKLOG);
  const [searchQuery, setSearchQuery] = useState('');
  const focusedPrioridadeId = useRef<string | null>(null);

  const uid = profile?.uid ?? firebaseUser?.uid ?? '';

  // ── Sintéticos (em memória, não persistidos) ─────────────────────────────
  const syntheticPrioridade = useMemo(() => buildSyntheticPrioridade(uid), [uid]);
  const syntheticPlanoAvulso = useMemo(() => buildSyntheticPlanoAvulso(uid), [uid]);

  // ── Responsáveis com usuário garantido no conjunto ────────────────────────
  const responsaveis = useMemo(() => {
    const base = mergeResponsaveisComPerfis(ritmo.board.responsaveis, perfisCadastro);
    if (!uid) return base;
    const existe = base.some((r) => r.id === uid || r.nome === (profile?.nome ?? ''));
    if (existe) return base;
    return [...base, { id: uid, nome: profile?.nome ?? uid }];
  }, [ritmo.board.responsaveis, perfisCadastro, uid, profile?.nome]);

  const displayWho = useCallback(
    (who: string) => nomeExibicaoWhoParaItem(who, responsaveis, perfisCadastro),
    [responsaveis, perfisCadastro],
  );

  // ── Dados Gerencial: real + avulso ───────────────────────────────────────
  const tablePrioridades = useMemo(
    () => [...ritmo.board.prioridades, syntheticPrioridade],
    [ritmo.board.prioridades, syntheticPrioridade],
  );

  const tablePlanos = useMemo(() => {
    const avulsos = ritmo.board.planos.filter((p) => p.prioridade_id === AVULSO);
    const reais = ritmo.board.planos.filter((p) => p.prioridade_id !== AVULSO);
    return [...reais, ...avulsos, syntheticPlanoAvulso];
  }, [ritmo.board.planos, syntheticPlanoAvulso]);

  // ── Dados Operacional: sintético na frente + todos os planos reais ────────
  const operacionalPlanos = useMemo(
    () => [syntheticPlanoAvulso, ...ritmo.board.planos],
    [ritmo.board.planos, syntheticPlanoAvulso],
  );

  const operacionalPrioridades = useMemo(
    () => [syntheticPrioridade, ...ritmo.board.prioridades],
    [ritmo.board.prioridades, syntheticPrioridade],
  );

  // ── Busca — views legadas ─────────────────────────────────────────────────
  const itemsFiltrados = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (i) =>
        i.what?.toLowerCase().includes(q) ||
        i.who?.toLowerCase().includes(q) ||
        i.notes?.toLowerCase().includes(q),
    );
  }, [items, searchQuery]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAddTarefa = useCallback(
    (t: Omit<Tarefa, 'id'>) => ritmo.addTarefa({ ...t, created_by: uid }),
    [ritmo, uid],
  );

  const handleAddPlano = useCallback(
    (p: Omit<PlanoDeAcao, 'id'>) => ritmo.addPlano({ ...p, created_by: uid }),
    [ritmo, uid],
  );

  const openItemModal = useCallback(
    (item: ActionItem | null, status?: ItemStatus, _ctx?: string) => {
      setSelectedItem(item ?? null);
      setDefaultStatus(status ?? ItemStatus.BACKLOG);
      setModalOpen(true);
    },
    [],
  );

  const handleSetView = useCallback((v: ViewId) => {
    setActiveView(v);
    setSidebarOpen(false);
    setSearchQuery('');
  }, []);

  // ── Meta de cada view ─────────────────────────────────────────────────────
  const showSearch = ['dashboard', 'backlog', 'performance', 'roadmap'].includes(activeView);
  const showStatCards = ['dashboard', 'backlog'].includes(activeView);

  const viewLabel: Record<ViewId, string> = {
    operacional: 'Operacional',
    table: 'Gerencial',
    dashboard: 'Estratégico',
    backlog: 'Backlog',
    performance: 'Desempenho',
    roadmap: 'Roadmap 2026',
    ia: '5W2H CHAT',
    workspace: 'Workspace',
    agenda: 'Agenda',
    chat: 'Chat',
  };

  const viewIcon: Record<ViewId, React.ReactNode> = {
    operacional: <FileText size={18} className="text-blue-500 shrink-0" />,
    table: <Target size={18} className="text-blue-500 shrink-0" />,
    dashboard: <EstrategicoGridIcon size={18} strokeWidth={2} className="text-blue-400 shrink-0" />,
    backlog: <ListTodo size={18} className="text-blue-500 shrink-0" />,
    performance: <PieChart size={18} className="text-violet-500 shrink-0" />,
    roadmap: <Briefcase size={18} className="text-cyan-500 shrink-0" />,
    ia: <Bot size={18} className="text-blue-400 shrink-0" />,
    workspace: <Target size={18} className="text-blue-400 shrink-0" />,
    agenda: <CalendarDays size={18} className="text-blue-400 shrink-0" />,
    chat: <MessageSquare size={18} className="text-blue-400 shrink-0" />,
  };

  if (ritmo.loading || loadingItems) {
    return (
      <div className="flex h-screen min-h-dvh bg-slate-950 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-slate-500 text-xs uppercase tracking-wider">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-dvh bg-slate-950 overflow-hidden text-slate-100">
      {/* Sidebar — idêntica ao sistema principal */}
      <Sidebar
        activeView={activeView}
        setView={handleSetView}
        onLogout={logout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        workspaceAtivo={ritmo.board.empresas[0] ?? 'all'}
        empresas={ritmo.board.empresas}
        allowAllWorkspaces={false}
        onChangeWorkspace={() => {}}
        onCreateWorkspace={() => {}}
        userRole={profile?.role ?? 'administrador'}
        allowedViews={undefined}
        userName={profile?.nome}
      />

      <main className="flex-1 flex flex-col overflow-hidden relative min-h-0">
        {/* Header — estrutura idêntica ao sistema principal */}
        <header className="h-14 min-h-[52px] bg-slate-900/95 border-b border-slate-800 flex items-center justify-between px-3 sm:px-4 md:px-6 z-30 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2.5 min-h-[44px] min-w-[44px] text-slate-400 hover:text-white bg-slate-800/80 rounded-lg touch-manipulation"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2.5">
              {viewIcon[activeView]}
              <h2 className="text-base font-semibold text-slate-100 tracking-tight">
                {viewLabel[activeView]}
              </h2>
              <span className="text-[9px] font-bold uppercase tracking-widest text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded hidden sm:inline">
                Protótipo
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {showSearch && (
              <div className="relative hidden md:block min-w-0 max-w-[14rem]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar..."
                  className="bg-slate-950/80 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-300 outline-none focus:border-slate-600 w-full md:w-48 transition-all"
                />
              </div>
            )}

            {activeView === 'operacional' && (
              <button
                type="button"
                onClick={() => setShowNovoPlano(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 min-h-[44px] rounded-lg flex items-center gap-2 transition-colors shrink-0 touch-manipulation"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">Novo plano</span>
              </button>
            )}

            {(activeView === 'dashboard' || activeView === 'backlog') && (
              <button
                type="button"
                onClick={() => openItemModal(null, activeView === 'backlog' ? ItemStatus.BACKLOG : ItemStatus.EXECUTING)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 min-h-[44px] rounded-lg flex items-center gap-2 transition-colors shrink-0 touch-manipulation"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">Novo</span>
              </button>
            )}
          </div>
        </header>

        {/* Conteúdo principal — scroll independente */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 p-3 sm:p-4 md:p-6">

          {/* Stat cards — Estratégico e Backlog */}
          {showStatCards && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 sm:mb-6">
              {[
                { label: activeView === 'backlog' ? 'Total' : 'Ações Totais', val: itemsFiltrados.length, icon: activeView === 'dashboard' ? EstrategicoGridIcon : ListTodo },
                { label: 'Em Execução', val: itemsFiltrados.filter((i) => i.status === ItemStatus.EXECUTING).length, icon: Activity },
                { label: 'Bloqueios', val: itemsFiltrados.filter((i) => i.status === ItemStatus.BLOCKED).length, icon: AlertCircle },
                { label: 'Concluídas', val: itemsFiltrados.filter((i) => i.status === ItemStatus.COMPLETED).length, icon: Target },
              ].map((s, i) => (
                <div key={i} className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 flex items-center gap-3 hover:border-slate-700 transition-colors">
                  <div className="p-2 rounded-lg bg-slate-800 text-slate-400 shrink-0">
                    <s.icon size={18} strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{s.label}</p>
                    <p className="text-xl font-semibold text-slate-100 tabular-nums">{s.val}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── OPERACIONAL — avulso ativo ─────────────────────────────────── */}
          {activeView === 'operacional' && (
            <OperacionalView
              prioridades={operacionalPrioridades}
              planos={operacionalPlanos}
              tarefas={ritmo.board.tarefas}
              responsaveis={responsaveis}
              whoUsers={responsaveis}
              observerUsers={responsaveis}
              computeStatusPlano={ritmo.computeStatusPlano}
              loggedUserUid={uid}
              loggedUserName={profile?.nome}
              loggedUserEmail={profile?.email}
              loggedUserDisplayName={firebaseUser?.displayName ?? undefined}
              loggedUserRole="administrador"
              onAddTarefa={handleAddTarefa}
              onUpdateTarefa={ritmo.updateTarefa}
              onDeleteTarefa={ritmo.deleteTarefa}
              onUpdatePlano={ritmo.updatePlano}
              onDeletePlano={ritmo.deletePlano}
              onAddObserver={(entity, id, userId) => ritmo.addObserver(entity, id, userId, 'follower')}
              onRemoveObserver={ritmo.removeObserver}
              operacionalCaps={{
                planoWrite: true,
                tarefaWrite: true,
                tarefaAssign: true,
                tarefaDelete: true,
                tarefaEditPrazo: true,
                observerEdit: true,
              }}
            />
          )}

          {/* ── GERENCIAL — avulso ativo ───────────────────────────────────── */}
          {activeView === 'table' && (
            <EstrategicoView
              prioridades={tablePrioridades}
              planos={tablePlanos}
              tarefas={ritmo.board.tarefas}
              responsaveis={responsaveis}
              whoUsers={responsaveis}
              observerUsers={responsaveis}
              perfisCadastro={[]}
              computeStatusPlano={ritmo.computeStatusPlano}
              onUpdatePrioridade={(id, u) => { if (id !== AVULSO) ritmo.updatePrioridade(id, u); }}
              onDeletePrioridade={(p) => { if (p.id !== AVULSO) ritmo.deletePrioridade(p.id); }}
              loggedUserUid={uid}
              loggedUserRole="administrador"
              loggedUserName={profile?.nome}
              loggedUserEmail={profile?.email}
              loggedUserDisplayName={firebaseUser?.displayName ?? undefined}
              focusPrioridadeId={null}
              focusCardId={focusedPrioridadeId.current}
              onFocusConsumed={() => { focusedPrioridadeId.current = null; }}
              onlyPrioridadeId={null}
              onAddPlano={handleAddPlano}
              onUpdatePlano={ritmo.updatePlano}
              onDeletePlano={ritmo.deletePlano}
              onAddTarefa={handleAddTarefa}
              onUpdateTarefa={ritmo.updateTarefa}
              onDeleteTarefa={ritmo.deleteTarefa}
              onAddObserver={(entity, id, userId) => ritmo.addObserver(entity, id, userId, 'follower')}
              onRemoveObserver={ritmo.removeObserver}
              estrategicoCaps={{
                prioridadeWrite: true,
                planoWrite: true,
                planoDelete: true,
                verTodosPlanos: true,
                tarefaWrite: true,
                tarefaAssign: true,
                tarefaDelete: true,
                tarefaEditPrazo: true,
                observerEdit: true,
              }}
            />
          )}

          {/* ── ESTRATÉGICO — KanbanBoard (legado) ────────────────────────── */}
          {activeView === 'dashboard' && (
            <KanbanBoard
              items={itemsFiltrados}
              onStatusChange={updateStatus}
              onOpenItem={(item) => openItemModal(item, undefined, 'estrategico')}
              onQuickUpdateWho={(id, who) => updateItem(id, { who })}
              onAddInColumn={(status) => openItemModal(null, status, 'estrategico')}
              onDelete={deleteItem}
              responsaveis={responsaveis}
              displayWho={displayWho}
              capabilities={{
                canCreate: true,
                canOpenDetail: true,
                canDelete: true,
                canWorkflow: true,
                canLinkTatico: false,
                canEditIndicator: true,
              }}
            />
          )}

          {/* ── BACKLOG ────────────────────────────────────────────────────── */}
          {activeView === 'backlog' && (
            <BacklogView
              items={itemsFiltrados}
              onUpdate={updateItem}
              onDelete={deleteItem}
              onEditItem={(item) => openItemModal(item, undefined, 'backlog')}
              onStatusChange={(id, status) => {
                updateStatus(id, status);
                if (status === ItemStatus.ACTIVE) setActiveView('dashboard');
              }}
              displayWho={displayWho}
              responsaveis={responsaveis}
              currentUserId={firebaseUser?.uid}
              isAdmin={true}
              onAddNew={() => openItemModal(null, ItemStatus.BACKLOG, 'backlog')}
              capabilities={{ canCreate: true, canEdit: true, canDelete: true, canWorkflow: true }}
            />
          )}

          {/* ── DESEMPENHO ─────────────────────────────────────────────────── */}
          {activeView === 'performance' && (
            <PerformanceView items={itemsFiltrados} displayWho={displayWho} />
          )}

          {/* ── ROADMAP ────────────────────────────────────────────────────── */}
          {activeView === 'roadmap' && (
            <RoadmapView
              items={itemsFiltrados}
              onOpenItem={openItemModal}
              canOpenItem={true}
              displayWho={displayWho}
            />
          )}

          {/* ── AGENDA ─────────────────────────────────────────────────────── */}
          {activeView === 'agenda' && (
            <AgendaView
              items={agenda.items}
              loading={agenda.loading}
              onAdd={agenda.addItem}
              onCycleStatus={agenda.cycleStatus}
              onDelete={agenda.deleteItem}
            />
          )}

          {/* ── IA ─────────────────────────────────────────────────────────── */}
          {activeView === 'ia' && (
            <div className="pb-8 h-full min-h-0 flex flex-col">
              <ChatView canSend={true} />
            </div>
          )}

          {/* ── WORKSPACE ──────────────────────────────────────────────────── */}
          {activeView === 'workspace' && (
            <div className="max-w-lg">
              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
                    <Target size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">Workspaces por empresa</h3>
                    <p className="text-[11px] text-slate-500">
                      Gestão completa disponível no sistema principal.
                    </p>
                  </div>
                </div>
                {ritmo.board.empresas.length === 0 ? (
                  <p className="text-xs text-slate-500">Nenhum workspace cadastrado.</p>
                ) : (
                  <ul className="space-y-2">
                    {ritmo.board.empresas.map((nome) => (
                      <li key={nome} className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2.5">
                        <span className="text-xs text-slate-200 font-medium">{nome}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Modais ─────────────────────────────────────────────────────────── */}
      {showNovoPlano && (
        <NovoPlanoModal
          uid={uid}
          onClose={() => setShowNovoPlano(false)}
          onSave={(p) => ritmo.addPlano({ ...p, created_by: uid })}
        />
      )}

      {modalOpen && (
        <ActionItemModal
          isOpen={modalOpen}
          item={selectedItem}
          defaultStatus={defaultStatus}
          onClose={() => { setModalOpen(false); setSelectedItem(null); }}
          onSave={(item) => {
            if (selectedItem) {
              updateItem(selectedItem.id, item);
            } else {
              addItem(item);
            }
            setModalOpen(false);
            setSelectedItem(null);
          }}
          responsaveis={responsaveis}
          context={activeView === 'backlog' ? 'backlog' : 'estrategico'}
        />
      )}
    </div>
  );
}

// ── Guard de autenticação ─────────────────────────────────────────────────────

export function ProRoute() {
  const { isAuthenticated, loading } = useUser();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-8 max-w-sm w-full text-center space-y-4">
          <p className="text-slate-300 text-sm">
            Você precisa estar autenticado para acessar o protótipo.
          </p>
          <a
            href="/"
            className="inline-block px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
          >
            Ir para o login
          </a>
        </div>
      </div>
    );
  }

  return <ProContent />;
}
