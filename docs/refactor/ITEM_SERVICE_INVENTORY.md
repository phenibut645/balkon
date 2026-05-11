# ItemService Inventory

This document records the current `ItemService` surface before future item-platform work.

It is a factual inventory and planning aid. It does not change runtime code, schema, migrations, routes, frontend, bot commands, or behavior by itself.

Read together with:

- `docs/ARCHITECTURE_PLAN.md`
- `docs/refactor/STABILIZATION_PLAN.md`
- `docs/refactor/DB_ACCESS_BOUNDARY.md`
- `docs/refactor/ECONOMY_MUTATION_INVENTORY.md`
- `docs/refactor/ITEM_SYSTEM_DESIGN.md`
- `docs/refactor/ITEM_SYSTEM_SENIOR_NOTES.md`

## 1. Verdict

The recommended medium slices have been completed and accepted: the read-only item catalog/search boundary has been extracted from `ItemService` into `ItemCatalogReadService`, the read-only inventory boundary has been extracted into `ItemInventoryReadService`, the read-only bot shop boundary has been extracted into `BotShopReadService`, the read-only craft recipe boundary has been extracted into `CraftRecipeReadService`, the read-only public market boundary has been extracted into `PublicMarketReadService`, and the shared item read/view DTO types have been extracted into `ItemViewTypes`, with `ItemService` preserving the same public compatibility methods and type re-exports.

Why this slice was chosen:

- It reduces long-term item-system debt by separating item template, rarity/type, presentation metadata, and autocomplete reads from the overloaded `ItemService`.
- It directly supports future admin/API-managed configuration because item templates, rarities, types, localization, image URL, emoji, and sell/trade flags become a clearer catalog boundary.
- It avoids economy-coupled and transaction-heavy flows.
- It preserves response shapes used by API, Discord commands, and website/admin UI.
- It does not implement cases, keys, potions, bundles, serial numbers, upgrades, schema migrations, or item admin UI.

Completed in this slice:

- Added `src/core/ItemCatalogReadService.ts` as a narrow singleton read boundary.
- Moved read-only ownership for `listRarities(...)`, `searchRarities(...)`, `searchItemTypes(...)`, `searchItemTemplates(...)`, `listItemTemplates(...)`, and `getItemTemplateById(...)` into `ItemCatalogReadService`.
- Moved the `mapItemTemplateRow(...)` mapper required by `getItemTemplateById(...)` into `ItemCatalogReadService`.
- Kept `ItemService` method names and return shapes unchanged by delegating those six public methods to `ItemCatalogReadService`.
- Added `src/core/ItemInventoryReadService.ts` as a narrow singleton inventory read boundary.
- Moved read-only ownership for `searchUserInventory(...)`, `getInventory(...)`, and `getInventoryItemById(...)` into `ItemInventoryReadService`.
- Moved the `mapInventoryRow(...)` mapper required by `getInventory(...)` and `getInventoryItemById(...)` into `ItemInventoryReadService`.
- Kept `ItemService` method names and return shapes unchanged by delegating those three public inventory read methods to `ItemInventoryReadService`.
- Added `src/core/BotShopReadService.ts` as a narrow singleton bot shop read boundary.
- Moved read-only ownership for `searchBotShopListings(...)` and `listBotShop(...)` into `BotShopReadService`.
- Added `mapBotShopRow(...)` inside `BotShopReadService` for the bot shop list projection.
- Kept `ItemService` method names and return shapes unchanged by delegating those two public bot shop read methods to `BotShopReadService`.
- Added `src/core/CraftRecipeReadService.ts` as a narrow singleton craft recipe read boundary.
- Moved read-only ownership for `searchCraftRecipes(...)`, `listCraftRecipes(...)`, and `getCraftRecipeById(...)` into `CraftRecipeReadService`.
- Moved the `mapCraftRecipe(...)` read-only projection helper into `CraftRecipeReadService`.
- Kept `ItemService` method names and return shapes unchanged by delegating those three public craft recipe read methods to `CraftRecipeReadService`.
- Added `src/core/PublicMarketReadService.ts` as a narrow singleton public market read boundary.
- Moved read-only ownership for `searchPublicListings(...)`, `searchUserPublicListings(...)`, `listPublicMarket(...)`, and `listUserPublicMarket(...)` into `PublicMarketReadService`.
- Added local public market row and display-name mapping helpers inside `PublicMarketReadService` without widening scope.
- Kept `ItemService` method names and return shapes unchanged by delegating those four public market read methods to `PublicMarketReadService`.
- Added `src/core/ItemViewTypes.ts` as the neutral source of truth for shared item read/view DTO interfaces.
- Moved shared exported item read/view types out of `ItemService` into `ItemViewTypes`, including the cross-service `ItemTemplateRow` typing used by catalog reads.
- Kept `ItemService` type-compatible for existing imports by re-exporting those moved types from `ItemViewTypes`.
- Kept listing creation, market cancel or price update, market purchases, bot shop buy/sell mutations, inventory mutations, craft execution, craft recipe writes, OBS/service-item, and other write flows in `ItemService` for later slices.

Do not pick these first:

- `giveItemToMember(...)`
- `listItemForSale(...)`
- `createPublicListing(...)`
- `cancelPublicListing(...)`
- `buyPublicListing(...)`
- `buyFromBotShop(...)`
- `sellInventoryItemToBot(...)`
- `craftForMember(...)`
- service/OBS item use
- broad `ItemService` rewrite
- schema migration for serial numbers, cases, keys, potions, bundles, or upgrades

## 2. Current Status Summary

`src/core/ItemService.ts` is a transitional legacy boundary. It currently mixes:

- member resolving compatibility wrapper;
- rarity/type administration;
- item template CRUD;
- compatibility ownership of shared item read/view type exports;
- inventory reads;
- inventory grants;
- public market listing and purchase flows;
- bot shop listing and purchase/sell flows;
- craft recipe management and craft execution;
- search/autocomplete helpers;
- direct economy mutations through `members.balance` in market/shop/sell-to-bot flows;
- notification side effects for market sales.

Current schema facts from `sql/tables.sql`:

- `items` is the current item template table.
- `member_items` is the current inventory instance table.
- `member_items.tier` exists and defaults in code-created records to `1`, but no upgrade system exists.
- `member_items` has no per-template serial number.
- `items` has `emoji`, `image_url`, `name_ru`, `name_en`, `name_et`, `description_ru`, `description_en`, `description_et`, `tradeable`, `sellable`, and `bot_sell_price`.
- `items` does not currently have `slug`, `icon_url`, `primary_color_hex`, `usable`, `consumable`, `stackable`, `max_stack`, or `max_tier` in the baseline schema.
- `item_public_market.price` and `item_general_store.price` are `FLOAT`.
- `items.bot_sell_price` is `DECIMAL(10, 2)`.
- `item_service_actions` exists and is owned in practice by `StreamerService`, not `ItemService`, though `ItemService.deleteItemTemplate(...)` checks it for usage.

## 3. Exact Inventory Table

| Domain | Method/helper | Lines | Responsibility | SQL/tables touched | DataBaseHandler usage | pool/query usage | Transaction behavior | Member resolving | Balance mutation | Inventory mutation | Dependency/side effect | Current callers | Response shape | Target owner | Risk | Candidate grouping | Replace now? |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Member resolving compatibility wrapper | `getInstance` | 269-275 | Singleton accessor | None | None | None | None | None | None | None | Global singleton | Many services/routes/commands | `ItemService` instance | Transitional only | Low | None | No |
| Member resolving compatibility wrapper | `ensureMemberByDiscordId` | 277-294 | Ensure/load member by Discord ID and return full legacy `MembersDB` row | `members` | `getFromTable("members", { id })` | None | None | Calls `memberService.ensureMemberByDiscordId(..., { createdSource: "unknown" })` then legacy load | Reads balance as part of full row | None | Throws generic errors | `EconomyService` previously, `JobService`, routes after market/sell for balance, `StreamerServicesService`, `StreamerApplicationService`, commands indirectly | `DBResponseSuccess<MembersDB>` | `MemberService` / future member read boundary | Medium | Member resolving cleanup | Yes, but not in item-platform slice |
| Rarities and item types | `createRarity` | 296-320 | Create rarity with normalized lower-case name and optional color | `item_rarities` | `getFromTable`, `addRecords` | None | None | None | None | None | None | Admin/menu routes/commands | `DBResponse<{ insertId }>` | `ItemCatalogService` / `ItemCatalogRepository` | Low-medium | Catalog admin boundary | Later |
| Rarities and item types | `listRarities` | 322-339 | Compatibility method in `ItemService`; delegates rarity list read to `ItemCatalogReadService` | `item_rarities` | Error helper only | `SELECT id, name, color_hex` | None | None | None | None | None | Admin rarity API/menu | `DBResponse<ItemRarityView[]>` | `ItemCatalogReadService` | Low | Completed read slice | Completed |
| Rarities and item types | `updateRarity` | 341-382 | Update rarity name/color with duplicate check | `item_rarities`, `items` indirectly only by FK semantics | `getFromTable` | `SELECT duplicate`, `UPDATE item_rarities` | None | None | None | None | None | Admin/menu | `DBResponse<{ rarityId }>` | `ItemCatalogService` | Medium | Catalog admin boundary | Later |
| Rarities and item types | `deleteRarity` | 384-422 | Delete rarity if not used by item templates | `item_rarities`, `items` usage count | Error helper only | `SELECT COUNT(*) FROM items`, `DELETE item_rarities` | None | None | None | None | Destructive metadata delete | Admin/menu | `DBResponse<{ rarityId }>` | `ItemCatalogService` | Medium | Catalog admin boundary | Later |
| Search/autocomplete helpers | `searchRarities` | 424-441 | Compatibility method in `ItemService`; delegates rarity autocomplete to `ItemCatalogReadService` | `item_rarities` | Error helper only | `SELECT id, name ... LIKE` | None | None | None | None | None | `dashboardRoutes` admin search, menu autocomplete | `DBResponse<AutocompleteOption[]>`, `value` is rarity name | `ItemCatalogReadService` | Low | Completed read slice | Completed |
| Search/autocomplete helpers | `searchItemTypes` | 443-460 | Compatibility method in `ItemService`; delegates item type autocomplete to `ItemCatalogReadService` | `item_types` | Error helper only | `SELECT id, name ... LIKE` | None | None | None | None | None | `dashboardRoutes` admin search, menu/item create flows | `DBResponse<AutocompleteOption[]>`, `value` is type name | `ItemCatalogReadService` | Low | Completed read slice | Completed |
| Search/autocomplete helpers | `searchItemTemplates` | 462-479 | Compatibility method in `ItemService`; delegates item template autocomplete to `ItemCatalogReadService` | `items` | Error helper only | `SELECT id, name ... LIKE` | None | None | None | None | None | `iteminfo`, `itemgive`, `serviceaction`, admin jobs/menu/search | `DBResponse<AutocompleteOption[]>`, `name="#id name"`, `value=id` | `ItemCatalogReadService` | Low | Completed read slice | Completed |
| Search/autocomplete helpers | `searchUserInventory` | 481-506 | Compatibility method in `ItemService`; delegates inventory autocomplete to `ItemInventoryReadService` | `member_items`, `members`, `items` | Error helper only | Join read by owner Discord ID | None | Reads by Discord ID only; does not ensure member | None | None | None | Menu/command autocomplete | `DBResponse<AutocompleteOption[]>`, `name="#inventoryId name"`, `value=inventoryItemId` | `ItemInventoryReadService` | Low-medium | Completed inventory read slice | Completed |
| Search/autocomplete helpers | `searchPublicListings` | 508-534 | Compatibility method in `ItemService`; delegates public market autocomplete to `PublicMarketReadService` | `item_public_market`, `member_items`, `items` | Error helper only | Join read | None | None | None | None | None | Market/menu autocomplete | `DBResponse<AutocompleteOption[]>` | `PublicMarketReadService` | Low-medium | Completed public market read slice | Completed |
| Search/autocomplete helpers | `searchUserPublicListings` | 536-566 | Compatibility method in `ItemService`; delegates user market autocomplete to `PublicMarketReadService`, preserving current in-memory filtering over `listUserPublicMarket(...)` | Indirect `item_public_market`, `member_items`, `items`, `members` | In callee only | In callee only | None | None | None | None | Depends on full market list projection | Market/menu autocomplete | `DBResponse<AutocompleteOption[]>` | `PublicMarketReadService` | Medium | Completed public market read slice | Completed |
| Search/autocomplete helpers | `searchBotShopListings` | 568-593 | Compatibility method in `ItemService`; delegates bot shop autocomplete to `BotShopReadService` | `item_general_store`, `items` | Error helper only | Join read | None | None | None | None | None | Bot shop/menu autocomplete | `DBResponse<AutocompleteOption[]>` | `BotShopReadService` | Low-medium | Completed bot shop read slice | Completed |
| Search/autocomplete helpers | `searchCraftRecipes` | 595-612 | Compatibility method in `ItemService`; delegates craft recipe autocomplete to `CraftRecipeReadService` | `craft_recipes` | Error helper only | `SELECT id, name ... LIKE` | None | None | None | None | None | Craft/menu autocomplete | `DBResponse<AutocompleteOption[]>` | `CraftRecipeReadService` | Low-medium | Completed craft read slice | Completed |
| Rarities and item types | `ensureItemType` | 614-640 | Find or create item type by normalized name | `item_types` | `getFromTable`, `addRecords` | None | None | None | None | None | Creates catalog metadata implicitly | `createItemTemplate`, `updateItemTemplate` | `DBResponseSuccess<ItemTypesDB>` or throw | `ItemCatalogService` | Medium | Catalog write boundary | No |
| Item catalog / templates | `createItemTemplate` | 642-713 | Create item template with localization, emoji, image URL, tradeable/sellable, bot sell price, creator | `items`, `item_rarities`, `item_types`, `members` | `getFromTable`, `addRecords` | None | None | Calls `ensureItemType`; calls `ensureMemberByDiscordId` for creator | None | None | Creates type as side effect if missing | API `/admin/items`, Discord `itemcreate`, menu admin | `DBResponse<{ insertId }>` | `ItemCatalogService` plus member owner | Medium | Catalog admin boundary | Not first read slice |
| Item catalog / templates | `updateItemTemplate` | 715-801 | Update item template metadata/localization/prices | `items`, `item_rarities`, `item_types` | `getFromTable` | `UPDATE items` | None | Calls `ensureItemType`; no member actor tracked | None | None | Creates type as side effect if missing | API `/admin/items/:id`, menu admin | `DBResponse<{ itemTemplateId }>` | `ItemCatalogService` | Medium | Catalog admin boundary | Not first read slice |
| Item catalog / templates | `deleteItemTemplate` | 803-853 | Delete template only if not used | `items`, `member_items`, `item_general_store`, `craft_recipes`, `craft_recipe_ingredients`, `item_service_actions` | Error helper only | Usage-count subselects; `DELETE items` | None | None | None | Blocks if inventory usage exists; deletes template if no usage | Destructive; service action dependency | API `/admin/items/:id`, menu admin | `DBResponse<{ itemTemplateId }>` | `ItemCatalogService`; usage checks may call inventory/shop/craft/service boundaries later | High | Catalog admin boundary, but not first | No |
| Inventory grants / mutations | `giveItemToMember` | 855-904 | Admin/bot grant item template instances to member | `items`, `members`, `member_items` | `getFromTable`, `addRecords` | None | No explicit transaction across amount inserts | Calls `ensureMemberByDiscordId` | None | Inserts N `member_items`, `tier=1`, original owner=target | None | `itemgive`, possible admin flows | `DBResponse<{ inserted }>` | `InventoryService` / `InventoryRepository` | Medium-high | Inventory grant slice | No |
| Craft recipes and craft execution | `createCraftRecipe` | 906-999 | Admin create craft recipe and ingredients | `craft_recipes`, `craft_recipe_ingredients`, `items`, `members` | Pre-transaction `getFromTable` for templates | `connection.query` insert recipe/ingredients | Explicit transaction for recipe + ingredients | Calls `ensureMemberByDiscordId` for creator before transaction | None | None | None | API `/admin/craft/recipes`, menu/admin | `DBResponse<{ recipeId }>` | `CraftRecipeService` | Medium | Craft recipe admin boundary | Not first |
| Craft recipes and craft execution | `updateCraftRecipe` | 1001-1124 | Admin update recipe and replace ingredients | `craft_recipes`, `craft_recipe_ingredients`, `items` | Error helper only | `SELECT ... FOR UPDATE`, `UPDATE`, `DELETE ingredients`, `INSERT ingredients` | Explicit transaction | None | None | Deletes/reinserts recipe ingredients | None | API `/admin/craft/recipes/:id`, menu/admin | `DBResponse<{ recipeId }>` | `CraftRecipeService` | Medium-high | Craft recipe admin boundary | Not first |
| Craft recipes and craft execution | `deleteCraftRecipe` | 1126-1172 | Admin delete recipe and ingredients | `craft_recipes`, `craft_recipe_ingredients` | Error helper only | `SELECT ... FOR UPDATE`, delete ingredients, delete recipe | Explicit transaction | None | None | Deletes recipe config only | Destructive config delete | API `/admin/craft/recipes/:id`, menu/admin | `DBResponse<{ recipeId }>` | `CraftRecipeService` | Medium | Craft recipe admin boundary | Not first |
| Craft recipes and craft execution | `listCraftRecipes` | 1174-1229 | Compatibility method in `ItemService`; delegates craft recipe list read to `CraftRecipeReadService` | `craft_recipes`, `craft_recipe_ingredients`, `items`, `item_rarities` | Error helper only | Two read queries | None | None | None | None | None | API `/craft/recipes`, `/admin/craft/recipes`, craft/menu UI | `DBResponse<CraftRecipeView[]>` | `CraftRecipeReadService` | Low-medium | Completed craft read slice | Completed |
| Craft recipes and craft execution | `getCraftRecipeById` | 1231-1289 | Compatibility method in `ItemService`; delegates craft recipe detail read to `CraftRecipeReadService` | `craft_recipes`, `craft_recipe_ingredients`, `items`, `item_rarities` | Error helper only | Two read queries | None | None | None | None | None | `craftExecutionRoutes` before craft execution | `DBResponse<CraftRecipeView | null>` | `CraftRecipeReadService` | Low-medium | Completed craft read slice | Completed |
| Craft recipes and craft execution | `craftForMember` | 1291-1434 | Execute craft: check ingredients, consume owned items, delete related public listings, grant result items | `craft_recipes`, `craft_recipe_ingredients`, `items`, `item_rarities`, `member_items`, `item_public_market`, `members` | Error helper only; member resolve uses wrapper | Many `connection.query`, dynamic `IN` placeholders | Explicit transaction; recipe row locked; all member inventory rows locked | Calls `ensureMemberByDiscordId` inside transaction, but its internal DB read is outside the same connection | None | Deletes ingredient `member_items`, deletes public listings for consumed items, inserts result `member_items` with `tier=1` | No notification/audit | API `/craft/:recipeId/craft`, menu craft | `DBResponse<{ crafted; resultItemTemplateId; resultAmount }>` | `CraftExecutionService` + `InventoryService` | High | Craft execution slice | No |
| Item catalog / templates | `listItemTemplates` | 1436-1470 | Compatibility method in `ItemService`; delegates item template list read to `ItemCatalogReadService` | `items`, `item_types`, `item_rarities` | Error helper only | Join read | None | None | None | None | None | API `/admin/items`, menu admin, admin jobs selector | `DBResponse<ItemTemplateRow[]>` raw-ish DB row shape | `ItemCatalogReadService` | Low | Completed read slice | Completed |
| Item catalog / templates | `getItemTemplateById` | 1472-1515 | Compatibility method in `ItemService`; delegates item template view read to `ItemCatalogReadService` | `items`, `item_types`, `item_rarities` | Error helper only | Join read | None | None | None | None | None | `StreamerService.upsertItemServiceAction`, item info flows | `DBResponse<ItemTemplateView | null>` | `ItemCatalogReadService` | Low | Completed read slice | Completed |
| Bot shop buy/sell | `addOrUpdateBotShopListing` | 1517-1571 | Admin create/update bot shop listing for item template | `item_general_store`, `items` | `getFromTable`, `updateTable`, `addRecords` | None | None | None | None | None | Upsert behavior by `item_id`; no explicit actor | API `/admin/botshop`, menu/admin | `DBResponse<{ listingId }>` | `BotShopService` | Medium | Bot shop admin boundary | Not first |
| Bot shop buy/sell | `deleteBotShopListing` | 1573-1598 | Delete bot shop listing | `item_general_store` | Error helper only | `DELETE item_general_store` | None | None | None | None | Destructive listing config delete | API `/admin/botshop/:listingId`, menu/admin | `DBResponse<{ listingId }>` | `BotShopService` | Medium | Bot shop admin boundary | Not first |
| Bot shop buy/sell | `listBotShop` | 1600-1657 | Compatibility method in `ItemService`; delegates bot shop listing read to `BotShopReadService` | `item_general_store`, `items`, `item_types`, `item_rarities` | Error helper only | Join read | None | None | None | None | None | API `/botshop`, `/admin/botshop`, menu bot shop | `DBResponse<BotShopListingView[]>` | `BotShopReadService` | Low-medium | Completed bot shop read slice | Completed |
| Public market | `createPublicListing` | 1659-1727 | List owned inventory item on public market | `member_items`, `item_public_market`, `items` via inventory read | `getFromTable`, `addRecords` | Indirect through `getInventoryItemById` | No explicit transaction | Uses inventory item owner Discord ID; no ensure | None | Inserts `item_public_market` row | Depends on inventory read and tradeable flag | API `/inventory/:id/market-listing`, market command/menu | `DBResponse<{ listingId }>` | `MarketService` | Medium-high | Market listing slice | No |
| Public market | `cancelPublicListing` | 1729-1818 | Cancel own listing | `item_public_market`, `member_items`, `members`, `items`, `item_types`, `item_rarities` | Error helper only | `SELECT ... FOR UPDATE`, `DELETE item_public_market` | Explicit transaction | Seller verified by Discord ID from joined member row | None | Deletes listing only | None | API `/market/:id`, market command/menu | `DBResponse<{ listingId; inventoryItemId }>` | `MarketService` | Medium | Market listing slice | Not first |
| Public market | `updatePublicListingPrice` | 1820-1904 | Update own listing price | `item_public_market`, `member_items`, `members`, `items`, `item_types`, `item_rarities` | Error helper only | `SELECT ... FOR UPDATE`, `UPDATE item_public_market` | Explicit transaction | Seller verified by Discord ID | None | Updates listing price only | None | API `/market/:id`, market command/menu | `DBResponse<{ listingId; price }>` | `MarketService` | Medium | Market listing slice | Not first |
| Public market | `listPublicMarket` | 1906-1989 | Compatibility method in `ItemService`; delegates public market listing read to `PublicMarketReadService` | `item_public_market`, `member_items`, `members`, `items`, `item_types`, `item_rarities` | Error helper only | Join read | None | Reads display cache from `members` | None | None | Uses local display-name mapper in `PublicMarketReadService` | API `/market`, menu market | `DBResponse<PublicMarketListingView[]>` | `PublicMarketReadService` | Low-medium | Completed public market read slice | Completed |
| Public market | `listUserPublicMarket` | 1991-2001 | Compatibility method in `ItemService`; delegates seller-filtered public market read to `PublicMarketReadService` | Indirect same as `listPublicMarket` | In callee only | In callee only | None | None | None | None | Preserves current full-list filter behavior by seller Discord ID | Menu/user market views | `DBResponse<PublicMarketListingView[]>` | `PublicMarketReadService` | Medium | Completed public market read slice | Completed |
| Economy-coupled item flows | `buyPublicListing` | 2003-2129 | Buy market listing: buyer pays seller, inventory ownership transfers, listing removed | `item_public_market`, `member_items`, `members.balance`, `members`, `items`, `item_types`, `item_rarities` | Error helper only; member resolving wrapper | `SELECT ... FOR UPDATE`, `UPDATE members`, `UPDATE member_items`, `DELETE item_public_market` | Explicit transaction; notification after commit | Calls `ensureMemberByDiscordId` for buyer; seller row locked separately | Direct buyer debit and seller credit | Updates `member_items.member_id`; deletes listing | Seller notification after commit through `NotificationService`; no audit/ledger | API `/market/:id/buy`, market command/menu | `DBResponse<{ inventoryItemId }>`; API adds `listingId` and post-read `balance` | `MarketService` + `EconomyService` + `InventoryService` | High | Market purchase slice | No |
| Public market | `createSellerMarketSaleNotification` | 2131-2160 | Best-effort seller notification after market sale | `notifications` via `NotificationService` | None | None locally | Runs after market purchase commit; catches/logs errors | Uses member ids passed from purchase | None | None | Calls `NotificationService.createForMember`; failure swallowed | Only `buyPublicListing` | `Promise<void>` | `NotificationService` call stays in use case owner | Medium | Market purchase slice | No |
| Economy-coupled item flows | `buyFromBotShop` | 2162-2255 | Buy fixed-price bot shop item(s): debit buyer and insert inventory items | `item_general_store`, `items`, `item_types`, `item_rarities`, `members.balance`, `member_items` | Error helper only; member resolving wrapper | `SELECT ... FOR UPDATE`, `UPDATE members`, bulk `INSERT member_items` | Explicit transaction | Calls `ensureMemberByDiscordId` for buyer | Direct buyer debit | Inserts N `member_items`, `tier=1`, original owner=buyer | No notification/audit | API `/botshop/:listingId/buy`, menu bot shop | `DBResponse<{ inserted }>` | `BotShopService` + `EconomyService` + `InventoryService` | High | Bot shop purchase slice | No |
| Economy-coupled item flows | `sellInventoryItemToBot` | 2257-2355 | Sell owned inventory item to bot: delete item/listing and credit balance | `member_items`, `item_public_market`, `items`, `members.balance`, `item_types`, `item_rarities` | Error helper only | `SELECT ... FOR UPDATE`, deletes listing/item, `UPDATE members` | Explicit transaction | Seller verified by joined owner row | Direct seller credit | Deletes listing and inventory item | No notification/audit | API `/inventory/:id/sell-to-bot`, menu inventory | `DBResponse<{ price }>`; API adds `received`, post-read `balance` | `BotShopService`/`InventoryService` + `EconomyService` | High | Sell-to-bot slice | No |
| Inventory reads | `getInventory` | 2357-2403 | Compatibility method in `ItemService`; delegates inventory list read to `ItemInventoryReadService` | `member_items`, `members`, `items`, `item_types`, `item_rarities` | Error helper only | Join read | None | Reads by owner Discord ID; does not ensure member | None | None | Uses `mapInventoryRow`; display-name mapping is response contract | API `/inventory`, `/inventory` command, menu | `DBResponse<InventoryItemView[]>` | `ItemInventoryReadService` | Low-medium | Completed inventory read slice | Completed |
| Inventory reads | `getInventoryItemById` | 2405-2457 | Compatibility method in `ItemService`; delegates inventory item read to `ItemInventoryReadService` | `member_items`, `members`, `items`, `item_types`, `item_rarities` | Error helper only | Join read | None | None | None | None | Used by market listing, service item prep, item view | `DBResponse<InventoryItemView | null>` | `ItemInventoryReadService` | Low-medium | Completed inventory read slice | Completed |
| Presentation metadata and localization | `mapInventoryRow` | 2459-2494 | Private mapper moved from `ItemService` to `ItemInventoryReadService` for inventory read projection | None | None | None | None | None | None | None | Calls equivalent display-name mapping; response contract preserved | `getInventory`, `getInventoryItemById` | `InventoryItemView` | `ItemInventoryReadService` | Low | Completed inventory read slice | Completed |
| Presentation metadata and localization | `resolveMemberDisplayName` | 2496-2508 | Tiny fallback display-name helper still present in `ItemService`; equivalent local helpers now live in the extracted inventory and public market read services | None | None | None | None | None | None | None | Legacy duplicate helper retained during incremental extraction | `ItemInventoryReadService`, `PublicMarketReadService` | `string` | Read model-local helper | Low | Pure helper/read model | Later |
| Presentation metadata and localization | `mapItemTemplateRow` | 2510-2530 | Private mapper moved from `ItemService` to `ItemCatalogReadService` for item template read projection | None | None | None | None | None | None | None | Maps localization/presentation fields | `getItemTemplateById` | `ItemTemplateView` | `ItemCatalogReadService` | Low | Completed read slice | Completed |
| Presentation metadata and localization | `mapCraftRecipe` | 2532-2563 | Private mapper moved from `ItemService` to `CraftRecipeReadService` for craft recipe read projection | None | None | None | None | None | None | None | Maps result/ingredient localization and emoji | `listCraftRecipes`, `getCraftRecipeById` | `CraftRecipeView` | `CraftRecipeReadService` | Low | Completed craft read slice | Completed |
| Presentation metadata and localization | `normalizeRequiredText` | 2565-2572 | Trim required text and throw if empty | None | None | None | None | None | None | None | Shared by many writes | Internal helper | `string` or throw | Local validator in target services | Low | Move with direct callers | Not alone |
| Presentation metadata and localization | `normalizeOptionalText` | 2574-2581 | Trim optional text to `string|null` | None | None | None | None | None | None | None | Shared by catalog/craft writes | Internal helper | `string|null` | Local validator | Low | Move with direct callers | Not alone |
| Presentation metadata and localization | `normalizeLocalizedName` | 2583-2590 | Optional localized name max 255 chars | None | None | None | None | None | None | None | Catalog writes | Internal helper | `string|null` or throw | Item catalog validator | Low | Catalog write boundary | Later |
| Rarities and item types | `normalizeColorHex` | 2592-2603 | Validate rarity color hex | None | None | None | None | None | None | None | Rarity writes | Internal helper | `string|null` or throw | Item catalog validator | Low | Catalog write boundary | Later |
| Presentation metadata and localization | `normalizeImageUrl` | 2605-2623 | Validate absolute http/https image URL | None | None | None | None | None | None | None | Template create/update | Internal helper | `string|null` or throw | Item catalog validator | Low | Catalog write boundary | Later |
| Bot shop buy/sell | `normalizeBotSellPrice` | 2625-2635 | Validate non-negative bot sell price and round to 2 decimals | None | None | None | None | None | None | None | Template create/update | Internal helper | `number|null` or throw | Item catalog or bot shop validator | Low-medium due money type | Catalog write boundary | Later |
| Public market / bot shop | `normalizeStrictPositivePrice` | 2637-2643 | Validate positive finite price and round to 2 decimals | None | None | None | None | None | None | None | Market listing, bot shop listing | Internal helper | `number` or throw | Market/BotShop validators | Medium due money type | Not first | No |
| Craft / bot shop | `normalizePositiveInteger` | 2645-2651 | Validate positive integer amount | None | None | None | None | None | None | None | Craft and shop amounts | Internal helper | `number` or throw | Local validators | Low | Move with direct callers | Not alone |
| Craft recipes and craft execution | `normalizeCraftIngredients` | 2653-2665 | Aggregate duplicate ingredient template ids and validate positive amounts | None | None | None | None | None | None | None | Craft recipe create/update | Internal helper | Array of `{ itemTemplateId; amount }` | `CraftRecipeService` validator | Low-medium | Craft recipe admin boundary | Later |

## 4. Domain Grouping

### 4.1 Member resolving compatibility wrapper

Current methods:

- `ensureMemberByDiscordId(...)`

Current behavior:

- Ensures a member through `MemberService`.
- Reloads the full `members` row through `DataBaseHandler.getFromTable(...)`.
- Returns full `MembersDB`, which leaks unrelated member fields, including balance, into item and route flows.

Target direction:

- Move callers to `MemberService` or narrow member read methods.
- Do not keep `ItemService` as member resolving owner.

Risk:

- Medium because many services/routes use it as compatibility glue.
- Should not be mixed into item catalog extraction unless only type imports are needed.

### 4.2 Item catalog / templates

Current methods:

- `createItemTemplate(...)`
- `updateItemTemplate(...)`
- `deleteItemTemplate(...)`
- `listItemTemplates(...)`
- `getItemTemplateById(...)`
- mapping/normalization helpers for item metadata

Current tables:

- `items`
- `item_types`
- `item_rarities`
- `members` for creator/updater resolving in some writes
- usage checks against `member_items`, `item_general_store`, `craft_recipes`, `craft_recipe_ingredients`, `item_service_actions`

Current presentation/localization fields:

- `name`
- `description`
- `name_ru`
- `name_en`
- `name_et`
- `description_ru`
- `description_en`
- `description_et`
- `emoji`
- `image_url`
- rarity color through `item_rarities.color_hex`

Current missing future fields:

- `slug`
- `icon_url`
- `primary_color_hex`
- `usable`
- `consumable`
- `stackable`
- `max_stack`
- `max_tier`

Target direction:

- `ItemCatalogReadService` now owns the current read-only item template/type/rarity projections behind preserved `ItemService` compatibility methods.
- Later `ItemCatalogService` for admin writes.
- Do not add future case/key/potion/bundle behavior here by hardcoded item name or id.

### 4.3 Rarities and item types

Current methods:

- `createRarity(...)`
- `listRarities(...)`
- `updateRarity(...)`
- `deleteRarity(...)`
- `ensureItemType(...)`
- `searchRarities(...)`
- `searchItemTypes(...)`

Current behavior:

- Rarity CRUD is partially admin-managed.
- Item types are implicitly created by template create/update.
- Type autocomplete returns type name as value.

Target direction:

- Catalog boundary now owns the read-only rarity and type lookups through `ItemCatalogReadService`.
- Later decide whether item type creation should remain implicit or become admin-managed explicit configuration.

### 4.4 Inventory reads

Current methods:

- `getInventory(...)`
- `getInventoryItemById(...)`
- `mapInventoryRow(...)`
- `resolveMemberDisplayName(...)`
- `searchUserInventory(...)`

Current behavior:

- Reads instance rows from `member_items` joined with owner/original owner `members`, template `items`, `item_types`, and `item_rarities`.
- Exposes display-name/avatar data as part of API/frontend contract.
- Includes `tier` in response.
- Does not expose serial number because schema has none.

Target direction:

- `ItemInventoryReadService` now owns the current read-only inventory projections behind preserved `ItemService` compatibility methods.
- Keep response shape stable as later inventory mutation slices are separated.

### 4.5 Inventory grants / mutations

Current methods:

- `giveItemToMember(...)`
- `craftForMember(...)`
- `buyFromBotShop(...)`
- `buyPublicListing(...)`
- `sellInventoryItemToBot(...)`
- service-item consumption in `StreamerService`, not `ItemService`

Current behavior:

- Direct inserts/deletes/updates of `member_items` are spread across item, craft, shop, market, and streamer service flows.
- Inserts use `tier = 1`.
- `original_owner_member_id` is set to the receiving/buying/crafting member for grants and produced items; market transfer preserves existing original owner.

Target direction:

- Future `InventoryService` / `InventoryRepository` owns grants, consumes, transfers, serial numbers, and audit.
- Do not start here before a dedicated write-surface design.

### 4.6 Public market

Current methods:

- `createPublicListing(...)`
- `cancelPublicListing(...)`
- `updatePublicListingPrice(...)`
- `listPublicMarket(...)`
- `listUserPublicMarket(...)`
- `buyPublicListing(...)`
- `createSellerMarketSaleNotification(...)`
- `searchPublicListings(...)`
- `searchUserPublicListings(...)`

Current behavior:

- Listing creation inserts `item_public_market` without explicit transaction after checking inventory ownership/tradeable through `getInventoryItemById(...)`.
- Cancel/update use explicit transactions and `FOR UPDATE`.
- Purchase uses explicit transaction and mutates buyer/seller balances and inventory ownership.
- Purchase sends seller notification after commit.

Target direction:

- `PublicMarketReadService` now owns the read-only public market listing/search projections behind preserved `ItemService` compatibility methods.
- `MarketReadModel` for listing reads/search.
- `MarketService` as use-case owner for listing creation/update/cancel/purchase.
- `EconomyService` for balance transfer.
- `InventoryService` for item transfer.

Risk:

- Purchase is high-risk because it combines money, inventory ownership transfer, listing deletion, and notification.

### 4.7 Bot shop buy/sell

Current methods:

- `addOrUpdateBotShopListing(...)`
- `deleteBotShopListing(...)`
- `listBotShop(...)`
- `buyFromBotShop(...)`
- `sellInventoryItemToBot(...)`
- `searchBotShopListings(...)`

Current behavior:

- Admin listing upsert uses `DataBaseHandler` helper and `item_general_store` unique `item_id` behavior.
- Buy flow debits `members.balance` and inserts `member_items` inside a transaction.
- Sell-to-bot flow deletes any market listing, deletes the inventory item, and credits `members.balance` inside a transaction.

Target direction:

- `BotShopReadService` now owns the read-only bot shop listing/search projections behind preserved `ItemService` compatibility methods.
- `BotShopReadModel` for listing reads.
- `BotShopService` for buy/sell orchestration.
- `EconomyService` for debit/credit.
- `InventoryService` for grants/deletes.

Risk:

- Buy/sell are high-risk because money and inventory mutation are coupled.

### 4.8 Craft recipes and craft execution

Current methods:

- `createCraftRecipe(...)`
- `updateCraftRecipe(...)`
- `deleteCraftRecipe(...)`
- `listCraftRecipes(...)`
- `getCraftRecipeById(...)`
- `craftForMember(...)`
- `mapCraftRecipe(...)`
- `normalizeCraftIngredients(...)`

Current behavior:

- Recipe admin writes are transactional for recipe + ingredient rows.
- Craft execution is transactional and consumes owned inventory items.
- Consumed inventory items are first removed from `item_public_market`, then deleted from `member_items`.
- Produced inventory items are inserted with `tier = 1`.

Target direction:

- `CraftRecipeReadService` now owns the read-only craft recipe projections behind preserved `ItemService` compatibility methods.
- `CraftReadModel` for recipe reads.
- `CraftRecipeService` for recipe config writes.
- `CraftExecutionService` for craft use case.
- `InventoryService` for consume/grant.

Risk:

- Craft execution is high-risk because it consumes and grants inventory transactionally.

### 4.9 Search/autocomplete helpers

Current methods:

- `searchRarities(...)`
- `searchItemTypes(...)`
- `searchItemTemplates(...)`
- `searchUserInventory(...)`
- `searchPublicListings(...)`
- `searchUserPublicListings(...)`
- `searchBotShopListings(...)`
- `searchCraftRecipes(...)`

Current behavior:

- Most are read-only direct `pool.query` helpers.
- `searchUserPublicListings(...)` calls full `listUserPublicMarket(...)` and filters in memory.
- Response shape is Discord/API autocomplete-style `{ name, value }`.

Target direction:

- The first safe catalog read/search slice is complete: rarity, type, and item template searches now route through `ItemCatalogReadService`.
- The safe inventory read slice is now complete: `searchUserInventory(...)`, `getInventory(...)`, and `getInventoryItemById(...)` route through `ItemInventoryReadService`.
- The safe bot shop read slice is now complete: `searchBotShopListings(...)` and `listBotShop(...)` route through `BotShopReadService`.
- The safe craft recipe read slice is now complete: `searchCraftRecipes(...)`, `listCraftRecipes(...)`, and `getCraftRecipeById(...)` route through `CraftRecipeReadService`.
- The safe public market read slice is now complete: `searchPublicListings(...)`, `searchUserPublicListings(...)`, `listPublicMarket(...)`, and `listUserPublicMarket(...)` route through `PublicMarketReadService`.

### 4.10 Service/OBS-related item surfaces

Current `ItemService` involvement:

- `deleteItemTemplate(...)` blocks delete if `item_service_actions` references the template.
- `getItemTemplateById(...)` is used by `StreamerService.upsertItemServiceAction(...)` to validate service item templates.
- `getInventoryItemById(...)` is used by `StreamerService.prepareServiceItemExecution(...)` to validate ownership/type before OBS action use.

Current `StreamerService` behavior:

- Owns `item_service_actions` upsert/read.
- Validates `item.data.itemType === "service"` before binding OBS action.
- Uses `itemService.getInventoryItemById(...)` for service item use.
- Executes OBS relay side effects before optional consumption.
- If `consume_on_use`, deletes public listing and inventory item in a transaction after OBS side effect.

Target direction:

- Do not move OBS/service item behavior in the first item slice.
- Future `ItemUseService` or OBS/service-use use case must handle validation, side effects, durable state, inventory consumption, and audit explicitly.

### 4.11 Presentation metadata and localization

Current fields exposed across item template, inventory, market, bot shop, and craft views:

- `name`, `description`
- `nameRu`, `nameEn`, `nameEt`
- `descriptionRu`, `descriptionEn`, `descriptionEt`
- `emoji`
- `imageUrl`
- `rarityName`, `rarityColorHex`
- `itemType`

Current missing future metadata:

- `iconUrl`
- `primaryColorHex`
- `secondaryColorHex`
- item `slug`

Target direction:

- Catalog read boundary should preserve all current field names and null behavior.
- Future metadata should be additive and designed separately.

### 4.12 Tier/current upgrade-related behavior

Current behavior:

- `member_items.tier` exists.
- New inventory rows from `giveItemToMember(...)`, `craftForMember(...)`, and `buyFromBotShop(...)` use `tier = 1`.
- Existing inventory and market reads expose `tier`.
- There is no upgrade attempt flow.
- There is no max tier, upgrade rule, cost/chance, failure behavior, or upgrade audit/history.

Target direction:

- Do not implement upgrades as one vague column or branch in `ItemService`.
- Future `ItemUpgradeService` / `ItemUpgradeRuleRepository` needs a separate design.

### 4.13 Economy-coupled item flows

Current methods with direct balance mutation:

- `buyPublicListing(...)`
- `buyFromBotShop(...)`
- `sellInventoryItemToBot(...)`

Current behavior:

- Direct `UPDATE members SET balance = balance - ?` in public market and bot shop purchases.
- Direct `UPDATE members SET balance = balance + ?` in public market seller credit and sell-to-bot.
- Transactions exist, but balance SQL is in `ItemService`, not economy owner.
- No general economy ledger/audit exists.

Target direction:

- Market/shop/sell-to-bot money movement must route through `EconomyService` or future economy persistence owner.
- Do not combine economy extraction with catalog/read extraction.

## 5. Risk Map

### 5.1 Safe / medium candidates

1. **Item catalog/template read boundary**
   - Methods: `listItemTemplates(...)`, `getItemTemplateById(...)`, `mapItemTemplateRow(...)`.
   - Reads `items`, `item_types`, `item_rarities` only.
   - No transactions, no balance mutation, no inventory mutation.
   - Preserves important localization/presentation response shape.
   - Best first medium slice.

2. **Rarity/type read/search boundary**
   - Methods: `listRarities(...)`, `searchRarities(...)`, `searchItemTypes(...)`, optionally `searchItemTemplates(...)`.
   - Read-only and low-risk.
   - Useful with item catalog extraction.

3. **Search/autocomplete extraction for catalog only**
   - Methods: `searchItemTemplates(...)`, `searchRarities(...)`, `searchItemTypes(...)`.
   - Good if bundled with catalog read model.
   - Avoid bundling market/shop/craft/inventory search in the first slice unless scope remains strictly read-only and response-compatible.

4. **Inventory read model**
   - Methods: `getInventory(...)`, `getInventoryItemById(...)`, `mapInventoryRow(...)`, `resolveMemberDisplayName(...)`, `searchUserInventory(...)`.
   - Read-only, but joins `members` identity fields and current website/bot response shapes are sensitive.
   - Good second read slice after catalog extraction.

### 5.2 High-risk candidates

1. **`buyPublicListing(...)`**
   - Buyer balance debit, seller balance credit, inventory ownership transfer, listing deletion, notification.
   - Needs market/economy/inventory boundary design.

2. **`buyFromBotShop(...)`**
   - Buyer balance debit plus inventory grants in one transaction.
   - Price type and amount multiplication need economy review.

3. **`sellInventoryItemToBot(...)`**
   - Deletes inventory and listing, then credits balance.
   - Destructive and economy-coupled.

4. **`craftForMember(...)`**
   - Consumes inventory, deletes market listings for consumed items, grants produced items.
   - Needs careful transaction and audit design before extraction.

5. **Inventory transfer/consume in general**
   - Current mutation paths are spread across market, craft, bot shop, admin grants, and streamer service item consumption.
   - Needs `InventoryService` design before moving writes.

6. **OBS/service-item actions**
   - `StreamerService` executes OBS side effects and may consume inventory after side effects.
   - High-risk because external side effects, inventory consumption, permissions, and agent state are coupled.

7. **Any money-coupled item transaction**
   - Direct balance mutations still exist in `ItemService`.
   - Must coordinate with `ECONOMY_MUTATION_INVENTORY.md` and `EconomyService` direction.

### 5.3 Blocked candidates

Block as first implementation unless a new, narrower inventory/design proves safety:

- broad `ItemService` rewrite;
- full item platform implementation;
- cases/keys/potions/bundles;
- upgrade system;
- serial numbering migration;
- schema changes;
- generic repository/helper creation;
- market/shop/craft/OBS/economy combined patch;
- hardcoded item behavior by item name or template id;
- moving all use-effect behavior into current `ItemService`.

## 6. Recommended Next Medium Slice

### 6.1 Goal

Extract a read-only item catalog/search boundary from `ItemService` while preserving all current callers and response shapes.

Proposed boundary:

```text
ItemCatalogReadModel
  - listItemTemplates()
  - getItemTemplateById(itemTemplateId)
  - listRarities()
  - searchItemTemplates(query)
  - searchRarities(query)
  - searchItemTypes(query)
```

`ItemService` remains as a compatibility facade for now:

```text
ItemService.listItemTemplates(...)
  -> ItemCatalogReadModel.listItemTemplates(...)

ItemService.getItemTemplateById(...)
  -> ItemCatalogReadModel.getItemTemplateById(...)
```

Same pattern for the catalog search methods.

### 6.2 Allowed files

Allowed runtime files for the future implementation slice:

- `src/core/ItemService.ts`
- new `src/core/ItemCatalogReadModel.ts` or similarly narrow name

Optional only if the implementation requires type export cleanup:

- `src/types/database.types.ts` only for type-only compatibility, not schema behavior

Docs after implementation:

- `docs/refactor/ITEM_SERVICE_INVENTORY.md` may be updated with completed-slice notes.

### 6.3 Do-not-touch list for the next slice

Do not touch:

- `sql/tables.sql`
- `sql/migrations/**`
- `src/core/EconomyService.ts`
- `src/core/ShopObsService.ts`
- `src/core/StreamerService.ts`
- `src/core/StreamerServicesService.ts`
- `src/core/MemberService.ts`
- `src/core/NotificationService.ts`
- `src/api/routes/**`
- `src/commands/**`
- `balkon-website/**`
- `balkon-obs-agent/**`
- market purchase/sale logic
- bot shop buy/sell logic
- craft execution logic
- inventory grant/consume/transfer logic
- service/OBS item use logic

### 6.4 Behavior to preserve

Preserve exactly:

- `DBResponse` success/fail shape.
- `DataBaseHandler.errorHandling(...)` behavior for caught errors, unless a separate shared error-response slice is approved.
- `listItemTemplates(...)` return shape currently used by `/admin/items`:
  - raw row fields such as `name_ru`, `description_ru`, `item_type_name`, `rarity_color_hex`.
- `getItemTemplateById(...)` return shape:
  - `ItemTemplateView | null`.
- `searchItemTemplates(...)` autocomplete shape:
  - `name: "#<id> <name>"`
  - `value: Number(id)`
- `searchRarities(...)` autocomplete shape:
  - `name: row.name`
  - `value: row.name`
- `searchItemTypes(...)` autocomplete shape:
  - `name: row.name`
  - `value: row.name`
- `listRarities(...)` ordering:
  - `ORDER BY id DESC`
- `listItemTemplates(...)` ordering:
  - `ORDER BY i.id DESC`
- `searchItemTemplates(...)` ordering:
  - `ORDER BY id DESC LIMIT 25`
- `searchRarities(...)` / `searchItemTypes(...)` ordering:
  - `ORDER BY name ASC LIMIT 25`
- Null handling for localization, image URL, emoji, and rarity color.

### 6.5 Proposed boundary shape

Allowed shape:

```text
src/core/ItemCatalogReadModel.ts
  - owns read-only SQL for item template, rarity, type, and catalog autocomplete projections
  - may import pool
  - may import type-only DBResponse/result view types from ItemService during transition if needed
  - may use local private mappers
  - may call DataBaseHandler.errorHandling only as a transitional response-shape compatibility helper
```

Forbidden shape:

```text
BaseRepository
GenericRepository
SqlHelper
DataBaseHandler2
CatalogService that also buys/sells/crafts/grants/uses items
```

### 6.6 Validation commands/searches

For the implementation slice, run:

```powershell
npm run build
```

Targeted searches after implementation:

```text
class ItemService
ItemCatalogReadModel
listItemTemplates
getItemTemplateById
listRarities
searchItemTemplates
searchRarities
searchItemTypes
pool.query
DataBaseHandler.getInstance()
member_items
item_public_market
item_general_store
craft_recipes
UPDATE members SET balance
```

Expected search results after implementation:

- `ItemCatalogReadModel` contains read-only SQL for `items`, `item_types`, and `item_rarities`.
- `ItemService` no longer contains the catalog read SQL for `listItemTemplates`, `getItemTemplateById`, `listRarities`, `searchItemTemplates`, `searchRarities`, `searchItemTypes`.
- `ItemService` may still contain high-risk SQL for market/shop/craft/inventory until later slices.
- No route or command gains SQL.
- No schema file changes.
- Existing direct balance mutations in `ItemService` remain unchanged and are not touched by this slice.

### 6.7 Expected diff

Expected future implementation diff:

- Add one new narrow read model file.
- Move/copy read-only SQL and mappers for catalog reads/searches into that file.
- Change `ItemService` methods to delegate to the read model.
- Keep public method names and return types stable.
- No route/command/frontend changes.
- No migration/schema changes.

Approximate moved surface:

- `listRarities(...)`
- `searchRarities(...)`
- `searchItemTypes(...)`
- `searchItemTemplates(...)`
- `listItemTemplates(...)`
- `getItemTemplateById(...)`
- `mapItemTemplateRow(...)`

Do not move:

- `createItemTemplate(...)`
- `updateItemTemplate(...)`
- `deleteItemTemplate(...)`
- `ensureItemType(...)`
- any market/shop/craft/inventory mutation

### 6.8 Rejection criteria

Reject the next implementation if it:

- changes API, bot, or frontend response shapes;
- changes item template field names or nullability semantics;
- changes sort order or autocomplete `value` types;
- adds schema/migration changes;
- creates generic repositories/helpers;
- touches market/shop/craft/OBS/economy flows;
- moves writes together with reads;
- hardcodes item names or template ids;
- implements cases, keys, potions, bundles, serial numbers, or upgrades;
- adds SQL to routes or commands;
- changes `DBResponse` globally;
- expands `ItemService` with new responsibilities instead of shrinking it.

### 6.9 Why this reduces long-term item-system debt

This slice creates a stable read boundary for current item template data before feature work begins.

It helps future item-platform work because:

- item templates become a clearer concept separate from inventory instances;
- presentation metadata and localization have a known owner;
- rarity/type reads are no longer buried in a god service;
- admin UI and future API-managed configuration can build on a catalog boundary;
- later schema additions like `slug`, `icon_url`, or `primary_color_hex` have an obvious read model to update;
- high-risk item behaviors remain untouched until their transaction and audit design is ready.

## 7. Validation/Search Commands Used For This Inventory

Search/read operations used for this inventory included:

```text
class ItemService
ensureMemberByDiscordId
pool.query
DataBaseHandler.getInstance()
getFromTable
addRecords
updateTable
member_items
items
item_rarities
item_types
item_public_market
item_general_store
craft_recipes
craft_recipe_ingredients
item_service_actions
buyPublicListing
buyFromBotShop
sellInventoryItemToBot
craftForMember
giveItemToMember
createItemTemplate
updateItemTemplate
deleteItemTemplate
tier
bot_sell_price
NotificationService
```

Files inspected:

- `docs/ARCHITECTURE_PLAN.md`
- `docs/refactor/STABILIZATION_PLAN.md`
- `docs/refactor/DB_ACCESS_BOUNDARY.md`
- `docs/refactor/ECONOMY_MUTATION_INVENTORY.md`
- `docs/refactor/ITEM_SYSTEM_DESIGN.md`
- `docs/refactor/ITEM_SYSTEM_SENIOR_NOTES.md`
- `src/core/ItemService.ts`
- `src/api/routes/dashboardRoutes.ts`
- `src/api/routes/dashboard/marketRoutes.ts`
- `src/api/routes/dashboard/inventoryRoutes.ts`
- `src/api/routes/dashboard/craftExecutionRoutes.ts`
- `src/core/StreamerService.ts`
- `src/core/StreamerServicesService.ts`
- `src/core/NotificationService.ts`
- `src/core/MemberService.ts`
- `src/types/database.types.ts`
- `sql/tables.sql`

## 8. Files Changed By This Inventory Task

Only:

- `docs/refactor/ITEM_SERVICE_INVENTORY.md`

No runtime code was changed.
No schema or migration was changed.
No repositories/services were created.
No cases, keys, potions, bundles, serial numbers, upgrades, or item admin UI were implemented.
