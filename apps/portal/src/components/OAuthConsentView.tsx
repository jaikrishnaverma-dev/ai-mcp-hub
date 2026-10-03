import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type OAuthClientInfoResponse, type UserProfile } from '../api/client.js';
import { ShieldCheck, Bot, Check, AlertCircle, ArrowRight, ExternalLink, Sparkles } from 'lucide-react';
import { Button } from './ui/button.js';

interface OAuthConsentViewProps {
  currentUser: UserProfile | null;
  onRequireAuth: (intent?: string) => void;
}

export function OAuthConsentView({ currentUser, onRequireAuth }: OAuthConsentViewProps) {
  const [searchParams] = useSearchParams();

  const clientId = searchParams.get('client_id') || '';
  const redirectUri = searchParams.get('redirect_uri') || '';
  const state = searchParams.get('state') || '';
  const scope = searchParams.get('scope') || 'read write';
  const codeChallenge = searchParams.get('code_challenge') || '';
  const codeChallengeMethod = searchParams.get('code_challenge_method') || 'S256';

  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientData, setClientData] = useState<OAuthClientInfoResponse | null>(null);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string>('');

  useEffect(() => {
    if (!clientId || !redirectUri) {
      setError('Missing required OAuth parameters: client_id and redirect_uri are mandatory.');
      setLoading(false);
      return;
    }

    const loadClientInfo = async () => {
      try {
        setLoading(true);
        const data = await api.getOAuthClientInfo({
          clientId,
          redirectUri,
          state,
          scope,
        });
        setClientData(data);
        if (data.client.endpointId) {
          setSelectedEndpointId(data.client.endpointId);
        } else if (data.endpoints && data.endpoints.length > 0) {
          setSelectedEndpointId(data.endpoints[0]?.id || '');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to validate authorization request';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    loadClientInfo();
  }, [clientId, redirectUri, state, scope]);

  const handleApprove = async () => {
    if (!currentUser) {
      onRequireAuth('Sign in to authorize this AI client');
      return;
    }

    try {
      setApproving(true);
      const res = await api.approveOAuth({
        clientId,
        redirectUri,
        endpointId: selectedEndpointId || undefined,
        scopes: clientData?.client.scopes || ['read', 'write'],
        state,
        codeChallenge: codeChallenge || undefined,
        codeChallengeMethod: codeChallengeMethod || undefined,
      });

      if (res.redirectUrl) {
        // Redirect browser back to Claude/ChatGPT callback
        window.location.href = res.redirectUrl;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authorization approval failed';
      setError(msg);
      setApproving(false);
    }
  };

  const handleDeny = () => {
    if (redirectUri) {
      try {
        const url = new URL(redirectUri);
        url.searchParams.set('error', 'access_denied');
        url.searchParams.set('error_description', 'The user denied the authorization request');
        if (state) url.searchParams.set('state', state);
        window.location.href = url.toString();
        return;
      } catch {
        // fallback
      }
    }
    window.location.href = '/tools';
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="mx-auto h-10 w-10 border-2 border-zinc-900 border-t-transparent dark:border-zinc-100 dark:border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-mono text-zinc-500">Validating client authorization...</p>
        </div>
      </div>
    );
  }

  if (error || !clientData) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/20 p-6 space-y-4 shadow-sm text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-red-900 dark:text-red-300">
              Authorization Request Failed
            </h2>
            <p className="text-xs text-red-700/80 dark:text-red-400">
              {error || 'Unable to load client authorization information.'}
            </p>
          </div>
          <div className="pt-2">
            <Button
              onClick={() => (window.location.href = '/tools')}
              className="rounded-xl h-9 px-4 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white"
            >
              Return to MCP Hub
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-lg w-full rounded-3xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden">
        {/* Header Ribbon */}
        <div className="p-6 bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-900/90 dark:to-zinc-900 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 flex items-center justify-center shadow-sm">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
                Authorize AI Connection
              </h1>
              <p className="text-xs text-zinc-500">OAuth 2.1 PKCE Handshake</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 text-[11px] font-semibold">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Secure MCP</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Client Info Banner */}
          <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-800/40 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                <span className="font-bold underline decoration-purple-400 underline-offset-2">
                  {clientData.client.clientName}
                </span>{' '}
                wants access to your Process Manager
              </p>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              This will grant the AI client permission to interact with your tasks and process workflows.
            </p>
          </div>

          {/* Endpoint Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Target MCP Endpoint
            </label>
            <select
              value={selectedEndpointId}
              onChange={(e) => setSelectedEndpointId(e.target.value)}
              className="w-full h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
            >
              {clientData.endpoints.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.name} ({ep.toolCount} tools · /{ep.slug})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-400">
              Only tools allowlisted for this endpoint will be exposed to the AI client.
            </p>
          </div>

          {/* Scopes & Permissions */}
          <div className="space-y-2 pt-1">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[10px]">
              Requested Permissions
            </label>
            <div className="space-y-2 rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 shadow-2xs divide-y divide-zinc-100 dark:divide-zinc-800/60">
              <div className="flex items-start gap-2.5 pb-2">
                <div className="h-5 w-5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                </div>
                <div className="text-xs">
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                    Read items, decisions & daily brief
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Inspect current goals, stories, tasks, blockers, and calculate daily focus.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 pt-2">
                <div className="h-5 w-5 rounded-md bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                </div>
                <div className="text-xs">
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                    Create & complete process tasks
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Record tasks, link dependencies, log decisions, and record blockers.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* User Account Verification */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-100/70 dark:bg-zinc-800/40 text-xs">
            <span className="text-zinc-500">Authorize as:</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {currentUser ? `${currentUser.name} (${currentUser.email})` : 'Default User (Jai)'}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={handleDeny}
              disabled={approving}
              className="flex-1 h-11 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <Button
              type="button"
              onClick={handleApprove}
              disabled={approving}
              className="flex-1 h-11 rounded-2xl bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs font-semibold shadow-md gap-2 cursor-pointer"
            >
              {approving ? (
                <>
                  <div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Authorizing...</span>
                </>
              ) : (
                <>
                  <span>Approve & Connect</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>

          {/* Redirect Destination note */}
          <div className="text-center pt-1">
            <p className="text-[11px] text-zinc-400 flex items-center justify-center gap-1">
              <span>Will redirect back to</span>
              <span className="font-mono text-zinc-600 dark:text-zinc-300 truncate max-w-[200px]">
                {redirectUri}
              </span>
              <ExternalLink className="h-3 w-3" />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
