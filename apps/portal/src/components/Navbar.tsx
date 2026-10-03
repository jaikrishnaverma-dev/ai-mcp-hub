import { Button } from './ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.js';
import { type UserProfile, setActiveUser } from '../api/client.js';
import {
  Sparkles,
  Server,
  Database,
  LogIn,
  LogOut,
  Sun,
  Moon,
  LayoutDashboard,
  Settings,
} from 'lucide-react';

export type NavTab = 'brief' | 'endpoints' | 'marketplace' | 'data' | 'settings';

interface NavbarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  currentUser: UserProfile | null;
  onOpenLogin: (reason?: string) => void;
  onLogout: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export function Navbar({
  activeTab,
  onTabChange,
  currentUser,
  onOpenLogin,
  onLogout,
  darkMode,
  onToggleDarkMode,
}: NavbarProps) {
  const tabs = [
    { id: 'brief' as const, label: 'Daily Brief', icon: LayoutDashboard },
    { id: 'endpoints' as const, label: 'MCP Server & Endpoints', icon: Server },
    { id: 'marketplace' as const, label: 'Tools & Skills', icon: Sparkles },
    { id: 'data' as const, label: 'Users\' Data Explorer', icon: Database },
    { id: 'settings' as const, label: 'Settings & Connect AI', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200/80 bg-white/95 dark:bg-zinc-950/95 dark:border-zinc-800 backdrop-blur shadow-2xs">
      {/* Top Bar */}
      <div className="container max-w-6xl mx-auto flex h-14 items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => onTabChange('marketplace')}>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
            <Sparkles className="h-4 w-4 text-zinc-900 dark:text-zinc-100" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-base tracking-tight text-zinc-900 dark:text-zinc-100">
              Assistant
            </span>
            <span className="rounded-md border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 text-[10px] font-mono font-medium text-zinc-600 dark:text-zinc-400">
              MCP HUB
            </span>
          </div>
        </div>

        {/* Right Status & Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Online status indicator */}
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/80 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-medium">Online</span>
          </div>

          {/* User profile dropdown or Sign In */}
          {currentUser ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold text-xs transition-colors hover:opacity-90">
                  {currentUser.name ? currentUser.name.slice(0, 1).toUpperCase() : 'U'}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-xs font-semibold leading-none text-zinc-900 dark:text-zinc-100">{currentUser.name}</p>
                    <p className="text-[11px] leading-none text-muted-foreground truncate">{currentUser.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onTabChange('endpoints')} className="text-xs cursor-pointer">
                  <Server className="mr-2 h-3.5 w-3.5" />
                  <span>My MCP Endpoints</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onTabChange('data')} className="text-xs cursor-pointer">
                  <Database className="mr-2 h-3.5 w-3.5" />
                  <span>Users&apos; Data Explorer</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onTabChange('settings')} className="text-xs cursor-pointer">
                  <Settings className="mr-2 h-3.5 w-3.5" />
                  <span>Settings &amp; Connect AI</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setActiveUser(null);
                    onLogout();
                  }}
                  className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 focus:bg-red-50 focus:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:focus:bg-red-950/40 cursor-pointer"
                >
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  <span>Sign out</span>
                </DropdownMenuItem>

              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs font-medium rounded-xl gap-1.5 border-zinc-200 dark:border-zinc-800"
              onClick={() => onOpenLogin('Sign in to manage endpoints and custom workflows')}
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Sign In</span>
            </Button>
          )}

          {/* Dark / Light Toggle */}
          <button
            onClick={onToggleDarkMode}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Desktop Navigation Tab Bar (Hidden on Mobile & Tablet < 768px) */}
      <div className="hidden md:block container max-w-6xl mx-auto px-4 sm:px-6">
        <nav className="flex items-center space-x-1 sm:space-x-2 py-2 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all select-none whitespace-nowrap ${
                  isActive
                    ? 'bg-zinc-100 text-zinc-950 font-semibold dark:bg-zinc-800 dark:text-zinc-100 shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 dark:hover:text-zinc-200'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}


