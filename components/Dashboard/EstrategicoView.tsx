import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Prioridade,
  PlanoDeAcao,
  Tarefa,
  Responsavel,
  StatusPlano,
  StatusTarefa,
} from '../../types';
import type { UserProfile } from '../../types/user';
import {
  Plus,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Circle,
  RotateCcw,
  Check,
  User,
  Calendar,
  Target,
  Play,
  Archive,
  Eye,
} from 'lucide-react';
import { EstrategicoGridIcon } from '../icons/EstrategicoGridIcon';
import { ResponsavelAutocomplete } from './ResponsavelAutocomplete';
import {
  responsavelIdsForLoggedUser,
  sameResponsavelReference,
  donoPrioridadeCorrespondeAoUsuario,
  displayNomeDonoPrioridade,
} from './responsavelSearchUtils';
import { canViewByOwnershipOrObserver, tarefaAtribuidaAoUsuario } from './taskAssignmentUtils';
import { ObserversPanel } from './ObserversPanel';
import { apiGetBlockContext } from '../../services/ritmoCollabApi';
import { Modal } from '../Shared/Modal';
import { TaskBlockReasonModal } from './TaskBlockReasonModal';
import { VisibilityFilterBar, type VisibilityFilter } from '../Shared/VisibilityFilterBar';

function toggleVisibilityFilter(prev: VisibilityFilter[], filter: VisibilityFilter): VisibilityFilter[] {
  return prev.includes(filter) ? prev.filter((item) => item !== filter) : [...prev, filter];
}

const EMPTY_ID_SET = new Set<string>();

function initials(nome: string): string {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

function fmtDate(ts: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(ts));
}

function tsFromDateInput(v: string): number {
  return new Date(v + 'T12:00:00').getTime();
}

function dateInputValue(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function formatDateBR(ts: number): string {
  // “Data do Brasil” (pt-BR) com timezone explícita para evitar troca de dia.
  return new Date(ts).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function parseDateBR(v: string): number | null {
  // Espera dd/mm/yyyy
  const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return new Date(year, month - 1, day, 12, 0, 0).getTime();
}

function normStr(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

function todayDateBR(): string {
  return formatDateBR(Date.now());
}

const STATUS_CFG: Record<StatusPlano, { label: string; cls: string }> = {
  Execucao: { label: 'Em Execução', cls: 'text-blue-400 bg-blue-500/10 border border-blue-500/30' },
  Bloqueado: { label: 'Bloqueado', cls: 'text-red-400 bg-red-500/10 border border-red-500/30' },
  Concluido: { label: 'Concluído', cls: 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/30' },
};

const TAREFA_CFG: Record<StatusTarefa, { label: string; cls: string; Icon: React.ElementType }> = {
  Concluida: { label: 'CONCLUÍDA', cls: 'text-emerald-400 bg-emerald-500/15', Icon: CheckCircle },
  EmExecucao: { label: 'EM EXECUÇÃO', cls: 'text-emerald-400 bg-emerald-500/15', Icon: Play },
  Pendente: { label: 'PENDENTE', cls: 'text-slate-400 bg-slate-700/60', Icon: Circle },
  Bloqueada: { label: 'BLOQUEADA', cls: 'text-red-400 bg-red-500/15', Icon: AlertTriangle },
};

// ── Props ────────────────────────────────────────────────────────────────────

export interface EstrategicoCaps {
  prioridadeWrite?: boolean;
  planoWrite?: boolean;
  planoDelete?: boolean;
  /** Lista completa de prioridades + todas as tarefas nos planos (sem ser só dono/atribuído). */
  verTodosPlanos?: boolean;
  tarefaWrite?: boolean;
  /** Pode escolher outro responsável na tarefa (senão só a si). */
  tarefaAssign?: boolean;
  tarefaDelete?: boolean;
  /** Quando true, permite editar o prazo (data de vencimento) da tarefa diretamente na linha. */
  tarefaEditPrazo?: boolean;
  /** Pode adicionar/remover observadores no Tático. */
  observerEdit?: boolean;
}

interface EstrategicoViewProps {
  prioridades: Prioridade[];
  planos: PlanoDeAcao[];
  tarefas: Tarefa[];
  responsaveis: Responsavel[];
  whoUsers?: Responsavel[];
  observerUsers?: Responsavel[];
  computeStatusPlano: (id: string) => StatusPlano | null;
  onUpdatePrioridade: (id: string, u: Partial<Prioridade>) => void;
  onDeletePrioridade: (p: Prioridade) => void;
  onAddPlano: (p: Omit<PlanoDeAcao, 'id'>) => void;
  onUpdatePlano: (id: string, u: Partial<PlanoDeAcao>) => void;
  onDeletePlano: (id: string) => void;
  onAddTarefa: (t: Omit<Tarefa, 'id'>) => void;
  onUpdateTarefa: (id: string, u: Partial<Tarefa>) => void;
  onDeleteTarefa: (id: string) => void;
  onAddObserver?: (entity: 'prioridade' | 'plano' | 'tarefa', entityId: string, userId: string) => void;
  onRemoveObserver?: (entity: 'prioridade' | 'plano' | 'tarefa', entityId: string, userId: string) => void;
  loggedUserUid?: string;
  loggedUserRole?: 'administrador' | 'gerente' | 'usuario' | null;
  loggedUserName?: string | null;
  loggedUserEmail?: string | null;
  /** Nome exibido no Firebase Auth (fallback quando perfil.nome está vazio ou diferente). */
  loggedUserDisplayName?: string | null;
  /** Quando definido, faz scroll até o bloco da prioridade no Tático */
  focusPrioridadeId?: string | null;
  focusCardId?: string | null;
  onFocusConsumed?: () => void;
  /** Quando definido, mostra somente esta prioridade no Tático */
  onlyPrioridadeId?: string | null;
  estrategicoCaps?: EstrategicoCaps;
  /** Perfis Firebase (cadastro admin) para resolver uid → nome quando `dono_id` não bate só no cadastro de responsáveis */
  perfisCadastro?: UserProfile[] | null;
}

// ── TarefaRow ────────────────────────────────────────────────────────────────

const TarefaRow: React.FC<{
  tarefa: Tarefa;
  responsaveis: Responsavel[];
  onUpdate: (u: Partial<Tarefa>) => void;
  onRequestBlock: () => void;
  /**
   * Pede ao parent (PlanoCard) que abra o modal de confirmação.
   * NUNCA renderizamos o Modal aqui dentro: o JSX da TarefaRow é filho de
   * <tbody>, e React/HTML não permite <div> nesse contexto. Mesmo com portal,
   * a checagem dispara warning de hidratação. Lift state up.
   */
  onRequestDelete: () => void;
  canWriteTarefa?: boolean;
  canAssignTarefa?: boolean;
  canDeleteTarefa?: boolean;
  canEditPrazo?: boolean;
  allUsers: Array<{ id: string; label: string }>;
  onAddObserver?: (entity: 'prioridade' | 'plano' | 'tarefa', entityId: string, userId: string) => void;
  onRemoveObserver?: (entity: 'prioridade' | 'plano' | 'tarefa', entityId: string, userId: string) => void;
  canEditObservers?: boolean;
  perfisCadastro?: UserProfile[] | null;
}> = ({
  tarefa,
  responsaveis,
  onUpdate,
  onRequestBlock,
  onRequestDelete,
  canWriteTarefa = true,
  canAssignTarefa = true,
  canDeleteTarefa = true,
  canEditPrazo = false,
  allUsers,
  onAddObserver,
  onRemoveObserver,
  canEditObservers = true,
  perfisCadastro,
}) => {
  const [showObservers, setShowObservers] = useState(false);
  const [editingTitulo, setEditingTitulo] = useState(false);
  const [tituloInput, setTituloInput] = useState(tarefa.titulo);
  const byAllUsers = allUsers.find((u) => normStr(u.id) === normStr(tarefa.responsavel_id));
  const resp = responsaveis.find(
    (r) =>
      normStr(r.id) === normStr(tarefa.responsavel_id) ||
      normStr(r.nome) === normStr(tarefa.responsavel_id),
  );
  const displayNome = resp?.nome || byAllUsers?.label || tarefa.responsavel_id || '';
  const cfg = TAREFA_CFG[tarefa.status_tarefa] || TAREFA_CFG.Pendente;
  const StatusIcon = cfg.Icon;
  const isOverdue = tarefa.data_vencimento < Date.now() && tarefa.status_tarefa !== 'Concluida';
  const handleStatusChange = (next: StatusTarefa) => {
    if (next === 'Bloqueada' && tarefa.status_tarefa !== 'Bloqueada') {
      onRequestBlock();
      return;
    }
    onUpdate({
      status_tarefa: next,
      ...(next === 'Concluida' ? { data_conclusao: Date.now() } : {}),
    });
  };

  return (
    <>
    <tr className="hover:bg-slate-800/20 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            disabled={!canWriteTarefa}
            onClick={() => {
              const order: StatusTarefa[] = ['Pendente', 'EmExecucao', 'Bloqueada', 'Concluida'];
              const idx = order.indexOf(tarefa.status_tarefa);
              const next = order[(idx + 1) % order.length];
              handleStatusChange(next);
            }}
            className="mt-0.5 shrink-0 text-slate-500 hover:text-slate-200 disabled:opacity-40 disabled:pointer-events-none"
          >
            <StatusIcon
              size={14}
              className={
                tarefa.status_tarefa === 'Bloqueada'
                  ? 'text-red-400'
                  : tarefa.status_tarefa === 'Concluida'
                  ? 'text-emerald-400'
                  : tarefa.status_tarefa === 'EmExecucao'
                  ? 'text-emerald-400'
                  : 'text-slate-500'
              }
            />
          </button>
          <div className="min-w-0">
            {canWriteTarefa && editingTitulo ? (
              <input
                autoFocus
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-sm font-medium text-slate-100 outline-none focus:border-blue-500"
                value={tituloInput}
                onChange={(e) => setTituloInput(e.target.value)}
                onBlur={() => {
                  const v = tituloInput.trim();
                  if (v && v !== tarefa.titulo) onUpdate({ titulo: v });
                  else setTituloInput(tarefa.titulo);
                  setEditingTitulo(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.currentTarget.blur(); }
                  if (e.key === 'Escape') { setTituloInput(tarefa.titulo); setEditingTitulo(false); }
                }}
              />
            ) : (
              <p
                className={`text-sm font-medium ${tarefa.status_tarefa === 'Concluida' ? 'line-through text-slate-500' : 'text-slate-200'} ${canWriteTarefa ? 'cursor-text hover:text-blue-300 transition-colors' : ''}`}
                onClick={() => { if (canWriteTarefa) { setTituloInput(tarefa.titulo); setEditingTitulo(true); } }}
                title={canWriteTarefa ? 'Clique para editar o nome da tarefa' : undefined}
              >
                {tarefa.titulo}
              </p>
            )}
            {tarefa.descricao && <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[280px]">{tarefa.descricao}</p>}
            {tarefa.status_tarefa === 'Bloqueada' && tarefa.bloqueio_motivo && (
              <p className="text-[11px] text-red-400/80 mt-0.5 flex items-center gap-1">
                <AlertTriangle size={10} /> {tarefa.bloqueio_motivo}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 align-top relative z-20">
        <div className="flex items-center gap-1.5 min-w-0">
          {displayNome ? (
            <span className="w-6 h-6 rounded-full bg-slate-700 text-slate-300 text-[9px] font-bold flex items-center justify-center shrink-0">
              {initials(displayNome)}
            </span>
          ) : (
            <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-500 text-[9px] font-bold flex items-center justify-center shrink-0">
              ?
            </span>
          )}
          {canWriteTarefa ? (
            <ResponsavelAutocomplete
              responsaveis={responsaveis}
              valueId={tarefa.responsavel_id}
              onCommit={(id) => onUpdate({ responsavel_id: id })}
              variant="compact"
              placeholder="Buscar..."
              disabled={!canAssignTarefa}
            />
          ) : (
            <span className="text-xs text-slate-400 truncate max-w-[120px]">{displayNome || '—'}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        {canEditPrazo && canWriteTarefa ? (
          <input
            type="date"
            className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200 outline-none focus:border-blue-500 cursor-pointer"
            value={dateInputValue(tarefa.data_vencimento)}
            onChange={(e) => {
              const ts = tsFromDateInput(e.target.value);
              if (ts && !isNaN(ts)) onUpdate({ data_vencimento: ts });
            }}
          />
        ) : (
          <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-400 font-medium' : 'text-slate-400'}`}>
            {isOverdue && <AlertTriangle size={10} />}
            {fmtDate(tarefa.data_vencimento)}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
          <select
            value={tarefa.status_tarefa}
            onChange={(e) => {
              const next = e.target.value as StatusTarefa;
              handleStatusChange(next);
            }}
            disabled={!canWriteTarefa}
            className="text-[10px] font-semibold px-2 py-1 rounded-sm uppercase bg-slate-800 border border-slate-700 text-slate-200 outline-none focus:border-slate-500 disabled:opacity-50"
          >
            <option value="Pendente">PENDENTE</option>
            <option value="EmExecucao">EM EXECUÇÃO</option>
            <option value="Bloqueada">BLOQUEADA</option>
            <option value="Concluida">CONCLUÍDA</option>
          </select>
          <button
            type="button"
            onClick={() => setShowObservers((v) => !v)}
            className={`p-1 rounded transition-colors ${
              showObservers
                ? 'text-slate-100 bg-slate-700/80'
                : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title={`${(tarefa.observadores ?? []).length} observador(es)`}
            aria-label="Abrir observadores"
          >
            <Eye size={13} />
          </button>
          </div>
          {tarefa.status_tarefa === 'Concluida' && tarefa.data_conclusao && (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300/70">
              <Calendar size={9} />
              {fmtDate(tarefa.data_conclusao)}
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-3 text-right w-16">
        {canDeleteTarefa && (
          <button
            type="button"
            onClick={onRequestDelete}
            className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Excluir tarefa"
          >
            <Trash2 size={13} />
          </button>
        )}
      </td>
    </tr>
    {showObservers && (
      <tr className="bg-slate-900/40">
        <td colSpan={5} className="px-4 pb-2">
          <ObserversPanel
            entity="tarefa"
            entityId={tarefa.id}
            observers={tarefa.observadores ?? []}
            allUsers={allUsers}
            resolveUserName={(userId) =>
              displayNomeDonoPrioridade(userId, responsaveis, perfisCadastro) || userId
            }
            onAdd={(userId) => onAddObserver?.('tarefa', tarefa.id, userId)}
            onRemove={(userId) => onRemoveObserver?.('tarefa', tarefa.id, userId)}
            canEdit={canEditObservers}
            hideTrigger
          />
        </td>
      </tr>
    )}
    </>
  );
};

// ── PlanoCard ────────────────────────────────────────────────────────────────

const PlanoCard: React.FC<{
  plano: PlanoDeAcao;
  tarefas: Tarefa[];
  responsaveis: Responsavel[];
  whoUsers?: Responsavel[];
  computeStatusPlano: (id: string) => StatusPlano | null;
  onUpdate: (u: Partial<PlanoDeAcao>) => void;
  onDelete: () => void;
  onAddTarefa: (t: Omit<Tarefa, 'id'>) => void;
  onUpdateTarefa: (id: string, u: Partial<Tarefa>) => void;
  onDeleteTarefa: (id: string) => void;
  /** Override para renderização do "WHO" (quem) no modo não-admin */
  whoOverrideName?: string;
  /** Se true, trava renderização do WHO para whoOverrideName (não deixa revelar/editar who_id do plano) */
  lockWhoToOverrideName?: boolean;
  /** Responsável padrão (quem está logado) para criar tarefas */
  loggedUserResponsavelId?: string;
  /** Nome exibido do responsável (quem está logado) */
  loggedUserResponsavelNomeDisplay?: string;
  canWritePlano?: boolean;
  canDeletePlano?: boolean;
  canWriteTarefa?: boolean;
  canAssignTarefa?: boolean;
  canDeleteTarefa?: boolean;
  canEditPrazo?: boolean;
  /** Dono da prioridade pai (para filtrar tarefas no perfil do executante) */
  prioridadeDonoId?: string;
  viewerIsAdmin?: boolean;
  viewerMyResponsavelIds?: Set<string>;
  allUsers: Array<{ id: string; label: string }>;
  onAddObserver?: (entity: 'prioridade' | 'plano' | 'tarefa', entityId: string, userId: string) => void;
  onRemoveObserver?: (entity: 'prioridade' | 'plano' | 'tarefa', entityId: string, userId: string) => void;
  canEditObservers?: boolean;
  perfisCadastro?: UserProfile[] | null;
}> = ({
  plano,
  tarefas,
  responsaveis,
  whoUsers,
  computeStatusPlano,
  onUpdate,
  onDelete,
  onAddTarefa,
  onUpdateTarefa,
  onDeleteTarefa,
  whoOverrideName,
  lockWhoToOverrideName = false,
  loggedUserResponsavelId,
  loggedUserResponsavelNomeDisplay,
  canWritePlano = true,
  canDeletePlano = true,
  canWriteTarefa = true,
  canAssignTarefa = true,
  canDeleteTarefa = true,
  canEditPrazo = false,
  prioridadeDonoId = '',
  viewerIsAdmin = true,
  viewerMyResponsavelIds,
  allUsers,
  onAddObserver,
  onRemoveObserver,
  canEditObservers = true,
  perfisCadastro,
}) => {
  const whoPool = whoUsers && whoUsers.length > 0 ? whoUsers : responsaveis;
  const myViewerIds = viewerMyResponsavelIds ?? EMPTY_ID_SET;

  const [expanded, setExpanded] = useState(false);
  const [showAddTarefa, setShowAddTarefa] = useState(false);
  const [showPlanoObservers, setShowPlanoObservers] = useState(false);
  const [confirmDeletePlano, setConfirmDeletePlano] = useState(false);
  // Estado de confirmação de exclusão de tarefa fica AQUI (no PlanoCard) e não
  // dentro de TarefaRow. Motivo: TarefaRow renderiza dentro de <tbody>; um
  // <Modal> ali (mesmo via portal) dispara warning de validateDOMNesting do
  // React, e em alguns casos o clique do botão fica capturado pelo <tr>,
  // impedindo a exclusão. Lift state up resolve ambos os problemas.
  const [tarefaParaExcluir, setTarefaParaExcluir] = useState<Tarefa | null>(null);
  const [tarefaParaBloquear, setTarefaParaBloquear] = useState<Tarefa | null>(null);
  const [motivoBloqueio, setMotivoBloqueio] = useState('');
  const [blockContext, setBlockContext] = useState<
    { task_id: string; task_title: string; task_owner: string; block_reason: string }[]
  >([]);
  const [novaTarefa, setNovaTarefa] = useState({
    titulo: '',
    responsavel_id: loggedUserResponsavelId ?? '',
    data_vencimento: todayDateBR(),
    descricao: '',
  });

  useEffect(() => {
    if (canAssignTarefa) return;
    const self = loggedUserResponsavelId ?? '';
    setNovaTarefa((prev) => (prev.responsavel_id === self ? prev : { ...prev, responsavel_id: self }));
  }, [canAssignTarefa, loggedUserResponsavelId]);

  const computed = computeStatusPlano(plano.id);
  const status = (computed || plano.status_plano) as StatusPlano;
  const statusCfg = STATUS_CFG[status] || STATUS_CFG.Execucao;
  const resp = whoPool.find((r) => normStr(r.id) === normStr(plano.who_id));
  const planWhoReadable =
    displayNomeDonoPrioridade(plano.who_id, whoPool, perfisCadastro) || resp?.nome || plano.who_id || '';
  const displayWho = planWhoReadable || whoOverrideName || '—';

  // Usuário é dono do PLANO (who_id) — vê todas as tarefas deste plano.
  // Dono da prioridade pai não concede visibilidade automática sobre todos os planos.
  const souDonoDestePlano =
    myViewerIds.size > 0 &&
    donoPrioridadeCorrespondeAoUsuario(plano.who_id, myViewerIds, responsaveis);

  const tarefasVisiveis = useMemo(() => {
    if (viewerIsAdmin || souDonoDestePlano) return tarefas;
    // Não-admin e não-dono do plano: vê tarefas atribuídas a si OU onde é observador.
    return tarefas.filter(
      (t) =>
        tarefaAtribuidaAoUsuario(t, myViewerIds, responsaveis) ||
        canViewByOwnershipOrObserver([t.responsavel_id], t.observadores, myViewerIds, responsaveis),
    );
  }, [tarefas, viewerIsAdmin, souDonoDestePlano, myViewerIds, responsaveis]);

  const bloqueiosNaoVisiveis = useMemo(() => {
    if (viewerIsAdmin || souDonoDestePlano) return [];
    const visiveis = new Set(tarefasVisiveis.map((t) => t.id));
    return tarefas
      .filter((t) => !visiveis.has(t.id) && t.status_tarefa === 'Bloqueada')
      .map((t) => ({
        id: t.id,
        titulo: t.titulo,
        responsavel:
          displayNomeDonoPrioridade(t.responsavel_id, responsaveis, perfisCadastro) || t.responsavel_id,
        motivo: t.bloqueio_motivo || 'Motivo não informado',
      }));
  }, [tarefas, tarefasVisiveis, viewerIsAdmin, souDonoDestePlano, responsaveis]);

  const concluidas = tarefasVisiveis.filter((t) => t.status_tarefa === 'Concluida').length;
  const totalTarefas = tarefasVisiveis.length;
  const progresso = totalTarefas > 0 ? (concluidas / totalTarefas) * 100 : 0;

  useEffect(() => {
    if (!expanded || status !== 'Bloqueado') return;
    let mounted = true;
    void apiGetBlockContext(plano.id, tarefas).then((ctx) => {
      if (!mounted || !ctx) return;
      setBlockContext(ctx);
    });
    return () => {
      mounted = false;
    };
  }, [expanded, status, plano.id, tarefas]);

  const handleAddTarefa = () => {
    if (!novaTarefa.titulo.trim()) return;
    const parsedVenc = parseDateBR(novaTarefa.data_vencimento);
    if (!parsedVenc) return;
    const rid = (
      canAssignTarefa ? novaTarefa.responsavel_id : loggedUserResponsavelId ?? ''
    ).trim();
    if (!rid) return;
    onAddTarefa({
      plano_id: plano.id,
      titulo: novaTarefa.titulo.trim(),
      descricao: novaTarefa.descricao.trim(),
      responsavel_id: rid,
      data_inicio: Date.now(),
      data_vencimento: parsedVenc,
      status_tarefa: 'Pendente',
      created_by: loggedUserResponsavelId ?? '',
      empresa: plano.empresa,
    });
    setNovaTarefa({
      titulo: '',
      responsavel_id: loggedUserResponsavelId ?? '',
      data_vencimento: todayDateBR(),
      descricao: '',
    });
    setShowAddTarefa(false);
  };
  const openBlockReasonModal = (tarefa: Tarefa) => {
    onUpdateTarefa(tarefa.id, { status_tarefa: 'Bloqueada' });
    setTarefaParaBloquear(tarefa);
    setMotivoBloqueio(tarefa.bloqueio_motivo ?? '');
  };
  const closeBlockReasonModal = () => {
    setTarefaParaBloquear(null);
    setMotivoBloqueio('');
  };
  const confirmBlockReason = () => {
    if (!tarefaParaBloquear) return;
    const motivo = motivoBloqueio.trim();
    onUpdateTarefa(tarefaParaBloquear.id, {
      status_tarefa: 'Bloqueada',
      bloqueio_motivo: motivo || undefined,
    });
    closeBlockReasonModal();
  };

  const W2H: Array<{ key: keyof PlanoDeAcao; label: string; sub: string; type: 'textarea' | 'input' | 'date' | 'resp' }> = [
    { key: 'what', label: 'WHAT', sub: 'O que', type: 'textarea' },
    { key: 'why', label: 'WHY', sub: 'Por que', type: 'textarea' },
    { key: 'who_id', label: 'WHO', sub: 'Quem', type: 'resp' },
    { key: 'when_fim', label: 'WHEN', sub: 'Quando', type: 'date' },
    { key: 'where', label: 'WHERE', sub: 'Onde', type: 'input' },
    { key: 'how_much', label: 'HOW MUCH', sub: 'Quanto', type: 'input' },
    { key: 'how', label: 'HOW — EXECUÇÃO', sub: 'Como será feito', type: 'textarea' },
  ];

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl">
      <div className="px-4 py-3 flex items-center gap-3 hover:bg-slate-800/20 transition-colors">
        <button type="button" onClick={() => setExpanded((v) => !v)} className="p-1 text-slate-500 hover:text-slate-300 transition-colors shrink-0">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-left w-full"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-100">
                  {plano.titulo}
                </span>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusCfg.cls}`}
                >
                  {statusCfg.label}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                {displayWho && (
                  <span className="flex items-center gap-1">
                    <User size={10} /> {displayWho}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar size={10} /> Prazo: {fmtDate(plano.when_fim)}
                </span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
              <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    status === 'Concluido'
                      ? 'bg-emerald-500'
                      : status === 'Bloqueado'
                      ? 'bg-red-500'
                      : 'bg-blue-500'
                  }`}
                  style={{ width: `${progresso}%` }}
                />
              </div>
              <span className="tabular-nums">
                {concluidas}/{totalTarefas || 0} tarefas concluídas
              </span>
            </div>
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowPlanoObservers((v) => !v)}
          className={`p-1.5 rounded transition-colors ${
            showPlanoObservers
              ? 'text-slate-100 bg-slate-700/80'
              : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
          title={`${(plano.observadores ?? []).length} observador(es)`}
          aria-label="Abrir observadores do plano"
        >
          <Eye size={13} />
        </button>
        {canDeletePlano && (
          <button type="button" onClick={() => setConfirmDeletePlano(true)} className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors shrink-0" title="Excluir plano">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {showPlanoObservers && (
        <div className="px-6 pb-3">
          <ObserversPanel
            entity="plano"
            entityId={plano.id}
            observers={plano.observadores ?? []}
            allUsers={allUsers}
            resolveUserName={(userId) =>
              displayNomeDonoPrioridade(userId, responsaveis, perfisCadastro) || userId
            }
            onAdd={(userId) => onAddObserver?.('plano', plano.id, userId)}
            onRemove={(userId) => onRemoveObserver?.('plano', plano.id, userId)}
            canEdit={canEditObservers}
            hideTrigger
          />
        </div>
      )}

      {expanded && (
        <div className="border-t border-slate-800">
          {/* 5W2H fields */}
          <div className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-5 px-6 py-6">
            {W2H.map(({ key, label, sub, type }) => (
              <React.Fragment key={key as string}>
                <div className="pt-0.5">
                  <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest whitespace-nowrap">{label}</p>
                  <p className="text-[10px] text-slate-600">{sub}</p>
                </div>
                <div>
                  {type === 'textarea' ? (
                    <textarea
                      key={`${plano.id}-${key}`}
                      defaultValue={(plano[key] as string) || ''}
                      onBlur={
                        canWritePlano
                          ? (e) => {
                              const value = e.target.value;
                              const current = String((plano[key] as string) || '');
                              if (value !== current) onUpdate({ [key]: value });
                            }
                          : undefined
                      }
                      readOnly={!canWritePlano}
                      disabled={!canWritePlano}
                      rows={2}
                      className="w-full bg-transparent text-sm text-slate-200 outline-none resize-none border-b border-transparent focus:border-slate-600 transition-colors py-0.5 placeholder:text-slate-700 disabled:opacity-60"
                      placeholder={`${sub}...`}
                    />
                  ) : type === 'input' ? (
                    <input
                      key={`${plano.id}-${key}`}
                      defaultValue={(plano[key] as string) || ''}
                      onBlur={
                        canWritePlano
                          ? (e) => {
                              const value = e.target.value;
                              const current = String((plano[key] as string) || '');
                              if (value !== current) onUpdate({ [key]: value });
                            }
                          : undefined
                      }
                      readOnly={!canWritePlano}
                      disabled={!canWritePlano}
                      className="w-full bg-transparent text-sm text-slate-200 outline-none border-b border-transparent focus:border-slate-600 transition-colors py-0.5 placeholder:text-slate-700 disabled:opacity-60"
                      placeholder={`${sub}...`}
                    />
                  ) : type === 'date' ? (
                    <input
                      type="text"
                      defaultValue={formatDateBR(plano.when_fim)}
                      onBlur={
                        canWritePlano
                          ? (e) => {
                              const parsed = parseDateBR(e.target.value);
                              if (parsed && parsed !== plano.when_fim) onUpdate({ when_fim: parsed });
                            }
                          : undefined
                      }
                      readOnly={!canWritePlano}
                      disabled={!canWritePlano}
                      placeholder="dd/mm/yyyy"
                      className="bg-transparent text-sm text-slate-200 outline-none border-b border-transparent focus:border-slate-600 transition-colors py-0.5 placeholder:text-slate-700 disabled:opacity-60"
                    />
                  ) : lockWhoToOverrideName ? (
                    <div className="w-full bg-transparent py-0.5 text-sm text-slate-200">{displayWho || '—'}</div>
                  ) : canWritePlano ? (
                    <ResponsavelAutocomplete
                      responsaveis={whoPool}
                      valueId={plano.who_id}
                      onCommit={(id) => onUpdate({ who_id: id })}
                      variant="inline"
                      placeholder="Buscar no cadastro (ex.: Willy)..."
                    />
                  ) : (
                    <div className="w-full bg-transparent py-0.5 text-sm text-slate-200">{displayWho || '—'}</div>
                  )}
                </div>
              </React.Fragment>
            ))}
          </div>
          {/* Tasks section */}
          <div className="border-t border-slate-800">
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tarefas</span>
                {tarefasVisiveis.length > 0 && (
                  <>
                    <div className="w-20 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${tarefasVisiveis.length > 0 ? (concluidas / tarefasVisiveis.length) * 100 : 0}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-500 tabular-nums">{concluidas}/{tarefasVisiveis.length} concluídas</span>
                  </>
                )}
              </div>
              {canWriteTarefa && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddTarefa((v) => {
                      const next = !v;
                      if (next) {
                        setNovaTarefa({
                          titulo: '',
                          responsavel_id: loggedUserResponsavelId ?? '',
                          data_vencimento: todayDateBR(),
                          descricao: '',
                        });
                      }
                      return next;
                    });
                  }}
                  className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  <Plus size={12} /> Nova Tarefa
                </button>
              )}
            </div>

            {tarefasVisiveis.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full table-fixed min-w-[640px]">
                  <thead>
                    <tr className="border-t border-b border-slate-800 text-[10px] font-semibold text-slate-600 uppercase tracking-wider bg-slate-900/40">
                      <th className="px-4 py-2 text-left">Tarefa</th>
                      <th className="px-4 py-2 text-left">Responsável</th>
                      <th className="px-4 py-2 text-left">Prazo</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-2 py-2 text-right w-16">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {tarefasVisiveis.map((t) => (
                      <TarefaRow
                        key={t.id}
                        tarefa={t}
                        responsaveis={responsaveis}
                        onUpdate={(u) => onUpdateTarefa(t.id, u)}
                        onRequestBlock={() => openBlockReasonModal(t)}
                        onRequestDelete={() => setTarefaParaExcluir(t)}
                        canWriteTarefa={canWriteTarefa}
                        canAssignTarefa={canAssignTarefa}
                        canDeleteTarefa={canDeleteTarefa}
                        canEditPrazo={canEditPrazo}
                        allUsers={allUsers}
                        onAddObserver={onAddObserver}
                        onRemoveObserver={onRemoveObserver}
                        canEditObservers={canEditObservers}
                        perfisCadastro={perfisCadastro}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {bloqueiosNaoVisiveis.length > 0 && (
              <div className="px-4 pb-3">
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  <p className="text-[11px] text-amber-300 font-medium">
                    Bloqueio propagado por tarefa de outro responsável
                  </p>
                  <div className="mt-1 space-y-1">
                    {bloqueiosNaoVisiveis.slice(0, 3).map((b) => (
                      <p key={b.id} className="text-[11px] text-amber-200/90">
                        {b.titulo} · {b.responsavel} · {b.motivo}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {status === 'Bloqueado' && blockContext.length > 0 && (
              <div className="px-4 pb-3">
                <div className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2">
                  <p className="text-[11px] text-red-300 font-medium">Causa do Bloqueio</p>
                  {blockContext.map((c) => (
                    <p key={c.task_id} className="text-[11px] text-red-200/90 mt-1">
                      ⛔ Tarefa: &quot;{c.task_title}&quot; · 👤 Responsável:{' '}
                      {displayNomeDonoPrioridade(c.task_owner, responsaveis, perfisCadastro).trim() ||
                        c.task_owner}{' '}
                      · 📝 Motivo:{' '}
                      {c.block_reason || '—'}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {showAddTarefa && canWriteTarefa && (
              <div className="px-4 py-3 border-t border-slate-800/60 bg-slate-900/30 flex items-end gap-3 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Tarefa *</label>
                  <input autoFocus value={novaTarefa.titulo} onChange={(e) => setNovaTarefa((v) => ({ ...v, titulo: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddTarefa(); if (e.key === 'Escape') setShowAddTarefa(false); }}
                    placeholder="Título da tarefa..." className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-emerald-500/60 placeholder:text-slate-600" />
                </div>
                <div className="min-w-[160px] max-w-[220px]">
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">
                    Responsável
                  </label>
                  <ResponsavelAutocomplete
                    responsaveis={responsaveis}
                    valueId={novaTarefa.responsavel_id}
                    onCommit={(id) => setNovaTarefa((prev) => ({ ...prev, responsavel_id: id }))}
                    placeholder="Buscar no cadastro..."
                    disabled={!canAssignTarefa}
                  />
                </div>
                <div className="min-w-[130px]">
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Prazo</label>
                  <input
                    value={novaTarefa.data_vencimento}
                    onChange={(e) => setNovaTarefa((v) => ({ ...v, data_vencimento: e.target.value }))}
                    placeholder="dd/mm/yyyy"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-slate-600 placeholder:text-slate-600"
                  />
                </div>
                <div className="flex gap-2 items-end">
                  <button
                    type="button"
                    onClick={handleAddTarefa}
                    disabled={
                      !novaTarefa.titulo.trim() ||
                      !parseDateBR(novaTarefa.data_vencimento) ||
                      !novaTarefa.responsavel_id.trim()
                    }
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors">Adicionar</button>
                  <button type="button" onClick={() => setShowAddTarefa(false)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded-lg transition-colors">Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {confirmDeletePlano && (
        <Modal isOpen onClose={() => setConfirmDeletePlano(false)} title="Excluir plano" maxWidth="sm">
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <AlertTriangle size={16} className="mt-0.5 text-red-300 shrink-0" />
              <p className="text-sm text-slate-200">
                Tem certeza que deseja excluir o plano{' '}
                <span className="font-semibold text-white">&quot;{plano.titulo}&quot;</span>?
                Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeletePlano(false)}
                className="px-4 py-2 rounded-lg border border-slate-600 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => { onDelete(); setConfirmDeletePlano(false); }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-semibold text-white transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </Modal>
      )}
      {tarefaParaExcluir && (
        <Modal
          isOpen
          onClose={() => setTarefaParaExcluir(null)}
          title="Excluir tarefa"
          maxWidth="sm"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <AlertTriangle size={16} className="mt-0.5 text-red-300 shrink-0" />
              <p className="text-sm text-slate-200">
                Tem certeza que deseja excluir a tarefa{' '}
                <span className="font-semibold text-white">&quot;{tarefaParaExcluir.titulo}&quot;</span>?
                Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTarefaParaExcluir(null)}
                className="px-4 py-2 rounded-lg border border-slate-600 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  // Capturamos o id antes de fechar pra não perder a referência
                  // caso o estado seja zerado antes da chamada (paranoia).
                  const idParaExcluir = tarefaParaExcluir.id;
                  setTarefaParaExcluir(null);
                  onDeleteTarefa(idParaExcluir);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-semibold text-white transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </Modal>
      )}
      <TaskBlockReasonModal
        isOpen={tarefaParaBloquear !== null}
        taskTitle={tarefaParaBloquear?.titulo}
        value={motivoBloqueio}
        onChange={setMotivoBloqueio}
        onClose={closeBlockReasonModal}
        onConfirm={confirmBlockReason}
      />
    </div>
  );
};

// ── DetalhePrioridade (não usado diretamente na nova visão, mantido por compatibilidade) ──

const DetalhePrioridade: React.FC<{
  prioridade: Prioridade;
  planos: PlanoDeAcao[];
  todasTarefas: Tarefa[];
  responsaveis: Responsavel[];
  computeStatusPlano: (id: string) => StatusPlano | null;
  onBack: () => void;
  onUpdatePrioridade: (u: Partial<Prioridade>) => void;
  onAddPlano: (p: Omit<PlanoDeAcao, 'id' | 'prioridade_id'>) => void;
  onUpdatePlano: (id: string, u: Partial<PlanoDeAcao>) => void;
  onDeletePlano: (id: string) => void;
  onAddTarefa: (t: Omit<Tarefa, 'id'>) => void;
  onUpdateTarefa: (id: string, u: Partial<Tarefa>) => void;
  onDeleteTarefa: (id: string) => void;
}> = ({
  prioridade,
  planos,
  todasTarefas,
  responsaveis,
  computeStatusPlano,
  onBack,
  onAddPlano,
  onUpdatePlano,
  onDeletePlano,
  onAddTarefa,
  onUpdateTarefa,
  onDeleteTarefa,
}) => {
  const [showAddPlano, setShowAddPlano] = useState(false);
  const [novoPlano, setNovoPlano] = useState({
    titulo: '',
    who_id: responsaveis[0]?.id ?? '',
    when_fim: '',
  });

  const dono = responsaveis.find((r) => r.id === prioridade.dono_id);
  const tarefasDoPrio = todasTarefas.filter((t) => planos.some((p) => p.id === t.plano_id));
  const tarefasConc = tarefasDoPrio.filter((t) => t.status_tarefa === 'Concluida');
  const statusCfg = STATUS_CFG[prioridade.status_prioridade as StatusPlano] || STATUS_CFG.Execucao;

  const handleAddPlano = () => {
    if (!novoPlano.titulo.trim()) return;
    onAddPlano({
      titulo: novoPlano.titulo.trim(),
      what: '', why: '',
      who_id: novoPlano.who_id || responsaveis[0]?.id || '',
      when_inicio: Date.now(),
      when_fim: novoPlano.when_fim ? tsFromDateInput(novoPlano.when_fim) : Date.now() + 30 * 86400000,
      how: '', status_plano: 'Execucao',
      created_by: prioridade.created_by ?? '',
    });
    setNovoPlano({ titulo: '', who_id: responsaveis[0]?.id ?? '', when_fim: '' });
    setShowAddPlano(false);
  };

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
        <ArrowLeft size={16} /> Prioridades Estratégicas
      </button>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-widest flex items-center gap-1"><Target size={9} /> PRIORIDADE ATIVA</p>
            <h2 className="text-xl font-bold text-slate-100">{prioridade.titulo}</h2>
            <div className="flex items-center gap-3 mt-2 text-[12px] text-slate-400 flex-wrap">
              {dono && <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-slate-700 text-slate-300 text-[9px] font-bold flex items-center justify-center">{initials(dono.nome)}</span> {dono.nome}</span>}
              <span>Meta: {fmtDate(prioridade.data_alvo)}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusCfg.cls}`}>{statusCfg.label}</span>
            </div>
          </div>
          <div className="flex items-center gap-6 shrink-0">
            <div className="text-center"><p className="text-2xl font-bold text-slate-100 tabular-nums">{planos.length}</p><p className="text-[11px] text-slate-500">planos de ataque</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-emerald-400 tabular-nums">{tarefasConc.length}/{tarefasDoPrio.length}</p><p className="text-[11px] text-slate-500">tarefas concluídas</p></div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Planos de Ação</p>
          <button type="button" onClick={() => setShowAddPlano((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition-colors">
            <Plus size={13} /> Novo Plano
          </button>
        </div>

        {showAddPlano && (
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Título do Plano *</label>
              <input autoFocus value={novoPlano.titulo} onChange={(e) => setNovoPlano((v) => ({ ...v, titulo: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddPlano(); if (e.key === 'Escape') setShowAddPlano(false); }}
                placeholder="Ex.: Pesquisa e validação de mercado..." className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60 placeholder:text-slate-600" />
            </div>
            <div className="min-w-[160px] max-w-[240px]">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">
                Responsável
              </label>
              <ResponsavelAutocomplete
                responsaveis={responsaveis}
                valueId={novoPlano.who_id}
                onCommit={(id) => setNovoPlano((v) => ({ ...v, who_id: id }))}
                placeholder="Buscar no cadastro..."
              />
            </div>
            <div className="min-w-[130px]">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Prazo</label>
              <input type="date" value={novoPlano.when_fim} onChange={(e) => setNovoPlano((v) => ({ ...v, when_fim: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-200 outline-none focus:border-slate-600 cursor-pointer appearance-none" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleAddPlano} disabled={!novoPlano.titulo.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">Criar</button>
              <button type="button" onClick={() => setShowAddPlano(false)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-colors">Cancelar</button>
            </div>
          </div>
        )}

        {planos.length === 0 && !showAddPlano && (
                  <div className="py-10 text-center text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">Nenhum plano de ação ainda. Clique em &quot;Novo Plano&quot; para começar.</div>
        )}

        {planos.map((plano) => (
          <PlanoCard
            key={plano.id}
            plano={plano}
            tarefas={todasTarefas.filter((t) => t.plano_id === plano.id)}
            responsaveis={responsaveis}
            computeStatusPlano={computeStatusPlano}
            onUpdate={(u) => onUpdatePlano(plano.id, u)}
            onDelete={() => onDeletePlano(plano.id)}
            onAddTarefa={onAddTarefa}
            onUpdateTarefa={onUpdateTarefa}
            onDeleteTarefa={onDeleteTarefa}
            whoOverrideName={dono?.nome ?? prioridade.dono_id}
            lockWhoToOverrideName={false}
            prioridadeDonoId={prioridade.dono_id}
            viewerIsAdmin={true}
            allUsers={responsaveis.map((r) => ({ id: r.id, label: r.nome }))}
          />
        ))}
      </div>
    </div>
  );
};

// ── PrioridadeCard (nova visão em card, com planos e tarefas em cascata) ────

const PrioridadeCard: React.FC<{
  prioridade: Prioridade;
  planos: PlanoDeAcao[];
  todasTarefas: Tarefa[];
  responsaveis: Responsavel[];
  whoUsers?: Responsavel[];
  computeStatusPlano: (id: string) => StatusPlano | null;
  expanded: boolean;
  onToggle: () => void;
  showDonoName?: boolean;
  /** Nome a ser usado para renderizar o WHO do plano (prioridade criadora) */
  priorityOwnerNameOverride?: string;
  lockPlanoWhoToPriorityDono?: boolean;
  /** Responsável padrão (quem está logado) ao criar planos */
  loggedUserResponsavelId?: string;
  /** Nome exibido do responsável (quem está logado) */
  loggedUserResponsavelNomeDisplay?: string;
  /** Admin: permite alterar o dono da prioridade (autocomplete no cabeçalho do card) */
  canEditResponsavel?: boolean;
  /** Permite atualizar o dono da prioridade (admin) */
  onUpdatePrioridadeOwner?: (ownerId: string) => void;
  /** Ação para arquivar a prioridade (status Concluido) */
  onArchive?: () => void;
  onAddPlano: (p: Omit<PlanoDeAcao, 'id' | 'prioridade_id'>) => void;
  onUpdatePlano: (id: string, u: Partial<PlanoDeAcao>) => void;
  onDeletePlano: (id: string) => void;
  onAddTarefa: (t: Omit<Tarefa, 'id'>) => void;
  onUpdateTarefa: (id: string, u: Partial<Tarefa>) => void;
  onDeleteTarefa: (id: string) => void;
  canPrioridadeWrite?: boolean;
  canPlanoWrite?: boolean;
  canPlanoDelete?: boolean;
  canTarefaWrite?: boolean;
  canTarefaAssign?: boolean;
  canTarefaDelete?: boolean;
  canEditPrazo?: boolean;
  viewerIsAdmin?: boolean;
  viewerMyResponsavelIds?: Set<string>;
  allUsers: Array<{ id: string; label: string }>;
  onAddObserver?: (entity: 'prioridade' | 'plano' | 'tarefa', entityId: string, userId: string) => void;
  onRemoveObserver?: (entity: 'prioridade' | 'plano' | 'tarefa', entityId: string, userId: string) => void;
  onOpenDetalhe?: (p: Prioridade) => void;
  canEditObservers?: boolean;
  perfisCadastro?: UserProfile[] | null;
}> = ({
  prioridade,
  planos,
  todasTarefas,
  responsaveis,
  whoUsers,
  computeStatusPlano,
  expanded,
  onToggle,
  showDonoName = false,
  priorityOwnerNameOverride,
  lockPlanoWhoToPriorityDono = false,
  loggedUserResponsavelId,
  loggedUserResponsavelNomeDisplay,
  canEditResponsavel = false,
  onUpdatePrioridadeOwner,
  onArchive,
  onAddPlano,
  onUpdatePlano,
  onDeletePlano,
  onAddTarefa,
  onUpdateTarefa,
  onDeleteTarefa,
  canPrioridadeWrite = true,
  canPlanoWrite = true,
  canPlanoDelete = true,
  canTarefaWrite = true,
  canTarefaAssign = true,
  canTarefaDelete = true,
  canEditPrazo = false,
  viewerIsAdmin = true,
  viewerMyResponsavelIds,
  allUsers,
  onAddObserver,
  onRemoveObserver,
  onOpenDetalhe,
  canEditObservers = true,
  perfisCadastro,
}) => {
  const whoPool = whoUsers && whoUsers.length > 0 ? whoUsers : responsaveis;
  const myViewerIds = viewerMyResponsavelIds ?? EMPTY_ID_SET;

  // O escopo de visibilidade de planos/tarefas já vem filtrado no App.
  // Evita duplo filtro local para não "sumir" planos de ataque intermitentemente no Tático.
  const planosVisiveis = planos;

  const [showAddPlano, setShowAddPlano] = useState(false);
  const [novoPlano, setNovoPlano] = useState({
    titulo: '',
    who_id: loggedUserResponsavelId ?? '',
    when_fim: todayDateBR(),
  });

  const [donoSaveFlash, setDonoSaveFlash] = useState(false);
  const donoSaveFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistDonoIfChanged = (id: string) => {
    const t = id.trim();
    if (!t) return;
    if (normStr(t) === normStr(prioridade.dono_id)) return;
    if (sameResponsavelReference(responsaveis, t, prioridade.dono_id)) return;
    onUpdatePrioridadeOwner?.(t);
    if (donoSaveFlashTimer.current) clearTimeout(donoSaveFlashTimer.current);
    setDonoSaveFlash(true);
    donoSaveFlashTimer.current = setTimeout(() => {
      setDonoSaveFlash(false);
      donoSaveFlashTimer.current = null;
    }, 1200);
  };

  useEffect(() => {
    return () => {
      if (donoSaveFlashTimer.current) clearTimeout(donoSaveFlashTimer.current);
    };
  }, []);

  const dono = responsaveis.find((r) => normStr(r.id) === normStr(prioridade.dono_id));
  const donoNomeLegivel =
    displayNomeDonoPrioridade(prioridade.dono_id, responsaveis, perfisCadastro) ||
    dono?.nome ||
    prioridade.dono_id ||
    '';
  const donoNomeDisplay =
    (priorityOwnerNameOverride && priorityOwnerNameOverride.trim()) || donoNomeLegivel;
  const statusCfg =
    STATUS_CFG[prioridade.status_prioridade as StatusPlano] || STATUS_CFG.Execucao;
  const acompanhaPrioridade =
    Array.isArray(prioridade.observadores) &&
    prioridade.observadores.some((o) => myViewerIds.has(normStr(o.user_id)));
  const planoWhoOverrideName =
    priorityOwnerNameOverride ?? donoNomeLegivel;

  const handleAddPlano = () => {
    if (!novoPlano.titulo.trim()) return;
    const parsedWhenFim = parseDateBR(novoPlano.when_fim);
    if (!parsedWhenFim) return;
    onAddPlano({
      titulo: novoPlano.titulo.trim(),
      what: '',
      why: '',
      who_id: novoPlano.who_id,
      when_inicio: Date.now(),
      when_fim: parsedWhenFim,
      how: '',
      status_plano: 'Execucao',
      created_by: loggedUserResponsavelId ?? prioridade.created_by ?? '',
    });
    setNovoPlano({
      titulo: '',
      who_id: loggedUserResponsavelId ?? '',
      when_fim: todayDateBR(),
    });
    setShowAddPlano(false);
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className="w-full px-4 py-4 flex items-start gap-3 hover:bg-slate-900/80 transition-colors text-left cursor-pointer"
      >
        <div className="mt-1 text-slate-500 shrink-0">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-widest flex items-center gap-1">
                <Target size={9} /> PRIORIDADE ATIVA
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDetalhe?.(prioridade);
                }}
                className="text-left text-lg font-bold text-slate-100 hover:text-blue-300 transition-colors cursor-pointer"
                title="Ver descrição"
              >
                {prioridade.titulo}
              </button>
              <div className="flex items-center gap-3 mt-1.5 text-[12px] text-slate-400 flex-wrap">
                {showDonoName && (
                  canPrioridadeWrite && canEditResponsavel && onUpdatePrioridadeOwner ? (
                    <div
                      className="flex flex-wrap items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <div className="w-[min(100%,220px)] min-w-[160px]">
                        <ResponsavelAutocomplete
                          responsaveis={responsaveis}
                          valueId={prioridade.dono_id}
                          onCommit={(id) => persistDonoIfChanged(id)}
                          placeholder="Classificar — buscar e selecionar..."
                        />
                      </div>
                      <span
                        className={`inline-flex shrink-0 w-5 h-5 items-center justify-center transition-opacity duration-200 ${
                          donoSaveFlash ? 'opacity-100' : 'opacity-0'
                        }`}
                        aria-live="polite"
                        title="Salvo"
                      >
                        <Check size={16} className="text-emerald-400" strokeWidth={2.5} />
                      </span>
                    </div>
                  ) : (
                    donoNomeDisplay.trim() && (
                      <span className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-slate-700 text-slate-300 text-[9px] font-bold flex items-center justify-center">
                          {initials(donoNomeDisplay)}
                        </span>
                        {donoNomeDisplay}
                      </span>
                    )
                  )
                )}
                <span>Meta: {fmtDate(prioridade.data_alvo)}</span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusCfg.cls}`}
                >
                  {statusCfg.label}
                </span>
                {acompanhaPrioridade && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-violet-300 bg-violet-500/10 border border-violet-500/30">
                    Acompanhando
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-100 tabular-nums">
                  {planosVisiveis.length}
                </p>
                <p className="text-[11px] text-slate-500">planos de ação</p>
              </div>
              {onArchive && canPrioridadeWrite && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchive();
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-amber-300 transition-colors"
                  title="Arquivar prioridade (marcar como concluída)"
                >
                  <Archive size={13} />
                  Arquivar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-800 p-4 pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Planos de Ação
            </p>
            {canPlanoWrite && (
              <button
                type="button"
                onClick={() => {
                  setShowAddPlano((v) => {
                    const next = !v;
                    if (next) {
                      setNovoPlano({
                        titulo: '',
                        who_id: loggedUserResponsavelId ?? '',
                        when_fim: todayDateBR(),
                      });
                    }
                    return next;
                  });
                }}
                className="flex items-center gap-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus size={13} /> Novo Plano
              </button>
            )}
          </div>

          {showAddPlano && canPlanoWrite && (
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">
                  Título do Plano *
                </label>
                <input
                  autoFocus
                  value={novoPlano.titulo}
                  onChange={(e) =>
                    setNovoPlano((v) => ({ ...v, titulo: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddPlano();
                    if (e.key === 'Escape') setShowAddPlano(false);
                  }}
                  placeholder="Ex.: Pesquisa e validação de mercado..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60 placeholder:text-slate-600"
                />
              </div>
              <div className="min-w-[160px] max-w-[240px]">
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">
                  Responsável
                </label>
                <ResponsavelAutocomplete
                  responsaveis={whoPool}
                  valueId={novoPlano.who_id}
                  onCommit={(id) => setNovoPlano((prev) => ({ ...prev, who_id: id }))}
                  placeholder="Buscar no cadastro..."
                />
              </div>
              <div className="min-w-[130px]">
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">
                  Prazo
                </label>
                <input
                  value={novoPlano.when_fim}
                  onChange={(e) => setNovoPlano((v) => ({ ...v, when_fim: e.target.value }))}
                  placeholder="dd/mm/yyyy"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-200 outline-none focus:border-slate-600 placeholder:text-slate-600"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAddPlano}
                  disabled={!novoPlano.titulo.trim() || !parseDateBR(novoPlano.when_fim) || !novoPlano.who_id.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Criar
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddPlano(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {planosVisiveis.length === 0 && !showAddPlano && (
            <div className="py-6 text-center text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
              Nenhum plano de ação ainda. Clique em &quot;Novo Plano&quot; para começar.
            </div>
          )}

          <div className="space-y-3 pt-1">
            {planosVisiveis.map((plano) => (
              <PlanoCard
                key={plano.id}
                plano={plano}
                tarefas={todasTarefas.filter((t) => t.plano_id === plano.id)}
                responsaveis={responsaveis}
                whoUsers={whoPool}
                computeStatusPlano={computeStatusPlano}
                onUpdate={(u) => onUpdatePlano(plano.id, u)}
                onDelete={() => onDeletePlano(plano.id)}
                onAddTarefa={onAddTarefa}
                onUpdateTarefa={onUpdateTarefa}
                onDeleteTarefa={onDeleteTarefa}
                whoOverrideName={planoWhoOverrideName}
                lockWhoToOverrideName={lockPlanoWhoToPriorityDono}
                loggedUserResponsavelId={loggedUserResponsavelId}
                loggedUserResponsavelNomeDisplay={loggedUserResponsavelNomeDisplay}
                canWritePlano={canPlanoWrite}
                canDeletePlano={canPlanoDelete}
                canWriteTarefa={canTarefaWrite}
                canAssignTarefa={canTarefaAssign}
                canDeleteTarefa={canTarefaDelete}
                canEditPrazo={canEditPrazo}
                prioridadeDonoId={prioridade.dono_id}
                viewerIsAdmin={viewerIsAdmin}
                viewerMyResponsavelIds={myViewerIds}
                allUsers={allUsers}
                onAddObserver={onAddObserver}
                onRemoveObserver={onRemoveObserver}
                canEditObservers={canEditObservers}
                perfisCadastro={perfisCadastro}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── EstrategicoView (export principal) ───────────────────────────────────────

export const EstrategicoView: React.FC<EstrategicoViewProps> = (props) => {
  const {
    prioridades,
    planos,
    tarefas,
    responsaveis,
    whoUsers,
    observerUsers,
    computeStatusPlano,
    onUpdatePrioridade,
    onAddPlano,
    onUpdatePlano,
    onDeletePlano,
    onAddTarefa,
    onUpdateTarefa,
    onDeleteTarefa,
    onAddObserver,
    onRemoveObserver,
    loggedUserUid,
    loggedUserRole,
    loggedUserName,
    loggedUserEmail,
    loggedUserDisplayName,
    focusPrioridadeId,
    focusCardId,
    onFocusConsumed,
    onlyPrioridadeId,
    estrategicoCaps,
    perfisCadastro,
  } = props;

  const caps = {
    prioridadeWrite: estrategicoCaps?.prioridadeWrite !== false,
    planoWrite: estrategicoCaps?.planoWrite !== false,
    planoDelete: estrategicoCaps?.planoDelete !== false,
    verTodosPlanos: estrategicoCaps?.verTodosPlanos === true,
    tarefaWrite: estrategicoCaps?.tarefaWrite !== false,
    tarefaAssign: estrategicoCaps?.tarefaAssign !== false,
    tarefaDelete: estrategicoCaps?.tarefaDelete !== false,
    tarefaEditPrazo: estrategicoCaps?.tarefaEditPrazo === true,
    observerEdit: estrategicoCaps?.observerEdit !== false,
  };
  const whoPool = whoUsers && whoUsers.length > 0 ? whoUsers : responsaveis;
  const observerPool = observerUsers && observerUsers.length > 0 ? observerUsers : responsaveis;

  /** Admin/gerente: vê tudo e destrava WHO do plano; demais usuários seguem dono da prioridade nos planos. */
  const isAdmin = loggedUserRole === 'administrador' || loggedUserRole === 'gerente';
  /** Lista ampla: administrador ou permissão explícita no Tático. */
  const seesAllPrioridades =
    loggedUserRole === 'administrador' || caps.verTodosPlanos;
  const viewerSeesAllTarefasNoPlano =
    loggedUserRole === 'administrador' || caps.verTodosPlanos;
  const [expandedByPrioridade, setExpandedByPrioridade] = useState<Record<string, boolean>>({});
  /** Mesmo padrão Operacional: multi-seleção independente; vazio = sem refino extra nesta camada */
  const [taticoVisibilityFilters, setTaticoVisibilityFilters] = useState<VisibilityFilter[]>([]);
  const [visFilters, setVisFilters] = useState<VisibilityFilter[]>([]);
  const [detalheAberto, setDetalheAberto] = useState<Prioridade | null>(null);

  useEffect(() => {
    const targetId = focusCardId || focusPrioridadeId;
    if (!targetId) return;
    const doFocus = () => {
      const el = document.querySelector(`[data-prioridade-id="${targetId}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      setExpandedByPrioridade((prev) => ({ ...prev, [targetId]: true }));
      onFocusConsumed?.();
    };
    // Delay to allow React state update (new prioridade) to render before querying DOM
    const t = setTimeout(doFocus, 300);
    return () => clearTimeout(t);
  }, [focusPrioridadeId, focusCardId, onFocusConsumed]);

  const myResponsavelIds = useMemo(
    () =>
      responsavelIdsForLoggedUser(loggedUserUid, loggedUserName, responsaveis, {
        email: loggedUserEmail,
        displayName: loggedUserDisplayName,
      }),
    [loggedUserUid, loggedUserName, loggedUserEmail, loggedUserDisplayName, responsaveis],
  );

  const loggedUserResponsavelId = useMemo(() => {
    if (loggedUserUid) {
      const byUid = responsaveis.find((r) => normStr(r.id) === normStr(loggedUserUid));
      if (byUid) return byUid.id;
    }
    const matchByName = loggedUserName
      ? responsaveis.find((r) => normStr(r.nome) === normStr(loggedUserName))
      : undefined;
    return matchByName?.id ?? (loggedUserName?.trim() || loggedUserUid || '');
  }, [loggedUserName, loggedUserUid, responsaveis]);

  const loggedUserResponsavelNomeDisplay = loggedUserName ?? '';

  /**
   * As prioridades chegam aqui já filtradas por workspace e por visibilidade
   * (criador / dono / observador / planos atribuídos / tarefas atribuídas) no `App.tsx`.
   * Filtrar de novo aqui sem considerar `created_by` causava sumiço dos planos
   * recém-criados após refresh. Mantemos apenas a passthrough — os filtros
   * visuais "lançados por mim / atribuídos / acompanho" continuam aplicados em `ativas`.
   */
  const filteredPrioridades = useMemo(() => prioridades, [prioridades]);

  const ativas = useMemo(() => {
    let list = filteredPrioridades.filter((p) => p.status_prioridade !== 'Concluido');
    if (!seesAllPrioridades && myResponsavelIds.size > 0) {
      list = list.filter((p) => {
        const uid = normStr(loggedUserUid ?? '');
        // "Lançado por mim" inclui prioridade, plano OU tarefa criados por mim
        // (evita sumir prioridade onde só criei plano/tarefa para outra pessoa).
        const lanzadosPorMim =
          !!uid &&
          (normStr(p.created_by) === uid ||
            planos.some(
              (pl) => pl.prioridade_id === p.id && normStr(pl.created_by) === uid,
            ) ||
            tarefas.some((t) => {
              if (normStr(t.created_by) !== uid) return false;
              const pl = planos.find((x) => x.id === t.plano_id);
              return pl?.prioridade_id === p.id;
            }));

        const atribuidoParaMim =
          donoPrioridadeCorrespondeAoUsuario(p.dono_id, myResponsavelIds, responsaveis) ||
          planos.some(
            (pl) =>
              pl.prioridade_id === p.id &&
              donoPrioridadeCorrespondeAoUsuario(pl.who_id, myResponsavelIds, responsaveis),
          ) ||
          tarefas.some((t) => {
            if (!tarefaAtribuidaAoUsuario(t, myResponsavelIds, responsaveis)) return false;
            const pl = planos.find((x) => x.id === t.plano_id);
            return pl?.prioridade_id === p.id;
          });

        const itensQueAcompanho =
          (Array.isArray(p.observadores) &&
            p.observadores.some((o) => myResponsavelIds.has(normStr(o.user_id)))) ||
          planos.some(
            (pl) =>
              pl.prioridade_id === p.id &&
              canViewByOwnershipOrObserver([], pl.observadores, myResponsavelIds, responsaveis),
          ) ||
          tarefas.some((t) => {
            if (tarefaAtribuidaAoUsuario(t, myResponsavelIds, responsaveis)) return false;
            if (
              !canViewByOwnershipOrObserver(
                [t.responsavel_id],
                t.observadores,
                myResponsavelIds,
                responsaveis,
              )
            )
              return false;
            const pl = planos.find((x) => x.id === t.plano_id);
            return pl?.prioridade_id === p.id;
          });

        if (taticoVisibilityFilters.length === 0) {
          return lanzadosPorMim || atribuidoParaMim || itensQueAcompanho;
        }

        const matchCreated =
          taticoVisibilityFilters.includes('created') && lanzadosPorMim;
        const matchAssigned =
          taticoVisibilityFilters.includes('assigned') && atribuidoParaMim;
        const matchObserving =
          taticoVisibilityFilters.includes('observing') && itensQueAcompanho;

        return matchCreated || matchAssigned || matchObserving;
      });
    }
    if (!onlyPrioridadeId) return list;
    list = list.filter((p) => p.id === onlyPrioridadeId);
    if (isAdmin || visFilters.length === 0) return list;
    const currentUid = loggedUserUid ?? '';
    return list.filter((p) => {
      const isCreator = p.created_by === currentUid;
      const isOwner = p.dono_id === currentUid;
      const isObserver = (p.observadores ?? []).some((o) => o.user_id === currentUid);
      return (
        (visFilters.includes('created') && isCreator) ||
        (visFilters.includes('assigned') && isOwner) ||
        (visFilters.includes('observing') && isObserver)
      );
    });
  }, [
    filteredPrioridades,
    onlyPrioridadeId,
    myResponsavelIds,
    responsaveis,
    planos,
    tarefas,
    taticoVisibilityFilters,
    isAdmin,
    visFilters,
    loggedUserUid,
  ]);

  useEffect(() => {
    const ids = new Set(ativas.map((p) => p.id));
    setExpandedByPrioridade((prev) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      for (const [id, val] of Object.entries(prev)) {
        if (ids.has(id)) next[id] = Boolean(val);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [ativas]);

  const blocksRef = useRef<HTMLDivElement>(null);
  const scrollToBlocks = () => {
    blocksRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-0.5">
          <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-widest">
            VISÃO EXECUTIVA
          </p>
          <h2 className="text-2xl font-bold text-slate-100">Prioridades Estratégicas</h2>
        </div>
        <div className="inline-flex flex-wrap items-center gap-2 justify-end">
          <button
            type="button"
            onClick={() => setTaticoVisibilityFilters((prev) => toggleVisibilityFilter(prev, 'created'))}
            className={`px-2.5 py-1 text-[11px] rounded-md transition-colors border ${
              taticoVisibilityFilters.includes('created')
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:text-slate-100'
            }`}
          >
            lançados por mim
          </button>
          <button
            type="button"
            onClick={() => setTaticoVisibilityFilters((prev) => toggleVisibilityFilter(prev, 'assigned'))}
            className={`px-2.5 py-1 text-[11px] rounded-md transition-colors border ${
              taticoVisibilityFilters.includes('assigned')
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:text-slate-100'
            }`}
          >
            atribuídos para mim
          </button>
          <button
            type="button"
            onClick={() => setTaticoVisibilityFilters((prev) => toggleVisibilityFilter(prev, 'observing'))}
            className={`px-2.5 py-1 text-[11px] rounded-md transition-colors border ${
              taticoVisibilityFilters.includes('observing')
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:text-slate-100'
            }`}
          >
            itens que eu acompanho
          </button>
        </div>
        <button
          type="button"
          onClick={scrollToBlocks}
          className="shrink-0 p-1 rounded-md text-blue-400 hover:text-blue-300 transition-colors"
          aria-label="Ir para prioridades"
          title="Ir para prioridades"
        >
          <EstrategicoGridIcon size={18} strokeWidth={2} />
        </button>
      </div>
      {!isAdmin && <VisibilityFilterBar active={visFilters} onChange={setVisFilters} />}

      <div ref={blocksRef} className="space-y-4">
        {ativas.length === 0 ? (
          <div className="px-5 py-12 text-center text-slate-500 text-sm border border-slate-800/60 rounded-xl bg-slate-900/30">
            Nenhuma prioridade ativa {seesAllPrioridades ? 'disponível.' : 'para você.'}
          </div>
        ) : (
          ativas.map((p) => {
            const nomeDono = displayNomeDonoPrioridade(p.dono_id, responsaveis, perfisCadastro);
            const priorityOwnerNameOverride =
              nomeDono ||
              (seesAllPrioridades ? p.dono_id : (loggedUserName ?? p.dono_id));
            const souDonoDestaPrioridade = donoPrioridadeCorrespondeAoUsuario(
              p.dono_id,
              myResponsavelIds,
              responsaveis,
            );
            /** Dono de prioridade originada do backlog é imutável (autor da demanda). */
            const canEditDonoNoTatico = caps.prioridadeWrite && !p.origem_backlog_id;
            const isLegacyPrioridade = p.id.startsWith('legacy-');
            return (
              <div key={p.id} id={`prioridade-card-${p.id}`} data-prioridade-id={p.id}>
                <PrioridadeCard
                  prioridade={p}
                  planos={planos.filter((pl) => pl.prioridade_id === p.id)}
                  todasTarefas={tarefas}
                  responsaveis={responsaveis}
                  whoUsers={whoPool}
                  computeStatusPlano={computeStatusPlano}
                  expanded={expandedByPrioridade[p.id] ?? true}
                  onToggle={() =>
                    setExpandedByPrioridade((prev) => ({
                      ...prev,
                      [p.id]: !(prev[p.id] ?? true),
                    }))
                  }
                  showDonoName
                  priorityOwnerNameOverride={priorityOwnerNameOverride}
                  lockPlanoWhoToPriorityDono={!isAdmin}
                  loggedUserResponsavelId={loggedUserResponsavelId}
                  loggedUserResponsavelNomeDisplay={loggedUserResponsavelNomeDisplay}
                  canEditResponsavel={canEditDonoNoTatico && !isLegacyPrioridade}
                  onUpdatePrioridadeOwner={
                    onUpdatePrioridade && !isLegacyPrioridade
                      ? (ownerId) => onUpdatePrioridade(p.id, { dono_id: ownerId })
                      : undefined
                  }
                  onArchive={
                    onUpdatePrioridade && !isLegacyPrioridade
                      ? () => onUpdatePrioridade(p.id, { status_prioridade: 'Concluido' })
                      : undefined
                  }
                  onAddPlano={(pl) =>
                    onAddPlano({ ...pl, prioridade_id: p.id, empresa: p.empresa })
                  }
                  onUpdatePlano={onUpdatePlano}
                  onDeletePlano={onDeletePlano}
                  onAddTarefa={onAddTarefa}
                  onUpdateTarefa={onUpdateTarefa}
                  onDeleteTarefa={onDeleteTarefa}
                  canPrioridadeWrite={caps.prioridadeWrite && !isLegacyPrioridade}
                  canPlanoWrite={caps.planoWrite}
                  canPlanoDelete={caps.planoDelete}
                  canTarefaWrite={caps.tarefaWrite}
                  canTarefaAssign={caps.tarefaAssign}
                  canTarefaDelete={caps.tarefaDelete}
                  canEditPrazo={caps.tarefaEditPrazo}
                  viewerIsAdmin={viewerSeesAllTarefasNoPlano}
                  viewerMyResponsavelIds={myResponsavelIds}
                  allUsers={observerPool.map((r) => ({ id: r.id, label: r.nome }))}
                  onAddObserver={onAddObserver}
                  onRemoveObserver={onRemoveObserver}
                  onOpenDetalhe={setDetalheAberto}
                  canEditObservers={caps.observerEdit}
                  perfisCadastro={perfisCadastro}
                />
              </div>
            );
          })
        )}
      </div>
      {detalheAberto && (
        <Modal
          isOpen
          onClose={() => setDetalheAberto(null)}
          title={detalheAberto.titulo}
          maxWidth="lg"
        >
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Descrição</p>
              <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                {detalheAberto.descricao || 'Sem descrição cadastrada.'}
              </p>
            </div>
            {detalheAberto.dono_id && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Dono</p>
                <p className="text-sm text-slate-200">
                  {displayNomeDonoPrioridade(detalheAberto.dono_id, responsaveis, perfisCadastro) ||
                    detalheAberto.dono_id}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Prazo</p>
              <p className="text-sm text-slate-200">
                {new Date(detalheAberto.data_alvo).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
