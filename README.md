# Assistant — AI-Native Process Manager & MCP Hub

> **Your AI finally remembers what you're trying to achieve, what's blocking you, and what to do next.**

Assistant is an AI-native process manager combining **tasks, notes, calendar, projects, and notifications** into a unified system with a single shared data model. Designed from the ground up to be operated by AI clients (Claude, Cursor, Antigravity, etc.) via scoped **Model Context Protocol (MCP)** endpoints.

---

## 🎯 The Four-Question Framework

Every feature, model, and MCP tool in Assistant exists to help answer four fundamental questions:

1. **What am I trying to achieve?** (Goals, projects, parent items)
2. **What is done, and what is blocking progress?** (Statuses, blockers, dependency chains)
3. **What should I focus on next, given my commitments?** (Daily brief, priorities, due dates)
4. **What actions move me closer to my goals?** (Next actionable tasks, logged decisions)

---

## ✨ Core Principles

- **One Model, Many Views:** Tasks, notes, events, and goals are all unified `Items` linked together via a directed acyclic graph (`Link`).
- **Intent-Based MCP Tools:** Exposes high-level intent (`get_daily_brief`, `set_blocker`, `log_decision`) rather than raw database CRUD.
- **Deterministic Server-Side Logic:** Dependency cycles, conflict detection, and status propagation are enforced by code (e.g. MongoDB `$graphLookup`), never delegated to LLM prompts.
- **Secure Scoped Endpoints:** Each endpoint (`/mcp/:slug`) exposes an allowlisted subset of tools (≤ 15) matching its intended persona (e.g., Daily Assistant, Project Planner).
- **Append-Only Audit Trail:** Every write operation logs an immutable `Activity` record with `actorType` (`user`, `ai`, or `system`).
- **Everything Is Recoverable:** Soft deletes with automated Mongoose middleware protection across queries.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Monorepo** | [pnpm](https://pnpm.io/) workspaces + [Turborepo](https://turbo.build/) |
| **Language** | TypeScript (Node 20+, Strict Mode) |
| **MCP SDK** | [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol) (Streamable HTTP Transport) |
| **Backend API** | Express 5, Helmet, CORS, Pino structured logging |
| **Database** | MongoDB 7 (Replica Set with transactions) + Mongoose |
| **Validation** | Zod (for all tool inputs, outputs, and API payloads) |
| **Queues / Cache** | Redis 7 + BullMQ *(Phase 2)* |
| **Testing** | Vitest |

---

## 📦 Monorepo Structure

```
todo-assistance/
├── apps/
│   └── server/                   # Express + MCP HTTP Server
│       ├── src/
│       │   ├── config/           # Database & Pino logger configurations
│       │   ├── errors.ts         # Domain error hierarchy (Conflict, NotFound, Cycle, etc.)
│       │   ├── index.ts          # Server entry point (POST /mcp/:slug)
│       │   ├── mcp/              # MCP Tool Registry & Streamable HTTP transport
│       │   │   ├── registry.ts   # Tool allowlists & schemas
│       │   │   ├── tools.ts      # 9 P1 tool implementations
│       │   │   └── transport.ts  # Express MCP transport handler
│       │   ├── modules/          # Domain services & Mongoose models
│       │   │   ├── items/        # Task & item lifecycle + soft-delete
│       │   │   ├── links/        # Graph relationships + $graphLookup cycle detection
│       │   │   ├── decisions/    # Decision logging & rationale tracking
│       │   │   ├── blockers/     # Blocker management & status sync
│       │   │   ├── planner/      # Daily brief computation
│       │   │   ├── endpoints/    # Scoped MCP endpoint definitions
│       │   │   └── activity/     # Append-only audit log
│       │   └── seed.ts           # Demo seed data script
│       └── package.json
├── packages/
│   └── shared/                   # Shared TypeScript types, constants & Zod schemas
│       ├── src/
│       │   ├── constants/        # Enums, weights, statuses, priorities
│       │   ├── schemas/          # Zod schemas for all tool inputs & outputs
│       │   └── types/            # TypeScript interfaces
│       └── package.json
├── docker-compose.yml             # MongoDB replica set + Redis
├── docs/decisions/               # Architecture Decision Records (ADRs)
├── AGENTS.md                     # Agent development rules & coding standards
└── PROGRESS.md                   # Real-time build progress and session logs
```

---

## ⚡ Available MCP Tools (Phase 1 — Daily Assistant)

| Tool | Type | Description |
|---|---|---|
| `get_daily_brief` | Read | Aggregates high-priority tasks, blocked items, upcoming due items, and recent decisions. |
| `create_task` | Write | Creates a new task with priority, tags, due date, and optional parent project. |
| `update_task` | Write | Modifies title, status, priority, due date, or body of an existing task. |
| `complete_task` | Write | Marks a task completed, cleans up active blockers, and logs completion activity. |
| `list_tasks` | Read | Paginated, filterable task query by status, priority, and parent item. |
| `get_task` | Read | Retrieves full task detail including blockers, decisions, and related links. |
| `log_decision` | Write | Records a key decision and rationale linked to one or more items. |
| `link_tasks` | Write | Creates a relationship (`blocks`, `relates_to`, etc.) with server-side circular dependency checks. |
| `set_blocker` | Write | Sets a blocker on an item with a reason and marks the item status as `blocked`. |

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Docker & Docker Compose** (for MongoDB replica set & Redis)

### 2. Installation & Environment Setup
Clone the repository and install dependencies:
```bash
git clone https://github.com/jaikrishnaverma-dev/ai-mcp-hub.git
cd ai-mcp-hub
pnpm install
```

Copy the environment template:
```bash
cp .env.example apps/server/.env
```

### 3. Start Database Services
Spin up the MongoDB replica set and Redis containers:
```bash
docker compose up -d
```

### 4. Seed Initial Data
Seed demo user, a default `daily-assistant` endpoint slug, sample items, and blockers:
```bash
pnpm --filter @assistant/server seed
```

### 5. Run the Server
Start the development server with live reload:
```bash
pnpm --filter @assistant/server dev
```
The server will start at `http://localhost:3000` with:
- Health check: `GET http://localhost:3000/health`
- MCP Endpoint: `POST http://localhost:3000/mcp/:slug`

---

## 🤖 Connecting to AI Clients (Claude Desktop / Cursor)

Assistant uses the official MCP Streamable HTTP transport. You can connect Claude Desktop or any MCP client by configuring your client settings:

```json
{
  "mcpServers": {
    "daily-assistant": {
      "url": "http://localhost:3000/mcp/daily-assistant"
    }
  }
}
```

Replace `daily-assistant` with your generated endpoint slug from the seed script.

---

## 🗺️ Roadmap & Phase Gates

- [x] **Phase 1: Workable Core** *(Current)*
  - Monorepo structure, Mongoose models, and Zod schemas
  - 9 Daily Assistant MCP tools with streamable HTTP transport
  - Graph-based cycle detection and soft deletion
  - Activity audit logging
- [ ] **Phase 2: Time & Notifications**
  - Calendar + RRULE recurrence, conflict detection, free-slot finder
  - BullMQ + Redis background workers (Telegram bot & Email notifications)
  - Project planner endpoint & delay analysis (`explain_delay`)
- [ ] **Phase 3: Knowledge & Collaboration**
  - Notes model with full-text search
  - Multi-user sharing, permissions, and security hardening
  - Web portal UI (React + Tailwind)
- [ ] **Phase 4: Advanced Ecosystem**
  - Smart scoring, semantic search, 2-way Google Calendar synchronization, templates

---

## 📜 Development Guidelines

All contributions adhere to strict principles documented in [AGENTS.md](./AGENTS.md):
- Zero TypeScript compiler errors (`pnpm typecheck`).
- Zod validation on every tool input and output.
- Server-side security: no trusting AI prompts for permissions or cycle prevention.
- Soft-deletes only (`deletedAt` timestamp).

---

## 📄 License

MIT © [Jai Krishna Verma](https://github.com/jaikrishnaverma-dev)
