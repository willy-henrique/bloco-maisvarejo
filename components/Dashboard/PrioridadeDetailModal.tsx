/**
 * Detalhe da prioridade: dados da prioridade + planos de ataque + tarefas por plano.
 * Ao clicar na prioridade (Kanban/Table) abre este painel.
 */

import React, { useState, useMemo } from 'react';
import { Prioridade, PlanoDeAtaque, Tarefa, StatusPlano, StatusTarefa } from '../../types';
import { getPrazoAlertaLabel } from '../../utils/dateAlerts';
import { Modal } from '../Shared/Modal';
import { PlanoModal } from './PlanoModal';
import { TarefaModal } from './TarefaModal';
import {
  Pencil,
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
  User,
  Calendar,
  ListTodo,
  Target,
  Clock,
} from 'lucide-react';

function formatUpdatedAt(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface PrioridadeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  prioridade: Prioridade | null;
  planos: PlanoDeAtaque[];
  tarefas: Tarefa[];
  onEditPrioridade: (p: Prioridade) => void;
  onAddPlano: (data: Omit<PlanoDeAtaque, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdatePlano: (id: string, data: Partial<PlanoDeAtaque>) => void;
  onDeletePlano: (id: string) => void;
  onAddTarefa: (data: Omit<Tarefa, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateTarefa: (id: string, data: Partial<Tarefa>) => void;
  onDeleteTarefa: (id: string) => void;
}

export const PrioridadeDetailModal: React.FC<PrioridadeDetailModalProps> = ({
  isOpen,
  onClose,
  prioridade,
  planos,
  tarefas,
  onEditPrioridade,
  onAddPlano,
  onUpdatePlano,
  onDeletePlano,
  onAddTarefa,
  onUpdateTarefa,
  onDeleteTarefa,
}) => {
  const [planoModalOpen, setPlanoModalOpen] = useState(false);
  const [selectedPlano, setSelectedPlano] = useState<PlanoDeAtaque | null>(null);
  const [tarefaModalOpen, setTarefaModalOpen] = useState(false);
  const [selectedTarefa, setSelectedTarefa] = useState<Tarefa | null>(null);
  const [tarefaPlanoId, setTarefaPlanoId] = useState<string>('');
  const [expandedPlanos, setExpandedPlanos] = useState<Set<string>>(new Set());

  const planosDaPrioridade = useMemo(
    () => (prioridade ? planos.filter((pl) => pl.prioridade_id === prioridade.id) : []),
    [prioridade, planos]
  );

  const tarefasByPlano = useMemo(() => {
    const map = new Map<string, Tarefa[]>();
    tarefas.forEach((t) => {
      if (!map.has(t.plano_id)) map.set(t.plano_id, []);
      map.get(t.plano_id)!.push(t);
    });
    map.forEach((list) => list.sort((a, b) => a.updatedAt - b.updatedAt));
    return map;
  }, [tarefas]);

  const togglePlano = (id: string) => {
    setExpandedPlanos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openPlanoModal = (plano: PlanoDeAtaque | null) => {
    setSelectedPlano(plano);
    setPlanoModalOpen(true);
  };

  const openTarefaModal = (planoId: string, tarefa: Tarefa | null) => {
    setTarefaPlanoId(planoId);
    setSelectedTarefa(tarefa);
    setTarefaModalOpen(true);
  };

  if (!prioridade) return null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={prioridade.titulo || 'Prioridade'}
        maxWidth="xl"
      >
        <div className="flex flex-col gap-6 max-h-[80vh] overflow-hidden">
          {/* Cabeçalho da prioridade */}
          <div className="shrink-0 border-b border-slate-800 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">{prioridade.titulo}</h2>
                {prioridade.descricao && (
                  <p className="text-sm text-slate-400 mt-1">{prioridade.descricao}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <User size={12} />
                    {prioridade.dono_id}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {prioridade.data_alvo
                      ? new Date(prioridade.data_alvo).toLocaleDateString('pt-BR')
                      : '—'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded font-medium ${
                      prioridade.status_prioridade === 'Bloqueado'
                        ? 'bg-red-900/40 text-red-400'
                        : prioridade.status_prioridade === 'Concluído'
                        ? 'bg-emerald-900/40 text-emerald-400'
                        : 'bg-amber-900/40 text-amber-400'
                    }`}
                  >
                    {prioridade.status_prioridade}
                  </span>
                  <span className="flex items-center gap-1 text-slate-500" title="Última atualização">
                    <Clock size={12} />
                    {formatUpdatedAt(prioridade.updatedAt)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onEditPrioridade(prioridade)}
                className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors shrink-0"
                title="Editar prioridade"
              >
                <Pencil size={18} />
              </button>
            </div>
          </div>

          {/* Planos de ataque */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <Target size={16} />
                Planos de ataque
              </h3>
              <button
                type="button"
                onClick={() => openPlanoModal(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
              >
                <Plus size={14} />
                Novo plano
              </button>
            </div>
            <div className="space-y-2 overflow-y-auto min-h-0 pr-1">
              {planosDaPrioridade.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">
                  Nenhum plano de ataque. Clique em &quot;Novo plano&quot; para criar um eixo 5W2H.
                </p>
              ) : (
                planosDaPrioridade.map((plano) => {
                  const isExpanded = expandedPlanos.has(plano.id);
                  const planoTarefas = tarefasByPlano.get(plano.id) ?? [];
                  const bloqueadas = planoTarefas.filter((t) => t.status_tarefa === StatusTarefa.BLOQUEADA).length;
                  return (
                    <div
                      key={plano.id}
                      className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden"
                    >
                      <div className="flex items-center gap-2 p-3">
                        <button
                          type="button"
                          onClick={() => togglePlano(plano.id)}
                          className="p-0.5 text-slate-500 hover:text-slate-300"
                        >
                          {isExpanded ? (
                            <ChevronDown size={18} />
                          ) : (
                            <ChevronRight size={18} />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-200 truncate">
                            {plano.titulo || plano.what || 'Sem título'}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {plano.who_id} · {plano.status_plano}
                            {bloqueadas > 0 && (
                              <span className="text-red-400 ml-1">
                                · {bloqueadas} tarefa(s) bloqueada(s)
                              </span>
                            )}
                            <span className="text-slate-600 ml-1">· {formatUpdatedAt(plano.updatedAt)}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => openTarefaModal(plano.id, null)}
                            className="p-2 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                            title="Nova tarefa"
                          >
                            <ListTodo size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => openPlanoModal(plano)}
                            className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                            title="Editar plano"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm('Tem certeza que deseja excluir este plano de ataque e todas as tarefas vinculadas?')) {
                                onDeletePlano(plano.id);
                              }
                            }}
                            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                            title="Excluir plano"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-slate-700/50 p-2 bg-slate-900/30">
                          {plano.how && (
                            <p className="text-[11px] text-slate-500 mb-2 px-2">
                              <span className="text-slate-400">Como:</span> {plano.how}
                            </p>
                          )}
                          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider px-2 mb-1.5">
                            Tarefas ({planoTarefas.length})
                          </p>
                          {planoTarefas.length === 0 ? (
                            <p className="text-[11px] text-slate-500 px-2 py-1">
                              Nenhuma tarefa. Clique no ícone de lista para adicionar.
                            </p>
                          ) : (
                            <ul className="space-y-1">
                              {planoTarefas.map((t) => (
                                <li
                                  key={t.id}
                                  title={`Atualizado em ${formatUpdatedAt(t.updatedAt)}`}
                                  className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-800/50 hover:bg-slate-800/80 group"
                                >
                                  <span
                                    className={`w-2 h-2 rounded-full shrink-0 ${
                                      t.status_tarefa === StatusTarefa.BLOQUEADA
                                        ? 'bg-red-500'
                                        : t.status_tarefa === StatusTarefa.CONCLUIDA
                                        ? 'bg-emerald-500'
                                        : t.status_tarefa === StatusTarefa.EM_EXECUCAO
                                        ? 'bg-amber-500'
                                        : 'bg-slate-500'
                                    }`}
                                  />
                                  <span className="flex-1 text-xs text-slate-200 truncate">
                                    {t.titulo}
                                  </span>
                                  {getPrazoAlertaLabel(t.data_vencimento) && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 shrink-0">
                                      {getPrazoAlertaLabel(t.data_vencimento)}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-slate-500 shrink-0">
                                    {t.responsavel_id}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => openTarefaModal(plano.id, t)}
                                    className="p-1 text-slate-500 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Editar tarefa"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (window.confirm('Tem certeza que deseja excluir esta tarefa operacional?')) {
                                        onDeleteTarefa(t.id);
                                      }
                                    }}
                                    className="p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Excluir tarefa"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </Modal>

      <PlanoModal
        isOpen={planoModalOpen}
        onClose={() => {
          setPlanoModalOpen(false);
          setSelectedPlano(null);
        }}
        prioridadeId={prioridade.id}
        item={selectedPlano}
        onSave={(data) => {
          onAddPlano(data);
          setPlanoModalOpen(false);
        }}
        onUpdate={(id, data) => {
          onUpdatePlano(id, data);
          setPlanoModalOpen(false);
        }}
      />

      <TarefaModal
        isOpen={tarefaModalOpen}
        onClose={() => {
          setTarefaModalOpen(false);
          setSelectedTarefa(null);
          setTarefaPlanoId('');
        }}
        planoId={tarefaPlanoId}
        item={selectedTarefa}
        onSave={(data) => {
          onAddTarefa(data);
          setTarefaModalOpen(false);
        }}
        onUpdate={(id, data) => {
          onUpdateTarefa(id, data);
          setTarefaModalOpen(false);
        }}
      />
    </>
  );
};
