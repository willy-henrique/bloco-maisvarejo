
import React from 'react';
import { LayoutDashboard, Table, LogOut, ShieldCheck, PieChart, Briefcase, X, ListTodo, Bot } from 'lucide-react';

export type ViewId = 'dashboard' | 'table' | 'backlog' | 'performance' | 'roadmap' | 'ia';

interface SidebarProps {
  activeView: ViewId;
  setView: (view: ViewId) => void;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, setView, onLogout, isOpen, onClose }) => {
  const menuItems = [
    { id: 'backlog', icon: ListTodo, label: 'Back Log' },
    { id: 'dashboard', icon: LayoutDashboard, label: 'Prioridades' },
    { id: 'table', icon: Table, label: 'Matriz 5W2H' },
  ];

  const handleNavClick = (view: ViewId) => {
    setView(view);
    if (window.innerWidth < 1024) onClose();
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 w-56 max-w-[85vw] bg-slate-900 border-r border-slate-800 flex flex-col h-full transition-transform duration-300 ease-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0 lg:max-w-none
      `}>
        <div className="px-4 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-600/20 text-blue-400">
              <ShieldCheck size={16} />
            </div>
            <div>
              <span className="font-semibold text-sm text-slate-100 tracking-tight">Estratégico 5W2H</span>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">WillTech Diretoria</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-2 min-h-[44px] min-w-[44px] text-slate-400 hover:text-white transition-colors rounded touch-manipulation" aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-lg transition-all text-sm font-medium touch-manipulation ${
                activeView === item.id 
                  ? 'bg-blue-600 text-white' 
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}

          <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col gap-0.5">
            <p className="px-3 py-1.5 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Relatórios</p>
            <button
              type="button"
              onClick={() => handleNavClick('performance')}
              className={`flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-all text-left w-full touch-manipulation ${
                activeView === 'performance'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
              }`}
            >
              <PieChart size={18} /> Desempenho
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('roadmap')}
              className={`flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-all text-left w-full touch-manipulation ${
                activeView === 'roadmap'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
              }`}
            >
              <Briefcase size={18} /> Roadmap 2026
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col gap-0.5">
            <p className="px-3 py-1.5 text-[10px] text-slate-500 uppercase tracking-wider font-medium">IA</p>
            <button
              type="button"
              onClick={() => handleNavClick('ia')}
              className={`flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-all text-left w-full touch-manipulation ${
                activeView === 'ia'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
              }`}
            >
              <Bot size={18} /> 5W2H CHAT
            </button>
          </div>
        </nav>

        <div className="p-2 border-t border-slate-800">
          <button 
            onClick={onLogout}
            className="flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-lg text-red-400/90 hover:bg-red-500/10 hover:text-red-400 w-full transition-all text-sm font-medium touch-manipulation"
          >
            <LogOut size={18} /> Sair
          </button>
        </div>
      </aside>
    </>
  );
};
