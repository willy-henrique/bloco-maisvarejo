import React, { useEffect, useMemo, useState } from 'react';
import type { PlanoDeAtaque, Prioridade, Responsavel, Tarefa, StatusPlano, StatusTarefa } from '../../types';
import type { UserRole as UserRoleType } from '../../types/user';
import { CheckCircle, Play, Circle, AlertTriangle, Plus, ChevronDown, ChevronRight, Trash2, User, Calendar, Target, FileText } from 'lucide-react';
import { ResponsavelAutocomplete } from './ResponsavelAutocomplete';
import {
  responsavelIdsForLoggedUser,
  donoPrioridadeCorrespondeAoUsuario,
  displayNomeDonoPrioridade,
} from './responsavelSearchUtils';
import { canViewByOwnershipOrObserver, tarefaAtribuidaAoUsuario } from './taskAssignmentUtils';
import { ObserversPanel } from './ObserversPanel';
import { apiGetBlockContext } from '../../services/ritmoCollabApi';

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
  Execucao: { label: 'Em Execucao', cls: 'text-blue-400 bg-blue-500/10 border border-blue-500/30' },
  Bloqueado: { label: 'Bloqueado', cls: 'text-red-400 bg-red-500/10 border border-red-500/30' },
  Concluido: { label: 'Concluido', cls: 'text-blue-300 bg-blue-500/10 border border-blue-500/30' },
};

const TAREFA_ORDER: StatusTarefa[] = ['Pendente', 'EmExecucao', 'Bloqueada', 'Concluida'];

const TAREFA_CFG: Record<StatusTarefa, { label: string; cls: string; Icon: React.ElementType }> = {
  Concluida: { label: 'CONCLUÍDA', cls: 'text-blue-300 bg-blue-500/15', Icon: CheckCircle },
  EmExecucao: { label: 'EM EXECUÇÃO', cls: 'text-blue-300 bg-blue-500/15', Icon: Play },
  Pendente: { label: 'PENDENTE', cls: 'text-slate-400 bg-slate-700/60', Icon: Circle },
  Bloqueada: { label: 'BLOQUEADA', cls: 'text-red-400 bg-red-500/15', Icon: AlertTriangle },
};

export type OperacionalCaps = {
  planoWrite?: boolean;
  tarefaWrite?: boolean;
  tarefaAssign?: boolean;
  tarefaDelete?: boolean;
};

type OperacionalProps = {
  prioridades: Prioridade[];
  planos: PlanoDeAtaque[];
  tarefas: Tarefa[];
  responsaveis: Responsavel[];
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
  onUpdatePlano: (id: string, u: Partial<PlanoDeAtaque>) => void;
  onDeletePlano: (id: string) => void;
  operacionalCaps?: OperacionalCaps;
};

const TarefaRow: React.FC<{
  tarefa: Tarefa;
  responsaveis: Responsavel[];
  onUpdate: (u: Partial<Tarefa>) => void;
  onDelete: () => void;
  canWriteTarefa?: boolean;
  canAssignTarefa?: boolean;
  canDeleteTarefa?: boolean;
  allUsers: string[];
  onAddObserver?: (entity: 'prioridade' | 'plano' | 'tarefa', entityId: string, userId: string) => void;
  onRemoveObserver?: (entity: 'prioridade' | 'plano' | 'tarefa', entityId: string, userId: string) => void;
}> = ({
  tarefa,
  responsaveis,
  onUpdate,
  onDelete,
  canWriteTarefa = true,
  canAssignTarefa = true,
  canDeleteTarefa = true,
  allUsers,
  onAddObserver,
  onRemoveObserver,
}) => {
  const [showObservers, setShowObservers] = useState(false);
  const resp = responsaveis.find(
    (r) =>
      normStr(r.id) === normStr(tarefa.responsavel_id) ||
      normStr(r.nome) === normStr(tarefa.responsavel_id),
  );
  const displayNome = resp?.nome || tarefa.responsavel_id || '';
  const cfg = TAREFA_CFG[tarefa.status_tarefa] || TAREFA_CFG.Pendente;
  const StatusIcon = cfg.Icon;

  return (
    <>
    <tr className="hover:bg-slate-800/20 transition-colors">
      <td className="px-4 py-3">
        <button
          type="button"
          disabled={!canWriteTarefa}
          onClick={() => {
            const idx = TAREFA_ORDER.indexOf(tarefa.status_tarefa);
            const next = TAREFA_ORDER[(idx + 1) % TAREFA_ORDER.length];
            onUpdate({ status_tarefa: next });
          }}
          className="text-slate-500 hover:text-slate-200 disabled:opacity-40 disabled:pointer-events-none"
          title="Alternar status"
        >
          <StatusIcon size={14} className={tarefa.status_tarefa === 'Bloqueada' ? 'text-red-400' : tarefa.status_tarefa === 'Concluida' || tarefa.status_tarefa === 'EmExecucao' ? 'text-blue-300' : 'text-slate-500'} />
        </button>
      </td>
      <td className="px-4 py-3">
        <p className={`text-sm font-medium ${tarefa.status_tarefa === 'Concluida' ? 'line-through text-slate-500' : 'text-slate-200'}`}>
          {tarefa.titulo}
        </p>
        {tarefa.descricao && tarefa.descricao.trim() !== '' && (
          <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[320px]">{tarefa.descricao}</p>
        )}
        {tarefa.status_tarefa === 'Bloqueada' && tarefa.bloqueio_motivo && (
          <p className="text-[11px] text-red-400/80 mt-0.5 flex items-center gap-1">
            <AlertTriangle size={10} /> {tarefa.bloqueio_motivo}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-slate-300">
        <div className="flex items-center gap-2 min-w-0">
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
            <User size={12} className="text-slate-500 shrink-0" />
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
            <span className="truncate block max-w-[140px] text-sm">{displayNome || '—'}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-slate-400">{fmtDate(tarefa.data_vencimento)}</td>
      <td className="px-4 py-3">
        <select
          value={tarefa.status_tarefa}
          onChange={(e) => onUpdate({ status_tarefa: e.target.value as StatusTarefa })}
          disabled={!canWriteTarefa}
          className="text-[10px] font-semibold px-2 py-1 rounded-sm uppercase bg-slate-800 border border-slate-700 text-slate-200 outline-none focus:border-slate-500 disabled:opacity-50"
        >
          <option value="Pendente">PENDENTE</option>
          <option value="EmExecucao">EM EXECUÇÃO</option>
          <option value="Bloqueada">BLOQUEADA</option>
          <option value="Concluida">CONCLUÍDA</option>
        </select>
      </td>
      <td className="px-2 py-3 text-right w-16">
        {canDeleteTarefa && (
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Excluir"
          >
            <Trash2 size={13} />
          </button>
        )}
      </td>
    </tr>
    <tr className="bg-slate-900/40">
      <td colSpan={6} className="px-4 pb-2">
        <button
          type="button"
          onClick={() => setShowObservers((v) => !v)}
          className="text-[11px] text-slate-400 hover:text-slate-200"
        >
          👁 {(tarefa.observadores ?? []).length} observadores
        </button>
        {showObservers && (
          <ObserversPanel
            entity="tarefa"
            entityId={tarefa.id}
            observers={tarefa.observadores ?? []}
            allUsers={allUsers}
            onAdd={(userId) => onAddObserver?.('tarefa', tarefa.id, userId)}
            onRemove={(userId) => onRemoveObserver?.('tarefa', tarefa.id, userId)}
            canEdit={canWriteTarefa}
          />
        )}
      </td>
    </tr>
    </>
  );
};

const OperacionalPlanoCard: React.FC<{
  prioridade: Prioridade;
  plano: PlanoDeAtaque;
  tarefas: Tarefa[];
  responsaveis: Responsavel[];
  computeStatusPlano: (planoId: string) => StatusPlano | null;
  onAddTarefa: (t: Omit<Tarefa, 'id'>) => void;
  onUpdateTarefa: (id: string, u: Partial<Tarefa>) => void;
  onDeleteTarefa: (id: string) => void;
  onUpdatePlano: (id: string, u: Partial<PlanoDeAtaque>) => void;
  loggedUserResponsavelId?: string;
  isAdmin?: boolean;
  myResponsavelIds?: Set<string>;
  canWritePlano?: boolean;
  canWriteTarefa?: boolean;
  canAssignTarefa?: boolean;
  canDeleteTarefa?: boolean;
  allUsers: string[];
  onAddObserver?: (entity: 'prioridade' | 'plano' | 'tarefa', entityId: string, userId: string) => void;
  onRemoveObserver?: (entity: 'prioridade' | 'plano' | 'tarefa', entityId: string, userId: string) => void;
}> = ({
  prioridade,
  plano,
  tarefas,
  responsaveis,
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
  allUsers,
  onAddObserver,
  onRemoveObserver,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showAddTarefa, setShowAddTarefa] = useState(false);
  const [concluidasNoPlanoOpen, setConcluidasNoPlanoOpen] = useState(false);
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
    displayNomeDonoPrioridade(plano.who_id, responsaveis).trim() || (plano.who_id || '').trim() || '';
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
    key: keyof PlanoDeAtaque;
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

  const handleUpdatePlano = (u: Partial<PlanoDeAtaque>) => {
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
              <h4 className="text-lg font-bold text-slate-100 truncate">{plano.titulo}</h4>
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
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest whitespace-nowrap">{label}</p>
                  <p className="text-[10px] text-slate-600">{sub}</p>
                </div>
                <div>
                  {type === 'textarea' ? (
                    <textarea
                      key={`${plano.id}-${key}`}
                      defaultValue={(plano[key] as string) || ''}
                      onBlur={canWritePlano ? (e) => handleUpdatePlano({ [key]: e.target.value } as Partial<PlanoDeAtaque>) : undefined}
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
                      onBlur={canWritePlano ? (e) => handleUpdatePlano({ [key]: e.target.value } as Partial<PlanoDeAtaque>) : undefined}
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
                      responsaveis={responsaveis}
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
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-0.5">HOW — EXECUÇÃO</p>
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
              onAdd={(userId) => onAddObserver?.('plano', plano.id, userId)}
              onRemove={(userId) => onRemoveObserver?.('plano', plano.id, userId)}
              canEdit={canWritePlano}
            />
          </div>

          {/* Tasks (mantém o comportamento atual do Operacional) */}
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
                  {bloqueiosNaoVisiveis.slice(0, 3).map((b) => (
                    <p key={b.id} className="text-[11px] text-amber-200/90 mt-1">
                      {b.titulo} · {b.responsavel} · {b.motivo}
                    </p>
                  ))}
                </div>
              )}
              {status === 'Bloqueado' && blockContext.length > 0 && (
                <div className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2">
                  <p className="text-[11px] text-red-300 font-medium">Causa do Bloqueio</p>
                  {blockContext.map((c) => (
                    <p key={c.task_id} className="text-[11px] text-red-200/90 mt-1">
                      ⛔ Tarefa: "{c.task_title}" · 👤 Responsável: {c.task_owner} · 📝 Motivo: {c.block_reason || '—'}
                    </p>
                  ))}
                </div>
              )}
              {tarefasDoPlanoAtivas.length > 0 && (
                <div className="overflow-x-hidden">
                  <table className="w-full table-fixed border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="px-4 py-2 text-left">Status</th>
                        <th className="px-4 py-2 text-left">Tarefa</th>
                        <th className="px-4 py-2 text-left">Responsável</th>
                        <th className="px-4 py-2 text-left">Prazo</th>
                        <th className="px-4 py-2 text-left">Label</th>
                        <th className="px-2 py-2 text-right w-16">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {tarefasDoPlanoAtivas.map((t) => (
                        <TarefaRow
                          key={t.id}
                          tarefa={t}
                          responsaveis={responsaveis}
                          onUpdate={(u) => onUpdateTarefa(t.id, u)}
                          onDelete={() => onDeleteTarefa(t.id)}
                          canWriteTarefa={canWriteTarefa}
                          canAssignTarefa={canAssignTarefa}
                          canDeleteTarefa={canDeleteTarefa}
                          allUsers={allUsers}
                          onAddObserver={onAddObserver}
                          onRemoveObserver={onRemoveObserver}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {tarefasDoPlanoConcluidas.length > 0 && (
                <section className="bg-slate-900/30 border border-slate-800/80 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setConcluidasNoPlanoOpen((o) => !o)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-slate-400">
                      {concluidasNoPlanoOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <CheckCircle size={14} className="text-blue-400/80" />
                      <span className="text-xs font-medium text-slate-300">Concluídas</span>
                    </div>
                    <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded tabular-nums">
                      {tarefasDoPlanoConcluidas.length}
                    </span>
                  </button>
                  {concluidasNoPlanoOpen && (
                    <div className="overflow-x-hidden border-t border-slate-800/80">
                      <table className="w-full table-fixed border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                            <th className="px-4 py-2 text-left">Status</th>
                            <th className="px-4 py-2 text-left">Tarefa</th>
                            <th className="px-4 py-2 text-left">Responsável</th>
                            <th className="px-4 py-2 text-left">Prazo</th>
                            <th className="px-4 py-2 text-left">Label</th>
                            <th className="px-2 py-2 text-right w-16">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {tarefasDoPlanoConcluidas.map((t) => (
                            <TarefaRow
                              key={t.id}
                              tarefa={t}
                              responsaveis={responsaveis}
                              onUpdate={(u) => onUpdateTarefa(t.id, u)}
                              onDelete={() => onDeleteTarefa(t.id)}
                              canWriteTarefa={canWriteTarefa}
                              canAssignTarefa={canAssignTarefa}
                              canDeleteTarefa={canDeleteTarefa}
                              allUsers={allUsers}
                              onAddObserver={onAddObserver}
                              onRemoveObserver={onRemoveObserver}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
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
                className="flex items-center gap-1 text-[11px] font-medium text-blue-300 hover:text-blue-200 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-2 rounded-lg transition-colors"
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
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                >
                  Adicionar
                </button>
              </div>
            </div>
          )}
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
  const [abaAtiva, setAbaAtiva] = useState<'planos' | 'tarefas'>('tarefas');
  const [visibilityMode, setVisibilityMode] = useState<'mine' | 'following'>('mine');
  const [tarefasConcluidasOpen, setTarefasConcluidasOpen] = useState(false);
  const [planosConcluidosOpen, setPlanosConcluidosOpen] = useState(false);
  const oc = {
    planoWrite: operacionalCaps?.planoWrite !== false,
    tarefaWrite: operacionalCaps?.tarefaWrite !== false,
    tarefaAssign: operacionalCaps?.tarefaAssign !== false,
    tarefaDelete: operacionalCaps?.tarefaDelete !== false,
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
    if (visibilityMode === 'following' && myResponsavelIds.size > 0) {
      list = list.filter(
        (pl) =>
          Array.isArray(pl.observadores) &&
          pl.observadores.some((o) => myResponsavelIds.has(normStr(o.user_id)))
      );
    }
    list.sort((a, b) => a.when_fim - b.when_fim);
    return list;
  }, [planos, visiblePrioridades, visibilityMode, myResponsavelIds]);
  const visiblePlanosAtivos = useMemo(
    () => visiblePlanos.filter((pl) => ((computeStatusPlano(pl.id) || pl.status_plano) as StatusPlano) !== 'Concluido'),
    [visiblePlanos, computeStatusPlano],
  );
  const visiblePlanosConcluidos = useMemo(
    () => visiblePlanos.filter((pl) => ((computeStatusPlano(pl.id) || pl.status_plano) as StatusPlano) === 'Concluido'),
    [visiblePlanos, computeStatusPlano],
  );

  const planoById = useMemo(() => {
    const map = new Map<string, PlanoDeAtaque>();
    for (const pl of visiblePlanos) map.set(pl.id, pl);
    return map;
  }, [visiblePlanos]);

  const visibleTarefas = useMemo(() => {
    const planosVisiveisIds = new Set(visiblePlanos.map((pl) => pl.id));
    const tarefasBase = tarefas.filter((t) => planosVisiveisIds.has(t.plano_id));
    if (viewerSeesAllTarefasNoPlano) {
      return [...tarefasBase].sort((a, b) => a.data_vencimento - b.data_vencimento);
    }
    const filtradas = tarefasBase.filter((t) => {
      const mine =
        tarefaAtribuidaAoUsuario(t, myResponsavelIds, responsaveis) ||
        canViewByOwnershipOrObserver([t.responsavel_id], t.observadores, myResponsavelIds, responsaveis);
      if (visibilityMode === 'mine') return mine;
      return Array.isArray(t.observadores) && t.observadores.some((o) => myResponsavelIds.has(normStr(o.user_id))) && !mine;
    });
    return filtradas.sort((a, b) => a.data_vencimento - b.data_vencimento);
  }, [
    tarefas,
    visiblePlanos,
    viewerSeesAllTarefasNoPlano,
    myResponsavelIds,
    responsaveis,
    visibilityMode,
  ]);

  const visibleTarefasAtivas = useMemo(
    () => visibleTarefas.filter((t) => t.status_tarefa !== 'Concluida'),
    [visibleTarefas],
  );

  const visibleTarefasConcluidas = useMemo(
    () => visibleTarefas.filter((t) => t.status_tarefa === 'Concluida'),
    [visibleTarefas],
  );

  return (
    <section className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Operacional
          </h3>
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900/60 p-0.5">
            <button
              type="button"
              onClick={() => setAbaAtiva('tarefas')}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                abaAtiva === 'tarefas'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tarefas
            </button>
            <button
              type="button"
              onClick={() => setAbaAtiva('planos')}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                abaAtiva === 'planos'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Plano de ataque
            </button>
          </div>
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900/60 p-0.5">
            <button
              type="button"
              onClick={() => setVisibilityMode('mine')}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                visibilityMode === 'mine' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Meus itens
            </button>
            <button
              type="button"
              onClick={() => setVisibilityMode('following')}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                visibilityMode === 'following' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Itens que sigo
            </button>
          </div>
        </div>
        <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-1 rounded tabular-nums">
          {abaAtiva === 'planos'
            ? `${visiblePlanos.length} ${visiblePlanos.length === 1 ? 'plano' : 'planos'}`
            : `${visibleTarefas.length} ${visibleTarefas.length === 1 ? 'tarefa' : 'tarefas'}`}
        </span>
      </div>

      {abaAtiva === 'planos' && visiblePlanos.length === 0 && (
        <div className="px-4 py-10 text-sm text-slate-500 text-center">
          Nenhum plano operacional disponível {seesAllPrioridades ? '' : 'para o seu usuário'}.
        </div>
      )}

      {abaAtiva === 'planos' && visiblePlanos.length > 0 && (
        <div className="p-4 space-y-4">
          {visiblePlanosAtivos.length > 0 && (
            <div className="divide-y divide-slate-800/60 space-y-4">
              {visiblePlanosAtivos.map((plano) => {
                const prioridade = prioridadeById.get(plano.prioridade_id) ?? prioridades.find((p) => p.id === plano.prioridade_id) ?? null;
                if (!prioridade) return null;
                return (
                  <OperacionalPlanoCard
                    key={plano.id}
                    prioridade={prioridade}
                    plano={plano}
                    tarefas={tarefas}
                    responsaveis={responsaveis}
                    computeStatusPlano={computeStatusPlano}
                    onAddTarefa={onAddTarefa}
                    onUpdateTarefa={onUpdateTarefa}
                    onDeleteTarefa={onDeleteTarefa}
                    onUpdatePlano={onUpdatePlano}
                    loggedUserResponsavelId={loggedUserResponsavelId}
                    isAdmin={viewerSeesAllTarefasNoPlano}
                    myResponsavelIds={myResponsavelIds}
                    canWritePlano={oc.planoWrite}
                    canWriteTarefa={oc.tarefaWrite}
                    canAssignTarefa={oc.tarefaAssign}
                    canDeleteTarefa={oc.tarefaDelete}
                    allUsers={responsaveis.map((r) => r.nome)}
                    onAddObserver={onAddObserver}
                    onRemoveObserver={onRemoveObserver}
                  />
                );
              })}
            </div>
          )}

          {visiblePlanosConcluidos.length > 0 && (
            <section className="bg-slate-900/30 border border-slate-800/80 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setPlanosConcluidosOpen((o) => !o)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-center gap-2 text-slate-400">
                  {planosConcluidosOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <CheckCircle size={14} className="text-blue-400/80" />
                  <span className="text-xs font-medium text-slate-300">Planos concluídos</span>
                </div>
                <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded tabular-nums">
                  {visiblePlanosConcluidos.length}
                </span>
              </button>
              {planosConcluidosOpen && (
                <div className="border-t border-slate-800/80 p-4 space-y-4">
                  {visiblePlanosConcluidos.map((plano) => {
                    const prioridade = prioridadeById.get(plano.prioridade_id) ?? prioridades.find((p) => p.id === plano.prioridade_id) ?? null;
                    if (!prioridade) return null;
                    return (
                      <OperacionalPlanoCard
                        key={plano.id}
                        prioridade={prioridade}
                        plano={plano}
                        tarefas={tarefas}
                        responsaveis={responsaveis}
                        computeStatusPlano={computeStatusPlano}
                        onAddTarefa={onAddTarefa}
                        onUpdateTarefa={onUpdateTarefa}
                        onDeleteTarefa={onDeleteTarefa}
                        onUpdatePlano={onUpdatePlano}
                        loggedUserResponsavelId={loggedUserResponsavelId}
                        isAdmin={viewerSeesAllTarefasNoPlano}
                        myResponsavelIds={myResponsavelIds}
                        canWritePlano={oc.planoWrite}
                        canWriteTarefa={oc.tarefaWrite}
                        canAssignTarefa={oc.tarefaAssign}
                        canDeleteTarefa={oc.tarefaDelete}
                        allUsers={responsaveis.map((r) => r.nome)}
                        onAddObserver={onAddObserver}
                        onRemoveObserver={onRemoveObserver}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {abaAtiva === 'tarefas' && (
        <div className="p-4">
          {visibleTarefas.length === 0 ? (
            <div className="px-4 py-10 text-sm text-slate-500 text-center">
              Nenhuma tarefa operacional disponível {seesAllPrioridades ? '' : 'para o seu usuário'}.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Situação</th>
                      <th className="px-3 py-2 text-left">Tarefa</th>
                      <th className="px-3 py-2 text-left">Responsável</th>
                      <th className="px-3 py-2 text-left">Prazo</th>
                      <th className="px-3 py-2 text-left">Plano</th>
                      <th className="px-2 py-2 text-right w-16">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {visibleTarefasAtivas.map((t) => {
                      const pl = planoById.get(t.plano_id);
                      const respNome = displayNomeDonoPrioridade(t.responsavel_id, responsaveis) || t.responsavel_id;
                      const cfg = TAREFA_CFG[t.status_tarefa] || TAREFA_CFG.Pendente;
                      const StatusIcon = cfg.Icon;
                      return (
                        <React.Fragment key={t.id}>
                          <tr className="hover:bg-slate-800/20 transition-colors">
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                disabled={!oc.tarefaWrite}
                                onClick={() => {
                                  const idx = TAREFA_ORDER.indexOf(t.status_tarefa);
                                  const next = TAREFA_ORDER[(idx + 1) % TAREFA_ORDER.length];
                                  onUpdateTarefa(t.id, { status_tarefa: next });
                                }}
                                className="text-slate-500 hover:text-slate-200 disabled:opacity-40 disabled:pointer-events-none"
                                title="Alternar status"
                              >
                                <StatusIcon
                                  size={14}
                                  className={
                                    t.status_tarefa === 'Bloqueada'
                                      ? 'text-red-400'
                                      : t.status_tarefa === 'Concluida' || t.status_tarefa === 'EmExecucao'
                                        ? 'text-blue-300'
                                        : 'text-slate-500'
                                  }
                                />
                              </button>
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={t.status_tarefa}
                                onChange={(e) => onUpdateTarefa(t.id, { status_tarefa: e.target.value as StatusTarefa })}
                                disabled={!oc.tarefaWrite}
                                className="text-[10px] font-semibold px-2 py-1 rounded-sm uppercase bg-slate-800 border border-slate-700 text-slate-200 outline-none focus:border-slate-500 disabled:opacity-50"
                              >
                                <option value="Pendente">PENDENTE</option>
                                <option value="EmExecucao">EM EXECUÇÃO</option>
                                <option value="Bloqueada">BLOQUEADA</option>
                                <option value="Concluida">CONCLUÍDA</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <p className="text-slate-200 text-sm">{t.titulo}</p>
                              {t.descricao ? <p className="text-[11px] text-slate-500 truncate">{t.descricao}</p> : null}
                            </td>
                            <td className="px-3 py-2 text-slate-300">{respNome || '—'}</td>
                            <td className="px-3 py-2 text-slate-400">{fmtDate(t.data_vencimento)}</td>
                            <td className="px-3 py-2 text-slate-400">{pl?.titulo ?? '—'}</td>
                            <td className="px-2 py-2 text-right">
                              {oc.tarefaDelete && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteTarefa(t.id)}
                                  className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                  title="Excluir"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                          <tr className="bg-slate-900/40">
                            <td colSpan={7} className="px-3 pb-2">
                              <ObserversPanel
                                entity="tarefa"
                                entityId={t.id}
                                observers={t.observadores ?? []}
                                allUsers={responsaveis.map((r) => r.nome)}
                                onAdd={(userId) => onAddObserver?.('tarefa', t.id, userId)}
                                onRemove={(userId) => onRemoveObserver?.('tarefa', t.id, userId)}
                                canEdit={oc.tarefaWrite}
                              />
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {visibleTarefasConcluidas.length > 0 && (
                <section className="bg-slate-900/30 border border-slate-800/80 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setTarefasConcluidasOpen((o) => !o)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-slate-400">
                      {tarefasConcluidasOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <CheckCircle size={14} className="text-blue-400/80" />
                      <span className="text-xs font-medium text-slate-300">Concluídas</span>
                    </div>
                    <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded tabular-nums">
                      {visibleTarefasConcluidas.length}
                    </span>
                  </button>
                  {tarefasConcluidasOpen && (
                    <div className="overflow-x-auto border-t border-slate-800/80">
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-800/60">
                          {visibleTarefasConcluidas.map((t) => {
                            const pl = planoById.get(t.plano_id);
                            const respNome = displayNomeDonoPrioridade(t.responsavel_id, responsaveis) || t.responsavel_id;
                            return (
                              <tr key={t.id} className="hover:bg-slate-800/20 transition-colors">
                                <td className="px-3 py-2 w-[90px]">
                                  <CheckCircle size={14} className="text-blue-300" />
                                </td>
                                <td className="px-3 py-2 w-[120px]">
                                  <span className="text-[10px] font-semibold px-2 py-1 rounded-sm uppercase bg-slate-800 border border-slate-700 text-slate-300">
                                    CONCLUÍDA
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  <p className="text-slate-300 text-sm line-through">{t.titulo}</p>
                                  {t.descricao ? <p className="text-[11px] text-slate-600 truncate">{t.descricao}</p> : null}
                                </td>
                                <td className="px-3 py-2 text-slate-400">{respNome || '—'}</td>
                                <td className="px-3 py-2 text-slate-500">{fmtDate(t.data_vencimento)}</td>
                                <td className="px-3 py-2 text-slate-500">{pl?.titulo ?? '—'}</td>
                                <td className="px-2 py-2 text-right w-16">
                                  {oc.tarefaDelete && (
                                    <button
                                      type="button"
                                      onClick={() => onDeleteTarefa(t.id)}
                                      className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                      title="Excluir"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

