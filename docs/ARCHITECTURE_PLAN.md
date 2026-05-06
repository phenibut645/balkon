# Balkon Architecture Plan / Закон Balkon

This document is the architecture law for the Balkon ecosystem.

It is not a suggestion document. It defines the rules that humans, Copilot, AI assistants, and future refactoring work must follow before adding major new features.

Balkon is a multi-component system:

- `phenibut645/balkon` - backend, REST API, Discord bot, MySQL database, migrations, business logic, OBS relay, command queue
- `phenibut645/balkon-website` - Next.js dashboard frontend
- `phenibut645/balkon-obs-agent` - local Windows OBS Agent

The goal is not a rewrite. The goal is stabilization, architecture hardening, traceability, security, and safe incremental refactoring.

---

## 0. Law Status

This file is the baseline reference for all future Balkon work.

Every non-trivial PR should be checked against this document.

Copilot and AI-generated changes must follow this document. If a generated change violates this document, the change must be rejected or rewritten.

### Core rule

```text
No blind refactor.
No feature growth on top of uncontrolled write paths.
No SQL in routes or Discord command handlers.
No direct money/item/member lifecycle mutation outside the owning service/module.
```

### Stabilization phase rule

Until the high-risk paths are hardened, do not add major product features except diagnostics, documentation, validation tooling, and small architecture-safe extractions.

Allowed during stabilization:

- diagnostics
- architecture documentation
- inventory documents
- additive migrations
- small safe extractions
- member lifecycle hardening
- economy/inventory transaction safety work
- audit logging foundation
- security review
- build/manual validation improvements

Not allowed during stabilization:

- large rewrites
- blind file splitting
- destructive migrations
- new economy/market/shop/jobs/OBS product features on top of unsafe paths
- mass renaming
- deleting legacy layers before callers are mapped

---

## 1. Verified Current State

This section records facts verified from the current repository state during the architecture reset.

### Backend entry points

- `src/api/server.ts` is the Fastify API entry point.
- API routes are registered under `/api`.
- The API currently registers base routes, Discord OAuth routes, dashboard routes, and bridge routes.
- `src/events/interactionCreate.ts` is a Discord interaction adapter.
- `src/events/messageCreate.ts` is a Discord message adapter.

### Current API route structure

The dashboard API is partially extracted:

- `src/api/routes/dashboardRoutes.ts`
- `src/api/routes/dashboard/profileRoutes.ts`
- `src/api/routes/dashboard/notificationRoutes.ts`
- `src/api/routes/dashboard/marketRoutes.ts`
- `src/api/routes/dashboard/inventoryRoutes.ts`
- `src/api/routes/dashboard/jobRoutes.ts`
- `src/api/routes/dashboard/craftExecutionRoutes.ts`
- `src/api/routes/dashboard/streamerStudioRoutes.ts`
- `src/api/routes/dashboard/adminStreamerRoutes.ts`
- `src/api/routes/dashboard/streamerApplicationRoutes.ts`

`dashboardRoutes.ts` is still not a pure composition layer. It still contains route handlers, validation, and response mapping for multiple dashboard/admin/OBS/item endpoints.

### Current service/data-access state

`src/core/*` is currently a mixed layer. Many core files contain service logic, SQL, mapping, transaction handling, and side effects in the same file.

Confirmed files with direct `pool.query` usage include, but are not limited to:

- `src/core/MemberService.ts`
- `src/core/DiscordMetadataService.ts`
- `src/core/DataBaseHandler.ts`
- `src/core/ItemService.ts`
- `src/core/EconomyService.ts`
- `src/core/ShopObsService.ts`
- `src/core/JobService.ts`
- `src/core/NotificationService.ts`
- `src/core/UserProfileService.ts`
- `src/core/GuildDashboardService.ts`
- `src/core/ObsService.ts`
- `src/core/ObsRelayService.ts`
- `src/core/ObsMediaActionService.ts`
- `src/core/BotCommandQueue.ts`
- `src/api/auth/apiSessionService.ts`

This confirms that repository boundaries are not yet established.

### Current member lifecycle findings

Confirmed facts:

- `src/core/MemberService.ts` exists.
- OAuth session creation calls `memberService.ensureMemberFromDiscordProfile(...)` before inserting `api_sessions`.
- `interactionCreate.ts` and `messageCreate.ts` call `memberService.ensureMemberFromDiscordProfile(...)` when a Discord.js user is available.
- `DataBaseHandler.isMemberExists(...)` still exists as a legacy member/guild-member bootstrap path.
- `MemberService.ensureMemberByDiscordId(...)` currently uses an `INSERT ... ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)` pattern.
- `DiscordMetadataService.upsertMemberDiscordProfile(...)` currently performs `INSERT INTO members ... ON DUPLICATE KEY UPDATE`, which means it can create `members` rows outside `MemberService`.

Therefore, the member lifecycle is improved but not yet hardened.

### Current economy findings

Confirmed facts:

- `EconomyService` exists.
- `EconomyService.adjustMemberBalanceByAdmin(...)` performs a transaction and writes `admin_economy_adjustments`.
- `EconomyService` still resolves members through `ItemService.getInstance().ensureMemberByDiscordId(...)` in some flows.
- `ShopObsService` directly debits and refunds `members.balance`.
- `JobService.runJob(...)` directly increments `members.balance` inside its own transaction.
- `ItemService` still participates in inventory/market/shop/craft/economy workflows and likely contains more direct money/item mutations.

Therefore, the rule "Only EconomyService may change balances" is not yet satisfied.

### Current database findings

The database is MVP-grown but not unusable.

Good signs:

- many tables have foreign keys
- many newer tables have timestamps and indexes
- `schema_migrations` exists
- jobs, notifications, OBS media actions, streamer access, and streamer services are more structured than older tables

Confirmed risks:

- `members` is overloaded with identity, Discord profile cache, economy balances, locale, home guild, and profile description
- `members` lacks lifecycle metadata such as `created_at`, `updated_at`, `created_source`, `discord_profile_status`, and `last_seen_at`
- money/price types are inconsistent: `INT`, `FLOAT`, `DECIMAL`, and `BIGINT` are all used across economy-related tables
- no general `audit_logs` table exists
- no general economy ledger exists
- `api_sessions` stores OAuth access/refresh tokens in database fields and requires security review
- `bot_settings` is a generic key/value table and must not become uncontrolled domain config or plaintext secret storage

---

## 2. Core Architecture Principle

Balkon uses feature/domain-based layered architecture.

Target dependency direction:

```text
routes/controllers
  -> application services
  -> domain services
  -> repositories
  -> database / external APIs
```

API routes and Discord bot handlers are adapters. They are not the business layer.

The same business use case should be callable from API, Discord bot, jobs, scripts, or tests without duplicating rules.

```text
Fastify API route
  -> use case / application service
  -> domain services
  -> repositories

Discord command/event
  -> use case / application service
  -> domain services
  -> repositories
```

API and Discord bot may differ in input parsing and response formatting. They must not diverge in business rules.

---

## 3. Layer Responsibilities

### Routes / controllers

Allowed:

- parse request params/body/query
- validate request shape
- read auth context
- call application services
- map service result to HTTP response

Forbidden:

- SQL
- raw database transactions
- direct member creation
- direct balance mutation
- direct inventory mutation
- business rules beyond basic request validation

### Discord events / commands / interactions

Allowed:

- parse Discord interaction/message input
- resolve Discord actor/guild/channel context
- call application services
- send Discord replies/followups

Forbidden:

- SQL
- direct database mutations
- direct member creation outside member lifecycle service
- direct balance/item mutations
- duplicated business rules already used by API

### Application services

Allowed:

- orchestrate a use case
- enforce use-case authorization
- open transactions for multi-write workflows
- call domain services and repositories
- call `AuditLogService`
- coordinate external side effects after durable state is correct

### Domain services

Allowed:

- enforce business rules and invariants
- validate state transitions
- calculate domain outcomes

Forbidden:

- Fastify request/reply objects
- Discord.js interaction/message objects
- raw SQL

### Repositories

Allowed:

- SQL
- row mapping
- transaction-aware persistence methods

Forbidden:

- permission decisions
- business policy
- Discord/Fastify response behavior

---

## 4. Ownership Rules

### Member ownership

```text
Only MemberService / future MemberRepository may create members rows.
```

Rules:

- no route may insert into `members`
- no Discord command/event may insert into `members`
- no generic service may insert into `members`
- `DiscordMetadataService` must not create members
- `ItemService` must not be a member resolving/creation owner
- `DataBaseHandler` must not remain the primary member lifecycle path

Allowed member flows:

- create minimal member when only Discord ID is known
- upgrade member profile when Discord profile is available
- record creation source
- record profile status
- update last seen time

### Economy ownership

```text
Only EconomyService / future EconomyRepository may change balance or ldm_balance.
```

Rules:

- no direct `UPDATE members SET balance...` outside economy owner
- no direct `UPDATE members SET ldm_balance...` outside economy owner
- market/shop/jobs/OBS/craft/admin money mutations must go through economy ownership
- refunds must be explicit and auditable

### Inventory ownership

Inventory/item ownership changes must go through an inventory owner:

- future `InventoryService`
- future `InventoryRepository`

Rules:

- item ownership changes must be transaction-safe
- item grants/transfers/consumption must be auditable
- market listings must not mutate inventory ownership without a controlled use case

### Audit ownership

Important mutations must write application-level audit logs.

Audit is not optional for critical workflows.

---

## 5. Member/Profile Lifecycle Law

The member lifecycle is a critical system boundary.

### Identity model

There are two identifiers:

- internal member id: `members.id`
- Discord user id: `members.ds_member_id`

Rules:

- internal MySQL relations should use `members.id`
- external Discord-facing workflows may start with Discord user id
- mapping from Discord user id to internal member id must be centralized

### Profile cache

`members` currently acts as durable Discord profile cache with fields such as:

- `discord_username`
- `discord_global_name`
- `discord_avatar`
- `discord_avatar_url`
- `discord_profile_updated_at`

Rules:

- OAuth login should refresh profile cache
- real Discord interaction/message paths should refresh profile cache
- cache updates should not wipe existing non-null values with null unless explicitly intended
- raw Discord ID is a debug/secondary display fallback, not a primary user display name

### Required hardening

`MemberService.ensureMemberByDiscordId(...)` must be changed away from upsert that burns AUTO_INCREMENT.

Target behavior:

```text
SELECT by ds_member_id
  -> if found, return id
  -> if missing, INSERT minimal member
  -> if INSERT hits ER_DUP_ENTRY race, SELECT again
```

`DiscordMetadataService.upsertMemberDiscordProfile(...)` must stop creating `members` rows.

Target behavior:

```text
MemberService.ensureMemberFromDiscordProfile(...)
  -> ensure member exists through MemberService
  -> update profile cache for existing member
```

The profile update helper may update existing rows, but must not create `members` independently.

---

## 6. Database Architecture Law

Database changes must be conservative, additive first, and linked to service ownership.

### Migration rules

- use additive migrations first
- never edit already-applied production migrations
- update baseline schema when project convention requires it
- avoid destructive changes during stabilization
- backfill before tightening constraints
- do not add hard constraints until code paths are ready

### `members` table direction

`members` is currently overloaded. Do not split it immediately.

First add traceability and lifecycle metadata:

- `created_at`
- `updated_at`
- `created_source`
- `discord_profile_status`
- `last_seen_at`

Possible profile statuses:

- `minimal`
- `partial`
- `complete`
- `stale`
- `not_found`
- `sync_failed`

Backfill policy must be documented before migration is applied.

### Economy data direction

Do not move balances out of `members` first.

Correct order:

```text
centralize balance writes
  -> add audit / ledger
  -> normalize money types
  -> only then consider wallet table split
```

Money values must not use `FLOAT` long-term.

Target direction:

- use integer amounts for game currency where possible
- use one consistent type for ODM/LDM and prices
- check existing data before changing types

### Audit table direction

Introduce an application-level `audit_logs` table.

Possible columns:

- `id`
- `created_at`
- `actor_member_id`
- `actor_discord_id`
- `actor_type`
- `action`
- `entity_type`
- `entity_id`
- `source`
- `request_id`
- `guild_id`
- `metadata_json`

MySQL triggers are not the primary audit mechanism. Use application-level audit because the application knows actor, source, route, request id, business action, and context.

### Security-sensitive database rules

- OAuth access/refresh tokens require security review
- sensitive values must not be logged
- secrets should not live plaintext in generic settings tables
- `bot_settings` must not become uncontrolled domain config

---

## 7. Transaction Safety Law

The following workflows must be transaction-safe where possible:

- market purchase
- market listing creation/update/cancel when inventory/money is involved
- bot shop purchase
- OBS media purchase
- OBS media refund
- craft execution
- job reward
- item transfer
- item grant
- admin economy adjustment
- streamer permission changes
- command queue creation when tied to money/item mutation

If a workflow cannot be a single DB transaction because it involves external side effects, the durable state must still be explicit:

- pending state
- sent/completed state
- failed state
- refunded state when money was returned
- audit event for failure/refund

External side effects should generally happen after durable intent/state is created.

---

## 8. Audit Logging Law

Introduce `AuditLogService` and use it for important mutations.

Minimum events:

- `auth.oauth_login`
- `auth.session_created`
- `auth.session_revoked`
- `member.created`
- `member.profile_synced`
- `member.profile_sync_failed`
- `member.profile_not_found`
- `economy.balance_changed`
- `market.purchase_completed`
- `market.listing_created`
- `market.listing_cancelled`
- `inventory.item_given`
- `inventory.item_transferred`
- `inventory.item_consumed`
- `jobs.reward_granted`
- `obs.command_sent`
- `obs.command_failed`
- `obs.service_triggered`
- `admin.action_performed`
- `security.permission_denied`

Audit events must identify source:

- `api`
- `bot_command`
- `discord_event`
- `oauth`
- `job`
- `script`
- `system`
- `migration`

---

## 9. Security Law

Security is not a later cleanup task.

Every relevant change must consider:

- session cookie flags: `httpOnly`, `secure`, `sameSite`
- prod vs dev auth behavior
- CORS
- backend permission checks
- Discord OAuth token handling
- OBS relay authentication
- OBS Agent token/password storage
- SQL injection risks in dynamic SQL
- sensitive values in logs
- routes that rely only on frontend hiding buttons

Frontend hiding is never authorization.

Authorization must be enforced by backend/API/application services.

---

## 10. Large File Refactoring Law

No large file over roughly 500 lines should be refactored blindly.

Before refactoring a large file, create an inventory:

- methods/components
- approximate line ranges
- responsibilities
- SQL/API calls
- side effects
- current callers
- response shapes exposed to API/frontend/bot
- target service/repository/component
- extraction risk

This applies especially to:

- `src/core/ItemService.ts`
- `src/api/routes/dashboardRoutes.ts`
- large frontend `page.tsx` files
- large dashboard components

Allowed first extractions:

- pure helpers
- read-only query services
- response mappers
- small route modules with stable behavior

Forbidden first extractions:

- market purchase
- craft execution
- OBS paid action
- inventory transfer
- economy-coupled mutations
- transaction-heavy flows

---

## 11. Backend Target Structure

The backend should gradually move toward:

```text
src/
  api/
    routes/
    middleware/
    auth/
    server.ts
  bot/
    commands/
    events/
    interactions/
  modules/
    member/
      application/
      domain/
      dto/
      services/
      validators/
    auth/
      application/
      dto/
      services/
      validators/
    economy/
      application/
      domain/
      dto/
      services/
      validators/
    inventory/
      application/
      domain/
      dto/
      services/
      validators/
    market/
      application/
      domain/
      dto/
      services/
      validators/
    notifications/
      application/
      dto/
      services/
    guilds/
      application/
      domain/
      services/
    streamers/
      application/
      domain/
      services/
    obs/
      application/
      domain/
      services/
    jobs/
      application/
      domain/
      services/
    admin/
      application/
      services/
    audit/
      application/
      services/
      dto/
  repositories/
    member/
    economy/
    inventory/
    market/
    notifications/
    guilds/
    streamers/
    obs/
    audit/
  infrastructure/
    db/
    discord/
    obs/
    logging/
    queue/
  shared/
    errors/
    types/
    utils/
    constants/
```

This is a target direction, not a one-day rewrite.

Existing files may remain while they are gradually wrapped and split.

New code should prefer the target structure.

---

## 12. Frontend Law for `balkon-website`

Frontend refactor is a separate track and must not be mixed with backend stabilization PRs unless there is a strict reason.

Target principles:

- feature-based folders
- thin `page.tsx`
- no scattered raw fetch
- shared API client
- feature API helpers
- data loading/mutations in hooks
- generic UI in `shared/components`
- feature UI in `features/*/components`
- backend permissions are authoritative

Target structure:

```text
src/
  app/
    dashboard/
      profile/
        page.tsx
      market/
        page.tsx
      inventory/
        page.tsx
  features/
    profile/
      components/
      hooks/
      api/
      types/
      utils/
    market/
      components/
      hooks/
      api/
      types/
      utils/
    inventory/
      components/
      hooks/
      api/
      types/
      utils/
    notifications/
      components/
      hooks/
      api/
      types/
    streamer-studio/
      components/
      hooks/
      api/
      types/
  shared/
    api/
      client.ts
      auth.ts
      errors.ts
    components/
    hooks/
    lib/
    types/
```

Before large frontend refactor, create `docs/refactor/FRONTEND_INVENTORY.md`.

---

## 13. OBS / Relay / Agent Law

OBS workflows are high-risk because they combine money, database state, command queue, relay transport, and local OBS side effects.

Backend responsibilities:

- validate actor/permissions
- create durable command/action state
- charge/refund through economy owner
- audit command and failure/refund events
- communicate through authenticated relay/queue

OBS Agent responsibilities:

- relay client
- OBS client
- config manager
- secure storage
- local UI/status layer

OBS Agent separation target:

```text
relay connection logic != OBS websocket logic != UI state != config persistence
```

Sensitive OBS/agent tokens must not leak to logs or generic UI state.

---

## 14. Refactoring Roadmap

### Phase 0: diagnostics and guardrails

- keep this document updated
- add inventory docs
- identify high-risk write paths
- add/maintain diagnostic scripts
- require build/manual validation expectations

### Phase 1: member/profile hardening

- fix `MemberService.ensureMemberByDiscordId(...)` upsert behavior
- stop `DiscordMetadataService` from creating members
- add member lifecycle metadata
- make member creation auditable
- reduce `DataBaseHandler.isMemberExists(...)` usage
- remove member resolving from `ItemService`

### Phase 2: repository/service boundaries

- introduce repositories for member/economy/inventory/market first
- move SQL out of routes and command flows
- reduce direct `pool.query` spread across unrelated services
- keep behavior stable during extraction

### Phase 3: economy/inventory/market transaction safety

- centralize balance changes in `EconomyService`
- define refund behavior
- make market buy/list/cancel atomic where possible
- make shop/craft/jobs reward flows explicit and auditable

### Phase 4: `ItemService` split

Do not start with code.

First create `docs/refactor/ITEM_SERVICE_INVENTORY.md`.

Target future services may include:

- `ItemCatalogService`
- `InventoryService`
- `MarketService`
- `BotShopService`
- `CraftService`
- `ItemAdminService`
- `ItemSearchService`

### Phase 5: dashboard API cleanup

- continue extracting route groups
- standardize validation/error mapping
- make `registerDashboardRoutes(app)` a composition layer
- clarify security per route group

### Phase 6: website split

- create frontend inventory
- add shared API client
- extract one low-risk feature at a time
- keep pages thin

### Phase 7: audit/security/performance hardening

- add structured audit logging
- review sessions/tokens/CORS/OBS relay auth
- add indexes based on real access patterns
- add focused tests around critical workflows

---

## 15. Required Validation for PRs

Every runtime PR must report:

- exact commands run
- `npm run build` result for affected repo when applicable
- tests/lint if available
- manual validation checklist for affected flow
- files changed intentionally
- files changed unexpectedly

Docs-only PRs do not require runtime build unless they change tooling.

Critical flow validation examples:

- OAuth login creates/updates member profile cache
- Discord interaction resolves member
- no raw Discord ID is used as primary display name
- member diagnostic script still works
- balance mutation leaves expected balance
- refund path is explicit
- OBS command failure produces expected failed/refunded state

---

## 16. Copilot / AI Workflow Law

Copilot must not be asked to perform broad refactors without inventory.

Good Copilot tasks:

- create inventory docs
- list methods and line ranges
- find direct SQL usage
- find direct member/balance mutations
- move pure helpers
- extract low-risk read-only code
- preserve public signatures
- generate validation checklist

Manual senior review required:

- transaction boundaries
- economy correctness
- permission checks
- audit design
- DB migration design
- OAuth/session security
- OBS relay auth
- market/shop/craft/jobs purchase/reward flows
- response shape compatibility
- production diagnostics/backfill decisions

Prompt rule:

```text
Do not edit code until inventory is complete.
Preserve behavior and public response shapes.
Do not change unrelated files.
Run validation and summarize the diff.
```

---

## 17. First Safe PR Candidates

Current recommended order:

1. keep this document updated as Balkon Law
2. create backend inventory document
3. create database inventory document
4. fix `MemberService.ensureMemberByDiscordId(...)` upsert behavior
5. stop `DiscordMetadataService` from creating members
6. add member lifecycle additive migration plan
7. create `audit_logs` migration and `AuditLogService` MVP
8. create economy mutation inventory
9. centralize one low-risk balance mutation through `EconomyService`
10. create `ItemService` inventory

Do not start with full `ItemService` rewrite.

---

## 18. Decision Summary

Balkon target state:

- one backend codebase with clearer module boundaries
- API and Discord bot as adapters, not duplicated business layers
- feature/domain-based layering
- centralized member lifecycle ownership
- centralized economy mutation ownership
- transaction-safe money and item workflows
- repository-based SQL access
- application-level audit logging
- additive database evolution first
- thinner dashboard routes
- thinner frontend pages
- safer OBS relay/agent separation

The law is simple:

```text
Inventory first.
Small PR second.
Build and manual validation third.
No uncontrolled write paths.
No blind refactor.
```
