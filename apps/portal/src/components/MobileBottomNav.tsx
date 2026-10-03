import {
  LayoutDashboard,
  Server,
  Sparkles,
  Database,
} from 'lucide-react';
import type { NavTab } from './Navbar.js';

interface MobileBottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

export function MobileBottomNav({ activeTab, onTabChange }: MobileBottomNavProps) {
  const items = [
    { id: 'brief' as const, label: 'Brief', icon: LayoutDashboard },
    { id: 'endpoints' as const, label: 'Endpoints', icon: Server },
    { id: 'marketplace' as const, label: 'Tools', icon: Sparkles },
    { id: 'data' as const, label: 'Explorer', icon: Database },
  ];

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-t border-zinc-200/80 dark:border-zinc-800 px-3 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-xl"
    >
      <div className="grid grid-cols-4 items-center gap-1 max-w-md mx-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

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
