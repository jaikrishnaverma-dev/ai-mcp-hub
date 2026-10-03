import React, { useState } from 'react';
import { LogIn, Check, Shield } from 'lucide-react';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/card.js';
import { Badge } from './ui/badge.js';
import { type UserProfile } from '../api/client.js';

interface LoginModalProps {
  currentUser: UserProfile | null;
  users: UserProfile[];
  onSelectUser: (user: UserProfile) => void;
  onLoginNewUser: (email: string, name: string) => Promise<void>;
  onClose: () => void;
}

export function LoginModal({
  currentUser,
  users,
  onSelectUser,
  onLoginNewUser,
  onClose,
}: LoginModalProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isNewAccount, setIsNewAccount] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    try {
      setLoading(true);
      await onLoginNewUser(email.trim(), name.trim());
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md border-border/80 bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              User Authentication & Switcher
            </CardTitle>
          </div>
          <CardDescription>
            Select an active account or sign in to view and manage your MCP data.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Existing Users list */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Available Local Profiles
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {users.map((u) => {
                const isCurrent = currentUser?.id === u.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      onSelectUser(u);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
                      isCurrent
                        ? 'border-primary bg-primary/10 text-foreground font-medium'
                        : 'border-border/60 hover:border-border hover:bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted font-bold text-xs text-foreground">
                        {u.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                          {u.name}
                          {isCurrent && <Badge variant="default" className="text-[10px] py-0">Active</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                    {isCurrent && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or sign in with email</span>
            </div>
          </div>

          {/* Form to login or create account */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email Address</label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@company.com"
                className="mt-1"
              />
            </div>

            {isNewAccount && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Full Name</label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Doe"
                  className="mt-1"
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setIsNewAccount(!isNewAccount)}
                className="text-xs text-primary hover:underline"
              >
                {isNewAccount ? 'Already have an email account?' : '+ Create new user account'}
              </button>
            </div>

            <Button type="submit" disabled={loading || !email.trim()} className="w-full gap-2">
              <LogIn className="w-4 h-4" />
              {loading ? 'Signing in...' : isNewAccount ? 'Create & Switch Account' : 'Sign In'}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex justify-end pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
