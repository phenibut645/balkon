# Balkon Database Inventory

Task: KAN-5

This document is a factual schema and traceability inventory before database migration, normalization, or repository refactoring.

## 1. Purpose And Scope

Read first:

- `docs/ARCHITECTURE_PLAN.md`
- `docs/refactor/STABILIZATION_PLAN.md`
- `docs/refactor/BACKEND_INVENTORY.md`
- `docs/refactor/DATABASE_HANDLER_USAGE_INVENTORY.md`

Inspected:

- baseline schema: `sql/tables.sql`
- migrations: `sql/migrations/000_template.sql` through `sql/migrations/019_localize_items.sql`
- migration runner/init scripts: `scripts/init_schema.mjs`, `scripts/run_migrations.mjs`
- seed/demo scripts: `scripts/seed_demo_content.mjs`, `scripts/seed_economy_snapshots.mjs`, `scripts/seed_guild_metadata.mjs`
- schema types: `src/types/database.types.ts`
- SQL usage in `src/core/*`
- SQL usage in `src/api/auth/*`
- DB-related docs: `sql/migrations/README.md`, `docs/ARCHITECTURE_PLAN.md`, `docs/refactor/STABILIZATION_PLAN.md`, `docs/refactor/BACKEND_INVENTORY.md`, `docs/refactor/DATABASE_HANDLER_USAGE_INVENTORY.md`

Hard boundaries for this task:

- no runtime code changed
- no migrations changed or created
- no schema file changed
- no normalization performed
- inventory first

## 2. Schema Source Files Inspected

| File path | What it contains | Why it matters | Risk/notes |
| --- | --- | --- | --- |
| `sql/tables.sql` | Fresh-database baseline schema. Includes `DROP DATABASE IF EXISTS test_balkon`, `CREATE DATABASE`, and many `CREATE TABLE` statements. | Primary source for current table/column/FK inventory. | High if run against wrong target; init script strips database create/drop/use lines. |
| `sql/migrations/001_initial_schema.sql` | Comment-only initial marker pointing to `sql/tables.sql`. | Existing DB baseline is represented by the baseline file, not recreated in migration 001. | Low. |
| `sql/migrations/002_create_schema_migrations.sql` | Creates `schema_migrations`. | Tracks applied migrations. | Low. |
| `sql/migrations/003_create_bot_commands.sql` | Creates `bot_commands` and indexes. | API-to-bot queue schema. | Medium. |
| `sql/migrations/004_create_api_sessions.sql` | Creates `api_sessions` and indexes. | Auth/session persistence including OAuth tokens. | High security sensitivity. |
| `sql/migrations/005_create_economy_daily_snapshots.sql` | Creates `economy_daily_snapshots`. | Economy reporting snapshots. | Medium. |
| `sql/migrations/006_members_public_profile_and_forbes.sql` | Adds `members.home_guild_id`, `members.public_description`, and indexes on home guild/balance. | Extends overloaded `members` table. | Medium. |
| `sql/migrations/007_add_guild_display_metadata.sql` | Adds `guilds.display_name`, `guilds.icon_url`. | Discord guild metadata cache. | Low. |
| `sql/migrations/008_members_discord_profile_cache.sql` | Adds Discord profile cache fields to `members`. | Identity/profile cache. | High because `members` now mixes identity/profile/economy. |
| `sql/migrations/009_create_notifications.sql` | Creates notifications and indexes. | User notification state. | Medium. |
| `sql/migrations/010_create_obs_agent_statuses.sql` | Creates OBS agent status table. | OBS agent liveness. | Medium. |
| `sql/migrations/011_create_admin_economy_adjustments.sql` | Creates admin economy adjustment audit-like table. | Only specific economy trace table found. | Medium; not a general ledger. |
| `sql/migrations/012_create_obs_media_actions.sql` | Creates OBS media action table and indexes. | Tracks OBS media purchases/actions/refunds. | High because money and external side effects meet here. |
| `sql/migrations/013_create_streamer_access_foundation.sql` | Creates streamer owners/trusted users. | Streamer access control. | High authorization sensitivity. |
| `sql/migrations/014_obs_agent_status_payload_json.sql` | Adds OBS agent status JSON payload. | Agent telemetry. | Low/medium. |
| `sql/migrations/015_create_streamer_services.sql` | Creates streamer services. | Streamer service catalog/pricing. | High due service purchases and money. |
| `sql/migrations/016_create_streamer_applications.sql` | Creates streamer applications and indexes. | Application/review workflow. | Medium. |
| `sql/migrations/017_archive_streamers.sql` | Adds `streamers.archived_at`, `archived_by_member_id`, and index. | Soft archive path for streamers. | Medium; good sign for non-destructive design. |
| `sql/migrations/018_create_jobs.sql` | Creates jobs and cooldowns. | Job reward/cooldown schema. | High due rewards. |
| `sql/migrations/019_localize_items.sql` | Adds localized item name/description fields. | Item catalog localization. | Low. |
| `sql/migrations/README.md` | Migration policy: numbered migrations, do not edit old applied migrations, prefer additive, update baseline plus migration. | Confirms this task must not change migrations. | Low. |
| `scripts/init_schema.mjs` | Initializes schema from `sql/tables.sql` or `dist/sql/tables.sql`; strips drop/create/use lines and ignores some duplicate/table-exists errors. | Fresh database setup behavior. | Medium; baseline order and idempotency matter. |
| `scripts/run_migrations.mjs` | Applies numbered migrations and records them in `schema_migrations`; warns MySQL DDL may partially apply despite rollback. | Migration operational risk. | Medium/high for failed DDL. |
| `scripts/seed_demo_content.mjs` | Seeds demo items, bot shop listings, craft recipes, service bindings, starter inventory, and can upsert a developer member. | Demo content touches many item/inventory tables and directly inserts/updates `members`. | Medium; dev/demo only but mutates member balance/content. |
| `scripts/seed_economy_snapshots.mjs` | Seeds economy daily snapshots in non-prod. | Economy reporting demo data. | Low; refuses production mode. |
| `scripts/seed_guild_metadata.mjs` | Fallback local guild display metadata seed; refuses production mode. | Guild metadata cache. | Low. |

## 3. Table Inventory By Domain

### Identity And Profile Tables

| Table name | Purpose | Key columns | Relationships/FKs visible | Current owner/domain | Uncertainty | Risk | Traceability gaps | Suggested next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `members` | Core member identity, Discord profile cache, economy balances, locale, home guild, public profile. | `id`, `ds_member_id` unique, `discord_username`, `discord_global_name`, `discord_avatar`, `discord_avatar_url`, `discord_profile_updated_at`, `balance`, `ldm_balance`, `home_guild_id`, `public_description`, `locale`. | Referenced by many tables; no FK from `home_guild_id` to `guilds.ds_guild_id`. | member/profile/economy mixed. | Exact boundary between member lifecycle, profile, public profile, and economy is unclear. | high | Missing `created_at`, `updated_at`, `created_source`, `discord_profile_status`, `last_seen_at`; no general audit trail for creation/profile updates; balance lives on same row as identity/profile. | First additive candidate: member lifecycle metadata columns and backfill plan. |
| `api_sessions` | Web/API session and Discord OAuth token cache. | `session_token_hash` unique, `discord_id`, `username`, `global_name`, `avatar`, `access_token`, `refresh_token`, `token_expires_at`, `scopes`, `user_json`, `guilds_json`, `expires_at`, `revoked_at`. | No FK to `members`; joins in profile code use `discord_id` against `members.ds_member_id`. | auth/session. | Whether OAuth tokens should remain stored as plaintext `TEXT` is unresolved. | high | No actor/member FK, no token encryption marker, no created source, no audit for revocation/login. | Security review before any auth schema migration; consider additive trace/encryption metadata only after review. |

### Guild, Member Relation, Permission, And Moderation Tables

| Table name | Purpose | Key columns | Relationships/FKs visible | Current owner/domain | Uncertainty | Risk | Traceability gaps | Suggested next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `guilds` | Discord guild records and metadata. | `id`, `ds_guild_id` unique, `display_name`, `icon_url`, `earning_multiply FLOAT`. | Parent for guild roles/channels/members/logs/streamer bindings. | guilds. | Whether `earning_multiply` belongs to guild economy/settings is unclear. | high | Missing `created_at`, `updated_at`, `created_source`, `last_seen_at`; guild delete cascades widely. | Add lifecycle metadata after guild inventory; block destructive changes. |
| `guild_members` | Join table between guilds and members with member status. | `id`, `guild_id`, `member_id`, `member_status_id`. | FKs to `guilds`, `members`, `guild_member_statuses`, all cascade. | guild membership. | No unique key on `(guild_id, member_id)` visible. | high | No `joined_at`, `last_seen_at`, `left_at`, `created_source`; duplicate membership risk unless code prevents it. | Add unique/index/lifecycle candidate only after checking production duplicates. |
| `guild_member_statuses` | Lookup values for guild member status. | `id`, `name`; seeds `default`, `guild_owner`. | Referenced by `guild_members`. | guild membership lookup. | none. | low | No unique constraint on `name`. | Later low-risk uniqueness candidate after duplicate check. |
| `guild_roles` | Discord guild role cache. | `id`, `guild_id`, `ds_role_id`. | FK to `guilds` cascade. | guild role cache. | No unique key on `(guild_id, ds_role_id)` visible. | medium | No `created_at`/`updated_at`; stale roles are deleted. | Add uniqueness/index after duplicate check. |
| `guild_channels` | Discord guild channel cache. | `id`, `guild_id`, `ds_channel_id TEXT`. | FK to `guilds` cascade. | guild channel cache. | `TEXT` id cannot be indexed normally; no uniqueness. | medium | No created/update timestamps; stale channels are deleted. | Consider `VARCHAR(32)` additive/normalization later; do not destructive-convert first. |
| `member_roles` | Member-to-guild-role assignments. | `id`, `member_id`, `guild_role_id`. | FKs to `members` and `guild_roles`, cascade. | permissions/roles. | No unique key on `(member_id, guild_role_id)` visible. | medium | No timestamps/source. | Later uniqueness/timestamps after duplicate check. |
| `role_statuses` | Role status lookup. | `id`, `name`; seeds default/admin/mute/economical. | Referenced by `guild_role_statuses`. | permissions/roles. | none. | low | No unique constraint on `name`. | Later low-risk uniqueness after duplicate check. |
| `guild_role_statuses` | Join between guild roles and role statuses. | `id`, `guild_role_id`, `role_status_id`. | FKs cascade. | permissions/roles. | No unique key visible. | medium | No trace columns. | Later uniqueness/index after duplicate check. |
| `command_access_levels` | Command access lookup. | `id`, `name` unique; seeds public/private. | Referenced by `commands`. | command permissions. | none. | low | No trace columns; acceptable lookup table. | No immediate action. |
| `commands` | Command registry. | `id`, `tag` unique, `command_access_level_id`. | FK to access levels cascade. | command permissions. | none. | medium | No created/updated metadata. | Later owner/repository inventory before changes. |
| `member_command_permissions` | Per-member command permission. | `id`, `guild_member_id`, `command_id`, `allowed`. | FKs to `guild_members`, `commands`, cascade. | permissions. | No unique key on `(guild_member_id, command_id)` visible. | high | No actor/timestamp/source. | Defer to permission inventory; add trace/audit before heavy changes. |
| `role_command_permissions` | Per-role command permission. | `id`, `guild_role_id`, `command_id`, `allowed`. | FKs cascade. | permissions. | No unique key visible. | high | No actor/timestamp/source. | Defer to permission inventory. |
| `log_types`, `logs_channels` | Logging channel configuration. | `log_types.id/name`; `logs_channels.guild_id/log_type_id/ds_channel_id`. | FKs to guild/log types cascade. | guild logging. | `log_types.name` not unique; `logs_channels` uniqueness unclear. | medium | No updated_by/updated_at; stale log channels may be deleted during bootstrap. | Add settings/audit review later. |
| `channel_tags_statuses`, `channel_tags`, `twitch_notification_channels` | Channel tag lookup and Twitch notification channel binding. | tag names/status; streamer/channel binding. | FKs cascade to channel tag statuses, streamers, guild_channels. | notifications/streamers/guild channels. | No FK table for channel-tags-to-guild-channels appears in baseline despite `GuildChannelsTagsDB` type. | medium | No actor/timestamps on bindings. | Verify schema/type mismatch before refactor. |
| `mute_roles`, `banned_members`, `muted_users` | Moderation role/ban/mute tables. | role/guild member refs, reason, timestamps, duration fields. | FKs cascade to guild roles/guild members. | moderation. | Runtime usage appears limited/legacy. | medium | Missing actor fields; cascade can erase moderation history if guild/member deleted. | Later moderation/audit inventory. |

### Economy Tables And Fields

| Table name | Purpose | Key columns | Relationships/FKs visible | Current owner/domain | Uncertainty | Risk | Traceability gaps | Suggested next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `members` | Stores current balances. | `balance INT DEFAULT 0`, `ldm_balance INT DEFAULT 0`, index on `balance`. | No economy ledger FK; used by many write flows. | economy/member mixed. | Balance ownership is not centralized despite `EconomyService`. | high | No per-transaction ledger, no source, no actor, no reason except admin adjustments. | Create economy mutation inventory before any balance schema change. |
| `general_settings` | Global settings including starting balance and default earning multiplier. | `start_balance INT`, `default_earning_multiply FLOAT`. | No FK. | settings/economy. | Could be superseded by `bot_settings`/settings service. | medium | No timestamps or actor. | Add settings inventory before changes. |
| `economy_daily_snapshots` | Daily aggregate totals. | `snapshot_date` unique, `total_odm BIGINT`, `total_ldm BIGINT`, `members_count`, timestamps. | No FKs. | economy reporting. | none. | medium | Snapshot source/job actor absent. | Low-risk additive source metadata later if needed. |
| `admin_economy_adjustments` | Trace table for admin balance adjustments only. | `admin_member_id`, `target_member_id`, `currency`, `amount BIGINT`, `balance_after BIGINT`, `reason`, `created_at`. | FKs to `members` cascade. | economy/admin. | Not a general ledger. | medium | Cascade on member delete can erase admin adjustment history; no request id/source/guild id. | Preserve; consider future audit/ledger table before changing cascade behavior. |

### Inventory, Item, Market, Shop, And Service Item Tables

| Table name | Purpose | Key columns | Relationships/FKs visible | Current owner/domain | Uncertainty | Risk | Traceability gaps | Suggested next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `item_types` | Item type lookup. | `id`, `name` unique. | Referenced by `items`. | item catalog. | none. | low | No created metadata; acceptable lookup. | No immediate action. |
| `item_rarities` | Item rarity lookup. | `id`, `name` unique, `color_hex`. | Referenced by `items`. | item catalog. | none. | low | No created metadata. | No immediate action. |
| `items` | Item template catalog. | type/rarity FKs, name/description/localized fields, `sellable`, `tradeable`, `image_url`, `bot_sell_price DECIMAL(10,2)`, `created_by_member_id`, `added_at`. | FKs to type/rarity cascade; creator set null. | item catalog. | Owner split with inventory/market/craft still mixed in `ItemService`. | high | No `updated_at`, `updated_by_member_id`, deleted/archive fields; type/rarity cascade could delete item templates. | `ITEM_SERVICE_INVENTORY.md` before schema changes; later add update trace. |
| `member_items` | Concrete inventory instances. | `member_id`, `item_id`, `tier`, `obtained_at`, `original_owner_member_id`. | FKs to members/items cascade; original owner set null. | inventory. | No item transaction/audit owner yet. | high | No source/reason/transfer history; deleting member/item erases inventory rows. | Future inventory ledger/audit before normalization. |
| `item_public_market` | Player market listing. | `member_item_id` unique, `price FLOAT`. | FK to `member_items` cascade. | market. | Money precision/owner split unclear. | high | No seller id snapshot, created_at, updated_at, cancelled_at, sold_at, audit trail. | Add timestamps/source later; avoid destructive price type change first. |
| `item_general_store` | Bot/general shop listing. | `item_id` unique, `price FLOAT`. | FK to `items` cascade. | bot shop/item shop. | none. | high | No created/updated actor/time; `FLOAT` price. | Add timestamps/updated_by after item inventory. |
| `item_treasures`, `treasure_contents` | Treasure item templates and contents. | treasure item refs and content item refs. | FKs cascade to items/item_treasures. | inventory/items. | Runtime usage unclear. | medium | No amount/chance fields visible; no trace. | Defer until item inventory. |
| `item_roles`, `guild_item_roles` | Role item templates and per-guild role binding. | item role color/pinned; guild role binding. | FKs cascade to items/guilds/guild_roles. | inventory/roles. | Runtime usage unclear. | medium | No timestamps/actor; cascade can remove role item bindings. | Defer until item/role inventory. |
| `item_service_actions` | Binds service item templates to OBS actions. | `item_id` unique, `action_type`, scene/source/text/media/visible/consume fields, `updated_by_member_id`, `updated_at`. | FK to `items` cascade; updater set null. | service items/OBS. | Overlaps `StreamerService` and streamer studio domains. | high | No created_at/created_by; no action history. | Defer to item/OBS inventory. |

### Craft Tables

| Table name | Purpose | Key columns | Relationships/FKs visible | Current owner/domain | Uncertainty | Risk | Traceability gaps | Suggested next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `craft_recipes` | Craft recipe header. | `name` unique, `description`, `result_item_id`, `result_amount`, `created_by_member_id`, `created_at`. | Result item cascades; creator set null. | craft. | Update owner unclear. | high | No `updated_at`, `updated_by_member_id`, disabled/archive flag. | Add update trace later after craft inventory. |
| `craft_recipe_ingredients` | Recipe ingredient rows. | `craft_recipe_id`, `item_id`, `amount`, unique `(craft_recipe_id, item_id)`. | FKs cascade to recipe/items. | craft. | none. | medium | No trace; deleting item deletes ingredient row. | Defer until craft/item inventory. |

### Jobs Tables

| Table name | Purpose | Key columns | Relationships/FKs visible | Current owner/domain | Uncertainty | Risk | Traceability gaps | Suggested next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `jobs` | Job definitions and rewards. | `job_key` unique, localized titles/descriptions, `reward_amount INT`, cooldown, enabled, optional reward item/chance/quantity, created/updated actor and timestamps. | Reward item set null; actor members set null. | jobs/economy/inventory. | Reward economy owner not centralized. | high | No audit for job runs; money reward is direct balance update in runtime. | Add job run trace/ledger only after economy inventory. |
| `member_job_cooldowns` | Per-member job cooldown state. | PK `(member_id, job_id)`, `last_run_at`. | FKs to members/jobs cascade. | jobs. | none. | medium | Only last run, no run history. | Consider future `job_runs` additive table if audit requires it. |

### OBS, Command Queue, And Relay Tables

| Table name | Purpose | Key columns | Relationships/FKs visible | Current owner/domain | Uncertainty | Risk | Traceability gaps | Suggested next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `bot_commands` | API-to-bot command queue. | `type`, `guild_id`, `requested_by_discord_id`, `payload_json`, `status`, `result_json`, `error_message`, timestamps. | No FK to members/guilds. | command queue/bridge. | Discord ids are raw strings by design or legacy. | high | No request id, no requested_by_member_id FK, no permission/audit context; completed/failed state retained but no retry count. | Later additive actor/request metadata after command queue inventory. |
| `obs_agent_statuses` | OBS agent online/status state. | `agent_id` PK, `online`, `connected_at`, `last_seen_at`, `disconnected_at`, `last_error`, `status_payload_json`, `updated_at`. | No FK. | OBS agent. | `agent_id` source/binding lives in `bot_settings`. | medium | No streamer FK or credential table relation. | Later normalize agent credentials/bindings out of `bot_settings`. |
| `obs_media_actions` | OBS shop/media action purchase and delivery tracking. | buyer/streamer ids, agent/product/media/price/duration/status/command/error/refund/timestamps. | FKs to `members` and `streamers` cascade. | OBS media/economy. | Whether `command_id` should FK to `bot_commands.id` is unclear; type mismatch currently string vs BIGINT. | high | No general ledger entry, no request id; member/streamer delete can erase action history. | Add audit/ledger foundation before changing relationships. |

### Streamer Tables

| Table name | Purpose | Key columns | Relationships/FKs visible | Current owner/domain | Uncertainty | Risk | Traceability gaps | Suggested next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `streamers` | Streamer registry. | `nickname` unique, `twitch_url` unique, `archived_at`, `archived_by_member_id`. | Archived by member set null. | streamers. | none. | high | No created_at/created_by/updated_at; archive exists but creation/update trace missing. | Add additive creation/update metadata after streamer inventory. |
| `guild_streamers` | Guild-to-streamer binding. | `guild_id`, `streamer_id`, `is_primary`, `created_by_member_id`, `created_at`, unique `(guild_id, streamer_id)`. | FKs cascade to guilds/streamers; creator set null. | streamers/guilds. | No constraint for one primary per guild. | high | No updated_at/updated_by; primary invariant enforced in service, not DB. | Later partial/functional primary constraint only after DB compatibility review. |
| `streamer_owners` | Streamer owner/manager access. | `streamer_id`, `member_id`, `role`, `created_at`, unique `(streamer_id, member_id)`. | FKs cascade. | streamer access/security. | none. | high | No created_by/updated_at. | Add actor fields only after access inventory. |
| `streamer_trusted_users` | Streamer trusted moderator/manager access. | `streamer_id`, `member_id`, `role`, `created_by_member_id`, `created_at`, unique `(streamer_id, member_id)`. | FKs cascade; created_by set null. | streamer access/security. | none. | high | No updated_at/updated_by/revoked_at; deletes lose history. | Consider additive `revoked_at`/audit later. |
| `streamer_services` | Streamer-managed paid service catalog. | `streamer_id`, `service_key`, title/description/type/media/duration, `price INT`, enabled, created/updated actor/timestamps, unique `(streamer_id, service_key)`. | FK streamer cascade; actor set null. | streamer services/economy/OBS. | Purchase flow owner crosses `StreamerServicesService`, `ShopObsService`, economy. | high | No service purchase table; price type differs from OBS/media/shop price types. | Defer to streamer services/economy inventory. |
| `streamer_applications` | Streamer application/review workflow. | applicant, guild id string, nickname/twitch/description, status, reviewer, streamer, reviewed/rejection/timestamps. | FKs to members cascade/set null and streamers set null. | streamer applications/admin. | `discord_guild_id` has no FK to `guilds`. | medium | No audit log beyond status/reviewer; cascade applicant delete erases applications. | Later audit/retention decision. |

### Notification And Settings Tables

| Table name | Purpose | Key columns | Relationships/FKs visible | Current owner/domain | Uncertainty | Risk | Traceability gaps | Suggested next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `notifications` | User notifications. | `member_id`, type, severity, title/body, image/link, `metadata_json`, `read_at`, `created_at`, `created_by_member_id`. | FKs to members cascade/set null. | notifications. | none. | medium | Deleting member erases notifications; no request/source field. | Add source/request metadata later if audit requires. |
| `bot_settings` | Generic key/value settings and also stores OBS URLs/passwords, agent credentials/bindings, contributor ids, locale flags, bootstrap status. | `setting_key` unique, `setting_value TEXT`, `updated_by_member_id`, `updated_at`. | Updated by member set null. | settings/mixed. | Many domains use it as generic storage. | high | No setting type, encryption flag, secret marker, domain owner, created_at, history; can hold sensitive values. | Security/settings inventory before expanding; normalize secrets later. |
| `schema_migrations` | Applied migration tracker. | `migration_name` unique, `applied_at`. | No FKs. | database operations. | none. | low | No checksum. | Optional later checksum only if migration process evolves. |

## 4. Relationship And Ownership Map

| Domain | Main tables | Current owner/code | Relationship notes | Risk |
| --- | --- | --- | --- | --- |
| member/profile | `members`, `api_sessions` | `MemberService`, `DiscordMetadataService`, `UserProfileService`, auth session service, legacy `DataBaseHandler` | `members.ds_member_id` is the external Discord id; many workflows still start from raw Discord id. `api_sessions.discord_id` is not an FK. | high |
| guild/member/permissions | `guilds`, `guild_members`, `guild_roles`, `guild_channels`, `member_roles`, command permission tables, moderation tables | `DataBaseHandler`, `GuildDashboardService`, `BotAdmin`, `PermissionController` | Guild delete cascades through many children. Several join tables lack visible unique constraints. | high |
| economy | `members.balance`, `members.ldm_balance`, `admin_economy_adjustments`, `economy_daily_snapshots`, price fields across item/streamer/OBS tables | `EconomyService`, `ItemService`, `ShopObsService`, `JobService`, commands | Current balances live on `members`; admin adjustments are the only explicit adjustment table; no general ledger. | high |
| inventory/market/shop | `items`, `member_items`, `item_public_market`, `item_general_store`, item lookup/service/action tables | `ItemService`, `StreamerService` | `ItemService` remains catch-all. Market/listing and inventory mutation tables cascade on item/member deletion. | high |
| craft/jobs | `craft_recipes`, `craft_recipe_ingredients`, `jobs`, `member_job_cooldowns` | `ItemService`, `JobService` | Craft and jobs can grant/change inventory/economy state but lack run history/audit. | high |
| OBS/queue | `bot_commands`, `obs_agent_statuses`, `obs_media_actions`, `bot_settings` | `BotCommandQueue`, `BotCommandWorker`, `Obs*Service`, `ShopObsService`, `StreamerStudioControlService` | Agent credentials/bindings appear stored in `bot_settings`; OBS media action command id is not a visible FK. | high |
| streamers/access | `streamers`, `guild_streamers`, `streamer_owners`, `streamer_trusted_users`, `streamer_services`, `streamer_applications` | `StreamerService`, `StreamerAccessService`, `StreamerServicesService`, `StreamerApplicationService` | Access tables have unique pairs but limited history; streamers have archive fields but not creation/update trace. | high |
| notifications/settings | `notifications`, `bot_settings`, `general_settings` | `NotificationService`, `SettingsService`, `BotAdmin`, several domain services | `bot_settings` is a mixed-domain key/value table with security-sensitive values. | high |

## 5. Traceability Gaps

| Gap | Affected tables/groups | Why it matters | Suggested next action |
| --- | --- | --- | --- |
| Missing member lifecycle metadata | `members` | Cannot distinguish OAuth-created, Discord interaction-created, system/demo-created, stale, partial, or complete profiles. | Add nullable/additive `created_at`, `updated_at`, `created_source`, `discord_profile_status`, `last_seen_at` after backfill plan. |
| No general audit log | all important mutation paths | Important state changes lack consistent actor/source/request metadata. | Add `audit_logs` foundation after database inventory, before broad cleanup. |
| No general economy ledger | balances, market, bot shop, OBS shop, jobs, roulette, admin adjustments | Balance changes outside admin adjustments are not traceable in a uniform way. | Add economy mutation inventory and then ledger design. |
| Generic settings lacks ownership/security labels | `bot_settings` | One table stores harmless config, status blobs, OBS config, credentials/bindings, contributor ids, locale flags. | Create settings/security inventory before normalizing. |
| Many cascade deletes can erase history | member/guild/streamer/item-linked tables | Deleting a parent can delete operational/audit-like data. | Block destructive changes until retention policy and audit strategy exist. |
| Missing created/updated actors on older tables | `guilds`, `guild_members`, `guild_roles`, `guild_channels`, `member_items`, market/shop listings, streamers | Hard to attribute bootstrap, grants, transfers, listings, or config changes. | Add additive metadata only where owner is clear. |
| Run/history tables absent | jobs, craft, service purchases, item transfers | Only latest/cooldown/listing state exists for some workflows. | Add history tables after domain inventories. |

## 6. Money Type Inventory

| Table/field | Type | Domain/use | Notes/risk |
| --- | --- | --- | --- |
| `members.balance` | `INT` | ODM current balance | Main balance field; direct mutations exist in multiple services/commands. |
| `members.ldm_balance` | `INT` | LDM current balance | Same row as identity/profile. |
| `general_settings.start_balance` | `INT` | Starting ODM balance | Used by member creation paths. |
| `general_settings.default_earning_multiply` | `FLOAT` | Default earning multiplier | Floating precision for economy multiplier. |
| `guilds.earning_multiply` | `FLOAT` | Guild earning multiplier | Floating precision and unclear ownership. |
| `item_public_market.price` | `FLOAT` | Player market listing price | Money price uses float; high precision risk. |
| `item_general_store.price` | `FLOAT` | Bot shop listing price | Money price uses float. |
| `items.bot_sell_price` | `DECIMAL(10,2)` | Bot sell price on item template | Decimal while balances are integer fields. |
| `jobs.reward_amount` | `INT` | Job reward amount | Directly credits `members.balance`. |
| `admin_economy_adjustments.amount` | `BIGINT` | Admin adjustment delta | Wider than `members.balance`/`ldm_balance`. |
| `admin_economy_adjustments.balance_after` | `BIGINT` | Post-adjustment balance | Wider than current balance columns. |
| `economy_daily_snapshots.total_odm` | `BIGINT` | Aggregate ODM snapshot | Wider aggregate type. |
| `economy_daily_snapshots.total_ldm` | `BIGINT` | Aggregate LDM snapshot | Wider aggregate type. |
| `streamer_services.price` | `INT` | Streamer service price | Integer price, distinct from market/shop float and OBS BIGINT. |
| `obs_media_actions.price_odm` | `BIGINT` | OBS media action purchase price | Wider than `members.balance`. |
| `obs_media_actions.refunded_odm` | `BIGINT` | OBS media refund amount | Wider than `members.balance`. |

Money inconsistency summary:

- Current balances are `INT`.
- Market/shop prices use `FLOAT`.
- Item bot sell price uses `DECIMAL(10,2)`.
- Admin adjustments, OBS media prices/refunds, and economy aggregates use `BIGINT`.
- Streamer service price and job reward use `INT`.
- Do not change these types destructively until an economy inventory and backfill/compatibility plan exist.

## 7. Audit And Ledger Gaps

Presence/absence:

- `audit_logs`: not found in `sql/tables.sql`, migrations, or searched source files.
- general economy ledger: not found in `sql/tables.sql`, migrations, or searched source files.
- `admin_economy_adjustments`: present, but covers admin adjustments only.
- `obs_media_actions`: present, but is OBS action-specific and not a general ledger.
- `bot_commands`: present, but is command queue state, not business audit.
- `notifications`: present, but user notification state is not audit.

Important mutations currently without a general audit/ledger:

- member creation/profile updates
- guild bootstrap/channel/role sync
- guild delete/stale guild cleanup
- market listing create/update/buy/cancel
- bot shop buy/sell
- item grants, transfers, craft consumes/grants
- job reward credits and item rewards
- roulette balance credit
- OBS media purchase charge/refund
- streamer access changes and trusted user revokes
- streamer agent credential/binding changes in `bot_settings`
- session creation/revocation

## 8. Security-Sensitive Storage

| Table/source | Sensitive data | Current shape | Risk | Suggested next action |
| --- | --- | --- | --- | --- |
| `api_sessions` | `access_token`, `refresh_token`, `user_json`, `guilds_json`, session token hash. | Tokens stored as `TEXT`; hash is unique; no FK to member. | high | Create `docs/security/SECURITY_REVIEW.md`; decide encryption/retention/revocation audit before schema change. |
| `bot_settings` | OBS websocket URL/password, OBS agent credentials/bindings, contributor IDs, bootstrap status, locale flags. | Generic key/value `TEXT`; updated_by and updated_at only. | high | Split secret/config/status ownership later; add domain/security metadata only after inventory. |
| `bot_commands.payload_json/result_json/error_message` | Admin action payloads, member ids, OBS commands, errors. | JSON/text queue payload. | high | Add request/actor trace and retention policy after command queue inventory. |
| `obs_agent_statuses.status_payload_json` | Agent status payload. | JSON telemetry. | medium | Confirm no secrets included in payload before broader logging. |
| `obs_media_actions.media_url/error_message` | Media URL and error details. | Text fields. | medium | Security review for URL lifetime/sensitive errors. |

## 9. Destructive Or Cascade Risk

| Risk area | Tables/FKs/queries | Why it matters | Blocked until |
| --- | --- | --- | --- |
| Guild delete cascade | `guilds` cascades to logs, roles, guild members, guild channels, guild streamers, guild item roles; `DataBaseHandler.deleteGuildFromDB` deletes guild rows; startup sync deletes stale guilds. | A guild delete can erase many relation rows and operational configuration. | Database inventory reviewed; explicit delete vs archive policy. |
| Member delete cascade | Member FKs cascade in notifications, member roles, guild members, member items, admin adjustments, streamer owners/trusted users, streamer applications, OBS media actions. | Deleting a member can erase inventory, notifications, economy traces, access rows, and applications. | Retention/audit policy. |
| Item delete cascade | `items` cascades to inventory, market listings, treasures, roles, craft recipes/ingredients, item service actions. | Deleting item templates can erase inventory and craft/OBS service configuration. | Item inventory and archive strategy. |
| Streamer delete cascade | Streamer FKs cascade to owners/trusted users/services/guild_streamers/OBS media actions; some code uses soft archive. | Hard delete would erase access and action history; soft archive exists but not universal. | Streamer inventory and retention policy. |
| Stale guild channel/role cleanup | `DataBaseHandler.ensureGuildChannels/ensureGuildRoles` deletes stale `guild_channels`, `logs_channels`, and `guild_roles`. | Sync can remove cached rows and cascaded role/channel dependent rows. | Guild bootstrap inventory. |
| Bot settings deletes | `StreamerService` deletes agent credential/binding keys from `bot_settings`. | Generic key deletes can remove sensitive config without history. | Settings/security inventory. |
| Demo/seed cleanup | `seed_demo_content.mjs` deletes craft ingredients per recipe and inserts/updates demo content/member inventory; `seed_economy_snapshots.mjs --clear` deletes snapshots. | Intended dev scripts can mutate data significantly. | Keep non-prod guardrails; document before production use. |

## 10. First Additive Migration Candidates

These are candidates only. No migration is created by this task.

| Candidate | Tables | Why additive | Prerequisites | Risk |
| --- | --- | --- | --- | --- |
| Member lifecycle metadata | `members`: nullable `created_at`, `updated_at`, `created_source`, `discord_profile_status`, `last_seen_at` | Adds traceability without changing existing behavior if nullable/defaulted carefully. | Backfill rules from stabilization plan; verify profile completeness definitions. | medium |
| General audit log foundation | new `audit_logs` table | New table, no existing data rewrite required. | Agree minimal columns: actor, target, action, source, request/guild metadata. | medium |
| Economy ledger foundation | new economy ledger table | New table can start empty and receive future writes incrementally. | `ECONOMY_MUTATION_INVENTORY.md`; money type policy. | high |
| Item market/shop listing timestamps | `item_public_market`, `item_general_store`: nullable `created_at`, `updated_at`, `updated_by_member_id` where applicable | Adds traceability for listings without changing price semantics. | `ITEM_SERVICE_INVENTORY.md`; owner decision. | medium |
| Streamer creation/update trace | `streamers`: nullable `created_at`, `created_by_member_id`, `updated_at`, `updated_by_member_id` | Complements existing archive fields. | Streamer owner decision and backfill. | medium |
| Guild lifecycle metadata | `guilds`: nullable `created_at`, `updated_at`, `created_source`, `last_seen_at` | Adds traceability before delete/archive changes. | Guild bootstrap inventory. | medium |
| Job run history | new `job_runs` table | New table can record future runs without changing cooldown behavior. | Economy/jobs inventory; decide retention. | medium |
| Settings metadata | `bot_settings`: nullable `setting_domain`, `is_secret`, `created_at` | Adds labels without moving values. | Security/settings inventory; backfill key prefixes. | medium |

## 11. Later Normalization Candidates

These are not first migrations.

| Candidate | Why later | Prerequisites |
| --- | --- | --- |
| Move balances out of `members` or introduce authoritative ledger-backed balances | High blast radius; many reads/writes depend on `members.balance` and `members.ldm_balance`. | Economy mutation inventory, ledger design, backfill, dual-read/dual-write plan. |
| Convert money fields to one numeric policy | Requires data conversion and API/business compatibility decisions. | Money policy, range/scale decision, backfill tests. |
| Split `members` profile/public/economy fields | Many services read/write `members` directly. | Member/profile inventory and repository boundary. |
| Normalize `bot_settings` into domain config/secret tables | Current code uses setting key prefixes across OBS, streamer agent, locale, bootstrap, admin contributors. | Settings/security inventory and migration plan. |
| Replace hard deletes/cascades with archive/retention model | Changes behavior and may affect cleanup expectations. | Retention policy, audit table, code changes. |
| Add missing unique constraints to join/cache tables | Could fail if duplicates already exist. | Duplicate diagnostics and cleanup plan. |
| Add FKs from raw Discord id string fields to canonical tables | Many fields intentionally store raw Discord ids and may not have matching rows. | Identity mapping policy and backfill. |
| Link `obs_media_actions.command_id` to `bot_commands.id` | Type mismatch and lifecycle coupling. | Command/action correlation design. |
| Normalize `guild_channels.ds_channel_id TEXT` to indexed varchar | Potential data conversion and index changes. | Verify max lengths, duplicates, code assumptions. |

## 12. Blocked Changes And Prerequisites

| Blocked change | Why blocked | Required prerequisites |
| --- | --- | --- |
| Any destructive migration | Violates stabilization plan unless explicitly reviewed. | Inventory, backup/rollback plan, production data diagnostics, manual approval. |
| Editing old migrations | Migration README says never edit old applied migrations. | Use a new numbered migration only after migration task is approved. |
| Changing money column types | Existing code mixes `INT`, `FLOAT`, `DECIMAL`, `BIGINT`; conversion could alter behavior. | Economy inventory, money policy, backfill/validation plan. |
| Removing `DataBaseHandler` guild/member behavior | It still owns guild bootstrap/delete and member/guild-member legacy paths. | Member lifecycle hardening, guild-member ownership, DB inventory acceptance. |
| Adding hard uniqueness constraints to relation tables | Duplicates may exist and would break migration. | Duplicate check scripts and remediation plan. |
| Normalizing `bot_settings` secrets | Sensitive, cross-domain, and currently used by multiple services. | Security review and owner map. |
| Deleting or archiving parent records differently | Cascades are current behavior and may be relied on. | Retention policy and audit strategy. |

## Explicit Non-Changes

- No runtime code was changed.
- No schema file was changed.
- No migration was changed or created.
- No table was normalized.
- No build is required for this docs-only inventory.
