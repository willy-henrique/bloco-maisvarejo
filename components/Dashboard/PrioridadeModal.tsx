import React, { useState, useEffect } from 'react';
import { Prioridade, PrioridadeStatus } from '../../types';
import { Modal } from '../Shared/Modal';
import { User, Calendar } from 'lucide-react';

interface PrioridadeModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: Prioridade | null;
  initialStatus?: PrioridadeStatus;
  onSave: (data: Omit<Prioridade, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (id: string, data: Partial<Prioridade>) => void;
}

const emptyForm = (): Omit<Prioridade, 'id' | 'createdAt' | 'updatedAt'> => ({
  titulo: '',
  descricao: '',
  dono_id: '',
  data_inicio: new Date().toISOString().split('T')[0],
  data_alvo: new Date().toISOString().split('T')[0],
  status_prioridade: PrioridadeStatus.EXECUCAO,
});

export const PrioridadeModal: React.FC<PrioridadeModalProps> = ({
  isOpen,
  onClose,
  item,
  initialStatus,
  onSave,
  onUpdate,
}) => {
  const isEdit = item !== null;
  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    if (item) {
      setForm({
        titulo: item.titulo,
        descricao: item.descricao,
        dono_id: item.dono_id,
        data_inicio: item.data_inicio,
        data_alvo: item.data_alvo,
        status_prioridade: item.status_prioridade,
        origem_backlog_id: item.origem_backlog_id,
      });
    } else {
      setForm({
        ...emptyForm(),
        status_prioridade: initialStatus ?? PrioridadeStatus.EXECUCAO,
      });
    }
  }, [item, initialStatus, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit && item) {
      onUpdate(item.id, { ...form });
    } else {
      onSave(form);
    }
    onClose();
  };

  const update = (field: keyof typeof form, value: string | PrioridadeStatus | undefined) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Editar prioridade' : 'Nova prioridade'}
      maxWidth="xl"
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
              placeholder="Foco estratégico"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600"
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
              placeholder="Contexto e objetivo"
              rows={2}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-300 placeholder:text-slate-500 outline-none focus:border-slate-600 resize-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Dono
            </label>
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={form.dono_id}
                onChange={(e) => update('dono_id', e.target.value)}
                placeholder="Responsável"
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-slate-600"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              Status
            </label>
            <select
              value={form.status_prioridade}
              onChange={(e) => update('status_prioridade', e.target.value as PrioridadeStatus)}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600 cursor-pointer"
            >
              {Object.values(PrioridadeStatus).map((s) => (
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
              Data alvo
            </label>
            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="date"
                value={form.data_alvo}
                onChange={(e) => update('data_alvo', e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 outline-none focus:border-slate-600"
                required
              />
            </div>
          </div>
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
