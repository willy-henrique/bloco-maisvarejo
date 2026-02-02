import React, { useMemo } from 'react';
import { ActionItem, ItemStatus } from '../../types';
import { Calendar, User, ChevronRight } from 'lucide-react';
import { Badge } from '../Shared/Badge';

interface RoadmapViewProps {
  items: ActionItem[];
  onOpenItem?: (item: ActionItem) => void;
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function getMonthYear(dateStr: string): { month: number; year: number } {
  const d = new Date(dateStr);
  return { month: d.getMonth(), year: d.getFullYear() };
}

function formatMonthKey(month: number, year: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function formatMonthLabel(month: number, year: number): string {
  return `${MONTHS[month]} ${year}`;
}

export const RoadmapView: React.FC<RoadmapViewProps> = ({ items, onOpenItem }) => {
  const byMonth = useMemo(() => {
    const map = new Map<string, ActionItem[]>();
    items.forEach(item => {
      const { month, year } = getMonthYear(item.when);
      if (year !== 2025) return;
      const key = formatMonthKey(month, year);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, list]) => {
        const [y, m] = key.split('-').map(Number);
        return { key, label: formatMonthLabel(m - 1, y), items: list };
      });
  }, [items]);

  const noDate = useMemo(() => items.filter(i => {
    const { year } = getMonthYear(i.when);
    return isNaN(year) || year !== 2025;
  }), [items]);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <p className="text-sm text-slate-400">
        Iniciativas planejadas para 2025, agrupadas por mês.
      </p>

      {byMonth.length === 0 && noDate.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-8 text-center">
          <Calendar size={32} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">Nenhuma iniciativa com data em 2025. Edite os itens na Matriz 5W2H e defina &quot;Quando&quot;.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {byMonth.map(({ key, label, items: monthItems }) => (
            <div key={key} className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80 flex items-center gap-2">
                <Calendar size={16} className="text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-200">{label}</h3>
                <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded tabular-nums">
                  {monthItems.length} {monthItems.length === 1 ? 'item' : 'itens'}
                </span>
              </div>
              <ul className="divide-y divide-slate-800">
                {monthItems.map(item => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onOpenItem?.(item)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/40 transition-colors group"
                    >
                      <Badge type="urgency" value={item.urgency} />
                      <Badge type="status" value={item.status} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate group-hover:text-blue-300 transition-colors">
                          {item.what}
                        </p>
                        <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <User size={10} />
                          {item.who}
                          <span className="text-slate-600">•</span>
                          {new Date(item.when).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-slate-500 group-hover:text-slate-300 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {noDate.length > 0 && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80">
                <h3 className="text-sm font-semibold text-slate-400">Sem data em 2025</h3>
              </div>
              <ul className="divide-y divide-slate-800">
                {noDate.map(item => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onOpenItem?.(item)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/40 transition-colors group"
                    >
                      <Badge type="urgency" value={item.urgency} />
                      <Badge type="status" value={item.status} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate group-hover:text-blue-300 transition-colors">
                          {item.what}
                        </p>
                        <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <User size={10} />
                          {item.who}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-slate-500 group-hover:text-slate-300 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
