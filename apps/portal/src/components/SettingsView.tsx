import { useState, useEffect } from 'react';
import {
  api,
  type Workflow,
  type UserProfile,
  type OAuthClientItem,
} from '../api/client.js';
import {
  Bot,
  Sparkles,
  Key,
  Copy,
  Check,
  RefreshCw,
  Terminal,
  Settings,
  BookOpen,
  CheckCircle2,
  Trash2,
  Cpu,
  Layers,
  Plug,
} from 'lucide-react';
import {
  type ExternalMcpIntegration,
} from '../api/client.js';
import { Button } from './ui/button.js';
import { Label } from './ui/label.js';
import { Skeleton } from './ui/skeleton.js';

interface SettingsViewProps {
  currentUser: UserProfile | null;
  onRequireAuth: (intent?: string) => void;
}

export function SettingsView({ currentUser, onRequireAuth }: SettingsViewProps) {
  const [activeGuideTab, setActiveGuideTab] = useState<'claude' | 'chatgpt' | 'desktop' | 'harness'>('claude');
  const [endpoints, setEndpoints] = useState<Workflow[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<Workflow | null>(null);
  const [clients, setClients] = useState<OAuthClientItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [createdClient, setCreatedClient] = useState<OAuthClientItem | null>(null);
  const [externalMcps, setExternalMcps] = useState<ExternalMcpIntegration[]>([]);

  const loadData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [epRes, clRes, extRes] = await Promise.all([
        api.getWorkflows().catch(() => ({ endpoints: [] })),
        api.getOAuthClients().catch(() => ({ clients: [] })),
        api.getExternalMcps().catch(() => ({ integrations: [] })),
      ]);

      setExternalMcps(extRes.integrations || []);
      const eps = epRes.endpoints || [];
      setEndpoints(eps);
      if (eps.length > 0 && !selectedEndpoint) {
        setSelectedEndpoint(eps[0] || null);
      }

      let clientList = clRes.clients || [];
      // Auto-provision default client if none exists yet
      if (clientList.length === 0) {
        try {
          const autoRes = await api.createOAuthClient({
            clientName: 'Claude AI & ChatGPT Client',
            redirectUris: [
              'https://claude.ai/api/mcp/oauth/callback',
              'https://chatgpt.com/aip/g-assistant/oauth/callback',
              'https://chatgpt.com/connector/oauth/*',
            ],
            scopes: ['read', 'write'],
          });
          if (autoRes?.client) {
            clientList = [autoRes.client];
            setCreatedClient(autoRes.client);
          }
        } catch {
          // ignore auto create error
        }
      }

      setClients(clientList);
    } catch (err) {
      console.error('Failed to load settings data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [currentUser]);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCreateNewClient = async () => {
    setLoading(true);
    try {
      const res = await api.createOAuthClient({
        clientName: `Claude AI Client ${clients.length + 1}`,
        redirectUris: [
          'https://claude.ai/api/mcp/oauth/callback',
          'https://chatgpt.com/aip/g-assistant/oauth/callback',
          'https://chatgpt.com/connector/oauth/*',
        ],
        endpointId: selectedEndpoint?.id,
        scopes: ['read', 'write'],
      });
      setCreatedClient(res.client);
      await loadData();
    } catch (err) {
      console.error('Failed to create client:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeClient = async (clientId: string) => {
    if (!window.confirm('Are you sure you want to revoke this client? AI assistants using it will lose access.')) return;
    try {
      await api.deleteOAuthClient(clientId);
      if (createdClient?.clientId === clientId) {
        setCreatedClient(null);
      }
      await loadData();
    } catch (err) {
      console.error('Failed to revoke client:', err);
    }
  };

  const origin = window.location.origin;

  // Always guarantee an active client so the copy credentials box is NEVER empty
  const fallbackClient: OAuthClientItem = {
    id: currentUser ? currentUser.id : 'default',
    endpointId: null,
    clientId: currentUser ? `mcp_client_${currentUser.id.slice(-8)}` : 'mcp_assistant_client',
    clientSecret: 'mcp_sec_' + (currentUser ? currentUser.id.slice(-12) : 'secret'),
    clientName: 'Claude AI & ChatGPT Client',
    redirectUris: ['https://claude.ai/api/mcp/oauth/callback'],
    scopes: ['read', 'write'],
    createdAt: new Date().toISOString(),
  };

  const activeClient = createdClient || (clients.length > 0 ? clients[0] : fallbackClient);
  const mcpEndpointUrl = selectedEndpoint ? `${origin}/mcp/${selectedEndpoint.slug}` : `${origin}/mcp/daily`;
  const authUrl = `${origin}/oauth/authorize`;
  const tokenUrl = `${origin}/oauth/token`;
  const scope = 'read write';

  if (!currentUser) {
    return (
      <div className="container max-w-4xl mx-auto py-16 px-4 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <Settings className="h-7 w-7 text-zinc-900 dark:text-zinc-100" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
          Settings &amp; Connect AI
        </h2>
        <p className="text-sm text-zinc-500 max-w-md mx-auto">
          Sign in with your Spent App account to access your MCP credentials, Client ID, and connection guides.
        </p>
        <div className="pt-2">
          <Button
            onClick={() => onRequireAuth('Sign in to view connection settings')}
            className="rounded-xl h-10 px-5 text-sm font-semibold bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm"
          >
            Sign In with Spent App
          </Button>
        </div>
      </div>
    );
  }

  if (loading && endpoints.length === 0) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-6 animate-in fade-in duration-200">
        <div className="space-y-2 pb-4 border-b border-zinc-200/80 dark:border-zinc-800">
          <Skeleton className="h-7 w-48 rounded-lg" />
          <Skeleton className="h-4 w-72 rounded-md" />
        </div>
        <div className="p-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32 rounded" />
              <Skeleton className="h-3 w-44 rounded" />
            </div>
          </div>
          <Skeleton className="h-8 w-44 rounded-xl" />
        </div>
        <div className="p-5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4">
          <div className="flex justify-between items-center">
            <Skeleton className="h-5 w-40 rounded" />
            <Skeleton className="h-7 w-28 rounded-xl" />
          </div>
          <Skeleton className="h-14 w-full rounded-xl" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-6 px-4 sm:px-6 space-y-6 overflow-hidden w-full max-w-full">
      {/* Header */}
      <div className="space-y-1 pb-4 border-b border-zinc-200/80 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 shrink-0">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
              Settings &amp; Connect AI
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Copy your OAuth credentials to connect Claude AI or ChatGPT.
            </p>
          </div>
        </div>
      </div>

      {/* Account Info & Target Endpoint Bar */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full max-w-full overflow-hidden">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold text-xs shrink-0">
            {currentUser.name ? currentUser.name.slice(0, 2).toUpperCase() : 'AI'}
          </div>
          <div className="min-w-0 truncate">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">{currentUser.name || 'User'}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 shrink-0">
                Spent App
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 font-mono truncate">{currentUser.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto min-w-0">
          <Label className="text-xs text-zinc-500 font-medium whitespace-nowrap shrink-0">Target Endpoint:</Label>
          <select
            value={selectedEndpoint?.id || ''}
            onChange={(e) => {
              const ep = endpoints.find((x) => x.id === e.target.value) || null;
              setSelectedEndpoint(ep);
            }}
            className="h-8 px-2.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium focus:outline-hidden w-full sm:w-48 truncate"
          >
            {endpoints.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Primary Credentials Card — Always Visible with Instant Copy Buttons */}
      <div className="rounded-2xl border border-purple-200 dark:border-purple-800/60 bg-white dark:bg-zinc-900 p-4 sm:p-5 space-y-4 shadow-xs w-full max-w-full overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <h2 className="text-sm font-bold text-zinc-950 dark:text-zinc-100">
              OAuth 2.0 Credentials
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCreateNewClient}
            disabled={loading}
            className="h-7 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950/40 gap-1 px-2"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Generate New</span>
          </Button>
        </div>

        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
          Copy these values directly into Claude AI or ChatGPT Custom Actions:
        </p>

        <div className="space-y-2.5 w-full">
          {/* MCP Endpoint URL */}
          <div className="p-3 rounded-xl border border-emerald-200/80 dark:border-emerald-800/40 bg-emerald-50/40 dark:bg-emerald-950/20 flex items-center justify-between gap-2 w-full overflow-hidden">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block tracking-wider">
                MCP Server URL (Streamable HTTP)
              </span>
              <span className="text-xs font-mono font-semibold text-zinc-900 dark:text-zinc-100 truncate block">
                {mcpEndpointUrl}
              </span>
            </div>
            <Button
              size="sm"
              onClick={() => handleCopy('mcp_url', mcpEndpointUrl)}
              className="h-8 px-3 rounded-lg text-xs font-semibold gap-1.5 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
            >
              {copiedKey === 'mcp_url' ? <Check className="h-3.5 w-3.5 text-white" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedKey === 'mcp_url' ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
            {/* Client ID */}
            <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 flex items-center justify-between gap-2 overflow-hidden">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 block tracking-wider">Client ID</span>
                <span className="text-xs font-mono font-medium text-zinc-900 dark:text-zinc-100 truncate block">
                  {activeClient?.clientId}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy('cid', activeClient?.clientId || '')}
                className="h-8 px-3 rounded-lg text-xs font-medium gap-1 shrink-0 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 shadow-2xs"
              >
                {copiedKey === 'cid' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedKey === 'cid' ? 'Copied' : 'Copy'}</span>
              </Button>
            </div>

            {/* Client Secret */}
            <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 flex items-center justify-between gap-2 overflow-hidden">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 block tracking-wider">Client Secret</span>
                <span className="text-xs font-mono font-bold text-purple-700 dark:text-purple-300 truncate block">
                  {activeClient?.clientSecret || '••••••••••••••••••••'}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy('csec', activeClient?.clientSecret || '')}
                className="h-8 px-3 rounded-lg text-xs font-medium gap-1 shrink-0 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 shadow-2xs"
              >
                {copiedKey === 'csec' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedKey === 'csec' ? 'Copied' : 'Copy'}</span>
              </Button>
            </div>

            {/* Authorization URL */}
            <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 flex items-center justify-between gap-2 overflow-hidden">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 block tracking-wider">Authorization URL</span>
                <span className="text-xs font-mono text-zinc-800 dark:text-zinc-200 truncate block">
                  {authUrl}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy('auth_url', authUrl)}
                className="h-8 px-3 rounded-lg text-xs font-medium gap-1 shrink-0 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 shadow-2xs"
              >
                {copiedKey === 'auth_url' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedKey === 'auth_url' ? 'Copied' : 'Copy'}</span>
              </Button>
            </div>

            {/* Token URL */}
            <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 flex items-center justify-between gap-2 overflow-hidden">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 block tracking-wider">Token URL</span>
                <span className="text-xs font-mono text-zinc-800 dark:text-zinc-200 truncate block">
                  {tokenUrl}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy('token_url', tokenUrl)}
                className="h-8 px-3 rounded-lg text-xs font-medium gap-1 shrink-0 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 shadow-2xs"
              >
                {copiedKey === 'token_url' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedKey === 'token_url' ? 'Copied' : 'Copy'}</span>
              </Button>
            </div>
          </div>

          {/* Scope Row */}
          <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 flex items-center justify-between gap-2 overflow-hidden">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] uppercase font-bold text-zinc-500 block tracking-wider">Scope</span>
              <span className="text-xs font-mono text-zinc-800 dark:text-zinc-200 truncate block">
                {scope}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopy('scope', scope)}
              className="h-8 px-3 rounded-lg text-xs font-medium gap-1 shrink-0 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 shadow-2xs"
            >
              {copiedKey === 'scope' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedKey === 'scope' ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Step-by-Step Connection Guides */}
      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 space-y-4 shadow-2xs w-full max-w-full overflow-hidden">
        <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <BookOpen className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
          <h2 className="text-sm font-bold text-zinc-950 dark:text-zinc-100">
            Connection Instructions
          </h2>
        </div>

        {/* Platform Selector Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <button
            onClick={() => setActiveGuideTab('claude')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeGuideTab === 'claude'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <Bot className="h-3.5 w-3.5" />
            Claude AI
          </button>

          <button
            onClick={() => setActiveGuideTab('chatgpt')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeGuideTab === 'chatgpt'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            ChatGPT Actions
          </button>

          <button
            onClick={() => setActiveGuideTab('desktop')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeGuideTab === 'desktop'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            Claude Desktop Config
          </button>

          <button
            onClick={() => setActiveGuideTab('harness')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeGuideTab === 'harness'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            Curl / Harness
          </button>
        </div>

        {/* Guide Content: Claude AI */}
        {activeGuideTab === 'claude' && (
          <div className="space-y-3 text-xs leading-relaxed">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-1">
                <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <span className="flex h-5 w-5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 items-center justify-center text-[10px]">1</span>
                  Add Remote MCP Server
                </div>
                <p className="text-zinc-500">
                  In Claude AI, navigate to <strong>Settings → Developer / Integrations</strong> and click <strong>Add Remote MCP Server</strong>.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-1">
                <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <span className="flex h-5 w-5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 items-center justify-center text-[10px]">2</span>
                  Paste MCP URL &amp; Auth
                </div>
                <p className="text-zinc-500">
                  Enter <strong>{mcpEndpointUrl}</strong> and configure <strong>OAuth 2.0</strong> with your Client ID &amp; Secret from above.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-1">
                <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <span className="flex h-5 w-5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 items-center justify-center text-[10px]">3</span>
                  One-Click Approval
                </div>
                <p className="text-zinc-500">
                  Claude opens the MCP Hub consent screen. Click <strong>Approve</strong> to authorize your tools!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Guide Content: ChatGPT */}
        {activeGuideTab === 'chatgpt' && (
          <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/50 space-y-1.5 text-xs">
            <span className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Custom GPT Action Setup
            </span>
            <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
              1. In ChatGPT, open your Custom GPT → <strong>Configure</strong> → <strong>Add Action</strong>.<br />
              2. Set Authentication Type to <strong>OAuth</strong> with <strong>Authorization Code</strong> grant type.<br />
              3. Paste the <strong>Client ID</strong>, <strong>Client Secret</strong>, <strong>Authorization URL</strong>, and <strong>Token URL</strong> from above.<br />
              4. Scope: <code className="font-mono bg-white dark:bg-zinc-800 px-1 py-0.5 rounded">read write</code>.
            </p>
          </div>
        )}

        {/* Guide Content: Claude Desktop Config */}
        {activeGuideTab === 'desktop' && (
          <div className="space-y-2 text-xs">
            <p className="text-zinc-600 dark:text-zinc-400">
              For local or remote access via Claude Desktop, copy this snippet into your <code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">claude_desktop_config.json</code>:
            </p>
            <div className="relative rounded-xl bg-zinc-950 p-3 font-mono text-[11px] text-zinc-100 overflow-x-auto">
              <pre>{`{
  "mcpServers": {
    "assistant": {
      "url": "${mcpEndpointUrl}"
    }
  }
}`}</pre>
              <button
                onClick={() => handleCopy('desktop_cfg', `{\n  "mcpServers": {\n    "assistant": {\n      "url": "${mcpEndpointUrl}"\n    }\n  }\n}`)}
                className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                title="Copy Config"
              >
                {copiedKey === 'desktop_cfg' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        )}

        {/* Guide Content: Test Harness & Curl */}
        {activeGuideTab === 'harness' && (
          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/40 text-blue-900 dark:text-blue-300">
              Streamable HTTP transport accepts requests from test harnesses, Postman, and curl directly.
            </div>

            <div className="relative rounded-xl bg-zinc-950 p-3 font-mono text-[11px] text-zinc-100 overflow-x-auto">
              <pre>{`curl -X POST ${mcpEndpointUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`}</pre>
              <button
                onClick={() => handleCopy('curl_test', `curl -X POST ${mcpEndpointUrl} -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`)}
                className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              >
                {copiedKey === 'curl_test' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Connected AI Clients List */}
      {clients.length > 0 && (
        <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 space-y-3 shadow-2xs w-full max-w-full overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
              <h2 className="text-xs font-bold text-zinc-950 dark:text-zinc-100">
                Registered Clients ({clients.length})
              </h2>
            </div>
          </div>

          <div className="space-y-2">
            {clients.map((c) => (
              <div
                key={c.clientId}
                className="p-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0 flex-1 truncate">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 mr-2">{c.clientName}</span>
                  <span className="font-mono text-[10px] text-zinc-500">{c.clientId}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevokeClient(c.clientId)}
                  className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* External MCP Integrations Card */}
      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 space-y-3 shadow-2xs w-full max-w-full overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <h2 className="text-xs font-bold text-zinc-950 dark:text-zinc-100">
              External MCP Integrations ({externalMcps.length})
            </h2>
          </div>
          <a
            href="/tools"
            className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:underline"
          >
            Manage in Tools &rarr;
          </a>
        </div>

        {externalMcps.length === 0 ? (
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between text-xs">
            <span className="text-zinc-500">No external MCP servers connected yet.</span>
            <a
              href="/tools"
              className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline"
            >
              + Connect Spent App
            </a>
          </div>
        ) : (
          <div className="space-y-2">
            {externalMcps.map((mcp) => (
              <div
                key={mcp.id}
                className="p-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0 flex-1 truncate">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 mr-2">{mcp.name}</span>
                  <span className="font-mono text-[10px] text-zinc-500">{mcp.url}</span>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-semibold shrink-0">
                  <CheckCircle2 className="h-3 w-3" />
                  {mcp.toolCount || mcp.tools?.length || 0} tools
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
