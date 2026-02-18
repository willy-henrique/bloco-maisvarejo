import React, { useMemo } from 'react';
import { Prioridade, PrioridadeStatus } from '../../types';
import { Calendar, User, ChevronRight } from 'lucide-react';

interface RoadmapViewProps {
  prioridades: Prioridade[];
  onOpenItem?: (item: Prioridade) => void;
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

export const RoadmapView: React.FC<RoadmapViewProps> = ({ prioridades, onOpenItem }) => {
  const currentYear = new Date().getFullYear();

  const byMonth = useMemo(() => {
    const map = new Map<string, Prioridade[]>();
    prioridades.forEach((item) => {
      const { month, year } = getMonthYear(item.data_alvo || item.data_inicio || '');
      if (year !== currentYear) return;
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
  }, [prioridades, currentYear]);

  const noDate = useMemo(
    () =>
      prioridades.filter((p) => {
        const d = p.data_alvo || p.data_inicio || '';
        const { year } = getMonthYear(d);
        return !d || isNaN(year) || year !== currentYear;
      }),
    [prioridades, currentYear]
  );

  return (
    <div className="max-w-4xl mx-auto space-y-8 w-full min-w-0 px-0 sm:px-0">
      <p className="text-sm text-slate-400">
        Prioridades por data alvo em {currentYear}, agrupadas por mês.
      </p>

      {byMonth.length === 0 && noDate.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-8 text-center">
          <Calendar size={32} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">
            Nenhuma prioridade com data alvo em {currentYear}. Edite as prioridades e defina a data alvo.
          </p>
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
                {monthItems.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onOpenItem?.(item)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/40 transition-colors group"
                    >
                      <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider shrink-0">
                        {item.status_prioridade}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate group-hover:text-blue-300 transition-colors">
                          {item.titulo}
                        </p>
                        <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <User size={10} />
                          {item.dono_id}
                          <span className="text-slate-600">•</span>
                          {item.data_alvo
                            ? new Date(item.data_alvo).toLocaleDateString('pt-BR')
                            : '—'}
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
                <h3 className="text-sm font-semibold text-slate-400">Sem data alvo em {currentYear}</h3>
              </div>
              <ul className="divide-y divide-slate-800">
                {noDate.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onOpenItem?.(item)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/40 transition-colors group"
                    >
                      <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider shrink-0">
                        {item.status_prioridade}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate group-hover:text-blue-300 transition-colors">
                          {item.titulo}
                        </p>
                        <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <User size={10} />
                          {item.dono_id}
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
