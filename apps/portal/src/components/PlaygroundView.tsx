import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  api,
  type Workflow,
  type UserProfile,
} from '../api/client.js';
import {
  Sparkles,
  Send,
  Loader2,
  RotateCcw,
  Wrench,
  Bot,
  User,
  CheckCircle2,
  Copy,
  Check,
  Sliders,
  ArrowLeft,
  ChevronDown,
} from 'lucide-react';
import { Button } from './ui/button.js';
import { Textarea } from './ui/textarea.js';

interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  executedTools?: Array<{
    name: string;
    args: Record<string, unknown>;
    result: unknown;
    status: 'success' | 'error';
  }>;
}

interface PlaygroundViewProps {
  currentUser: UserProfile | null;
  onRequireAuth: (intent?: string) => void;
}

const FREE_MODELS = [
  { id: 'openrouter/free', name: 'mcphub-ai (Default)' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)' },
  { id: 'google/gemma-4-26b-a4b-it:free', name: 'Gemma 4 26B (Free)' },
  { id: 'qwen/qwen3.8-27b:free', name: 'Qwen 3.8 27B (Free)' },
];

export function PlaygroundView({ currentUser, onRequireAuth: _onRequireAuth }: PlaygroundViewProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const workflowIdParam = searchParams.get('workflowId') || searchParams.get('id');

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [loadingWorkflows, setLoadingWorkflows] = useState(true);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('openrouter/free');
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('assistant_openrouter_key') || '');
  const [showSettings, setShowSettings] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load available workflows to populate selector and active workflow
  useEffect(() => {
    async function loadAll() {
      setLoadingWorkflows(true);
      try {
        const [myRes, pubRes] = await Promise.all([
          currentUser ? api.getWorkflows().catch(() => ({ endpoints: [] })) : Promise.resolve({ endpoints: [] }),
          api.getPublicWorkflows().catch(() => ({ workflows: [] })),
        ]);

        const all = [...(myRes.endpoints || []), ...(pubRes.workflows || [])];
        // Unique by id
        const unique = Array.from(new Map(all.map((w) => [w.id, w])).values());
        setWorkflows(unique);

        if (workflowIdParam) {
          const matched = unique.find((w) => w.id === workflowIdParam || w.slug === workflowIdParam);
          if (matched) {
            setActiveWorkflow(matched);
          } else if (unique.length > 0) {
            setActiveWorkflow(unique[0]!);
          }
        } else if (unique.length > 0) {
          setActiveWorkflow(unique[0]!);
        }
      } catch (err) {
        console.error('Failed to load workflows for playground:', err);
      } finally {
        setLoadingWorkflows(false);
      }
    }
    loadAll();
  }, [currentUser, workflowIdParam]);

  // When active workflow changes, initialize or reset conversation
  useEffect(() => {
    if (!activeWorkflow) return;

    const sysPrompt = activeWorkflow.instructions ||
      `You are an AI assistant specialized in the "${activeWorkflow.name}" workflow. Help the user achieve their goals by invoking your available MCP tools accurately.`;

    setMessages([
      {
        id: 'sys-1',
        role: 'system',
        content: sysPrompt,
      },
    ]);
  }, [activeWorkflow]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSelectWorkflow = (wfId: string) => {
    const selected = workflows.find((w) => w.id === wfId);
    if (selected) {
      setActiveWorkflow(selected);
      setSearchParams({ workflowId: selected.id });
    }
  };

  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    if (key.trim()) {
      localStorage.setItem('assistant_openrouter_key', key.trim());
    } else {
      localStorage.removeItem('assistant_openrouter_key');
    }
  };

  const handleResetChat = () => {
    if (!activeWorkflow) return;
    const sysPrompt = activeWorkflow.instructions ||
      `You are an AI assistant specialized in the "${activeWorkflow.name}" workflow. Help the user achieve their goals by invoking your available MCP tools accurately.`;

    setMessages([
      {
        id: 'sys-' + Date.now(),
        role: 'system',
        content: sysPrompt,
      },
    ]);
  };

  const handleCopySlug = () => {
    if (!activeWorkflow) return;
    navigator.clipboard.writeText(`https://mcphub.apptiva.in/mcp/${activeWorkflow.slug}`);
    setCopiedSlug(true);
    setTimeout(() => setCopiedSlug(false), 2000);
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/workflows');
    }
  };

  // Parse Spent App style action pills: <!--actions:[{"label":"...","query":"..."}]-->
  const extractActionPills = (text: string) => {
    const regex = /<!--actions:(.*?)-->/;
    const match = text.match(regex);
    if (!match) return { cleanText: text, actions: [] };

    try {
      const actions = match[1] ? JSON.parse(match[1]) : [];
      const cleanText = text.replace(regex, '').trim();
      return { cleanText, actions: Array.isArray(actions) ? actions : [] };
    } catch {
      return { cleanText: text, actions: [] };
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || loading || !activeWorkflow) return;

    setInput('');
    const userMsgId = 'usr-' + Date.now();
    const newMessages: Message[] = [
      ...messages,
      { id: userMsgId, role: 'user', content: query },
    ];
    setMessages(newMessages);
    setLoading(true);

    try {
      const apiPayloadMessages = newMessages.map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'tool',
            content: m.content,
            tool_call_id: m.tool_call_id,
          };
        }
        if (m.tool_calls && m.tool_calls.length > 0) {
          return {
            role: 'assistant',
            content: m.content || null,
            tool_calls: m.tool_calls,
          };
        }
        return {
          role: m.role,
          content: m.content,
        };
      });

      const response = await api.sendPlaygroundChat({
        messages: apiPayloadMessages,
        model: selectedModel,
        apiKey: apiKey || undefined,
        tools: activeWorkflow.toolAllowlist,
      });

      const choice = response.choices?.[0];
      if (!choice) {
        throw new Error('No completion returned from model');
      }

      const assistantMsg = choice.message;
      const toolCalls = assistantMsg.tool_calls;

      if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
        // AI invoked tool calls! Execute them locally in real time (Spent App agent style)
        const executed: Array<{
          name: string;
          args: Record<string, unknown>;
          result: unknown;
          status: 'success' | 'error';
        }> = [];

        const toolResponses: Message[] = [];

        for (const tc of toolCalls) {
          const fnName = tc.function.name;
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(tc.function.arguments || '{}');
          } catch {
            parsedArgs = {};
          }

          try {
            const toolResult = await api.callPlaygroundTool({
              toolName: fnName,
              args: parsedArgs,
            });

            executed.push({
              name: fnName,
              args: parsedArgs,
              result: toolResult.result || toolResult,
              status: 'success',
            });

            toolResponses.push({
              id: 'tool-' + tc.id,
              role: 'tool',
              tool_call_id: tc.id,
              name: fnName,
              content: JSON.stringify(toolResult.result || toolResult),
            });
          } catch (err) {
            executed.push({
              name: fnName,
              args: parsedArgs,
              result: err instanceof Error ? err.message : String(err),
              status: 'error',
            });

            toolResponses.push({
              id: 'tool-' + tc.id,
              role: 'tool',
              tool_call_id: tc.id,
              name: fnName,
              content: JSON.stringify({ error: String(err) }),
            });
          }
        }

        const updatedChat: Message[] = [
          ...newMessages,
          {
            id: 'ast-' + Date.now(),
            role: 'assistant',
            content: assistantMsg.content || '',
            tool_calls: toolCalls,
            executedTools: executed,
          },
          ...toolResponses,
        ];
        setMessages(updatedChat);

        // Follow-up completion with tool responses
        const followUpPayload = updatedChat.map((m) => {
          if (m.role === 'tool') {
            return {
              role: 'tool',
              content: m.content,
              tool_call_id: m.tool_call_id,
            };
          }
          if (m.tool_calls && m.tool_calls.length > 0) {
            return {
              role: 'assistant',
              content: m.content || null,
              tool_calls: m.tool_calls,
            };
          }
          return {
            role: m.role,
            content: m.content,
          };
        });

        const followUpResponse = await api.sendPlaygroundChat({
          messages: followUpPayload,
          model: selectedModel,
          apiKey: apiKey || undefined,
        });

        const finalChoice = followUpResponse.choices?.[0];
        if (finalChoice?.message?.content) {
          setMessages((prev) => [
            ...prev,
            {
              id: 'ast-final-' + Date.now(),
              role: 'assistant',
              content: finalChoice.message.content,
            },
          ]);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: 'ast-' + Date.now(),
            role: 'assistant',
            content: assistantMsg.content || 'Workflow processed your input.',
          },
        ]);
      }
    } catch (err) {
      console.error('Playground chat error:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          role: 'assistant',
          content: `⚠️ Error in playground: ${err instanceof Error ? err.message : String(err)}. You can verify your OpenRouter key or select another free model in settings.`,
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  const starterPrompts = [
    'What are my high-priority tasks and daily brief?',
    'Plan and decompose the next milestone with dependencies',
    'Log an expense of ₹450 for groceries in Spent App',
    'List all verified constraints and open unknowns',
  ];

  if (loadingWorkflows && !activeWorkflow) {
    return (
      <div className="flex-1 h-screen flex flex-col items-center justify-center p-6 bg-white dark:bg-zinc-950 text-zinc-500">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600 mb-2" />
        <p className="text-sm font-medium">Loading AI Playground...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 h-screen flex flex-col bg-[#f4f4f5] dark:bg-zinc-950 text-zinc-950 dark:text-zinc-100 overflow-hidden">
      {/* Sleek Top Navigation Header */}
      <header className="px-3 sm:px-6 py-3 border-b border-zinc-200/80 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md flex items-center justify-between gap-2 shrink-0 z-30">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Back Navigation Button */}
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-semibold transition-colors cursor-pointer shrink-0"
            title="Back to previous page"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="h-5 w-px bg-zinc-200 dark:border-zinc-800 hidden sm:block" />

          {/* Workflow Selector Dropdown */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-xl bg-purple-600/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {workflows.length > 1 ? (
                  <div className="relative inline-flex items-center">
                    <select
                      value={activeWorkflow?.id || ''}
                      onChange={(e) => handleSelectWorkflow(e.target.value)}
                      className="font-bold text-xs sm:text-sm text-zinc-950 dark:text-zinc-100 bg-transparent pr-6 cursor-pointer focus:outline-none appearance-none truncate max-w-[160px] sm:max-w-[260px]"
                    >
                      {workflows.map((w) => (
                        <option key={w.id} value={w.id} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                          {w.name} {w.isPublic ? '(Public)' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="h-3.5 w-3.5 text-zinc-400 absolute right-0 pointer-events-none" />
                  </div>
                ) : (
                  <h2 className="font-bold text-xs sm:text-sm text-zinc-950 dark:text-zinc-100 truncate max-w-[160px] sm:max-w-[260px]">
                    {activeWorkflow?.name || 'AI Playground'}
                  </h2>
                )}

                <span className="hidden md:inline-flex rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-semibold border border-emerald-200 dark:border-emerald-800">
                  Live
                </span>
              </div>

              <p className="text-[10px] sm:text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                {activeWorkflow?.toolAllowlist.length || 0} active tools • OpenRouter
              </p>
            </div>
          </div>
        </div>

        {/* Top Right Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowContext(!showContext)}
            className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Inspect Workflow System Prompt & Tools"
          >
            <Wrench className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Context</span>
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Model & Key Settings"
          >
            <Sliders className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Model</span>
          </button>

          <button
            onClick={handleResetChat}
            className="inline-flex items-center justify-center h-8 w-8 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Reset conversation"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Collapsible Context Drawer */}
      {showContext && activeWorkflow && (
        <div className="px-4 py-3 bg-white/95 dark:bg-zinc-900/95 border-b border-zinc-200 dark:border-zinc-800 text-xs space-y-2 shrink-0 animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">Workflow Prompt &amp; Instructions:</span>
            <button
              onClick={handleCopySlug}
              className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 font-mono"
            >
              {copiedSlug ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              <span>Copy Slug URL</span>
            </button>
          </div>
          <p className="text-zinc-600 dark:text-zinc-300 font-mono text-[11px] bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 max-h-24 overflow-y-auto leading-relaxed">
            {activeWorkflow.instructions || 'No custom instructions defined. Using general assistant persona.'}
          </p>
          <div>
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              Allowed Tools ({activeWorkflow.toolAllowlist.length}):
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {activeWorkflow.toolAllowlist.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800 font-mono text-[10px] text-zinc-700 dark:text-zinc-300"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Settings Drawer */}
      {showSettings && (
        <div className="px-4 py-3 bg-white/95 dark:bg-zinc-900/95 border-b border-zinc-200 dark:border-zinc-800 text-xs space-y-3 shrink-0 animate-in slide-in-from-top-2 duration-150">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                AI Model (OpenRouter Free Tier)
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-950"
              >
                {FREE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Custom OpenRouter API Key (Optional)
              </label>
              <input
                type="password"
                placeholder="sk-or-v1-... (defaults to free system key)"
                value={apiKey}
                onChange={(e) => handleSaveApiKey(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-950"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Full-Height Chat Scrollable Container */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-4xl w-full mx-auto">
        {messages.filter((m) => m.role !== 'system' && m.role !== 'tool').length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 my-auto">
            <div className="h-14 w-14 rounded-3xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white flex items-center justify-center shadow-xl shadow-purple-500/20">
              <Sparkles className="h-7 w-7" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {activeWorkflow?.name || 'AI Assistant'}
              </h3>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                One-click test playground powered by OpenRouter. The agent is grounded by {activeWorkflow?.toolAllowlist.length || 0} active MCP tools.
              </p>
            </div>

            {/* Starter prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg pt-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSendMessage(prompt)}
                  className="text-left p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-purple-500/50 hover:shadow-xs transition-all text-xs text-zinc-700 dark:text-zinc-300 font-medium cursor-pointer"
                >
                  💬 {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages
          .filter((m) => m.role !== 'system' && m.role !== 'tool')
          .map((msg) => {
            const isUser = msg.role === 'user';
            const { cleanText, actions } = extractActionPills(msg.content);

            return (
              <div
                key={msg.id}
                className={`flex items-start gap-2.5 sm:gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-semibold ${
                    isUser
                      ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-xs'
                      : 'bg-purple-600 text-white shadow-xs'
                  }`}
                >
                  {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>

                <div className={`space-y-2 max-w-[88%] sm:max-w-[78%] min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
                  {/* Message bubble */}
                  <div
                    className={`p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words ${
                      isUser
                        ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 rounded-tr-xs font-medium shadow-xs'
                        : 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-tl-xs border border-zinc-200/80 dark:border-zinc-800 shadow-2xs'
                    }`}
                  >
                    {cleanText}
                  </div>

                  {/* Tool execution previews (Spent App agent style) */}
                  {msg.executedTools && msg.executedTools.length > 0 && (
                    <div className="space-y-1.5 w-full">
                      {msg.executedTools.map((et, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs space-y-1.5 shadow-2xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <Wrench className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                              <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                                {et.name}
                              </span>
                            </div>
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Executed</span>
                            </span>
                          </div>
                          <pre className="text-[10px] font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950 p-2 rounded-xl overflow-x-auto max-h-36">
                            {JSON.stringify(et.result, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Interactive Action Pills (Spent App style) */}
                  {actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {actions.map((act: { label: string; query: string }, aIdx: number) => (
                        <button
                          key={aIdx}
                          onClick={() => handleSendMessage(act.query)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-purple-200 dark:border-purple-800/60 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 transition-colors text-xs font-semibold cursor-pointer"
                        >
                          <span>{act.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 animate-pulse pl-1">
            <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
            <span>AI is reasoning &amp; invoking tools...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Sticky Bottom Input Bar */}
      <div className="p-3 sm:p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-4xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-end gap-2"
          >
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={
                activeWorkflow
                  ? `Message ${activeWorkflow.name}...`
                  : 'Type a message to test workflow...'
              }
              rows={1}
              className="min-h-[46px] max-h-36 resize-none rounded-2xl py-3 px-3.5 text-xs sm:text-sm bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 focus:ring-1 focus:ring-zinc-950 shadow-2xs"
            />
            <Button
              type="submit"
              disabled={!input.trim() || loading}
              className="h-11 w-11 rounded-2xl bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 shrink-0 p-0 hover:opacity-90 transition-opacity"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
          <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-2 px-1">
            <span>Enter to send • Shift+Enter for new line</span>
            <span>Model: {FREE_MODELS.find((m) => m.id === selectedModel)?.name}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
