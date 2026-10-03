/**
 * Frontend API client communicating with backend REST routes (/api/*).
 */

export interface DailyBriefResponse {
  today: string;
  focus: Array<{
    id: string;
    type: string;
    title: string;
    status: string;
    priority: string;
    dueAt: string | null;
    parentTitle: string | null;
    createdAt: string;
  }>;
  dueToday: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueAt: string | null;
  }>;
  overdue: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueAt: string | null;
  }>;
  blocked: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    blockers: string[];
  }>;
  recentDecisions?: Array<{
    id: string;
    summary: string;
    rationale: string;
    createdAt: string;
  }>;
}

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

export interface EndpointItem {
  id: string;
  name: string;
  slug: string;
  toolAllowlist: string[];
  instructions?: string | null;
  status: 'active' | 'revoked';
  createdAt: string;
}

export interface McpToolCatalogItem {
  name: string;
  description: string;
  requiredScope: string;
  inputSchema: Record<string, unknown>;
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

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  timezone: string;
  createdAt?: string;
}

// Current active user ID stored in localStorage
let activeUserId = localStorage.getItem('assistant_active_user_id') || '';

export function setActiveUser(id: string) {
  activeUserId = id;
  if (id) {
    localStorage.setItem('assistant_active_user_id', id);
  } else {
    localStorage.removeItem('assistant_active_user_id');
  }
}

export function getActiveUserId(): string {
  return activeUserId;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(activeUserId ? { 'x-user-id': activeUserId } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(url, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.message || `Request failed with status ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Auth & Users
  getMe: () => fetchJson<{ user: UserProfile }>('/api/auth/me'),
  getUsers: () => fetchJson<{ users: UserProfile[] }>('/api/auth/users'),
  login: (data: { email: string; name?: string }) =>
    fetchJson<{ user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // MCP Endpoints & Catalog
  getEndpoints: () => fetchJson<{ endpoints: EndpointItem[] }>('/api/endpoints'),
  getMcpCatalog: () => fetchJson<{ tools: McpToolCatalogItem[] }>('/api/mcp-catalog'),
  createEndpoint: (data: { name: string; toolAllowlist: string[]; instructions?: string; slug?: string }) =>
    fetchJson<{ endpoint: EndpointItem }>('/api/endpoints', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateEndpoint: (id: string, data: Partial<EndpointItem>) =>
    fetchJson<{ endpoint: EndpointItem }>(`/api/endpoints/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteEndpoint: (id: string) =>
    fetchJson<{ deleted: boolean }>(`/api/endpoints/${id}`, {
      method: 'DELETE',
    }),

  // Users' Data & Process
  getDailyBrief: () => fetchJson<DailyBriefResponse>('/api/daily-brief'),
  
  getItems: (params?: { status?: string; priority?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.priority) query.set('priority', params.priority);
    if (params?.limit) query.set('limit', String(params.limit));
    return fetchJson<{ items: TaskItem[]; total?: number }>(`/api/items?${query.toString()}`);
  },

  createTask: (data: { title: string; description?: string; priority?: string; dueAt?: string }) =>
    fetchJson<{ item: TaskItem }>('/api/items', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

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

  deleteTask: (id: string, reason?: string) =>
    fetchJson<{ deleted: boolean }>(`/api/items/${id}${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`, {
      method: 'DELETE',
    }),

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
};
