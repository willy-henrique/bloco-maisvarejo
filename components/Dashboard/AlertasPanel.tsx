/**
 * Fase 3: Painel de alertas — prazos (vencidas / a vencer) e bloqueios ativos.
 */

import React, { useMemo, useState } from 'react';
import { Prioridade, PrioridadeStatus, Tarefa } from '../../types';
import { getPrazoAlertaLabel } from '../../utils/dateAlerts';
import { AlertCircle, Calendar, ChevronDown, ChevronRight } from 'lucide-react';

interface AlertasPanelProps {
  prioridades: Prioridade[];
  tarefas: Tarefa[];
  onOpenPrioridade: (p: Prioridade) => void;
}

export const AlertasPanel: React.FC<AlertasPanelProps> = ({
  prioridades,
  tarefas,
  onOpenPrioridade,
}) => {
  const [open, setOpen] = useState(true);

  const { prioridadesAlerta, prioridadesBloqueadas, tarefasAlerta } = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const seteDias = new Date(hoje);
    seteDias.setDate(seteDias.getDate() + 7);

    const alerta: Prioridade[] = [];
    prioridades.forEach((p) => {
      if (p.status_prioridade === PrioridadeStatus.CONCLUIDO) return;
      const data = p.data_alvo ? new Date(p.data_alvo) : null;
      if (data && !isNaN(data.getTime())) {
        data.setHours(0, 0, 0, 0);
        if (data < hoje || data <= seteDias) alerta.push(p);
      }
    });

    const bloqueadas = prioridades.filter((p) => p.status_prioridade === PrioridadeStatus.BLOQUEADO);

    const tarAlerta: Tarefa[] = [];
    tarefas.forEach((t) => {
      const data = t.data_vencimento ? new Date(t.data_vencimento) : null;
      if (data && !isNaN(data.getTime())) {
        data.setHours(0, 0, 0, 0);
        if (data < hoje || data <= seteDias) tarAlerta.push(t);
      }
    });

    return {
      prioridadesAlerta: alerta,
      prioridadesBloqueadas: bloqueadas,
      tarefasAlerta: tarAlerta,
    };
  }, [prioridades, tarefas]);

  const totalAlertas = prioridadesAlerta.length + prioridadesBloqueadas.length + tarefasAlerta.length;
  if (totalAlertas === 0) return null;

  return (
    <section className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-2 text-amber-400/90">
          <Calendar size={18} />
          <span className="text-sm font-semibold">Alertas</span>
          <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded tabular-nums">
            {totalAlertas}
          </span>
        </div>
        {open ? <ChevronDown size={18} className="text-slate-500" /> : <ChevronRight size={18} className="text-slate-500" />}
      </button>
      {open && (
        <div className="border-t border-slate-800 p-3 space-y-3">
          {prioridadesBloqueadas.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-red-400/90 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <AlertCircle size={12} />
                Bloqueios ({prioridadesBloqueadas.length})
              </h4>
              <ul className="space-y-1">
                {prioridadesBloqueadas.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onOpenPrioridade(p)}
                      className="text-left w-full text-xs text-slate-300 hover:text-red-300 hover:bg-red-500/10 px-2 py-1.5 rounded transition-colors"
                    >
                      {p.titulo}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {prioridadesAlerta.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-amber-400/90 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Calendar size={12} />
                Prazos — prioridades ({prioridadesAlerta.length})
              </h4>
              <ul className="space-y-1">
                {prioridadesAlerta.map((p) => {
                  const label = getPrazoAlertaLabel(p.data_alvo);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => onOpenPrioridade(p)}
                        className="text-left w-full text-xs text-slate-300 hover:text-amber-300 hover:bg-amber-500/10 px-2 py-1.5 rounded transition-colors flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{p.titulo}</span>
                        {label && (
                          <span className="text-[10px] text-amber-400/90 shrink-0">{label}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {tarefasAlerta.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-amber-400/90 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Calendar size={12} />
                Prazos — tarefas ({tarefasAlerta.length})
              </h4>
              <ul className="space-y-1">
                {tarefasAlerta.slice(0, 5).map((t) => {
                  const label = getPrazoAlertaLabel(t.data_vencimento);
                  return (
                    <li key={t.id} className="text-xs text-slate-400 px-2 py-1 flex items-center justify-between gap-2">
                      <span className="truncate">{t.titulo}</span>
                      {label && <span className="text-[10px] text-amber-400/90 shrink-0">{label}</span>}
                    </li>
                  );
                })}
                {tarefasAlerta.length > 5 && (
                  <li className="text-[10px] text-slate-500 px-2 py-0.5">
                    +{tarefasAlerta.length - 5} outra(s)
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
