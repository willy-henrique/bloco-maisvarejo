import React from 'react';

export type VisibilityFilter = 'created' | 'assigned' | 'observing';

interface VisibilityFilterBarProps {
  active: VisibilityFilter[];
  onChange: (filters: VisibilityFilter[]) => void;
}

export function VisibilityFilterBar({ active, onChange }: VisibilityFilterBarProps) {
  const toggle = (f: VisibilityFilter) =>
    onChange(active.includes(f) ? active.filter((x) => x !== f) : [...active, f]);

  const chips: { id: VisibilityFilter; label: string }[] = [
    { id: 'created', label: 'Criados por mim' },
    { id: 'assigned', label: 'Atribuídos a mim' },
    { id: 'observing', label: 'Acompanhados por mim' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 px-1 pb-3">
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => toggle(c.id)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
            active.includes(c.id)
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
          }`}
        >
          {c.label}
        </button>
      ))}
      {active.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="px-2 py-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
