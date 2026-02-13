import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error';

interface ToastProps {
  message: string;
  type: ToastType;
  visible: boolean;
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type,
  visible,
  onClose,
  duration = 4500,
}) => {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [visible, duration, onClose]);

  if (!visible) return null;

  const isSuccess = type === 'success';

  return (
    <div
      role="alert"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4 animate-in fade-in slide-in-from-top-4 duration-300"
      aria-live="polite"
    >
      <div
        className={`
          flex items-center gap-3 rounded-xl border shadow-xl px-4 py-3.5
          ${isSuccess
            ? 'bg-emerald-950/95 border-emerald-700/60 text-emerald-100'
            : 'bg-red-950/95 border-red-800/60 text-red-100'
          }
        `}
      >
        <div
          className={`
            shrink-0 w-10 h-10 rounded-full flex items-center justify-center
            ${isSuccess ? 'bg-emerald-600/30 text-emerald-400' : 'bg-red-600/30 text-red-400'}
          `}
        >
          {isSuccess ? <CheckCircle size={22} /> : <AlertCircle size={22} />}
        </div>
        <p className="flex-1 text-sm font-medium leading-snug">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Fechar"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
};
