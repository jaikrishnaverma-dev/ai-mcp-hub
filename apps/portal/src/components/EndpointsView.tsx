import React, { useState, useEffect } from 'react';
import {
  Server,
  Plus,
  Copy,
  Check,
  Power,
  Trash2,
  Terminal,
  Cpu,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/card.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';
import { api, type EndpointItem, type McpToolCatalogItem } from '../api/client.js';

export function EndpointsView() {
  const [endpoints, setEndpoints] = useState<EndpointItem[]>([]);
  const [catalog, setCatalog] = useState<McpToolCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create Endpoint modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newInstructions, setNewInstructions] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [customSlug, setCustomSlug] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inspector / Tester state
  const [inspectEndpoint, setInspectEndpoint] = useState<EndpointItem | null>(null);
  const [inspectResult, setInspectResult] = useState<string | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [endRes, catRes] = await Promise.all([
        api.getEndpoints(),
        api.getMcpCatalog().catch(() => ({ tools: [] })),
      ]);
      setEndpoints(endRes.endpoints || []);
      setCatalog(catRes.tools || []);
      if (endRes.endpoints?.length > 0 && !inspectEndpoint) {
        setInspectEndpoint(endRes.endpoints[0] || null);
      }
    } catch (err) {
      console.error('Failed to load MCP endpoints data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleTool = (toolName: string) => {
    if (selectedTools.includes(toolName)) {
      setSelectedTools(selectedTools.filter((t) => t !== toolName));
    } else {
      if (selectedTools.length >= 15) {
        alert('Per AGENTS.md security guidelines, each endpoint allows up to 15 tools.');
        return;
      }
      setSelectedTools([...selectedTools, toolName]);
    }
  };

  const handleCreateEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || selectedTools.length === 0) {
      alert('Please provide an endpoint name and select at least one tool.');
      return;
    }

    try {
      setIsSubmitting(true);
      await api.createEndpoint({
        name: newName.trim(),
        instructions: newInstructions.trim() || undefined,
        slug: customSlug.trim() || undefined,
        toolAllowlist: selectedTools,
      });
      setShowCreateModal(false);
      setNewName('');
      setNewInstructions('');
      setCustomSlug('');
      setSelectedTools([]);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create endpoint');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (ep: EndpointItem) => {
    try {
      const nextStatus = ep.status === 'active' ? 'revoked' : 'active';
      await api.updateEndpoint(ep.id, { status: nextStatus });
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this MCP endpoint?')) return;
    try {
      await api.deleteEndpoint(id);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete endpoint');
    }
  };

  const runMcpTestPing = async (ep: EndpointItem) => {
    try {
      setInspectLoading(true);
      setInspectResult(null);

      // Call MCP POST /mcp/:slug with a standard initialize or tools/list JSON-RPC request
      const res = await fetch(`/mcp/${ep.slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'test-ping-1',
          method: 'tools/list',
          params: {},
        }),
      });

      const data = await res.json();
      setInspectResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setInspectResult(`Ping failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setInspectLoading(false);
    }
  };

  const origin = window.location.origin;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">MCP Server & Endpoints Manager</h2>
            <Badge variant="outline" className="font-mono text-xs">
              HTTP Transport
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure scoped AI endpoints, manage tool allowlists, and generate client configs
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedTools(catalog.map((t) => t.name).slice(0, 9));
            setShowCreateModal(true);
          }}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          Create Scoped Endpoint
        </Button>
      </div>

      {/* Endpoints Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full text-center py-12 text-sm text-muted-foreground">
            Loading endpoints...
          </div>
        ) : endpoints.length === 0 ? (
          <div className="col-span-full p-8 border rounded-xl text-center space-y-3">
            <Server className="w-8 h-8 mx-auto text-muted-foreground" />
            <h3 className="font-semibold">No endpoints registered</h3>
            <p className="text-xs text-muted-foreground">
              Create an endpoint or run the seed script to start testing.
            </p>
          </div>
        ) : (
          endpoints.map((ep) => {
            const mcpUrl = `${origin}/mcp/${ep.slug}`;
            const claudeConfig = JSON.stringify(
              {
                mcpServers: {
                  [ep.slug]: {
                    url: mcpUrl,
                  },
                },
              },
              null,
              2,
            );

            return (
              <Card
                key={ep.id}
                className={`flex flex-col justify-between transition-all ${
                  ep.status === 'active' ? 'border-border/80 hover:border-primary/50' : 'border-border/40 opacity-60'
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-primary shrink-0" />
                        {ep.name}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-xs text-muted-foreground">/mcp/{ep.slug}</span>
                      </div>
                    </div>
                    <Badge variant={ep.status === 'active' ? 'success' : 'destructive'} className="capitalize">
                      {ep.status}
                    </Badge>
                  </div>
                  {ep.instructions && (
                    <CardDescription className="text-xs line-clamp-2 mt-2">
                      {ep.instructions}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="space-y-4 pt-1">
                  {/* Tools preview */}
                  <div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground font-medium mb-1.5">
                      <span className="flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5" />
                        Allowlisted Tools ({ep.toolAllowlist.length}/15)
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                      {ep.toolAllowlist.map((tool) => (
                        <span
                          key={tool}
                          className="px-2 py-0.5 rounded text-[11px] font-mono bg-muted/60 text-muted-foreground border border-border"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* 1-Click Client Snippets */}
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-medium">Claude Desktop / Cursor</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(claudeConfig, `claude-${ep.id}`)}
                        className="h-6 px-2 text-[11px] gap-1 hover:text-primary"
                      >
                        {copiedId === `claude-${ep.id}` ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        Copy JSON Config
                      </Button>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-medium">Direct Stream URL</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(mcpUrl, `url-${ep.id}`)}
                        className="h-6 px-2 text-[11px] gap-1 hover:text-primary"
                      >
                        {copiedId === `url-${ep.id}` ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        Copy URL
                      </Button>
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="pt-3 border-t flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setInspectEndpoint(ep);
                        runMcpTestPing(ep);
                      }}
                      className="h-7 text-xs gap-1"
                    >
                      <Terminal className="w-3 h-3" />
                      Test Ping
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleStatus(ep)}
                      className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <Power className="w-3 h-3" />
                      {ep.status === 'active' ? 'Disable' : 'Enable'}
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(ep.id)}
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })
        )}
      </div>

      {/* Live MCP Inspector & Test Console */}
      {inspectEndpoint && (
        <Card className="border-border/80 bg-zinc-950/60 shadow-xl overflow-hidden mt-6">
          <CardHeader className="bg-zinc-900/50 py-3 border-b flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <CardTitle className="text-sm font-mono">
                MCP Inspector — testing <span className="text-primary">/mcp/{inspectEndpoint.slug}</span>
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => runMcpTestPing(inspectEndpoint)}
                disabled={inspectLoading}
                className="h-7 text-xs gap-1.5"
              >
                <Sparkles className="w-3 h-3 text-emerald-400" />
                {inspectLoading ? 'Pinging...' : 'Send tools/list Request'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4 font-mono text-xs">
            {inspectLoading ? (
              <p className="text-muted-foreground animate-pulse">
                Calling MCP endpoint protocol handshake...
              </p>
            ) : inspectResult ? (
              <pre className="max-h-64 overflow-y-auto text-emerald-300 whitespace-pre-wrap bg-black/40 p-3 rounded-lg border border-zinc-800">
                {inspectResult}
              </pre>
            ) : (
              <p className="text-muted-foreground">
                Click "Send tools/list Request" above to test the real-time MCP transport roundtrip.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create Endpoint Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <Card className="w-full max-w-2xl border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                Create Scoped MCP Endpoint
              </CardTitle>
              <CardDescription>
                Assign an AI persona, instructions, and an allowlist of up to 15 tools.
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleCreateEndpoint}>
              <CardContent className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Endpoint Name *</label>
                    <Input
                      required
                      placeholder="e.g. Daily Executive Assistant"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Custom URL Slug (optional)
                    </label>
                    <Input
                      placeholder="e.g. daily-assistant"
                      value={customSlug}
                      onChange={(e) => setCustomSlug(e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Persona / System Instructions
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. You are an executive assistant helping plan the user's day..."
                    value={newInstructions}
                    onChange={(e) => setNewInstructions(e.target.value)}
                    className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Tool Allowlist ({selectedTools.length} / 15 selected)
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedTools(catalog.map((t) => t.name).slice(0, 15))}
                        className="text-xs text-primary hover:underline"
                      >
                        Select All (up to 15)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedTools([])}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 border rounded-lg bg-background/50">
                    {catalog.map((tool) => {
                      const isSelected = selectedTools.includes(tool.name);
                      return (
                        <div
                          key={tool.name}
                          onClick={() => handleToggleTool(tool.name)}
                          className={`p-2 rounded-md border cursor-pointer select-none transition-colors ${
                            isSelected
                              ? 'border-primary bg-primary/10 text-foreground'
                              : 'border-border/60 hover:bg-muted/40 text-muted-foreground'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-semibold">{tool.name}</span>
                            <Badge variant="outline" className="text-[10px] py-0">
                              {tool.requiredScope}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                            {tool.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex justify-end gap-2 pt-3 border-t">
                <Button type="button" variant="ghost" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || selectedTools.length === 0}>
                  {isSubmitting ? 'Creating...' : 'Create Endpoint'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
