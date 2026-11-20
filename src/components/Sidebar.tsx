import { useState } from 'react';
import {
  LayoutDashboard,
  Activity,
  UserPlus,
  FileCheck2,
  Database,
  LogOut,
  LogIn,
  Menu,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';

export type AppView = 'dashboard' | 'analise' | 'cadastro' | 'relatorio' | 'arquitetura';

interface SidebarProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  user: User | null;
  onSignIn: () => void;
  onLogout: () => void;
  counts?: {
    atletas?: number;
    sessoes?: number;
  };
}

const NAV_ITEMS: Array<{
  id: AppView;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'dashboard', label: 'Dashboard Geral', icon: LayoutDashboard },
  { id: 'analise', label: 'Análise Biomecânica 3D', icon: Activity },
  { id: 'cadastro', label: 'Cadastro & Elenco', icon: UserPlus },
  { id: 'relatorio', label: 'Relatório Executivo B2B', icon: FileCheck2 },
  { id: 'arquitetura', label: 'Arquitetura & API', icon: Database },
];

export function Sidebar({
  activeView,
  onSelectView,
  user,
  onSignIn,
  onLogout,
  counts,
}: SidebarProps) {
  const [logoError, setLogoError] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSelect = (view: AppView) => {
    onSelectView(view);
    setMobileOpen(false);
  };

  const navContent = (
    <div className="flex flex-col h-full bg-[#0F131C] border-r border-[#1F2937] w-64 shrink-0">
      {/* Marca */}
      <div className="h-16 px-5 border-b border-[#1F2937] flex items-center justify-between">
        <button
          type="button"
          onClick={() => handleSelect('dashboard')}
          className="flex items-center gap-3 text-left cursor-pointer whitespace-nowrap shrink-0"
        >
          {!logoError ? (
            <img
              src="/assets/aistudio/logo_insta_perfil_br.png_acbb1053.png"
              alt="5Play Sports"
              referrerPolicy="no-referrer"
              onError={() => setLogoError(true)}
              className="h-8 w-8 rounded object-contain bg-black shrink-0"
            />
          ) : (
            <div className="h-8 w-8 rounded bg-[#111827] border border-[#1F2937] flex items-center justify-center text-xs font-bold text-[#10B981]">
              5P
            </div>
          )}
          <div>
            <div className="text-sm font-bold text-[#F9FAFB] leading-tight">5Play Sports</div>
            <div className="text-[11px] text-[#06B6D4] font-medium">KinePitch AI</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 rounded text-[#9CA3AF] hover:text-[#F9FAFB]"
          aria-label="Fechar menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navegação Principal */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id;
          const badge =
            item.id === 'cadastro' && counts?.atletas !== undefined
              ? counts.atletas
              : item.id === 'analise' && counts?.sessoes !== undefined
                ? counts.sessoes
                : null;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30'
                  : 'text-[#9CA3AF] hover:text-[#F9FAFB] hover:bg-[#181C24] border border-transparent'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#10B981]' : 'text-[#6B7280]'}`} />
                <span className="truncate">{item.label}</span>
              </span>
              {badge !== null && (
                <span className="font-mono-tabular text-[11px] text-[#9CA3AF] shrink-0">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Sessão do Operador */}
      <div className="p-4 border-t border-[#1F2937] space-y-3">
        {user ? (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-md bg-[#181C24] border border-[#1F2937] flex items-center justify-center text-xs font-semibold text-[#10B981] shrink-0">
                {(user.displayName || user.email || 'OP').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-[#F9FAFB] truncate">
                  {user.displayName || 'Operador Técnico'}
                </div>
                <div className="text-[11px] text-[#9CA3AF] truncate">{user.email}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-[#E5E7EB] bg-[#181C24] hover:bg-[#1F2937] border border-[#1F2937] rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Encerrar Sessão</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-[#042116] bg-[#10B981] hover:bg-[#059669] rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Entrar com Google</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex shrink-0 sticky top-0 h-screen">{navContent}</aside>

      {/* Mobile Top Toggle Button */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-md bg-[#10B981] text-[#042116] text-xs font-semibold shadow-lg cursor-pointer"
        aria-label="Abrir navegação"
      >
        <Menu className="w-4 h-4" />
        <span>Menu</span>
      </button>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 h-full">{navContent}</div>
        </div>
      )}
    </>
  );
}
