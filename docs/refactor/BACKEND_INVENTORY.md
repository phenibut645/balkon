# Balkon Backend Inventory

Task: KAN-3

Purpose: factual backend inventory before refactoring. This document intentionally does not propose runtime changes.

Read first:

- `docs/ARCHITECTURE_PLAN.md`
- `docs/refactor/STABILIZATION_PLAN.md`

Scope inspected:

- API route files under `src/api/routes/**`
- Discord event handlers under `src/events/*`
- Discord command files under `src/commands/*`
- services and mixed core modules under `src/core/*`
- direct SQL access through `pool.query`
- direct `INSERT INTO members`
- direct balance mutations through `UPDATE members SET balance/ldm_balance`
- `DataBaseHandler` imports/usages

Risk levels:

- low: read-only, thin adapter, or limited local blast radius
- medium: writes state, owns validation/authorization, or uses legacy helper boundaries
- high: changes money/member/item/guild lifecycle, mixes domains, queues side effects, or is a large catch-all file

## Source Plan Facts

| File path | What it does | Why it matters | Owner/domain | Uncertainty | Risk |
| --- | --- | --- | --- | --- | --- |
| `docs/ARCHITECTURE_PLAN.md` | Defines the Balkon architecture law: inventory first, no SQL in routes/commands, member/economy ownership, no catch-all layers. | This inventory is measured against those guardrails. | architecture/stabilization | none | low |
| `docs/refactor/STABILIZATION_PLAN.md` | Defines the stabilization execution plan and names this backend inventory as Milestone 1. | Confirms that this task is docs-only and should precede refactors. | architecture/stabilization | none | low |

## API Route Files And Endpoints

All API routes are registered by `src/api/server.ts` under `/api`.

| File path | Endpoints | What it does | Why it matters | Owner/domain | Uncertainty | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| `src/api/routes/baseRoutes.ts` | `GET /health`; `GET /version` | Health/version checks. | Operational liveness endpoints; no business writes. | platform/api | none | low |
| `src/api/routes/bridgeRoutes.ts` | `POST /guilds/:guildId/members/:memberId/kick` | Enqueues a bot command for a sensitive guild member kick. | Bridges web API to Discord bot command queue; authorization and audit expectations are important. | admin/guild bridge | exact owner between admin and guild is not fully formalized | high |
| `src/api/routes/dashboardRoutes.ts` | `GET /me`; `GET /overview/me`; `GET /guilds/me`; `GET /guilds/:guildId/overview`; `GET /botshop`; `GET /shop/obs/media/actions`; `GET /shop/obs/streamers`; `GET /shop/obs/streamers/:streamerId`; `POST /shop/obs/streamers/:streamerId/media/:productId/purchase`; `GET /craft/recipes`; `GET /admin/stats`; `GET /admin/obs/media/actions`; `POST /admin/notifications/broadcast`; `GET /admin/items`; `POST /admin/items`; `PATCH /admin/items/:itemTemplateId`; `DELETE /admin/items/:itemTemplateId`; `GET /admin/item-rarities`; `GET /admin/search/item-types`; `GET /admin/search/item-templates`; `GET /admin/search/rarities`; `GET /admin/botshop`; `POST /admin/botshop`; `DELETE /admin/botshop/:listingId`; `GET /admin/craft/recipes`; `POST /admin/craft/recipes`; `PATCH /admin/craft/recipes/:recipeId`; `DELETE /admin/craft/recipes/:recipeId`; `GET /economy/me`; `POST /admin/economy/adjust`; `POST /botshop/:listingId/buy` | Legacy dashboard route composition file plus remaining real handlers for overview, guilds, OBS shop, admin item/craft/botshop, notifications, economy adjustment, and bot shop purchase. | Still contains validation and response mapping for many domains; route extraction is incomplete. | dashboard/api composition plus mixed domains | several handlers belong to inventory, economy, OBS, admin, notifications, guilds | high |
| `src/api/routes/dashboard/adminStreamerRoutes.ts` | `GET /admin/streamers`; `DELETE /admin/streamers/:streamerId` | Admin streamer list and archive/remove. | Admin mutation path for streamer lifecycle. | admin/streamers | none | medium |
| `src/api/routes/dashboard/craftExecutionRoutes.ts` | `POST /craft/:recipeId/craft` | Runs a craft recipe for authenticated user. | Touches inventory/craft write path and likely item mutations. | craft/inventory | exact split between craft and inventory owner is not formalized | high |
| `src/api/routes/dashboard/inventoryRoutes.ts` | `GET /inventory`; `POST /inventory/:inventoryItemId/market-listing`; `POST /inventory/:inventoryItemId/sell-to-bot`; `POST /inventory/:inventoryItemId/use-service` | Inventory reads and item listing/sell/use flows. | Item ownership, market listing, bot sale, and service use are high-risk write paths. | inventory/market/OBS service item | boundaries are currently mixed in `ItemService`/`StreamerService` | high |
| `src/api/routes/dashboard/jobRoutes.ts` | `GET /jobs`; `POST /jobs/:jobId/run`; `GET /admin/jobs`; `POST /admin/jobs`; `PATCH /admin/jobs/:jobId`; `DELETE /admin/jobs/:jobId` | User job execution and admin job CRUD. | Job execution directly rewards balance/items; admin CRUD changes reward rules. | jobs/economy | none | high |
| `src/api/routes/dashboard/marketRoutes.ts` | `GET /market`; `POST /market/:listingId/buy`; `PATCH /market/:listingId`; `DELETE /market/:listingId`; `GET /market/capitalization`; `GET /market/forbes` | Market listing browse, buy, update/cancel, and economy/profile read views. | Market buy transfers balance and item ownership. | market/economy/inventory | market/economy split not formalized | high |
| `src/api/routes/dashboard/notificationRoutes.ts` | `GET /notifications`; `GET /notifications/summary`; `POST /notifications/:notificationId/read`; `POST /notifications/read-all` | Notification read and read-state updates. | User-facing state writes, lower blast radius than money/items. | notifications | none | medium |
| `src/api/routes/dashboard/profileRoutes.ts` | `GET /profile/me`; `PATCH /profile/me` | User profile read/update. | `members` also stores identity/economy/profile fields, so profile writes need clear boundaries. | profile/member | exact split between member lifecycle and public profile is unclear | medium |
| `src/api/routes/dashboard/streamerApplicationRoutes.ts` | `GET /streamer-applications/me`; `POST /streamer-applications`; `GET /admin/streamer-applications`; `POST /admin/streamer-applications/:applicationId/approve`; `POST /admin/streamer-applications/:applicationId/reject` | Streamer application submission and admin review. | Approval can create/update streamer access state. | streamers/applications/admin | none | medium |
| `src/api/routes/dashboard/streamerStudioRoutes.ts` | `GET /streamer-studio/me`; `GET /streamer-studio/:streamerId/agent/setup`; `POST /streamer-studio/:streamerId/agent/provision`; `POST /streamer-studio/:streamerId/agent/bind`; `DELETE /streamer-studio/:streamerId/agent`; `GET /streamer-studio/:streamerId/services`; `GET /streamer-studio/:streamerId/services/catalog`; `POST /streamer-studio/:streamerId/services/:serviceId/purchase`; `POST /streamer-studio/:streamerId/services`; `PATCH /streamer-studio/:streamerId/services/:serviceId`; `DELETE /streamer-studio/:streamerId/services/:serviceId`; `PATCH /streamer-studio/:streamerId/control/source/text`; `PATCH /streamer-studio/:streamerId/control/source/browser`; `POST /streamer-studio/:streamerId/control/source/settings`; `PATCH /streamer-studio/:streamerId/control/scene-item/visibility`; `DELETE /streamer-studio/:streamerId/control/scene-item`; `GET /streamer-studio/accessible`; `GET /streamer-studio/:streamerId/trusted-users`; `POST /streamer-studio/:streamerId/trusted-users`; `DELETE /streamer-studio/:streamerId/trusted-users/:memberId`; `POST /streamer-studio/:streamerId/control/scenes/list`; `POST /streamer-studio/:streamerId/control/scene-items/list`; `PATCH /streamer-studio/:streamerId/control/scene-item/index`; `POST /streamer-studio/:streamerId/control/source/text`; `POST /streamer-studio/:streamerId/control/source/browser`; `PATCH /streamer-studio/:streamerId/control/scene-item/transform` | OBS agent setup, streamer services, trusted users, and live OBS control. | External side effects, permissions, command queue, and streamer ownership all meet high-risk criteria. | OBS/streamer studio/streamer access | ownership is split across several services | high |

## Discord Events

| File path | Event/controller | What it does | Why it matters | Owner/domain | Uncertainty | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| `src/events/clientReady.ts` | `clientReadyController(client)` | Handles Discord client ready lifecycle. | Startup path can trigger background service behavior. | bot/runtime | none from inspected lines | low |
| `src/events/guildCreate.ts` | `guildCreateController(guild)` | Ensures guild bootstrap through `dataBaseHandler.ensureGuildBootstrap(guild)` and records guild metadata. | Creates/syncs guild, channels, roles, owner membership, and log channel defaults. | guilds/bootstrap | legacy `DataBaseHandler` still owns much of this | high |
| `src/events/guildDelete.ts` | `guildDeleteController(guild)` | Deletes guild record through `dataBaseHandler.deleteGuildFromDB(guild)`. | Destructive guild data path. | guilds/bootstrap | delete semantics and cascade behavior need separate DB inventory | high |
| `src/events/interactionCreate.ts` | `interactionCreateController(interaction)` | Syncs Discord profile through `memberService.ensureMemberFromDiscordProfile`, calls `dataBaseHandler.isMemberExists(..., true, ..., true, interaction)` for guild/member bootstrap, checks command permissions, dispatches slash commands/autocomplete/selects/buttons/modals to command handlers. | Central bot adapter for member lifecycle, guild membership, permission checks, and command execution. | bot interactions/member/guild permissions | ownership is split between member service, legacy DB handler, and command layer | high |
| `src/events/messageCreate.ts` | `messageCreateController(message)` | Ignores bot messages, syncs member profile through `memberService.ensureMemberFromDiscordProfile`, replies to DMs that slash commands should be used. | Discord message path also touches member lifecycle/profile cache. | bot messages/member profile | none for current behavior | medium |

## Discord Commands

| File path | Command | What it does | Why it matters | Owner/domain | Uncertainty | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| `src/commands/balance.ts` | `/balance` | Reads `members.balance` and `members.ldm_balance` through `EconomyService.getMemberBalancesByDiscordId(...)`. | The direct command-layer generic DB helper usage is resolved; this is now a thin read-only economy command surface. | economy/bot command | broader economy cleanup still remains | low |
| `src/commands/botmenu.ts` | `/botmenu` | Opens bot administration menu. | Admin entry point; no direct DB reference found. | admin/bot UI | command internals not fully inventoried beyond command metadata | medium |
| `src/commands/botshop.ts` | `/botshop` | Lists, adds, buys, and sells bot shop items through services. | Bot shop purchase/sale touches item and balance flows. | bot shop/inventory/economy | service boundaries still mixed in `ItemService` | high |
| `src/commands/craft.ts` | `/craft` | Executes a craft recipe. | Craft changes inventory and may require transaction safety. | craft/inventory | exact owner split not formalized | high |
| `src/commands/craftinfo.ts` | `/craftinfo` | Shows craft recipe details. | Read-only craft surface. | craft | none | low |
| `src/commands/craftrecipecreate.ts` | `/craftrecipecreate` | Creates a craft recipe. | Admin/content mutation for craft system. | craft/admin | none | medium |
| `src/commands/craftrecipes.ts` | `/craftrecipes` | Lists available/craftable recipes. | Read-heavy craft/inventory view. | craft/inventory | none | low |
| `src/commands/help.ts` | `/help` | Shows command help. | No persistence risk. | bot UX | none | low |
| `src/commands/inventory.ts` | `/inventory` | Shows user inventory, with foreign inventory allowed for admins. | Inventory read path includes permission behavior. | inventory/admin | none | medium |
| `src/commands/isLive.ts` | `/islive` | Checks Twitch live status for streamer nickname. | External API surface, not core DB write path. | twitch/streamers | none | low |
| `src/commands/itemcatalog.ts` | `/itemcatalog` | Shows item templates catalog. | Read-only item catalog surface. | item catalog | none | low |
| `src/commands/itemcreate.ts` | `/itemcreate` | Creates an item template. | Admin item catalog mutation. | item catalog/admin | none | medium |
| `src/commands/itemgive.ts` | `/itemgive` | Grants item template to a user. | Item ownership mutation and member resolving path. | inventory/admin | exact target owner should be inventory service/repository | high |
| `src/commands/iteminfo.ts` | `/iteminfo` | Shows item template info. | Read-only item catalog surface. | item catalog | none | low |
| `src/commands/itemview.ts` | `/itemview` | Shows one concrete inventory item. | Read-only inventory item view. | inventory | none | low |
| `src/commands/market.ts` | `/market` | Lists, buys, updates, and cancels market listings. | Market buy transfers item ownership and money. | market/economy/inventory | split not formalized | high |
| `src/commands/menu.ts` | `/menu` | Opens the main interaction menu and delegates balance summary reads to `EconomyService.getMemberBalancesByDiscordId(...)` for the home balance chip and balance panel. | The direct generic DB helper usage for the balance summary is resolved, but this remains a large command/UI file with many delegated flows. | bot UI/economy view | likely more behavior inside the large file than this inventory details | medium |
| `src/commands/obs.ts` | `/obs` | OBS WebSocket control commands. | External side effects against OBS/streamer setup. | OBS | exact permission/side-effect boundary should be reviewed separately | high |
| `src/commands/ping.ts` | `/ping` | Bot check command. | No persistence risk. | bot UX | none | low |
| `src/commands/raritycreate.ts` | `/raritycreate` | Creates item rarity. | Admin item metadata mutation. | item catalog/admin | none | medium |
| `src/commands/roulette.ts` | `/roulette` | Creates a roulette session, ensures member through `dataBaseHandler.isMemberExists`, and updates balance through `dataBaseHandler.updateTable`. | Direct economy mutation in a Discord command path. | game/economy | should be owned by economy/game service; current owner unclear | high |
| `src/commands/serviceaction.ts` | `/serviceaction` | Binds OBS actions to service item templates. | Admin/control configuration for OBS service items. | OBS/service items/admin | overlaps streamer service and item service concepts | high |
| `src/commands/serviceuse.ts` | `/serviceuse` | Uses a service item against a streamer. | Consumes/uses inventory and triggers OBS side effects. | OBS/service items/inventory | split not formalized | high |
| `src/commands/streamer.ts` | `/streamer` | Registers/list/removes streamers and manages OBS agent pairing/bind/show/clear. | Mutates streamer registry and OBS agent credentials. | streamers/OBS/admin | none | high |

## Services In `src/core/*`

| File path | What it does | Why it matters | Owner/domain | Uncertainty | Risk |
| --- | --- | --- | --- | --- | --- |
| `src/core/BalkonPlusSubscriptionService.ts` | Reconciles Discord SKU entitlements to guild roles. | External Discord role side effects. | subscriptions/Discord roles | none | medium |
| `src/core/BotAdmin.ts` | Bot owner/admin/contributor checks, admin dashboard stats, founder stats/audit, bootstrap status. Uses 12 direct `pool.query` calls and `DataBaseHandler`. | Security/admin boundary and mixed stats/settings reads/writes. | admin/security | founder/guild ownership split unclear | high |
| `src/core/BotCommandQueue.ts` | Enqueues, claims, completes, and fails queued bot commands. | Bridge between API and Discord bot side effects. | command queue/bridge | none | high |
| `src/core/BotCommandWorker.ts` | Processes queued bot commands such as kicks and OBS media/relay commands. | Executes sensitive Discord/OBS side effects after API enqueue. | command queue/Discord/OBS | none | high |
| `src/core/DataBaseHandler.ts` | Legacy generic DB helper plus guild bootstrap, guild deletion, member existence/creation, permissions-related helpers. | Catch-all layer for member/guild writes; uses dynamic SQL and remains widely imported. | legacy database/guild/member | target split should be repositories plus member/guild services | high |
| `src/core/DiscordMetadataService.ts` | Upserts Discord profile cache for members and guild metadata; backfills missing member profiles. | Directly inserts into `members`, bypassing desired member creation ownership. | Discord metadata/member profile | should update only through member lifecycle after future fix | high |
| `src/core/EconomyService.ts` | Economy totals/snapshots/market capitalization, narrow `/balance` and `/menu` balance reads, roulette payout credit, and admin balance adjustment. | Intended economy owner, but currently not all balance reads or mutations flow through it. | economy | some member resolving still depends on item/member helpers | high |
| `src/core/GuildDashboardService.ts` | Lists current user's guilds and guild overview. | Dashboard guild access and membership reads. | guild dashboard | none | medium |
| `src/core/ItemService.ts` | Item catalog, rarities/types, inventory, market, bot shop, craft, item grants, service item helpers, member resolving, balance mutations. | 2665-line god service with item, inventory, market, craft, and economy write paths. | mixed item/inventory/market/craft/economy | future split required; exact owners per method need separate inventory | high |
| `src/core/JobService.ts` | Job list/admin CRUD/job execution with rewards and cooldowns. | Job execution directly increments `members.balance` and can grant items. | jobs/economy/inventory | none | high |
| `src/core/LocaleService.ts` | Locale setting orchestration using `MemberService`, `normalizeLocale(...)`, and narrow persistence delegated to `LocalePreferenceRepository`. | User preference persistence; low direct blast radius after KAN-65 removed direct runtime helper usage. | locale/user settings | none | low |
| `src/core/MemberService.ts` | Member lookup, profile cache read, ensure member by Discord id, ensure member from Discord profile. | Intended member owner, but still uses upsert with `LAST_INSERT_ID(id)` and direct SQL. | member lifecycle | future repository boundary not present | high |
| `src/core/NotificationService.ts` | Notification list/summary/read/create/broadcast helpers. | User/admin notification state writes. | notifications | none | medium |
| `src/core/ObsAgentStatusService.ts` | OBS agent heartbeat/status persistence. | Operational status for external agents. | OBS agent | none | medium |
| `src/core/ObsMediaActionService.ts` | Records and lists OBS media actions/status. | OBS purchase/action tracking and admin visibility. | OBS media | none | medium |
| `src/core/ObsRelayService.ts` | OBS relay connection/credential lookup. | Auth and live relay side effects. | OBS relay | none | high |
| `src/core/ObsService.ts` | OBS settings and updater member resolution through `DataBaseHandler`. | OBS config writes and member attribution. | OBS/admin | none | medium |
| `src/core/OverviewService.ts` | Dashboard overview counts, notifications, guilds, OBS recent actions. | Read-heavy dashboard composition. | dashboard overview | none | low |
| `src/core/PermissionController.ts` | Checks command permissions from role/member permission tables. | Central bot command authorization. | permissions | likely should become permission service/repository | high |
| `src/core/SettingsService.ts` | General/bot settings reads and updates. | Settings affect behavior such as starting balances. | settings | none | medium |
| `src/core/ShopObsService.ts` | OBS shop streamers/media purchase flow, charge/refund member balance, queue/show media action. | Direct money mutation plus external OBS side effect/refund path. | OBS shop/economy | should coordinate with EconomyService and audit in future | high |
| `src/core/StreamerAccessService.ts` | Streamer owner/trusted user access checks and mutations. | Permission boundary for streamer studio actions. | streamer access/security | none | high |
| `src/core/StreamerApplicationService.ts` | Streamer application list/create/approve/reject. | Admin approval changes streamer state. | streamer applications | none | medium |
| `src/core/StreamerService.ts` | Streamer registry, guild binding, OBS agent credentials, OBS relay commands, item service actions, service item execution. | 1466-line mixed streamer/OBS/service-item file with direct SQL and side effects. | streamers/OBS/service items | boundaries overlap with StreamerServicesService and StreamerStudioControlService | high |
| `src/core/StreamerServicesService.ts` | Streamer service catalog, purchase, manage/update/disable. | Purchase path touches buyers and service ownership; direct SQL. | streamer services/economy | exact relationship to item services unclear | high |
| `src/core/StreamerStudioControlService.ts` | OBS scene/source/browser/text/transform control dispatch and access checks. | Live OBS side effects and command queue status polling. | streamer studio/OBS control | none | high |
| `src/core/TwitchHandler.ts` | Twitch token loading and streamer info/avatar lookup. | External API helper. | twitch | none | low |
| `src/core/UserProfileService.ts` | User profile, home guild, available guilds, market Forbes. | Writes profile fields in `members`; profile vs member lifecycle boundary matters. | user profile/member | exact split with MemberService unclear | medium |

## Direct `pool.query` Usage

This list groups direct `pool.query` calls by file. Connection-scoped `connection.query` calls are noted separately in high-risk files but are not counted here.

| File path | Direct query lines/count | What it does | Why it matters | Owner/domain | Uncertainty | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| `src/api/auth/apiSessionService.ts` | 4 calls: 152, 188, 223, 233 | Creates, reads, and revokes API sessions. | Auth/session token persistence is security-sensitive. | auth/sessions | token storage needs security inventory | high |
| `src/core/BotAdmin.ts` | 12 calls: 154, 170, 184, 191, 224, 237, 251, 265, 282, 292, 302, 312 | Contributor updates, admin/founder stats, bootstrap status. | Admin authorization/settings/audit data mixed in one file. | admin/security | founder audit owner unclear | high |
| `src/core/BotCommandQueue.ts` | 3 calls: 96, 156, 165 | Queue command insert/status updates. | API-to-bot side-effect bridge. | command queue | none | high |
| `src/core/DataBaseHandler.ts` | 12 calls: 102, 117, 139, 151, 177, 311, 314, 441, 448, 455, 498, 650 | Generic selects/inserts/updates, streamer load, guild bootstrap cleanup, guild delete. | Legacy generic data access with dynamic SQL and high reuse. | legacy DB/guild/member | target repositories not created | high |
| `src/core/DiscordMetadataService.ts` | 3 calls: 37, 66, 81 | Member profile upsert, guild metadata upsert, profile backfill lookup. | One call inserts into `members` outside intended member owner. | Discord metadata/member profile | none | high |
| `src/core/EconomyService.ts` | 4 calls: 106, 126, 145, 248 | Economy totals/snapshots plus narrow member balance lookup for `/balance`. | Intended economy owner, but still not the only balance read/write surface. | economy | admin adjustment uses transaction/connection not in pool count | medium |
| `src/core/GuildDashboardService.ts` | 4 calls: 68, 99, 121, 172 | Guild list/overview/member fallback. | Dashboard access reads. | guild dashboard | none | medium |
| `src/core/ItemService.ts` | 26 calls: 321, 355, 370, 383, 399, 423, 442, 461, 480, 507, 567, 594, 770, 802, 830, 1173, 1200, 1230, 1259, 1435, 1471, 1572, 1599, 1905, 2356, 2404 | Item catalog/search/admin, inventory, market, craft, service-item reads/writes. | Large mixed domain service; also has transaction-scoped balance/item writes. | mixed item/inventory/market/craft | exact method-level split requires ItemService inventory | high |
| `src/core/JobService.ts` | 7 calls: 162, 196, 233, 312, 376, 546, 659 | Job list/admin CRUD/detail helpers. | Job execution also uses transaction connection to reward balance/items. | jobs | none | high |
| `src/core/LocalePreferenceRepository.ts` | 4 calls: 16, 29, 53, 66 | Locale preference member lookup/update plus `member_locale_selected:*` bot_settings read/upsert. | Narrow locale persistence boundary extracted by KAN-65. | locale | repository must stay limited to locale persistence only | low |
| `src/core/MemberService.ts` | 4 calls: 80, 97, 137, 174 | Member id/profile lookup, member upsert, locale update. | Intended member owner but lacks repository boundary. | member lifecycle | none | high |
| `src/core/NotificationService.ts` | 9 calls: 98, 107, 114, 132, 145, 159, 171, 183, 350 | Notification list/count/read/create/member lookup. | User notification writes and admin broadcast support. | notifications | none | medium |
| `src/core/ObsAgentStatusService.ts` | 5 calls: 61, 85, 108, 127, 153 | Agent status upserts and reads. | OBS operational state. | OBS agent | none | medium |
| `src/core/ObsMediaActionService.ts` | 8 calls: 88, 117, 128, 145, 162, 170, 193, 200 | OBS media action create/update/list. | Tracks OBS purchase/action state. | OBS media | none | medium |
| `src/core/ObsRelayService.ts` | 1 call: 140 | Loads agent credentials. | Relay auth-sensitive. | OBS relay | none | high |
| `src/core/ObsService.ts` | 2 calls: 278, 309 | OBS settings read/update. | Admin controlled OBS settings. | OBS/admin | none | medium |
| `src/core/OverviewService.ts` | 6 calls: 99, 105, 111, 119, 127, 133 | Dashboard overview counts. | Read-only aggregate surface. | dashboard overview | none | low |
| `src/core/PermissionController.ts` | 2 calls: 12, 32 | Role/member command permission lookups. | Bot authorization boundary. | permissions | none | high |
| `src/core/SettingsService.ts` | 5 calls: 22, 38, 44, 64, 89 | General settings read/upsert/update. | Settings influence economy/member defaults. | settings | none | medium |
| `src/core/ShopObsService.ts` | 8 calls: 117, 395, 443, 458, 474, 485, 533, 545 | OBS shop data, member balance lookup, charge/refund, command status. | Direct money mutation and OBS side effects. | OBS shop/economy | none | high |
| `src/core/StreamerAccessService.ts` | 14 calls: 158, 213, 230, 270, 293, 301, 320, 328, 350, 358, 366, 397, 408, 448 | Trusted users/owner access/read/write. | Permission boundary for streamer studio. | streamer access | none | high |
| `src/core/StreamerApplicationService.ts` | 7 calls: 95, 109, 126, 154, 198, 228, 251 | Streamer application CRUD/review. | Admin approval/rejection workflow. | streamer applications | none | medium |
| `src/core/StreamerService.ts` | 27 calls: 183, 209, 257, 288, 320, 386, 409, 412, 456, 509, 517, 519, 577, 633, 636, 840, 888, 1122, 1166, 1182, 1267, 1272, 1276, 1374, 1405, 1427, 1436 | Streamers, guild bindings, OBS agent bindings, bot settings, service item actions, ownership checks. | Large mixed service with credentials, permissions, and side effects. | streamers/OBS/service items | split boundaries unclear | high |
| `src/core/StreamerServicesService.ts` | 6 calls: 129, 241, 289, 335, 378, 633 | Streamer service catalog/manage/purchase persistence. | Purchase/manage path likely crosses streamer access and economy. | streamer services | exact economy ownership unclear | high |
| `src/core/StreamerStudioControlService.ts` | 3 calls: 392, 402, 492 | Streamer existence, agent binding, command completion polling. | Live OBS control permission path. | streamer studio/OBS | none | high |
| `src/core/UserProfileService.ts` | 6 calls: 115, 126, 165, 177, 214, 228 | Profile read/update, available guilds, Forbes. | Writes profile fields in `members`. | user profile/member | member/profile split unclear | medium |

## Direct `INSERT INTO members`

| File path | Line | What it does | Why it matters | Owner/domain | Uncertainty | Risk |
| --- | ---: | --- | --- | --- | --- | --- |
| `src/core/MemberService.ts` | 138 | `ensureMemberByDiscordId` inserts minimal member with balances and locale using `ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`. | This is the intended member owner today, but the plan flags the upsert pattern for follow-up because it can burn auto-increment values. | member lifecycle | future repository boundary not present | high |
| `src/core/DiscordMetadataService.ts` | 38 | `upsertMemberDiscordProfile` inserts member profile rows with default balances and locale, then updates profile fields on duplicate. | Creates `members` rows outside `MemberService`, violating target ownership. | Discord metadata/member profile | should become update-only after member is ensured elsewhere | high |

## Direct `UPDATE members SET balance/ldm_balance`

No direct `UPDATE members SET ldm_balance` matches were found in inspected `src/**/*.ts`.

| File path | Line | What it does | Why it matters | Owner/domain | Uncertainty | Risk |
| --- | ---: | --- | --- | --- | --- | --- |
| `src/core/ItemService.ts` | 2085 | Debits buyer balance during public market purchase inside transaction. | Money transfer coupled to item ownership transfer and market listing deletion. | market/economy/inventory | target owner likely economy application service plus inventory/market repositories | high |
| `src/core/ItemService.ts` | 2089 | Credits seller balance during public market purchase inside transaction. | Same cross-entity market money transfer. | market/economy/inventory | same as above | high |
| `src/core/ItemService.ts` | 2219 | Debits buyer balance during bot shop purchase. | Direct economy mutation in item service. | bot shop/economy/inventory | should route through economy owner later | high |
| `src/core/ItemService.ts` | 2333 | Credits seller balance when selling inventory item to bot. | Direct economy mutation coupled to inventory deletion. | bot shop/economy/inventory | owner split unclear | high |
| `src/core/JobService.ts` | 467 | Credits member balance when running a job. | Direct reward mutation; may be a first economy extraction candidate because it is localized. | jobs/economy | none | high |
| `src/core/ShopObsService.ts` | 475 | Debits member balance for OBS media purchase with balance guard. | Money mutation precedes external OBS/media action and needs refund/audit semantics. | OBS shop/economy | none | high |
| `src/core/ShopObsService.ts` | 486 | Refunds member balance for failed OBS media purchase. | Compensation path must stay paired with charge path. | OBS shop/economy | none | high |
| `src/commands/roulette.ts` | 135 | Calls `dataBaseHandler.updateTable("members", "balance", ...)`, which can mutate balance via generic helper. | Direct economy mutation from Discord command through legacy helper. | game/economy | exact owner unclear | high |

## DataBaseHandler Usage

| File path | Usage lines/count | What it does | Why it matters | Owner/domain | Uncertainty | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| `src/bot.ts` | 8, 92, 93 | Imports `DataBaseHandler` and loads streamers during bot startup. | Startup still depends on legacy DB helper. | bot/startup/streamers | target owner likely StreamerService | medium |
| `src/api/routes/dashboard/adminStreamerRoutes.ts` | no current `DataBaseHandler` usage | KAN-72 removed the route-level helper dependency; `DELETE /admin/streamers/:streamerId` now checks `response.success === false` after `streamerService.archiveStreamerById(...)` and keeps the same response mapping. | admin/streamers | StreamerService and wider admin streamer persistence remain future inventory work | low |
| `src/commands/balance.ts` | no current `DataBaseHandler` usage | KAN-67 moved the command to `EconomyService.getMemberBalancesByDiscordId(...)`; no `DataBaseHandler`, `dataBaseHandler`, or `MembersDB` import remains. | economy/bot command | other command-layer economy smells still exist elsewhere | low |
| `src/commands/menu.ts` | no current `DataBaseHandler` usage for balance summary | KAN-69 moved `getBalanceSummary(...)` to `EconomyService.getMemberBalancesByDiscordId(...)`; the home balance chip and balance panel no longer use `DataBaseHandler`, `dataBaseHandler`, `MembersDB`, or `getFromTable(...)`. | bot UI/economy view | other delegated menu flows still make the file broad | medium |
| `src/commands/roulette.ts` | 7, 55, 135 | Ensures member and updates balance through `dataBaseHandler`. | Direct economy write in command path. | game/economy | owner unclear | high |
| `src/core/BotAdmin.ts` | 6, 118, 119, 147, 148 | Reads bot contributors and resolves member for contributor updates. | Admin/security flow depends on legacy helper. | admin/security/member | none | high |
| `src/core/DataBaseHandler.ts` | 54 internal references | Defines static helpers, success/fail/error handling, generic DB methods, guild/member helpers. | Central legacy catch-all. | legacy database | target split pending | high |
| `src/core/ItemService.ts` | 78 refs | Uses helper for member resolving, table reads/inserts, error handling across item/market/craft flows. | Entangles `ItemService` with legacy DB responses. | mixed item/inventory/market/craft | method-level inventory needed | high |
| `src/core/LocaleService.ts` | 1 type-only import at line 2 | Keeps legacy `DBResponse` types only; no runtime `DataBaseHandler` helper usage remains after KAN-65. | locale/settings | result-shape types still live in legacy module | low |
| `src/core/ObsService.ts` | 5 refs | Resolves updater members for OBS settings changes. | Admin attribution depends on legacy member lookup. | OBS/admin/member | none | medium |
| `src/core/PermissionController.ts` | 2 refs | Uses error handling helper around permission SQL. | Permission boundary uses legacy helper. | permissions | none | high |
| `src/core/StreamerService.ts` | 41 refs | Uses helper for streamer/guild/member/item flows and error handling. | Large service remains tied to catch-all helper. | streamers/OBS/service items | split boundaries unclear | high |
| `src/core/StreamerServicesService.ts` | 2 refs | Uses helper for member failure handling. | Purchase/manage flow touches member identity. | streamer services/member | none | high |
| `src/events/guildCreate.ts` | 3, 13, 14 | Calls `ensureGuildBootstrap`. | Guild create event writes guild/channel/role/member state through legacy helper. | guild bootstrap | none | high |
| `src/events/guildDelete.ts` | 2, 6, 7 | Calls `deleteGuildFromDB`. | Destructive guild delete path through legacy helper. | guild bootstrap | cascade semantics unclear | high |
| `src/events/interactionCreate.ts` | 6, 25, 26, 51 | Calls member/guild bootstrap and helper failure checks. | Central interaction path uses legacy member/guild lifecycle helper. | bot/member/guild permissions | ownership split with MemberService | high |
| `src/utils/syncWithDatabase.ts` | 3, 12, 17, 37 | Syncs guilds with database using `DataBaseHandler`. | Utility can mutate guild records outside route/event flow. | guild sync utility | runtime use path not fully inspected | medium |

## High-Risk Files

| File path | What it does | Why it is high risk | Owner/domain | Uncertainty | Risk |
| --- | --- | --- | --- | --- | --- |
| `src/core/ItemService.ts` | Mixed item catalog, inventory, market, bot shop, craft, member resolving, and balance/item mutations. | 2665 lines, 26 direct `pool.query` calls, 78 `DataBaseHandler` refs, transaction-scoped money/item writes. | mixed item/inventory/market/craft/economy | requires separate `ITEM_SERVICE_INVENTORY.md` before split | high |
| `src/core/DataBaseHandler.ts` | Legacy generic DB helper and guild/member bootstrap. | Catch-all dynamic SQL layer and member/guild writes still used by bot events/commands/services. | legacy database/member/guild | target owner split not implemented | high |
| `src/api/routes/dashboardRoutes.ts` | Large dashboard route file with many remaining handlers. | Cross-domain route handlers still contain validation/response mapping and call many services. | dashboard/api composition | several endpoint groups still need extraction | high |
| `src/events/interactionCreate.ts` | Main Discord interaction adapter. | Member profile sync, legacy member/guild bootstrap, permission checks, command dispatch, component routing. | bot interactions/member/guild permissions | ownership split between services and legacy helper | high |
| `src/core/ShopObsService.ts` | OBS media shop purchase/charge/refund/action flow. | Direct money mutation plus external OBS side effect and refund path. | OBS shop/economy | economy ownership not centralized | high |
| `src/core/JobService.ts` | Job CRUD and job execution. | Direct balance reward and item grants in job execution transaction. | jobs/economy/inventory | good candidate for later focused economy extraction | high |
| `src/core/StreamerService.ts` | Streamer registry, guild binding, OBS agent credentials, OBS commands, service item actions. | 1466 lines, credentials/settings/deletes/external side effects and 27 direct `pool.query` calls. | streamers/OBS/service items | overlaps with newer streamer services/control services | high |
| `src/api/routes/dashboard/streamerStudioRoutes.ts` | Streamer studio API. | Many live OBS control, agent, service, and trusted-user endpoints. | streamer studio/OBS/access | permission and side-effect boundaries need focused review | high |
| `src/commands/roulette.ts` | Roulette game command. | Direct balance mutation through generic `DataBaseHandler.updateTable` from command handler. | game/economy | owner unclear | high |
| `src/core/DiscordMetadataService.ts` | Discord profile/guild metadata upsert/backfill. | Direct `INSERT INTO members` outside intended member owner. | Discord metadata/member profile | planned follow-up should make it update-only | high |
| `src/api/auth/apiSessionService.ts` | API session creation/read/revoke. | OAuth token persistence and auth session security are sensitive. | auth/sessions | security review pending | high |
| `src/core/PermissionController.ts` | Command permission SQL checks. | Authorization boundary for bot commands. | permissions | target owner not formalized | high |

## First Safe PR Candidates

These candidates should remain small and behavior-preserving. None should be combined with runtime refactors unless a later task explicitly allows it.

| Candidate | File path | What it does | Why it matters | Owner/domain | Uncertainty | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| Add `DATABASE_HANDLER_USAGE_INVENTORY.md` | `docs/refactor/DATABASE_HANDLER_USAGE_INVENTORY.md` | Inventory each `DataBaseHandler` call with target owner and replacement strategy. | Required by stabilization plan before removing legacy helper usage. | stabilization/docs | none | low |
| Add `ECONOMY_MUTATION_INVENTORY.md` | `docs/refactor/ECONOMY_MUTATION_INVENTORY.md` | Inventory every `members.balance`/`members.ldm_balance` mutation. | Needed before routing balance writes through `EconomyService`. | economy/docs | none | low |
| Add `ITEM_SERVICE_INVENTORY.md` | `docs/refactor/ITEM_SERVICE_INVENTORY.md` | Method-level inventory of `ItemService`. | Required before splitting the largest mixed service. | item/inventory/docs | none | low |
| Extract one route group from `dashboardRoutes.ts` only after endpoint inventory | `src/api/routes/dashboardRoutes.ts` plus a new/existing `src/api/routes/dashboard/*Routes.ts` | Move one remaining route group without service changes or response shape changes. | Reduces route-file size while preserving behavior. | dashboard/api | choose a read-only group first | medium |
| Admin streamer route result-helper cleanup | `src/api/routes/dashboard/adminStreamerRoutes.ts` | KAN-72 completed the local removal of the legacy response helper around one service call. | StreamerService still needs separate inventory-driven cleanup beyond this route-level change. | admin/streamers | exact route response shape was preserved | low |
| Add focused docs for auth/session security review | `docs/security/SECURITY_REVIEW.md` | Inventory session cookie flags, CORS, OAuth token storage, admin checks, OBS relay auth. | Security-sensitive paths are visible but not yet reviewed. | security/docs | none | low |

## Explicit Non-Changes

- No runtime code was changed by this inventory.
- No refactor was performed.
- No fixes were applied.
- No files were moved.
- No architecture changes were introduced.
- No build is required for this docs-only task.
