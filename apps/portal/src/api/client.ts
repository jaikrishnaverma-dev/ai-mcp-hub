/**
 * Portal API client.
 * All requests attach x-user-id when a user is logged in.
 * Public endpoints (mcp-catalog) work without auth.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  timezone: string;
  createdAt?: string;
}

export interface ExternalMcpTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface ExternalMcpIntegration {
  id: string;
  name: string;
  url: string;
  status: 'active' | 'error' | 'disabled';
  tools: ExternalMcpTool[];
  toolCount: number;
  createdAt: string;
}

export interface McpTool {
  name: string;
  description: string;
  requiredScope: 'read' | 'write';
  inputSchema: Record<string, unknown>;
  category?: string;
  isExternal?: boolean;
  source?: 'native' | 'external';
  serverName?: string;
}

export type McpToolCatalogItem = McpTool;

export interface Skill {
  id: string;
  name: string;
  description: string;
  tools: string[];
  systemPrompt: string;
  category: string;
  author: string;
  likes: number;
  commentsCount: number;
}

export interface Comment {
  id: string;
  targetId: string; // tool name or skill id
  userName: string;
  userEmail: string;
  content: string;
  createdAt: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string | null;
  toolAllowlist: string[];
  instructions?: string | null;
  slug: string;
  status: 'active' | 'revoked';
  scopes: string[];
  ownerId: string;
  createdAt: string;
}

export type EndpointItem = Workflow;

export interface TaskItem {
  id: string;
  type: 'goal' | 'story' | 'task' | 'subtask';
  title: string;
  status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
  priority: 'critical' | 'high' | 'medium' | 'low' | 'none';
  dueAt: string | null;
  parentId: string | null;
  parentTitle: string | null;
  description?: string | null;
  createdAt: string;
}

export interface BlockerItem {
  id: string;
  itemId: string;
  reason: string;
  waitingOnUserId: string | null;
  createdAt: string;
}

export interface DecisionItem {
  id: string;
  itemId: string;
  summary: string;
  rationale: string;
  decidedBy: string;
  createdAt: string;
}

export interface DailyBriefResponse {
  date: string;
  timezone: string;
  suggestedFocus: TaskItem[];
  dueTasks: Array<Pick<TaskItem, 'id' | 'title' | 'status' | 'priority' | 'dueAt'>>;
  overdueTasks: Array<Pick<TaskItem, 'id' | 'title' | 'status' | 'priority' | 'dueAt'>>;
  blockedTasks: Array<Pick<TaskItem, 'id' | 'title' | 'status' | 'priority'> & { blockerReason?: string | null }>;
  summary: string;
}

export interface ActivityItem {
  id: string;
  itemId: string;
  actorId: string;
  actorType: 'user' | 'ai' | 'system';
  action: string;
  changes?: Array<{ field: string; from: unknown; to: unknown }>;
  reason: string | null;
  createdAt: string;
}

export interface ItemDetailResponse {
  item: TaskItem & {
    estimateMin?: number | null;
    tz?: string;
    updatedAt?: string;
    startAt?: string | null;
    endAt?: string | null;
    deletedAt?: string | null;
  };
  decisions: Array<{ id: string; summary: string; rationale: string; createdAt: string }>;
  blockers: Array<{ id: string; reason: string; resolvedAt: string | null; createdAt: string }>;
  links: Array<{ id: string; kind: string; targetId: string; targetTitle: string; direction: string }>;
  history: Array<{ id: string; action: string; actorType: string; changes: unknown[]; reason: string | null; createdAt: string }>;
}

// ─── Auth state ───────────────────────────────────────────────────────────────

const AUTH_KEY = 'assistant_user_id';
const AUTH_NAME_KEY = 'assistant_user_name';
const AUTH_EMAIL_KEY = 'assistant_user_email';

function loadStoredId(): string {
  const id = localStorage.getItem(AUTH_KEY) || '';
  if (id && id.length === 24) return id;
  localStorage.removeItem(AUTH_KEY);
  return '';
}

let _userId = loadStoredId();
let _userName = localStorage.getItem(AUTH_NAME_KEY) || '';
let _userEmail = localStorage.getItem(AUTH_EMAIL_KEY) || '';

export function getActiveUser(): UserProfile | null {
  if (!_userId) return null;
  return { id: _userId, name: _userName || 'User', email: _userEmail || '', timezone: 'Asia/Kolkata' };
}

export function setActiveUser(user: UserProfile | null) {
  if (user) {
    _userId = user.id;
    _userName = user.name;
    _userEmail = user.email;
    localStorage.setItem(AUTH_KEY, user.id);
    localStorage.setItem(AUTH_NAME_KEY, user.name);
    localStorage.setItem(AUTH_EMAIL_KEY, user.email);
  } else {
    _userId = '';
    _userName = '';
    _userEmail = '';
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_NAME_KEY);
    localStorage.removeItem(AUTH_EMAIL_KEY);
  }
}

export function getActiveUserId(): string {
  return _userId;
}

export function isLoggedIn(): boolean {
  return Boolean(_userId);
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(_userId ? { 'x-user-id': _userId } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const message = (body['message'] as string | undefined) || `HTTP ${res.status}`;
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// ─── Category helper ──────────────────────────────────────────────────────────

const TOOL_CATEGORIES: Record<string, string> = {
  get_daily_brief: 'Planning & Briefing',
  create_task: 'Task Management',
  update_task: 'Task Management',
  complete_task: 'Task Management',
  list_tasks: 'Task Management',
  get_task: 'Task Management',
  log_decision: 'Architecture & Decisions',
  link_tasks: 'Dependencies & Graphs',
  set_blocker: 'Blocker Tracking',
};

export function categorizeTool(name: string): string {
  return TOOL_CATEGORIES[name] || 'General Utilities';
}

// ─── Initial Curated Skills ───────────────────────────────────────────────────

export const DEFAULT_SKILLS: Skill[] = [
  {
    id: 'skill-daily-standup',
    name: 'Daily Standup & Focus Brief',
    description: 'Inspects your agenda, overdue items, blockers, and calculates the single highest leverage task to begin your day.',
    tools: ['get_daily_brief', 'list_tasks', 'get_task'],
    systemPrompt: 'You are the morning chief of staff. Call get_daily_brief immediately, identify the most urgent priority, and concisely present 3 key objectives for today.',
    category: 'Productivity',
    author: 'Official Assistant',
    likes: 24,
    commentsCount: 3,
  },
  {
    id: 'skill-issue-decomposer',
    name: 'Smart Task Breakdown & Hierarchy',
    description: 'Takes high-level goals and breaks them down into hierarchical stories, tasks, and subtasks with accurate estimates.',
    tools: ['create_task', 'update_task', 'list_tasks', 'link_tasks'],
    systemPrompt: 'Break down complex requests into concrete, measurable tasks. Set dependencies with link_tasks and maintain clean parent-child hierarchy.',
    category: 'Project Management',
    author: 'AI Engineering',
    likes: 18,
    commentsCount: 5,
  },
  {
    id: 'skill-blocker-resolver',
    name: 'Blocker & Dependency Analyzer',
    description: 'Identifies cycle bottlenecks, surfaces blocked tasks, and suggests actionable mitigation steps.',
    tools: ['set_blocker', 'link_tasks', 'list_tasks', 'log_decision'],
    systemPrompt: 'Analyze blocked tasks, discover critical-path bottlenecks, and log decisive architectural solutions to unblock progress.',
    category: 'Problem Solving',
    author: 'Agile Ops',
    likes: 15,
    commentsCount: 2,
  },
  {
    id: 'skill-arch-decision',
    name: 'Architecture Decision Record (ADR) Logger',
    description: 'Captures architectural decisions, tradeoffs, and rationale directly linked to code initiatives.',
    tools: ['log_decision', 'get_task', 'list_tasks'],
    systemPrompt: 'Help the engineer structure a formal Architecture Decision Record (ADR) capturing context, options considered, decision, and consequences.',
    category: 'Engineering',
    author: 'Senior Architect',
    likes: 31,
    commentsCount: 7,
  },
];

// ─── LocalStorage Likes & Comments Store ───────────────────────────────────────

export function getStoredLikes(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem('assistant_user_likes') || '{}');
  } catch {
    return {};
  }
}

export function toggleStoredLike(targetId: string): boolean {
  const likes = getStoredLikes();
  const next = !likes[targetId];
  if (next) {
    likes[targetId] = true;
  } else {
    delete likes[targetId];
  }
  localStorage.setItem('assistant_user_likes', JSON.stringify(likes));
  return next;
}

export function getStoredComments(targetId: string): Comment[] {
  try {
    const all: Comment[] = JSON.parse(localStorage.getItem('assistant_comments') || '[]');
    return all.filter((c) => c.targetId === targetId);
  } catch {
    return [];
  }
}

export function addStoredComment(targetId: string, content: string, user: UserProfile): Comment {
  const all: Comment[] = JSON.parse(localStorage.getItem('assistant_comments') || '[]');
  const comment: Comment = {
    id: 'cmt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    targetId,
    userName: user.name,
    userEmail: user.email,
    content,
    createdAt: new Date().toISOString(),
  };
  all.push(comment);
  localStorage.setItem('assistant_comments', JSON.stringify(all));
  return comment;
}

// ─── API methods ──────────────────────────────────────────────────────────────

export const api = {
  // Auth (Centralized via Spent App)
  login: (data: { email: string; password: string; name?: string }) =>
    fetchJson<{ user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getMe: () => fetchJson<{ user: UserProfile | null }>('/api/auth/me'),
  getUsers: () => fetchJson<{ users: UserProfile[] }>('/api/auth/users'),

  // Tools Catalog (public)
  getToolCatalog: () => fetchJson<{ tools: McpTool[] }>('/api/mcp-catalog'),
  getMcpCatalog: () => fetchJson<{ tools: McpTool[] }>('/api/mcp-catalog'),

  // Endpoints / Workflows
  getWorkflows: () => fetchJson<{ endpoints: Workflow[] }>('/api/endpoints'),
  getEndpoints: () => fetchJson<{ endpoints: Workflow[] }>('/api/endpoints'),
  createWorkflow: (data: {
    name: string;
    toolAllowlist: string[];
    instructions?: string;
    slug?: string;
  }) =>
    fetchJson<{ endpoint: Workflow }>('/api/endpoints', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createEndpoint: (data: {
    name: string;
    toolAllowlist: string[];
    instructions?: string;
    slug?: string;
  }) =>
    fetchJson<{ endpoint: Workflow }>('/api/endpoints', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateWorkflow: (
    id: string,
    data: Partial<Pick<Workflow, 'name' | 'toolAllowlist' | 'instructions' | 'status'>>,
  ) =>
    fetchJson<{ endpoint: Workflow }>(`/api/endpoints/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  updateEndpoint: (
    id: string,
    data: Partial<Pick<Workflow, 'name' | 'toolAllowlist' | 'instructions' | 'status'>>,
  ) =>
    fetchJson<{ endpoint: Workflow }>(`/api/endpoints/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteWorkflow: (id: string) =>
    fetchJson<{ deleted: boolean }>(`/api/endpoints/${id}`, { method: 'DELETE' }),
  deleteEndpoint: (id: string) =>
    fetchJson<{ deleted: boolean }>(`/api/endpoints/${id}`, { method: 'DELETE' }),
  pingWorkflow: (slug: string) =>
    fetchJson<unknown>(`/mcp/${slug}`, {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    }),

  // External MCP Integrations (e.g. Spent App)
  getExternalMcps: () => fetchJson<{ integrations: ExternalMcpIntegration[] }>('/api/external-mcps'),
  getSpentAppDetails: () =>
    fetchJson<{
      name: string;
      clientId: string;
      clientSecret: string;
      serverUrl: string;
      verifyUrl: string;
      isAuthenticated: boolean;
      userEmail: string;
    }>('/api/external-mcps/spent-details'),
  addExternalMcp: (data: { name: string; url: string; authToken?: string }) =>
    fetchJson<{ success: boolean; integration: ExternalMcpIntegration }>('/api/external-mcps', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  testExternalMcp: (data: { url: string; authToken?: string }) =>
    fetchJson<{ success: boolean; count: number; tools: ExternalMcpTool[] }>('/api/external-mcps/test', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteExternalMcp: (id: string) =>
    fetchJson<{ success: boolean }>(`/api/external-mcps/${id}`, { method: 'DELETE' }),

  // Dashboard & Process Data
  getDailyBrief: () => fetchJson<DailyBriefResponse>('/api/daily-brief'),
  getItems: (params?: { status?: string; priority?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.priority) q.set('priority', params.priority);
    if (params?.limit) q.set('limit', String(params.limit));
    return fetchJson<{ items: TaskItem[] }>(`/api/items?${q}`);
  },
  getItem: (id: string) => fetchJson<ItemDetailResponse>(`/api/items/${id}`),
  createTask: (data: {
    title: string;
    description?: string;
    priority?: string;
    dueAt?: string;
    type?: 'goal' | 'story' | 'task';
    parentId?: string | null;
  }) =>
    fetchJson<{ item: TaskItem }>('/api/items', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id: string, data: Partial<TaskItem> & { reason?: string }) =>
    fetchJson<{ item: TaskItem }>(`/api/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  completeTask: (id: string, reason?: string) =>
    fetchJson<{ item: TaskItem }>(`/api/items/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  deleteTask: (id: string, _reason?: string) =>
    fetchJson<{ deleted: boolean }>(`/api/items/${id}`, { method: 'DELETE' }),

  getBlockers: () => fetchJson<{ blockers: BlockerItem[] }>('/api/blockers'),
  resolveBlocker: (id: string, reason?: string) =>
    fetchJson<{ resolved: boolean }>(`/api/blockers/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    }),
  getDecisions: () => fetchJson<{ decisions: DecisionItem[] }>('/api/decisions'),
  logDecision: (data: { itemId: string; summary: string; rationale: string; reason?: string }) =>
    fetchJson<{ decision: DecisionItem }>('/api/decisions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getActivity: () => fetchJson<{ activities: ActivityItem[] }>('/api/activity'),

  // OAuth API methods
  getOAuthClientInfo: (params: { clientId: string; redirectUri: string; state?: string; scope?: string }) => {
    const qs = new URLSearchParams({
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      ...(params.state ? { state: params.state } : {}),
      ...(params.scope ? { scope: params.scope } : {}),
    });
    return fetchJson<OAuthClientInfoResponse>(`/api/oauth/client-info?${qs}`);
  },
  approveOAuth: (data: {
    clientId: string;
    redirectUri: string;
    endpointId?: string;
    scopes?: string[];
    state?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
  }) =>
    fetchJson<{ success: boolean; code: string; redirectUrl: string }>('/api/oauth/approve', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getOAuthClients: () => fetchJson<{ clients: OAuthClientItem[] }>('/api/oauth-clients'),
  createOAuthClient: (data: { clientName: string; redirectUris?: string[]; endpointId?: string; scopes?: string[] }) =>
    fetchJson<{ success: boolean; client: OAuthClientItem }>('/api/oauth-clients', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteOAuthClient: (clientId: string) =>
    fetchJson<{ success: boolean }>(`/api/oauth-clients/${clientId}`, { method: 'DELETE' }),

  // Phase 2: Calendar, Reminders, Push Notifications & Delay Analysis
  getCalendar: (startDate: string, endDate: string) => {
    const qs = new URLSearchParams({ startDate, endDate });
    return fetchJson<{ events: CalendarEventItem[]; total: number }>(`/api/calendar?${qs}`);
  },
  getCalendarConflicts: (startDate?: string, endDate?: string) => {
    const qs = new URLSearchParams();
    if (startDate) qs.set('startDate', startDate);
    if (endDate) qs.set('endDate', endDate);
    return fetchJson<{ conflicts: CalendarConflictItem[]; hasConflicts: boolean }>(`/api/calendar/conflicts?${qs}`);
  },
  getFreeSlots: (date: string, durationMinutes = 30) => {
    const qs = new URLSearchParams({ date, durationMinutes: String(durationMinutes) });
    return fetchJson<{ slots: FreeSlotItem[]; total: number }>(`/api/calendar/free-slots?${qs}`);
  },
  getReminders: (itemId?: string) => {
    const qs = itemId ? `?itemId=${itemId}` : '';
    return fetchJson<{ reminders: ReminderItem[] }>(`/api/reminders${qs}`);
  },
  setReminder: (data: { itemId: string; trigger: string; offsetMinutes?: number; triggerAt?: string; channels?: string[]; reason?: string }) =>
    fetchJson<{ reminder: ReminderItem }>('/api/reminders', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  cancelReminder: (id: string, reason?: string) =>
    fetchJson<{ cancelled: boolean }>(`/api/reminders/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    }),
  getNotificationPreferences: () =>
    fetchJson<NotificationPreferences>('/api/notifications/preferences'),
  updateNotificationPreferences: (data: Partial<NotificationPreferences>) =>
    fetchJson<{ updated: boolean }>('/api/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getVapidPublicKey: () =>
    fetchJson<{ publicKey: string }>('/api/push/vapid-key'),
  subscribePush: (subscription: unknown, userAgent?: string) =>
    fetchJson<{ success: boolean }>('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription, userAgent }),
    }),
  unsubscribePush: (endpoint: string) =>
    fetchJson<{ success: boolean }>('/api/push/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    }),
  explainDelay: (taskId: string) =>
    fetchJson<ExplainDelayResult>(`/api/items/${taskId}/explain-delay`),
};

export interface CalendarEventItem {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  dueAt: string | null;
  rrule: string | null;
  status: 'confirmed' | 'tentative' | 'cancelled';
  priority: 'critical' | 'high' | 'medium' | 'low' | 'none';
  tz: string;
  parentId: string | null;
  parentTitle: string | null;
}

export interface CalendarConflictItem {
  eventA: { id: string; title: string; startAt: string; endAt: string };
  eventB: { id: string; title: string; startAt: string; endAt: string };
  overlapMinutes: number;
}

export interface FreeSlotItem {
  startAt: string;
  endAt: string;
  durationMinutes: number;
}

export interface ReminderItem {
  id: string;
  itemId: string;
  itemTitle: string;
  trigger: string;
  triggerAt: string;
  state: 'pending' | 'sent' | 'failed' | 'cancelled';
  channels: string[];
}

export interface NotificationPreferences {
  channels: string[];
  telegramChatId: string | null;
  emailAddress: string | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  enabledTypes: string[];
  webPushSubscriptions: number;
}

export interface ExplainDelayResult {
  taskId: string;
  title: string;
  status: string;
  dueAt: string | null;
  isDelayed: boolean;
  delayReason: string;
  directBlockers: Array<{ id: string; reason: string; waitingOn: string | null; createdAt: string }>;
  dependencies: Array<{ id: string; title: string; status: string; dueAt: string | null; isDelayed: boolean; relation: string }>;
  rootCauses: string[];
  recommendation: string;
  summary: string;
}

export interface OAuthClientItem {
  id: string;
  clientId: string;
  clientSecret?: string;
  clientName: string;
  redirectUris: string[];
  endpointId: string | null;
  scopes: string[];
  createdAt: string;
}

export interface OAuthClientInfoResponse {
  success: boolean;
  client: {
    id: string;
    clientId: string;
    clientName: string;
    scopes: string[];
    endpointId: string | null;
  };
  endpoints: Array<{
    id: string;
    name: string;
    slug: string;
    scopes: string[];
    toolCount: number;
  }>;
}

