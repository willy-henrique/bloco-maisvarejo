/**
 * Visão em tabela das prioridades (nível estratégico). Sem 5W2H — isso vem nos Planos (Fase 2).
 */

import React, { useMemo, useState } from 'react';
import { Prioridade, PrioridadeStatus } from '../../types';
import { getPrazoAlertaLabel } from '../../utils/dateAlerts';
import { Trash2, Pencil, ChevronDown, ChevronRight, CheckCircle } from 'lucide-react';

interface PrioridadeTableProps {
  prioridades: Prioridade[];
  onUpdate: (id: string, data: Partial<Prioridade>) => void;
  onDelete: (id: string) => void;
  onEditItem?: (item: Prioridade) => void;
}

export const PrioridadeTable: React.FC<PrioridadeTableProps> = ({
  prioridades,
  onUpdate,
  onDelete,
  onEditItem,
}) => {
  const [concluidosOpen, setConcluidosOpen] = useState(false);

  const { ativas, concluidos } = useMemo(() => {
    const concl = prioridades.filter((p) => p.status_prioridade === PrioridadeStatus.CONCLUIDO);
    const ativ = prioridades.filter((p) => p.status_prioridade !== PrioridadeStatus.CONCLUIDO);
    concl.sort((a, b) => b.updatedAt - a.updatedAt);
    return { ativas: ativ, concluidos: concl };
  }, [prioridades]);

  return (
    <div className="space-y-6">
      <div className="w-full overflow-x-auto overflow-touch rounded-lg border border-slate-800 bg-slate-900/50 -mx-1 px-1 max-lg:scroll-px-2">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-slate-900/80 text-slate-400 text-[10px] uppercase tracking-wider border-b border-slate-800">
              <th className="px-4 py-3 font-semibold">Título</th>
              <th className="px-4 py-3 font-semibold">Descrição</th>
              <th className="px-4 py-3 font-semibold">Dono</th>
              <th className="px-4 py-3 font-semibold">Data início</th>
              <th className="px-4 py-3 font-semibold">Data alvo</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold w-24">Atualizado</th>
              <th className="px-4 py-3 font-semibold text-center w-20">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {ativas.map((item) => (
              <tr
                key={item.id}
                className="hover:bg-slate-800/30 transition-colors group"
              >
                <td className="px-4 py-3 min-w-[160px]">
                  <button
                    type="button"
                    onClick={() => onEditItem?.(item)}
                    className="text-left text-sm font-medium text-slate-100 hover:text-blue-400 transition-colors line-clamp-2"
                  >
                    {item.titulo || '—'}
                  </button>
                </td>
                <td className="px-4 py-3 min-w-[180px] text-xs text-slate-400 line-clamp-2">
                  {item.descricao || '—'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-300">{item.dono_id || '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {item.data_inicio
                    ? new Date(item.data_inicio).toLocaleDateString('pt-BR')
                    : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  <div className="flex flex-col gap-0.5">
                    {item.data_alvo
                      ? new Date(item.data_alvo).toLocaleDateString('pt-BR')
                      : '—'}
                    {getPrazoAlertaLabel(item.data_alvo) && (
                      <span className="text-[9px] text-amber-400">{getPrazoAlertaLabel(item.data_alvo)}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={item.status_prioridade}
                    onChange={(e) =>
                      onUpdate(item.id, {
                        status_prioridade: e.target.value as PrioridadeStatus,
                      })
                    }
                    className="bg-slate-800/50 border border-slate-700 text-xs font-medium rounded py-2 px-2 outline-none text-slate-200 focus:border-slate-500 w-full max-w-[130px] cursor-pointer"
                  >
                    {Object.values(PrioridadeStatus).map((s) => (
                      <option key={s} value={s} className="bg-slate-900">
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-[10px] text-slate-500" title={new Date(item.updatedAt).toLocaleString('pt-BR')}>
                  {new Date(item.updatedAt).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-center gap-1">
                    {onEditItem && (
                      <button
                        type="button"
                        onClick={() => onEditItem(item)}
                        className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                        title="Abrir detalhes"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Tem certeza que deseja excluir esta prioridade e seus planos/tarefas associados?')) {
                          onDelete(item.id);
                        }
                      }}
                      className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {ativas.length === 0 && (
          <div className="py-16 text-center flex flex-col items-center gap-4">
            <p className="text-slate-400 text-sm font-medium">
              Nenhuma prioridade ativa. Use &quot;Nova prioridade&quot; no Dashboard ou promova um
              item do Backlog.
            </p>
          </div>
        )}
      </div>

      {concluidos.length > 0 && (
        <section className="bg-slate-900/30 border border-slate-800/80 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setConcluidosOpen((o) => !o)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-2 text-slate-400">
              {concluidosOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <CheckCircle size={16} className="text-emerald-500/80" />
              <span className="text-sm font-medium text-slate-300">Concluídos (histórico)</span>
            </div>
            <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded tabular-nums">
              {concluidos.length}
            </span>
          </button>
          {concluidosOpen && (
            <div className="border-t border-slate-800/80 overflow-x-auto overflow-touch">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-800/80 bg-slate-900/60">
                    <th className="px-3 py-2.5 font-semibold">Título</th>
                    <th className="px-3 py-2.5 font-semibold">Dono / Data alvo</th>
                    <th className="px-3 py-2.5 font-semibold text-right w-24">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {concluidos.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-3 py-2.5 text-sm font-medium text-slate-200">
                        {item.titulo || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500">
                        {item.dono_id || '—'} ·{' '}
                        {item.data_alvo
                          ? new Date(item.data_alvo).toLocaleDateString('pt-BR')
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {onEditItem && (
                          <button
                            type="button"
                            onClick={() => onEditItem(item)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                          >
                            <Pencil size={12} />
                            Abrir detalhes
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Tem certeza que deseja excluir esta prioridade concluída do histórico?')) {
                              onDelete(item.id);
                            }
                          }}
                          className="ml-1 p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
