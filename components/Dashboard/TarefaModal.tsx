import React, { useState, useEffect } from 'react';
import { Tarefa, StatusTarefa } from '../../types';
import { Modal } from '../Shared/Modal';
import { User, Calendar, AlertCircle } from 'lucide-react';

interface TarefaModalProps {
  isOpen: boolean;
  onClose: () => void;
  planoId: string;
  item: Tarefa | null;
  onSave: (data: Omit<Tarefa, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (id: string, data: Partial<Tarefa>) => void;
}

const emptyForm = (planoId: string): Omit<Tarefa, 'id' | 'createdAt' | 'updatedAt'> => ({
  plano_id: planoId,
  titulo: '',
  descricao: '',
  responsavel_id: '',
  data_inicio: new Date().toISOString().split('T')[0],
  data_vencimento: new Date().toISOString().split('T')[0],
  status_tarefa: StatusTarefa.PENDENTE,
});

export const TarefaModal: React.FC<TarefaModalProps> = ({
  isOpen,
  onClose,
  planoId,
  item,
  onSave,
  onUpdate,
}) => {
  const isEdit = item !== null;
  const [form, setForm] = useState(() => emptyForm(planoId));

  useEffect(() => {
    if (item) {
      setForm({
        plano_id: item.plano_id,
        titulo: item.titulo,
        descricao: item.descricao,
        responsavel_id: item.responsavel_id,
        data_inicio: item.data_inicio,
        data_vencimento: item.data_vencimento,
        status_tarefa: item.status_tarefa,
        bloqueio_motivo: item.bloqueio_motivo,
      });
    } else {
      setForm(emptyForm(planoId));
    }
  }, [item, planoId, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit && item) {
      onUpdate(item.id, { ...form });
    } else {
      onSave(form);
    }
    onClose();
  };

  const update = (field: keyof typeof form, value: string | StatusTarefa | undefined) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Editar tarefa' : 'Nova tarefa'}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Título
            </label>
            <input
              type="text"
              value={form.titulo}
              onChange={(e) => update('titulo', e.target.value)}
              placeholder="Tarefa"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-slate-600"
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Descrição
            </label>
            <textarea
              value={form.descricao}
              onChange={(e) => update('descricao', e.target.value)}
              placeholder="Detalhes da execução"
              rows={2}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-300 resize-none outline-none focus:border-slate-600"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Responsável
            </label>
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={form.responsavel_id}
                onChange={(e) => update('responsavel_id', e.target.value)}
                placeholder="Quem executa"
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Status
            </label>
            <select
              value={form.status_tarefa}
              onChange={(e) => update('status_tarefa', e.target.value as StatusTarefa)}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600 cursor-pointer"
            >
              {Object.values(StatusTarefa).map((s) => (
                <option key={s} value={s} className="bg-slate-900">
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Data início
            </label>
            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="date"
                value={form.data_inicio}
                onChange={(e) => update('data_inicio', e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Data vencimento
            </label>
            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="date"
                value={form.data_vencimento}
                onChange={(e) => update('data_vencimento', e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600"
                required
              />
            </div>
          </div>
          {form.status_tarefa === StatusTarefa.BLOQUEADA && (
            <div className="md:col-span-2">
              <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <AlertCircle size={12} />
                Motivo do bloqueio
              </label>
              <textarea
                value={form.bloqueio_motivo ?? ''}
                onChange={(e) => update('bloqueio_motivo', e.target.value || undefined)}
                placeholder="O que está impedindo?"
                rows={2}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-300 resize-none outline-none focus:border-slate-600"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-4 py-2.5 min-h-[44px] text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors touch-manipulation"
          >
            {isEdit ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
