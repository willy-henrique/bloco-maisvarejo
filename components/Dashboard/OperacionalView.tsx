import React from 'react';
import { ActionItem } from '../../types';
import { FileText, Plus } from 'lucide-react';

interface OperacionalViewProps {
  items: ActionItem[];
  onUpdate: (id: string, data: Partial<ActionItem>) => void;
}

export const OperacionalView: React.FC<OperacionalViewProps> = ({ items, onUpdate }) => {
  const itensOrdenados = [...items].sort(
    (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)
  );

  return (
    <section className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Operacional — Desdobramento das Prioridades
        </h3>
        <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-1 rounded tabular-nums">
          {itensOrdenados.length} {itensOrdenados.length === 1 ? 'prioridade' : 'prioridades'}
        </span>
      </div>

      {itensOrdenados.length === 0 ? (
        <div className="px-4 py-10 text-sm text-slate-500 text-center">
          Nenhuma prioridade enviada ainda. Na visão <span className="font-semibold">Tático</span>,
          use o botão com ícone <span className="inline-flex items-center gap-1 text-emerald-400">
            <Plus size={12} /> Operacional
          </span>{' '}
          para começar a operacionalizar.
        </div>
      ) : (
        <div className="divide-y divide-slate-800">
          {itensOrdenados.map((item) => (
            <div key={item.id} className="p-4 flex flex-col gap-3 bg-slate-900/50 hover:bg-slate-900/70 transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Prioridade</p>
                  <h4 className="text-sm font-semibold text-slate-100 line-clamp-2">
                    {item.what || '—'}
                  </h4>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <FileText size={11} />
                  Metodologia operacional desta prioridade
                </p>
                <ul className="text-[11px] text-slate-500 list-decimal list-inside space-y-0.5">
                  <li>Defina rapidamente o objetivo operacional (foco do dia/semana).</li>
                  <li>Liste os passos ou rotina para executar (checklist).</li>
                  <li>Descreva como será o acompanhamento e o critério de conclusão.</li>
                </ul>
                <textarea
                  value={item.notes ?? ''}
                  onChange={(e) => onUpdate(item.id, { notes: e.target.value })}
                  placeholder={
                    'Ex.: \n' +
                    '1) Objetivo operacional: garantir X até Y.\n' +
                    '2) Passos / rotina:\n' +
                    '   - [ ] Passo 1...\n' +
                    '   - [ ] Passo 2...\n' +
                    '3) Acompanhamento / critério de conclusão:\n' +
                    '   - Indicador, frequência, responsável.'
                  }
                  rows={3}
                  className="w-full bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-emerald-500/70 focus:ring-1 focus:ring-emerald-500/40 resize-y"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

