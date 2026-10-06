import {
  LayoutDashboard,
  Workflow,
  Sparkles,
  Database,
  Settings,
} from 'lucide-react';
import type { NavTab } from './Navbar.js';

interface MobileBottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

export function MobileBottomNav({ activeTab, onTabChange }: MobileBottomNavProps) {
  const items = [
    { id: 'brief' as const, label: 'Brief', icon: LayoutDashboard },
    { id: 'workflows' as const, label: 'Workflows', icon: Workflow },
    { id: 'playground' as const, label: 'Chat with AI', icon: Sparkles },
    { id: 'data' as const, label: 'Explorer', icon: Database },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-t border-zinc-200/80 dark:border-zinc-800 px-3 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-xl"
    >
      <div className="grid grid-cols-5 items-center gap-1 max-w-md mx-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isPlayground = item.id === 'playground';

          if (isPlayground) {
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className="flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all relative select-none group cursor-pointer"
                title="Chat with AI Agent (Playground)"
              >
                {/* Ambient breathing glow to attract user attention */}
                <span className="absolute -top-1 w-8 h-8 rounded-full bg-purple-500/25 blur-md animate-pulse pointer-events-none" />

                {/* Elevated vibrant icon pill */}
                <div
                  className={`relative p-1.5 rounded-2xl transition-all duration-300 shadow-md ${
                    isActive
                      ? 'bg-gradient-to-tr from-purple-600 via-indigo-600 to-purple-500 text-white ring-2 ring-purple-400/50 shadow-purple-500/40 scale-105'
                      : 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-purple-500/25 group-hover:scale-105'
                  }`}
                >
                  {/* Subtle animated twinkle beacon */}
                  <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-300 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-200" />
                  </span>

                  <Icon className="h-4.5 w-4.5 shrink-0 stroke-[2.2] animate-pulse" />
                </div>

                <span className="text-[10px] mt-0.5 tracking-tight font-bold bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-400 dark:to-indigo-400 bg-clip-text text-transparent">
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all relative select-none ${
                isActive
                  ? 'text-zinc-950 dark:text-zinc-100 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300'
              }`}
            >
              {isActive && (
                <span className="absolute -top-1.5 w-6 h-0.5 rounded-full bg-zinc-950 dark:bg-zinc-100" />
              )}
              <div
                className={`p-1 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100'
                    : 'bg-transparent'
                }`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'stroke-[2.25]' : 'stroke-[1.75]'}`} />
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight font-medium">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
