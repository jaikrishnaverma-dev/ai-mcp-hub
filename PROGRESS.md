# Progress Log — Assistant

> Every session updates this file. Read it first for context.

---

## Current Phase: Phase 1 — Workable Core

### Status: 🚧 In Progress — Foundation + Schemas Done

---

## Session Log

### Session 1 — 2026-10-04

**What happened:**

**Planning & Rules:**
- ✅ Reviewed product doc (`plan.md`) — approved with MongoDB adjustment
- ✅ Decided: MongoDB, Mongoose, Clerk/better-auth, Telegram + Email, Docker Compose, Personal + Family target
- ✅ Created `AGENTS.md` — master agent prompt with dual-role (Architect + Engineer)
- ✅ Created `.agents/rules/architecture.md` — data model invariants, service layer rules
- ✅ Created `.agents/rules/coding-standards.md` — TypeScript, Mongoose, Zod patterns
- ✅ Created `.agents/rules/security.md` — auth, destructive ops, prompt injection, audit trail
- ✅ Created `review_and_plan.md` artifact — full architecture review + 6-week build plan

**Foundation:**
- ✅ Initialized monorepo: `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`
- ✅ Docker Compose: MongoDB 7 replica set + Redis 7 (alpine)
- ✅ `.gitignore`, `.env.example`
- ✅ MongoDB init script (`scripts/mongo-init.js`)

**Shared Package (`packages/shared`):**
- ✅ Constants: item types, statuses, priorities, link kinds, actor types, endpoint scopes
- ✅ Zod schemas: items (create/update/list/get/complete/dailyBrief), links, activity, decisions, blockers, endpoints
- ✅ TypeScript types: IItem, ILink, IActivity, IDecision, IBlocker, IEndpoint, IUser, ServiceContext
- ✅ Builds clean with `tsc`

**Server Package (`apps/server`):**
- ✅ Config: database connection (MongoDB replica set), Pino logger (with redaction)
- ✅ Mongoose models: Item, Link, Activity, Decision, Blocker, Endpoint, User
- ✅ Custom errors: NotFoundError, ValidationError, ConflictError, ForbiddenError, CycleDetectedError, AmbiguousMatchError, ConfirmationRequiredError
- ✅ Entry point: Express + helmet + cors + health check + graceful shutdown
- ✅ **Typechecks clean (0 errors)**

**Services & Business Logic:**
- ✅ Items service: create, update, list, get, complete, soft delete with activity logging
- ✅ Links service: create link with MongoDB `$graphLookup` cycle detection, unlink, list
- ✅ Decisions service: log decision, link to items with activity logging
- ✅ Blockers service: set blocker, clear blocker with item status sync
- ✅ Planner service: `getDailyBrief` (focus tasks, blocked items, due soon, recent decisions)

**MCP Server & Transport:**
- ✅ Tool registry: allowlist-based tool filtering, Zod schema validation
- ✅ All 9 P1 Tools defined: `get_daily_brief`, `create_task`, `update_task`, `complete_task`, `list_tasks`, `get_task`, `log_decision`, `link_tasks`, `set_blocker`
- ✅ Streamable HTTP transport: Express route `/mcp/:slug`, security allowlist re-check on `tools/call`
- ✅ Seed script (`apps/server/src/seed.ts`): demo user, endpoint with nanoid slug, sample tasks/blockers/decisions
- ✅ Clean typecheck across all packages (`turbo typecheck` 0 errors)

**Decisions:**
- ADR-001: MongoDB over Postgres → `docs/decisions/001-mongodb-over-postgres.md`

**Source Control:**
- ✅ Git repo initialized on `main` branch
- ✅ Remote origin connected: `https://github.com/jaikrishnaverma-dev/ai-mcp-hub.git`
- ✅ Initial code commit pushed to GitHub (`main`)

**What's remaining in Phase 1:**
- [ ] Spin up MongoDB replica set & Redis (start Docker Compose or local mongod)
- [ ] Run seed script (`pnpm --filter @assistant/server seed`) & verify DB contents
- [ ] Vitest unit & integration tests (cycle detection, soft-delete, daily brief, MCP calls)
- [ ] Auth / Bearer token validation on `/mcp/:slug` (token scopes ∩ endpoint allowlist)
- [ ] Connect with Claude / AI client & verify 7-day test workflow
- [ ] Minimal Portal UI (React + Vite + Tailwind) for visual verification

---

## File Map

```
todo-assistance/
├── AGENTS.md                                    # Master agent prompt (dual-role rules)
├── PROGRESS.md                                  # This file — session continuity
├── plan.md                                      # Product knowledge doc
├── package.json                                 # Root workspace
├── pnpm-workspace.yaml                          # pnpm workspaces config
├── turbo.json                                   # Turborepo pipeline
├── tsconfig.base.json                           # Base TypeScript config (strict)
├── docker-compose.yml                           # MongoDB replica set + Redis
├── .env.example                                 # Environment template
├── .gitignore
├── scripts/
│   └── mongo-init.js                            # DB bootstrap
├── .agents/rules/
│   ├── architecture.md                          # Data model + service rules
│   ├── coding-standards.md                      # TypeScript + Mongoose patterns
│   └── security.md                              # Auth + safety rules
├── docs/decisions/
│   └── 001-mongodb-over-postgres.md             # ADR: why MongoDB
├── packages/shared/
│   ├── package.json
│   ├── tsconfig.json                            # composite: true
│   └── src/
│       ├── index.ts                             # Barrel export
│       ├── constants/index.ts                   # Enums + weights + defaults
│       ├── schemas/                             # Zod schemas
│       │   ├── index.ts
│       │   ├── items.ts                         # Item CRUD I/O
│       │   ├── links.ts                         # Link I/O
│       │   ├── activity.ts                      # Activity output
│       │   ├── decisions.ts                     # Decision I/O
│       │   ├── blockers.ts                      # Blocker I/O
│       │   └── endpoints.ts                     # Endpoint I/O
│       └── types/index.ts                       # TypeScript interfaces
└── apps/server/
    ├── package.json
    ├── tsconfig.json
    ├── .env                                     # Local env (gitignored)
    └── src/
        ├── index.ts                             # Entry point
        ├── errors.ts                            # Custom error classes
        ├── config/
        │   ├── index.ts
        │   ├── database.ts                      # MongoDB connection
        │   └── logger.ts                        # Pino with redaction
        └── modules/
            ├── items/model.ts                   # Item schema + soft delete middleware
            ├── links/model.ts                   # Link schema + unique constraint
            ├── activity/model.ts                # Activity schema (append-only)
            ├── decisions/model.ts               # Decision schema
            ├── blockers/model.ts                # Blocker schema
            ├── endpoints/model.ts               # Endpoint schema + nanoid slug
            └── auth/model.ts                    # User schema
```

---

## Key Patterns Established

1. **toJSON transforms** use `Record<string, unknown>` to avoid strict TS fights with Mongoose's untyped ret object
2. **Soft delete** is middleware-based — all `find`/`findOne`/`countDocuments` auto-filter `deletedAt: null`
3. **ObjectId → string** conversion happens in toJSON transforms, never in service layer
4. **Compound indexes** match primary query patterns (ownerId + type + status + deletedAt)
5. **nanoid(21)** for endpoint slugs — unguessable URLs
