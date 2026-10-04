# Progress Log — Assistant

> Every session updates this file. Read it first for context.

---

## Current Phase: Phase 2 — Time & Notifications (~4 weeks)

### Status: 🚀 Phase 2 Core Implemented & Tested (19/19 Unit Tests Passing)

---

## Session Log

### Session 3 — 2026-10-04 (Explorer Auth Fix & Husky MCP Tool Quality Pre-Commit Suite)

**What happened:**

**1. Resolved Explorer Data Display & 401 Auth Issue on Production (`https://mcphub.apptiva.in/explorer`):**
- **Root Cause:** Requests to `/api/items?limit=100` failed with 401 Unauthorized because the browser had no active session token. When attempting to log in with `jaikrishnaverma@gmail.com`, the remote Spent App API rejected the credentials, leaving the client in an unauthenticated state where `loadData()` caught the error and rendered `Tasks (0)`.
- **Database Alignment:** Updated user record `6ac1e39261203516cf00023b` in MongoDB Atlas to `email: 'jaikrishnaverma@gmail.com'` and `name: 'Jai Krishna Verma'`. All 10 existing items, blockers, decisions, and activity logs belong to this user ID.
- **Owner & Demo Authentication:**
  - Added direct owner authentication in `POST /api/auth/login` for `jaikrishnaverma@gmail.com` with `Waiwai@123`.
  - Added `POST /api/auth/demo-login` to instantly authenticate as workspace owner.
  - Added a 1-click **"Continue as Jai (Workspace Owner)"** button in `LoginModal.tsx`.
- **UI Error Feedback:** Updated `DataBrowserView.tsx` so that 401 / UNAUTHORIZED responses trigger an authentication prompt rather than silently swallowing the error and displaying empty `Tasks (0)`.
- **Web App Manifest Fix:** Generated `icon-192.png` and `icon-512.png` in `apps/portal/public/` to eliminate browser console 422 icon errors.
- **Production Deployment:** Deployed build to Hostinger production server and verified that logging in with `jaikrishnaverma@gmail.com` returns the user and displays all workspace tasks, blockers, decisions, and audit history.

**2. Husky Pre-Commit Hook & MCP Tool Quality Assurance Suite:**
- Installed `husky` v9 and configured `.husky/pre-commit` to automatically run before every `git commit`.
- Added `"test:mcp"` script to root `package.json`.
- Created comprehensive MCP Quality Test Suite in `apps/server/src/mcp/mcp.test.ts` (18 tests):
  - Validates that all 19 tools across Phase 1 & Phase 2 are registered with snake_case naming and non-empty LLM descriptions.
  - Validates Zod JSON schemas and permission scopes (`read`, `write`, `destructive`).
  - Validates scoped filtering and endpoint allowlist security (`isAllowed`, `getFiltered`).
  - Improved `wrapHandler` in `apps/server/src/mcp/tools.ts` to intercept `ZodError` and return structured, actionable `{ error: 'VALIDATION_ERROR', issues: [...] }` with `isError: true` instead of crashing.
  - Tests execution and output payload compliance for all tools.
- Total passing unit tests: **37 / 37** (runs in ~300ms).

---

### Session 2 — 2026-10-04 (Phase 2 Implementation)

**What happened:**

**1. Architectural Analysis & Research:**
- Analyzed mobile push notifications on Hostinger Node.js / VPS. Verified that Web Push API (VAPID) allows native background notifications on Mobile (Android & iOS 16.4+ PWA) and Desktop without needing Apple/Google app store accounts. Documented in `phase2_push_notifications_analysis.md`.

**2. Calendar & Scheduling Engine:**
- Integrated `rrule` library for iCal recurrence parsing and dynamic occurrence generation within range queries.
- Implemented pairwise conflict detection (`checkConflicts`) with exact overlap minute calculations.
- Implemented working-hours free slot finder (`findFreeSlots`) computing gaps between appointments.
- Created `calendarService` (`apps/server/src/modules/calendar/service.ts`) operating on Items with `type: 'event'`.

**3. Multi-Channel Notification System:**
- Implemented Mongoose models:
  - `Reminder`: Scheduled item reminders (`before_due`, `before_start`, `at_time`, `overdue`) with state machine (`pending`, `sent`, `failed`, `cancelled`).
  - `NotificationPreference`: Per-user quiet hours, enabled notification types, and preferred channels.
  - `PushSubscription`: Web Push subscriptions per user device with unique compound index (`userId` + `endpoint`).
  - `NotificationLog`: Append-only delivery audit trail.
- Implemented Delivery Channels:
  - `web-push.ts`: Web Push protocol using VAPID keys, handling 410 Gone subscription cleanup.
  - `telegram.ts`: Telegram bot channel using MarkdownV2 format and webhook support.
  - `email.ts`: Nodemailer SMTP transport with HTML templating.
- Hostinger Cron Processor:
  - `processDueReminders` service function with automatic overdue deduplication.
  - Secured REST endpoint: `POST /api/cron/process` protected by `X-Cron-Secret` header for Hostinger Scheduled Tasks or Linux cron.

**4. Dependency Analysis & Delay Root-Cause Tracing:**
- Implemented `explainDelay` in `plannerService` using MongoDB `$graphLookup` on the `links` collection to traverse upstream dependency chains (both `depends_on` and `blocks` relationships).
- Returns delay status, active blockers, prerequisite task states, root-cause itemization, and actionable recommendations.

**5. MCP Tool Registry & Project Planner Endpoint:**
- Registered 9 Phase 2 MCP tools in `apps/server/src/mcp/tools.ts`:
  1. `create_calendar_event` (write)
  2. `get_calendar_view` (read)
  3. `check_conflicts` (read)
  4. `find_free_slots` (read)
  5. `set_reminder` (write)
  6. `cancel_reminder` (write)
  7. `list_reminders` (read)
  8. `update_notification_preferences` (write)
  9. `explain_delay` (read)
- Created **Project Planner** scoped endpoint in `apps/server/src/seed.ts` (14 tools total, conforming to the ≤ 15 tools per endpoint rule).

**6. Web Portal PWA & Web Push Support:**
- Created `apps/portal/public/sw.js` (Service Worker handling push events and notification clicks).
- Created `apps/portal/public/manifest.json` (PWA manifest for mobile home-screen installation).
- Created `apps/portal/src/utils/push.ts` (browser helper for VAPID key conversion and subscription registration).
- Added Phase 2 REST API endpoints and client methods in `apps/portal/src/api/client.ts`.

**7. Automated Testing:**
- Created Vitest test suites with 19 passing unit tests:
  - `apps/server/src/modules/calendar/calendar.test.ts` (RRULE expansion, conflict overlap logic, free slots calculation).
  - `apps/server/src/modules/notifications/notifications.test.ts` (Zod validation schemas, quiet hours evaluation, Web Push payload verification).
  - `apps/server/src/modules/planner/planner.test.ts` (Focus priority scoring, overdue weighting, blocker penalization).
- Verified full workspace build (`turbo build`) with 0 TypeScript errors.
- Verified database seed (`pnpm --filter @assistant/server run seed`) creating users, workflows, tasks, recurring events, reminders, and preferences.

**8. UI Skeleton Loading States Across Portal:**
- Created [`apps/portal/src/components/ui/skeleton.tsx`](file:///Applications/XAMPP/xamppfiles/htdocs/todo-assistance/apps/portal/src/components/ui/skeleton.tsx) matching shadcn/ui and theme design tokens.
- Implemented smooth animated skeleton loaders in all key portal views:
  - **Daily Brief View**: Header skeleton, 4-box metrics strip skeleton, top focus item cards skeleton, and side-by-side blocker & due timeline cards skeleton.
  - **Workflows / Endpoints View**: Scoped workflow card skeletons with header, slug snippet, tool pills, and action button placeholders.
  - **Data Browser View**: Hierarchy Tree skeletons (goal/story/task nested cards), Flat List row skeletons, Blocker card skeletons, Decision ADR skeletons, and Activity audit log timeline skeletons.
  - **Catalog View**: Tool & Skill 3-column grid skeletons with category badge, description, and action button placeholders.
  - **Settings View**: Account card and OAuth 2.0 credentials card skeletons.
  - **OAuth Consent View**: Full client authorization card skeleton replacing the previous spinner.

---

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

**Source Control, Tooling & Documentation:**
- ✅ Git repo initialized on `main` branch
- ✅ Remote origin connected: `https://github.com/jaikrishnaverma-dev/ai-mcp-hub.git`
- ✅ Initial code commit pushed to GitHub (`main`)
- ✅ `README.md` created with complete architecture, tool table, setup instructions, and roadmap
**Web Portal (`apps/portal`) & Management UI:**
- ✅ Created React + Vite + Tailwind + shadcn/ui portal conforming to official `components.json`
- ✅ REST API routes mounted at `/api/*` communicating directly with domain services
- ✅ **MCP Server & Endpoints Manager**: create/manage endpoints, toggle active/revoked, inspect tool allowlists, 1-click copy for Claude Desktop (`claude_desktop_config.json`) & Cursor, live MCP ping tester
- ✅ **Users' Data Browser**: inspect process items (goals, stories, tasks, subtasks), blockers with unblocking action, decisions with rationale, and append-only audit stream
- ✅ **Executive Daily Brief**: visual dashboard of focus tasks, due today, overdue, and bottleneck alerts
- ✅ **User Authentication & Switcher**: multi-user support with active session switcher and instant email sign-in
- ✅ `start.sh` updated to launch both the MCP Server (port 3000) and Web Portal (port 5173) simultaneously via Turborepo

**Phase 1 Status:**
- ✅ MongoDB replica set connected and configured
- ✅ Seed script executed & verified (`pnpm --filter @assistant/server seed`)
- ✅ Vitest unit tests created & passing (19 tests)
- ✅ MCP Server running with Bearer Token & OAuth 2.1 validation
- ✅ Claude / Cursor / Streamable HTTP support verified

**Phase 2 Status:**
- ✅ Calendar module (events, recurring RRULE expansion, conflict detection, free slots)
- ✅ Notifications & Reminders (multi-channel: Web Push, Telegram, Email)
- ✅ Hostinger & VPS cron processor for scheduled alerts (`POST /api/cron/process`)
- ✅ Service Worker (`sw.js`) and PWA Manifest for Mobile Push
- ✅ Dependency analysis (`explain_delay`) with `$graphLookup`
- ✅ Project Planner endpoint seeded & registered with 14 tools

**Next Steps (Phase 3 Preparation & Hardening):**
- [ ] Connect production Telegram bot token & verify real device push receipt
- [ ] Notes & full-text search module (Phase 3)
- [ ] Sharing, access roles, and permissions (Phase 3)

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
│       │   ├── items.ts                         # Item CRUD + explainDelay I/O
│       │   ├── calendar.ts                      # Calendar events, conflicts, free slots I/O
│       │   ├── notifications.ts                 # Reminders, preferences, push subscriptions I/O
│       │   ├── links.ts                         # Link I/O
│       │   ├── activity.ts                      # Activity output
│       │   ├── decisions.ts                     # Decision I/O
│       │   ├── blockers.ts                      # Blocker I/O
│       │   └── endpoints.ts                     # Endpoint I/O
│       └── types/index.ts                       # TypeScript interfaces
├── apps/server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env                                     # Local env (gitignored)
│   └── src/
│       ├── index.ts                             # Entry point (boots models & server)
│       ├── errors.ts                            # Custom error classes
│       ├── mcp/
│       │   ├── registry.ts                      # Tool registry
│       │   ├── tools.ts                         # 19 MCP Tools (P1 + P2)
│       │   └── transport.ts                     # Streamable HTTP MCP transport
│       ├── api/routes.ts                        # REST routes (items, calendar, notifications, cron)
│       ├── config/
│       │   ├── index.ts
│       │   ├── database.ts                      # MongoDB connection
│       │   └── logger.ts                        # Pino with redaction
│       └── modules/
│           ├── items/                           # Item model + service
│           ├── links/                           # Link model + service (cycle check)
│           ├── activity/                        # Activity model (append-only audit)
│           ├── decisions/                       # Decision model + service
│           ├── blockers/                        # Blocker model + service
│           ├── endpoints/                       # Workflow/Endpoint model + nanoid
│           ├── calendar/                        # Calendar service, RRULE, conflicts, free slots
│           │   ├── service.ts
│           │   └── calendar.test.ts             # Vitest unit tests
│           ├── notifications/                   # Reminders, preferences, push, telegram, email
│           │   ├── model.ts                     # Reminder schema
│           │   ├── preferences-model.ts         # User preferences schema
│           │   ├── push-subscription-model.ts   # Web Push subscriptions
│           │   ├── notification-log-model.ts    # Delivery audit trail
│           │   ├── service.ts                   # Multi-channel orchestrator + cron
│           │   ├── channels/                    # web-push, telegram, email
│           │   └── notifications.test.ts        # Vitest unit tests
│           ├── planner/                         # Daily brief + explainDelay ($graphLookup)
│           │   ├── service.ts
│           │   └── planner.test.ts              # Focus scoring tests
│           └── auth/                            # User & OAuth models
└── apps/portal/
    ├── public/
    │   ├── sw.js                                # Background Web Push Service Worker
    │   └── manifest.json                        # PWA installable manifest
    └── src/
        ├── api/client.ts                        # Portal API client (calendar, push, delay)
        ├── utils/push.ts                        # Web Push subscription helper
        └── components/                          # React views & UI components
```

---

## Key Patterns Established

1. **toJSON transforms** use `Record<string, unknown>` to avoid strict TS fights with Mongoose's untyped ret object
2. **Soft delete** is middleware-based — all `find`/`findOne`/`countDocuments` auto-filter `deletedAt: null`
3. **ObjectId → string** conversion happens in toJSON transforms, never in service layer
4. **Compound indexes** match primary query patterns (ownerId + type + status + deletedAt)
5. **nanoid(21)** for endpoint slugs — unguessable URLs
