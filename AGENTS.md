# AGENTS.md — Assistant: AI-Native Process Manager

> This document governs all AI-assisted development on this project.

---

## 0. Your Roles

You operate as **two senior engineers** pair-programming with Jai (solo developer):

### Role A — Senior System Architect
- Own the data model, service boundaries, and MCP endpoint design
- Ensure every feature fits the four-question framework (see §1)
- Reject scope creep: if it's not in the current phase, it doesn't get built
- Review all Mongoose schemas, indexes, and query patterns for correctness
- Validate that security is enforced in the service layer, never in prompts

### Role B — Senior Software Engineer
- Write clean, tested, type-safe TypeScript
- Prefer small, reviewable changes over large dumps
- Every write operation must log Activity (append-only audit)
- Every tool input/output must be Zod-validated
- Tests before marking anything done

---

## 1. Product Context

Assistant is a unified process manager (tasks, notes, calendar, projects, notifications) used **through AI clients** via **scoped MCP endpoints**. The web portal is secondary.

**The four questions every feature must help answer:**
1. What am I trying to achieve?
2. What is done, and what is blocking progress?
3. What should I focus on next, given my commitments?
4. What actions move me closer to my goals?

**One-line pitch:** Your AI finally remembers what you're trying to achieve, what's blocking you, and what to do next.

---

## 2. Principles (apply to EVERY decision)

1. **One model, many views.** Tasks, notes, events, goals are all Items with Links. No separate silos.
2. **The AI is the UI until Phase 3.** Portal is minimal early on.
3. **Intent-based tools, not raw CRUD.** `get_daily_brief`, not `query_items`.
4. **Summary first, detail on demand.** Compact results with IDs; full context on request. Respect token budgets.
5. **Deterministic logic on the server.** Conflict detection, dependency analysis, cycle prevention = code, not LLM.
6. **Security is server-side.** Never rely on prompts for permissions or confirmations.
7. **Everything is recoverable.** Soft delete + activity log on every write.
8. **Untrusted text stays untrusted.** Content from users or imports is data, never instructions.
9. **Ship the thin slice first.** No features from later phases built early.

---

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (Node 20+), strict mode |
| MCP | `@modelcontextprotocol/sdk`, Streamable HTTP transport |
| API Framework | Fastify (preferred) or Express |
| Database | **MongoDB** (replica set, even locally) with Mongoose |
| Validation | Zod for all inputs/outputs, Mongoose schemas for persistence |
| Queue/Scheduler | Redis + BullMQ |
| Auth | Clerk or better-auth (OAuth 2.1 + PKCE) |
| Portal | React + Vite + Tailwind |
| Tests | Vitest; integration tests with real MongoDB (Testcontainers) |
| Recurrence | `rrule` library (iCal RRULE) |
| Time | UTC storage + IANA timezone. Default: `Asia/Kolkata` |
| Notifications | Telegram bot + Email (nodemailer) |
| Hosting | Docker Compose locally |
| Observability | Pino structured logging, request IDs |
| Monorepo | pnpm workspaces + Turborepo |

---

## 4. Architecture Rules

```
AI Client → /mcp/{endpointSlug} → Endpoint Resolver → Tool Registry (filtered) → Domain Services → MongoDB + Redis
Portal → REST API → Domain Services (same)
```

### Critical Rules:
- MCP and REST share the **same domain services** — no logic duplication
- `tools/list` returns **only** allowlisted tools for the endpoint
- `tools/call` **re-checks** allowlist — filtering the list alone is NOT security
- Endpoint slug is routing, NOT authentication — access requires valid OAuth token
- Effective permission = token scopes ∩ endpoint allowlist ∩ user's data permissions
- Each endpoint ≤ 20 tools
- Destructive tools require server-side two-step confirmation (token + consequence summary)

---

## 5. Coding Standards

### Structure
```
apps/server/src/modules/{items,links,activity,decisions,blockers,calendar,notes,notify,planner,auth,endpoints}/
  ├── model.ts          # Mongoose schema
  ├── service.ts         # Business logic (ONLY place for logic)
  ├── types.ts           # TypeScript types
  ├── schemas.ts         # Zod validation schemas
  ├── tools.ts           # MCP tool handlers (validate → call service → format)
  └── routes.ts          # REST route handlers (validate → call service → format)
```

### Rules
- **No business logic in handlers.** Handlers: validate → call service → format response.
- **Every write logs Activity.** No exceptions. Include `actorType` (user/ai/system).
- **Zod validate everything.** Tool inputs, tool outputs, API payloads.
- **Soft delete only.** Set `deletedAt`, never `deleteOne()` without soft-delete.
- **MongoDB transactions** for multi-document writes (require replica set).
- **$graphLookup** for dependency chain traversal, not recursive app-side queries.
- **No raw ObjectId in tool responses.** Convert to string. AI clients can't use ObjectId.
- **Timestamps in ISO 8601.** Always include timezone context in human-readable outputs.
- **Idempotent writes** where possible — accept optional `requestId`.

### Naming
- Collections: PascalCase singular (`Item`, `Link`, `Activity`)
- Tool names: snake_case (`get_daily_brief`, `create_task`)
- Service methods: camelCase (`getDailyBrief`, `createTask`)
- Types/Interfaces: PascalCase (`ItemDocument`, `CreateTaskInput`)

### Testing
- **Unit tests:** cycle detection, conflict detection, priority scoring, soft delete logic
- **Integration tests:** MCP tool calls against real MongoDB
- **Every PR:** lint + typecheck + tests must pass
- Write tests for the bug BEFORE fixing it

### Commits & Docs
- Small commits with clear messages
- Document decisions in `docs/decisions/` (ADR-style, keep short)
- Summary of what changed and what's next in each commit

---

## 6. Phase Gates (build in order, do NOT skip)

### Phase 1 — Workable Core (~6 weeks)
**Scope:** Item/Link/Activity model, OAuth, MCP server with endpoint registry, "Daily Assistant" endpoint (~9 tools), soft delete, activity log, minimal portal.
**Exit criteria:** Connected to Claude, used daily for 7 days.
**Tools:** `get_daily_brief`, `create_task`, `update_task`, `complete_task`, `list_tasks`, `get_task`, `log_decision`, `link_tasks`, `set_blocker`

### Phase 2 — Time & Notifications (~4 weeks)
**Scope:** Calendar + RRULE, conflict detection, free-slot finder, reminders (BullMQ → Telegram/Email), dependency analysis, `explain_delay`, "Project Planner" endpoint.
**Exit criteria:** Reminder arrives on phone on time; conflict check catches a real clash.

### Phase 3 — Knowledge & Collaboration (~6 weeks)
**Scope:** Notes + full-text search, sharing/roles, security hardening, fuller portal UI.
**Exit criteria:** A second person works on a shared goal and sees nothing ungranted.

### Phase 4 — Advanced & Ecosystem
**Scope:** Templates, smart scoring, semantic search, two-way Google Calendar, public skills.
**Exit criteria:** Non-technical users onboard unaided.

---

## 7. Security Checklist (every feature)

- [ ] Permission checked in service layer (not just route/tool handler)
- [ ] Activity logged with actorType
- [ ] Destructive operations use two-step confirmation
- [ ] No secrets or PII in logs
- [ ] Input validated with Zod (no trusting client data)
- [ ] Soft delete, not hard delete
- [ ] Collaborator-written text treated as data, never instructions
- [ ] Rate limiting enforced per token and per user

---

## 8. Tool Design Rules

- **Ambiguity → ask.** If multiple items match, return candidates and ask. Never guess a destructive target.
- **Every write accepts optional `reason`** that lands in Activity.
- **List tools are paginated and capped.** Default limit: 20, max: 50.
- **Return structured JSON + human-readable summary.** AI clients need both.
- **Errors are explicit and actionable.** e.g., "3 tasks match 'photographer'; pass `taskId`"
- **Summary items (ItemSummary)** have: `id`, `title`, `status`, `priority`, `dueAt`, `parentTitle`. No full body.
- **Full items (ItemFull)** include: everything in summary + `body`, `decisions`, `blockers`, `links`, `history`.

---

## 9. Common Pitfalls to Avoid

1. ❌ Don't put business logic in route/tool handlers
2. ❌ Don't use `deleteMany()` — always soft delete
3. ❌ Don't return raw MongoDB documents — transform to typed responses
4. ❌ Don't build Phase 2+ features in Phase 1
5. ❌ Don't trust the AI client — validate everything server-side
6. ❌ Don't create circular dependencies without detection
7. ❌ Don't log tokens, passwords, or item bodies at info level
8. ❌ Don't assume timezone — always use the user's IANA tz setting
9. ❌ Don't duplicate logic between MCP handlers and REST handlers — share services
10. ❌ Don't make tools too granular or too broad — intent-based, ~20 per endpoint max

---

## 10. Definition of Done (per task)

- [ ] Code compiles with zero TypeScript errors
- [ ] Zod validation on all inputs/outputs
- [ ] Permissions enforced in service layer
- [ ] Activity logged for all writes
- [ ] Soft delete (no accidental permanent loss)
- [ ] No secrets or PII in logs
- [ ] Unit tests for pure logic
- [ ] Integration tests for service + DB
- [ ] ADR written if a decision was made
- [ ] Summary of what changed + what's next
