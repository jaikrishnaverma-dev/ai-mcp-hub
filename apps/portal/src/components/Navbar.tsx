import { Sparkles, ShieldCheck, Sun, Moon, User } from 'lucide-react';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';
import { type UserProfile } from '../api/client.js';

interface NavbarProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  currentUser: UserProfile | null;
  onOpenAuth: () => void;
}

export function Navbar({ darkMode, onToggleDarkMode, currentUser, onOpenAuth }: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight">Assistant</span>
              <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-widest text-primary border-primary/30">
                MCP Hub & Portal
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              AI-Native Process Manager & Endpoint Registry
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* MCP Server Online Ping Badge */}
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">MCP Core:</span> Online
          </div>

          {/* User Profile / Switcher button */}
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-2 px-2.5 py-1 rounded-md border border-border/80 bg-muted/40 hover:bg-muted transition-colors text-left"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">
              {currentUser?.name ? currentUser.name.slice(0, 1).toUpperCase() : <User className="w-3.5 h-3.5" />}
            </div>
            <div className="hidden md:block">
              <p className="text-xs font-semibold leading-tight text-foreground">
                {currentUser?.name || 'Sign In'}
              </p>
              <p className="text-[10px] text-muted-foreground leading-none">
                {currentUser?.email || 'Switch user'}
              </p>
            </div>
          </button>

          {/* Dark mode toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleDarkMode}
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="text-muted-foreground hover:text-foreground h-9 w-9"
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}
