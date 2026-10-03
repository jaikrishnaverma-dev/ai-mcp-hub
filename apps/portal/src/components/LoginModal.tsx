import React, { useState, useEffect } from 'react';
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
import { Avatar, AvatarFallback } from './ui/avatar.js';
import { api, setActiveUser, type UserProfile } from '../api/client.js';
import { LogIn, UserCheck, AlertCircle } from 'lucide-react';

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (user: UserProfile) => void;
  reason?: string;
}

export function LoginModal({ open, onOpenChange, onSuccess, reason }: LoginModalProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedEmail, setSelectedEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      api.getUsers()
        .then((res) => {
          setUsers(res.users);
          const first = res.users[0];
          if (first && !selectedEmail) {
            setSelectedEmail(first.email);
            setName(first.name);
          }
        })
        .catch(() => {});
    }
  }, [open, selectedEmail]);

  const handleSelectQuickUser = (u: UserProfile) => {
    setSelectedEmail(u.email);
    setName(u.name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmail.trim()) {
      setError('Please provide an email address.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.login({
        email: selectedEmail.trim(),
        name: name.trim() || undefined,
      });

      setActiveUser(res.user);
      if (onSuccess) onSuccess(res.user);
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
              AI
            </div>
            <DialogTitle>Sign In to Assistant</DialogTitle>
          </div>
          <DialogDescription>
            {reason || 'Authenticate to like tools, post comments, or build your own custom MCP workflows.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 p-3 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {users.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <Label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Quick Select Account</Label>
            <div className="p-1.5 rounded-xl bg-zinc-50/70 border border-zinc-200/80 dark:bg-zinc-900/50 dark:border-zinc-800 space-y-1 max-h-36 overflow-y-auto">
              {users.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => handleSelectQuickUser(u)}
                  className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all text-xs w-full ${
                    selectedEmail === u.email
                      ? 'border-zinc-300/90 bg-white shadow-2xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 font-medium'
                      : 'border-transparent bg-white/60 hover:bg-white hover:border-zinc-200/80 text-zinc-600 dark:bg-zinc-800/40 dark:border-transparent dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate min-w-0">
                    <Avatar className="h-6 w-6 text-xs shrink-0">
                      <AvatarFallback>{u.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="truncate min-w-0">
                      <p className="text-xs font-medium leading-none truncate">{u.name}</p>
                      <p className="text-[11px] text-zinc-400 truncate">{u.email}</p>
                    </div>
                  </div>
                  {selectedEmail === u.email && (
                    <UserCheck className="h-4 w-4 text-zinc-900 dark:text-zinc-100 shrink-0 ml-2" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="e.g. developer@assistant.ai"
              value={selectedEmail}
              onChange={(e) => setSelectedEmail(e.target.value)}
              required
              className="h-11 rounded-xl text-sm border-zinc-200 bg-white dark:bg-zinc-900 dark:border-zinc-800"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Your Name (Optional)</Label>
            <Input
              id="name"
              type="text"
              placeholder="e.g. Jai Verma"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-xl text-sm border-zinc-200 bg-white dark:bg-zinc-900 dark:border-zinc-800"
            />
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-zinc-950 text-white hover:bg-zinc-900 font-medium text-sm transition-colors shadow-xs dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 gap-2"
            >
              <LogIn className="h-4 w-4" />
              <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

  );
}
