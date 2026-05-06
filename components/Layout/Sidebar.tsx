import React, { useEffect, useMemo, useState } from 'react';
import { useChatUnread } from '../../controllers/useChat';
import {
  LogOut,
  ShieldCheck,
  PieChart,
  Briefcase,
  X,
  ListTodo,
  Bot,
  Target,
  FileText,
  ChevronDown,
  ExternalLink,
  CalendarDays,
  Bell,
  BellOff,
  MessageSquare,
} from 'lucide-react';
import { EstrategicoGridIcon } from '../icons/EstrategicoGridIcon';
import type { ExternalWorkspaceLink, UserRole } from '../../types/user';
import { listActiveExternalLinksByWorkspace } from '../../utils/externalWorkspaceLinks';

export type ViewId = 'workspace' | 'dashboard' | 'table' | 'backlog' | 'performance' | 'roadmap' | 'ia' | 'operacional' | 'agenda' | 'chat';

interface SidebarProps {
  activeView: ViewId;
  setView: (view: ViewId) => void;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
  workspaceAtivo: 'all' | string;
  empresas: string[];
  allowAllWorkspaces?: boolean;
  onChangeWorkspace: (workspace: 'all' | string) => void;
  onCreateWorkspace: (nome: string) => void;
  userRole?: UserRole | null;
  allowedViews?: ViewId[];
  userName?: string;
  notificationsSupported?: boolean;
  notificationPermission?: NotificationPermission;
  notificationsEnabled?: boolean;
  onToggleNotifications?: () => void | Promise<void>;
  onWorkspaceShortcutClick?: () => void;
  externalWorkspaceLinks?: ExternalWorkspaceLink[];
  onOpenWorkspaceExternalLink?: (url: string) => void;
  chatCurrentUser?: { uid: string; nome: string } | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  setView,
  onLogout,
  isOpen,
  onClose,
  workspaceAtivo,
  empresas,
  allowAllWorkspaces,
  onChangeWorkspace,
  onCreateWorkspace,
  userRole,
  allowedViews,
  userName,
  notificationsSupported = false,
  notificationPermission = 'default',
  notificationsEnabled = true,
  onToggleNotifications,
  onWorkspaceShortcutClick,
  externalWorkspaceLinks,
  onOpenWorkspaceExternalLink,
  chatCurrentUser = null,
}) => {
  const chatUnreadCount = useChatUnread(activeView === 'chat' ? null : chatCurrentUser);
  const [workspaceLinksOpen, setWorkspaceLinksOpen] = useState(false);

  const isAdmin = userRole === 'administrador';
  /** Gerente sem views cadastradas = acesso a todas (compatível com perfis antigos). */
  const gerenteLegacyFull =
    userRole === 'gerente' && (!allowedViews || allowedViews.length === 0);
  const canAccessView = (view: ViewId) => {
    if (!userRole) return true;
    if (view === 'backlog') return true;
    if (isAdmin) return true;
    if (gerenteLegacyFull) return true;
    return allowedViews?.includes(view) ?? false;
  };

  const allMenuItems = [
    { id: 'backlog', icon: ListTodo, label: 'Backlog' },
    { id: 'dashboard', icon: EstrategicoGridIcon, label: 'Estratégico' },
    { id: 'table', icon: Target, label: 'Gerencial' },
    { id: 'operacional', icon: FileText, label: 'Operacional' },
  ];
  const menuItems = allMenuItems.filter((item) => canAccessView(item.id as ViewId));

  const handleNavClick = (view: ViewId) => {
    setView(view);
    if (window.innerWidth < 1024) onClose();
  };

  const handleWorkspaceButton = () => {
    if (userRole === 'administrador') {
      handleNavClick('workspace');
      return;
    }
    onWorkspaceShortcutClick?.();
    if (window.innerWidth < 1024) onClose();
  };

  const workspaceQuickLinks = useMemo(() => {
    if (workspaceAtivo === 'all') return [];
    return listActiveExternalLinksByWorkspace(externalWorkspaceLinks, workspaceAtivo);
  }, [externalWorkspaceLinks, workspaceAtivo]);

  useEffect(() => {
    setWorkspaceLinksOpen(false);
  }, [workspaceAtivo]);

  const handleOpenQuickLink = (url: string) => {
    if (onOpenWorkspaceExternalLink) {
      onOpenWorkspaceExternalLink(url);
      setWorkspaceLinksOpen(false);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    setWorkspaceLinksOpen(false);
  };

  const notificationStatus = (() => {
    if (!notificationsSupported) {
      return {
        label: 'Indisp.',
        title: 'Notificações do Windows indisponíveis neste navegador',
        Icon: BellOff,
        cls: 'text-slate-600',
      };
    }
    if (notificationPermission === 'granted') {
      return {
        label: notificationsEnabled ? 'Ativa' : 'Desat.',
        title: notificationsEnabled
          ? 'Clique para desativar notificações do Mavo'
          : 'Clique para ativar notificações do Mavo',
        Icon: notificationsEnabled ? Bell : BellOff,
        cls: notificationsEnabled ? 'text-emerald-400/80' : 'text-slate-500',
      };
    }
    if (notificationPermission === 'denied') {
      return {
        label: 'Bloq.',
        title: 'Notificações bloqueadas no navegador. Libere nas permissões do site.',
        Icon: BellOff,
        cls: 'text-red-400/80',
      };
    }
    return {
      label: 'Desat.',
      title: 'Clique para ativar notificações do Windows',
      Icon: BellOff,
      cls: 'text-amber-400/80',
    };
  })();

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
        <div className="px-4 py-4 border-b border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-950 ring-1 ring-slate-700/80">
                <img
                  src="/mavo-logo.png"
                  alt="Mavo Gestão"
                  className="h-11 w-11 shrink-0 object-contain object-center scale-110"
                  width={44}
                  height={44}
                  decoding="async"
                />
              </div>
              <span className="font-semibold text-sm text-slate-100 tracking-tight whitespace-nowrap">Mavo Gestão</span>
            </div>
            <button onClick={onClose} className="lg:hidden p-2 min-h-[44px] min-w-[44px] text-slate-400 hover:text-white transition-colors rounded touch-manipulation" aria-label="Fechar menu">
              <X size={18} />
            </button>
          </div>
          <div className="relative flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setWorkspaceLinksOpen((prev) => !prev)}
              className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 uppercase tracking-wider font-medium shrink-0 min-w-[72px]"
            >
              Workspace <ChevronDown size={12} className={workspaceLinksOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>
            <select
              value={workspaceAtivo}
              onChange={(e) => onChangeWorkspace(e.target.value as 'all' | string)}
              className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-blue-500 cursor-pointer"
            >
              {allowAllWorkspaces && (
                <option value="all">Todas as empresas</option>
              )}
              {empresas.map((nome) => (
                <option key={nome} value={nome}>
                  {nome}
                </option>
              ))}
            </select>
            {workspaceLinksOpen && (
              <div className="absolute left-0 top-full mt-2 w-full rounded-lg border border-slate-700 bg-slate-900/95 shadow-xl z-50 p-2 space-y-1">
                {workspaceAtivo === 'all' ? (
                  <p className="text-[11px] text-slate-400 px-2 py-1">
                    Selecione um workspace para ver os links.
                  </p>
                ) : workspaceQuickLinks.length > 0 ? (
                  workspaceQuickLinks.map((link) => (
                    <button
                      key={link.id}
                      type="button"
                      onClick={() => handleOpenQuickLink(link.url)}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800/80 transition-colors"
                    >
                      <span className="text-[11px] text-slate-200 inline-flex items-center gap-1.5">
                        <ExternalLink size={12} />
                        {link.label || 'Link externo'}
                        {link.isPrimary ? <span className="text-[10px] text-emerald-400">(padrão)</span> : null}
                      </span>
                    </button>
                  ))
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onWorkspaceShortcutClick?.();
                      setWorkspaceLinksOpen(false);
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg text-[11px] text-slate-300 hover:bg-slate-800/80 transition-colors"
                  >
                    Nenhum link neste workspace. Tentar link padrão
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id as ViewId)}
              className={`flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-lg transition-all text-sm font-medium touch-manipulation ${
                activeView === (item.id as ViewId)
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
            {canAccessView('performance') && (
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
            )}
            {canAccessView('roadmap') && (
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
            )}

            <button
              type="button"
              onClick={handleWorkspaceButton}
              className={`flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-all text-left w-full touch-manipulation ${
                userRole === 'administrador' && activeView === 'workspace'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
              }`}
            >
              <ShieldCheck size={18} /> Workspace
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => handleNavClick('agenda')}
              className={`flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-all text-left w-full touch-manipulation ${
                activeView === 'agenda'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
              }`}
            >
              <CalendarDays size={18} /> Agenda
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('chat')}
              className={`relative flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-all text-left w-full touch-manipulation ${
                activeView === 'chat'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
              }`}
            >
              <MessageSquare size={18} /> Chat
              {chatUnreadCount > 0 && activeView !== 'chat' && (
                <span className="ml-auto shrink-0 min-w-[18px] h-[18px] rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                  {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                </span>
              )}
            </button>
          </div>

          {canAccessView('ia') && (
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
          )}
        </nav>

        <div className="p-2 border-t border-slate-800 space-y-1">
          {userName && (
            <div className="px-3 py-1.5 text-[10px] text-slate-500 truncate">
              {userName}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (notificationsSupported) void onToggleNotifications?.();
            }}
            title={notificationStatus.title}
            className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-md text-[10px] font-medium transition-colors ${notificationStatus.cls} ${
              notificationsSupported ? 'hover:bg-slate-800/55 hover:text-slate-200' : 'cursor-default'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <notificationStatus.Icon size={13} className="shrink-0" />
              <span className="truncate">Notificações</span>
            </span>
            <span className="text-[10px]">{notificationStatus.label}</span>
          </button>
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
