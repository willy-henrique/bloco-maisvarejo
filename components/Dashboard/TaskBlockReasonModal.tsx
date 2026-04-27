import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '../Shared/Modal';

interface TaskBlockReasonModalProps {
  isOpen: boolean;
  taskTitle?: string;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export const TaskBlockReasonModal: React.FC<TaskBlockReasonModalProps> = ({
  isOpen,
  taskTitle,
  value,
  onChange,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bloquear tarefa" maxWidth="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-300" />
          <p className="text-sm text-slate-200">
            Se quiser, informe o motivo do bloqueio
            {taskTitle?.trim() ? (
              <>
                {' '}
                da tarefa <span className="font-semibold text-white">&quot;{taskTitle}&quot;</span>
              </>
            ) : null}
            .
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Motivo do bloqueio
          </label>
          <textarea
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            placeholder="Descreva o que esta impedindo a execucao..."
            className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-red-500/60 placeholder:text-slate-500"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-600 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700"
          >
            Salvar motivo
          </button>
        </div>
      </div>
    </Modal>
  );
};
