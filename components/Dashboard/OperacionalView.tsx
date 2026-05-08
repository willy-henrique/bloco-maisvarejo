import React, { useEffect, useMemo, useState } from 'react';
import type { PlanoDeAcao, Prioridade, Responsavel, Tarefa, StatusPlano, StatusTarefa } from '../../types';
import type { UserRole as UserRoleType } from '../../types/user';
import { CheckCircle, Play, Circle, AlertTriangle, Plus, ChevronDown, ChevronRight, Trash2, User, Calendar, Target, FileText, Eye, ExternalLink, X, Building2, Layers, ClipboardList } from 'lucide-react';
import { Modal } from '../Shared/Modal';
import { ResponsavelAutocomplete } from './ResponsavelAutocomplete';
import {
  responsavelIdsForLoggedUser,
  donoPrioridadeCorrespondeAoUsuario,
  displayNomeDonoPrioridade,
} from './responsavelSearchUtils';
import { canViewByOwnershipOrObserver, tarefaAtribuidaAoUsuario } from './taskAssignmentUtils';
import { ObserversPanel } from './ObserversPanel';
import { TaskBlockReasonModal } from './TaskBlockReasonModal';
import { apiGetBlockContext } from '../../services/ritmoCollabApi';
import { type VisibilityFilter } from '../Shared/VisibilityFilterBar';

// Utilidades
function tsFromDateInput(v: string): number {
  return new Date(v + 'T12:00:00').getTime();
}

function dateInputValue(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function formatDateBR(ts: number): string {
  return new Date(ts).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function parseDateBR(v: string): number | null {
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

function shortId(id: string): string {
  const clean = id.startsWith('legacy-') ? id.slice(7) : id;
  return '#' + clean.replace(/-/g, '').slice(0, 6).toUpperCase();
}

function normStr(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

function todayDateBR(): string {
  return formatDateBR(Date.now());
}

function fmtDate(ts: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(ts));
}

const STATUS_CFG: Record<StatusPlano, { label: string; cls: string }> = {
  Execucao: { label: 'Em Execução', cls: 'text-blue-400 bg-blue-500/10 border border-blue-500/30' },
  Bloqueado: { label: 'Bloqueado', cls: 'text-red-400 bg-red-500/10 border border-red-500/30' },
  Concluido: { label: 'Concluído', cls: 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/30' },
};

const TAREFA_ORDER: StatusTarefa[] = ['Pendente', 'EmExecucao', 'Bloqueada', 'Concluida'];

const TAREFA_CFG: Record<StatusTarefa, { label: string; cls: string; Icon: React.ElementType }> = {
  Concluida: { label: 'CONCLUÍDA', cls: 'text-emerald-400 bg-emerald-500/15', Icon: CheckCircle },
  EmExecucao: { label: 'EM EXECUÇÃO', cls: 'text-emerald-400 bg-emerald-500/15', Icon: Play },
  Pendente: { label: 'PENDENTE', cls: 'text-slate-400 bg-slate-700/60', Icon: Circle },
  Bloqueada: { label: 'BLOQUEADA', cls: 'text-red-400 bg-red-500/15', Icon: AlertTriangle },
};

export type OperacionalCaps = {
  planoWrite?: boolean;
  tarefaWrite?: boolean;
  tarefaAssign?: boolean;
  tarefaDelete?: boolean;
  tarefaEditPrazo?: boolean;
  observerEdit?: boolean;
};

type OperacionalProps = {
  prioridades: Prioridade[];
  planos: PlanoDeAcao[];
  tarefas: Tarefa[];
  responsaveis: Responsavel[];
  whoUsers?: Responsavel[];
  observerUsers?: Responsavel[];
  computeStatusPlano: (planoId: string) => StatusPlano | null;
  loggedUserUid?: string | null;
  loggedUserName?: string | null;
  loggedUserEmail?: string | null;
  loggedUserDisplayName?: string | null;
  loggedUserRole?: UserRoleType | null;
  onAddTarefa: (t: Omit<Tarefa, 'id'>) => void;
  onUpdateTarefa: (id: string, u: Partial<Tarefa>) => void;
  onDeleteTarefa: (id: string) => void;
  onAddObserver?: (entity: 'prioridade' | 'plano' | 'tarefa', entityId: string, userId: string) => void;
  onRemoveObserver?: (entity: 'prioridade' | 'plano' | 'tarefa', entityId: string, userId: string) => void;
  onUpdatePlano: (id: string, u: Partial<PlanoDeAcao>) => void;
  onDeletePlano: (id: string) => void;
  operacionalCaps?: OperacionalCaps;
};

// ─── Drawer de detalhes da tarefa ───────────────────────────────────────────

const TarefaDetailDrawer: React.FC<{
  tarefa: Tarefa | null;
  plano: PlanoDeAcao | null;
  prioridade: Prioridade | null;
  responsaveis: Responsavel[];
  onClose: () => void;
  onUpdate?: (u: Partial<Tarefa>) => void;
  canWrite?: boolean;
  canAssign?: boolean;
  canEditPrazo?: boolean;
}> = ({ tarefa, plano, prioridade, responsaveis, onClose, onUpdate, canWrite = false, canAssign = false, canEditPrazo = false }) => {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [status, setStatus] = useState<StatusTarefa>('Pendente');
  const [responsavelId, setResponsavelId] = useState('');
  const [prazo, setPrazo] = useState('');
  const [motivoBloqueio, setMotivoBloqueio] = useState('');
  const [editingTitulo, setEditingTitulo] = useState(false);
  const [editingDescricao, setEditingDescricao] = useState(false);

  useEffect(() => {
    if (!tarefa) return;
    setTitulo(tarefa.titulo);
    setDescricao(tarefa.descricao ?? '');
    setStatus(tarefa.status_tarefa);
    setResponsavelId(tarefa.responsavel_id);
    setPrazo(dateInputValue(tarefa.data_vencimento));
    setMotivoBloqueio(tarefa.bloqueio_motivo ?? '');
    setEditingTitulo(false);
    setEditingDescricao(false);
  }, [tarefa?.id]);

  if (!tarefa) return null;

  const commit = (patch: Partial<Tarefa>) => onUpdate?.(patch);

  const handleStatusChange = (next: StatusTarefa) => {
    setStatus(next);
    const patch: Partial<Tarefa> = {
      status_tarefa: next,
      ...(next === 'Concluida' ? { data_conclusao: Date.now() } : {}),
      ...(next !== 'Bloqueada' ? { bloqueio_motivo: undefined } : {}),
    };
    commit(patch);
  };

  const handlePrazoBlur = () => {
    const ts = parseDateBR(prazo);
    if (ts && ts !== tarefa.data_vencimento) commit({ data_vencimento: ts });
    else setPrazo(dateInputValue(tarefa.data_vencimento));
  };

  const isConcluida = tarefa.status_tarefa === 'Concluida';
  const isOverdue = tarefa.data_vencimento < Date.now() && !isConcluida;
  const cfg = TAREFA_CFG[tarefa.status_tarefa] || TAREFA_CFG.Pendente;
  const respNome = displayNomeDonoPrioridade(tarefa.responsavel_id, responsaveis) || tarefa.responsavel_id || '—';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md z-50 bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} className="text-slate-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Detalhes da tarefa</span>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* título */}
          <div className="space-y-2">
            {canWrite && editingTitulo ? (
              <input
                autoFocus
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                onBlur={() => {
                  const t = titulo.trim();
                  if (t && t !== tarefa.titulo) commit({ titulo: t });
                  else setTitulo(tarefa.titulo);
                  setEditingTitulo(false);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setTitulo(tarefa.titulo); setEditingTitulo(false); } }}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-base font-semibold text-slate-100 outline-none focus:border-blue-500/60"
              />
            ) : (
              <p
                onClick={() => canWrite && setEditingTitulo(true)}
                className={`text-base font-semibold leading-snug ${isConcluida ? 'line-through text-slate-400' : 'text-slate-100'} ${canWrite ? 'cursor-text hover:bg-slate-800/50 rounded px-1 -mx-1 transition-colors' : ''}`}
              >
                {tarefa.titulo}
              </p>
            )}

            {/* descrição */}
            {canWrite && editingDescricao ? (
              <textarea
                autoFocus
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                onBlur={() => {
                  const d = descricao.trim();
                  if (d !== (tarefa.descricao ?? '').trim()) commit({ descricao: d });
                  setEditingDescricao(false);
                }}
                onKeyDown={(e) => { if (e.key === 'Escape') { setDescricao(tarefa.descricao ?? ''); setEditingDescricao(false); } }}
                rows={3}
                placeholder="Adicionar descrição..."
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/60 resize-none"
              />
            ) : (
              <p
                onClick={() => canWrite && setEditingDescricao(true)}
                className={`text-sm leading-relaxed ${tarefa.descricao ? 'text-slate-400' : 'text-slate-600 italic'} ${canWrite ? 'cursor-text hover:bg-slate-800/50 rounded px-1 -mx-1 transition-colors' : ''}`}
              >
                {tarefa.descricao || (canWrite ? 'Adicionar descrição...' : '')}
              </p>
            )}

            {/* status */}
            <div className="flex items-center gap-2 pt-1">
              {canWrite ? (
                <select
                  value={status}
                  onChange={(e) => handleStatusChange(e.target.value as StatusTarefa)}
                  className={`text-[10px] font-semibold px-2 py-1 rounded-full uppercase border-0 outline-none cursor-pointer ${cfg.cls}`}
                >
                  <option value="Pendente">PENDENTE</option>
                  <option value="EmExecucao">EM EXECUÇÃO</option>
                  <option value="Bloqueada">BLOQUEADA</option>
                  <option value="Concluida">CONCLUÍDA</option>
                </select>
              ) : (
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full uppercase ${cfg.cls}`}>
                  <cfg.Icon size={10} /> {cfg.label}
                </span>
              )}
            </div>

            {/* motivo bloqueio */}
            {tarefa.status_tarefa === 'Bloqueada' && (
              canWrite ? (
                <input
                  value={motivoBloqueio}
                  onChange={(e) => setMotivoBloqueio(e.target.value)}
                  onBlur={() => commit({ bloqueio_motivo: motivoBloqueio.trim() || undefined })}
                  placeholder="Motivo do bloqueio..."
                  className="w-full bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5 text-xs text-red-300 outline-none focus:border-red-500/40 placeholder:text-red-500/40"
                />
              ) : tarefa.bloqueio_motivo ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-red-400/90 bg-red-500/10 px-2 py-1 rounded-full">
                  <AlertTriangle size={9} /> {tarefa.bloqueio_motivo}
                </span>
              ) : null
            )}
          </div>

          {/* responsável + prazo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 space-y-1.5">
              <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Responsável</p>
              {canAssign ? (
                <ResponsavelAutocomplete
                  responsaveis={responsaveis}
                  valueId={responsavelId}
                  onCommit={(id) => { setResponsavelId(id); commit({ responsavel_id: id }); }}
                  placeholder="Buscar..."
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <User size={12} className="text-slate-400 shrink-0" />
                  <span className="text-sm text-slate-200">{respNome}</span>
                </div>
              )}
            </div>
            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 space-y-1.5">
              <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Prazo</p>
              {canEditPrazo ? (
                <input
                  value={prazo}
                  onChange={(e) => setPrazo(e.target.value)}
                  onBlur={handlePrazoBlur}
                  placeholder="dd/mm/aaaa"
                  className="w-full bg-transparent text-sm text-slate-200 outline-none border-b border-slate-700 focus:border-blue-500/60 pb-0.5"
                />
              ) : (
                <div className={`flex items-center gap-1.5 ${isOverdue ? 'text-red-400' : isConcluida ? 'text-slate-400' : 'text-slate-200'}`}>
                  <Calendar size={12} className="shrink-0" />
                  <span className="text-sm">{fmtDate(tarefa.data_vencimento)}</span>
                </div>
              )}
            </div>
            {isConcluida && tarefa.data_conclusao && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 space-y-1 col-span-2">
                <p className="text-[9px] uppercase tracking-wider text-emerald-500/70 font-semibold">Concluída em</p>
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle size={12} className="shrink-0" />
                  <span className="text-sm">{fmtDate(tarefa.data_conclusao)}</span>
                </div>
              </div>
            )}
          </div>

          {/* plano de ação */}
          {plano ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Layers size={13} className="text-blue-400 shrink-0" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">Plano de ação</span>
                {plano.empresa && (
                  <span className="ml-auto text-[9px] font-medium uppercase tracking-wide text-slate-500 bg-slate-800 px-2 py-0.5 rounded flex items-center gap-1">
                    <Building2 size={9} /> {plano.empresa}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-slate-100">{plano.titulo}</p>
              {plano.what && <div><p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">O quê</p><p className="text-xs text-slate-300">{plano.what}</p></div>}
              {plano.why && <div><p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Por quê</p><p className="text-xs text-slate-300">{plano.why}</p></div>}
              {plano.how && <div><p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Como</p><p className="text-xs text-slate-300">{plano.how}</p></div>}
              <div className="flex gap-3 flex-wrap text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                <span className="flex items-center gap-1"><Calendar size={10} /> {fmtDate(plano.when_inicio)} → {fmtDate(plano.when_fim)}</span>
                {plano.who_id && <span className="flex items-center gap-1"><User size={10} />{displayNomeDonoPrioridade(plano.who_id, responsaveis) || plano.who_id}</span>}
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 text-center">
              <Layers size={16} className="mx-auto text-slate-600 mb-2" />
              <p className="text-xs text-slate-500">Plano de ação não disponível neste contexto.</p>
            </div>
          )}

          {/* prioridade */}
          {prioridade && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Target size={13} className="text-slate-400 shrink-0" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Prioridade estratégica</span>
                {prioridade.empresa && (
                  <span className="ml-auto text-[9px] font-medium uppercase tracking-wide text-slate-500 bg-slate-800 px-2 py-0.5 rounded flex items-center gap-1">
                    <Building2 size={9} /> {prioridade.empresa}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-slate-100">{prioridade.titulo}</p>
              {prioridade.descricao && <p className="text-xs text-slate-400">{prioridade.descricao}</p>}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ─── Linha de tarefa ─────────────────────────────────────────────────────────

const TarefaRow: React.FC<{
  tarefa: Tarefa;
  responsaveis: Responsavel[];
  onUpdate: (u: Partial<Tarefa>) => void;
  onRequestBlock: () => void;
  onRequestDelete: () => void;
  canWriteTarefa?: boolean;
  canAssignTarefa?: boolean;
  canDeleteTarefa?: boolean;
  canEditPrazo?: boolean;
  canEditObservers?: boolean;
  allUsers: Array<{ id: string; label: string }>;
  onAddObserver?: (entity: 'prioridade' | 'plano' | 'tarefa', entityId: string, userId: string) => void;
  onRemoveObserver?: (entity: 'prioridade' | 'plano' | 'tarefa', entityId: string, userId: string) => void;
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
  canEditObservers = true,
  allUsers,
  onAddObserver,
  onRemoveObserver,
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
              const idx = TAREFA_ORDER.indexOf(tarefa.status_tarefa);
              const next = TAREFA_ORDER[(idx + 1) % TAREFA_ORDER.length];
              handleStatusChange(next);
            }}
            className="mt-0.5 shrink-0 text-slate-500 hover:text-slate-200 disabled:opacity-40 disabled:pointer-events-none"
            title="Alternar status"
          >
            <StatusIcon
              size={14}
              className={
                tarefa.status_tarefa === 'Bloqueada'
                  ? 'text-red-400'
                  : tarefa.status_tarefa === 'Concluida' || tarefa.status_tarefa === 'EmExecucao'
                    ? 'text-emerald-400'
                    : 'text-slate-500'
              }
            />
          </button>
          <div className="min-w-0">
            <span className="text-[9px] font-mono bg-slate-700/70 text-slate-300 px-1.5 py-0.5 rounded" title="ID da tarefa">{shortId(tarefa.id)}</span>
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
            {tarefa.descricao && tarefa.descricao.trim() !== '' && (
              <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[280px]">{tarefa.descricao}</p>
            )}
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
              {displayNome
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map((x) => x[0])
                .join('')
                .toUpperCase()}
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
            resolveUserName={(userId) => displayNomeDonoPrioridade(userId, responsaveis) || userId}
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

const OperacionalPlanoCard: React.FC<{
  prioridade: Prioridade;
  plano: PlanoDeAcao;
  tarefas: Tarefa[];
  responsaveis: Responsavel[];
  whoUsers?: Responsavel[];
  computeStatusPlano: (planoId: string) => StatusPlano | null;
  onAddTarefa: (t: Omit<Tarefa, 'id'>) => void;
  onUpdateTarefa: (id: string, u: Partial<Tarefa>) => void;
  onDeleteTarefa: (id: string) => void;
  onUpdatePlano: (id: string, u: Partial<PlanoDeAcao>) => void;
  loggedUserResponsavelId?: string;
  isAdmin?: boolean;
  myResponsavelIds?: Set<string>;
  canWritePlano?: boolean;
  canWriteTarefa?: boolean;
  canAssignTarefa?: boolean;
  canDeleteTarefa?: boolean;
  canEditPrazo?: boolean;
  canEditObservers?: boolean;
  allUsers: Array<{ id: string; label: string }>;
  onAddObserver?: (entity: 'prioridade' | 'plano' | 'tarefa', entityId: string, userId: string) => void;
  onRemoveObserver?: (entity: 'prioridade' | 'plano' | 'tarefa', entityId: string, userId: string) => void;
}> = ({
  prioridade,
  plano,
  tarefas,
  responsaveis,
  whoUsers,
  computeStatusPlano,
  onAddTarefa,
  onUpdateTarefa,
  onDeleteTarefa,
  onUpdatePlano,
  loggedUserResponsavelId,
  isAdmin = true,
  myResponsavelIds = new Set<string>(),
  canWritePlano = true,
  canWriteTarefa = true,
  canAssignTarefa = true,
  canDeleteTarefa = true,
  canEditPrazo = false,
  canEditObservers = true,
  allUsers,
  onAddObserver,
  onRemoveObserver,
}) => {
  const whoPool = whoUsers && whoUsers.length > 0 ? whoUsers : responsaveis;
  const [expanded, setExpanded] = useState(false);
  const [showAddTarefa, setShowAddTarefa] = useState(false);
  const [tarefaParaExcluir, setTarefaParaExcluir] = useState<Tarefa | null>(null);
  const [tarefaParaBloquear, setTarefaParaBloquear] = useState<Tarefa | null>(null);
  const [motivoBloqueio, setMotivoBloqueio] = useState('');
  const [novaTarefa, setNovaTarefa] = useState({
    titulo: '',
    responsavel_id: loggedUserResponsavelId ?? '',
    data_vencimento: todayDateBR(),
    descricao: '',
  });

  useEffect(() => {
    if (canAssignTarefa) return;
    const self = (loggedUserResponsavelId ?? '').trim();
    if (!self) return;
    setNovaTarefa((prev) => (prev.responsavel_id === self ? prev : { ...prev, responsavel_id: self }));
  }, [canAssignTarefa, loggedUserResponsavelId]);

  const computed = computeStatusPlano(plano.id);
  const status = (computed || plano.status_plano) as StatusPlano;
  const statusCfg = STATUS_CFG[status] || STATUS_CFG.Execucao;
  const defaultAssigneeId = (loggedUserResponsavelId ?? '').trim();

  /** WHO do plano (5W2H) — pode diferir do dono da prioridade; sempre refletir `plano.who_id`. */
  const displayWhoPlano =
    displayNomeDonoPrioridade(plano.who_id, whoPool).trim() || (plano.who_id || '').trim() || '';
  const donoDestaPrioridade =
    myResponsavelIds.size > 0 &&
    donoPrioridadeCorrespondeAoUsuario(prioridade.dono_id, myResponsavelIds, responsaveis);

  const tarefasDoPlano = useMemo(() => {
    const list = tarefas.filter((t) => t.plano_id === plano.id);
    if (isAdmin || donoDestaPrioridade) return list;
    return list.filter((t) => tarefaAtribuidaAoUsuario(t, myResponsavelIds, responsaveis));
  }, [tarefas, plano.id, isAdmin, donoDestaPrioridade, myResponsavelIds, responsaveis]);
  const tarefasDoPlanoAtivas = useMemo(
    () => tarefasDoPlano.filter((t) => t.status_tarefa !== 'Concluida'),
    [tarefasDoPlano],
  );
  const tarefasDoPlanoConcluidas = useMemo(
    () => tarefasDoPlano.filter((t) => t.status_tarefa === 'Concluida'),
    [tarefasDoPlano],
  );
  const bloqueiosNaoVisiveis = useMemo(() => {
    if (isAdmin || donoDestaPrioridade) return [];
    const visiveis = new Set(tarefasDoPlano.map((t) => t.id));
    return tarefas
      .filter((t) => t.plano_id === plano.id && !visiveis.has(t.id) && t.status_tarefa === 'Bloqueada')
      .map((t) => ({
        id: t.id,
        titulo: t.titulo,
        responsavel: displayNomeDonoPrioridade(t.responsavel_id, responsaveis) || t.responsavel_id,
        motivo: t.bloqueio_motivo || 'Motivo não informado',
      }));
  }, [isAdmin, donoDestaPrioridade, tarefasDoPlano, tarefas, plano.id, responsaveis]);
  const [blockContext, setBlockContext] = useState<
    { task_id: string; task_title: string; task_owner: string; block_reason: string }[]
  >([]);

  useEffect(() => {
    if (!expanded || status !== 'Bloqueado') return;
    let mounted = true;
    void apiGetBlockContext(plano.id, tarefas.filter((t) => t.plano_id === plano.id)).then((ctx) => {
      if (!mounted || !ctx) return;
      setBlockContext(ctx);
    });
    return () => {
      mounted = false;
    };
  }, [expanded, status, plano.id, tarefas]);

  const W2H: Array<{
    key: keyof PlanoDeAcao;
    label: string;
    sub: string;
    type: 'textarea' | 'input' | 'date' | 'resp';
  }> = [
    { key: 'what', label: 'WHAT', sub: 'O que', type: 'textarea' },
    { key: 'why', label: 'WHY', sub: 'Por que', type: 'textarea' },
    { key: 'who_id', label: 'WHO', sub: 'Quem', type: 'resp' },
    { key: 'when_fim', label: 'WHEN', sub: 'Quando', type: 'date' },
    { key: 'where', label: 'WHERE', sub: 'Onde', type: 'input' },
    { key: 'how_much', label: 'HOW MUCH', sub: 'Quanto', type: 'input' },
  ];

  const handleUpdatePlano = (u: Partial<PlanoDeAcao>) => {
    onUpdatePlano(plano.id, u);
  };

  const handleAddTarefa = () => {
    if (!novaTarefa.titulo.trim()) return;
    const parsedVenc = parseDateBR(novaTarefa.data_vencimento);
    if (!parsedVenc) return;
    const assignee = (canAssignTarefa ? novaTarefa.responsavel_id : defaultAssigneeId).trim();
    if (!assignee) return;
    onAddTarefa({
      plano_id: plano.id,
      titulo: novaTarefa.titulo.trim(),
      descricao: novaTarefa.descricao.trim(),
      responsavel_id: assignee,
      data_inicio: Date.now(),
      data_vencimento: parsedVenc,
      status_tarefa: 'Pendente',
      created_by: loggedUserResponsavelId ?? '',
      empresa: plano.empresa ?? prioridade.empresa,
    });
    setNovaTarefa({
      titulo: '',
      responsavel_id: defaultAssigneeId,
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

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-4 flex items-start gap-3 hover:bg-slate-900/80 transition-colors text-left"
      >
        <div className="mt-1 text-slate-500 shrink-0">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest flex items-center gap-2">
                <Target size={9} /> PRIORIDADE
              </p>
              <p className="text-sm font-semibold text-slate-100 truncate">{prioridade.titulo}</p>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono bg-slate-700/70 text-slate-300 px-1.5 py-0.5 rounded" title="ID do card">{shortId(plano.id)}</span>
                <h4 className="text-lg font-bold text-slate-100 truncate">{plano.titulo}</h4>
                {plano.link?.trim() && (
                  <a
                    href={plano.link.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-blue-400 hover:text-blue-300 shrink-0"
                    title="Abrir documento vinculado"
                    aria-label="Abrir link do plano"
                  >
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-[12px] text-slate-400 flex-wrap">
                {displayWhoPlano && (
                  <span className="inline-flex items-center gap-1">
                    <User size={12} className="text-slate-500" />
                    {displayWhoPlano}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Calendar size={12} className="text-slate-500" />
                  Prazo: {fmtDate(plano.when_fim)}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusCfg.cls}`}>
                  {statusCfg.label}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
                <div className="w-28 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${status === 'Concluido' ? 'bg-emerald-500' : status === 'Bloqueado' ? 'bg-red-500' : 'bg-blue-500'}`}
                    style={{ width: `${tarefasDoPlano.length > 0 ? (tarefasDoPlanoConcluidas.length / tarefasDoPlano.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="tabular-nums">{tarefasDoPlanoConcluidas.length}/{tarefasDoPlano.length} concluídas</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded tabular-nums">
                {tarefasDoPlano.length} tarefas
              </span>
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-800 p-4 space-y-4">
          {/* 5W2H fields (igual ao Tático) */}
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
                      onBlur={canWritePlano ? (e) => handleUpdatePlano({ [key]: e.target.value } as Partial<PlanoDeAcao>) : undefined}
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
                      onBlur={canWritePlano ? (e) => handleUpdatePlano({ [key]: e.target.value } as Partial<PlanoDeAcao>) : undefined}
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
                              if (parsed) handleUpdatePlano({ when_fim: parsed });
                            }
                          : undefined
                      }
                      readOnly={!canWritePlano}
                      disabled={!canWritePlano}
                      placeholder="dd/mm/yyyy"
                      className="bg-transparent text-sm text-slate-200 outline-none border-b border-transparent focus:border-slate-600 transition-colors py-0.5 placeholder:text-slate-700 disabled:opacity-60"
                    />
                  ) : canWritePlano ? (
                    <ResponsavelAutocomplete
                      valueId={plano.who_id}
                      onCommit={(id) => handleUpdatePlano({ who_id: id })}
                      responsaveis={whoPool}
                      placeholder="Selecione responsável"
                      variant="compact"
                    />
                  ) : (
                    <div className="w-full bg-transparent text-sm text-slate-200 outline-none border-b border-transparent py-0.5">
                      {displayWhoPlano || '—'}
                    </div>
                  )}
                </div>
              </React.Fragment>
            ))}
          </div>

          {/* HOW section (igual ao Tático) */}
          <div className="px-6 pb-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4">
              <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-0.5">HOW — EXECUÇÃO</p>
              <p className="text-[10px] text-slate-600 mb-3">Como será feito</p>
              <textarea
                key={`${plano.id}-how`}
                defaultValue={plano.how || ''}
                onBlur={canWritePlano ? (e) => handleUpdatePlano({ how: e.target.value }) : undefined}
                readOnly={!canWritePlano}
                disabled={!canWritePlano}
                rows={4}
                className="w-full min-h-[96px] bg-transparent text-sm text-slate-200 outline-none resize-none border-b border-transparent focus:border-slate-600 transition-colors placeholder:text-slate-700 disabled:opacity-60"
                placeholder="Descreva como será executado..."
              />
            </div>
          </div>
          <div className="px-6 pb-3">
            <ObserversPanel
              entity="plano"
              entityId={plano.id}
              observers={plano.observadores ?? []}
              allUsers={allUsers}
              resolveUserName={(userId) => displayNomeDonoPrioridade(userId, responsaveis) || userId}
              onAdd={(userId) => onAddObserver?.('plano', plano.id, userId)}
              onRemove={(userId) => onRemoveObserver?.('plano', plano.id, userId)}
              canEdit={canEditObservers}
            />
          </div>

          {/* Tarefas */}
          {tarefasDoPlano.length === 0 ? (
            <div className="px-4 py-6 text-center text-slate-500 text-sm border border-dashed border-slate-800 rounded-lg">
              Nenhuma tarefa ainda. Clique em &quot;Nova Tarefa&quot; para começar.
            </div>
          ) : (
            <div className="space-y-3">
              {bloqueiosNaoVisiveis.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  <p className="text-[11px] text-amber-300 font-medium">
                    Plano bloqueado por tarefa não visível para você
                  </p>
                  <p className="text-[11px] text-amber-200/90 mt-1">
                    Isso acontece quando o bloqueio está em tarefa de outro responsável fora do seu escopo de visualização.
                  </p>
                  {bloqueiosNaoVisiveis.slice(0, 3).map((b) => (
                    <p key={b.id} className="text-[11px] text-amber-200/90 mt-1">
                      {b.titulo} · {b.responsavel} · {b.motivo}
                    </p>
                  ))}
                </div>
              )}
              {status === 'Bloqueado' && blockContext.length > 0 && bloqueiosNaoVisiveis.length === 0 && (
                <div className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2">
                  <p className="text-[11px] text-red-300 font-medium">Causa do Bloqueio</p>
                  {blockContext.map((c) => (
                    <p key={c.task_id} className="text-[11px] text-red-200/90 mt-1">
                      ⛔ Tarefa: &quot;{c.task_title}&quot; · 👤 Responsável:{' '}
                      {displayNomeDonoPrioridade(c.task_owner, responsaveis).trim() || c.task_owner} · 📝 Motivo:{' '}
                      {c.block_reason || '—'}
                    </p>
                  ))}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full table-fixed min-w-[640px] border-collapse">
                  <thead>
                    <tr className="border-t border-b border-slate-800 text-[10px] font-semibold text-slate-600 uppercase tracking-wider bg-slate-900/40">
                      <th className="px-4 py-2 text-left">Tarefa</th>
                      <th className="px-4 py-2 text-left">Responsável</th>
                      <th className="px-4 py-2 text-left">Prazo</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-2 py-2 text-right w-16">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {tarefasDoPlano.map((t) => (
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
                        canEditObservers={canEditObservers}
                        allUsers={allUsers}
                        onAddObserver={onAddObserver}
                        onRemoveObserver={onRemoveObserver}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              <FileText size={12} /> Tarefas
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
                        responsavel_id: defaultAssigneeId,
                        data_vencimento: todayDateBR(),
                        descricao: '',
                      });
                    }
                    return next;
                  });
                }}
                className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-2 rounded-lg transition-colors"
              >
                <Plus size={12} /> Nova Tarefa
              </button>
            )}
          </div>

          {showAddTarefa && canWriteTarefa && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                    Tarefa *
                  </label>
                  <input
                    autoFocus
                    value={novaTarefa.titulo}
                    onChange={(e) => setNovaTarefa((v) => ({ ...v, titulo: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddTarefa();
                      if (e.key === 'Escape') setShowAddTarefa(false);
                    }}
                    placeholder="Título da tarefa..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500/60 placeholder:text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                    Responsável *
                  </label>
                  <ResponsavelAutocomplete
                    responsaveis={responsaveis}
                    valueId={novaTarefa.responsavel_id}
                    onCommit={(id) => setNovaTarefa((v) => ({ ...v, responsavel_id: id }))}
                    placeholder="Digite para buscar (ex.: W → Willy)"
                    disabled={!canAssignTarefa}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                    Prazo
                  </label>
                  <input
                    value={novaTarefa.data_vencimento}
                    onChange={(e) => setNovaTarefa((v) => ({ ...v, data_vencimento: e.target.value }))}
                    placeholder="dd/mm/yyyy"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/60 cursor-pointer appearance-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddTarefa(false)}
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleAddTarefa}
                  disabled={
                    !novaTarefa.titulo.trim() ||
                    !parseDateBR(novaTarefa.data_vencimento) ||
                    !novaTarefa.responsavel_id.trim()
                  }
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                >
                  Adicionar
                </button>
              </div>
            </div>
          )}
          <TaskBlockReasonModal
            isOpen={tarefaParaBloquear !== null}
            taskTitle={tarefaParaBloquear?.titulo}
            value={motivoBloqueio}
            onChange={setMotivoBloqueio}
            onClose={closeBlockReasonModal}
            onConfirm={confirmBlockReason}
          />
          <Modal isOpen={tarefaParaExcluir !== null} onClose={() => setTarefaParaExcluir(null)} title="Excluir tarefa" maxWidth="sm">
            <div className="space-y-4">
              <p className="text-sm text-slate-200">
                Tem certeza que deseja excluir a tarefa <strong className="text-white">&quot;{tarefaParaExcluir?.titulo}&quot;</strong>? Esta ação não pode ser desfeita.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTarefaParaExcluir(null)}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (tarefaParaExcluir) onDeleteTarefa(tarefaParaExcluir.id);
                    setTarefaParaExcluir(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-sm font-semibold text-white transition-colors"
                >
                  Excluir
                </button>
              </div>
            </div>
          </Modal>
        </div>
      )}
    </div>
  );
};

export const OperacionalView: React.FC<OperacionalProps> = ({
  prioridades,
  planos,
  tarefas,
  responsaveis,
  whoUsers,
  observerUsers,
  computeStatusPlano,
  loggedUserUid,
  loggedUserName,
  loggedUserEmail,
  loggedUserDisplayName,
  loggedUserRole,
  onAddTarefa,
  onUpdateTarefa,
  onDeleteTarefa,
  onAddObserver,
  onRemoveObserver,
  onUpdatePlano,
  operacionalCaps,
}) => {
  const [visibilityFilters, setVisibilityFilters] = useState<VisibilityFilter[]>(['assigned']);
  const [openTaskObservers, setOpenTaskObservers] = useState<Record<string, boolean>>({});
  const [tarefaParaBloquear, setTarefaParaBloquear] = useState<Tarefa | null>(null);
  const [tarefaParaExcluirGlobal, setTarefaParaExcluirGlobal] = useState<Tarefa | null>(null);
  const [tarefaDetalhe, setTarefaDetalhe] = useState<Tarefa | null>(null);
  const [motivoBloqueio, setMotivoBloqueio] = useState('');
  const oc = {
    planoWrite: operacionalCaps?.planoWrite !== false,
    tarefaWrite: operacionalCaps?.tarefaWrite !== false,
    tarefaAssign: operacionalCaps?.tarefaAssign !== false,
    tarefaDelete: operacionalCaps?.tarefaDelete !== false,
    tarefaEditPrazo: operacionalCaps?.tarefaEditPrazo === true,
    observerEdit: operacionalCaps?.observerEdit !== false,
  };
  const whoPool = whoUsers && whoUsers.length > 0 ? whoUsers : responsaveis;
  const observerPool = observerUsers && observerUsers.length > 0 ? observerUsers : responsaveis;
  const toggleVisibilityFilter = (filter: VisibilityFilter) => {
    setVisibilityFilters((prev) =>
      prev.includes(filter) ? prev.filter((item) => item !== filter) : [...prev, filter],
    );
  };

  const seesAllPrioridades = loggedUserRole === 'administrador';
  const viewerSeesAllTarefasNoPlano = loggedUserRole === 'administrador';
  const loggedKeys = [loggedUserUid, loggedUserName]
    .filter((v) => !!v)
    .map((v) => normStr(v as string));

  // Em geral, "dono_id" da prioridade aponta para um responsavel (id), não para uid do login.
  // Então tentamos mapear o usuário logado para o responsavel.id via nome/id.
  const myResponsavelIds = useMemo(
    () =>
      responsavelIdsForLoggedUser(loggedUserUid ?? undefined, loggedUserName ?? undefined, responsaveis, {
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
    return matchByName?.id ?? (loggedUserName?.trim() || (loggedUserUid ? String(loggedUserUid) : ''));
  }, [loggedUserUid, loggedUserName, responsaveis]);
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
  const handleTaskStatusChange = (tarefa: Tarefa, next: StatusTarefa) => {
    if (next === 'Bloqueada' && tarefa.status_tarefa !== 'Bloqueada') {
      openBlockReasonModal(tarefa);
      return;
    }
    onUpdateTarefa(tarefa.id, {
      status_tarefa: next,
      ...(next === 'Concluida' ? { data_conclusao: Date.now() } : {}),
    });
  };

  const visiblePrioridades = useMemo(() => {
    if (seesAllPrioridades) return prioridades;
    if (myResponsavelIds.size > 0) {
      const prioIds = new Set<string>();
      for (const p of prioridades) {
        if (
          donoPrioridadeCorrespondeAoUsuario(p.dono_id, myResponsavelIds, responsaveis) ||
          canViewByOwnershipOrObserver([p.dono_id], p.observadores, myResponsavelIds, responsaveis)
        ) {
          prioIds.add(p.id);
        }
      }
      for (const pl of planos) {
        if (
          donoPrioridadeCorrespondeAoUsuario(pl.who_id, myResponsavelIds, responsaveis) ||
          canViewByOwnershipOrObserver([pl.who_id], pl.observadores, myResponsavelIds, responsaveis)
        ) {
          prioIds.add(pl.prioridade_id);
        }
      }
      for (const t of tarefas) {
        if (
          !tarefaAtribuidaAoUsuario(t, myResponsavelIds, responsaveis) &&
          !canViewByOwnershipOrObserver([t.responsavel_id], t.observadores, myResponsavelIds, responsaveis)
        ) continue;
        const pl = planos.find((p) => p.id === t.plano_id);
        if (pl) prioIds.add(pl.prioridade_id);
      }
      return prioridades.filter((p) => prioIds.has(p.id));
    }
    return prioridades.filter((p) =>
      donoPrioridadeCorrespondeAoUsuario(p.dono_id, new Set(loggedKeys), responsaveis),
    );
  }, [prioridades, seesAllPrioridades, loggedKeys, myResponsavelIds, tarefas, planos, responsaveis]);

  const prioridadeById = useMemo(() => {
    const map = new Map<string, Prioridade>();
    for (const p of visiblePrioridades) map.set(p.id, p);
    return map;
  }, [visiblePrioridades]);

  const visiblePlanos = useMemo(() => {
    const allowedPriorityIds = new Set(visiblePrioridades.map((p) => p.id));
    let list = planos.filter((pl) => allowedPriorityIds.has(pl.prioridade_id));
    list.sort((a, b) => a.when_fim - b.when_fim);
    const currentUid = normStr(loggedUserUid ?? '');
    list = list.filter((pl) => {
      const isCreator = currentUid !== '' && normStr(pl.created_by) === currentUid;
      // Gap fix: planos que contêm tarefas atribuídas ao usuário são visíveis,
      // mesmo que o usuário não seja o who_id do plano (cenário cross-workspace).
      const hasTarefaAtribuida = tarefas.some(
        (t) => t.plano_id === pl.id && tarefaAtribuidaAoUsuario(t, myResponsavelIds, responsaveis),
      );
      const isAssigned =
        donoPrioridadeCorrespondeAoUsuario(pl.who_id, myResponsavelIds, responsaveis) ||
        hasTarefaAtribuida;
      const isObserving =
        Array.isArray(pl.observadores) &&
        pl.observadores.some((o) => myResponsavelIds.has(normStr(o.user_id)));

      if (visibilityFilters.length === 0) return false;
      const matchesCreated = visibilityFilters.includes('created') && isCreator;
      const matchesAssigned = visibilityFilters.includes('assigned') && isAssigned;
      const matchesObserving = visibilityFilters.includes('observing') && isObserving;
      return matchesCreated || matchesAssigned || matchesObserving;
    });
    return list;
  }, [planos, tarefas, visiblePrioridades, visibilityFilters, myResponsavelIds, responsaveis, loggedUserUid]);
  // Mapas completos (não filtrados por visibilidade) para o drawer de detalhes
  const allPlanosById = useMemo(() => {
    const map = new Map<string, PlanoDeAcao>();
    for (const pl of planos) map.set(pl.id, pl);
    return map;
  }, [planos]);

  const allPrioridadesById = useMemo(() => {
    const map = new Map<string, Prioridade>();
    for (const p of prioridades) map.set(p.id, p);
    return map;
  }, [prioridades]);

  const visibleTarefas = useMemo(() => {
    const planosVisiveisIds = new Set(visiblePlanos.map((pl) => pl.id));
    const currentUid = normStr(loggedUserUid ?? '');
    const filtradas = tarefas.filter((t) => {
      const isCreator = currentUid !== '' && normStr(t.created_by) === currentUid;
      const isAssigned = tarefaAtribuidaAoUsuario(t, myResponsavelIds, responsaveis);
      const isObserving =
        Array.isArray(t.observadores) &&
        t.observadores.some((o) => myResponsavelIds.has(normStr(o.user_id)));

      if (visibilityFilters.length === 0) return false;
      const matchesAssigned = visibilityFilters.includes('assigned') && isAssigned;
      // Tarefas atribuídas ao usuário aparecem independente do workspace de origem
      if (matchesAssigned) return true;

      // Para criadas/observando, exige que o plano esteja no escopo visível
      const isInVisiblePlan = planosVisiveisIds.has(t.plano_id);
      if (!isInVisiblePlan) return false;
      const matchesCreated = visibilityFilters.includes('created') && isCreator;
      const matchesObserving = visibilityFilters.includes('observing') && isObserving;
      return matchesCreated || matchesObserving;
    });
    return filtradas.sort((a, b) => a.data_vencimento - b.data_vencimento);
  }, [
    tarefas,
    visiblePlanos,
    myResponsavelIds,
    responsaveis,
    visibilityFilters,
    loggedUserUid,
  ]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => toggleVisibilityFilter('created')}
            className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
              visibilityFilters.includes('created')
                ? 'bg-blue-600 text-white border border-blue-500'
                : 'bg-slate-900/60 border border-slate-700 text-slate-300 hover:text-slate-100'
            }`}
          >
            lançados por mim
          </button>
          <button
            type="button"
            onClick={() => toggleVisibilityFilter('assigned')}
            className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
              visibilityFilters.includes('assigned')
                ? 'bg-blue-600 text-white border border-blue-500'
                : 'bg-slate-900/60 border border-slate-700 text-slate-300 hover:text-slate-100'
            }`}
          >
            atribuídos para mim
          </button>
          <button
            type="button"
            onClick={() => toggleVisibilityFilter('observing')}
            className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
              visibilityFilters.includes('observing')
                ? 'bg-blue-600 text-white border border-blue-500'
                : 'bg-slate-900/60 border border-slate-700 text-slate-300 hover:text-slate-100'
            }`}
          >
            itens que eu acompanho
          </button>
        </div>
        <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-1 rounded tabular-nums">
          {visibleTarefas.length} {visibleTarefas.length === 1 ? 'tarefa' : 'tarefas'}
        </span>
      </div>

      <section className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4">
          {visibleTarefas.length === 0 ? (
            <div className="px-4 py-10 text-sm text-slate-500 text-center">
              Nenhuma tarefa operacional disponível {seesAllPrioridades ? '' : 'para o seu usuário'}.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/50">
              <table className="w-full table-fixed min-w-[900px] text-sm">
                <thead>
                  <tr className="bg-slate-900/80 text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
                    <th className="px-4 py-3 font-semibold text-left">Tarefa</th>
                    <th className="px-4 py-3 font-semibold text-left">Responsável</th>
                    <th className="px-4 py-3 font-semibold text-left">Prazo</th>
                    <th className="px-4 py-3 font-semibold text-left">Status</th>
                    <th className="px-2 py-3 font-semibold text-right w-16">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {visibleTarefas.map((t) => {
                    const respNome = displayNomeDonoPrioridade(t.responsavel_id, responsaveis) || t.responsavel_id;
                    const cfg = TAREFA_CFG[t.status_tarefa] || TAREFA_CFG.Pendente;
                    const StatusIcon = cfg.Icon;
                    const isConcluida = t.status_tarefa === 'Concluida';
                    const isOverdue = t.data_vencimento < Date.now() && !isConcluida;
                    return (
                      <React.Fragment key={t.id}>
                        <tr
                          className="hover:bg-slate-800/20 transition-colors cursor-pointer"
                          onClick={() => setTarefaDetalhe(t)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-start gap-2.5">
                              <button
                                type="button"
                                disabled={!oc.tarefaWrite}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const idx = TAREFA_ORDER.indexOf(t.status_tarefa);
                                  const next = TAREFA_ORDER[(idx + 1) % TAREFA_ORDER.length];
                                  handleTaskStatusChange(t, next);
                                }}
                                className="mt-0.5 shrink-0 text-slate-500 hover:text-slate-200 disabled:opacity-40 disabled:pointer-events-none"
                                title="Alternar status"
                              >
                                <StatusIcon
                                  size={14}
                                  className={
                                    t.status_tarefa === 'Bloqueada'
                                      ? 'text-red-400'
                                      : isConcluida || t.status_tarefa === 'EmExecucao'
                                        ? 'text-emerald-400'
                                        : 'text-slate-500'
                                  }
                                />
                              </button>
                              <div className="min-w-0">
                                <p className={`text-sm font-medium ${isConcluida ? 'line-through text-slate-500' : 'text-slate-200'}`}>{t.titulo}</p>
                                {t.descricao ? <p className="text-[11px] text-slate-500 truncate max-w-[320px]">{t.descricao}</p> : null}
                                {t.status_tarefa === 'Bloqueada' && t.bloqueio_motivo ? (
                                  <p className="text-[11px] text-red-400/80 mt-0.5 flex items-center gap-1">
                                    <AlertTriangle size={10} /> {t.bloqueio_motivo}
                                  </p>
                                ) : null}
                                {isConcluida && t.data_conclusao && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300/70 mt-0.5">
                                    <Calendar size={9} /> {fmtDate(t.data_conclusao)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className={`px-4 py-3 text-xs ${isConcluida ? 'text-slate-500' : 'text-slate-300'}`}>{respNome || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-400 font-medium' : isConcluida ? 'text-slate-500' : 'text-slate-400'}`}>
                              {isOverdue && <AlertTriangle size={10} />}
                              {fmtDate(t.data_vencimento)}
                            </span>
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <select
                                  value={t.status_tarefa}
                                  onChange={(e) => {
                                    const next = e.target.value as StatusTarefa;
                                    handleTaskStatusChange(t, next);
                                  }}
                                  disabled={!oc.tarefaWrite}
                                  className="text-[10px] font-semibold px-2 py-1 rounded-sm uppercase bg-slate-800 border border-slate-700 text-slate-200 outline-none focus:border-slate-500 disabled:opacity-50"
                                >
                                  <option value="Pendente">PENDENTE</option>
                                  <option value="EmExecucao">EM EXECUÇÃO</option>
                                  <option value="Bloqueada">BLOQUEADA</option>
                                  <option value="Concluida">CONCLUÍDA</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setOpenTaskObservers((prev) => ({ ...prev, [t.id]: !prev[t.id] })); }}
                                  className={`p-1 rounded transition-colors ${openTaskObservers[t.id] ? 'text-slate-100 bg-slate-700/80' : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/60'}`}
                                  title={`${(t.observadores ?? []).length} observador(es)`}
                                  aria-label="Abrir observadores da tarefa"
                                >
                                  <Eye size={13} />
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-3 text-right w-16" onClick={(e) => e.stopPropagation()}>
                            {oc.tarefaDelete && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setTarefaParaExcluirGlobal(t); }}
                                className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                title="Excluir tarefa"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                        {openTaskObservers[t.id] && (
                          <tr className="bg-slate-900/40">
                            <td colSpan={5} className="px-4 pb-2">
                              <ObserversPanel
                                entity="tarefa"
                                entityId={t.id}
                                observers={t.observadores ?? []}
                                allUsers={observerPool.map((r) => ({ id: r.id, label: r.nome }))}
                                resolveUserName={(userId) => displayNomeDonoPrioridade(userId, responsaveis) || userId}
                                onAdd={(userId) => onAddObserver?.('tarefa', t.id, userId)}
                                onRemove={(userId) => onRemoveObserver?.('tarefa', t.id, userId)}
                                canEdit={oc.observerEdit}
                                hideTrigger
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      <TaskBlockReasonModal
        isOpen={tarefaParaBloquear !== null}
        taskTitle={tarefaParaBloquear?.titulo}
        value={motivoBloqueio}
        onChange={setMotivoBloqueio}
        onClose={closeBlockReasonModal}
        onConfirm={confirmBlockReason}
      />
      <Modal isOpen={tarefaParaExcluirGlobal !== null} onClose={() => setTarefaParaExcluirGlobal(null)} title="Excluir tarefa" maxWidth="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-200">
            Tem certeza que deseja excluir a tarefa <strong className="text-white">&quot;{tarefaParaExcluirGlobal?.titulo}&quot;</strong>? Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setTarefaParaExcluirGlobal(null)}
              className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                if (tarefaParaExcluirGlobal) onDeleteTarefa(tarefaParaExcluirGlobal.id);
                setTarefaParaExcluirGlobal(null);
              }}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-sm font-semibold text-white transition-colors"
            >
              Excluir
            </button>
          </div>
        </div>
      </Modal>
      </section>

      {tarefaDetalhe && (
        <TarefaDetailDrawer
          tarefa={tarefaDetalhe}
          plano={allPlanosById.get(tarefaDetalhe.plano_id) ?? null}
          prioridade={(() => {
            const pl = allPlanosById.get(tarefaDetalhe.plano_id);
            return pl ? (allPrioridadesById.get(pl.prioridade_id) ?? null) : null;
          })()}
          responsaveis={responsaveis}
          onClose={() => setTarefaDetalhe(null)}
          onUpdate={(patch) => onUpdateTarefa(tarefaDetalhe.id, patch)}
          canWrite={oc.tarefaWrite}
          canAssign={oc.tarefaAssign}
          canEditPrazo={oc.tarefaEditPrazo}
        />
      )}
    </div>
  );
};
