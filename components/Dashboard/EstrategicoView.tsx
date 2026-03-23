import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Prioridade,
  PlanoDeAtaque,
  Tarefa,
  Responsavel,
  StatusPlano,
  StatusTarefa,
} from '../../types';
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
} from 'lucide-react';

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
  tarefaWrite?: boolean;
  tarefaDelete?: boolean;
}

interface EstrategicoViewProps {
  prioridades: Prioridade[];
  planos: PlanoDeAtaque[];
  tarefas: Tarefa[];
  responsaveis: Responsavel[];
  computeStatusPlano: (id: string) => StatusPlano | null;
  onAddPrioridade: () => void;
  onUpdatePrioridade: (id: string, u: Partial<Prioridade>) => void;
  onDeletePrioridade: (p: Prioridade) => void;
  podeAdicionarPrioridade: boolean;
  onAddPlano: (p: Omit<PlanoDeAtaque, 'id'>) => void;
  onUpdatePlano: (id: string, u: Partial<PlanoDeAtaque>) => void;
  onDeletePlano: (id: string) => void;
  onAddTarefa: (t: Omit<Tarefa, 'id'>) => void;
  onUpdateTarefa: (id: string, u: Partial<Tarefa>) => void;
  onDeleteTarefa: (id: string) => void;
  loggedUserUid?: string;
  loggedUserRole?: 'administrador' | 'gerente' | 'usuario' | null;
  loggedUserName?: string | null;
  /** Quando definido, faz scroll até o bloco da prioridade no Tático */
  focusPrioridadeId?: string | null;
  /** Quando definido, mostra somente esta prioridade no Tático */
  onlyPrioridadeId?: string | null;
  estrategicoCaps?: EstrategicoCaps;
}

// ── TarefaRow ────────────────────────────────────────────────────────────────

const TarefaRow: React.FC<{
  tarefa: Tarefa;
  responsaveis: Responsavel[];
  onUpdate: (u: Partial<Tarefa>) => void;
  onDeleteTarefa: () => void;
  canWriteTarefa?: boolean;
  canDeleteTarefa?: boolean;
}> = ({ tarefa, responsaveis, onUpdate, onDeleteTarefa, canWriteTarefa = true, canDeleteTarefa = true }) => {
  const resp = responsaveis.find(
    (r) =>
      normStr(r.id) === normStr(tarefa.responsavel_id) ||
      normStr(r.nome) === normStr(tarefa.responsavel_id),
  );
  const displayNome = resp?.nome || tarefa.responsavel_id || '';
  const cfg = TAREFA_CFG[tarefa.status_tarefa] || TAREFA_CFG.Pendente;
  const StatusIcon = cfg.Icon;
  const isOverdue = tarefa.data_vencimento < Date.now() && tarefa.status_tarefa !== 'Concluida';

  return (
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
              onUpdate({ status_tarefa: next });
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
            <p className={`text-sm font-medium ${tarefa.status_tarefa === 'Concluida' ? 'line-through text-slate-500' : 'text-slate-200'}`}>
              {tarefa.titulo}
            </p>
            {tarefa.descricao && <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[280px]">{tarefa.descricao}</p>}
            {tarefa.status_tarefa === 'Bloqueada' && tarefa.bloqueio_motivo && (
              <p className="text-[11px] text-red-400/80 mt-0.5 flex items-center gap-1">
                <AlertTriangle size={10} /> {tarefa.bloqueio_motivo}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
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
            <input
              defaultValue={displayNome}
              onBlur={(e) => onUpdate({ responsavel_id: e.target.value })}
              placeholder="Responsável"
              className="bg-transparent border-b border-transparent focus:border-slate-600 outline-none text-xs text-slate-200 placeholder:text-slate-600 w-full max-w-[120px]"
            />
          ) : (
            <span className="text-xs text-slate-400 truncate max-w-[120px]">{displayNome || '—'}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-400 font-medium' : 'text-slate-400'}`}>
          {isOverdue && <AlertTriangle size={10} />}
          {fmtDate(tarefa.data_vencimento)}
        </span>
      </td>
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
            onClick={onDeleteTarefa}
            className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Excluir tarefa"
          >
            <Trash2 size={13} />
          </button>
        )}
      </td>
    </tr>
  );
};

// ── PlanoCard ────────────────────────────────────────────────────────────────

const PlanoCard: React.FC<{
  plano: PlanoDeAtaque;
  tarefas: Tarefa[];
  responsaveis: Responsavel[];
  computeStatusPlano: (id: string) => StatusPlano | null;
  onUpdate: (u: Partial<PlanoDeAtaque>) => void;
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
  /** Se true, permite editar o responsável (admin/gerente) */
  canEditResponsavel?: boolean;
  canWritePlano?: boolean;
  canDeletePlano?: boolean;
  canWriteTarefa?: boolean;
  canDeleteTarefa?: boolean;
}> = ({
  plano,
  tarefas,
  responsaveis,
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
  canEditResponsavel = false,
  canWritePlano = true,
  canDeletePlano = true,
  canWriteTarefa = true,
  canDeleteTarefa = true,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showAddTarefa, setShowAddTarefa] = useState(false);
  const [novaTarefa, setNovaTarefa] = useState({
    titulo: '',
    responsavel_id: loggedUserResponsavelId ?? '',
    data_vencimento: todayDateBR(),
    descricao: '',
  });

  const computed = computeStatusPlano(plano.id);
  const status = (computed || plano.status_plano) as StatusPlano;
  const statusCfg = STATUS_CFG[status] || STATUS_CFG.Execucao;
  const resp = responsaveis.find((r) => normStr(r.id) === normStr(plano.who_id));
  const displayWho = whoOverrideName || resp?.nome || plano.who_id || '—';
  const novaTarefaResponsavelNome =
    loggedUserResponsavelNomeDisplay ??
    responsaveis.find((r) => normStr(r.id) === normStr(novaTarefa.responsavel_id))?.nome ??
    novaTarefa.responsavel_id;

  const [respQuery, setRespQuery] = useState(novaTarefaResponsavelNome);
  const [showRespDropdown, setShowRespDropdown] = useState(false);

  // Atualiza o texto do input quando o estado base muda (ex: ao abrir "Nova Tarefa").
  useEffect(() => {
    if (!canEditResponsavel) return;
    setRespQuery(novaTarefaResponsavelNome);
  }, [canEditResponsavel, novaTarefaResponsavelNome]);

  const respOptions = useMemo(() => {
    if (!canEditResponsavel) return [];
    const q = normStr(respQuery);
    if (!q) return [];
    return responsaveis
      .filter((r) => normStr(r.nome).startsWith(q))
      .slice(0, 6);
  }, [canEditResponsavel, respQuery, responsaveis]);
  const concluidas = tarefas.filter((t) => t.status_tarefa === 'Concluida').length;
  const totalTarefas = tarefas.length;
  const progresso = totalTarefas > 0 ? (concluidas / totalTarefas) * 100 : 0;

  const handleAddTarefa = () => {
    if (!novaTarefa.titulo.trim()) return;
    const parsedVenc = parseDateBR(novaTarefa.data_vencimento);
    if (!parsedVenc) return;
    if (canEditResponsavel && !novaTarefa.responsavel_id.trim()) return;
    onAddTarefa({
      plano_id: plano.id,
      titulo: novaTarefa.titulo.trim(),
      descricao: novaTarefa.descricao.trim(),
      responsavel_id: novaTarefa.responsavel_id.trim(),
      data_inicio: Date.now(),
      data_vencimento: parsedVenc,
      status_tarefa: 'Pendente',
      empresa: plano.empresa,
    });
    setNovaTarefa({
      titulo: '',
      responsavel_id: loggedUserResponsavelId ?? '',
      data_vencimento: todayDateBR(),
      descricao: '',
    });
    setRespQuery(loggedUserResponsavelNomeDisplay ?? '');
    setShowAddTarefa(false);
  };

  const W2H: Array<{ key: keyof PlanoDeAtaque; label: string; sub: string; type: 'textarea' | 'input' | 'date' | 'resp' }> = [
    { key: 'what', label: 'WHAT', sub: 'O que', type: 'textarea' },
    { key: 'why', label: 'WHY', sub: 'Por que', type: 'textarea' },
    { key: 'who_id', label: 'WHO', sub: 'Quem', type: 'resp' },
    { key: 'when_fim', label: 'WHEN', sub: 'Quando', type: 'date' },
    { key: 'where', label: 'WHERE', sub: 'Onde', type: 'input' },
    { key: 'how_much', label: 'HOW MUCH', sub: 'Quanto', type: 'input' },
  ];

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
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
        {canDeletePlano && (
          <button type="button" onClick={onDelete} className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors shrink-0" title="Excluir plano">
            <Trash2 size={13} />
          </button>
        )}
      </div>

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
                      onBlur={canWritePlano ? (e) => onUpdate({ [key]: e.target.value }) : undefined}
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
                      onBlur={canWritePlano ? (e) => onUpdate({ [key]: e.target.value }) : undefined}
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
                              if (parsed) onUpdate({ when_fim: parsed });
                            }
                          : undefined
                      }
                      readOnly={!canWritePlano}
                      disabled={!canWritePlano}
                      placeholder="dd/mm/yyyy"
                      className="bg-transparent text-sm text-slate-200 outline-none border-b border-transparent focus:border-slate-600 transition-colors py-0.5 placeholder:text-slate-700 disabled:opacity-60"
                    />
                  ) : (
                    key === 'who_id' ? (
                      <div className="w-full bg-transparent text-sm text-slate-200 outline-none border-b border-transparent py-0.5">
                        {displayWho || '—'}
                      </div>
                    ) : (
                      <input
                        key={`${plano.id}-${key}`}
                        defaultValue={displayWho}
                        onBlur={canWritePlano ? (e) => onUpdate({ who_id: e.target.value }) : undefined}
                        readOnly={!canWritePlano}
                        disabled={!canWritePlano}
                        className="w-full bg-transparent text-sm text-slate-200 outline-none border-b border-transparent focus:border-slate-600 transition-colors py-0.5 placeholder:text-slate-700 disabled:opacity-60"
                        placeholder={`${sub}...`}
                      />
                    )
                  )}
                </div>
              </React.Fragment>
            ))}
          </div>

          {/* HOW section */}
          <div className="px-6 pb-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4">
              <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-0.5">HOW — EXECUÇÃO</p>
              <p className="text-[10px] text-slate-600 mb-3">Como será feito</p>
              <textarea
                key={`${plano.id}-how`}
                defaultValue={plano.how || ''}
                onBlur={canWritePlano ? (e) => onUpdate({ how: e.target.value }) : undefined}
                readOnly={!canWritePlano}
                disabled={!canWritePlano}
                rows={3}
                className="w-full bg-transparent text-sm text-slate-200 outline-none resize-none border-b border-transparent focus:border-slate-600 transition-colors placeholder:text-slate-700 disabled:opacity-60"
                placeholder="Descreva como será executado..."
              />
            </div>
          </div>

          {/* Tasks section */}
          <div className="border-t border-slate-800">
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tarefas</span>
                {tarefas.length > 0 && (
                  <>
                    <div className="w-20 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${tarefas.length > 0 ? (concluidas / tarefas.length) * 100 : 0}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-500 tabular-nums">{concluidas}/{tarefas.length} concluídas</span>
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
                        if (canEditResponsavel) {
                          setRespQuery(loggedUserResponsavelNomeDisplay ?? '');
                          setShowRespDropdown(false);
                        }
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

            {tarefas.length > 0 && (
              <div className="overflow-x-hidden">
                <table className="w-full table-fixed">
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
                    {tarefas.map((t) => (
                      <TarefaRow
                        key={t.id}
                        tarefa={t}
                        responsaveis={responsaveis}
                        onUpdate={(u) => onUpdateTarefa(t.id, u)}
                        onDeleteTarefa={() => onDeleteTarefa(t.id)}
                        canWriteTarefa={canWriteTarefa}
                        canDeleteTarefa={canDeleteTarefa}
                      />
                    ))}
                  </tbody>
                </table>
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
                <div className="min-w-[140px]">
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">
                    Responsável
                  </label>
                  <div className="relative">
                    <input
                      value={canEditResponsavel ? respQuery : novaTarefaResponsavelNome}
                      readOnly={!canEditResponsavel}
                      placeholder="Nome do responsável"
                      onChange={(e) => {
                        if (!canEditResponsavel) return;
                        const v = e.target.value;
                        setRespQuery(v);
                        // Só garante "responsavel_id" quando o usuário selecionar um item da lista.
                        setNovaTarefa((prev) => ({ ...prev, responsavel_id: '' }));
                        setShowRespDropdown(true);
                      }}
                      onBlur={() => {
                        if (!canEditResponsavel) return;
                        window.setTimeout(() => setShowRespDropdown(false), 150);
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-slate-600 placeholder:text-slate-600"
                    />
                    {canEditResponsavel && showRespDropdown && respOptions.length > 0 && (
                      <div className="absolute left-0 right-0 z-20 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-lg max-h-40 overflow-auto">
                        {respOptions.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-[13px] text-slate-100 hover:bg-slate-800 transition-colors"
                            onMouseDown={(e) => {
                              // evita o blur antes do clique.
                              e.preventDefault();
                              setNovaTarefa((prev) => ({ ...prev, responsavel_id: r.id }));
                              setRespQuery(r.nome);
                              setShowRespDropdown(false);
                            }}
                          >
                            {r.nome}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
                      (canEditResponsavel && !novaTarefa.responsavel_id.trim())
                    }
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors">Adicionar</button>
                  <button type="button" onClick={() => setShowAddTarefa(false)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded-lg transition-colors">Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── DetalhePrioridade (não usado diretamente na nova visão, mantido por compatibilidade) ──

const DetalhePrioridade: React.FC<{
  prioridade: Prioridade;
  planos: PlanoDeAtaque[];
  todasTarefas: Tarefa[];
  responsaveis: Responsavel[];
  computeStatusPlano: (id: string) => StatusPlano | null;
  onBack: () => void;
  onUpdatePrioridade: (u: Partial<Prioridade>) => void;
  onAddPlano: (p: Omit<PlanoDeAtaque, 'id' | 'prioridade_id'>) => void;
  onUpdatePlano: (id: string, u: Partial<PlanoDeAtaque>) => void;
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
  const [novoPlano, setNovoPlano] = useState({ titulo: '', who_id: '', when_fim: '' });

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
    });
    setNovoPlano({ titulo: '', who_id: '', when_fim: '' });
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
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Planos de Ataque</p>
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
            <div className="min-w-[150px]">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">
                Responsável
              </label>
              <input
                value={novoPlano.who_id}
                onChange={(e) => setNovoPlano((v) => ({ ...v, who_id: e.target.value }))}
                placeholder="Nome do responsável"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-200 outline-none focus:border-slate-600 placeholder:text-slate-600"
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
          <div className="py-10 text-center text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">Nenhum plano de ataque ainda. Clique em &quot;Novo Plano&quot; para começar.</div>
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
          />
        ))}
      </div>
    </div>
  );
};

// ── PrioridadeCard (nova visão em card, com planos e tarefas em cascata) ────

const PrioridadeCard: React.FC<{
  prioridade: Prioridade;
  planos: PlanoDeAtaque[];
  todasTarefas: Tarefa[];
  responsaveis: Responsavel[];
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
  /** Se true, permite editar o responsável (admin/gerente) */
  canEditResponsavel?: boolean;
  /** Permite atualizar o dono da prioridade (admin) */
  onUpdatePrioridadeOwner?: (ownerId: string) => void;
  /** Ação para arquivar a prioridade (status Concluido) */
  onArchive?: () => void;
  onAddPlano: (p: Omit<PlanoDeAtaque, 'id' | 'prioridade_id'>) => void;
  onUpdatePlano: (id: string, u: Partial<PlanoDeAtaque>) => void;
  onDeletePlano: (id: string) => void;
  onAddTarefa: (t: Omit<Tarefa, 'id'>) => void;
  onUpdateTarefa: (id: string, u: Partial<Tarefa>) => void;
  onDeleteTarefa: (id: string) => void;
  canPrioridadeWrite?: boolean;
  canPlanoWrite?: boolean;
  canPlanoDelete?: boolean;
  canTarefaWrite?: boolean;
  canTarefaDelete?: boolean;
}> = ({
  prioridade,
  planos,
  todasTarefas,
  responsaveis,
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
  canTarefaDelete = true,
}) => {
  const [showAddPlano, setShowAddPlano] = useState(false);
  const [novoPlano, setNovoPlano] = useState({
    titulo: '',
    who_id: loggedUserResponsavelId ?? '',
    when_fim: todayDateBR(),
  });

  const dono = responsaveis.find((r) => normStr(r.id) === normStr(prioridade.dono_id));
  const statusCfg =
    STATUS_CFG[prioridade.status_prioridade as StatusPlano] || STATUS_CFG.Execucao;
  const planoWhoOverrideName = priorityOwnerNameOverride ?? (dono?.nome ?? prioridade.dono_id);
  const loggedUserResponsavelNome =
    loggedUserResponsavelNomeDisplay ??
    responsaveis.find((r) => normStr(r.id) === normStr(loggedUserResponsavelId ?? ''))?.nome ??
    loggedUserResponsavelId ??
    '';

  const [respQueryPlano, setRespQueryPlano] = useState(loggedUserResponsavelNome);
  const [showRespPlanoDropdown, setShowRespPlanoDropdown] = useState(false);
  const [ownerQuery, setOwnerQuery] = useState(dono?.nome ?? prioridade.dono_id ?? '');
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);

  const respPlanoOptions = useMemo(() => {
    if (!canEditResponsavel) return [];
    const q = normStr(respQueryPlano);
    if (!q) return [];
    return responsaveis.filter((r) => normStr(r.nome).startsWith(q)).slice(0, 6);
  }, [canEditResponsavel, respQueryPlano, responsaveis]);

  const ownerOptions = useMemo(() => {
    if (!canEditResponsavel) return [];
    const q = normStr(ownerQuery);
    if (!q) return [];
    return responsaveis.filter((r) => normStr(r.nome).startsWith(q)).slice(0, 6);
  }, [canEditResponsavel, ownerQuery, responsaveis]);

  useEffect(() => {
    setOwnerQuery(dono?.nome ?? prioridade.dono_id ?? '');
  }, [dono?.nome, prioridade.dono_id]);

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
    });
    setNovoPlano({
      titulo: '',
      who_id: loggedUserResponsavelId ?? '',
      when_fim: todayDateBR(),
    });
    setShowAddPlano(false);
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-4 flex items-start gap-3 hover:bg-slate-900/80 transition-colors text-left"
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
              <h3 className="text-lg font-bold text-slate-100">{prioridade.titulo}</h3>
              <div className="flex items-center gap-3 mt-1.5 text-[12px] text-slate-400 flex-wrap">
                {showDonoName && (
                  canPrioridadeWrite && canEditResponsavel && onUpdatePrioridadeOwner ? (
                    <div className="relative">
                      <input
                        value={ownerQuery}
                        onChange={(e) => {
                          setOwnerQuery(e.target.value);
                          setShowOwnerDropdown(true);
                        }}
                        onBlur={() => {
                          window.setTimeout(() => setShowOwnerDropdown(false), 150);
                        }}
                        placeholder="Dono da prioridade"
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[12px] text-slate-200 outline-none focus:border-slate-600 placeholder:text-slate-600 w-[180px]"
                      />
                      {showOwnerDropdown && ownerOptions.length > 0 && (
                        <div className="absolute left-0 z-20 mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg shadow-lg max-h-40 overflow-auto">
                          {ownerOptions.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-[13px] text-slate-100 hover:bg-slate-800 transition-colors"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setOwnerQuery(r.nome);
                                onUpdatePrioridadeOwner(r.id);
                                setShowOwnerDropdown(false);
                              }}
                            >
                              {r.nome}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    dono && (
                      <span className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-slate-700 text-slate-300 text-[9px] font-bold flex items-center justify-center">
                          {initials(dono.nome)}
                        </span>
                        {dono.nome}
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
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-100 tabular-nums">
                  {planos.length}
                </p>
                <p className="text-[11px] text-slate-500">planos de ataque</p>
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
      </button>

      {expanded && (
        <div className="border-t border-slate-800 p-4 pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Planos de Ataque
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
                      setRespQueryPlano(loggedUserResponsavelNome);
                      setShowRespPlanoDropdown(false);
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
              <div className="min-w-[150px]">
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">
                  Responsável
                </label>
              <div className="relative">
                <input
                  value={canEditResponsavel ? respQueryPlano : loggedUserResponsavelNome}
                  readOnly={!canEditResponsavel}
                  placeholder="Nome do responsável"
                  onChange={(e) => {
                    if (!canEditResponsavel) return;
                    const v = e.target.value;
                    setRespQueryPlano(v);
                    setShowRespPlanoDropdown(true);
                    const exact = responsaveis.find((r) => normStr(r.nome) === normStr(v));
                    setNovoPlano((prev) => ({ ...prev, who_id: exact?.id ?? '' }));
                  }}
                  onBlur={() => {
                    if (!canEditResponsavel) return;
                    window.setTimeout(() => setShowRespPlanoDropdown(false), 150);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-200 outline-none focus:border-slate-600 placeholder:text-slate-600"
                />
                {canEditResponsavel && showRespPlanoDropdown && respPlanoOptions.length > 0 && (
                  <div className="absolute left-0 right-0 z-20 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-lg max-h-40 overflow-auto">
                    {respPlanoOptions.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-[13px] text-slate-100 hover:bg-slate-800 transition-colors"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setRespQueryPlano(r.nome);
                          setNovoPlano((prev) => ({ ...prev, who_id: r.id }));
                          setShowRespPlanoDropdown(false);
                        }}
                      >
                        {r.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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

          {planos.length === 0 && !showAddPlano && (
            <div className="py-6 text-center text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
              Nenhum plano de ataque ainda. Clique em &quot;Novo Plano&quot; para começar.
            </div>
          )}

          <div className="space-y-3 pt-1">
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
                whoOverrideName={planoWhoOverrideName}
                lockWhoToOverrideName={lockPlanoWhoToPriorityDono}
                loggedUserResponsavelId={loggedUserResponsavelId}
                loggedUserResponsavelNomeDisplay={loggedUserResponsavelNomeDisplay}
                canEditResponsavel={canEditResponsavel}
                canWritePlano={canPlanoWrite}
                canDeletePlano={canPlanoDelete}
                canWriteTarefa={canTarefaWrite}
                canDeleteTarefa={canTarefaDelete}
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
    computeStatusPlano,
    onAddPrioridade,
    onUpdatePrioridade,
    podeAdicionarPrioridade,
    onAddPlano,
    onUpdatePlano,
    onDeletePlano,
    onAddTarefa,
    onUpdateTarefa,
    onDeleteTarefa,
    loggedUserUid,
    loggedUserRole,
    loggedUserName,
    focusPrioridadeId,
    onlyPrioridadeId,
    estrategicoCaps,
  } = props;

  const caps = {
    prioridadeWrite: estrategicoCaps?.prioridadeWrite !== false,
    planoWrite: estrategicoCaps?.planoWrite !== false,
    planoDelete: estrategicoCaps?.planoDelete !== false,
    tarefaWrite: estrategicoCaps?.tarefaWrite !== false,
    tarefaDelete: estrategicoCaps?.tarefaDelete !== false,
  };

  const isAdmin = loggedUserRole === 'administrador' || loggedUserRole === 'gerente';
  const canEditResponsavel = loggedUserRole === 'administrador';

  useEffect(() => {
    if (!focusPrioridadeId) return;
    const el = document.getElementById(`prioridade-card-${focusPrioridadeId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusPrioridadeId]);

  const myResponsavelIds = useMemo(() => {
    const ids = new Set<string>();
    if (loggedUserUid) ids.add(normStr(loggedUserUid));
    if (loggedUserName) {
      const match = responsaveis.find((r) => normStr(r.nome) === normStr(loggedUserName));
      if (match) ids.add(normStr(match.id));
    }
    // Fallback: caso o dono_id esteja sendo salvo como "nome" ao invés de id.
    if (loggedUserName) ids.add(normStr(loggedUserName));
    return ids;
  }, [loggedUserUid, loggedUserName, responsaveis]);

  const loggedUserResponsavelId = useMemo(() => {
    const matchByName = loggedUserName
      ? responsaveis.find((r) => normStr(r.nome) === normStr(loggedUserName))
      : undefined;
    // Se não existir vínculo em "responsaveis", usa o nome da conta
    // para evitar salvar/exibir UID bruto como responsável.
    return matchByName?.id ?? (loggedUserName?.trim() || loggedUserUid || '');
  }, [loggedUserName, loggedUserUid, responsaveis]);

  const loggedUserResponsavelNomeDisplay = loggedUserName ?? '';

  const filteredPrioridades = useMemo(() => {
    if (isAdmin) return prioridades;
    if (myResponsavelIds.size > 0) {
      return prioridades.filter((p) => myResponsavelIds.has(normStr(p.dono_id)));
    }
    return prioridades;
  }, [prioridades, isAdmin, myResponsavelIds]);

  const ativas = useMemo(() => {
    const list = filteredPrioridades.filter((p) => p.status_prioridade !== 'Concluido');
    if (!onlyPrioridadeId) return list;
    return list.filter((p) => p.id === onlyPrioridadeId);
  }, [filteredPrioridades, onlyPrioridadeId]);

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
        <button
          type="button"
          onClick={scrollToBlocks}
          className="shrink-0 p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-900"
          aria-label="Ir para prioridades"
          title="Ir para prioridades"
        >
          <Target size={18} className="text-blue-400" />
        </button>
      </div>

      <div ref={blocksRef} className="space-y-4">
        {ativas.length === 0 ? (
          <div className="px-5 py-12 text-center text-slate-500 text-sm border border-slate-800/60 rounded-xl bg-slate-900/30">
            Nenhuma prioridade ativa {isAdmin ? 'disponível.' : 'para você.'}
          </div>
        ) : (
          ativas.map((p) => {
            const dono = responsaveis.find((r) => normStr(r.id) === normStr(p.dono_id));
            // Sempre exibir o nome de quem criou a PRIORIDADE (p.dono_id).
            // Se não acharmos no cadastro de responsaveis, usa o nome do usuário logado (modo não-admin).
            const priorityOwnerNameOverride = dono?.nome ?? (isAdmin ? p.dono_id : (loggedUserName ?? p.dono_id));
            return (
              <div key={p.id} id={`prioridade-card-${p.id}`}>
                <PrioridadeCard
                  prioridade={p}
                  planos={planos.filter((pl) => pl.prioridade_id === p.id)}
                  todasTarefas={tarefas}
                  responsaveis={responsaveis}
                  computeStatusPlano={computeStatusPlano}
                  expanded={true}
                  onToggle={() => {}}
                  showDonoName={isAdmin}
                  priorityOwnerNameOverride={priorityOwnerNameOverride}
                  lockPlanoWhoToPriorityDono={!isAdmin}
                  loggedUserResponsavelId={loggedUserResponsavelId}
                  loggedUserResponsavelNomeDisplay={loggedUserResponsavelNomeDisplay}
                  canEditResponsavel={canEditResponsavel}
                  onUpdatePrioridadeOwner={
                    onUpdatePrioridade
                      ? (ownerId) => onUpdatePrioridade(p.id, { dono_id: ownerId })
                      : undefined
                  }
                  onArchive={
                    onUpdatePrioridade
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
                  canPrioridadeWrite={caps.prioridadeWrite}
                  canPlanoWrite={caps.planoWrite}
                  canPlanoDelete={caps.planoDelete}
                  canTarefaWrite={caps.tarefaWrite}
                  canTarefaDelete={caps.tarefaDelete}
                />
              </div>
            );
          })
        )}
      </div>

      {podeAdicionarPrioridade && caps.prioridadeWrite && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onAddPrioridade}
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 px-3 py-2 rounded-lg transition-colors w-full border border-dashed border-slate-700 hover:border-slate-600"
          >
            <Plus size={14} /> Adicionar prioridade
          </button>
        </div>
      )}
    </div>
  );
};
