# Guild Bootstrap Inventory

Task: KAN-31

This is a focused documentation inventory for guild bootstrap responsibilities that are currently mixed inside `src/core/DataBaseHandler.ts`.

This document is inventory-only. It does not change runtime code, schema, migrations, or ownership.

Implementation status note:

- KAN-33 extracted base guild record creation/lookup into `src/core/GuildRecordService.ts`.
- KAN-36 extracted `ensureLogType(name)` into `src/core/GuildLogSettingsService.ts`.
- KAN-37 extracted `ensureDefaultLogChannels(guildId, channelId)` into `src/core/GuildLogSettingsService.ts`.
- KAN-40 extracted `ensureGuildChannels(guildId, discordChannelIds)` into `src/core/GuildChannelCacheService.ts`.
- `DataBaseHandler.addGuildToDB(...)`, private `ensureGuildRecord(...)`, private `ensureLogType(...)`, private `ensureDefaultLogChannels(...)`, and private `ensureGuildChannels(...)` remain compatibility wrappers.
- `ensureGuildBootstrap(...)` still reaches channel sync through `DataBaseHandler`, and full guild bootstrap extraction is still not complete.

## Purpose / Scope

Read first:

- `docs/ARCHITECTURE_PLAN.md`
- `docs/refactor/STABILIZATION_PLAN.md`
- `docs/refactor/BACKEND_INVENTORY.md`
- `docs/refactor/DATABASE_HANDLER_USAGE_INVENTORY.md`
- `docs/refactor/DATABASE_INVENTORY.md`

Inspected runtime files:

- `src/core/DataBaseHandler.ts`
- `src/core/StreamerService.ts`
- `src/events/interactionCreate.ts`
- `src/events/guildCreate.ts`
- `src/events/guildDelete.ts`
- `src/events/clientReady.ts`
- `src/utils/syncWithDatabase.ts`

Scope of this inventory:

- guild bootstrap entry points
- `DataBaseHandler.ensureGuildBootstrap(...)` and related helper methods
- stale cleanup and destructive delete behavior
- overlap between guild bootstrap and member ownership
- small future extraction candidates only

Out of scope:

- runtime fixes
- schema changes
- migration work
- moving methods out of `DataBaseHandler`
- changing `isMemberExists(...)`
- one-shot rewrite proposals

Risk levels used here:

- low: read-only or narrow local blast radius
- medium: write path with bounded scope
- high: destructive cleanup, guild/member lifecycle overlap, startup sync, or broad cache reconciliation

## Entry Point Map

| Entry point | File | Current call | Trigger | What it reaches | Risk | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Discord guild join event | `src/events/guildCreate.ts` | `dataBaseHandler.ensureGuildBootstrap(guild)` | Bot is added to a guild | guild record ensure, owner guild-member ensure, channel sync, role sync, default log channel ensure | high | Also writes guild metadata through `DiscordMetadataService` and writes bootstrap status through `saveGuildBootstrapStatus(...)`. |
| Discord client startup sync | `src/events/clientReady.ts` -> `src/utils/syncWithDatabase.ts` | `dbHandler.ensureGuildBootstrap(guild)` for each current guild | Bot startup / reconnect | same bootstrap path as guild create | high | Startup sync is a second broad entry point for channel/role/log reconciliation. |
| Discord client startup stale cleanup | `src/utils/syncWithDatabase.ts` | `dbHandler.deleteGuildFromDB(id)` for DB guilds missing from current client guild set | Bot startup / reconnect | destructive guild delete | high | Delete is fired without awaiting the returned promise inside `forEach`; behavior should be treated as high-risk and not changed in a first extraction. |
| Discord guild delete event | `src/events/guildDelete.ts` | `dataBaseHandler.deleteGuildFromDB(guild)` | Bot removed from a guild | destructive guild delete | high | Direct destructive path. |
| Discord interaction guild/member bootstrap | `src/events/interactionCreate.ts` | `dataBaseHandler.isMemberExists(interaction.user.id, true, interaction.guildId, true, interaction)` | Any in-guild interaction | member ensure plus guild-member ensure | high | Not a full guild bootstrap, but it overlaps the same guild-member ownership surface used by `ensureGuildMemberStatus(...)`. |
| Streamer guild fallback | `src/core/StreamerService.ts` | `DataBaseHandler.getInstance().addGuildToDB(discordGuildId)` | Streamer registration/binding flows that need a guild row | guild row create only | medium | This bypasses `ensureGuildBootstrap(...)` and only ensures the base guild record. |

No HTTP route entry point was found that directly calls `ensureGuildBootstrap(...)` or `deleteGuildFromDB(...)`.

## Method Responsibility Table

| Method | Responsibility | Current behavior | Depends on | Writes/deletes | Risk | First-extraction note |
| --- | --- | --- | --- | --- | --- | --- |
| `addGuildToDB(guild)` | Minimal guild row creation | `DataBaseHandler` now delegates to `GuildRecordService`, which preserves the existing behavior: resolve default earning multiplier from general settings and insert one `guilds` row for a Discord guild id. | `DataBaseHandler` compatibility wrapper; `GuildRecordService`; `settingsService.ensureGeneralSettings()`; direct `guilds` insert | inserts `guilds` | medium | Base record creation/lookup was extracted by KAN-33, but the compatibility wrapper remains and broader bootstrap logic was not extracted. |
| `ensureGuildBootstrap(guild)` | Orchestrate guild bootstrap | Ensures guild row, ensures owner membership status, syncs channels, syncs roles, resolves bootstrap channel, ensures default log channels, returns summary counters. | `ensureGuildRecord(...)`, `ensureGuildMemberStatus(...)`, `ensureGuildChannels(...)`, `ensureGuildRoles(...)`, `ensureDefaultLogChannels(...)` | inserts/updates/deletes across several guild tables | high | This is the orchestration seam, but it should not be extracted first because its helpers still mix destructive cleanup and member overlap. |
| `ensureGuildRecord(guild)` | Resolve-or-create guild row | `DataBaseHandler` now delegates to `GuildRecordService`, which preserves the existing behavior: look up `guilds` by `ds_guild_id`, create one with `addGuildToDB(...)` if missing, then re-read the created row. | `DataBaseHandler` compatibility wrapper; `GuildRecordService`; `addGuildToDB(...)`; direct `guilds` read | inserts `guilds` | medium | Base record creation/lookup was extracted by KAN-33, but `ensureGuildBootstrap(...)` still consumes it through the wrapper and broader bootstrap extraction is still future work. |
| `ensureGuildMemberStatus(discordUserId, guildId, memberStatusId)` | Ensure owner/member relationship row and desired status | Resolves member through `isMemberExists(discordUserId, true)`, loads `guild_members`, updates `member_status_id` when mismatched, or inserts a new `guild_members` row. | `isMemberExists(...)`, `getFromTable(...)`, `updateTable(...)`, `addRecords(...)` | inserts/updates `guild_members`; may indirectly create `members` | high | This is the main ownership overlap with member lifecycle. Do not extract blindly before separating member ensure from guild-member ensure. |
| `ensureGuildChannels(guildId, discordChannelIds)` | Sync guild channel cache to Discord snapshot | `DataBaseHandler` now delegates to `GuildChannelCacheService`, which preserves the existing behavior: read current `guild_channels`, compute insert and stale sets, delete stale `guild_channels`, prune stale `logs_channels`, then insert missing channel ids. | `DataBaseHandler` compatibility wrapper; `GuildChannelCacheService`; direct `guild_channels` read/insert/delete; direct `logs_channels` prune | inserts `guild_channels`; deletes `guild_channels` and `logs_channels` | high | Wrapper extraction was completed by KAN-40, but the behavior remains destructive, order-dependent, non-transactional, and not semantically hardened. It can also indirectly affect downstream rows such as `twitch_notification_channels` through existing guild channel FK cascades. |
| `ensureGuildRoles(guildId, discordRoleIds)` | Sync guild role cache to Discord snapshot | Loads current `guild_roles`, inserts missing role ids, deletes stale `guild_roles`. | `getFromTable(...)`, `addRecords(...)`, raw `pool.query(...)` delete | inserts/deletes `guild_roles` | high | Stale role cleanup is destructive. Mark as high-risk. |
| `resolveBootstrapChannelId(guild)` | Pick best text channel for bootstrap/log defaults | Prefers `systemChannelId` when sendable, otherwise first sendable text channel, ignoring threads. | guild channel cache in Discord.js only | none | medium | Pure runtime helper; safe to leave coupled to bootstrap orchestrator until write surfaces are isolated. |
| `ensureDefaultLogChannels(guildId, channelId)` | Ensure default log channel rows exist and follow chosen bootstrap channel | `DataBaseHandler` now delegates to `GuildLogSettingsService`, which preserves the existing behavior: no-op on null channel, ensure `ban_logs` and `mute_logs`, insert missing `logs_channels` rows, and update only `ds_channel_id` when the first existing row differs. | `DataBaseHandler` compatibility wrapper; `GuildLogSettingsService`; `ensureLogType(...)`; direct `logs_channels` read/insert/update | inserts/updates `log_types`, `logs_channels` | high | Wrapper extraction was completed by KAN-37, but orchestration still consumes it through `DataBaseHandler` and stale cleanup warnings elsewhere remain unchanged. |
| `ensureLogType(name)` | Resolve-or-create log type lookup row | `DataBaseHandler` now delegates to `GuildLogSettingsService`, which preserves the existing behavior: read `log_types` by name, return the first existing row id, or insert one if missing. | `DataBaseHandler` compatibility wrapper; `GuildLogSettingsService`; direct `log_types` read/insert | inserts `log_types` | medium | Wrapper extraction was completed by KAN-36, but broader guild log settings ownership is still only partially implemented. |
| `deleteGuildFromDB(guild)` | Delete guild row by id or Discord id | Resolves guild id input form and runs a raw `DELETE FROM guilds ...`. Returns not found when no row deleted. | raw `pool.query(...)` | deletes `guilds` row and all cascading children | high | Direct destructive path. Must not be touched in a first extraction. |

## Tables Touched Table

| Method | Tables touched | Read | Insert | Update | Delete | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `addGuildToDB(...)` | `guilds`, `general_settings` | `general_settings` via settings service | `guilds` | none | none | Uses default earning multiplier from settings. |
| `ensureGuildRecord(...)` | `guilds` | `guilds` | `guilds` via `addGuildToDB(...)` | none | none | Re-reads created row after insert. |
| `ensureGuildMemberStatus(...)` | `members`, `guild_members` | `members` indirectly via `isMemberExists(...)`; `guild_members` | `members` indirectly possible; `guild_members` | `guild_members.member_status_id` | none | This is the clearest guild/member overlap point. |
| `ensureGuildChannels(...)` | `guild_channels`, `logs_channels` | `guild_channels` | `guild_channels` | none | `guild_channels`, `logs_channels` | Deletes stale cache rows and prunes stale log channel bindings. |
| `ensureGuildRoles(...)` | `guild_roles` | `guild_roles` | `guild_roles` | none | `guild_roles` | Deletes stale role cache rows. |
| `ensureDefaultLogChannels(...)` | `log_types`, `logs_channels` | `log_types`, `logs_channels` | `log_types`, `logs_channels` | `logs_channels.ds_channel_id` | none | Couples guild bootstrap to log settings defaults. |
| `ensureLogType(...)` | `log_types` | `log_types` | `log_types` | none | none | Lookup maintenance helper. |
| `ensureGuildBootstrap(...)` | `guilds`, `members`, `guild_members`, `guild_channels`, `guild_roles`, `log_types`, `logs_channels` | all helper reads | all helper inserts | helper updates | helper deletes | Cross-table orchestration entry point. |
| `deleteGuildFromDB(...)` | `guilds` plus all FK-dependent child tables | none | none | none | `guilds` and cascade children | Destructive blast radius depends on schema FK cascade behavior. |

## Destructive Or Stale-Cleanup Behavior

The following behaviors are high-risk and should be treated as do-not-touch for a first extraction.

| Surface | Current behavior | Why high-risk |
| --- | --- | --- |
| `ensureGuildChannels(...)` stale cleanup | Deletes `guild_channels` rows that are no longer present in the Discord snapshot. Then deletes `logs_channels` rows whose `ds_channel_id` is no longer in the active channel id set for the guild. | This is destructive cache reconciliation across two tables. A mistake here can silently remove channel config state. |
| `ensureGuildRoles(...)` stale cleanup | Deletes `guild_roles` rows that are no longer present in the Discord snapshot. | This is destructive cache reconciliation for role state and may affect permission/role-related joins. |
| `deleteGuildFromDB(...)` | Deletes the `guilds` row directly by id or `ds_guild_id`. Child effects depend on FK cascades. | This is the highest-risk path because it can wipe guild-scoped cached and relationship data in one call. |
| startup stale guild cleanup | `syncDiscordClientWithDatabase(...)` deletes DB guilds missing from the current Discord client guild set. | This combines startup reconciliation with destructive delete behavior. |

Inventory conclusion:

- stale channel cleanup is high-risk
- stale role cleanup is high-risk
- guild delete is high-risk
- startup-triggered delete is high-risk
- none of these should be part of a first extraction PR

## Member Ownership Overlap

Guild bootstrap is not only guild-owned today.

The main overlap points are:

| Overlap area | Current behavior | Why it matters |
| --- | --- | --- |
| `ensureGuildMemberStatus(...)` -> `isMemberExists(discordUserId, true)` | Guild bootstrap may create a member as a side effect before it can create/update `guild_members`. | This couples guild bootstrap to legacy member creation behavior. |
| `interactionCreate.ts` guild/member path | In-guild interactions call `isMemberExists(interaction.user.id, true, interaction.guildId, true, interaction)` outside `ensureGuildBootstrap(...)`. | Guild-member ensuring already has a second hot-path entry point outside full guild bootstrap. |
| owner bootstrap | `ensureGuildBootstrap(...)` always ensures the guild owner membership with `MemberStatuses.GuildOwner`. | Guild bootstrap is mutating guild-member status, not only guild record/channel/role caches. |
| legacy wrapper behavior | `isMemberExists(...)` can multiplex Discord, command, bootstrap, and service callers. | This is why it should not be reworked together with guild extraction in one step. |

Inventory implication:

- `ensureGuildMemberStatus(...)` should not be extracted first
- member creation side effects must remain stable while guild surfaces are being inventoried
- first extraction candidates should prefer guild-record or lookup-only pieces over member-overlapping pieces

## Guild Ownership Candidates

These are inventory candidates only. They are not a rewrite plan.

| Candidate boundary | Likely responsibilities | Current methods that map here | Risk notes |
| --- | --- | --- | --- |
| `GuildBootstrapService` | Orchestrate bootstrap using narrower dependencies and return bootstrap summary | `ensureGuildBootstrap(...)`, `resolveBootstrapChannelId(...)` | Do not start here first; orchestration still depends on destructive cleanup and member overlap. |
| `GuildRecordService` or guild repository | Resolve/create base guild rows | `ensureGuildRecord(...)`, `addGuildToDB(...)` | Partially implemented by KAN-33 for base record creation/lookup only. `DataBaseHandler` wrappers and all broader bootstrap responsibilities remain in place. |
| `GuildMemberService` | Ensure guild-member relationship and member status | `ensureGuildMemberStatus(...)` | High-risk because it depends on legacy `isMemberExists(...)`. |
| `GuildChannelCacheService` or guild channel repository | Read/insert/delete channel cache rows and prune stale log channel bindings | `ensureGuildChannels(...)` | Partially implemented by KAN-40 for guild channel cache read/insert sync, stale `guild_channels` delete, and stale `logs_channels` prune only. `DataBaseHandler` wrappers and broader bootstrap orchestration remain in place. |
| guild role repository | Read/insert/delete role cache rows | role read/insert/delete parts of `ensureGuildRoles(...)` | Same stale cleanup warning as channels. |
| `GuildLogSettingsService` | Resolve log types and default log channel bindings | `ensureDefaultLogChannels(...)`, `ensureLogType(...)` | Partially implemented by KAN-36 and KAN-37 for log type lookup/creation and default log channel configuration only. `DataBaseHandler` wrappers and broader bootstrap orchestration remain in place. |

## Do-Not-Touch List

- Do not change `DataBaseHandler.isMemberExists(...)` as part of the first guild extraction slice.
- Do not combine member lifecycle work with guild bootstrap extraction.
- Do not change stale delete semantics in `ensureGuildChannels(...)` on the first extraction.
- Do not change stale delete semantics in `ensureGuildRoles(...)` on the first extraction.
- Do not change `deleteGuildFromDB(...)` behavior on the first extraction.
- Do not change startup stale guild delete behavior in `syncDiscordClientWithDatabase(...)` on the first extraction.
- Do not combine log settings extraction with channel cache extraction in one first PR.
- Do not propose a one-shot `DataBaseHandler` rewrite.
- Do not change bootstrap status logging (`saveGuildBootstrapStatus(...)`) in the same first extraction unless the task is explicitly about operational reporting.

## Possible Future Extraction Sequence

This is intentionally small-step and inventory-driven.

1. Completed by KAN-33: isolate the minimal guild record boundary.
   Completed scope: `addGuildToDB(...)` and `ensureGuildRecord(...)` only.
   Current state: base guild record creation/lookup now lives in `GuildRecordService`, while `DataBaseHandler` keeps compatibility wrappers and all broader bootstrap behavior remains unchanged.

2. Completed by KAN-36 and KAN-37: inventory-preserving guild log settings wrapper extraction.
   Completed scope: `ensureLogType(...)` and `ensureDefaultLogChannels(...)` only.
   Current state: `GuildLogSettingsService` now owns log type lookup/creation and default log channel configuration, while `DataBaseHandler` keeps compatibility wrappers and `ensureGuildBootstrap(...)` orchestration remains unchanged.

3. Completed by KAN-40: inventory-preserving guild channel cache wrapper extraction.
   Completed scope: `ensureGuildChannels(...)` only.
   Current state: `GuildChannelCacheService` now owns guild channel cache read/insert sync, stale `guild_channels` delete, and stale `logs_channels` prune, while `DataBaseHandler` keeps the compatibility wrapper and `ensureGuildBootstrap(...)` orchestration remains unchanged.
   Caveat: stale channel cleanup remains behavior-preserved only. No transaction, dedupe, upsert, schema change, constraint/index change, or empty-snapshot guard was added.

4. Separate role cache sync from orchestration, but preserve exact stale-delete behavior.
   Candidate scope: only after the channel path is understood and kept stable.
   Risk note: high-risk because stale role cleanup must remain exact.

5. Leave `ensureGuildMemberStatus(...)` and `deleteGuildFromDB(...)` for later.
   Why: they are still the strongest overlaps with member ownership and destructive delete risk.

This sequence is not a mandate. It is the smallest extraction order suggested by the current inventory.

## Open Questions

| Question | Why it matters |
| --- | --- |
| Should missing guilds at startup always be hard-deleted from DB, or should there eventually be an archive/tombstone state? | This affects `deleteGuildFromDB(...)` and startup stale cleanup risk. |
| Is the current stale `logs_channels` pruning in `ensureGuildChannels(...)` fully intended, or is it only a bootstrap convenience? | This determines whether log channel config belongs to guild cache sync or dedicated log settings ownership. |
| Should guild owner membership be the only `ensureGuildMemberStatus(...)` responsibility inside bootstrap, or is broader member reconciliation expected later? | This affects future `GuildMemberService` scope. |
| Does `StreamerService.ensureGuildByDiscordId(...)` need only a base guild row forever, or should streamer flows eventually require full bootstrap guarantees? | This affects whether `addGuildToDB(...)` can stand alone cleanly. |
| Are duplicate-protection constraints for `guild_members`, `guild_channels`, and `guild_roles` guaranteed by current schema/runtime assumptions? | This matters before any repository extraction that preserves insert semantics. |
| Should bootstrap status persistence stay coupled to events/startup adapters, or later move beside bootstrap orchestration? | This affects operational reporting ownership but is not a first extraction concern. |

## Explicit Non-Changes

- No runtime code was changed by this KAN-41 documentation update.
- No schema or migration file was changed by this KAN-41 documentation update.
- KAN-33, KAN-36, KAN-37, and KAN-40 already extracted only the base guild record, guild log settings, and guild channel cache wrappers into `GuildRecordService`, `GuildLogSettingsService`, and `GuildChannelCacheService`; no additional `DataBaseHandler` methods were moved by this documentation update.
- No additional refactor was performed by this documentation update.
- No build is required for this docs-only task.