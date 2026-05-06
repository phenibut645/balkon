# DataBaseHandler Usage Inventory

Task: KAN-4

This is a factual inventory and replacement map for `DataBaseHandler` usage. It does not replace, remove, refactor, or fix any runtime code.

## 1. Purpose And Scope

Read first:

- `docs/ARCHITECTURE_PLAN.md`
- `docs/refactor/STABILIZATION_PLAN.md`
- `docs/refactor/BACKEND_INVENTORY.md`

Scope searched:

- `src/**/*.ts`
- excluding `src/core/DataBaseHandler.ts` when counting external usages

Usage forms included:

- imports from `DataBaseHandler.js`
- `dataBaseHandler.*`
- local aliases created from `DataBaseHandler.getInstance()`, currently `dbHandler.*`
- `DataBaseHandler.getInstance().*`
- static helpers: `DataBaseHandler.isSuccess`, `DataBaseHandler.isFail`, `DataBaseHandler.errorHandling`
- type imports from the same module where they keep runtime files coupled to the legacy response contract

Risk levels:

- low: read-only or response-shape helper with small local blast radius
- medium: direct table helper usage, member/profile/settings reads, or limited writes
- high: member creation, guild bootstrap/delete, money/item/streamer mutations, authorization, large mixed services, or side effects

## 2. Summary Of DataBaseHandler Responsibilities

| Responsibility | Current methods | Why it matters | Target owner/service/repository | Replacement timing |
| --- | --- | --- | --- | --- |
| Singleton access | `getInstance()`, exported `dataBaseHandler` | Makes a global generic DB helper easy to call from routes, commands, services, events, and utilities. | none long-term; replace with explicit domain services/repositories | later |
| Generic table access | `getRecords`, `getFromTable`, `addRecords`, `updateTable` | Bypasses domain ownership and can hide SQL/table details behind a generic API. | domain repositories, e.g. `MemberRepository`, `GuildRepository`, `ItemCatalogRepository`, `StreamerRepository` | later; only after inventory per domain |
| Legacy response contract | `DBResponse`, `DBResponseSuccess`, `isSuccess`, `isFail`, `errorHandling` | Keeps old success/error shapes coupled to services and routes. | local typed service results or shared error/result helper not tied to DB helper | small cleanups can happen first |
| Guild lifecycle/bootstrap | `addGuildToDB`, `ensureGuildBootstrap`, `deleteGuildFromDB` | Creates/deletes guild records, syncs channels/roles/log channels, and touches guild-member membership. | `GuildService` + `GuildRepository` + channel/role repositories | later; high-risk |
| Member lifecycle bridge | `isMemberExists` | Can create members and guild-member rows, and is still used by bot/event/service paths. | `MemberService`, future `MemberRepository`, future `GuildMemberService` | after member lifecycle inventory/fixes |
| Streamer notification loading | `loadStreamers` | Bot startup still loads Twitch notification state from legacy helper. | `StreamerNotificationService` or `StreamerService` read repository | later |
| Command permission legacy method | `isCommandAllowed` | Method exists in `DataBaseHandler`; no external usage found in this search. | `PermissionService`/`PermissionRepository` if needed | not now |

## 3. Usage Table By File

| File path | Function/method or controller | Exact usage found | Current purpose | Domain owner if clear | Uncertainty | Risk | Target owner/service/repository | Safe replacement strategy | Timing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/api/routes/dashboard/adminStreamerRoutes.ts` | `registerAdminStreamerRoutes`, `DELETE /admin/streamers/:streamerId` | import line 2; `DataBaseHandler.isFail(response)` line 68 | Checks legacy `DBResponse` from `streamerService.archiveStreamerById`. | admin/streamers | none | medium | `StreamerService` result type or route-local result narrowing | Preserve response shape; replace static helper with explicit `response.success === false` only after confirming all returned shapes. | now |
| `src/bot.ts` | `setNotification` | import line 8; `DataBaseHandler.getInstance().loadStreamers()` line 92; `DataBaseHandler.isSuccess(response)` line 93 | Loads streamers for Twitch notification polling during bot startup. | streamer notifications/bot startup | exact future owner likely separate notification reader, not fully formalized | medium | `StreamerNotificationService` or `StreamerRepository` read method | Add a read-only service method returning the same streamer map, switch startup after behavior snapshot. | later |
| `src/commands/balance.ts` | `BalanceCommand.execute` | import line 2; `dataBaseHandler.getFromTable<MembersDB>("members", ...)` line 24; `DataBaseHandler.isSuccess(balance)` line 25 | Reads user ODM/LDM balance for `/balance`. | economy read/bot command | whether read belongs in `EconomyService` or profile read service should be decided | medium | `EconomyService.getMemberBalance` or `MemberBalanceRepository` | Introduce read-only economy/member balance method and keep command response text/embed unchanged. | later |
| `src/commands/menu.ts` | main menu balance rendering near line 3299 | import line 20; `dataBaseHandler.getFromTable<MembersDB>("members", ...)` line 3299; `DataBaseHandler.isFail(response)` line 3300 | Reads user balances for main interaction menu. | bot UI/economy read | large command file needs separate command/menu inventory before editing | medium | same read service as `/balance` | Replace together with `/balance` only after balance read owner exists; avoid touching broad menu behavior first. | after another inventory |
| `src/commands/roulette.ts` | `RouletteCommand.execute`; `RouletteCommand.shoot` | import line 7; `dataBaseHandler.isMemberExists(interaction.user.id, true)` line 55; `dataBaseHandler.updateTable("members", "balance", ..., UpdateType.Add)` line 135; `UpdateType` import line 7 | Ensures player member row and credits roulette winnings. | game/economy/member | game domain owner is unclear; economy mutation owner should be `EconomyService` | high | `MemberService` for ensure; `EconomyService` or future game application service for payout | Defer. First create economy mutation inventory and decide whether roulette gets a small game service or uses an economy adjustment method. | after another inventory |
| `src/core/BotAdmin.ts` | `getStoredBotContributorIds`; `updateBotContributor` | import line 6; `getFromTable("bot_settings", ...)` line 118; `DataBaseHandler.isFail` line 119; `isMemberExists(actorUserId, true)` line 147; `DataBaseHandler.isSuccess` line 148 | Reads stored contributor IDs and resolves actor member ID for contributor updates. | admin/security/settings/member | bot settings ownership vs admin settings repository is not formalized | high | `BotAdminService`/`BotSettingsRepository`; `MemberService` for actor member id | Defer until security/settings inventory; preserve admin authorization and audit attribution. | later |
| `src/core/ItemService.ts` | `ensureMemberByDiscordId`; item rarity/type/template methods; item grants; craft recipe creation; bot shop listing; public market listing; many catch blocks | import line 4; `isMemberExists` line 277; `getFromTable` lines 282, 297, 343, 613, 670, 742, 754, 865, 920, 933, 1517, 1529, 1693; `addRecords` lines 309, 621, 687, 887, 1549, 1705; `updateTable` line 1531; `isSuccess` lines 298, 614, 1530, 1694; `isFail` lines 278, 283, 344, 626, 673, 743, 757, 866, 888, 921, 934, 1518, 1537, 1555, 1660, 1711; `errorHandling` lines 315, 334, 377, 417, 436, 455, 474, 501, 529, 561, 588, 607, 708, 796, 848, 899, 992, 1117, 1165, 1224, 1284, 1427, 1465, 1510, 1566, 1593, 1652, 1722, 1811, 1897, 1984, 2122, 2248, 2348, 2398, 2452 | Mixed item catalog, inventory, market, craft, bot shop, member resolving, and legacy DB response handling. | mixed item/inventory/market/craft/economy | exact target owner differs by method; current file is too broad for blind replacement | high | `ItemCatalogRepository`, `InventoryRepository`, `MarketRepository`, `CraftRepository`, `MemberService`, `EconomyService` | Defer. Create `ITEM_SERVICE_INVENTORY.md` first, then replace read-only item catalog/rarity helpers before touching market/craft/purchase flows. | after another inventory |
| `src/core/LocaleService.ts` | `hasExplicitLocaleSelection`; `setMemberLocale`; private `ensureMember` | import line 2; `getFromTable("bot_settings", ...)` line 29; `DataBaseHandler.isSuccess` line 35; `updateTable("members", "locale", ...)` line 42; `DataBaseHandler.isFail` line 49; `DataBaseHandler.errorHandling` line 65; `isMemberExists(discordUserId, true)` line 70; `getFromTable("members", ...)` line 75; `DataBaseHandler.isFail` line 76 | Reads explicit locale flag, updates `members.locale`, and ensures/loads member. | locale/user settings/member | locale write owner touches `members`; should be coordinated with member/profile owner | medium | `LocaleService` with `MemberService` and `LocalePreferenceRepository` | Candidate after member ensure API is stable; replace member ensure/read first, then replace bot_settings locale flag read. | later |
| `src/core/ObsService.ts` | `setConnectionConfig`; `clearConnectionConfig` | import line 5; `isMemberExists(input.updatedByDiscordId, true)` line 212; `DataBaseHandler.isFail` line 214; `isMemberExists(updatedByDiscordId, true)` line 224; `DataBaseHandler.isFail` line 226 | Resolves updating admin member id before OBS settings write/clear. | OBS/admin/member attribution | audit/security treatment for OBS secrets/settings needs security review | medium | `MemberService` for actor id; `ObsSettingsRepository` for settings | Replace member resolving only after `MemberService` race/upsert hardening; preserve attribution behavior. | later |
| `src/core/PermissionController.ts` | `permissionController` catch block | import line 2; `DataBaseHandler.errorHandling(err)` line 50; `DBResponse` type import line 2 | Converts permission lookup errors to legacy `DBResponse`. | permissions/security | future permission service result shape not formalized | high | `PermissionService`/`PermissionRepository` | Defer because this is command authorization boundary; replace with dedicated permission result after permission inventory. | later |
| `src/core/StreamerService.ts` | `registerGuildStreamer`; private `ensureGuildByDiscordId`; private `ensureMemberByDiscordId`; many catch blocks and downstream response checks | import line 5; `addRecords("streamers")` line 192; `DataBaseHandler.isFail` line 198; `addRecords("guild_streamers")` line 228; `DataBaseHandler.isFail` line 237; `errorHandling` lines 251, 282, 314, 336, 368, 401, 422, 447, 530, 560, 592, 625, 647, 680, 701, 779, 798, 882, 898, 933, 966; `DataBaseHandler.isFail` lines 691, 731, 791, 815, 1047, 1060, 1150; `getFromTable("guilds")` line 1194; `DataBaseHandler.isSuccess` line 1195; `addGuildToDB` line 1202; `DataBaseHandler.isFail` line 1203; `isMemberExists` line 1218; `DataBaseHandler.isFail` line 1219; `getFromTable("members")` line 1223; `DataBaseHandler.isFail` line 1224 | Streamer registry/guild binding/OBS agent/service item flows plus helper response handling. | streamers/OBS/service items/member/guild | service overlaps with newer streamer services/control services | high | `StreamerRepository`, `GuildRepository`, `MemberService`, OBS service repositories | Defer. Split by streamer/guild/OBS/service-item responsibilities only after focused streamer/service inventory. | after another inventory |
| `src/core/StreamerServicesService.ts` | `ensureActorMemberId` check | import line 7; `DataBaseHandler.isFail(member)` line 405 | Checks legacy member response returned by existing helper/service call. | streamer services/member/economy | exact source of `member` result needs method-level review | high | `MemberService` and streamer service purchase application service | Defer until streamer services purchase/economy ownership is mapped. | after another inventory |
| `src/events/guildCreate.ts` | `guildCreateController` | import line 3; `dataBaseHandler.ensureGuildBootstrap(guild)` line 13; `DataBaseHandler.isSuccess(response)` line 14 | Handles Discord guild create by upserting metadata, bootstrapping guild/channels/roles/logs, saving bootstrap status. | guild bootstrap | split between guild, channel, role, logs owners is not formalized | high | `GuildBootstrapService` + repositories | Defer. High-risk lifecycle path; replace only after guild/database inventory. | later |
| `src/events/guildDelete.ts` | `guildDeleteController` | import line 2; `dataBaseHandler.deleteGuildFromDB(guild)` line 6; `DataBaseHandler.isSuccess(response)` line 7 | Deletes guild from DB on Discord guild removal. | guild lifecycle | cascade/delete behavior not inventoried | high | `GuildService`/`GuildRepository` | Defer until database inventory documents cascade behavior and desired archive/delete policy. | after another inventory |
| `src/events/interactionCreate.ts` | `interactionCreateController` | import line 6; `dataBaseHandler.isMemberExists(interaction.user.id, true, interaction.guildId, true, interaction)` line 25; `DataBaseHandler.isFail(response)` line 26; `DataBaseHandler.isFail(permissionResponse)` line 51 | Syncs interaction user into member/guild-member records and checks permission result for private commands. | bot interactions/member/guild membership/permissions | member profile already uses `MemberService`, but guild-member bootstrap remains legacy | high | `MemberService`, `GuildMemberService`, `PermissionService` | Defer. Replace after member lifecycle hardening and guild-member ownership design. | after another inventory |
| `src/utils/syncWithDatabase.ts` | `syncDiscordClientWithDatabase` | import line 3; `DataBaseHandler.getInstance()` line 12; `dbHandler.getFromTable("guilds")` line 14; `DataBaseHandler.isSuccess(dbGuilds)` line 17; `dbHandler.ensureGuildBootstrap(guild)` line 36; `DataBaseHandler.isFail(bootstrapResponse)` line 37; `dbHandler.deleteGuildFromDB(id)` line 69 | Startup sync between Discord client guilds and DB guild records; bootstraps current guilds and deletes stale guilds. | guild sync/bootstrap | destructive stale guild delete path needs DB inventory | high | `GuildSyncService` + `GuildRepository`/`GuildBootstrapService` | Defer. Needs database inventory and explicit delete/archive policy. | after another inventory |

## 4. Usage Table By Method

| Method or import form | External locations found | Current purpose | Target owner/service/repository | Replacement timing |
| --- | --- | --- | --- | --- |
| import from `DataBaseHandler.js` | `src/api/routes/dashboard/adminStreamerRoutes.ts:2`; `src/bot.ts:8`; `src/commands/balance.ts:2`; `src/commands/menu.ts:20`; `src/commands/roulette.ts:7`; `src/core/BotAdmin.ts:6`; `src/core/ItemService.ts:4`; `src/core/LocaleService.ts:2`; `src/core/ObsService.ts:5`; `src/core/PermissionController.ts:2`; `src/core/StreamerService.ts:5`; `src/core/StreamerServicesService.ts:7`; `src/events/guildCreate.ts:3`; `src/events/guildDelete.ts:2`; `src/events/interactionCreate.ts:6`; `src/utils/syncWithDatabase.ts:3` | Runtime helper, singleton, static result helpers, `UpdateType`, and `DBResponse` types. | remove per file as replacements happen | mixed |
| `DataBaseHandler.getInstance()` | `src/utils/syncWithDatabase.ts:12`; plus chained calls listed below | Gets singleton helper. | no long-term owner | later |
| `loadStreamers` | `src/bot.ts:92` | Loads streamers for Twitch notification polling. | `StreamerNotificationService`/read repository | later |
| `getFromTable` | `src/commands/balance.ts:24`; `src/commands/menu.ts:3299`; `src/core/BotAdmin.ts:118`; `src/core/ItemService.ts:282, 297, 343, 613, 670, 742, 754, 865, 920, 933, 1517, 1529, 1693`; `src/core/LocaleService.ts:29, 75`; `src/core/StreamerService.ts:1194, 1223`; `src/utils/syncWithDatabase.ts:14` | Generic reads from `members`, `bot_settings`, `item_*`, `items`, `guilds`. | domain repositories/read services | later; ItemService/streamer/guild after inventories |
| `addRecords` | `src/core/ItemService.ts:309, 621, 687, 887, 1549, 1705`; `src/core/StreamerService.ts:192, 228` | Generic inserts into rarities/types/items/member_items/bot shop/public market/streamers/guild_streamers. | item/inventory/market/streamer repositories | after domain inventories |
| `updateTable` | `src/commands/roulette.ts:135`; `src/core/ItemService.ts:1531`; `src/core/LocaleService.ts:42` | Generic updates to `members.balance`, `item_general_store.price`, `members.locale`. | `EconomyService`, item shop repository, member/profile/locale service | roulette after economy inventory; locale later; item shop after item inventory |
| `isMemberExists` | `src/commands/roulette.ts:55`; `src/core/BotAdmin.ts:147`; `src/core/ItemService.ts:277`; `src/core/LocaleService.ts:70`; `src/core/ObsService.ts:212, 224`; `src/core/StreamerService.ts:1218`; `src/events/interactionCreate.ts:25` | Ensures or resolves member, sometimes also guild-member rows. | `MemberService`; `GuildMemberService` when guild relation is involved | after member lifecycle hardening |
| `ensureGuildBootstrap` | `src/events/guildCreate.ts:13`; `src/utils/syncWithDatabase.ts:36` | Ensures guild record, owner/member, channels, roles, log channels. | `GuildBootstrapService` + repositories | later |
| `deleteGuildFromDB` | `src/events/guildDelete.ts:6`; `src/utils/syncWithDatabase.ts:69` | Deletes guild rows for Discord removal/stale sync. | `GuildService`/`GuildRepository` | after DB inventory |
| `addGuildToDB` | `src/core/StreamerService.ts:1202` | Creates guild record by Discord guild id for streamer binding. | `GuildService`/`GuildRepository` | later |
| `isSuccess` | `src/bot.ts:93`; `src/commands/balance.ts:25`; `src/core/BotAdmin.ts:148`; `src/core/ItemService.ts:298, 614, 1530, 1694`; `src/core/LocaleService.ts:35`; `src/core/StreamerService.ts:1195`; `src/events/guildCreate.ts:14`; `src/events/guildDelete.ts:7`; `src/utils/syncWithDatabase.ts:17` | Narrows legacy `DBResponse` success shape. | local result type or explicit `success` check | low-risk only when paired with local response cleanup |
| `isFail` | `src/api/routes/dashboard/adminStreamerRoutes.ts:68`; `src/commands/menu.ts:3300`; `src/core/BotAdmin.ts:119`; `src/core/ItemService.ts:278, 283, 344, 626, 673, 743, 757, 866, 888, 921, 934, 1518, 1537, 1555, 1660, 1711`; `src/core/LocaleService.ts:49, 71, 76`; `src/core/ObsService.ts:214, 226`; `src/core/StreamerService.ts:198, 237, 691, 731, 791, 815, 1047, 1060, 1150, 1203, 1219, 1224`; `src/core/StreamerServicesService.ts:405`; `src/events/interactionCreate.ts:26, 51`; `src/utils/syncWithDatabase.ts:37` | Narrows legacy `DBResponse` failure shape. | local result type or explicit `success === false` check | safe only for local non-critical response checks first |
| `errorHandling` | `src/core/ItemService.ts:315, 334, 377, 417, 436, 455, 474, 501, 529, 561, 588, 607, 708, 796, 848, 899, 992, 1117, 1165, 1224, 1284, 1427, 1465, 1510, 1566, 1593, 1652, 1722, 1811, 1897, 1984, 2122, 2248, 2348, 2398, 2452`; `src/core/LocaleService.ts:65`; `src/core/PermissionController.ts:50`; `src/core/StreamerService.ts:251, 282, 314, 336, 368, 401, 422, 447, 530, 560, 592, 625, 647, 680, 701, 779, 798, 882, 898, 933, 966` | Converts caught errors into legacy `DBResponseFail`. | service-local error mapping or shared non-DB result helper | defer in large services until service inventory |

## 5. High-Risk Usages

| File path | Usage | Why high-risk | Target owner/service/repository | Replacement should happen |
| --- | --- | --- | --- | --- |
| `src/events/interactionCreate.ts:25` | `dataBaseHandler.isMemberExists(..., true, guildId, true, interaction)` | Central Discord interaction path can create member and guild-member state while also routing commands. | `MemberService` + `GuildMemberService` | after member lifecycle and guild-member ownership design |
| `src/events/guildCreate.ts:13` | `ensureGuildBootstrap(guild)` | Creates/syncs guild, channels, roles, owner membership, log channel defaults, and bootstrap status. | `GuildBootstrapService` + repositories | later |
| `src/events/guildDelete.ts:6` and `src/utils/syncWithDatabase.ts:69` | `deleteGuildFromDB(...)` | Destructive guild lifecycle path; cascade/archive semantics are not documented here. | `GuildService`/`GuildRepository` | after database inventory |
| `src/utils/syncWithDatabase.ts:36` | `ensureGuildBootstrap(guild)` during startup sync | Startup can perform broad guild sync and stale guild delete. | `GuildSyncService`/`GuildBootstrapService` | after database inventory |
| `src/commands/roulette.ts:135` | `updateTable("members", "balance", ..., UpdateType.Add)` | Direct economy mutation from a Discord command. | `EconomyService` or game/economy application service | after economy mutation inventory |
| `src/core/ItemService.ts` | `getFromTable`, `addRecords`, `updateTable`, `isMemberExists`, `errorHandling` across many methods | Large mixed service owns item catalog, inventory, market, craft, bot shop, member resolving, and balance-adjacent flows. | item/inventory/market/craft/economy repositories/services | after `ITEM_SERVICE_INVENTORY.md` |
| `src/core/StreamerService.ts` | `addRecords`, `addGuildToDB`, `isMemberExists`, `getFromTable`, many result helpers | Large mixed streamer/OBS/service-item file with guild/member/credential side effects. | streamer/guild/member/OBS repositories/services | after streamer/OBS inventory |
| `src/core/PermissionController.ts:50` | `DataBaseHandler.errorHandling(err)` | Bot command authorization boundary; error result shape affects private command access. | `PermissionService`/`PermissionRepository` | later |

## 6. Low-Risk Cleanup Candidates

| Candidate | File path | Why lower risk | Target owner/service/repository | Safe replacement strategy | Timing |
| --- | --- | --- | --- | --- | --- |
| Replace route-only `DataBaseHandler.isFail` check | `src/api/routes/dashboard/adminStreamerRoutes.ts:68` | No DB helper method call; only narrows an existing service response in one route. | `StreamerService` result contract | Use `response.success === false`; keep error mapping and response body identical. | now |
| Remove `DataBaseHandler` import from admin streamer route after above | `src/api/routes/dashboard/adminStreamerRoutes.ts:2` | Import becomes unused if static helper is removed. | route-local cleanup | Same tiny PR as the route-only check. | now |
| Move `/balance` read behind a read-only service method | `src/commands/balance.ts:24-25` | Read-only command, narrow output, no writes. | `EconomyService.getMemberBalance` or `MemberBalanceRepository` | Add service method first, preserve embed text/fields exactly, then switch command. | later |
| Replace `LocaleService.hasExplicitLocaleSelection` `getFromTable` | `src/core/LocaleService.ts:29-35` | Read-only bot_settings lookup, localized domain. | `LocalePreferenceRepository` or `SettingsService` | Add typed method for locale setting key and preserve boolean semantics. | later |

## 7. Replacement Owner Map

| Current DataBaseHandler area | Current files | Target owner/service/repository | Notes |
| --- | --- | --- | --- |
| Member ensure/load by Discord id | `src/commands/roulette.ts`; `src/core/BotAdmin.ts`; `src/core/ItemService.ts`; `src/core/LocaleService.ts`; `src/core/ObsService.ts`; `src/core/StreamerService.ts`; `src/events/interactionCreate.ts` | `MemberService` + future `MemberRepository`; `GuildMemberService` where guild membership is involved | Replace after `MemberService.ensureMemberByDiscordId` is hardened and guild-member lifecycle is mapped. |
| Guild bootstrap/sync/delete | `src/events/guildCreate.ts`; `src/events/guildDelete.ts`; `src/utils/syncWithDatabase.ts`; `src/core/StreamerService.ts` | `GuildService`, `GuildBootstrapService`, `GuildRepository`, `GuildChannelRepository`, `GuildRoleRepository`, `LogChannelRepository` | High-risk. Needs database inventory and explicit deletion policy. |
| Bot startup streamer notification load | `src/bot.ts` | `StreamerNotificationService` or `StreamerRepository` read model | Read-only but affects live polling behavior. |
| Bot/admin settings | `src/core/BotAdmin.ts`; `src/core/LocaleService.ts` | `SettingsService` or specific repositories: `BotContributorRepository`, `LocalePreferenceRepository` | Avoid making `bot_settings` an uncontrolled catch-all replacement. |
| Economy/balance read | `src/commands/balance.ts`; `src/commands/menu.ts` | `EconomyService` read method or `MemberBalanceRepository` | Read-only; can be done before mutation extraction if response shape is stable. |
| Economy/balance mutation | `src/commands/roulette.ts` | `EconomyService` or game/economy use-case service | Defer until `ECONOMY_MUTATION_INVENTORY.md`. |
| Item catalog/inventory/market/craft | `src/core/ItemService.ts` | `ItemCatalogRepository`, `InventoryRepository`, `MarketRepository`, `CraftRepository`, `BotShopRepository` | Defer until `ITEM_SERVICE_INVENTORY.md`. |
| Streamers/OBS/service items | `src/core/StreamerService.ts`; `src/core/StreamerServicesService.ts`; `src/core/ObsService.ts` | `StreamerRepository`, `StreamerAccessService`, `ObsSettingsRepository`, `ObsAgentCredentialRepository`, service item owner | Needs focused streamer/OBS/service-item map. |
| Permission result/error mapping | `src/core/PermissionController.ts`; `src/events/interactionCreate.ts` | `PermissionService`/`PermissionRepository` | Authorization boundary; do not do as first replacement. |
| Legacy `DBResponse` helpers | many files | local explicit result checks or shared result utility not coupled to DB | Only replace where local behavior is obvious. |

## 8. First Safe Replacement Candidates

| Order | Candidate | File path | Why this is safe enough to do first | Required guardrails | Timing |
| ---: | --- | --- | --- | --- | --- |
| 1 | Replace `DataBaseHandler.isFail(response)` with explicit service response check in admin streamer delete route | `src/api/routes/dashboard/adminStreamerRoutes.ts:68` | It does not change data access, SQL, service behavior, or response shape; it only removes a static helper dependency from one route. | Keep returned `ok/error/message/data` shapes identical; no service refactor in same PR. | now |
| 2 | Introduce a read-only balance owner and switch `/balance` to it | `src/commands/balance.ts:24-25` | The command is narrow and read-only; it is a good first command-level replacement after the owner method exists. | Add a tiny `EconomyService`/member balance read method or repository method first; preserve embed fields and failure text exactly; do not touch `menu.ts` in the same PR. | later |

## 9. Blocked/Deferred Replacements And Why

| Usage | File path | Why blocked/deferred | Required prior work |
| --- | --- | --- | --- |
| `isMemberExists` with guild write flags | `src/events/interactionCreate.ts:25` | It can create both member and guild-member state in the hottest Discord adapter path. | Member lifecycle hardening plus guild-member ownership design. |
| `deleteGuildFromDB` | `src/events/guildDelete.ts:6`; `src/utils/syncWithDatabase.ts:69` | Destructive behavior and cascade semantics are not inventoried. | `DATABASE_INVENTORY.md` and explicit delete/archive decision. |
| `ensureGuildBootstrap` | `src/events/guildCreate.ts:13`; `src/utils/syncWithDatabase.ts:36` | Broad guild/channel/role/log-channel sync and bootstrap side effects. | Guild bootstrap inventory and repositories. |
| `ItemService` generic helper usage | `src/core/ItemService.ts` | File mixes item catalog, inventory, market, bot shop, craft, member resolving, and economy-adjacent behavior. | `ITEM_SERVICE_INVENTORY.md`. |
| `StreamerService` generic helper usage | `src/core/StreamerService.ts` | File mixes streamers, guilds, OBS credentials, relay, service item actions, and settings cleanup. | Streamer/OBS/service-item inventory or targeted replacement map. |
| Roulette balance mutation | `src/commands/roulette.ts:135` | Direct money mutation from command handler; owner is unclear between game and economy. | `ECONOMY_MUTATION_INVENTORY.md` and target economy use-case. |
| Permission error/result helpers | `src/core/PermissionController.ts:50`; `src/events/interactionCreate.ts:51` | Authorization boundary for private commands. | Permission service/repository result design. |
| `menu.ts` balance read | `src/commands/menu.ts:3299-3300` | Large command UI file, higher accidental behavior-change risk than `/balance`. | Command/menu inventory or after `/balance` read replacement proves stable. |

## Explicit Non-Changes

- No runtime code was changed.
- No `DataBaseHandler` usage was removed.
- No refactor was performed.
- No fixes were applied.
- No files were moved.
- No build is required for this docs-only inventory.
