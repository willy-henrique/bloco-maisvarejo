import React from 'react';
import { Prioridade, PrioridadeStatus } from '../../types';
import { CheckCircle, Clock, AlertCircle, Target, BarChart3 } from 'lucide-react';

interface PerformanceViewProps {
  prioridades: Prioridade[];
}

export const PerformanceView: React.FC<PerformanceViewProps> = ({ prioridades }) => {
  const total = prioridades.length;
  const completed = prioridades.filter((p) => p.status_prioridade === PrioridadeStatus.CONCLUIDO).length;
  const executing = prioridades.filter((p) => p.status_prioridade === PrioridadeStatus.EXECUCAO).length;
  const blocked = prioridades.filter((p) => p.status_prioridade === PrioridadeStatus.BLOQUEADO).length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const statusData = [
    { status: PrioridadeStatus.EXECUCAO, count: executing, label: 'Em Execução', color: 'bg-amber-500' },
    { status: PrioridadeStatus.BLOQUEADO, count: blocked, label: 'Bloqueado', color: 'bg-red-500' },
    { status: PrioridadeStatus.CONCLUIDO, count: completed, label: 'Concluído', color: 'bg-emerald-500' },
  ];

  const blockedItems = prioridades.filter((p) => p.status_prioridade === PrioridadeStatus.BLOQUEADO);

  return (
    <div className="max-w-5xl mx-auto space-y-6 w-full min-w-0">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-800 text-slate-400">
            <Target size={18} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Total de prioridades</p>
            <p className="text-xl font-semibold text-slate-100 tabular-nums">{total}</p>
          </div>
        </div>
        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
            <CheckCircle size={18} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Taxa de conclusão</p>
            <p className="text-xl font-semibold text-slate-100 tabular-nums">{completionRate}%</p>
          </div>
        </div>
        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
            <Clock size={18} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Em execução</p>
            <p className="text-xl font-semibold text-slate-100 tabular-nums">{executing}</p>
          </div>
        </div>
        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/20 text-red-400">
            <AlertCircle size={18} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Bloqueios</p>
            <p className="text-xl font-semibold text-slate-100 tabular-nums">{blocked}</p>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
          <BarChart3 size={14} />
          Distribuição por status
        </h3>
        <div className="space-y-3">
          {statusData.map(({ status, count, label, color }) => (
            <div key={status} className="flex items-center gap-3">
              <div className="w-24 text-[11px] text-slate-400 shrink-0">{label}</div>
              <div className="flex-1 h-6 bg-slate-800 rounded overflow-hidden">
                <div
                  className={`h-full ${color} rounded transition-all`}
                  style={{ width: total > 0 ? `${(count / total) * 100}%` : 0 }}
                />
              </div>
              <span className="text-sm font-medium text-slate-200 w-8 text-right tabular-nums">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {blockedItems.length > 0 && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-red-400/90 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertCircle size={14} />
            Prioridades bloqueadas ({blockedItems.length})
          </h3>
          <ul className="space-y-2">
            {blockedItems.map((item) => (
              <li
                key={item.id}
                className="text-sm text-slate-300 py-2 px-3 bg-slate-800/40 rounded border border-slate-700/50"
              >
                <span className="font-medium text-slate-200">{item.titulo}</span>
                {item.dono_id && <span className="text-slate-500 ml-2">— {item.dono_id}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
