# DB Access Boundary

Task: KAN-60

This document records the accepted DB access boundary law from KAN-59.

It is law-level guidance for stabilization work. It does not change runtime code, schema, migrations, or ownership by itself.

Read together with:

- `docs/refactor/STABILIZATION_PLAN.md`
- `docs/refactor/DATABASE_HANDLER_USAGE_INVENTORY.md`
- `docs/refactor/DATABASE_INVENTORY.md`
- `docs/refactor/GUILD_BOOTSTRAP_INVENTORY.md`
- `docs/refactor/MEMBER_LIFECYCLE_METADATA_PLAN.md`

## 1. Accepted Direction

The accepted direction is:

- `src/core/DataBaseHandler.ts` must shrink over time.
- Raw SQL must not spread randomly across commands, events, routes, or generic helpers.
- Every table or table group should have an explicit persistence owner.
- New database access must live only in that explicit persistence owner, its accepted supporting read-model boundary, or other documented domain boundaries.
- Existing broad legacy zones may remain temporarily, but they are under sunset, not endorsement.

The project must avoid both failure modes:

- a god `DataBaseHandler.ts`
- scattered `pool.query(...)` usage across arbitrary files

## 2. Core Rule

Raw SQL belongs only in explicit persistence boundaries, infrastructure, or documented transitional legacy zones.

An explicit persistence owner may be a table repository, aggregate repository, domain service, or read-model/query service depending on the use case. It must be named and scoped tightly enough that its ownership and invariants are obvious before opening the file.

Commands, Discord events, API routes, auth/session middleware, and generic utilities must not gain new raw SQL or new generic DB helper usage.

`DataBaseHandler.ts` is a compatibility layer under sunset. It is not the future central SQL home.

## 3. Allowed Raw DB Access Layers

The following layers may contain raw SQL when the ownership is explicit:

1. Infrastructure.
   Current example: `src/db.ts` owns connection pool creation only.

2. Migrations, init, seed, and dev scripts with explicit guardrails.
   Examples: `scripts/run_migrations.mjs`, `scripts/init_schema.mjs`, demo/seed scripts that are clearly operational or non-prod scoped.

3. Named repositories or domain persistence boundaries.
   Expected forms:
   - `XRepository`
   - aggregate-focused repository when multiple tightly related tables share one owner
   - narrow persistence-focused `XService` when the repository split is not yet justified
   - `XReadModel` or `XQueryService` for cross-table read-only projections

4. Documented transitional legacy zones.
   Current accepted examples:
   - `src/core/DataBaseHandler.ts`
   - `src/core/ItemService.ts`
   - `src/core/StreamerService.ts`
   - behavior-preserving extracted guild boundaries such as `GuildRecordService`, `GuildLogSettingsService`, `GuildChannelCacheService`, `GuildRoleCacheService`, and `GuildMemberService`

Allowed does not mean preferred. Transitional zones should shrink, not accumulate new unrelated responsibilities.

## 4. Forbidden Raw DB Access Layers

The following layers must not gain new raw SQL or new generic helper calls:

- commands
- Discord events
- API routes
- auth/session middleware unless the SQL already sits inside a dedicated persistence owner
- generic utilities
- new catch-all services
- recreated generic helper wrappers such as `getFromTable`, `addRecords`, `updateTable`, `SqlHelper`, or `GenericRepository`

Examples of adapters that must stay thin:

- `src/commands/*.ts`
- `src/events/*.ts`
- `src/api/routes/**/*.ts`
- middleware or request hooks that are not the dedicated owner of a persistence surface

## 5. Naming Guidance

Preferred naming:

- `XRepository` for persistence ownership and table-level writes/reads
- `XService` for business logic or use-case orchestration
- `XReadModel` or `XQueryService` for cross-table read-only projections

Avoid these patterns:

- `BaseRepository`
- `GenericRepository`
- `SqlHelper`
- `DataBaseHandler 2.0`
- recreated `DataBaseHandler`-style wrappers
- unnamed broad services that silently own multiple unrelated tables

Naming must make the ownership boundary obvious before opening the file.

## 6. No Runtime Cycle Rule

New persistence boundaries must not introduce runtime import cycles.

Rules:

- a new boundary may use type-only imports from legacy result types during stabilization
- a new boundary must not runtime-import `DataBaseHandler` just to inherit generic helper behavior
- a service that extracts logic out of `DataBaseHandler` must own its own SQL locally or through other explicit boundaries

This rule already shaped accepted extractions such as `GuildRecordService`, `GuildLogSettingsService`, `GuildChannelCacheService`, `GuildRoleCacheService`, and `GuildMemberService`.

## 7. No Cross-Domain Write Rule

A persistence owner may write only the tables it clearly owns, plus tightly scoped join or lookup tables that belong to the same boundary.

It must not silently become a cross-domain writer.

Examples:

- `MemberService` may own lifecycle creation and activity writes for `members`
- `DiscordMetadataService` may update Discord profile cache fields on `members` after member existence is ensured
- `GuildMemberService` may own the interaction guild-member join write path without taking over guild bootstrap orchestration or member profile writes
- `GuildChannelCacheService` and `GuildRoleCacheService` remain limited to their cache surfaces and documented stale cleanup behavior

If a change requires writing across multiple domains, the PR must first identify which service is the use-case owner and which boundaries it is allowed to call.

## 8. DBResponse Transition Rule

The current `DBResponse` and legacy error shape may be preserved during stabilization when a small PR needs compatibility.

Temporary allowed patterns:

- type-only imports from `src/core/DataBaseHandler.ts` for `DBResponse` types
- local result helpers that preserve the current response shape while a boundary is being extracted
- explicit `response.success` checks at adapter boundaries

Temporary does not mean permanent. Over time:

- `DBResponse` and generic error helpers should move to a neutral shared module
- runtime coupling to `DataBaseHandler` should be removed
- domain boundaries should stop depending on a legacy DB singleton for their own SQL

## 9. Schema And Table Change Safety Checklist

Before changing a table, columns, or write path:

1. Identify the current write owner.
2. Identify the target write owner if ownership is being clarified.
3. Identify known read-model consumers.
4. Search raw SQL references to the table and touched columns.
5. Search generic `DataBaseHandler` usage for the same table or columns.
6. Align any migration with `sql/tables.sql`.
7. Preserve old rows with an additive/backfill-safe plan.
8. Check whether existing runtime code relies on nullable, duplicate-prone, or legacy rows.
9. Document any temporary compatibility boundary before implementation.

If the write owner is unclear, inventory first and stop the implementation task.

## 10. PR Checklist For New DB Code

Every PR that introduces or changes DB access should answer:

1. Which service or repository owns this write?
2. Why is this file the correct persistence boundary?
3. Does this add SQL to an adapter, generic utility, or catch-all service?
4. Does this introduce a new runtime import cycle?
5. Does this cross into another domain's write surface?
6. Does this preserve existing response shapes when required?
7. Did the PR search both raw SQL references and generic `DataBaseHandler` usage for the touched table?
8. Does the PR preserve old rows and migration safety constraints?
9. Is the change additive and behavior-preserving where required?
10. Are transitional exceptions called out explicitly instead of hidden?

## 11. Accepted Transitional Boundaries

These boundaries are currently accepted during stabilization, with caveats:

| Boundary | Current role | Status | Caveat |
| --- | --- | --- | --- |
| `src/db.ts` | pool creation and infrastructure wiring | accepted | infrastructure only; no business SQL |
| `src/core/DataBaseHandler.ts` | legacy compatibility DB layer | transitional legacy | must shrink; not a future SQL home |
| `src/core/GuildRecordService.ts` | base guild record persistence boundary | accepted transitional boundary | wrapper extraction only; broader bootstrap still legacy |
| `src/core/GuildLogSettingsService.ts` | log type and default log channel persistence | accepted transitional boundary | broader log ownership still incomplete |
| `src/core/GuildChannelCacheService.ts` | guild channel cache sync and stale cleanup | accepted transitional boundary | destructive cleanup is behavior-preserved only |
| `src/core/GuildRoleCacheService.ts` | guild role cache sync and stale cleanup | accepted transitional boundary | destructive cleanup is behavior-preserved only |
| `src/core/GuildMemberService.ts` | interaction-only guild-member sync boundary | accepted transitional boundary | not full guild-member ownership |
| `src/core/MemberService.ts` | member lifecycle creation and activity owner | accepted target owner | `members` still mixes identity/profile/economy |
| `src/core/DiscordMetadataService.ts` | Discord profile cache update owner | accepted subordinate boundary | must remain subordinate to member existence rules |
| `src/core/EconomyService.ts` | accepted economy boundary for admin adjustments and some reporting | partial owner | direct balance writes still exist elsewhere |
| `src/core/SettingsService.ts` | accepted owner for `general_settings` | accepted boundary | does not solve `bot_settings` mixed ownership |
| OBS and streamer services | current persistence surfaces for OBS and streamer domains | transitional legacy | boundaries remain broad and need focused inventories |

## 12. Immediate Known Violations And Candidates

These are documented facts, not fixes.

| Surface | Why it matters | Current status |
| --- | --- | --- |
| roulette payout flow after KAN-62 | the direct command-layer `members.balance` mutation was removed, but roulette economy behavior still uses a narrow legacy-loose payout path without stake debit, sufficiency checks, rounding policy, audit or ledger, idempotency, or session-race hardening | direct `DataBaseHandler.updateTable(...)` command mutation resolved; broader roulette or economy behavior review still pending |
| `src/core/ItemService.ts` | overloaded broad persistence boundary for item catalog, inventory, market, craft, member resolve, and some economy-adjacent flows | accepted transitional legacy zone, but too broad |
| `src/core/StreamerService.ts` | overloaded broad persistence boundary for streamers, guild bindings, OBS-related surfaces, and service-item behavior | accepted transitional legacy zone, but too broad |
| `src/core/BotAdmin.ts` plus `bot_settings` | mixed settings/admin read-write surface, including contributor ids and bootstrap/OBS reads | accepted transitional mixed zone with security and ownership caveats |
| destructive guild/channel/role cleanup paths | stale cleanup and delete behavior remain high-risk and behavior-preserved only | explicitly documented high-risk zone; not yet semantically hardened |

Known violations must be documented and reduced by small slices. They must not be used as precedent for new violations.

## 13. Staged Migration Plan

1. Stage 1: document the law and ownership map.
   Current task: define the boundary law and name current owners and transitional zones.

2. Stage 2: stop new violations through PR review and checklist enforcement.
   No new raw SQL in adapters and no new generic helper sprawl.

3. Stage 3: route obvious command/event DB writes through owners.
   Focus first on narrow slices where the owner is already known.

4. Stage 4: split large services by inventory, not by big rewrite.
   Use focused inventories for `ItemService`, `StreamerService`, settings, permissions, and economy mutation surfaces.

5. Stage 5: handle destructive cleanup and schema constraints only after dedicated reviews.
   This includes stale cleanup semantics, uniqueness constraints, duplicate rows, and delete/archive policy.

## 14. Explicit Non-Changes

- This document does not fix existing violations.
- This document does not move SQL.
- This document does not change runtime code.
- This document does not change schema or migrations.
- This document does not declare `DataBaseHandler.ts` acceptable as the long-term SQL home.