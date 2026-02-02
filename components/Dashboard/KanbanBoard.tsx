import React from 'react';
import { ActionItem, ItemStatus } from '../../types';
import { Badge } from '../Shared/Badge';
import { Clock, User, Plus } from 'lucide-react';

interface KanbanBoardProps {
  items: ActionItem[];
  onStatusChange: (id: string, status: ItemStatus) => void;
  onOpenItem?: (item: ActionItem) => void;
  onAddInColumn?: (status: ItemStatus) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ items, onStatusChange, onOpenItem, onAddInColumn }) => {
  const columns = [
    { id: ItemStatus.ACTIVE, label: 'Prioridade Ativa', color: 'bg-blue-500' },
    { id: ItemStatus.EXECUTING, label: 'Em Execução', color: 'bg-amber-500' },
    { id: ItemStatus.BLOCKED, label: 'Bloqueado', color: 'bg-red-500' },
    { id: ItemStatus.COMPLETED, label: 'Concluído', color: 'bg-emerald-500' },
  ];

  return (
    <div className="max-lg:overflow-x-auto max-lg:overflow-y-visible max-lg:pb-2 overflow-touch max-lg:-mx-1 max-lg:px-1">
      <div className="max-lg:flex max-lg:gap-4 max-lg:min-w-max lg:grid lg:grid-cols-4 gap-4">
      {columns.map(column => (
        <div key={column.id} className="flex flex-col bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden max-lg:min-w-[280px] max-lg:flex-shrink-0 lg:min-w-0">
          <div className="px-3 py-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${column.color}`} />
              <h3 className="font-medium text-[11px] uppercase tracking-wider text-slate-400">{column.label}</h3>
            </div>
            <span className="bg-slate-800 text-slate-500 text-[10px] px-1.5 py-0.5 rounded tabular-nums">
              {items.filter(i => i.status === column.id).length}
            </span>
          </div>
          <div className="p-2 flex flex-col gap-2 min-h-[320px]">
            {items
              .filter(item => item.status === column.id)
              .map(item => (
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
                    <select
                      value={item.status}
                      onChange={(e) => onStatusChange(item.id, e.target.value as ItemStatus)}
                      className="bg-slate-700/80 border border-slate-600 text-[10px] font-medium rounded px-1.5 py-1 text-slate-200 outline-none cursor-pointer shrink-0 max-w-[110px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {columns.map(col => (
                        <option key={col.id} value={col.id} className="bg-slate-900">{col.label}</option>
                      ))}
                    </select>
                  </div>
                  <h4 className="text-xs font-medium text-slate-100 mb-1.5 leading-tight line-clamp-2">
                    {item.what}
                  </h4>
                  <p className="text-[10px] text-slate-500 mb-2 line-clamp-2">
                    {item.why}
                  </p>
                  {item.where && (
                    <p className="text-[10px] text-slate-500 mb-1 line-clamp-1">
                      Onde: {item.where}
                    </p>
                  )}
                  <div className="flex flex-col gap-1 border-t border-slate-700/50 pt-2">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <User size={10} />
                      <span className="text-slate-400">{item.who}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <Clock size={10} />
                      <span>{new Date(item.when).toLocaleDateString('pt-BR')}</span>
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
  );
};
