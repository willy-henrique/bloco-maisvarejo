/**
 * Modal para criar nova Prioridade (máx 3 ativas).
 */

import React, { useState } from 'react';
import type { Prioridade, Responsavel } from '../../types';
import { X } from 'lucide-react';

interface PrioridadeModalProps {
  isOpen: boolean;
  onClose: () => void;
  responsaveis: Responsavel[];
  onSave: (item: Omit<Prioridade, 'id'>) => boolean;
}

export const PrioridadeModal: React.FC<PrioridadeModalProps> = ({
  isOpen,
  onClose,
  responsaveis,
  onSave,
}) => {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dono_id, setDono_id] = useState('');
  const [data_alvo, setData_alvo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().slice(0, 10);
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !dono_id.trim()) return;
    const ok = onSave({
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      dono_id: dono_id.trim(),
      data_inicio: Date.now(),
      data_alvo: new Date(data_alvo).getTime(),
      status_prioridade: 'Execucao',
    });
    if (ok) {
      setTitulo('');
      setDescricao('');
      setDono_id('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl max-w-md w-full p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-slate-100">Nova prioridade ativa</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">
          Defina uma frente estratégica (não uma tarefa). Máximo de 3 prioridades ativas no quadro.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Prioridade ativa *</label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
              placeholder="Ex.: Redução de churn · Estabilidade da plataforma · Saúde"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Descrição (opcional)</label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 resize-none"
              rows={2}
              placeholder="Ex.: Atualizar o Dashboard para refletir métricas atuais"
              aria-optional="true"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Dono *</label>
            <input
              type="text"
              value={dono_id}
              onChange={(e) => setDono_id(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
              placeholder="Ex.: Gustavo"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Data alvo *</label>
            <input
              type="date"
              value={data_alvo}
              onChange={(e) => setData_alvo(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
              required
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
            >
              Criar prioridade
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
