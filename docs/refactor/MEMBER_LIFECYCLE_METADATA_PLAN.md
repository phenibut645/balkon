# Member Lifecycle Metadata Plan

Task: KAN-8

This document began as the KAN-8 planning document and now also records implemented stabilization status through KAN-28.

Historical KAN-8 task boundaries:

- no runtime code changes
- no migrations created or edited
- no schema files changed
- no `members` table split
- no balance extraction out of `members`
- no `NOT NULL` additions
- no lookup/reference tables for `created_source`
- no `audit_logs` or economy ledger in this stabilization step
- no rewrite of `MemberService` or `DiscordMetadataService`

Read together with:

- `docs/ARCHITECTURE_PLAN.md`
- `docs/refactor/STABILIZATION_PLAN.md`
- `docs/refactor/BACKEND_INVENTORY.md`
- `docs/refactor/DATABASE_HANDLER_USAGE_INVENTORY.md`
- `docs/refactor/DATABASE_INVENTORY.md`
- `src/core/MemberService.ts`
- `src/core/DiscordMetadataService.ts`

## 1. Purpose

Define a production-safe, additive-first plan to introduce member lifecycle metadata on the existing `members` table without risking existing production rows.

This plan is intended to:

- improve lifecycle traceability for existing and newly created members
- clarify ownership of lifecycle writes before any runtime refactor
- support future hardening of member creation and profile cache behavior
- preserve current production behavior while adding nullable metadata gradually

## 2. Current problem

The current `members` table mixes multiple responsibilities on one row:

- Discord identity
- Discord profile cache
- economy balances
- locale and profile fields

The current schema does not provide lifecycle metadata for:

- when a member row was first created
- what flow first created it
- how complete the cached Discord profile is
- when the member was last seen in a real user activity flow
- when the row was last updated for lifecycle purposes

This matters because production already contains existing member rows that were created before lifecycle ownership was made explicit. Those rows must be preserved safely. The first stabilization step therefore needs additive nullable columns and a conservative backfill, not a destructive cleanup.

## 3. Production safety constraints

This plan is constrained by current production reality:

- the production database already contains existing `members` rows
- existing runtime code must keep working during rollout
- the first migration must be additive only
- new columns must remain nullable during stabilization
- no existing data should be deleted, rewritten destructively, or inferred with false certainty
- initial backfill must be safe for partially populated Discord profile cache rows

Required safety rules:

- add columns to `members`, do not split the table
- keep balances in `members`
- do not add `NOT NULL` constraints in this step
- do not add lookup/reference tables for lifecycle values in this step
- do not use runtime failure statuses during initial backfill
- separate initial backfill from later runtime behavior changes

## 4. Additive lifecycle columns

The following nullable columns were implemented by `sql/migrations/020_add_member_lifecycle_metadata.sql` and are reflected in `sql/tables.sql`:

| Column | Type | Nullability | Initial purpose |
| --- | --- | --- | --- |
| `created_at` | `TIMESTAMP` | `NULL` | Tracks known creation time for new rows when the owning runtime path can set it reliably. Existing production rows remain unknown. |
| `updated_at` | `TIMESTAMP` | `NULL` | Tracks lifecycle metadata updates when a controlled owner writes the row. Existing production rows remain unknown. |
| `created_source` | `VARCHAR(32)` | `NULL` | Records which trusted flow first created the member row. |
| `discord_profile_status` | `VARCHAR(32)` | `NULL` | Records the current completeness or runtime sync outcome of Discord profile cache data. |
| `last_seen_at` | `TIMESTAMP` | `NULL` | Records real user activity time, with throttling for website traffic. |

Rationale:

- all columns are additive
- all columns are nullable for production safety
- `VARCHAR(32)` avoids a new lookup table during stabilization
- ownership can be centralized later without blocking deployment of the schema

## 5. Field semantics

### `created_at`

- Meaning: best-known timestamp for when the `members` row was first created by an owned runtime path.
- Existing production rows: remain `NULL` because their original creation time is not known reliably.
- Future writes: set only when the owning creation path can determine this value at insert time.

### `updated_at`

- Meaning: best-known timestamp for the last lifecycle metadata write owned by `MemberService`.
- Existing production rows: remain `NULL` during initial backfill.
- Future writes: update when lifecycle-owned fields are intentionally changed.

### `created_source`

- Meaning: the trusted source that first created the member row.
- Existing production rows: backfill to `'legacy'`.
- Future writes: set once at creation time by the owning lifecycle path and not repurposed as a generic last-touch source.

### `discord_profile_status`

- Meaning: the current lifecycle interpretation of cached Discord profile completeness or explicit sync outcome.
- Existing production rows: initial backfill uses only completeness levels derived from current cache data.
- Future writes: may also represent runtime sync outcomes once explicit sync logic exists.

### `last_seen_at`

- Meaning: best-known timestamp of real user activity.
- Existing production rows: remain `NULL` during initial backfill.
- Future writes: update only from real activity flows, not passive background sync.

## 6. Allowed values

No `created_source_types` table should be added during stabilization. Use `VARCHAR(32)` with documented allowed values.

Allowed `created_source` values:

- `legacy`
- `oauth`
- `discord_interaction`
- `discord_message`
- `system`
- `seed`
- `unknown`

Notes:

- do not add `bot_command` initially because it overlaps with Discord interactions
- `legacy` is reserved for existing production members whose original source cannot be reconstructed reliably
- `unknown` is allowed only as an explicit fallback for future controlled runtime paths when the source cannot be determined safely

Allowed `discord_profile_status` values:

- `minimal`
- `partial`
- `complete`
- `stale`
- `not_found`
- `sync_failed`

Initial backfill restriction:

- use only `minimal`, `partial`, and `complete`
- do not use `stale`, `not_found`, or `sync_failed` in the initial backfill because those values require runtime sync logic and explicit failure semantics

## 7. Backfill policy for existing members

This section applies to existing production members already present before the additive migration is deployed.

Initial backfill values:

- `created_source = 'legacy'`
- `created_at = NULL`
- `updated_at = NULL`
- `last_seen_at = NULL`

Initial `discord_profile_status` classification:

- `complete` if existing profile cache is sufficiently filled
- `partial` if some profile fields exist
- `minimal` if only minimal identity exists

Planned classification rule for the first backfill implementation task:

- classify as `complete` when profile cache contains enough current data to treat the row as materially hydrated, for example `discord_username IS NOT NULL`, `discord_avatar_url IS NOT NULL`, and `discord_profile_updated_at IS NOT NULL`
- classify as `partial` when at least one profile cache field exists but the row does not meet the `complete` threshold
- classify as `minimal` when the row has only base identity with no meaningful profile cache fields present

Backfill guidance:

- run after the additive columns exist
- prefer a deterministic SQL backfill based only on existing row data
- do not infer creation timestamps for old rows
- do not overwrite balances, locale, public profile fields, or existing Discord cache fields
- keep the first backfill idempotent so it can be rerun safely if needed

## 8. Runtime ownership model

Current ownership model:

- `MemberService` owns member lifecycle metadata writes
- `DiscordMetadataService` may update Discord profile cache and `discord_profile_status` only after `MemberService` has ensured member existence
- routes, commands, and events must not write lifecycle metadata fields directly
- background sync and cache hydration should call owned service methods rather than mutating lifecycle fields ad hoc

Practical ownership rules:

- member creation flows should enter through `MemberService`
- `created_source` should be set by the creation path that actually created the row
- `created_at` should be set by the same owned creation path when the row is inserted
- `MemberService` owns lifecycle creation writes and activity writes
- `DiscordMetadataService` may set `updated_at` only as part of profile cache hydration and `discord_profile_status` recalculation
- `last_seen_at` remains separate activity metadata and should not be coupled to `updated_at`
- `DiscordMetadataService` should remain subordinate to member existence and profile cache ownership rules rather than acting as an independent member creator

## 9. Website `last_seen_at` throttling policy

`last_seen_at` should represent meaningful user activity, not every authenticated request.

Policy direction for later runtime tasks:

- website authenticated activity may update `last_seen_at` with throttling, for example at most once per day per member
- OAuth login may update `last_seen_at` because it is real user activity
- Discord interaction flows may update `last_seen_at` because they represent explicit user activity
- Discord message flows may update `last_seen_at` because they represent explicit user activity
- background profile sync must not update `last_seen_at`

Why throttling matters:

- avoids unnecessary write amplification on frequent dashboard usage
- keeps `last_seen_at` semantically meaningful as a coarse activity signal
- prevents passive polling or background refresh from looking like user engagement

### KAN-24 activity decision

This subsection records the explicit policy decision for remaining `last_seen_at` activity tracking after the first runtime implementations.

Current implementation status:

- OAuth login updates `last_seen_at` on every successful session creation.
- Discord interaction updates `last_seen_at` on every successful interaction member sync.
- Discord message activity updates `last_seen_at` with the approved `15 MINUTE` throttle.
- Website authenticated API activity updates `last_seen_at` only on `GET /api/me` with the approved `24 HOUR` throttle.

Decisions:

1. Discord message activity should update `members.last_seen_at`, but not on every message.
2. Discord message activity should use a `15 MINUTE` throttle interval.
3. Website authenticated API activity should update `members.last_seen_at`, but not on every authenticated request.
4. Website authenticated API activity should use a `24 HOUR` throttle interval.
5. Throttling should be implemented with a simple SQL condition on `members.last_seen_at` for now.
6. No new throttle or activity tracking table should be added in this phase.

Approved throttle shape:

- Discord message activity write condition:

```sql
UPDATE members
SET last_seen_at = CURRENT_TIMESTAMP
WHERE ds_member_id = ?
  AND (
    last_seen_at IS NULL
    OR last_seen_at < CURRENT_TIMESTAMP - INTERVAL 15 MINUTE
  );
```

- Website authenticated API write condition:

```sql
UPDATE members
SET last_seen_at = CURRENT_TIMESTAMP
WHERE ds_member_id = ?
  AND (
    last_seen_at IS NULL
    OR last_seen_at < CURRENT_TIMESTAMP - INTERVAL 24 HOUR
  );
```

Why this policy is approved:

- message traffic is too frequent to justify an unconditional write on every Discord message
- website authenticated traffic can include repeated dashboard polling or page refreshes that should not look like continuous engagement
- a simple row-local SQL condition is enough for current scale and avoids introducing a new coordination table before there is a proven need
- `last_seen_at` should remain lightweight activity metadata, not a high-volume event log

Guardrails:

- do not add a new activity log table or throttle table for this policy step
- do not treat background sync, passive refresh, or non-user-driven fetches as activity writes
- do not couple throttling to `updated_at`; `last_seen_at` remains a separate activity signal
- if future product requirements need per-event analytics, solve that with a separate audit or analytics design rather than overloading `last_seen_at`

Planned follow-up tasks:

- re-evaluate whether interaction writes need throttling only if database pressure appears in production metrics

### KAN-26 website authenticated activity boundary

This subsection records the implementation boundary decision for website `last_seen_at` writes.

Current authentication boundary facts:

- backend authentication is currently resolved in `src/api/auth/session.ts` by the global `attachDevSession` preHandler hook
- `attachDevSession` resolves `request.authUser` either from a valid API session cookie or from explicit dev headers in non-production
- `requireAuth` only checks whether `request.authUser` exists; it is not a safe activity boundary because it is reused by many authenticated routes

Decision:

1. The current backend path that proves a website user is authenticated is session resolution in `attachDevSession`, but that hook is too broad for `last_seen_at` writes.
2. The recommended website activity boundary is the lightweight authenticated bootstrap endpoint `GET /api/me` defined in `src/api/routes/dashboardRoutes.ts`.
3. Website `last_seen_at` writes should happen in one explicit route boundary, not in session resolution middleware and not in generic `requireAuth`.
4. The `24 HOUR` throttle from KAN-24 remains the approved website policy.
5. Throttling should use the fixed SQL condition on `members.last_seen_at` and should continue to avoid any new table.

Why `GET /api/me` is the recommended boundary:

- it is authenticated and lightweight
- it already returns the normalized current user identity payload used to bootstrap website state
- it is narrower and safer than global middleware because it avoids hidden writes on every authenticated request
- it is less ambiguous than heavier dashboard endpoints that may be called repeatedly for refresh, polling, or data hydration

Requests that should not count as website activity by default:

- global session resolution in `attachDevSession`
- generic `requireAuth` middleware checks
- data-heavy dashboard fetches such as `GET /api/overview/me`, `GET /api/guilds/me`, `GET /api/profile/me`, inventory, market, notifications, or streamer studio endpoints
- mutation endpoints such as `PATCH /api/profile/me` until a separate product decision says profile edits should also count independently
- any future background refresh, polling, prefetch, or silent retry path
- development-only header auth resolution should not expand the write boundary beyond the chosen explicit endpoint

Approved website write shape:

```sql
UPDATE members
SET last_seen_at = CURRENT_TIMESTAMP
WHERE ds_member_id = ?
  AND (
    last_seen_at IS NULL
    OR last_seen_at < CURRENT_TIMESTAMP - INTERVAL 24 HOUR
  );
```

Implementation guidance:

- call the existing `MemberService` ownership path from the explicit `GET /api/me` route after authentication is already resolved
- do not place the write in `attachDevSession`
- do not place the write in `requireAuth`
- do not fan the write out to all authenticated dashboard routes
- if the frontend later stops using `GET /api/me` as the stable bootstrap request, revisit this boundary before implementation rather than widening middleware writes

Exact next implementation task:

- implemented: throttled website `last_seen_at` updates only on `GET /api/me` using the fixed `24 HOUR` SQL condition through `MemberService`

### KAN-28 stabilization checkpoint

This subsection records the consolidated implementation state after the member lifecycle metadata stabilization chain.

Checkpoint summary:

| Area | Implemented state | Owner/path | Notes |
| --- | --- | --- | --- |
| Schema columns | `created_at`, `updated_at`, `created_source`, `discord_profile_status`, `last_seen_at` exist in baseline and additive migration | `sql/tables.sql`, `sql/migrations/020_add_member_lifecycle_metadata.sql` | additive and nullable |
| Legacy backfill | existing rows backfill to `created_source = 'legacy'`; profile status backfills to `minimal` / `partial` / `complete` | migration `020_add_member_lifecycle_metadata.sql` | deterministic SQL only |
| New member insert | new rows set `created_at`, `updated_at`, `created_source`, `discord_profile_status = 'minimal'` | `MemberService.ensureMemberByDiscordId(...)` | duplicate race re-selects existing row without overwrite |
| OAuth creation flow | explicit `createdSource = 'oauth'` | `ApiSessionService.createSession(...)` | also writes `last_seen_at` unconditionally after successful ensure |
| Discord interaction flow | explicit `createdSource = 'discord_interaction'` | `interactionCreateController(...)` | also writes `last_seen_at` unconditionally after successful ensure |
| Discord message flow | explicit `createdSource = 'discord_message'` | `messageCreateController(...)` | writes `last_seen_at` with `15 MINUTE` throttle |
| Profile hydration | update-only profile cache hydration recalculates `discord_profile_status` and sets `updated_at` | `DiscordMetadataService.upsertMemberDiscordProfile(...)` | does not create members |
| Website activity flow | `GET /api/me` only | `dashboardRoutes.ts` + `MemberService.markMemberSeenByWebsiteActivity(...)` | writes `last_seen_at` with `24 HOUR` throttle |

Checklist confirmation:

1. Lifecycle columns exist in both `sql/tables.sql` and `sql/migrations/020_add_member_lifecycle_metadata.sql`.
2. Existing rows backfill to `legacy` with profile status limited to `minimal`, `partial`, and `complete`.
3. `MemberService` is the owner of member lifecycle writes for creation source, creation timestamps, and activity writes.
4. New member inserts set `created_at`, `updated_at`, `created_source`, and `discord_profile_status = 'minimal'`.
5. Known creation flows pass explicit sources: OAuth -> `oauth`, Discord interaction -> `discord_interaction`, Discord message -> `discord_message`.
6. `DiscordMetadataService` remains update-only for member profile hydration and contains no `INSERT INTO members`.
7. Profile hydration updates `discord_profile_status` and `updated_at`, but does not update `created_at`, `created_source`, or `last_seen_at`.
8. Activity writes are centralized in `MemberService` methods: unthrottled `markMemberSeenByDiscordId(...)`, throttled `markMemberSeenByDiscordMessage(...)`, and throttled `markMemberSeenByWebsiteActivity(...)`.
9. Unconditional member `last_seen_at` writes exist only for OAuth login and Discord interaction.
10. Discord message activity uses the fixed `15 MINUTE` throttle.
11. Website activity uses the fixed `24 HOUR` throttle and is wired only from `GET /api/me`.
12. `last_seen_at` is not written from `attachDevSession`, `requireAuth`, or all dashboard routes.
13. The plan now reflects the implemented message and website activity behavior.

Remaining ambiguous direct `memberService.ensureMemberByDiscordId(...)` callers:

- `src/core/DataBaseHandler.ts`
- `src/core/GuildDashboardService.ts`
- `src/core/NotificationService.ts`
- `src/core/ShopObsService.ts`
- `src/core/UserProfileService.ts`

Decision on ambiguous callers:

- keep the `unknown` fallback for these paths for now
- do not force source attribution until each caller is reviewed against its actual ownership boundary
- future source-attribution tasks should be created only where the runtime owner is clear and stable

Recommended follow-up candidates after this checkpoint:

- review the ambiguous direct `memberService.ensureMemberByDiscordId(...)` callers and classify which ones should pass `system`, `seed`, or another explicit source
- review whether the legacy `DataBaseHandler.isMemberExists(...)` bootstrap path should be reduced or routed more directly through `MemberService`
- add a focused production validation checklist for lifecycle metadata counts after deployment
- only consider throttling Discord interaction writes if real database pressure appears in production metrics

## 10. Validation queries

The migration implementation task should run validation queries before and after backfill.

Count members by `created_source`:

```sql
SELECT created_source, COUNT(*) AS member_count
FROM members
GROUP BY created_source
ORDER BY member_count DESC, created_source ASC;
```

Count members by `discord_profile_status`:

```sql
SELECT discord_profile_status, COUNT(*) AS member_count
FROM members
GROUP BY discord_profile_status
ORDER BY member_count DESC, discord_profile_status ASC;
```

Count members where `created_source IS NULL`:

```sql
SELECT COUNT(*) AS null_created_source_count
FROM members
WHERE created_source IS NULL;
```

Count members where `discord_profile_status IS NULL`:

```sql
SELECT COUNT(*) AS null_discord_profile_status_count
FROM members
WHERE discord_profile_status IS NULL;
```

Count members where `created_at`, `updated_at`, and `last_seen_at` remain null after the initial backfill:

```sql
SELECT
  SUM(CASE WHEN created_at IS NULL THEN 1 ELSE 0 END) AS null_created_at_count,
  SUM(CASE WHEN updated_at IS NULL THEN 1 ELSE 0 END) AS null_updated_at_count,
  SUM(CASE WHEN last_seen_at IS NULL THEN 1 ELSE 0 END) AS null_last_seen_at_count
FROM members;
```

Sample rows for backfill classification review:

```sql
SELECT
  id,
  ds_member_id,
  discord_username,
  discord_global_name,
  discord_avatar,
  discord_avatar_url,
  discord_profile_updated_at,
  CASE
    WHEN discord_username IS NOT NULL
      AND discord_avatar_url IS NOT NULL
      AND discord_profile_updated_at IS NOT NULL
      THEN 'complete'
    WHEN discord_username IS NOT NULL
      OR discord_global_name IS NOT NULL
      OR discord_avatar IS NOT NULL
      OR discord_avatar_url IS NOT NULL
      OR discord_profile_updated_at IS NOT NULL
      THEN 'partial'
    ELSE 'minimal'
  END AS planned_backfill_status
FROM members
ORDER BY id ASC
LIMIT 100;
```

Count planned backfill classification before writing values:

```sql
SELECT planned_backfill_status, COUNT(*) AS member_count
FROM (
  SELECT CASE
    WHEN discord_username IS NOT NULL
      AND discord_avatar_url IS NOT NULL
      AND discord_profile_updated_at IS NOT NULL
      THEN 'complete'
    WHEN discord_username IS NOT NULL
      OR discord_global_name IS NOT NULL
      OR discord_avatar IS NOT NULL
      OR discord_avatar_url IS NOT NULL
      OR discord_profile_updated_at IS NOT NULL
      THEN 'partial'
    ELSE 'minimal'
  END AS planned_backfill_status
  FROM members
) classified
GROUP BY planned_backfill_status
ORDER BY member_count DESC, planned_backfill_status ASC;
```

## 11. Migration implementation status

The additive migration already exists as `sql/migrations/020_add_member_lifecycle_metadata.sql` and the baseline schema is aligned in `sql/tables.sql`.

Historical implementation sequence:

1. Create one additive migration that adds the five nullable columns to `members`.
2. Deploy the additive schema first without changing existing runtime behavior in the same step unless the rollout requires compatibility handling.
3. Run pre-backfill validation queries to understand current production row shapes.
4. Execute a deterministic backfill for existing production members using only:
   - `created_source = 'legacy'`
   - `created_at = NULL`
   - `updated_at = NULL`
   - `last_seen_at = NULL`
   - `discord_profile_status` derived as `minimal`, `partial`, or `complete`
5. Run post-backfill validation queries and record counts.
6. Leave runtime-specific statuses and write paths to separate follow-up tasks.

Ongoing validation and deployment guidance:

- keep the migration additive and reversible where practical
- avoid long-running destructive table rewrites
- do not introduce constraints that require every existing row to have values immediately
- do not combine this migration with a broader `members` refactor

## 12. Implemented runtime status and remaining follow-up tasks

Implemented runtime status is summarized in the KAN-28 stabilization checkpoint above.

Remaining real follow-up tasks:

1. Review the remaining ambiguous direct `memberService.ensureMemberByDiscordId(...)` callers and decide where explicit source attribution is justified.
2. Review the legacy `DataBaseHandler.isMemberExists(...)` bootstrap path and decide whether it should be reduced or routed more directly through `MemberService`.
3. Add a focused production validation checklist for lifecycle metadata counts after deployment.
4. Introduce runtime semantics later for `stale`, `not_found`, and `sync_failed` only after explicit sync logic exists.
5. Consider throttling Discord interaction writes only if production metrics show real write pressure.

## 13. Explicit non-goals

This stabilization-step plan does not do the following:

- split the `members` table
- move balances out of `members`
- add `NOT NULL` constraints to the new lifecycle columns
- add a `created_source_types` lookup table
- add any other reference table for lifecycle values
- add `audit_logs`
- add a general economy ledger
- rewrite `MemberService`
- rewrite `DiscordMetadataService`
- redefine all member/profile/public-profile boundaries in one step
- backfill `stale`, `not_found`, or `sync_failed`
- change current runtime routes, commands, or events directly in this task

## 14. Risks and rollback notes

Primary risks:

- misclassifying old rows if backfill rules assume more certainty than current cache data supports
- accidentally coupling additive schema rollout with runtime behavior changes
- introducing direct writes from multiple entry points instead of centralizing ownership in `MemberService`
- turning `last_seen_at` into noisy request telemetry instead of meaningful activity data

Risk controls:

- keep all new columns nullable
- use conservative backfill defaults for existing production members
- use only `legacy`, `minimal`, `partial`, and `complete` during first backfill
- validate counts before and after backfill
- treat runtime ownership and status transitions as separate later tasks

Rollback notes for the later implementation task:

- additive nullable columns are low-risk to deploy because existing rows remain valid
- if backfill results are incorrect, it is safer to correct the backfill logic and rerun targeted updates than to force non-null defaults
- rollback should prioritize stopping new runtime writes first, then correcting backfilled values if necessary
- no rollback plan should assume existing production member creation times can be reconstructed accurately

## Notes On KAN-8 Inputs

This plan reflects the architecture documents, current service ownership, and the task constraints supplied for KAN-8. No Jira comment mirror was found in the repository workspace during this task.