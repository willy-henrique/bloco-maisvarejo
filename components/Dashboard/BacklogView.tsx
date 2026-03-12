/**
 * Back Log: visão integrada ao Prioridades e Matriz 5W2H.
 * Itens em demanda (não concluídos) em lista profissional; concluídos em seção colapsada.
 */

import React, { useMemo } from 'react';
import { ActionItem, ItemStatus } from '../../types';
import { formatDateOnlyPtBr } from '../../utils/date';
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  PlayCircle,
  Calendar,
  User,
  Lock,
  FileText,
} from 'lucide-react';

interface BacklogViewProps {
  items: ActionItem[];
  onUpdate: (id: string, data: Partial<ActionItem>) => void;
  onDelete: (id: string) => void;
  onEditItem: (item: ActionItem) => void;
  onStatusChange: (id: string, status: ItemStatus) => void;
  onAddNew?: () => void;
}

export const BacklogView: React.FC<BacklogViewProps> = ({
  items,
  onUpdate,
  onDelete,
  onEditItem,
  onStatusChange,
  onAddNew,
}) => {
  const { backlogItems } = useMemo(() => {
    // Apenas itens com status BACKLOG (EM DEMANDA) — itens promovidos saem daqui
    const rest = items
      .filter((i) => i.status === ItemStatus.BACKLOG)
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    return { backlogItems: rest };
  }, [items]);

  const moveToPrioridade = (id: string) => onStatusChange(id, ItemStatus.ACTIVE);

  return (
    <div className="max-w-5xl mx-auto space-y-6 w-full min-w-0">
      {/* BackLog (não concluídos) */}
      <section className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            BackLog
          </h3>
          <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-1 rounded tabular-nums">
            {backlogItems.length} {backlogItems.length === 1 ? 'item' : 'itens'}
          </span>
        </div>
        <div className="overflow-x-auto overflow-touch">
          {backlogItems.length === 0 ? (
            <div className="py-10 px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
              <p className="text-slate-500 text-center sm:text-left">
                Nenhum item em demanda. Use &quot;Nova Iniciativa&quot; para registrar uma nova ideia
                ou mova itens do Kanban de volta para o BackLog.
              </p>
              {onAddNew && (
                <button
                  type="button"
                  onClick={onAddNew}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-medium text-white shadow-sm transition-colors"
                >
                  <PlayCircle size={14} />
                  Nova iniciativa
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead>
                <tr className="text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-800 bg-slate-900/60">
                  <th className="px-3 py-2.5 font-semibold">O quê?</th>
                  <th className="px-3 py-2.5 font-semibold hidden sm:table-cell">Quem / Quando</th>
                  <th className="px-3 py-2.5 font-semibold text-right w-32">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {backlogItems.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-800/30 transition-colors group"
                  >
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => onEditItem(item)}
                        className="text-left w-full text-sm font-medium text-slate-100 hover:text-blue-400 transition-colors line-clamp-2"
                      >
                        {item.what || '—'}
                      </button>
                      <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 sm:hidden">
                        {item.who && `${item.who} · `}
                        {item.when && formatDateOnlyPtBr(item.when)}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <User size={10} />
                        {item.who || '—'}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                        <Calendar size={10} />
                        {item.when ? formatDateOnlyPtBr(item.when) : '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => moveToPrioridade(item.id)}
                          className="inline-flex items-center justify-center px-3 py-1.5 text-[11px] font-medium rounded-full bg-blue-600/90 hover:bg-blue-500 text-white transition-colors shadow-sm"
                          title="Mover para Prioridade Ativa (Kanban)"
                        >
                          <PlayCircle size={14} className="mr-1" />
                          Prioridade Ativa
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(item.id)}
                          className="inline-flex items-center justify-center p-2 rounded-full text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Excluir iniciativa do BackLog"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
};
