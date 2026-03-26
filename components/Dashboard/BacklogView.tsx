/**
 * Back Log: visão integrada ao Prioridades e Matriz 5W2H.
 * Itens em demanda (não concluídos) em lista profissional; concluídos em seção colapsada.
 */

import React, { useMemo } from 'react';
import { ActionItem, ItemStatus } from '../../types';
import { formatDateOnlyPtBr } from '../../utils/date';
import {
  Trash2,
  PlayCircle,
  Calendar,
  User,
} from 'lucide-react';

export interface BacklogCapabilities {
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canWorkflow?: boolean;
}

interface BacklogViewProps {
  items: ActionItem[];
  onUpdate: (id: string, data: Partial<ActionItem>) => void;
  onDelete: (id: string) => void;
  onEditItem: (item: ActionItem) => void;
  onStatusChange: (id: string, status: ItemStatus) => void;
  onAddNew?: () => void;
  capabilities?: BacklogCapabilities;
}

export const BacklogView: React.FC<BacklogViewProps> = ({
  items,
  onUpdate,
  onDelete,
  onEditItem,
  onStatusChange,
  onAddNew,
  capabilities,
}) => {
  const cap = {
    canCreate: capabilities?.canCreate !== false,
    canEdit: capabilities?.canEdit !== false,
    canDelete: capabilities?.canDelete !== false,
    canWorkflow: capabilities?.canWorkflow !== false,
  };
  const backlogItems = useMemo(() => {
    // Itens em demanda (BACKLOG)
    const backlog = items
      .filter((i) => i.status === ItemStatus.BACKLOG)
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    return backlog;
  }, [items]);

  const moveToPrioridade = (id: string) => onStatusChange(id, ItemStatus.ACTIVE);

  return (
    <div className="max-w-5xl mx-auto space-y-6 w-full min-w-0">
      {/* Backlog (não concluídos) */}
      <section className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Backlog
          </h3>
          <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-1 rounded tabular-nums">
            {backlogItems.length} {backlogItems.length === 1 ? 'item' : 'itens'}
          </span>
        </div>
        <div className="overflow-x-auto overflow-touch">
          {backlogItems.length === 0 ? (
            <div className="py-10 px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
              <p className="text-slate-500 text-center sm:text-left">
                Nenhum item em demanda. Use &quot;Item Backlog&quot; para registrar uma nova ideia
                ou mova itens do Kanban de volta para o Backlog.
              </p>
              {onAddNew && cap.canCreate && (
                <button
                  type="button"
                  onClick={onAddNew}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-medium text-white shadow-sm transition-colors"
                >
                  <PlayCircle size={14} />
                  Item Backlog
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[640px]">
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
                        {cap.canWorkflow && (
                          <button
                            type="button"
                            onClick={() => moveToPrioridade(item.id)}
                            className="inline-flex items-center justify-center px-3 py-1.5 text-[11px] font-medium rounded-full bg-blue-600/90 hover:bg-blue-500 text-white transition-colors shadow-sm"
                            title="Mover para Priorizar (Kanban)"
                          >
                            <PlayCircle size={14} className="mr-1" />
                            Priorizar
                          </button>
                        )}
                        {cap.canDelete && (
                          <button
                            type="button"
                            onClick={() => onDelete(item.id)}
                            className="inline-flex items-center justify-center p-2 rounded-full text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Excluir iniciativa do Backlog"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
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
