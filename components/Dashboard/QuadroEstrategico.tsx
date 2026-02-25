/**
 * Quadro Estratégico — Ritmo de Gestão.
 * Tabela: PRIORIDADE ATIVA | DONO | EM EXECUÇÃO | BLOQUEADOS | CONCLUIDAS.
 * Máx 3 prioridades ativas. Ao clicar na linha: ver planos de ataque e estado consolidado.
 */

import React, { useMemo, useState, useEffect } from 'react';
import type { Prioridade, PlanoDeAtaque, Tarefa, Responsavel, StatusPrioridade } from '../../types';
import { Target, ChevronDown, ChevronRight, AlertCircle, ListTodo, X, Trash2 } from 'lucide-react';

const HEADERS = ['PRIORIDADE ATIVA', 'DONO', 'EM EXECUÇÃO', 'BLOQUEADOS', 'CONCLUIDAS', ''] as const;

function nomeResponsavel(id: string, responsaveis: Responsavel[]): string {
  return responsaveis.find((r) => r.id === id)?.nome ?? id;
}

interface QuadroEstrategicoProps {
  prioridades: Prioridade[];
  planos: PlanoDeAtaque[];
  tarefas: Tarefa[];
  responsaveis: Responsavel[];
  computeStatusPlano: (planoId: string) => 'Execucao' | 'Bloqueado' | 'Concluido' | null;
  onStatusChange: (id: string, status: StatusPrioridade) => void;
  onOpenPrioridade?: (p: Prioridade) => void;
  podeAdicionarPrioridade: boolean;
  onAddPrioridade?: () => void;
  onDeletePrioridade?: (p: Prioridade) => void;
   forceOpenConcluidas?: boolean;
}

export const QuadroEstrategico: React.FC<QuadroEstrategicoProps> = ({
  prioridades,
  planos,
  responsaveis,
  computeStatusPlano,
  onOpenPrioridade,
  podeAdicionarPrioridade,
  onAddPrioridade,
  onDeletePrioridade,
  forceOpenConcluidas,
}) => {
  const [concluidosOpen, setConcluidosOpen] = useState(false);

  useEffect(() => {
    if (forceOpenConcluidas) {
      setConcluidosOpen(true);
    }
  }, [forceOpenConcluidas]);

  const prioridadesAtivas = useMemo(
    () => prioridades.filter((p) => p.status_prioridade !== 'Concluido'),
    [prioridades]
  );
  const prioridadesConcluidas = useMemo(
    () => prioridades.filter((p) => p.status_prioridade === 'Concluido'),
    [prioridades]
  );

  /** Para cada prioridade, agrupa títulos dos planos por status (em execução, bloqueado, concluído). */
  const celulasPorPrioridade = useMemo(() => {
    const map = new Map<
      string,
      { emExecucao: string[]; bloqueado: string[]; concluido: string[] }
    >();
    for (const p of prioridades) {
      const planosDaPrioridade = planos.filter((pl) => pl.prioridade_id === p.id);
      const emExecucao: string[] = [];
      const bloqueado: string[] = [];
      const concluido: string[] = [];
      for (const pl of planosDaPrioridade) {
        const status = computeStatusPlano(pl.id) ?? pl.status_plano;
        const titulo = pl.titulo || pl.what || '—';
        if (status === 'Execucao') emExecucao.push(titulo);
        else if (status === 'Bloqueado') bloqueado.push(titulo);
        else if (status === 'Concluido') concluido.push(titulo);
      }
      map.set(p.id, { emExecucao, bloqueado, concluido });
    }
    return map;
  }, [prioridades, planos, computeStatusPlano]);

  const renderCelula = (textos: string[]) =>
    textos.length === 0 ? '—' : textos.join(', ');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Target className="text-slate-400" size={20} />
          <h2 className="text-lg font-semibold text-slate-100">Quadro Estratégico</h2>
        </div>
        <p className="text-xs text-slate-500">
          Prioridades ativas: {prioridadesAtivas.length} / 3
        </p>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto overflow-touch">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="bg-slate-800 text-slate-200 text-[11px] uppercase tracking-wider font-semibold">
                {HEADERS.map((h) => (
                  <th key={h} className="px-4 py-3 border-b border-slate-700">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {prioridadesAtivas.map((p) => {
                const base = celulasPorPrioridade.get(p.id) ?? {
                  emExecucao: [],
                  bloqueado: [],
                  concluido: [],
                };
                let emExecucao = base.emExecucao;
                let bloqueado = base.bloqueado;
                let concluido = base.concluido;
                if (!emExecucao.length && !bloqueado.length && !concluido.length) {
                  const textoBase = p.descricao || p.titulo || '';
                  if (p.status_prioridade === 'Execucao') emExecucao = [textoBase || 'Em execução'];
                  else if (p.status_prioridade === 'Bloqueado') bloqueado = [textoBase || 'Bloqueado'];
                  else if (p.status_prioridade === 'Concluido') concluido = [textoBase || 'Concluído'];
                }
                return (
                  <tr
                    key={p.id}
                    onClick={() => onOpenPrioridade?.(p)}
                    className="hover:bg-slate-800/50 transition-colors cursor-pointer select-none"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-slate-100 align-top">
                      {p.titulo || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 align-top">
                      {nomeResponsavel(p.dono_id, responsaveis)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 align-top">
                      {renderCelula(emExecucao)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 align-top">
                      {renderCelula(bloqueado)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 align-top">
                      {renderCelula(concluido)}
                    </td>
                    <td className="px-2 py-3 text-right align-top">
                      {onDeletePrioridade && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeletePrioridade(p);
                          }}
                          className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Excluir prioridade"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {prioridadesAtivas.length === 0 && (
          <div className="px-4 py-8 text-center text-slate-500 text-sm">
            Nenhuma prioridade ativa. Use &quot;Nova prioridade&quot; para começar.
          </div>
        )}
        {podeAdicionarPrioridade && onAddPrioridade && (
          <div className="px-4 pb-4 pt-0">
            <button
              type="button"
              onClick={onAddPrioridade}
              className="flex items-center justify-center gap-2 py-3 px-4 w-full rounded-lg border border-dashed border-slate-600 hover:border-slate-500 hover:bg-slate-800/40 text-slate-500 hover:text-slate-300 text-sm font-medium transition-colors"
            >
              + Nova prioridade
            </button>
          </div>
        )}
      </div>

      {prioridadesConcluidas.length > 0 && (
        <section className="bg-slate-900/30 border border-slate-800/80 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setConcluidosOpen((o) => !o)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-2 text-slate-400">
              {concluidosOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <span className="text-sm font-medium text-slate-300">Histórico de prioridades concluídas</span>
            </div>
            <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded tabular-nums">
              {prioridadesConcluidas.length}
            </span>
          </button>
          {concluidosOpen && (
            <div className="border-t border-slate-800/80 overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[640px]">
                <thead>
                  <tr className="bg-slate-900/60 text-slate-500 text-[10px] uppercase tracking-wider">
                    {HEADERS.map((h) => (
                      <th key={h} className="px-4 py-2 border-b border-slate-800 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {prioridadesConcluidas.map((p) => {
                    const base = celulasPorPrioridade.get(p.id) ?? {
                      emExecucao: [],
                      bloqueado: [],
                      concluido: [],
                    };
                    let emExecucao = base.emExecucao;
                    let bloqueado = base.bloqueado;
                    let concluido = base.concluido;
                    if (!emExecucao.length && !bloqueado.length && !concluido.length) {
                      concluido = [p.titulo || 'Concluído'];
                    }
                    return (
                      <tr
                        key={p.id}
                        onClick={() => onOpenPrioridade?.(p)}
                        className="hover:bg-slate-800/30 text-slate-400 cursor-pointer select-none"
                      >
                        <td className="px-4 py-2 text-sm">{p.titulo || '—'}</td>
                        <td className="px-4 py-2 text-sm">{nomeResponsavel(p.dono_id, responsaveis)}</td>
                        <td className="px-4 py-2 text-sm text-slate-500">{renderCelula(emExecucao)}</td>
                        <td className="px-4 py-2 text-sm text-slate-500">{renderCelula(bloqueado)}</td>
                        <td className="px-4 py-2 text-sm text-slate-500">{renderCelula(concluido)}</td>
                        <td className="px-2 py-2 text-right">
                          {onDeletePrioridade && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeletePrioridade(p);
                              }}
                              className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Excluir prioridade"
                            >
                              <Trash2 size={12} />
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
  );
};

/** Modal de detalhe da prioridade: planos de ataque, tarefas bloqueadas, estado consolidado */
interface DetalhePrioridadeModalProps {
  prioridade: Prioridade;
  planos: PlanoDeAtaque[];
  tarefas: Tarefa[];
  responsaveis: Responsavel[];
  computeStatusPlano: (planoId: string) => 'Execucao' | 'Bloqueado' | 'Concluido' | null;
  onClose: () => void;
  onStatusPlano?: (planoId: string, status: 'Execucao' | 'Bloqueado' | 'Concluido') => void;
  onUpdatePrioridade: (id: string, updates: Partial<Prioridade>) => void | Promise<void>;
}

export const DetalhePrioridadeModal: React.FC<DetalhePrioridadeModalProps> = ({
  prioridade,
  planos,
  tarefas,
  responsaveis,
  computeStatusPlano,
  onClose,
  onStatusPlano,
}) => {
  const planosDaPrioridade = useMemo(
    () => planos.filter((pl) => pl.prioridade_id === prioridade.id),
    [planos, prioridade.id]
  );

  const tarefasBloqueadas = useMemo(() => {
    const planoIds = new Set(planosDaPrioridade.map((p) => p.id));
    return tarefas.filter((t) => planoIds.has(t.plano_id) && t.status_tarefa === 'Bloqueada');
  }, [planosDaPrioridade, tarefas]);

  const [titulo, setTitulo] = useState(prioridade.titulo);
  const [descricao, setDescricao] = useState(prioridade.descricao ?? '');
  const [dono, setDono] = useState(prioridade.dono_id);
  const [dataAlvo, setDataAlvo] = useState(
    new Date(prioridade.data_alvo).toISOString().slice(0, 10)
  );
  const [status, setStatus] = useState<StatusPrioridade>(prioridade.status_prioridade);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setTitulo(prioridade.titulo);
    setDescricao(prioridade.descricao ?? '');
    setDono(prioridade.dono_id);
    setDataAlvo(new Date(prioridade.data_alvo).toISOString().slice(0, 10));
    setStatus(prioridade.status_prioridade);
  }, [prioridade]);

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      await onUpdatePrioridade(prioridade.id, {
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        dono_id: dono.trim(),
        data_alvo: new Date(dataAlvo).getTime(),
        status_prioridade: status,
      });
      onClose();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-100">Editar prioridade ativa</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Prioridade ativa</label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Descrição</label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 resize-none"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px] text-slate-500">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Dono</label>
                <input
                  type="text"
                  value={dono}
                  onChange={(e) => setDono(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Data alvo</label>
                <input
                  type="date"
                  value={dataAlvo}
                  onChange={(e) => setDataAlvo(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as StatusPrioridade)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-500"
                >
                  <option value="Execucao">Em execução</option>
                  <option value="Bloqueado">Bloqueado</option>
                  <option value="Concluido">Concluído</option>
                </select>
              </div>
            </div>
          </div>

          {tarefasBloqueadas.length > 0 && (
            <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-400 font-medium text-sm mb-2">
                <AlertCircle size={16} />
                Bloqueios ({tarefasBloqueadas.length})
              </div>
              <ul className="text-xs text-slate-300 space-y-1">
                {tarefasBloqueadas.map((t) => (
                  <li key={t.id}>
                    {t.titulo}
                    {t.bloqueio_motivo && ` — ${t.bloqueio_motivo}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <ListTodo size={14} />
              Planos de ataque
            </h4>
            <ul className="space-y-2">
              {planosDaPrioridade.length === 0 ? (
                <li className="text-xs text-slate-500">Nenhum plano de ataque ainda.</li>
              ) : (
                planosDaPrioridade.map((pl) => {
                  const computed = computeStatusPlano(pl.id);
                  const status = computed ?? pl.status_plano;
                  return (
                    <li key={pl.id} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-200">{pl.titulo}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded ${
                          status === 'Bloqueado' ? 'bg-red-900/40 text-red-400' :
                          status === 'Concluido' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-amber-900/40 text-amber-400'
                        }`}>
                          {status}
                        </span>
                      </div>
                      {pl.how && <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{pl.how}</p>}
                      <p className="text-[10px] text-slate-600 mt-1">
                        Dono: {nomeResponsavel(pl.who_id, responsaveis)} · {new Date(pl.when_inicio).toLocaleDateString('pt-BR')} – {new Date(pl.when_fim).toLocaleDateString('pt-BR')}
                      </p>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-slate-600 text-xs text-slate-300 hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={salvando}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-xs text-white"
          >
            {salvando ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
};
