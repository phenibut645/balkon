# Balkon Architecture Plan

This document defines a practical target architecture for the Balkon ecosystem before adding major new features.

It covers three repositories:

- `phenibut645/balkon` - backend, REST API, Discord bot, database migrations, business logic, OBS relay
- `phenibut645/balkon-website` - Next.js dashboard frontend
- `phenibut645/balkon-obs-agent` - local Windows OBS Agent

The goal is not a rewrite. The goal is to reduce risk, improve clarity, and create a stable structure for gradual refactoring.

---

## Goals

- Reduce coupling between routes, services, SQL, and external APIs.
- Make business rules explicit and testable.
- Centralize critical write flows such as member creation and economy mutations.
- Improve traceability for how records are created and changed.
- Make future feature work safer without over-engineering the system.

## Non-Goals

- Do not rebuild the whole project around a heavy framework.
- Do not introduce microservices.
- Do not split the backend into many deployables.
- Do not block feature delivery on a full rewrite.

---

## 1. Core Principle

## Feature/domain-based layered architecture

The target architecture is a feature-based layered architecture.

Each major domain owns its own application logic, domain rules, and data access boundaries. Shared infrastructure stays in common folders, but business behavior should live near the domain that owns it.

This means:

- code is organized primarily by business capability, not by technical type alone
- each domain exposes clear service entry points
- write paths become easier to audit and secure
- large MVP-era files are split by responsibility, not only by file size

Recommended domains:

- member
- auth
- economy
- inventory
- market
- notifications
- guilds
- streamers
- obs
- jobs
- admin
- audit

---

## 2. Backend Layering

Target backend dependency direction:

`routes/controllers -> application services -> domain services -> repositories -> database/external APIs`

### Layer responsibilities

#### Routes / controllers

- Parse request input.
- Validate request shape and access requirements.
- Call application services.
- Map result to HTTP response shape.
- Must stay thin.

#### Application services

- Coordinate one use case or workflow.
- Start transactions when a use case spans multiple writes.
- Call domain services and repositories.
- Enforce use-case level authorization and orchestration.

Examples:

- buy market listing
- update profile
- create notification
- purchase OBS media item
- approve streamer application

#### Domain services

- Contain business rules and invariants.
- Make decisions about allowed state transitions.
- Must not know HTTP details.
- Should be reusable from API routes, bot commands, and background jobs.

Examples:

- economy balance rules
- item transfer rules
- member lifecycle rules
- permission evaluation rules

#### Repositories

- Encapsulate data access.
- Contain SQL queries and mapping between rows and domain models.
- Must not implement business policy.
- Can expose transaction-aware methods.

#### Database / external APIs

- MySQL
- Discord API and gateway objects
- OBS relay and OBS agent transport
- Twitch or other third-party APIs

---

## 3. Responsibility Rules

The following rules should become project-wide guardrails.

### Route and command rules

- [ ] Routes do not contain SQL.
- [ ] Commands do not contain SQL.
- [ ] Routes do not implement business rules beyond basic request validation and response mapping.
- [ ] Bot command handlers call services, not raw database helpers.

### Repository rules

- [ ] Repositories do not contain business logic.
- [ ] Repositories do not decide permissions.
- [ ] Repositories do not trigger side effects outside persistence unless explicitly designed as infrastructure adapters.

### Service rules

- [ ] Services own business rules.
- [ ] Application services orchestrate use cases.
- [ ] Domain services enforce invariants.
- [ ] Services must be reusable from API, bot, jobs, and scripts.

### Member ownership rules

- [ ] Only `MemberService` and `MemberRepository` may create `members` rows.
- [ ] No other service may insert directly into `members`.
- [ ] Discord profile cache refresh must go through the member/profile lifecycle path.

### Economy and item safety rules

- [ ] Only `EconomyService` may change balances.
- [ ] Money and item operations must use transactions.
- [ ] Cross-entity writes must be atomic where possible.
- [ ] Failed workflows must leave a clear audit trail.

### Audit rules

- [ ] Important mutations must write audit logs.
- [ ] Security-sensitive actions must always be attributable to an actor.
- [ ] Mutations triggered by jobs or system automation must identify a system actor/source.

---

## 4. Proposed Backend Folder Structure

The current backend should gradually move toward a structure like this:

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

### Practical notes

- Keep existing files working during transition.
- New code should prefer module folders first.
- Existing large services can be wrapped and gradually split instead of renamed all at once.
- Repositories may initially live beside old services if needed, but the target should be explicit repository boundaries.

---

## 5. Member/Profile Lifecycle Design

The member lifecycle must be one of the clearest parts of the system.

### Identity model

There are two different identifiers and both must remain explicit:

- internal member id: `members.id`
- Discord user id: `members.ds_member_id`

Rules:

- internal relations inside MySQL should use `members.id`
- external API and Discord-facing workflows usually start from Discord user id
- mapping between Discord user id and internal member id must be centralized

### Cached Discord profile

The `members` table is the durable profile cache for Discord identity fields.

Recommended cache fields:

- `ds_member_id`
- `discord_username`
- `discord_global_name`
- `discord_avatar`
- `discord_avatar_url`
- `discord_profile_updated_at`
- `last_seen_at`

Rules:

- cache updates should not wipe non-null values with null unless explicitly intended
- OAuth login and real Discord interaction paths should refresh cache
- cache freshness should be observable

### Lifecycle metadata

The member record should explicitly tell the system how it came to exist and what state it is in.

Recommended fields and meaning:

- `created_source`
  - examples: `oauth`, `discord_interaction`, `discord_message`, `admin_action`, `system_seed`, `economy_flow`
- `profile_status`
  - examples: `minimal`, `partial`, `complete`, `stale`, `blocked`
- `last_seen_at`
  - last confirmed activity by OAuth or Discord interaction
- `discord_profile_updated_at`
  - last refresh of profile cache

### Lifecycle rules

- [ ] A member may be created as minimal when only Discord ID is known.
- [ ] A member should be upgraded to partial or complete when real Discord profile data is seen.
- [ ] Member creation must always record source.
- [ ] Profile status should reflect whether the cached profile is usable for display.
- [ ] Raw Discord ID should be a secondary/debug identifier, not the preferred display label.

---

## 6. Database Improvement Principles

The database should evolve conservatively and add traceability first.

### Migration policy

- [ ] Use additive migrations first.
- [ ] Update both incremental migration files and baseline schema where required.
- [ ] Avoid destructive changes in early cleanup phases.
- [ ] Never edit already-applied production migrations.

### Timestamp policy

New business tables should generally have:

- `created_at`
- `updated_at`

Important lifecycle tables may also have:

- `deleted_at`
- `archived_at`
- `processed_at`
- `last_seen_at`

### Audit-first changes

Before aggressive cleanup:

- add missing trace fields
- add audit tables
- add relationship indexes
- normalize critical write paths

### Index principles

Add indexes based on real access patterns:

- foreign keys and join columns
- unique external IDs such as Discord IDs
- workflow lookup columns such as status, created_at, expires_at
- audit lookup columns such as actor_member_id and entity_type/entity_id

### Data safety principles

- [ ] No destructive migrations first.
- [ ] Prefer nullable additive columns before enforcing stricter constraints.
- [ ] Backfill data before adding stricter rules.
- [ ] Validate high-volume write paths before schema tightening.

---

## 7. Audit Logging Design

A dedicated audit capability should exist at application level.

## AuditLogService

Introduce an `AuditLogService` responsible for writing structured audit events for important mutations.

Responsibilities:

- accept structured audit events from application services
- write to audit storage in a consistent format
- attach actor, target entity, action, source, and metadata
- support transaction-aware writes when mutation and audit entry must succeed together

### `audit_logs` table idea

Possible columns:

- `id`
- `created_at`
- `actor_member_id` nullable
- `actor_discord_id` nullable
- `actor_type` such as `member`, `system`, `admin`, `job`
- `action` such as `member.created`, `balance.adjusted`, `item.listed`
- `entity_type` such as `member`, `inventory_item`, `market_listing`, `notification`
- `entity_id` nullable string or numeric reference
- `source` such as `api`, `bot_command`, `oauth`, `job`, `migration`
- `request_id` nullable
- `guild_id` nullable
- `metadata_json`

### Events to log

At minimum, log:

- member creation
- member profile upgrade/update source changes
- balance adjustments
- market purchases and cancellations
- item grants, transfers, consumptions, and bot sell actions
- admin economy adjustments
- streamer permission changes
- OBS media purchases and refunds
- notification broadcasts
- auth-sensitive admin actions

### App-level logs vs MySQL triggers

Prefer application-level audit logs for business events because:

- they can include actor identity and request context
- they can reflect intent, not just row changes
- they are easier to reason about across multi-step workflows

Use MySQL triggers only when:

- a minimal low-level safety net is required
- the event is purely data-level and context is not needed
- the team explicitly accepts the added database complexity

Recommended default:

- use app-level logging for business audit events
- avoid broad trigger-based business logic

---

## 8. Frontend Architecture for `balkon-website`

The frontend should adopt the same feature-based philosophy.

### Principles

- feature-based folders
- `page.tsx` stays thin
- data fetching and mutations move to hooks or feature services
- UI composition lives in feature components
- shared API access goes through a single client layer

### Target structure idea

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

### Frontend rules

- [ ] `page.tsx` should mainly compose feature components and route-level metadata.
- [ ] Fetching logic should live in hooks or feature API helpers.
- [ ] Shared request/response parsing should use a common API client.
- [ ] Auth/session handling should not be duplicated across pages.
- [ ] Large components should be split by feature sections, not arbitrary line count alone.

---

## 9. OBS Agent Architecture

The OBS Agent should remain a separate local application, but internal responsibilities should be clearer.

### Target parts

- relay client
- OBS client
- config manager
- secure storage
- local UI layer
- status/reporting module

### Responsibility split

#### Relay client

- maintains backend/relay connection
- handles reconnect, heartbeat, auth token usage
- converts transport payloads into internal commands

#### OBS client

- wraps obs-websocket operations
- knows scenes, sources, media control, reconnect state
- should not own desktop UI concerns

#### Config manager

- loads and validates persisted settings
- exposes typed configuration
- isolates environment and local file storage details

#### Secure storage

- stores agent tokens or sensitive local credentials
- should not leak secrets to logs or UI

#### UI layer

- desktop screens and status display only
- reacts to state from services
- does not implement transport protocol logic

### OBS Agent rules

- [ ] transport code stays separate from OBS command logic
- [ ] sensitive values use secure storage path when practical
- [ ] UI should consume state, not own connection side effects directly

---

## 10. Refactoring Roadmap

The roadmap is incremental and practical.

## Phase 0: diagnostics and guardrails

- [ ] Add architecture documentation and contribution rules.
- [ ] Add scripts for member/profile diagnostics and flow inspection.
- [ ] Identify high-risk write paths.
- [ ] Add build, lint, and focused validation expectations for refactors.

## Phase 1: member/profile hardening

- [ ] Centralize member creation and profile sync.
- [ ] Introduce lifecycle metadata such as `created_source` and `profile_status`.
- [ ] Make member creation path auditable.
- [ ] Remove remaining direct `members` inserts outside the member module.

## Phase 2: repository/service layer

- [ ] Introduce repositories for high-change domains first.
- [ ] Move SQL out of routes and command flows.
- [ ] Normalize application service entry points for API and bot usage.
- [ ] Reduce direct `pool.query` usage spread across unrelated services.

## Phase 3: economy/inventory/market transaction safety

- [ ] Wrap balance and item mutations in transaction-aware application services.
- [ ] Define rollback behavior for multi-step failures.
- [ ] Guarantee atomic market buy/sell/list/cancel paths.
- [ ] Guarantee atomic OBS purchase and refund paths where possible.

## Phase 4: `ItemService` split

Split oversized `ItemService.ts` into clearer services such as:

- `ItemCatalogService`
- `InventoryService`
- `MarketService`
- `BotShopService`
- `CraftService`
- `ItemAdminService`

Checklist:

- [ ] Preserve existing API shapes during split.
- [ ] Move SQL into repositories.
- [ ] Keep each service aligned to one domain responsibility.

## Phase 5: dashboard API cleanup

- [ ] Continue extracting route groups into small route modules.
- [ ] Standardize request validation and service error mapping.
- [ ] Keep `registerDashboardRoutes(app)` as a composition layer only.
- [ ] Clarify security boundaries per route group.

## Phase 6: website split

- [ ] Break large pages into feature folders.
- [ ] Introduce shared API client and feature hooks.
- [ ] Reduce cross-page duplication.
- [ ] Keep SSR/client boundaries explicit.

## Phase 7: audit/security/performance hardening

- [ ] Add structured audit logging for important mutations.
- [ ] Make permission boundaries explicit per module.
- [ ] Add missing indexes and high-value performance improvements.
- [ ] Improve observability for failures and retries.
- [ ] Add more focused tests around critical workflows.

---

## 11. Rules for Future Features

Every new feature should follow these rules.

### Feature design rules

- [ ] Start with the owning domain.
- [ ] Define service entry points before adding route code.
- [ ] Prefer extending an existing module over scattering logic into shared utilities.
- [ ] Add repository methods instead of embedding SQL in services or routes.

### Write safety rules

- [ ] If a feature changes money, items, permissions, or member lifecycle, design transaction behavior first.
- [ ] If a feature changes important state, define audit requirements first.
- [ ] If a feature introduces a new actor path, define permission boundaries first.

### API and bot rules

- [ ] Keep API response shapes stable unless there is a deliberate versioned change.
- [ ] Keep bot command handlers thin.
- [ ] Shared business rules should be reused by both API and bot flows.

### Schema rules

- [ ] Prefer additive migrations.
- [ ] Add indexes for new lookup paths.
- [ ] Avoid premature destructive cleanup.

### Frontend rules

- [ ] Add feature folders for new dashboard capabilities.
- [ ] Keep pages thin and move behavior into hooks/components.
- [ ] Reuse shared API client and shared request handling.

---

## Decision Summary

The target architecture for Balkon is:

- one backend codebase with clearer module boundaries
- feature/domain-based layering
- centralized member lifecycle ownership
- centralized economy mutation ownership
- transaction-safe money and item workflows
- repository-based SQL access
- audit logging for important state changes
- thinner dashboard routes and thinner frontend pages
- clearer OBS Agent internal separation

This plan should be used as the baseline architecture reference before major new features are added.
