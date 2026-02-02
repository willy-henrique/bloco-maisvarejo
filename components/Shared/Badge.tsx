
import React from 'react';
import { ItemStatus, UrgencyLevel } from '../../types';

interface BadgeProps {
  type: 'status' | 'urgency';
  value: string;
}

export const Badge: React.FC<BadgeProps> = ({ type, value }) => {
  const getColors = () => {
    if (type === 'status') {
      switch (value) {
        case ItemStatus.ACTIVE: return 'bg-blue-900/40 text-blue-400 border-blue-800';
        case ItemStatus.EXECUTING: return 'bg-amber-900/40 text-amber-400 border-amber-800';
        case ItemStatus.BLOCKED: return 'bg-red-900/40 text-red-400 border-red-800';
        case ItemStatus.COMPLETED: return 'bg-emerald-900/40 text-emerald-400 border-emerald-800';
        default: return 'bg-slate-800 text-slate-400 border-slate-700';
      }
    } else {
      switch (value) {
        case UrgencyLevel.CRITICAL: return 'bg-purple-900/40 text-purple-400 border-purple-800';
        case UrgencyLevel.HIGH: return 'bg-red-900/40 text-red-400 border-red-800';
        case UrgencyLevel.MEDIUM: return 'bg-orange-900/40 text-orange-400 border-orange-800';
        case UrgencyLevel.LOW: return 'bg-slate-800 text-slate-400 border-slate-700';
        default: return 'bg-slate-800 text-slate-400 border-slate-700';
      }
    }
  };

  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${getColors()} uppercase tracking-wider`}>
      {value}
    </span>
  );
};
