# Balkon Architecture Plan / Закон Balkon

This document is the architecture law for the Balkon ecosystem.

It is not a suggestion document. It defines mandatory rules for humans, Copilot, AI assistants, and future refactoring work.

Balkon is a multi-component system:

- `phenibut645/balkon` - backend, REST API, Discord bot, MySQL database, migrations, business logic, OBS relay, command queue
- `phenibut645/balkon-website` - Next.js dashboard frontend
- `phenibut645/balkon-obs-agent` - local Windows OBS Agent

The goal is not a rewrite. The goal is stabilization, architecture hardening, traceability, security, and safe incremental refactoring.

---

## 0. Law Status

This file is the baseline reference for all future Balkon work.

Every non-trivial PR must be checked against this document.

Copilot and AI-generated changes must follow this document. If a generated change violates this document, the change must be rejected or rewritten.

Core rule:

```text
No blind refactor.
No feature growth on top of uncontrolled write paths.
No SQL in routes or Discord command handlers.
No direct money/item/member lifecycle mutation outside the owning service/module.
No god files, god services, catch-all handlers, or hidden ownership.
No temporary workaround without an owner, risk note, and follow-up path.
```

During stabilization, do not add major product features except diagnostics, documentation, validation tooling, additive migrations, and small architecture-safe extractions.

---

## 1. Verified Current State

These facts were verified during the architecture reset.

### Backend/API

- `src/api/server.ts` is the Fastify API entry point.
- API routes are registered under `/api`.
- `src/events/interactionCreate.ts` is a Discord interaction adapter.
- `src/events/messageCreate.ts` is a Discord message adapter.
- `dashboardRoutes.ts` is partially extracted but still contains real route handlers, validation, and response mapping.
- Dashboard route modules already exist for profile, notifications, market, inventory, jobs, craft execution, streamer studio, admin streamers, and streamer applications.

### Current service/data-access state

`src/core/*` is currently a mixed layer. Many core files contain service logic, SQL, mapping, transaction handling, and side effects in the same file.

Confirmed direct SQL usage exists in files such as:

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

- `src/core/MemberService.ts` exists.
- OAuth session creation calls `memberService.ensureMemberFromDiscordProfile(...)` before inserting `api_sessions`.
- `interactionCreate.ts` and `messageCreate.ts` call `memberService.ensureMemberFromDiscordProfile(...)` when a Discord.js user is available.
- `DataBaseHandler.isMemberExists(...)` still exists as a legacy member/guild-member bootstrap path.
- `MemberService.ensureMemberByDiscordId(...)` currently uses an `INSERT ... ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)` pattern.
- `DiscordMetadataService.upsertMemberDiscordProfile(...)` currently performs `INSERT INTO members ... ON DUPLICATE KEY UPDATE`, which means it can create `members` rows outside `MemberService`.

Therefore, the member lifecycle is improved but not hardened.

### Current economy findings

- `EconomyService` exists.
- `EconomyService.adjustMemberBalanceByAdmin(...)` performs a transaction and writes `admin_economy_adjustments`.
- `EconomyService` still resolves members through `ItemService.getInstance().ensureMemberByDiscordId(...)` in some flows.
- `ShopObsService` directly debits and refunds `members.balance`.
- `JobService.runJob(...)` directly increments `members.balance` inside its own transaction.
- `ItemService` still participates in inventory, market, shop, craft, member, and economy workflows.

Therefore, the rule `Only EconomyService may change balances` is not yet satisfied.

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
- `api_sessions` stores OAuth access/refresh token fields and requires security review
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

### Responsibility distribution law

Balkon must not concentrate unrelated responsibilities in one file, one service, one handler, or one generic helper.

Every important domain mutation must have an explicit owner.

Forbidden:

- adding unrelated business logic to an existing large file because it is convenient;
- using generic helpers to bypass domain ownership;
- expanding `DataBaseHandler`, `ItemService`, dashboard route files, Discord command handlers, or API route files as catch-all layers;
- placing SQL or business mutations in routes, Discord commands, UI-facing handlers, or shared helpers that do not own the domain;
- creating temporary architecture without documenting owner, risk, and follow-up;
- hiding domain ownership behind names such as `utils`, `helpers`, `manager`, `handler`, or generic `service` files.

Allowed:

- keeping legacy large files temporarily during stabilization;
- creating inventory documents before splitting large files;
- extracting one low-risk responsibility at a time;
- creating temporary adapters only when they preserve behavior and have a documented removal path.

Rule:

```text
If a change does not have a clear owner, it is not ready to be implemented.
If a workaround does not have a follow-up, it is not temporary.
If a file grows because it is convenient, the design is drifting.
```

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

There are two identifiers:

- internal member id: `members.id`
- Discord user id: `members.ds_member_id`

Rules:

- internal MySQL relations should use `members.id`
- external Discord-facing workflows may start with Discord user id
- mapping from Discord user id to internal member id must be centralized
- OAuth login should refresh profile cache
- real Discord interaction/message paths should refresh profile cache
- cache updates should not wipe existing non-null values with null unless explicitly intended
- raw Discord ID is a debug/secondary display fallback, not a primary user display name

Required hardening:

```text
MemberService.ensureMemberByDiscordId(...)
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

Migration rules:

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

Security-sensitive database rules:

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
    economy/
    inventory/
    market/
    notifications/
    guilds/
    streamers/
    obs/
    jobs/
    admin/
    audit/
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

## 14. Required Validation for PRs

Every runtime PR must report:

- exact commands run
- `npm run build` result for affected repo when applicable
- tests/lint if available
- manual validation checklist for affected flow
- files changed intentionally
- files changed unexpectedly

Docs-only PRs do not require runtime build unless they change tooling.

---

## 15. Copilot / AI Workflow Law

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

## 16. Decision Summary

Balkon target state:

- one backend codebase with clearer module boundaries
- API and Discord bot as adapters, not duplicated business layers
- feature/domain-based layering
- explicit responsibility ownership instead of god files, catch-all services, or bypass helpers
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
No hidden ownership.
No undocumented temporary workaround.
```
