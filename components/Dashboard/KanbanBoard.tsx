import React, { useMemo, useState, useEffect } from 'react';
import { ActionItem, ItemStatus } from '../../types';
import { formatDateOnlyPtBr } from '../../utils/date';
import { Badge } from '../Shared/Badge';
import { Clock, User, Plus, ChevronDown, ChevronRight, CheckCircle, Pencil, Trash2 } from 'lucide-react';

interface KanbanBoardProps {
  items: ActionItem[];
  onStatusChange: (id: string, status: ItemStatus) => void;
  onOpenItem?: (item: ActionItem) => void;
  onAddInColumn?: (status: ItemStatus) => void;
  onDelete?: (id: string) => void;
  /** Quando true, força abrir a seção de concluidos. */
  forceOpenConcluidos?: boolean;
}

const BOARD_COLUMNS = [
  { id: ItemStatus.ACTIVE, label: 'Prioridade Ativa', color: 'bg-blue-500' },
  { id: ItemStatus.EXECUTING, label: 'Em Execução', color: 'bg-amber-500' },
  { id: ItemStatus.BLOCKED, label: 'Bloqueado', color: 'bg-red-500' },
];

const ALL_STATUS_OPTIONS = [
  ...BOARD_COLUMNS,
  { id: ItemStatus.COMPLETED, label: 'Concluído', color: 'bg-emerald-500' },
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ items, onStatusChange, onOpenItem, onAddInColumn, onDelete, forceOpenConcluidos }) => {
  const [concluidosOpen, setConcluidosOpen] = useState(false);

  useEffect(() => {
    if (forceOpenConcluidos) {
      setConcluidosOpen(true);
    }
  }, [forceOpenConcluidos]);

  const completedItems = useMemo(
    () => items.filter((i) => i.status === ItemStatus.COMPLETED).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [items]
  );

  return (
    <div className="space-y-6">
      <div className="max-lg:overflow-x-auto max-lg:overflow-y-visible max-lg:pb-2 overflow-touch max-lg:-mx-1 max-lg:px-1">
        <div className="max-lg:flex max-lg:gap-4 max-lg:min-w-max lg:grid lg:grid-cols-3 gap-4">
          {BOARD_COLUMNS.map((column) => (
            <div key={column.id} className="flex flex-col bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden max-lg:min-w-[280px] max-lg:flex-shrink-0 lg:min-w-0">
              <div className="px-3 py-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${column.color}`} />
                  <h3 className="font-medium text-[11px] uppercase tracking-wider text-slate-400">{column.label}</h3>
                </div>
                <span className="bg-slate-800 text-slate-500 text-[10px] px-1.5 py-0.5 rounded tabular-nums">
                  {items.filter((i) => i.status === column.id).length}
                </span>
              </div>
              <div className="p-2 flex flex-col gap-2 min-h-[320px]">
                {items
                  .filter((item) => item.status === column.id)
                  .map((item) => (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpenItem?.(item)}
                      onKeyDown={(e) => e.key === 'Enter' && onOpenItem?.(item)}
                      className="bg-slate-800/60 p-3 rounded border border-slate-700/50 hover:border-slate-600 hover:ring-1 hover:ring-slate-500/50 transition-all cursor-pointer group focus:outline-none focus:ring-1 focus:ring-blue-500/50 touch-manipulation active:bg-slate-800/80"
                    >
                      <div className="flex justify-between items-start gap-1 mb-1.5">
                        <Badge type="urgency" value={item.urgency} />
                        <div className="flex items-center gap-0.5 shrink-0">
                          <select
                            value={item.status}
                            onChange={(e) => onStatusChange(item.id, e.target.value as ItemStatus)}
                            className="bg-slate-700/80 border border-slate-600 text-[10px] font-medium rounded px-1.5 py-1 text-slate-200 outline-none cursor-pointer max-w-[110px]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {ALL_STATUS_OPTIONS.map((col) => (
                              <option key={col.id} value={col.id} className="bg-slate-900">
                                {col.label}
                              </option>
                            ))}
                          </select>
                          {onDelete && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(item.id);
                              }}
                              className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 opacity-60 hover:opacity-100 transition-all touch-manipulation"
                              title="Excluir"
                              aria-label="Excluir iniciativa"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      <h4 className="text-xs font-medium text-slate-100 mb-1.5 leading-tight line-clamp-2">
                        {item.what}
                      </h4>
                      <p className="text-[10px] text-slate-500 mb-2 line-clamp-2">{item.why}</p>
                      {item.where && (
                        <p className="text-[10px] text-slate-500 mb-1 line-clamp-1">Onde: {item.where}</p>
                      )}
                      <div className="flex flex-col gap-1 border-t border-slate-700/50 pt-2">
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <User size={10} />
                          <span className="text-slate-400">{item.who}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <Clock size={10} />
                          <span>{formatDateOnlyPtBr(item.when)}</span>
                        </div>
                        {item.notes && (
                          <p className="text-[10px] text-slate-500 line-clamp-2 pt-1 border-t border-slate-700/50">
                            {item.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                {onAddInColumn && (
                  <button
                    type="button"
                    onClick={() => onAddInColumn(column.id)}
                    className="mt-1 flex items-center justify-center gap-2 py-3 px-3 min-h-[44px] rounded border border-dashed border-slate-600 hover:border-slate-500 hover:bg-slate-800/40 text-slate-500 hover:text-slate-300 text-[11px] font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-slate-500 touch-manipulation"
                  >
                    <Plus size={14} />
                    Novo módulo
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Concluídos: sumem do board; abrir para ver detalhes e editar */}
      {completedItems.length > 0 && (
        <section className="bg-slate-900/30 border border-slate-800/80 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setConcluidosOpen((o) => !o)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-2 text-slate-400">
              {concluidosOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <CheckCircle size={16} className="text-emerald-500/80" />
              <span className="text-sm font-medium text-slate-300">Concluídos</span>
              <span className="text-[11px] text-slate-500 hidden sm:inline">— abrir para ver detalhes e editar</span>
            </div>
            <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded tabular-nums">
              {completedItems.length}
            </span>
          </button>
          {concluidosOpen && (
            <div className="border-t border-slate-800/80 p-3 flex flex-col gap-2 max-h-[360px] overflow-y-auto">
              {completedItems.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenItem?.(item)}
                  onKeyDown={(e) => e.key === 'Enter' && onOpenItem?.(item)}
                  className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 hover:border-emerald-500/40 hover:ring-1 hover:ring-emerald-500/30 transition-all cursor-pointer flex items-center gap-3 text-left group focus:outline-none focus:ring-1 focus:ring-emerald-500/50 touch-manipulation"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge type="urgency" value={item.urgency} />
                      <span className="text-[10px] text-slate-500">
                        {item.who} · {item.when ? formatDateOnlyPtBr(item.when) : '—'}
                      </span>
                    </div>
                    <h4 className="text-sm font-medium text-slate-100 line-clamp-1">{item.what}</h4>
                    {item.why && <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{item.why}</p>}
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 group-hover:text-emerald-400 transition-colors">
                    <Pencil size={12} />
                    Abrir detalhes
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
