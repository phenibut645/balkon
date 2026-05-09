# DB Table Ownership

Task: KAN-60

This document records the current table ownership map for stabilization work.

It is a planning and review artifact. It does not change runtime code, schema, migrations, or current ownership by itself.

Every table or table group should have an explicit persistence owner. That owner may be a table repository, aggregate repository, domain service, or read-model/query service depending on the use case. The goal is explicit ownership and domain-specific methods that protect invariants, not one mechanical class per table and not a generic CRUD layer.

Read together with:

- `docs/refactor/DB_ACCESS_BOUNDARY.md`
- `docs/refactor/DATABASE_INVENTORY.md`
- `docs/refactor/DATABASE_HANDLER_USAGE_INVENTORY.md`
- `docs/refactor/GUILD_BOOTSTRAP_INVENTORY.md`
- `docs/refactor/MEMBER_LIFECYCLE_METADATA_PLAN.md`

Column meanings:

- current write owner(s): who currently mutates the table in runtime code
- target owner: the intended future owner or primary persistence boundary; this may be a repository, domain service, or read-model/query owner depending on the use case
- known read-model consumers: important readers, not necessarily exhaustive
- risk/caveat: why the table is dangerous or ambiguous today
- migration/schema notes: key additive, duplicate, or cascade warnings

## Ownership Map

| Table or table group | Current write owner(s) | Target owner | Known read-model consumers | Risk/caveat | Migration/schema notes |
| --- | --- | --- | --- | --- | --- |
| `members` | `MemberService`, `DiscordMetadataService`, `EconomyService`, `ItemService`, `JobService`, `ShopObsService`, `LocalePreferenceRepository`, remaining legacy `DataBaseHandler` call paths | `MemberService` for lifecycle/profile shell; `EconomyService` for some balance mutations and some balance reads; smaller read/query boundaries for projections | auth/session flows, overview/dashboard reads, item/streamer services, commands, notifications | overloaded identity/profile/economy row; many direct or indirect writers still exist, and balance writes are still not centralized even after KAN-62 moved roulette payout behind `EconomyService` and KAN-67 moved `/balance` reads behind it | additive lifecycle columns already introduced; balance extraction is deferred; preserve old rows/backfill safety |
| `guild_members` | legacy `DataBaseHandler`, `GuildMemberService`, bootstrap helpers | `GuildMemberService` plus later explicit bootstrap owner | permission controller, guild dashboard, bot admin founder audit, moderation joins | duplicate risk; mixed interaction/bootstrap ownership; no unique `(guild_id, member_id)` | schema currently allows duplicates; do not add constraints before duplicate review |
| `guilds` | `GuildRecordService`, legacy `DataBaseHandler`, `DiscordMetadataService`, `StreamerService` fallback | `GuildRecordService` plus later `GuildRepository` or `GuildBootstrapService` | startup sync, guild dashboard, bootstrap status, streamer bindings | destructive delete and bootstrap orchestration remain high-risk | delete/archive policy still unresolved; schema has broad cascades |
| `guild_channels` | `GuildChannelCacheService`, legacy bootstrap paths | `GuildChannelCacheService` or later `GuildChannelRepository` | bootstrap logic, notification channel joins, guild dashboard | stale cleanup is destructive and behavior-preserved only | no uniqueness on guild/channel id pair; cleanup semantics need dedicated review |
| `guild_roles` | `GuildRoleCacheService`, legacy bootstrap paths | `GuildRoleCacheService` or later `GuildRoleRepository` | permission joins, role status bindings, item-role bindings | stale cleanup is destructive and cascades widely | no uniqueness on guild/role id pair; FK cascades require caution |
| `log_types` | `GuildLogSettingsService`, legacy bootstrap wrappers | `GuildLogSettingsService` | bootstrap/default log setup, founder audit | lookup ownership is narrow but tied to guild log config | `name` is not unique in schema; changes need duplicate review |
| `logs_channels` | `GuildLogSettingsService`, `GuildChannelCacheService` stale prune, legacy bootstrap wrappers | `GuildLogSettingsService` plus later dedicated log settings boundary | founder audit, moderation/admin reads | mixed between log settings ownership and channel cleanup side effects | stale prune remains behavior-preserved only |
| `bot_settings` | `BotAdmin`, `LocalePreferenceRepository`, `ObsService`, `StreamerService`, bootstrap status writers, other admin/config surfaces | split by dedicated owners such as `BotContributorRepository`, `LocalePreferenceRepository`, `ObsSettingsRepository`, bootstrap status read/write model | admin dashboard, OBS config reads, locale explicit-selection checks, startup/bootstrap status reads | mixed-domain key/value table with security-sensitive content | avoid broadening this table without settings/security inventory; `LocalePreferenceRepository` owns only `member_locale_selected:*` keys |
| `items`, `item_types`, `item_rarities`, `item_treasures`, `treasure_contents`, `item_roles`, `item_service_actions` | mostly `ItemService`; some streamer/OBS-adjacent writes touch `item_service_actions` | split into `ItemCatalogRepository` plus narrower service-item owner | inventory, market, craft, dashboard/inventory reads | `ItemService` is overloaded and mixes catalog with downstream business flows | schema is highly connected and cascade-heavy; inventory first before constraints |
| `member_items` | `ItemService` | `InventoryRepository` or `InventoryService` boundary | inventory routes, market flows, craft flows | inventory mutation and transfer history are not isolated | audit/ledger needs separate design before normalization |
| `item_public_market` | `ItemService` | `MarketRepository` or market service boundary | market routes, overview projections | market writes still live in broad `ItemService` | prices are float; audit/history absent |
| `item_general_store` | `ItemService` | `BotShopRepository` or shop boundary | shop/dashboard reads, item service consumers | generic update helper still used for price writes | price type is float; update ownership still broad |
| `craft_recipes`, `craft_recipe_ingredients` | `ItemService` | `CraftRepository` or craft service boundary | craft routes and recipe projections | craft writes and reads sit inside overloaded `ItemService` | preserve current rows before any schema hardening |
| `streamers` | `StreamerService`, `StreamerApplicationService` review flows | `StreamerRepository` or narrower streamer domain boundary | admin streamer routes, streamer studio, OBS/media/shop flows | `StreamerService` remains broad and overlaps with OBS and guild binding behavior | archive exists, but creation/update trace is incomplete |
| `guild_streamers` | `StreamerService` | streamer-guild binding repository or `StreamerRepository` companion boundary | guild streamer reads, OBS/shop/streamer studio flows | primary binding semantics are service-enforced, not DB-enforced | unique `(guild_id, streamer_id)` exists; primary invariant still app-level |
| `streamer_services` | `StreamerServicesService` and related streamer/admin flows | `StreamerServicesRepository` or explicit service catalog boundary | dashboard/admin routes, OBS/shop flows | purchase/economy ownership crosses multiple services | service purchase audit table is still missing |
| `streamer_owners`, `streamer_trusted_users` | `StreamerAccessService`, `StreamerService`, application/admin flows | `StreamerAccessRepository` | access checks, streamer admin surfaces | authorization-sensitive tables with limited history | preserve uniqueness and access semantics before changes |
| `obs_agent_statuses` | `ObsAgentStatusService` | `ObsAgentStatusService` or later repository | streamer studio, admin/OBS status reads | accepted narrow OBS boundary, but still tied to generic `bot_settings` binding world | schema is independent, but ownership around credentials remains split |
| `obs_media_actions` | `ShopObsService`, OBS/shop/media workflows | dedicated OBS media action repository plus shop/use-case owner | dashboard/admin/shop reads | money and external side effects meet here | general ledger/audit still missing; preserve traces carefully |
| `notifications` | `NotificationService` | `NotificationService` or later repository | overview/dashboard, notification routes | reasonable owner exists, but member delete cascades remove history | additive source/request metadata can come later |
| `api_sessions` | auth/session service layer | dedicated auth session repository/service | session middleware, dashboard `/me`, auth flows | stores sensitive tokens and is not FK-linked to `members` | security review required before schema hardening |
| `member_roles` | permission and role-management legacy surfaces | later permission or guild role assignment boundary | permission controller, guild dashboard role-derived views | currently part of broad guild/permission surface | duplicate constraints and audit trail need review |
| `role_command_permissions` | permission legacy surfaces | `PermissionRepository` | permission controller and command access checks | authorization-sensitive and coupled to guild role lifecycle | uniqueness and audit/source metadata are deferred |
| `member_command_permissions` | permission legacy surfaces | `PermissionRepository` | permission controller and command access checks | authorization-sensitive and coupled to guild-member lifecycle | uniqueness and audit/source metadata are deferred |
| `guild_role_statuses` | role/status legacy surfaces | guild role/status repository or permission boundary | guild dashboard and status-derived logic | tied to destructive guild role cleanup cascades | duplicate review required before constraints |
| `guild_item_roles` | `ItemService` and streamer/item-role related flows | item-role binding repository | item/role projections, guild role joins | mixed between item and guild-role domains | cascade-heavy join table; inventory first |
| `mute_roles` | moderation legacy surfaces | moderation repository or service boundary | moderation/admin reads | moderation boundary still legacy and narrow ownership is unclear | preserve moderation history assumptions before changes |
| `twitch_notification_channels` | legacy notification loading and streamer notification flows | streamer notification repository/read model | bot startup notification load, streamer notification runtime | currently read through legacy `DataBaseHandler.loadStreamers()` joins | channel and streamer cascades can erase bindings |

## Accepted Transitional Boundaries

The following boundaries are currently accepted to touch the tables listed above, with explicit caveats:

| Boundary | Tables or groups it currently touches | Why it is accepted now | Caveat |
| --- | --- | --- | --- |
| `GuildRecordService` | `guilds`, indirect `general_settings` read | narrow extracted guild record boundary | bootstrap still orchestrated elsewhere |
| `GuildLogSettingsService` | `log_types`, `logs_channels` | narrow extracted guild log settings boundary | broader guild logging ownership is still partial |
| `GuildChannelCacheService` | `guild_channels`, stale `logs_channels` prune | narrow extracted channel cache boundary | destructive cleanup remains behavior-preserved only |
| `GuildRoleCacheService` | `guild_roles` | narrow extracted role cache boundary | destructive cleanup remains behavior-preserved only |
| `GuildMemberService` | `guild_members`, `guilds` read, fallback `members` ensure via `MemberService` | narrow interaction-only guild-member boundary | not full guild-member ownership |
| `MemberService` | `members`, indirect `general_settings` read | primary lifecycle creation and seen owner | `members` still mixes too many domains |
| `DiscordMetadataService` | `members`, `guilds` metadata cache writes | accepted subordinate metadata boundary | must not become an independent member creator |
| `EconomyService` | `members`, `admin_economy_adjustments`, `economy_daily_snapshots` | accepted current economy boundary for admin adjustments, reporting, roulette payout credit, and the narrow `/balance` read path | direct balance writes still exist elsewhere, and not all balance reads are centralized yet; this is not complete economy ownership |
| `LocalePreferenceRepository` | `members.locale`, `bot_settings` `member_locale_selected:*` rows | accepted narrow locale preference persistence boundary after KAN-65 | must stay limited to locale preference persistence; not a generic settings or members repository |
| `SettingsService` | `general_settings` | accepted settings owner for one narrow table | does not solve `bot_settings` |
| OBS and streamer services | `bot_settings`, `streamers`, `guild_streamers`, `streamer_services`, OBS-related tables | currently necessary domain surfaces | still broad and need further inventory-driven splits |

## Immediate Ownership Warnings

These warnings are documented facts and should remain visible during stabilization:

- KAN-62 removed the direct `src/commands/roulette.ts` `DataBaseHandler.updateTable(...)` mutation; roulette payout now goes through a tiny `EconomyService` method, but the wider roulette or economy semantics still need dedicated review.
- KAN-67 removed the direct `src/commands/balance.ts` generic helper read; `/balance` now reads through a tiny `EconomyService` method, but broader economy ownership cleanup is still incomplete and `/menu` still needs separate treatment.
- `src/core/ItemService.ts` is still an overloaded persistence boundary and should not be treated as a model for new DB code.
- `src/core/StreamerService.ts` is still an overloaded persistence boundary and should not be treated as a model for new DB code.
- `bot_settings` is still a mixed settings/admin/security surface.
- destructive guild, channel, and role cleanup paths remain high-risk and behavior-preserved only.

## Staged Ownership Migration Plan

1. Stage 1: document the law and ownership map.
2. Stage 2: stop new violations and new adapter-level SQL.
3. Stage 3: route obvious command/event writes through existing owners.
4. Stage 4: split large services by inventory and narrow boundaries, not by one-shot rewrite.
5. Stage 5: revisit destructive cleanup semantics, duplicate rows, and schema constraints only after dedicated reviews.

## Explicit Non-Changes

- This document does not change current runtime ownership.
- This document does not declare the current state healthy.
- This document does not remove any existing caveats from other inventories.
- This document does not change schema or migrations.