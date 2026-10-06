import { MarkdownRenderer } from "./MarkdownRenderer.js";
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  api,
  type Workflow,
  type UserProfile,
  type McpTool,
  DEFAULT_SPENT_TOOLS,
  TOOL_ROLE_GROUPS,
  categorizeTool,
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
  Info,
  X,
  Copy,
  Check,
  Sliders,
  ArrowLeft,
  ChevronDown,
  Search,
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

const MAX_CONVERSATION_HISTORY = 24; // Rolling window: system prompt + last 23 messages
const DEFAULT_GLOBAL_SYSTEM_PROMPT =
  'You are mcphub-ai, an intelligent process and personal assistant. You have full access to tools across task management, calendar scheduling, Spent App personal finance, constraints, and project planning. Help the user achieve their goals by invoking appropriate MCP tools accurately.';

const getSessionStorageKey = (workflowId?: string | null) => {
  return workflowId ? `assistant_chat_history_${workflowId}` : 'assistant_chat_history_global';
};

const pruneChatHistory = (msgs: Message[], maxItems: number = MAX_CONVERSATION_HISTORY): Message[] => {
  if (msgs.length <= maxItems) return msgs;
  const sysMsg = msgs.find((m) => m.role === 'system') || msgs[0];
  const nonSys = msgs.filter((m) => m.role !== 'system');
  const recentNonSys = nonSys.slice(-(maxItems - 1));
  return sysMsg ? [sysMsg, ...recentNonSys] : recentNonSys;
};

const loadSavedSession = (wfId?: string | null, fallbackSysPrompt?: string): Message[] => {
  const key = getSessionStorageKey(wfId);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return pruneChatHistory(parsed, MAX_CONVERSATION_HISTORY);
      }
    }
  } catch (err) {
    console.error('Failed to parse saved chat session:', err);
  }
  return [
    {
      id: 'sys-1',
      role: 'system',
      content: fallbackSysPrompt || DEFAULT_GLOBAL_SYSTEM_PROMPT,
    },
  ];
};

const toApiPayload = (msgs: Message[], maxContext: number = 16) => {
  const pruned = pruneChatHistory(msgs, maxContext);
  return pruned.map((m) => {
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
};

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
  const [keyInput, setKeyInput] = useState<string>(() => localStorage.getItem('assistant_openrouter_key') || '');
  const [keySavedFeedback, setKeySavedFeedback] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Tool Scope Catalog state
  const [allTools, setAllTools] = useState<McpTool[]>([]);
  const [enabledToolNames, setEnabledToolNames] = useState<string[]>([]);
  const [showToolCatalog, setShowToolCatalog] = useState(false);
  const [toolSearch, setToolSearch] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('All');
  const [savingWorkflowTools, setSavingWorkflowTools] = useState(false);
  const [toolSaveSuccess, setToolSaveSuccess] = useState(false);

  // Load all available tools (including Spent App tools)
  useEffect(() => {
    async function loadAllTools() {
      try {
        const catRes = await api.getToolCatalog().catch(() => ({ tools: [] }));
        let tools = catRes.tools || [];
        const hasSpent = tools.some(
          (t) => t.name.startsWith('spent_') || (t.serverName && t.serverName.toLowerCase().includes('spent'))
        );
        if (!hasSpent) {
          tools = [...tools, ...DEFAULT_SPENT_TOOLS];
        }
        setAllTools(tools);
        // If direct visit without workflow selection in URL, enable all tools by default!
        if (!workflowIdParam) {
          setEnabledToolNames(tools.map((t) => t.name));
        }
      } catch (err) {
        console.error('Failed to load tool catalog:', err);
        setAllTools(DEFAULT_SPENT_TOOLS);
        if (!workflowIdParam) {
          setEnabledToolNames(DEFAULT_SPENT_TOOLS.map((t) => t.name));
        }
      }
    }
    loadAllTools();
  }, [workflowIdParam]);

  // When active workflow changes, initialize enabled tools to its associated tools
  useEffect(() => {
    if (activeWorkflow) {
      setEnabledToolNames(activeWorkflow.toolAllowlist || []);
    }
  }, [activeWorkflow]);

  const toggleTool = (toolName: string) => {
    setEnabledToolNames((prev) =>
      prev.includes(toolName) ? prev.filter((t) => t !== toolName) : [...prev, toolName]
    );
  };

  const enableAllTools = () => {
    setEnabledToolNames(allTools.map((t) => t.name));
  };

  const disableAllTools = () => {
    setEnabledToolNames([]);
  };

  const resetToWorkflowDefaults = () => {
    if (activeWorkflow) {
      setEnabledToolNames(activeWorkflow.toolAllowlist || []);
    } else {
      setEnabledToolNames(allTools.map((t) => t.name));
    }
  };

  const handleSaveToWorkflow = async () => {
    if (!activeWorkflow || !currentUser) return;
    setSavingWorkflowTools(true);
    try {
      await api.updateWorkflow(activeWorkflow.id, {
        toolAllowlist: enabledToolNames,
      });
      setToolSaveSuccess(true);
      setActiveWorkflow({
        ...activeWorkflow,
        toolAllowlist: enabledToolNames,
      });
      setTimeout(() => setToolSaveSuccess(false), 2500);
    } catch (err) {
      console.error('Failed to save tools to workflow:', err);
    } finally {
      setSavingWorkflowTools(false);
    }
  };

  const filteredTools = allTools.filter((t) => {
    const role = categorizeTool(t.name, t.isExternal, t.serverName);
    const matchesFilter = selectedRoleFilter === 'All' || role === selectedRoleFilter;
    if (!matchesFilter) return false;

    if (!toolSearch.trim()) return true;
    const q = toolSearch.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      role.toLowerCase().includes(q) ||
      (t.serverName || '').toLowerCase().includes(q)
    );
  });
  const [expandedToolIds, setExpandedToolIds] = useState<Record<string, boolean>>({});
  const [copiedToolId, setCopiedToolId] = useState<string | null>(null);

  const toggleToolResponse = (id: string) => {
    setExpandedToolIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleCopyToolResult = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToolId(id);
    setTimeout(() => setCopiedToolId(null), 2000);
  };
  const [showContext, setShowContext] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement>(null);
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
            setEnabledToolNames(matched.toolAllowlist || []);
          } else {
            setActiveWorkflow(null);
          }
        } else {
          // Direct visit without selecting workflow: NO workflow selected mode!
          setActiveWorkflow(null);
        }
      } catch (err) {
        console.error('Failed to load workflows for playground:', err);
      } finally {
        setLoadingWorkflows(false);
      }
    }
    loadAll();
  }, [currentUser, workflowIdParam]);

  // When active workflow changes, restore session from localStorage or initialize with prompt
  useEffect(() => {
    const wfId = activeWorkflow?.id || null;
    const defaultPrompt = activeWorkflow
      ? activeWorkflow.instructions ||
        `You are an AI assistant specialized in the "${activeWorkflow.name}" workflow. Help the user achieve their goals by invoking your available MCP tools accurately.`
      : DEFAULT_GLOBAL_SYSTEM_PROMPT;

    const restored = loadSavedSession(wfId, defaultPrompt);
    setMessages(restored);

    if (activeWorkflow) {
      setEnabledToolNames(activeWorkflow.toolAllowlist || []);
    }
  }, [activeWorkflow]);

  // Persist conversation to localStorage with rolling window pruning (eliminates oldest messages)
  useEffect(() => {
    const hasUserMessages = messages.some((m) => m.role === 'user');
    if (!hasUserMessages) return;

    const wfId = activeWorkflow?.id || null;
    const key = getSessionStorageKey(wfId);

    try {
      const pruned = pruneChatHistory(messages, MAX_CONVERSATION_HISTORY);
      localStorage.setItem(key, JSON.stringify(pruned));
    } catch (err) {
      console.warn('LocalStorage save error or quota exceeded:', err);
    }
  }, [messages, activeWorkflow]);

  // Auto-scroll chat container only (prevents full-page window scrolling)
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, loading]);

  const handleSelectWorkflow = (wfId: string) => {
    if (!wfId || wfId === 'none') {
      setActiveWorkflow(null);
      setSearchParams({});
      setEnabledToolNames(allTools.map((t) => t.name));
      return;
    }
    const selected = workflows.find((w) => w.id === wfId);
    if (selected) {
      setActiveWorkflow(selected);
      setSearchParams({ workflowId: selected.id });
      setEnabledToolNames(selected.toolAllowlist || []);
    }
  };

  const handleSaveApiKey = () => {
    const trimmed = keyInput.trim();
    if (trimmed) {
      localStorage.setItem('assistant_openrouter_key', trimmed);
      setApiKey(trimmed);
      setKeySavedFeedback(true);
      setTimeout(() => {
        setKeySavedFeedback(false);
        setShowSettings(false);
      }, 1000);
    } else {
      localStorage.removeItem('assistant_openrouter_key');
      setApiKey('');
      setKeySavedFeedback(false);
    }
  };

  const handleClearApiKey = () => {
    setKeyInput('');
    setApiKey('');
    setKeySavedFeedback(false);
    localStorage.removeItem('assistant_openrouter_key');
  };

  const handleResetChat = () => {
    const wfId = activeWorkflow?.id || null;
    const key = getSessionStorageKey(wfId);
    localStorage.removeItem(key);

    const sysPrompt = activeWorkflow
      ? activeWorkflow.instructions ||
        `You are an AI assistant specialized in the "${activeWorkflow.name}" workflow. Help the user achieve their goals by invoking your available MCP tools accurately.`
      : DEFAULT_GLOBAL_SYSTEM_PROMPT;

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
    let clean = text || "";
    clean = clean.replace(/<dots_function_call>[\s\S]*?<\/dots_function_call>/gi, "");
    clean = clean.replace(/<function_call>[\s\S]*?<\/function_call>/gi, "");
    clean = clean.replace(/<invoke[\s\S]*?<\/invoke>/gi, "");

    const regex = /<!--actions:(.*?)-->/;
    const match = clean.match(regex);
    if (!match) return { cleanText: clean.trim(), actions: [] };

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
    if (!query || loading) return;

    const effectiveKey = (apiKey || keyInput || localStorage.getItem('assistant_openrouter_key') || '').trim();
    if (effectiveKey && !apiKey) {
      setApiKey(effectiveKey);
      localStorage.setItem('assistant_openrouter_key', effectiveKey);
    }

    setInput('');
    const userMsgId = 'usr-' + Date.now();
    const newMessages: Message[] = [
      ...messages,
      { id: userMsgId, role: 'user', content: query },
    ];
    setMessages(newMessages);
    setLoading(true);

    try {
      const response = await api.sendPlaygroundChat({
        messages: toApiPayload(newMessages, 16),
        model: selectedModel,
        apiKey: effectiveKey || undefined,
        tools: enabledToolNames,
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

        // Follow-up completion with tool responses (compacted for LLM context window)
        const followUpResponse = await api.sendPlaygroundChat({
          messages: toApiPayload(updatedChat, 16),
          model: selectedModel,
          apiKey: effectiveKey || undefined,
          tools: enabledToolNames,
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
            content: assistantMsg.content || 'AI processed your input.',
          },
        ]);
      }
    } catch (err) {
      console.error('Playground chat error:', err);
      const rawError = err instanceof Error ? err.message : String(err);
      let formattedMsg = rawError;

      if (rawError.includes('404')) {
        formattedMsg = '⚠️ The server endpoint (/api/playground/chat) is not active on this host yet. Click Model Settings (⚙️) above, paste your Custom OpenRouter API Key and click Done to chat directly!';
      } else if (rawError.includes('429') || rawError.toLowerCase().includes('rate limit')) {
        formattedMsg = '⚠️ OpenRouter Free Tier Daily Rate Limit Exceeded (50 requests/day limit reached). You can enter your custom OpenRouter API Key in Settings and click Done to continue immediately.';
      } else if (rawError.includes('OpenRouter error:')) {
        try {
          const jsonPart = rawError.replace(/^OpenRouter error:\s*/, '');
          const parsed = JSON.parse(jsonPart);
          if (parsed.error?.message) {
            formattedMsg = `⚠️ OpenRouter Error: ${parsed.error.message}`;
          }
        } catch {}
      }

      setMessages((prev) => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          role: 'assistant',
          content: formattedMsg,
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

  if (loadingWorkflows && !activeWorkflow && workflowIdParam) {
    return (
      <div className="flex-1 h-screen flex flex-col items-center justify-center p-6 bg-white dark:bg-zinc-950 text-zinc-500">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600 mb-2" />
        <p className="text-sm font-medium">Loading AI Playground...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 h-[100dvh] w-full flex flex-col bg-[#f4f4f5] dark:bg-zinc-950 text-zinc-950 dark:text-zinc-100 overflow-hidden z-20">
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
                <div className="relative inline-flex items-center">
                  <select
                    value={activeWorkflow?.id || 'none'}
                    onChange={(e) => handleSelectWorkflow(e.target.value)}
                    className="font-bold text-xs sm:text-sm text-zinc-950 dark:text-zinc-100 bg-transparent pr-6 cursor-pointer focus:outline-none appearance-none truncate max-w-[170px] sm:max-w-[270px]"
                  >
                    <option value="none" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-semibold">
                      ⚡ No Workflow (All Tools)
                    </option>
                    {workflows.map((w) => (
                      <option key={w.id} value={w.id} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                        {w.name} {w.isPublic ? '(Public)' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="h-3.5 w-3.5 text-zinc-400 absolute right-0 pointer-events-none" />
                </div>

                <span className={`hidden md:inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                  activeWorkflow
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                    : 'bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800'
                }`}>
                  {activeWorkflow ? 'Workflow Mode' : 'All Tools Mode'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-none">
                <button
                  type="button"
                  onClick={() => setShowToolCatalog(true)}
                  className="text-purple-600 dark:text-purple-400 font-semibold hover:underline cursor-pointer shrink-0"
                >
                  {enabledToolNames.length} tools
                </button>
                {enabledToolNames.length !== (activeWorkflow?.toolAllowlist.length || 0) && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-mono font-semibold shrink-0">
                    custom
                  </span>
                )}
                <span className="hidden sm:inline text-zinc-300 dark:text-zinc-700">•</span>
                <span className="hidden sm:inline text-zinc-400">OpenRouter</span>
              </div>
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
            className="relative inline-flex items-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Model & Key Settings"
          >
            <Sliders className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Model</span>
            {apiKey && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900" title="Custom API Key Active" />
            )}
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
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                  Custom OpenRouter API Key (Optional)
                </label>
                {apiKey ? (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <Check className="h-3 w-3" /> Custom Key Active
                  </span>
                ) : (
                  <span className="text-[10px] text-zinc-400 font-normal">
                    Using system key
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="password"
                  placeholder="sk-or-v1-... (defaults to free system key)"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveApiKey();
                    }
                  }}
                  className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-950 font-mono"
                />
                <button
                  type="button"
                  onClick={handleSaveApiKey}
                  className={`px-3 py-2 rounded-xl font-semibold text-xs transition-all flex items-center gap-1 shrink-0 shadow-xs cursor-pointer ${
                    keySavedFeedback
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white'
                  }`}
                  title="Save token and use for user requests"
                >
                  <Check className="h-3.5 w-3.5" />
                  {keySavedFeedback ? 'Saved!' : 'Done'}
                </button>
                {keyInput && (
                  <button
                    type="button"
                    onClick={handleClearApiKey}
                    title="Remove custom key"
                    className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Full-Height Chat Scrollable Container */}
      <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-4xl w-full mx-auto overscroll-contain">
        {messages.filter((m) => m.role !== 'system' && m.role !== 'tool').length > 0 && (
          <div className="flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500 px-1 py-1 border-b border-zinc-100 dark:border-zinc-800/60 mb-2">
            <span>
              {messages.filter((m) => m.role === 'user').length} message{messages.filter((m) => m.role === 'user').length > 1 ? 's' : ''} in session
            </span>
            {messages.length >= MAX_CONVERSATION_HISTORY && (
              <span className="text-[10px] text-zinc-400">
                (Older turns trimmed to optimize memory & tokens)
              </span>
            )}
          </div>
        )}

        {messages.filter((m) => m.role !== 'system' && m.role !== 'tool').length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 my-auto">
            <div className="h-14 w-14 rounded-3xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white flex items-center justify-center shadow-xl shadow-purple-500/20">
              <Sparkles className="h-7 w-7" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {activeWorkflow ? activeWorkflow.name : 'General AI Assistant'}
              </h3>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {activeWorkflow
                  ? `One-click test playground powered by OpenRouter. The agent is grounded by ${enabledToolNames.length} active tools.`
                  : `No workflow selected — all ${enabledToolNames.length} MCP tools are enabled by default across tasks, calendar, Spent App, and planning.`}
              </p>
            </div>

            {/* Starter prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg pt-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSendMessage(prompt)}
                  className="flex items-start gap-2.5 text-left p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-purple-500/50 hover:shadow-xs transition-all text-xs text-zinc-700 dark:text-zinc-300 font-medium cursor-pointer"
                >
                  <span className="text-sm shrink-0">💬</span>
                  <span className="leading-snug">{prompt}</span>
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
                  {cleanText ? (
                    isUser ? (
                      <div className="p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 rounded-tr-xs font-medium shadow-xs">
                        {cleanText}
                      </div>
                    ) : (
                      msg.role === 'assistant' && msg.id.startsWith('err-') ? (
                        <div className="p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed rounded-tl-xs border border-amber-300 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 shadow-2xs space-y-2.5 overflow-hidden">
                          <MarkdownRenderer content={cleanText} />
                          {(cleanText.includes('Rate Limit') || cleanText.includes('OpenRouter')) && (
                            <div className="pt-1">
                              <button
                                type="button"
                                onClick={() => setShowSettings(true)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 text-white hover:bg-amber-700 text-xs font-semibold shadow-xs cursor-pointer transition-colors"
                              >
                                <Sliders className="h-3.5 w-3.5" />
                                Open Settings & Add Custom Key
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed rounded-tl-xs border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs overflow-hidden">
                          <MarkdownRenderer content={cleanText} />
                        </div>
                      )
                    )
                  ) : null}

                  {/* Tool execution previews (Spent App agent style) */}
                  {msg.executedTools && msg.executedTools.length > 0 && (
                    <div className="space-y-2 w-full">
                      {msg.executedTools.map((et, idx) => {
                        const toolKey = `${msg.id}-${idx}`;
                        const isExpanded = !!expandedToolIds[toolKey];
                        const resultString =
                          typeof et.result === 'string'
                            ? et.result
                            : JSON.stringify(et.result, null, 2);

                        return (
                          <div
                            key={idx}
                            className="p-2.5 sm:p-3 rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs shadow-2xs transition-all"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Wrench className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                                <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100 truncate">
                                  {et.name}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleToolResponse(toolKey)}
                                  className={`inline-flex items-center justify-center h-5 w-5 rounded-md transition-colors cursor-pointer shrink-0 ${
                                    isExpanded
                                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 ring-1 ring-purple-300 dark:ring-purple-700'
                                      : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                  }`}
                                  title={isExpanded ? 'Hide response details' : 'Show response raw data'}
                                  aria-label={`Toggle info for ${et.name}`}
                                >
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {et.status === 'success' ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800/60">
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>Executed</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full border border-rose-200/60 dark:border-rose-800/60">
                                    <X className="h-3 w-3" />
                                    <span>Failed</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Raw data response only shown when clicked on i info button */}
                            {isExpanded && (
                              <div className="pt-2 mt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2 animate-in fade-in duration-150">
                                {et.args && Object.keys(et.args).length > 0 && (
                                  <div className="space-y-1">
                                    <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-semibold">
                                      Parameters
                                    </span>
                                    <pre className="text-[10px] font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950 p-2 rounded-lg overflow-x-auto border border-zinc-100 dark:border-zinc-800/60">
                                      {JSON.stringify(et.args, null, 2)}
                                    </pre>
                                  </div>
                                )}

                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-semibold">
                                      Raw Response Data
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyToolResult(toolKey, resultString)}
                                      className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 cursor-pointer transition-colors"
                                    >
                                      {copiedToolId === toolKey ? (
                                        <>
                                          <Check className="h-3 w-3 text-emerald-500" />
                                          <span className="text-emerald-500">Copied</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="h-3 w-3" />
                                          <span>Copy</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                  <pre className="text-[10px] font-mono text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl overflow-x-auto max-h-48 border border-zinc-200/60 dark:border-zinc-800/60 leading-relaxed shadow-inner">
                                    {resultString}
                                  </pre>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
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

        {/* End of messages marker */}
      </div>

      {/* Sticky Bottom Input Bar */}
      <div className="p-3 sm:p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shrink-0 z-30 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-4xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-end gap-2"
          >
            {/* Tool Scope Catalog toggle button inside input */}
            <button
              type="button"
              onClick={() => setShowToolCatalog(true)}
              className={`h-11 px-3 rounded-2xl border transition-all text-xs font-semibold cursor-pointer shrink-0 flex items-center gap-1.5 ${
                enabledToolNames.length > 0
                  ? "border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60"
                  : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
              title="Open Tool Scope Catalog (Enable/Disable tools to test)"
              aria-label="Manage tools catalog"
            >
              <Wrench className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span className="hidden sm:inline font-mono text-[11px] font-bold">
                {enabledToolNames.length}
              </span>
            </button>
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
                  : 'Message AI Assistant (All tools enabled)...'
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
          <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 mt-2 px-1 min-w-0">
            {/* Left: Active tools indicator & scope pill */}
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                type="button"
                onClick={() => setShowToolCatalog(true)}
                className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 font-semibold hover:underline cursor-pointer truncate"
              >
                <Wrench className="h-3 w-3 shrink-0" />
                <span>{enabledToolNames.length} of {allTools.length} tools</span>
              </button>
              {enabledToolNames.length !== (activeWorkflow?.toolAllowlist.length || 0) && (
                <span className="px-1.5 py-0.2 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-mono text-[9px] font-semibold shrink-0">
                  custom
                </span>
              )}
              <span className="hidden sm:inline text-zinc-300 dark:text-zinc-700">•</span>
              <span className="hidden sm:inline text-zinc-400 text-[10px]">
                Enter to send, Shift+Enter for new line
              </span>
            </div>

            {/* Right: Model badge */}
            <div className="shrink-0 flex items-center gap-1 text-[10px] text-zinc-400">
              <span className="hidden sm:inline">Model:</span>
              <span className="font-medium text-zinc-600 dark:text-zinc-300">
                {FREE_MODELS.find((m) => m.id === selectedModel)?.name.replace(' (Default)', '') || 'mcphub-ai'}
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* Tool Scope Catalog Sheet / Modal */}
      {showToolCatalog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Catalog Header */}
            <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-2xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <Wrench className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <span>Test Scope: Tool Catalog</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                      {enabledToolNames.length} / {allTools.length} enabled
                    </span>
                  </h3>
                  <p className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400">
                    Workflow tools are enabled initially. Temporarily toggle any tool to test expanded scopes.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowToolCatalog(false)}
                className="h-8 w-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick Action Toolbar */}
            <div className="px-4 py-2.5 bg-zinc-50/70 dark:bg-zinc-950/40 border-b border-zinc-200/80 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={enableAllTools}
                  className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium cursor-pointer"
                >
                  Enable All
                </button>
                <button
                  type="button"
                  onClick={resetToWorkflowDefaults}
                  className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium cursor-pointer"
                >
                  Workflow Defaults ({activeWorkflow?.toolAllowlist.length || 0})
                </button>
                <button
                  type="button"
                  onClick={disableAllTools}
                  className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium cursor-pointer"
                >
                  Clear All
                </button>
              </div>

              {currentUser && (
                <button
                  type="button"
                  onClick={handleSaveToWorkflow}
                  disabled={savingWorkflowTools}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold cursor-pointer disabled:opacity-50 transition-colors text-[11px]"
                >
                  {savingWorkflowTools ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : toolSaveSuccess ? (
                    <>
                      <Check className="h-3 w-3" />
                      <span>Saved!</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3 w-3" />
                      <span>Save to Workflow</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Search & Category Filter Section */}
            <div className="p-3 sm:p-4 border-b border-zinc-200 dark:border-zinc-800 space-y-2.5 shrink-0 bg-white dark:bg-zinc-900">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  value={toolSearch}
                  onChange={(e) => setToolSearch(e.target.value)}
                  placeholder="Search tools by name, description, or keyword (e.g. spent, tasks, calendar)..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                {toolSearch && (
                  <button
                    type="button"
                    onClick={() => setToolSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] scrollbar-none">
                {["All", ...TOOL_ROLE_GROUPS].map((role) => {
                  const isSelected = selectedRoleFilter === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setSelectedRoleFilter(role)}
                      className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors font-medium cursor-pointer ${
                        isSelected
                          ? "bg-purple-600 text-white shadow-xs"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {role}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scrollable Tool List */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-2">
              {filteredTools.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-400">
                  No tools match &ldquo;{toolSearch}&rdquo; in {selectedRoleFilter}
                </div>
              ) : (
                filteredTools.map((tool) => {
                  const isEnabled = enabledToolNames.includes(tool.name);
                  const isDefault = activeWorkflow?.toolAllowlist.includes(tool.name);
                  const role = categorizeTool(tool.name, tool.isExternal, tool.serverName);
                  const isSpent = tool.name.startsWith("spent_") || role === "Spent App & Finance";

                  return (
                    <div
                      key={tool.name}
                      onClick={() => toggleTool(tool.name)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                        isEnabled
                          ? "border-purple-300 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20"
                          : "border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 opacity-75 hover:opacity-100 hover:border-zinc-300 dark:hover:border-zinc-700"
                      }`}
                    >
                      {/* Toggle checkbox */}
                      <div className="pt-0.5 shrink-0">
                        <div
                          className={`h-4 w-4 rounded-md flex items-center justify-center transition-colors ${
                            isEnabled
                              ? "bg-purple-600 text-white"
                              : "border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
                          }`}
                        >
                          {isEnabled && <Check className="h-3 w-3 stroke-[3]" />}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono font-bold text-xs text-zinc-900 dark:text-zinc-100">
                            {tool.name}
                          </span>

                          {isSpent && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              Spent App
                            </span>
                          )}

                          <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                            {role}
                          </span>

                          {isDefault && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                              Workflow Default
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                          {tool.description}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Catalog Footer */}
            <div className="p-3 sm:p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/90 dark:bg-zinc-950/90 flex items-center justify-between gap-3 shrink-0 text-xs">
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Toggled tools apply live in this test chat.
              </span>
              <Button
                type="button"
                onClick={() => setShowToolCatalog(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 hover:opacity-90"
              >
                Done ({enabledToolNames.length} Active)
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
