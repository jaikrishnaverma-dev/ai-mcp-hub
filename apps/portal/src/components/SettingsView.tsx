import React, { useState, useEffect } from 'react';
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
  ShieldCheck,
  RefreshCw,
  Terminal,
  Settings,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Cpu,
  Layers,
} from 'lucide-react';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { Label } from './ui/label.js';

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

  // New Client Creation Form State
  const [newClientName, setNewClientName] = useState('Claude AI Web & Desktop');
  const [newRedirectUri, setNewRedirectUri] = useState('https://claude.ai/api/mcp/oauth/callback');
  const [clientCreating, setClientCreating] = useState(false);
  const [createdClient, setCreatedClient] = useState<OAuthClientItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [epRes, clRes] = await Promise.all([
        api.getWorkflows().catch(() => ({ endpoints: [] })),
        api.getOAuthClients().catch(() => ({ clients: [] })),
      ]);
      setEndpoints(epRes.endpoints || []);
      setClients(clRes.clients || []);
      if (epRes.endpoints?.length > 0 && !selectedEndpoint) {
        setSelectedEndpoint(epRes.endpoints[0] || null);
      }
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

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) {
      setFormError('Client name is required');
      return;
    }
    setClientCreating(true);
    setFormError(null);
    try {
      const res = await api.createOAuthClient({
        clientName: newClientName.trim(),
        redirectUris: newRedirectUri.trim() ? [newRedirectUri.trim()] : [],
        endpointId: selectedEndpoint?.id,
        scopes: ['read', 'write'],
      });
      setCreatedClient(res.client);
      await loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to generate credentials');
    } finally {
      setClientCreating(false);
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
  const activeClient = createdClient || (clients.length > 0 ? clients[0] : null);
  const mcpEndpointUrl = selectedEndpoint ? `${origin}/mcp/${selectedEndpoint.slug}` : `${origin}/mcp/daily`;
  const authUrl = `${origin}/oauth/authorize`;
  const tokenUrl = `${origin}/oauth/token`;

  if (!currentUser) {
    return (
      <div className="container max-w-4xl mx-auto py-16 px-4 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <Settings className="h-7 w-7 text-zinc-900 dark:text-zinc-100" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Settings &amp; AI Assistant Connection
        </h2>
        <p className="text-sm text-zinc-500 max-w-md mx-auto">
          Sign in with your Spent App account to get your Client ID, Secret, and configure Claude AI or ChatGPT.
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

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* Header */}
      <div className="space-y-1.5 pb-4 border-b border-zinc-200/80 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
              Settings &amp; Connect AI
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
              Credentials and step-by-step instructions for connecting Claude, ChatGPT, and MCP Harnesses.
            </p>
          </div>
        </div>
      </div>

      {/* Account Info Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold text-sm">
            {currentUser.name ? currentUser.name.slice(0, 2).toUpperCase() : 'AI'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{currentUser.name || 'User'}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                Spent App Verified
              </span>
            </div>
            <p className="text-xs text-zinc-500 font-mono">{currentUser.email} • ID: {currentUser.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-zinc-500 font-medium whitespace-nowrap">Target Endpoint:</Label>
          <select
            value={selectedEndpoint?.id || ''}
            onChange={(e) => {
              const ep = endpoints.find((x) => x.id === e.target.value) || null;
              setSelectedEndpoint(ep);
            }}
            className="h-9 px-3 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium focus:outline-hidden"
          >
            {endpoints.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.name} (/mcp/{ep.slug})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Primary Credentials Card */}
      <div className="rounded-2xl border border-purple-200/80 dark:border-purple-900/50 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <h2 className="text-sm font-bold text-zinc-950 dark:text-zinc-100">
              OAuth 2.0 / 2.1 Connection Credentials
            </h2>
          </div>
          <span className="text-xs text-zinc-500">
            Copy these into Claude or ChatGPT to authenticate your AI client
          </span>
        </div>

        {activeClient ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Client ID */}
            <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40 flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <span className="text-[10px] uppercase font-bold text-zinc-500 block">Client ID</span>
                <span className="text-xs font-mono font-medium text-zinc-900 dark:text-zinc-100 truncate block">
                  {activeClient.clientId}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy('cid', activeClient.clientId)}
                className="h-8 px-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                {copiedKey === 'cid' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>

            {/* Client Secret */}
            <div className="p-3 rounded-xl border border-purple-200/80 dark:border-purple-900/40 bg-purple-50/40 dark:bg-purple-950/20 flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 block">Client Secret</span>
                <span className="text-xs font-mono font-bold text-purple-900 dark:text-purple-200 truncate block">
                  {activeClient.clientSecret || '••••••••••••••••••••••••'}
                </span>
              </div>
              {activeClient.clientSecret && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy('csec', activeClient.clientSecret || '')}
                  className="h-8 px-2 text-purple-700 dark:text-purple-300"
                >
                  {copiedKey === 'csec' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              )}
            </div>

            {/* Authorization URL */}
            <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40 flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <span className="text-[10px] uppercase font-bold text-zinc-500 block">Authorization URL</span>
                <span className="text-xs font-mono text-zinc-800 dark:text-zinc-200 truncate block">
                  {authUrl}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy('auth_url', authUrl)}
                className="h-8 px-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                {copiedKey === 'auth_url' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>

            {/* Token URL */}
            <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40 flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <span className="text-[10px] uppercase font-bold text-zinc-500 block">Token URL</span>
                <span className="text-xs font-mono text-zinc-800 dark:text-zinc-200 truncate block">
                  {tokenUrl}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy('token_url', tokenUrl)}
                className="h-8 px-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                {copiedKey === 'token_url' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>

            {/* MCP Server URL */}
            <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40 flex items-center justify-between md:col-span-2">
              <div className="min-w-0 pr-2">
                <span className="text-[10px] uppercase font-bold text-zinc-500 block">MCP Endpoint (Streamable HTTP)</span>
                <span className="text-xs font-mono font-medium text-emerald-700 dark:text-emerald-400 truncate block">
                  {mcpEndpointUrl}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy('mcp_url', mcpEndpointUrl)}
                className="h-8 px-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                {copiedKey === 'mcp_url' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center space-y-3.5 rounded-xl bg-zinc-50/60 dark:bg-zinc-800/30 border border-dashed border-zinc-300 dark:border-zinc-700">
            <ShieldCheck className="h-8 w-8 text-zinc-400 mx-auto" />
            <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-sm mx-auto">
              Configure your AI client name and callback URI to generate your Client ID and Secret for Claude or ChatGPT:
            </p>

            {formError && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs border border-red-200 dark:border-red-900/50 max-w-md mx-auto">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-lg mx-auto">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Client Name</Label>
                <Input
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="e.g. Claude AI"
                  className="h-9 text-xs rounded-xl bg-white dark:bg-zinc-900"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Callback / Redirect URI</Label>
                <Input
                  value={newRedirectUri}
                  onChange={(e) => setNewRedirectUri(e.target.value)}
                  placeholder="https://claude.ai/api/mcp/oauth/callback"
                  className="h-9 text-xs rounded-xl font-mono bg-white dark:bg-zinc-900"
                />
              </div>
            </div>

            <Button
              onClick={handleCreateClient}
              disabled={clientCreating}
              className="h-9 px-5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs"
            >
              {clientCreating ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
              Generate Credentials
            </Button>
          </div>
        )}
      </div>

      {/* Step-by-Step Connection Guides */}
      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-5 shadow-2xs">
        <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <BookOpen className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
          <h2 className="text-sm font-bold text-zinc-950 dark:text-zinc-100">
            How to Connect Your AI Client
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
            Claude AI (Web / Remote MCP)
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
            ChatGPT (Custom GPT Actions)
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
            Test Harness &amp; Curl
          </button>
        </div>

        {/* Guide Content: Claude AI */}
        {activeGuideTab === 'claude' && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <span className="flex h-5 w-5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 items-center justify-center text-[10px]">1</span>
                  Add Remote MCP Server
                </div>
                <p className="text-zinc-500 leading-relaxed">
                  In Claude AI, go to <strong>Settings → Developer / Integrations</strong> and click <strong>Add Remote MCP Server</strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <span className="flex h-5 w-5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 items-center justify-center text-[10px]">2</span>
                  Paste MCP URL &amp; Auth
                </div>
                <p className="text-zinc-500 leading-relaxed">
                  Enter <strong>{mcpEndpointUrl}</strong> and configure <strong>OAuth 2.0</strong> with the Client ID &amp; Secret above.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <span className="flex h-5 w-5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 items-center justify-center text-[10px]">3</span>
                  One-Click Approval
                </div>
                <p className="text-zinc-500 leading-relaxed">
                  Claude opens the MCP Hub consent screen. Click <strong>Approve</strong> to complete the handshake and activate your tools!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Guide Content: ChatGPT */}
        {activeGuideTab === 'chatgpt' && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/50 space-y-2">
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
          </div>
        )}

        {/* Guide Content: Claude Desktop Config */}
        {activeGuideTab === 'desktop' && (
          <div className="space-y-3 text-xs">
            <p className="text-zinc-600 dark:text-zinc-400">
              For local or remote access via Claude Desktop, copy this into your <code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">claude_desktop_config.json</code>:
            </p>
            <div className="relative rounded-xl bg-zinc-950 p-4 font-mono text-[11px] text-zinc-100 overflow-x-auto">
              <pre>{`{
  "mcpServers": {
    "assistant": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-everything"
      ],
      "url": "${mcpEndpointUrl}"
    }
  }
}`}</pre>
              <button
                onClick={() => handleCopy('desktop_cfg', `{\n  "mcpServers": {\n    "assistant": {\n      "url": "${mcpEndpointUrl}"\n    }\n  }\n}`)}
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                title="Copy Config"
              >
                {copiedKey === 'desktop_cfg' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        )}

        {/* Guide Content: Test Harness & Curl */}
        {activeGuideTab === 'harness' && (
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/40 text-blue-900 dark:text-blue-300">
              <span className="font-semibold block mb-0.5">Streamable HTTP Transport Compatibility</span>
              <span>Our server accepts requests from test harnesses, Postman, and curl automatically normalized with <code className="font-mono bg-blue-100 dark:bg-blue-900/60 px-1 py-0.5 rounded">Accept: application/json, text/event-stream</code>.</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Test tools/list via Curl:</Label>
              <div className="relative rounded-xl bg-zinc-950 p-3 font-mono text-[11px] text-zinc-100 overflow-x-auto">
                <pre>{`curl -X POST ${mcpEndpointUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`}</pre>
                <button
                  onClick={() => handleCopy('curl_test', `curl -X POST ${mcpEndpointUrl} -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`)}
                  className="absolute top-3 right-3 p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                >
                  {copiedKey === 'curl_test' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Connected AI Clients List */}
      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
            <h2 className="text-sm font-bold text-zinc-950 dark:text-zinc-100">
              Active Registered Clients ({clients.length})
            </h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-8 px-3 rounded-xl text-xs gap-1.5"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {clients.length === 0 ? (
          <div className="py-6 text-center text-xs text-zinc-500">
            No OAuth clients registered yet. Use the credentials generator above to create one.
          </div>
        ) : (
          <div className="space-y-2">
            {clients.map((c) => (
              <div
                key={c.clientId}
                className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <span>{c.clientName}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-md bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      {c.clientId}
                    </span>
                  </div>
                  {c.redirectUris && c.redirectUris.length > 0 && (
                    <div className="font-mono text-[10px] text-zinc-400 truncate">
                      Redirect: {c.redirectUris.join(', ')}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevokeClient(c.clientId)}
                  className="h-8 px-2.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
