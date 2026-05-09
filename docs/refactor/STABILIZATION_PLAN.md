# Balkon Stabilization Plan

This document is the execution plan for the Balkon stabilization phase.

It must be read together with `docs/ARCHITECTURE_PLAN.md` / `Закон Balkon`.

- `ARCHITECTURE_PLAN.md` defines the law: mandatory architecture rules and guardrails.
- `STABILIZATION_PLAN.md` defines the plan: concrete investigation, refactoring, migration, and validation steps.

The law should change rarely.
The plan may change as new facts are discovered.

---

## 0. Current Phase

Balkon is in stabilization / architecture hardening phase.

Do not start major product features until the critical backend write paths are controlled.

Primary goal:

```text
Recover control over member lifecycle, economy mutations, database traceability, security-sensitive persistence, and large-file refactoring boundaries before adding new features.
```

Preferred execution unit:

```text
inventory -> risk map -> medium safe domain slice -> validation -> docs sync
```

A medium safe domain slice should make visible progress in one selected area, usually around 20-25% of that area's architectural debt when repo evidence supports it. It is not a license for broad rewrites.

---

## 1. Working Rules

Every task in this plan must follow the law:

- inventory first when the surface is unknown, broad, stale, or risky
- risk map before implementation
- medium bounded PRs/slices instead of endless tiny 1-3 line patches when a wider coherent slice is safer
- preserve public behavior and response shapes unless the change explicitly scopes a behavior change
- no SQL in routes or Discord commands
- no direct member creation outside member owner
- no direct balance mutation outside economy owner
- no hidden ownership or catch-all layers
- no undocumented temporary workaround
- additive database migrations first
- audit important mutations
- run build/manual validation for runtime changes
- run targeted searches/greps for touched boundaries

### Responsibility check

Before implementation, answer:

- Which domain owns this behavior?
- Which service, repository, read model, query service, or module should contain the mutation/read?
- Is this adding responsibility to an already overloaded file?
- Is this bypassing `MemberService`, `EconomyService`, the future inventory owner, or `AuditLogService`?
- Is this using `DataBaseHandler`, `ItemService`, a dashboard route file, a Discord command handler, or a generic helper as a catch-all layer?
- Is this a temporary workaround?
- If temporary, who owns it, what is the risk, and where is the follow-up documented?
- Can this be done as a medium safe domain slice with explicit allowed files, do-not-touch boundaries, validation, and rollback-friendly shape?

If the owner is unclear, do not implement yet. Create or update the relevant inventory first.

---

## 2. Verified Starting Facts

These facts were verified from the current repository state during the reset:

### Backend/API

- `src/api/server.ts` is the Fastify API entry point.
- API routes are registered under `/api`.
- `dashboardRoutes.ts` is partially extracted but still contains real route handlers and validation.
- Dashboard route modules already exist for profile, notifications, market, inventory, jobs, craft execution, streamer studio, admin streamers, and streamer applications.

### Discord bot

- `src/events/interactionCreate.ts` syncs member profile through `memberService.ensureMemberFromDiscordProfile(...)`.
- `src/events/interactionCreate.ts` now syncs in-guild membership through `guildMemberService.ensureInteractionGuildMember(...)` and no longer uses `DataBaseHandler` or legacy `isMemberExists(...)` in the adapter.
- `src/events/messageCreate.ts` syncs member profile through `memberService.ensureMemberFromDiscordProfile(...)`.

### Member lifecycle

- `src/core/MemberService.ts` exists.
- OAuth session creation calls `memberService.ensureMemberFromDiscordProfile(...)` before inserting `api_sessions`.
- `MemberService.ensureMemberByDiscordId(...)` still uses an upsert pattern with `LAST_INSERT_ID(id)`.
- `DiscordMetadataService.upsertMemberDiscordProfile(...)` directly performs `INSERT INTO members ... ON DUPLICATE KEY UPDATE` and can create members outside `MemberService`.
- `DataBaseHandler.isMemberExists(...)` remains a legacy member/guild-member bootstrap path.

### Economy

- `EconomyService` exists.
- `EconomyService.adjustMemberBalanceByAdmin(...)` uses a transaction and writes `admin_economy_adjustments`.
- `EconomyService` still resolves members through `ItemService.getInstance().ensureMemberByDiscordId(...)` in some flows.
- `ShopObsService` directly debits/refunds `members.balance`.
- `JobService.runJob(...)` directly increments `members.balance` inside its own transaction.
- `ItemService` still owns mixed inventory/market/shop/craft/member/economy behavior.

### Database

- `members` is overloaded with identity, Discord profile cache, economy balances, locale, home guild, and public profile fields.
- `members` lacks `created_at`, `updated_at`, `created_source`, `discord_profile_status`, and `last_seen_at`.
- money/price types are inconsistent across the schema (`INT`, `FLOAT`, `DECIMAL`, `BIGINT`).
- there is no general `audit_logs` table.
- there is no general economy ledger.
- `api_sessions` stores OAuth access/refresh token fields and requires security review.

---

## 3. Milestone 1: Backend Inventory

Goal: create factual maps before refactoring.

### 1.1 Backend inventory document

Create or refresh:

```text
docs/refactor/BACKEND_INVENTORY.md
```

Must include:

- API route files and endpoints
- Discord events and commands
- services in `src/core/*`
- direct `pool.query` usage
- direct `INSERT INTO members`
- direct `UPDATE members SET balance/ldm_balance`
- `DataBaseHandler` usage
- high-risk files and why they are high risk
- first medium safe domain-slice candidates

No runtime code changes.

### 1.2 DataBaseHandler usage inventory

Create or refresh:

```text
docs/refactor/DATABASE_HANDLER_USAGE_INVENTORY.md
```

Must include all usages of:

- `dataBaseHandler.isMemberExists(...)`
- `dataBaseHandler.updateTable(...)`
- `dataBaseHandler.addRecords(...)`
- `dataBaseHandler.getFromTable(...)`
- direct imports of `DataBaseHandler`

For each usage:

- file path
- function/method
- purpose
- risk level
- target owner/service/repository/read model
- safe replacement strategy
- whether the candidate is a micro cleanup, medium domain slice, or blocked high-risk slice

No runtime code changes.

---

## 4. Milestone 2: Member Lifecycle Hardening

Goal: make `MemberService` the only practical owner of member creation.

### 2.1 Fix `MemberService.ensureMemberByDiscordId(...)`

Problem:

```text
INSERT ... ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
```

can burn AUTO_INCREMENT values.

Target behavior:

```text
SELECT by ds_member_id
  -> found: return id
  -> missing: INSERT minimal member
  -> ER_DUP_ENTRY race: SELECT again
```

Scope:

- `src/core/MemberService.ts`
- minimal tests only if test pattern already exists

Validation:

- `npm run build`
- manual login/member diagnostic on dev
- targeted grep for direct member creation touched by the slice
- no unrelated files changed

### 2.2 Stop `DiscordMetadataService` from creating members

Problem:

`DiscordMetadataService.upsertMemberDiscordProfile(...)` currently inserts into `members`.

Target:

- `DiscordMetadataService` may update existing profile cache
- it must not create members
- `MemberService.ensureMemberFromDiscordProfile(...)` must ensure member first, then update profile cache

Scope:

- `src/core/MemberService.ts`
- `src/core/DiscordMetadataService.ts`

Validation:

- `npm run build`
- OAuth login creates/updates profile
- Discord interaction syncs profile
- Discord message syncs profile
- `scripts/check_member_profile.mjs` still works

### 2.3 Add member lifecycle metadata plan

Create migration plan for additive columns:

- `created_at`
- `updated_at`
- `created_source`
- `discord_profile_status`
- `last_seen_at`

Before migration, document backfill rules.

Possible defaults:

- old rows: `created_source = 'legacy'`
- profile complete: fields present and `discord_profile_updated_at IS NOT NULL`
- minimal/partial: missing profile fields
- not_found/sync_failed: only after explicit sync attempt failure handling exists

---

## 5. Milestone 3: Database Inventory and Traceability

Goal: understand schema risks and add traceability before normalization.

### 3.1 Database inventory document

Create or refresh:

```text
docs/refactor/DATABASE_INVENTORY.md
```

Must include:

- identity/profile tables
- auth/session tables
- guild/member relation tables
- economy fields/tables
- inventory/item/market/shop tables
- craft tables
- jobs tables
- OBS/command queue tables
- streamer tables
- notification tables
- settings tables
- audit gaps
- money type inconsistencies
- missing indexes/constraints that are obvious from access patterns
- explicit persistence owner candidates by table/table group

No runtime changes.

### 3.2 Add audit_logs table

After inventory, add an additive migration for `audit_logs`.

Do not wire every event immediately.

Start with minimal application-level audit foundation:

- `AuditLogService`
- `AuditLogRepository` or equivalent repository boundary
- first events: member/session/economy admin adjustment

---

## 6. Milestone 4: Economy Ownership

Goal: make balance changes controlled, auditable, and transaction-safe.

### 4.1 Economy mutation inventory

Create or refresh:

```text
docs/refactor/ECONOMY_MUTATION_INVENTORY.md
```

Must include every direct mutation of:

- `members.balance`
- `members.ldm_balance`

For each mutation:

- file path
- function/method
- business reason
- transaction behavior
- refund behavior if relevant
- audit behavior
- target `EconomyService` method/use case
- extraction risk
- whether it can be grouped into a medium safe economy slice

Known starting points:

- `EconomyService.adjustMemberBalanceByAdmin(...)`
- `ShopObsService.tryChargeMember(...)`
- `ShopObsService.refundMember(...)`
- `JobService.runJob(...)`
- `ItemService` market/shop/craft flows
- `roulette.ts` direct reward behavior if still present

### 4.2 First medium safe economy extraction

Choose one coherent low/medium-risk flow or one closely related pair of flows.

Good first candidates:

- admin economy adjustment cleanup plus its repository boundary if behavior is already controlled
- job reward credit through `EconomyService` plus a narrow repository if transaction behavior is clear
- a simple direct credit/debit with no external side effect

Avoid first:

- full market purchase
- craft execution
- OBS media purchase
- multi-entity item transfer

Validation:

- `npm run build`
- before/after DB check on dev
- audit row if audit is wired
- response shape unchanged
- targeted grep for direct balance mutations

---

## 7. Milestone 5: ItemService Inventory and Split

Goal: split `ItemService.ts` without breaking market/inventory/shop/craft.

### 5.1 ItemService inventory

Create or refresh:

```text
docs/refactor/ITEM_SERVICE_INVENTORY.md
```

For every public method and important private helper:

- method name
- approximate line range
- responsibility
- SQL queries
- transaction usage
- member resolving
- balance mutation
- inventory mutation
- side effects
- current callers
- response shape
- target owner
- extraction risk
- grouping recommendation for a medium safe domain slice

No runtime changes.

### 5.2 First medium safe extraction

Allowed candidates:

- read-only item template repository/read model
- rarity/type mapping plus item catalog read boundary
- pure display helper plus direct callers
- read-only search service

Forbidden first candidates unless a fresh inventory proves the slice is bounded:

- market purchase
- craft execution
- inventory transfer
- bot shop purchase
- OBS service item use

---

## 8. Milestone 6: Dashboard Routes Cleanup

Goal: make `dashboardRoutes.ts` a composition layer.

Read first:

```text
docs/refactor/DASHBOARD_ROUTE_MODULES_PLAN.md
```

Steps:

1. create or refresh `docs/refactor/DASHBOARD_ROUTES_INVENTORY.md`
2. inventory remaining endpoints in `dashboardRoutes.ts`
3. group endpoints by coherent route module / feature cluster
4. extract one coherent route group at a time
5. preserve paths, HTTP methods, auth/preHandler requirements, response shapes, error codes/messages, service calls, and side effects
6. standardize validation/error mapping later, not during extraction unless explicitly scoped

Do not combine route extraction with service/domain refactors unless required by the same bounded slice and explicitly reviewed.

Do not default to one file per endpoint. Prefer one route module per coherent endpoint group, with single-endpoint modules only for complex, security-sensitive, or likely-to-grow endpoints.

---

## 9. Milestone 7: Security Review

Create:

```text
docs/security/SECURITY_REVIEW.md
```

Review:

- session cookie flags
- dev auth behavior in prod
- CORS
- OAuth token storage
- route permission checks
- admin route checks
- OBS relay auth
- OBS Agent token storage
- SQL injection risks in dynamic SQL
- sensitive values in logs
- frontend-only permission assumptions

Security fixes should be separate PRs unless they are part of one bounded security slice with explicit validation and rollback plan.

---

## 10. Milestone 8: Frontend Track

Do not mix frontend rewrite with backend stabilization.

First create:

```text
docs/refactor/FRONTEND_INVENTORY.md
```

Must include:

- largest `page.tsx` files
- large dashboard components
- raw fetch/API calls
- repeated modals/forms/tables/cards/loading/error states
- duplicated state logic
- feature boundaries
- first three medium safe extraction candidates

Then proceed:

1. shared API client baseline
2. one feature extraction
3. shared UI states/components
4. repeat by feature

---

## 11. Recommended Slice Order

Current recommended order:

1. refresh stale inventories against current repo state when the next surface is unclear
2. member lifecycle hardening slice: stop independent member creation paths and fix unsafe ensure behavior
3. database inventory/owner map slice: table groups, schema risks, audit gaps, persistence owners
4. audit foundation slice: `audit_logs` migration plus `AuditLogService`/repository MVP
5. economy ownership slice: one coherent low/medium-risk balance mutation group through `EconomyService` and repository boundary
6. ItemService inventory slice: method map, SQL map, target owners, grouping recommendations
7. ItemService read-only extraction slice: catalog/rarity/type/read-only search boundary
8. dashboard routes inventory and route-module extraction slice: one coherent route group at a time
9. auth/session security inventory and bounded hardening slice
10. streamer/OBS inventory and first bounded extraction slice

This order can change when new facts are discovered, but changes must be justified.

---

## 12. PR Validation Template

Every runtime PR should include:

```text
## Summary

## Scope

## Responsibility check
- [ ] domain owner identified
- [ ] target service/repository/read model/module identified
- [ ] no catch-all layer expanded without inventory
- [ ] no generic helper used to bypass ownership
- [ ] temporary workaround has owner, risk, and follow-up, or no workaround was added
- [ ] medium slice is bounded and rollback-friendly

## Architecture law checks
- [ ] no SQL added to routes/commands
- [ ] no new direct member creation outside MemberService/member repository
- [ ] no new direct balance mutation outside EconomyService/economy repository
- [ ] no hidden ownership or catch-all layer introduced
- [ ] no blind large-file refactor
- [ ] no `DataBaseHandler 2.0`, `BaseRepository`, `GenericRepository`, or generic CRUD layer
- [ ] response shapes preserved or explicitly documented

## Validation
- [ ] npm run build
- [ ] tests/lint if available
- [ ] targeted grep/search results for touched ownership boundary
- [ ] manual validation steps listed

## Risk

## Follow-ups
```

Docs-only PRs do not require runtime build unless documentation tooling changes.
