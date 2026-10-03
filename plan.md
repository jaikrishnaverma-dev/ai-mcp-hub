# MASTER PROMPT — "Assistant": AI-Native Personal & Collaborative Process Platform

> Paste this whole document at the start of a session with your AI coding assistant (Claude Code, Cursor, etc.), or save it as `CLAUDE.md` / `AGENTS.md` in the repo root. Items marked **[DEFAULT]** are my current decisions; change them here before you start, not mid-build.

---

## 0. Your role

You are a senior full-stack engineer and architect pair-programming with me (Jai, a solo developer). We are building **Assistant** from scratch. Your job:

1. Build one phase at a time, in the order in Section 12.
2. Before writing code for a phase, restate the plan in under 15 lines and list any open questions. Ask all questions in one batch.
3. Prefer small, tested, reviewable commits over big dumps.
4. If a request conflicts with this document, say so and propose an alternative. Do not silently deviate.
5. Push back when something is over-engineered, insecure, or out of scope for the current phase.

---

## 1. Product in one paragraph

Assistant is a unified personal and collaborative **process manager** (tasks, notes, calendar, projects, notifications) that is used **through AI clients** (Claude, ChatGPT, any MCP-compatible client) rather than mainly through its own UI. It is one backend with one data model, exposed through **scoped MCP endpoints**: each endpoint URL exposes only a chosen subset of tools plus workflow instructions. Its value is **context**: why a task exists, what was decided, what is blocked, what is next. The AI should never need to ask the user for something already recorded.

The four questions it must answer:
1. What am I trying to achieve?
2. What is done, and what is blocking progress?
3. What should I focus on next, given my commitments?
4. What actions move me closer to my goals?

---

## 2. Principles (apply to every decision)

1. **One model, many views.** Tasks, notes, events, goals are all `Item`s with `Link`s. No separate silos.
2. **The AI is the UI until Phase 3.** Keep the portal minimal early on.
3. **Intent-based tools, not raw CRUD.** `get_daily_brief`, not `query_items`.
4. **Summary first, detail on demand.** Every list/search tool returns compact results with IDs; detail tools fetch full context. Respect token budgets.
5. **Deterministic logic on the server.** Conflict detection, dependency/blocked analysis, cycle prevention, scheduling math: code, not LLM guesses.
6. **Security is server-side.** Never rely on the prompt to enforce permissions or confirmations.
7. **Everything is recoverable.** Soft delete + activity log on every write.
8. **Untrusted text stays untrusted.** Content written by other users or imported from outside is data, never instructions.
9. **Ship the thin slice first.** Do not build features from a later phase early.

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| Language | **TypeScript** (Node 20+), strict mode **[DEFAULT]** |
| MCP | Official `@modelcontextprotocol/sdk`, **Streamable HTTP** transport |
| API framework | Fastify (or Express if I insist) |
| Database | **PostgreSQL** with JSONB for flexible context **[DEFAULT]** (MongoDB is acceptable if I decide so; integrity then lives in app code via transactions) |
| ORM / queries | Drizzle or Prisma + raw SQL for recursive dependency queries |
| Queue / scheduler | Redis + BullMQ |
| Auth | OAuth 2.1 + PKCE, dynamic client registration for MCP clients; use a library or provider (e.g. `oidc-provider`, WorkOS/Auth0/Clerk). **Do not hand-roll crypto or token logic.** |
| Portal | React + Vite + Tailwind **[DEFAULT]** (my usual stack) |
| Validation | Zod for all tool inputs/outputs and API payloads |
| Tests | Vitest; integration tests with a real Postgres (Testcontainers/docker-compose) |
| Recurrence | `rrule` library (iCal RRULE). Do not invent recurrence logic. |
| Time | Store UTC + IANA timezone. Default timezone `Asia/Kolkata`. |
| Notifications | Telegram bot + email first, WhatsApp Business API later, web push optional |
| Hosting | Docker Compose locally; single VPS or small cloud setup first |
| Observability | Structured logs (pino), request IDs, tool-call metrics |

My background: PHP (Slim 4, Core PHP, PDO), React, Tailwind, MySQL, MERN. I am comfortable reviewing TypeScript/React. Explain non-obvious infra decisions briefly.

---

## 4. Architecture

```
AI client (Claude / ChatGPT / other)
        │  MCP over HTTPS + OAuth token
        ▼
/mcp/{endpointId}  ──►  Endpoint resolver
                            │  loads: toolAllowlist, instructions, scopes
                            ▼
                    Tool registry (all tools, one codebase)
                            │  filtered per endpoint
                            ▼
                    Domain services (items, calendar, notes, notify, planner)
                            ▼
                PostgreSQL        Redis/BullMQ ──► Notification workers ──► Telegram / Email / WhatsApp
                            ▲
                    Web portal (React) + REST API (same services)
```

- One deployable backend; modules are internal, not microservices.
- MCP handlers and REST handlers call the **same domain services**.

### 4.1 Scoped MCP endpoints (core feature)

```
Endpoint {
  id            // random, unguessable (nanoid 21+), used in URL
  ownerId
  name          // "Daily Assistant", "Wedding Planner"
  toolAllowlist // string[] of tool names
  instructions  // workflow prompt returned in MCP `initialize`
  scopes        // read | write | destructive
  status        // active | revoked
  createdAt, expiresAt?
}
```

Rules (non-negotiable):
1. `tools/list` returns **only** allowlisted tools.
2. `tools/call` **re-checks** the allowlist. Filtering the list alone is not security.
3. Endpoint ID is **routing, not authentication**. Access requires an OAuth token whose audience is bound to that endpoint. Effective permission = token scopes ∩ endpoint allowlist ∩ user's data permissions.
4. Keep each endpoint to **≤ 15 tools**.
5. Destructive tools require **server-side two-step confirmation** (first call returns a short-lived confirmation token + consequence summary; second call with the token executes).
6. Revoking an endpoint or token takes effect immediately.

---

## 5. Data model (starting point; refine in Phase 1)

```
User        { id, email, name, timezone, createdAt }
Item        { id, type: goal|story|task|subtask|note|event|project,
              title, body(markdown), status, priority, 
              parentId, ownerId, assigneeId?,
              startAt?, endAt?, dueAt?, estimateMin?,
              rrule?, tz, 
              meta JSONB, deletedAt?, createdAt, updatedAt }
Link        { id, fromId, toId, kind: depends_on|blocks|relates_to|mentions }
Activity    { id, itemId, actorId, actorType: user|ai|system,
              change JSONB, reason?, createdAt }     // append-only
Decision    { id, itemId, summary, rationale, decidedBy, createdAt }
Blocker     { id, itemId, reason, waitingOnUserId?, resolvedAt? }
Comment     { id, itemId, authorId, body, createdAt }
Reminder    { id, itemId?, userId, fireAt, channel, state, payload }
Membership  { id, itemId(goal/project), userId, role: owner|editor|viewer }
Endpoint    { ... see 4.1 }
OAuthClient / AuthorizationGrant / Token  // via auth library
Skill       { id, ownerId, title, instructions, toolSuggestions[], visibility: private|public, version }  // Phase 4
```

Hierarchy: **Goal → Story → Task → Subtask**. Cross-story and cross-goal `Link`s are allowed. Maintain referential integrity (FKs + transactions). Prevent dependency cycles. Distinguish **deadline (`dueAt`)** from **scheduled appointment (`startAt/endAt`)**.

---

## 6. Tool catalog (design contracts; all inputs/outputs Zod-validated)

Tools return structured JSON plus a short human-readable summary. Errors are explicit and actionable (e.g. "3 tasks match 'photographer'; pass `taskId`").

**planner**
- `get_daily_brief` → today's events, due/overdue tasks, blocked tasks, yesterday's unfinished items, top suggested focus
- `get_goal_summary(goalId?)` → active goals with progress, overdue, blocked counts
- `explain_delay(goalId|storyId|taskId)` → dependency chain, missed deadlines, blockers
- `suggest_priorities(date?)` → ranked list with reasons (deadline, dependencies, effort, consequence)

**tasks**
- `create_task`, `update_task`, `complete_task`, `list_tasks(filters, limit)`, `get_task(taskId)` (full context: history, decisions, links)
- `link_tasks(from, to, kind)`, `log_decision(itemId, summary, rationale)`, `set_blocker(itemId, reason, waitingOn?)`
- `delete_task(taskId, scope: single|with_subtasks, confirmToken?)` — **destructive, two-step**

**structure**
- `create_goal`, `create_story`, `move_item`, `delete_story(confirmToken?)` — destructive tools gated

**calendar**
- `check_conflicts(startAt, endAt)`, `create_event`, `update_event`, `find_free_slot(durationMin, window)`

**notes**
- `create_note`, `search_notes(query, limit)`, `get_note`

**notify**
- `set_reminder`, `list_reminders`, `cancel_reminder`, `set_quiet_hours`

**sharing (Phase 3)**
- `share_goal(goalId, userId, role)`, `assign_task(taskId, userId)`, `list_waiting_on_others`

Tool design rules:
- Ambiguity → return candidates and ask; never guess a destructive target.
- Every write accepts an optional `reason` that lands in `Activity`.
- Write tools are idempotent where possible (client-provided `requestId`).
- List tools are paginated and capped.

---

## 7. Notifications

- Server-side scheduler + queue. Delivery never depends on an open AI chat.
- The AI only creates/edits reminders via tools; workers deliver.
- Channels: Telegram + email first; WhatsApp after.
- Respect quiet hours, collapse duplicates, daily digest option, no spam. Motivation/greetings are minimal and driven by real data (completed tasks, milestones), not gimmicks.

## 8. Calendar rules

- Real internal calendar, with **optional** Google Calendar sync later (import first, two-way last).
- Conflict detection = deterministic overlap check over events + scheduled tasks, accounting for duration.
- Recurring items via RRULE; materialize instances lazily within a window.

## 9. Security requirements

- OAuth scopes: `read`, `write`, `destructive`; short-lived access tokens, refresh rotation, revocation UI.
- Per-item authorization checks in the **service layer** (not just in routes or tools).
- Treat collaborator-written and imported text as untrusted (possible prompt injection). Never let item content change tool permissions or trigger actions.
- Public skills (Phase 4) are prompt text only; installing one never grants data access, and tool permissions come only from the user's endpoint config.
- Rate limiting per token and per user; audit log of all AI-initiated writes (actorType = ai).
- Secrets only in env/secret manager; never log tokens or item bodies at info level.
- Data export and account deletion paths (plan for them early).

## 10. Web portal (minimal first)

Phase 1: login, endpoint builder (tick tools, write instructions, preview), copy URL, connection instructions for Claude/ChatGPT, token/endpoint revocation.
Phase 3+: task board, calendar view, notes list, activity feed, sharing UI.
Skills/prompt editor (rich text) and marketplace: Phase 4 only.

## 11. Coding conventions

- Monorepo: `apps/server`, `apps/portal`, `packages/shared` (types, zod schemas).
- Domain-driven folders: `modules/{items,calendar,notes,notify,planner,auth,endpoints}`.
- No business logic in route/tool handlers; handlers validate → call service → format.
- Migrations versioned; seed script with realistic demo data (including a wedding-planning goal).
- Tests: unit for pure logic (conflicts, cycles, priority scoring), integration for services and MCP tool calls, **scripted AI-conversation evals** for key workflows from Phase 2.
- Lint + typecheck + tests must pass before declaring a phase task done.
- Small commits with clear messages. Document decisions in `docs/decisions/` (ADR-style, short).

---

## 12. Phased roadmap (build in order; do not skip ahead)

**Phase 1 — Workable core (≈4 weeks).** Item/Link/Activity model, OAuth, MCP server with endpoint registry and enforced allowlists, "Daily Assistant" endpoint (~6 tools: `get_daily_brief`, `create_task`, `update_task`, `list_tasks`, `log_decision`, `link_tasks`), soft delete, activity log, minimal portal. *Exit:* connected to Claude as a custom connector and used for real for 7 days.

**Phase 2 — Time & notifications (≈4 weeks).** Calendar + RRULE + timezones, `check_conflicts`/`find_free_slot`, reminder engine (BullMQ → Telegram/email), dependency/blocked logic, `explain_delay`, second endpoint ("Project/Wedding Planner", ~10 tools), optional Google Calendar import. *Exit:* reminder arrives on phone on time; conflict check catches a real clash.

**Phase 3 — Knowledge & collaboration (≈6 weeks).** Notes + full-text search, summary-first retrieval with token budgets, sharing/assignment/roles, security hardening (scopes, two-step destructive confirmation, audit viewer, rate limits, injection defenses), fuller portal UI. *Exit:* a second person works on a shared goal and sees nothing ungranted.

**Phase 4 — Advanced & ecosystem.** First-party skill/workflow templates (Daily, Wedding, Software PM, Goal Coach, Business Ops), smarter priority scoring and weekly review, optional server-side scheduled AI briefs (only with a cost/billing plan), semantic search, two-way Google Calendar, public skill sharing with moderation and versioning, public API/webhooks, evals + analytics + billing. *Exit:* non-technical users onboard unaided; pricing defined.

---

## 13. Out of scope (for now)

Native mobile apps, offline sync, real-time multi-user editing, AI-generated task spam, full email client, marketplace before Phase 4, custom auth/crypto, microservices.

## 14. Open decisions (ask me; do not assume)

1. Postgres vs MongoDB final call.
2. First notification channel: Telegram vs WhatsApp.
3. Hosting target and budget.
4. Pricing/target user (personal vs families/event planners vs teams).
5. Which real project I dogfood on in Phase 1.

## 15. Definition of done (per task)

Code + tests + types pass; inputs validated; permissions enforced in the service layer; activity logged; no secrets or PII in logs; short note in `docs/` if a decision was made; summary of what changed and what's next.

---

## 16. How to start

1. Confirm you've read this document and list any contradictions or risks you see (max 10 bullets).
2. Propose the repo structure, docker-compose, and migration plan for **Phase 1 only**.
3. Wait for my "go", then implement in small steps, running tests as you go.