import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';

import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { Label } from './ui/label.js';
import { api, setActiveUser, type UserProfile } from '../api/client.js';
import { LogIn, AlertCircle, ShieldCheck, Eye, EyeOff, Sparkles } from 'lucide-react';

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (user: UserProfile) => void;
  reason?: string;
}

export function LoginModal({ open, onOpenChange, onSuccess, reason }: LoginModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please provide your email address.');
      return;
    }
    if (!password) {
      setError('Please provide your password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.login({
        email: email.trim(),
        password,
      });

      setActiveUser(res.user);
      if (onSuccess) onSuccess(res.user);
      onOpenChange(false);
      setPassword('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] rounded-2xl p-6">
        <DialogHeader className="space-y-1.5 text-left">
          <div className="flex items-center gap-2 mb-0.5">
            <div className="h-8 w-8 rounded-lg bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 flex items-center justify-center font-bold text-sm shadow-xs">
              AI
            </div>
            <DialogTitle className="text-lg font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
              Sign In to Assistant
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
            {reason || 'Authenticate with your centralized account to manage MCP endpoints, tasks, and connect AI clients.'}
          </DialogDescription>
        </DialogHeader>

        {/* Powered by Spent App Banner */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300 text-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="leading-tight">
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block">Single Sign-On</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">Powered by Spent App</span>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100/70 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-medium">
            apptiva.in
          </span>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 text-xs rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/50">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="login-email" className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              Email Address
            </Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="e.g. name@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-10 rounded-xl text-xs border-zinc-200 bg-white dark:bg-zinc-900 dark:border-zinc-800"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="login-password" className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                Spent App Password
              </Label>
            </div>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your Spent App password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10 rounded-xl text-xs pr-10 border-zinc-200 bg-white dark:bg-zinc-900 dark:border-zinc-800"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-xl bg-zinc-950 text-white hover:bg-zinc-800 font-medium text-xs transition-colors shadow-xs dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 gap-2 cursor-pointer"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>{loading ? 'Verifying with Spent App...' : 'Sign In with Spent App'}</span>
            </Button>
          </div>

          <div className="relative py-1 text-center">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-zinc-200 dark:border-zinc-800" />
            </div>
            <span className="relative bg-white dark:bg-zinc-950 px-2 text-[10px] uppercase font-semibold text-zinc-400">
              or explore immediately
            </span>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                const res = await api.demoLogin();
                setActiveUser(res.user);
                if (onSuccess) onSuccess(res.user);
                onOpenChange(false);
              } catch (err: unknown) {
                setError(err instanceof Error ? err.message : 'Failed to connect demo user.');
              } finally {
                setLoading(false);
              }
            }}
            className="w-full h-10 rounded-xl border-zinc-200 dark:border-zinc-800 text-xs font-semibold gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
            <span>Continue as Jai (Workspace Owner)</span>
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
