import React from 'react';
import { ActionItem, ItemStatus, UrgencyLevel } from '../../types';
import { formatTimestampPtBr } from '../../utils/date';
import { TrendingUp, CheckCircle, Clock, AlertCircle, Target, BarChart3 } from 'lucide-react';

interface PerformanceViewProps {
  items: ActionItem[];
}

export const PerformanceView: React.FC<PerformanceViewProps> = ({ items }) => {
  const total = items.length;
  const completed = items.filter(i => i.status === ItemStatus.COMPLETED).length;
  const executing = items.filter(i => i.status === ItemStatus.EXECUTING).length;
  const blocked = items.filter(i => i.status === ItemStatus.BLOCKED).length;
  const active = items.filter(i => i.status === ItemStatus.ACTIVE).length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const byUrgency = [
    { level: UrgencyLevel.CRITICAL, count: items.filter(i => i.urgency === UrgencyLevel.CRITICAL).length, label: 'Crítica' },
    { level: UrgencyLevel.HIGH, count: items.filter(i => i.urgency === UrgencyLevel.HIGH).length, label: 'Alta' },
    { level: UrgencyLevel.MEDIUM, count: items.filter(i => i.urgency === UrgencyLevel.MEDIUM).length, label: 'Média' },
    { level: UrgencyLevel.LOW, count: items.filter(i => i.urgency === UrgencyLevel.LOW).length, label: 'Baixa' },
  ];

  const statusData = [
    { status: ItemStatus.ACTIVE, count: active, label: 'Prioridade Ativa', color: 'bg-blue-500' },
    { status: ItemStatus.EXECUTING, count: executing, label: 'Em Execução', color: 'bg-amber-500' },
    { status: ItemStatus.BLOCKED, count: blocked, label: 'Bloqueado', color: 'bg-red-500' },
    { status: ItemStatus.COMPLETED, count: completed, label: 'Concluído', color: 'bg-emerald-500' },
  ];

  const blockedItems = items.filter(i => i.status === ItemStatus.BLOCKED);

  return (
    <div className="max-w-5xl mx-auto space-y-6 w-full min-w-0">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-800 text-slate-400">
            <Target size={18} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Total de ações</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
            <TrendingUp size={14} />
            Por urgência
          </h3>
          <div className="space-y-3">
            {byUrgency.map(({ level, count, label }) => (
              <div key={level} className="flex items-center justify-between py-1.5 border-b border-slate-800/50 last:border-0">
                <span className="text-sm text-slate-300">{label}</span>
                <span className="text-sm font-semibold text-slate-100 tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {blockedItems.length > 0 && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-red-400/90 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertCircle size={14} />
            Itens bloqueados ({blockedItems.length})
          </h3>
          <ul className="space-y-2">
            {blockedItems.map(item => (
              <li key={item.id} className="text-sm text-slate-300 py-2 px-3 bg-slate-800/40 rounded border border-slate-700/50">
                <span className="font-medium text-slate-200">{item.what}</span>
                {item.who && <span className="text-slate-500 ml-2">— {item.who}</span>}
                {item.blockedAt && (
                  <span className="text-slate-500 ml-2 text-xs">
                    (bloqueado {formatTimestampPtBr(item.blockedAt)})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
