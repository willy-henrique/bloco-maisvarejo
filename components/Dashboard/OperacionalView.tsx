import React, { useMemo, useState } from 'react';
import type { PlanoDeAtaque, Prioridade, Responsavel, Tarefa, StatusPlano, StatusTarefa } from '../../types';
import type { UserRole as UserRoleType } from '../../types/user';
import { CheckCircle, Play, Circle, AlertTriangle, Plus, ChevronDown, ChevronRight, Trash2, User, Calendar, Target, FileText } from 'lucide-react';

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
  Concluido: { label: 'Concluido', cls: 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/30' },
};

const TAREFA_ORDER: StatusTarefa[] = ['Pendente', 'EmExecucao', 'Bloqueada', 'Concluida'];

const TAREFA_CFG: Record<StatusTarefa, { label: string; cls: string; Icon: React.ElementType }> = {
  Concluida: { label: 'CONCLUÍDA', cls: 'text-emerald-400 bg-emerald-500/15', Icon: CheckCircle },
  EmExecucao: { label: 'EM EXECUÇÃO', cls: 'text-emerald-400 bg-emerald-500/15', Icon: Play },
  Pendente: { label: 'PENDENTE', cls: 'text-slate-400 bg-slate-700/60', Icon: Circle },
  Bloqueada: { label: 'BLOQUEADA', cls: 'text-red-400 bg-red-500/15', Icon: AlertTriangle },
};

type OperacionalProps = {
  prioridades: Prioridade[];
  planos: PlanoDeAtaque[];
  tarefas: Tarefa[];
  responsaveis: Responsavel[];
  computeStatusPlano: (planoId: string) => StatusPlano | null;
  loggedUserUid?: string | null;
  loggedUserName?: string | null;
  loggedUserRole?: UserRoleType | null;
  onAddTarefa: (t: Omit<Tarefa, 'id'>) => void;
  onUpdateTarefa: (id: string, u: Partial<Tarefa>) => void;
  onDeleteTarefa: (id: string) => void;
  onUpdatePlano: (id: string, u: Partial<PlanoDeAtaque>) => void;
  onDeletePlano: (id: string) => void;
};

const TarefaRow: React.FC<{
  tarefa: Tarefa;
  responsaveis: Responsavel[];
  onUpdate: (u: Partial<Tarefa>) => void;
  onDelete: () => void;
}> = ({ tarefa, responsaveis, onUpdate, onDelete }) => {
  const resp = responsaveis.find(
    (r) =>
      normStr(r.id) === normStr(tarefa.responsavel_id) ||
      normStr(r.nome) === normStr(tarefa.responsavel_id),
  );
  const displayNome = resp?.nome || tarefa.responsavel_id || '';
  const cfg = TAREFA_CFG[tarefa.status_tarefa] || TAREFA_CFG.Pendente;
  const StatusIcon = cfg.Icon;

  return (
    <tr className="hover:bg-slate-800/20 transition-colors">
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={() => {
            const idx = TAREFA_ORDER.indexOf(tarefa.status_tarefa);
            const next = TAREFA_ORDER[(idx + 1) % TAREFA_ORDER.length];
            onUpdate({ status_tarefa: next });
          }}
          className="text-slate-500 hover:text-slate-200"
          title="Alternar status"
        >
          <StatusIcon size={14} className={tarefa.status_tarefa === 'Bloqueada' ? 'text-red-400' : tarefa.status_tarefa === 'Concluida' || tarefa.status_tarefa === 'EmExecucao' ? 'text-emerald-400' : 'text-slate-500'} />
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
        <div className="flex items-center gap-2">
          <User size={12} className="text-slate-500" />
          <span className="truncate block max-w-[140px]">{displayNome}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-slate-400">{fmtDate(tarefa.data_vencimento)}</td>
      <td className="px-4 py-3">
        <select
          value={tarefa.status_tarefa}
          onChange={(e) => onUpdate({ status_tarefa: e.target.value as StatusTarefa })}
          className="text-[10px] font-semibold px-2 py-1 rounded-sm uppercase bg-slate-800 border border-slate-700 text-slate-200 outline-none focus:border-slate-500"
        >
          <option value="Pendente">PENDENTE</option>
          <option value="EmExecucao">EM EXECUÇÃO</option>
          <option value="Bloqueada">BLOQUEADA</option>
          <option value="Concluida">CONCLUÍDA</option>
        </select>
      </td>
      <td className="px-2 py-3 text-right w-16">
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Excluir"
        >
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
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
  loggedUserResponsavelNomeDisplay?: string;
  canEditResponsavel?: boolean;
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
  loggedUserResponsavelNomeDisplay,
  canEditResponsavel = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showAddTarefa, setShowAddTarefa] = useState(false);
  const [novaTarefa, setNovaTarefa] = useState({
    titulo: '',
    responsavel_id: loggedUserResponsavelId ?? '',
    data_vencimento: todayDateBR(),
    descricao: '',
  });

  const [respQuery, setRespQuery] = useState(loggedUserResponsavelNomeDisplay ?? '');
  const [showRespDropdown, setShowRespDropdown] = useState(false);

  const respOptions = useMemo(() => {
    if (!canEditResponsavel) return [];
    const q = normStr(respQuery);
    if (!q) return [];
    return responsaveis.filter((r) => normStr(r.nome).startsWith(q)).slice(0, 6);
  }, [canEditResponsavel, respQuery, responsaveis]);

  const computed = computeStatusPlano(plano.id);
  const status = (computed || plano.status_plano) as StatusPlano;
  const statusCfg = STATUS_CFG[status] || STATUS_CFG.Execucao;

  // No Operacional, o "Quem" deve ser o dono da PRIORIDADE (criador da prioridade),
  // igual ao padrão desejado no Tático.
  const donoPrioridade = responsaveis.find((r) => normStr(r.id) === normStr(prioridade.dono_id));
  const displayWho = donoPrioridade?.nome || prioridade.dono_id || '';
  const novaTarefaResponsavelNome =
    loggedUserResponsavelNomeDisplay ??
    responsaveis.find((r) => normStr(r.id) === normStr(novaTarefa.responsavel_id))?.nome ??
    novaTarefa.responsavel_id;

  const tarefasDoPlano = useMemo(
    () => tarefas.filter((t) => t.plano_id === plano.id),
    [tarefas, plano.id],
  );

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
    if (canEditResponsavel && !novaTarefa.responsavel_id.trim()) return;
    const parsedVenc = parseDateBR(novaTarefa.data_vencimento);
    if (!parsedVenc) return;
    onAddTarefa({
      plano_id: plano.id,
      titulo: novaTarefa.titulo.trim(),
      descricao: novaTarefa.descricao.trim(),
      // Segue o mesmo padrão do Tático: usa exatamente o valor digitado (sem fallback).
      responsavel_id: novaTarefa.responsavel_id.trim(),
      data_inicio: Date.now(),
      data_vencimento: parsedVenc,
      status_tarefa: 'Pendente',
      empresa: plano.empresa ?? prioridade.empresa,
    });
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
              <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                <Target size={9} /> PRIORIDADE
              </p>
              <p className="text-sm font-semibold text-slate-100 truncate">{prioridade.titulo}</p>
              <h4 className="text-lg font-bold text-slate-100 truncate">{plano.titulo}</h4>
              <div className="flex items-center gap-3 mt-1.5 text-[12px] text-slate-400 flex-wrap">
                {displayWho && (
                  <span className="inline-flex items-center gap-1">
                    <User size={12} className="text-slate-500" />
                    {displayWho}
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
                  <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest whitespace-nowrap">{label}</p>
                  <p className="text-[10px] text-slate-600">{sub}</p>
                </div>
                <div>
                  {type === 'textarea' ? (
                    <textarea
                      key={`${plano.id}-${key}`}
                      defaultValue={(plano[key] as string) || ''}
                      onBlur={(e) => handleUpdatePlano({ [key]: e.target.value } as Partial<PlanoDeAtaque>)}
                      rows={2}
                      className="w-full bg-transparent text-sm text-slate-200 outline-none resize-none border-b border-transparent focus:border-slate-600 transition-colors py-0.5 placeholder:text-slate-700"
                      placeholder={`${sub}...`}
                    />
                  ) : type === 'input' ? (
                    <input
                      key={`${plano.id}-${key}`}
                      defaultValue={(plano[key] as string) || ''}
                      onBlur={(e) => handleUpdatePlano({ [key]: e.target.value } as Partial<PlanoDeAtaque>)}
                      className="w-full bg-transparent text-sm text-slate-200 outline-none border-b border-transparent focus:border-slate-600 transition-colors py-0.5 placeholder:text-slate-700"
                      placeholder={`${sub}...`}
                    />
                  ) : type === 'date' ? (
                    <input
                      type="text"
                      defaultValue={formatDateBR(plano.when_fim)}
                      onBlur={(e) => {
                        const parsed = parseDateBR(e.target.value);
                        if (parsed) handleUpdatePlano({ when_fim: parsed });
                      }}
                      placeholder="dd/mm/yyyy"
                      className="bg-transparent text-sm text-slate-200 outline-none border-b border-transparent focus:border-slate-600 transition-colors py-0.5 placeholder:text-slate-700"
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
                        onBlur={(e) => handleUpdatePlano({ who_id: e.target.value })}
                        className="w-full bg-transparent text-sm text-slate-200 outline-none border-b border-transparent focus:border-slate-600 transition-colors py-0.5 placeholder:text-slate-700"
                        placeholder={`${sub}...`}
                      />
                    )
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
                onBlur={(e) => handleUpdatePlano({ how: e.target.value })}
                rows={3}
                className="w-full bg-transparent text-sm text-slate-200 outline-none resize-none border-b border-transparent focus:border-slate-600 transition-colors placeholder:text-slate-700"
                placeholder="Descreva como será executado..."
              />
            </div>
          </div>

          {/* Tasks (mantém o comportamento atual do Operacional) */}
          {tarefasDoPlano.length === 0 ? (
            <div className="px-4 py-6 text-center text-slate-500 text-sm border border-dashed border-slate-800 rounded-lg">
              Nenhuma tarefa ainda. Clique em &quot;Nova Tarefa&quot; para começar.
            </div>
          ) : (
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
                  {tarefasDoPlano.map((t) => (
                    <TarefaRow
                      key={t.id}
                      tarefa={t}
                      responsaveis={responsaveis}
                      onUpdate={(u) => onUpdateTarefa(t.id, u)}
                      onDelete={() => onDeleteTarefa(t.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              <FileText size={12} /> Tarefas
            </div>
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
              className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-2 rounded-lg transition-colors"
            >
              <Plus size={12} /> Nova Tarefa
            </button>
          </div>

          {showAddTarefa && (
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60 placeholder:text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">
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
                        const exact = responsaveis.find((r) => normStr(r.nome) === normStr(v));
                        setNovaTarefa((prev) => ({ ...prev, responsavel_id: exact?.id ?? '' }));
                        setShowRespDropdown(true);
                      }}
                      onBlur={() => {
                        if (!canEditResponsavel) return;
                        window.setTimeout(() => setShowRespDropdown(false), 150);
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/60 placeholder:text-slate-600"
                    />
                    {canEditResponsavel && showRespDropdown && respOptions.length > 0 && (
                      <div className="absolute left-0 right-0 z-20 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-lg max-h-40 overflow-auto">
                        {respOptions.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-[13px] text-slate-100 hover:bg-slate-800 transition-colors"
                            onMouseDown={(e) => {
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
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                    Prazo
                  </label>
                  <input
                    value={novaTarefa.data_vencimento}
                    onChange={(e) => setNovaTarefa((v) => ({ ...v, data_vencimento: e.target.value }))}
                    placeholder="dd/mm/yyyy"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/60 cursor-pointer appearance-none"
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
                    (canEditResponsavel && !novaTarefa.responsavel_id.trim())
                  }
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
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
  loggedUserRole,
  onAddTarefa,
  onUpdateTarefa,
  onDeleteTarefa,
  onUpdatePlano,
}) => {
  const isAdmin = loggedUserRole === 'administrador' || loggedUserRole === 'gerente';
  const loggedUserResponsavelNomeDisplay = loggedUserName ?? '';
  const loggedKeys = [loggedUserUid, loggedUserName]
    .filter((v) => !!v)
    .map((v) => normStr(v as string));

  // Em geral, "dono_id" da prioridade aponta para um responsavel (id), não para uid do login.
  // Então tentamos mapear o usuário logado para o responsavel.id via nome/id.
  const myResponsavelIds = useMemo(() => {
    const ids = new Set<string>();
    if (loggedUserUid) ids.add(normStr(loggedUserUid));
    if (loggedUserName) {
      const match = responsaveis.find((r) => normStr(r.nome) === normStr(loggedUserName));
      if (match) ids.add(normStr(match.id));
    }
    // Fallback: se dono_id estiver sendo salvo como nome direto.
    if (loggedUserName) ids.add(normStr(loggedUserName));
    return ids;
  }, [loggedUserUid, loggedUserName, responsaveis]);

  const loggedUserResponsavelId = useMemo(() => {
    const matchByName = loggedUserName
      ? responsaveis.find((r) => normStr(r.nome) === normStr(loggedUserName))
      : undefined;
    // Se não existir vínculo em "responsaveis", usa o nome da conta
    // para evitar exibir UID bruto na coluna Responsável.
    return matchByName?.id ?? (loggedUserName?.trim() || (loggedUserUid ? String(loggedUserUid) : ''));
  }, [loggedUserUid, loggedUserName, responsaveis]);

  const visiblePrioridades = useMemo(() => {
    if (isAdmin) return prioridades;
    if (myResponsavelIds.size > 0) {
      return prioridades.filter((p) => myResponsavelIds.has(normStr(p.dono_id)));
    }
    return prioridades.filter((p) => loggedKeys.includes(normStr(p.dono_id)));
  }, [prioridades, isAdmin, loggedKeys]);

  const prioridadeById = useMemo(() => {
    const map = new Map<string, Prioridade>();
    for (const p of visiblePrioridades) map.set(p.id, p);
    return map;
  }, [visiblePrioridades]);

  const visiblePlanos = useMemo(() => {
    const allowedPriorityIds = new Set(visiblePrioridades.map((p) => p.id));
    const list = planos.filter((pl) => allowedPriorityIds.has(pl.prioridade_id));
    list.sort((a, b) => a.when_fim - b.when_fim);
    return list;
  }, [planos, visiblePrioridades]);

  return (
    <section className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Operacional — Planos de Ataque
        </h3>
        <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-1 rounded tabular-nums">
          {visiblePlanos.length} {visiblePlanos.length === 1 ? 'plano' : 'planos'}
        </span>
      </div>

      {visiblePlanos.length === 0 ? (
        <div className="px-4 py-10 text-sm text-slate-500 text-center">
          Nenhum plano operacional disponível {isAdmin ? '' : 'para o seu usuário'}.
        </div>
      ) : (
        <div className="divide-y divide-slate-800/60 p-4 space-y-4">
          {visiblePlanos.map((plano) => {
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
                loggedUserResponsavelNomeDisplay={loggedUserResponsavelNomeDisplay}
                canEditResponsavel={isAdmin}
              />
            );
          })}
        </div>
      )}
    </section>
  );
};

