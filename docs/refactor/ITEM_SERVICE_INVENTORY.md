# ItemService Write / Mutation Inventory

This document records the current post-refactor `ItemService` write and mutation surface.

It is a factual inventory and planning aid. It does not change runtime code, schema, migrations, routes, frontend, bot commands, SQL, response shapes, or behavior by itself.

Read together with:

- `docs/ARCHITECTURE_PLAN.md`
- `docs/refactor/STABILIZATION_PLAN.md`
- `docs/refactor/ITEM_SYSTEM_DESIGN.md`
- `docs/refactor/DB_RESPONSE_USAGE_INVENTORY.md`

## 1. Verdict

`ItemService` is now a transitional write/use-case boundary plus compatibility facade.

The completed and accepted decomposition moved read-only item surfaces out of `ItemService`:

- `ItemCatalogReadService`
- `ItemInventoryReadService`
- `BotShopReadService`
- `CraftRecipeReadService`
- `PublicMarketReadService`
- `ItemViewTypes`
- `DbResult`

The five extracted read services now import `DBResponse` and `errorHandling(...)` from `DbResult`. They no longer depend on `DataBaseHandler` for result/error helpers.

Remaining `ItemService` debt is mostly write/mutation oriented:

- member resolving compatibility bridge;
- rarity/type/template admin writes;
- inventory grants;
- bot shop listing admin writes and purchases;
- public market listing creation/cancel/update and purchase;
- craft recipe admin writes;
- craft execution;
- normalization helpers and mutation row interfaces.

Recommended next medium implementation slice:

```text
Extract ItemCatalogWriteService for rarity/type/template admin writes only.
```

This is safer than market purchase, bot-shop purchase, sell-to-bot, and craft execution because it avoids direct money transfer, inventory transfer/consume/grant combinations, and notification side effects. It makes meaningful progress by removing catalog admin write responsibility from `ItemService` while preserving all current response shapes and SQL behavior.

## 2. Current Post-Refactor ItemService Summary

Current source:

- `src/core/ItemService.ts`
- `ItemService` begins at line 141.
- Public read/search methods remain as compatibility delegates to extracted read services.
- Shared read/view DTOs are re-exported from `ItemViewTypes`.
- `DbResult` exists, but `ItemService` still imports `DBResponse` and `DBResponseSuccess` from `DataBaseHandler` because it still uses `DataBaseHandler` runtime persistence helpers and result narrowing helpers.

Current `ItemService` import facts:

- Runtime `DataBaseHandler` is still used for `getFromTable`, `addRecords`, `updateTable`, `isSuccess`, `isFail`, and `errorHandling`.
- `NotificationService` is used only for best-effort seller notification after `buyPublicListing(...)`.
- `memberService.ensureMemberByDiscordId(...)` is used through `ItemService.ensureMemberByDiscordId(...)`, which reloads a full `MembersDB` row through `DataBaseHandler.getFromTable(...)`.

Current schema facts relevant to remaining mutations:

- `items` stores template metadata, localization fields, trade/sell flags, `image_url`, `bot_sell_price`, and creator member id.
- `item_types` and `item_rarities` store catalog metadata.
- `member_items` stores inventory instances and has no per-template serial number.
- `item_public_market.member_item_id` is unique and cascades when inventory item is deleted.
- `item_general_store.item_id` is unique and cascades when item template is deleted.
- `craft_recipes` and `craft_recipe_ingredients` own craft configuration.
- `item_service_actions` exists and is owned in practice by `StreamerService`; `ItemService.deleteItemTemplate(...)` checks it only as a usage blocker.
- `item_public_market.price` and `item_general_store.price` are `FLOAT`.
- `items.bot_sell_price` is `DECIMAL(10, 2)`.

Explicit non-goals:

- no cases;
- no keys;
- no potions;
- no bundles;
- no upgrades;
- no serial numbering;
- no schema migrations;
- no item admin UI;
- no generic repository/helper abstraction;
- no broad `ItemService` rewrite.

## 3. Exact Inventory Table

| Group | Method/helper | Lines | Responsibility | SQL/tables touched | DataBaseHandler usage | pool/query usage | Transaction behavior | Rollback behavior | Member resolving | Balance mutation | Inventory mutation | Market/shop/craft dependency | Notification/side effects | Current callers | Response shape | Target owner recommendation | Extraction risk | Safe next medium slice? | Blocked? |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Compatibility / member bridge | `ensureMemberByDiscordId` | 152-169 | Ensure/load member by Discord id and return full legacy `MembersDB` row | `members` | `getFromTable("members", { id })`, `isFail` | None directly | None | None | Calls `memberService.ensureMemberByDiscordId(..., { createdSource: "unknown" })`, then reloads full row | Reads balance as part of full `MembersDB`; no direct balance write | None | Used by item, job, overview, streamer application/access compatibility flows | Throws generic errors on ensure/load failure | `JobService`, `OverviewService`, `StreamerApplicationService`, `StreamerAccessService`, `StreamerServicesService`, item mutation methods | `DBResponseSuccess<MembersDB>` | `MemberService` plus narrow member read/result shape | Medium | No; do separately after caller inventory | No |
| Rarity/type/template admin writes | `createRarity` | 171-195 | Create rarity with normalized lowercase name and optional hex color | `item_rarities` | `getFromTable`, `addRecords`, `isSuccess`, `errorHandling` | None | None | None | None | None | None | Catalog metadata only | None | `/raritycreate`, menu admin | `DBResponse<{ insertId }>` | `ItemCatalogWriteService` | Low-medium | Yes, as part of catalog admin write boundary | No |
| Rarity/type/template admin writes | `updateRarity` | 201-241 | Update rarity name/color with existence and duplicate checks | `item_rarities` | `getFromTable`, `isFail`, `errorHandling` | Duplicate `SELECT`; `UPDATE item_rarities` | None | None | None | None | None | Catalog metadata only | None | menu admin | `DBResponse<{ rarityId }>` | `ItemCatalogWriteService` | Low-medium | Yes | No |
| Rarity/type/template admin writes | `deleteRarity` | 244-281 | Delete rarity if not used by item templates | `item_rarities`, `items` | `errorHandling` only | Usage `SELECT COUNT(*)`; `DELETE item_rarities` | None | None | None | None | None | Blocks delete when templates use rarity | Destructive metadata delete | menu admin | `DBResponse<{ rarityId }>` | `ItemCatalogWriteService` | Medium | Yes, with strict behavior preservation | No |
| Rarity/type/template admin writes | `ensureItemType` | 316-342 | Find or create item type by normalized lowercase name | `item_types` | `getFromTable`, `addRecords`, `isSuccess`, `isFail` | None | None | None | None | None | None | Catalog metadata side effect; called by template create/update | Throws on insert failure | Internal to `createItemTemplate`, `updateItemTemplate` | `DBResponseSuccess<ItemTypesDB>` or throws | Private helper inside `ItemCatalogWriteService` | Medium because create/update template depends on implicit type creation | Yes, only with template writes | No |
| Rarity/type/template admin writes | `createItemTemplate` | 344-415 | Create item template with localization, emoji, image URL, trade flag, sellability, bot sell price, creator | `items`, `item_rarities`, `item_types`, `members` | `getFromTable`, `addRecords`, `isFail`, `errorHandling`; calls `ensureItemType` and `ensureMemberByDiscordId` | None directly | None | None | Calls compatibility member bridge for creator | None | None | Catalog template creation; implicit type create if missing | None | dashboard admin items, `/itemcreate`, menu admin | `DBResponse<{ insertId }>` | `ItemCatalogWriteService` with member id resolved through current bridge initially | Medium | Yes | No |
| Rarity/type/template admin writes | `updateItemTemplate` | 417-502 | Update template metadata/localization/prices | `items`, `item_rarities`, `item_types` | `getFromTable`, `isFail`, `errorHandling`; calls `ensureItemType` | `UPDATE items` | None | None | None | None | None | Catalog template update; implicit type create if missing | None | dashboard admin items, menu admin | `DBResponse<{ itemTemplateId }>` | `ItemCatalogWriteService` | Medium | Yes | No |
| Rarity/type/template admin writes | `deleteItemTemplate` | 505-555 | Delete template only if no inventory/shop/craft/service-action usage exists | `items`, `member_items`, `item_general_store`, `craft_recipes`, `craft_recipe_ingredients`, `item_service_actions` | `errorHandling` only | Usage-count subselects; `DELETE items` | None | None | None | None | Deletes template only after all usage checks pass | Cross-domain usage checks block deletion | Destructive metadata delete | dashboard admin items, menu admin | `DBResponse<{ itemTemplateId }>` | `ItemCatalogWriteService`; usage checks remain local initially | Medium-high | Yes, if copied exactly and no owner split yet | No |
| Inventory direct grants | `giveItemToMember` | 557-606 | Admin/bot grant N item instances to a member | `items`, `members`, `member_items` | `getFromTable`, `addRecords`, `isFail`, `errorHandling` | None | None | No transaction across multiple inserted records beyond generic insert call | Calls compatibility member bridge for target | None | Inserts N `member_items`, `tier=1`, `original_owner_member_id=target` | Depends on item template existence | None | `/itemgive`; possible admin/menu usage | `DBResponse<{ inserted }>` | `InventoryGrantService` or `InventoryService` | Medium | Not first if choosing catalog write boundary; possible later medium slice | No |
| Craft recipe admin writes | `createCraftRecipe` | 608-701 | Admin create recipe and ingredients | `craft_recipes`, `craft_recipe_ingredients`, `items`, `members` | Pre-transaction `getFromTable` for result/ingredient templates; `isFail`; `errorHandling` | `connection.query` for duplicate check, recipe insert, ingredient bulk insert | Explicit transaction begins after validation and creator/template checks | Manual rollback on duplicate and catch; release in finally | Calls compatibility member bridge for creator before transaction | None | None | Craft config write; validates item templates | None | `/craftrecipecreate`, dashboard admin craft recipes | `DBResponse<{ recipeId }>` | `CraftRecipeWriteService` | Medium | Good candidate, but less safe than catalog admin because transaction and recipe ingredients are involved | No |
| Craft recipe admin writes | `updateCraftRecipe` | 703-826 | Admin update recipe and replace ingredients | `craft_recipes`, `craft_recipe_ingredients`, `items` | `errorHandling` only | `SELECT ... FOR UPDATE`, duplicate `SELECT`, item existence reads, `UPDATE`, delete/insert ingredients | Explicit transaction | Manual rollback on every validation failure and catch; release in finally | None | None | Deletes/reinserts recipe ingredients | Craft config replacement | None | dashboard admin craft recipes | `DBResponse<{ recipeId }>` | `CraftRecipeWriteService` | Medium | Good candidate after catalog write extraction | No |
| Craft recipe admin writes | `deleteCraftRecipe` | 828-874 | Admin delete recipe and ingredients | `craft_recipes`, `craft_recipe_ingredients` | `errorHandling` only | `SELECT ... FOR UPDATE`; delete ingredients; delete recipe | Explicit transaction | Manual rollback on not found and catch; release in finally | None | None | Deletes recipe config only | Craft config delete | Destructive config delete | dashboard admin craft recipes | `DBResponse<{ recipeId }>` | `CraftRecipeWriteService` | Medium | Good candidate after catalog write extraction | No |
| Craft execution | `craftForMember` | 884-1027 | Execute craft: lock recipe, validate ingredients, consume inventory, remove public listings for consumed items, grant results | `craft_recipes`, `craft_recipe_ingredients`, `items`, `item_rarities`, `member_items`, `item_public_market`, `members` | `errorHandling` only; member resolve uses bridge | Many `connection.query` calls, dynamic `IN` placeholders, bulk insert | Explicit transaction | Manual rollback on recipe missing, no ingredients, insufficient inventory, catch; release in finally | Calls compatibility member bridge inside transaction, but bridge DB read is outside same connection | None | Deletes ingredient `member_items`; deletes related `item_public_market`; inserts result `member_items` | Craft recipe + inventory + market cleanup combined | No notification/audit | `/craft`, menu craft, dashboard craft execution route | `DBResponse<{ crafted; resultItemTemplateId; resultAmount }>` | `CraftExecutionService` plus `InventoryService` | High | No | Yes for now |
| Bot shop admin writes | `addOrUpdateBotShopListing` | 1037-1091 | Admin upsert bot shop listing by item template | `item_general_store`, `items` | `getFromTable`, `updateTable`, `addRecords`, `isSuccess`, `isFail`, `errorHandling` | None directly | None | None | None | None | None | Bot shop config upsert by `item_id` | None | dashboard admin botshop, `/botshop update` | `DBResponse<{ listingId }>` | `BotShopAdminService` or `BotShopWriteService` | Medium | Possible later, but not recommended first because price/money config overlaps purchase flows | No |
| Bot shop admin writes | `deleteBotShopListing` | 1093-1118 | Admin delete bot shop listing | `item_general_store` | `errorHandling` only | `DELETE item_general_store` | None | None | None | None | None | Bot shop config delete | Destructive config delete | dashboard admin botshop | `DBResponse<{ listingId }>` | `BotShopAdminService` or `BotShopWriteService` | Low-medium | Possible later | No |
| Public market mutations | `createPublicListing` | 1124-1192 | Create public market listing for owned inventory item | `member_items` indirectly through read service, `item_public_market`, `items` | `getFromTable`, `addRecords`, `isSuccess`, `isFail`, `errorHandling`; checks read-service `DBResponse` via `isFail` | Indirect read through `getInventoryItemById(...)` | None | None | No ensure; owner checked by Discord id from inventory read projection | None | Inserts `item_public_market`; does not mutate `member_items` | Depends on inventory read and item `tradeable` flag | None | `/market sell`, menu market, dashboard inventory route | `DBResponse<{ listingId }>` | `MarketListingService` | Medium | Possible medium slice after catalog writes; simpler than purchase | No |
| Public market mutations | `cancelPublicListing` | 1194-1283 | Cancel own public listing | `item_public_market`, `member_items`, `members`, `items`, `item_types`, `item_rarities` | `errorHandling` only | `SELECT ... FOR UPDATE`; `DELETE item_public_market` | Explicit transaction | Manual rollback on not found/wrong owner/catch; release in finally | Seller verified by joined `members.ds_member_id`; no ensure | None | Deletes listing only; inventory remains owned by seller | Market listing only | None | `/market cancel`, menu market, dashboard market route | `DBResponse<{ listingId; inventoryItemId }>` | `MarketListingService` | Medium | Possible medium slice after catalog writes | No |
| Public market mutations | `updatePublicListingPrice` | 1285-1369 | Update own listing price | `item_public_market`, `member_items`, `members`, `items`, `item_types`, `item_rarities` | `errorHandling` only | `SELECT ... FOR UPDATE`; `UPDATE item_public_market` | Explicit transaction | Manual rollback on not found/wrong owner/catch; release in finally | Seller verified by joined `members.ds_member_id`; no ensure | None | No inventory mutation | Market listing price config | None | `/market update`, menu market, dashboard market route | `DBResponse<{ listingId; price }>` | `MarketListingService` | Medium | Possible medium slice after catalog writes | No |
| Public market mutations | `buyPublicListing` | 1379-1505 | Buy listing: debit buyer, credit seller, transfer inventory, delete listing | `item_public_market`, `member_items`, `members.balance`, `members`, `items`, `item_types`, `item_rarities` | `errorHandling` only; member resolve uses bridge | `SELECT ... FOR UPDATE`, `UPDATE members`, `UPDATE member_items`, `DELETE item_public_market` | Explicit transaction | Manual rollback on not found/self-buy/insufficient balance/catch; release in finally | Calls compatibility member bridge for buyer; seller loaded/locked separately | Direct buyer debit and seller credit | Updates inventory ownership; deletes market listing | Market + inventory + economy combined | Calls seller notification after commit | `/market buy`, menu market, dashboard market route | `DBResponse<{ inventoryItemId }>`; callers may add listing/balance post-read | `MarketPurchaseService` + `EconomyService` + `InventoryService` | High | No | Yes |
| Public market mutations | `createSellerMarketSaleNotification` | 1507-1536 | Best-effort seller notification after market sale | `notifications` via `NotificationService` | None | None locally | Runs after market purchase commit | Catches/logs and swallows notification errors | Uses ids passed from purchase | None | None | Depends on market sale context | Side effect: notification, failure swallowed | Only `buyPublicListing` | `Promise<void>` | Keep with purchase use case until notification policy decided | Medium | No standalone slice | No |
| Bot shop mutations | `buyFromBotShop` | 1538-1631 | Buy fixed-price bot shop item(s): debit buyer and insert inventory items | `item_general_store`, `items`, `item_types`, `item_rarities`, `members.balance`, `member_items` | `errorHandling` only; member resolve uses bridge | `SELECT ... FOR UPDATE`, `UPDATE members`, bulk `INSERT member_items` | Explicit transaction | Manual rollback on listing missing/insufficient balance/catch; release in finally | Calls compatibility member bridge for buyer | Direct buyer debit | Inserts N `member_items`, `tier=1`, original owner=buyer | Bot shop listing + inventory + economy combined | No notification/audit | menu botshop, dashboard botshop buy route | `DBResponse<{ inserted }>` | `BotShopPurchaseService` + `EconomyService` + `InventoryService` | High | No | Yes |
| Bot shop mutations | `sellInventoryItemToBot` | 1633-1731 | Sell owned inventory item to bot: delete listing/item and credit seller | `member_items`, `item_public_market`, `items`, `members.balance`, `item_types`, `item_rarities` | `errorHandling` only | `SELECT ... FOR UPDATE`, `DELETE item_public_market`, `DELETE member_items`, `UPDATE members` | Explicit transaction | Manual rollback on missing item/wrong owner/not sellable/catch; release in finally | Seller verified by joined owner row; no ensure | Direct seller credit | Deletes inventory item and any related market listing | Inventory + market cleanup + economy combined | No notification/audit | menu inventory, dashboard inventory sell route | `DBResponse<{ price }>`; callers may add received/balance post-read | `SellToBotService` or `BotShopSellService` + `EconomyService` + `InventoryService` | High | No | Yes |
| Remaining helpers | `resolveMemberDisplayName` | 1741-1753 | Legacy display-name fallback helper still present | None | None | None | None | None | None | None | None | Not used by current read delegates; equivalent helpers live in read services | None | No active internal caller found in current `ItemService` | `string` | Remove only in cleanup slice if proven unused | Low | No | No |
| Remaining helpers | normalizers | 1755-1855 | Text, localization, color, URL, price, integer, and craft ingredient normalization | None | None | None | None | None | None | None | None | Used by current write methods | Throw on invalid input | Internal helpers | Primitive/array values | Move only with direct owning write service | Low-medium | Only with owning methods | No |
| Remaining row/type surface | row interfaces | 27-139 | Local row shapes for sell-to-bot, market mutations, botshop buy, and craft execution | None | Type only | None | None | None | None | None | Supports mutation row mapping | Used by remaining mutation methods | None | Internal types | TypeScript interfaces | Move with owning service later | Medium-high by owning flow | No | No |

## 4. Required Classification Groups

### 4.1 Compatibility / member bridge

`ensureMemberByDiscordId(...)` ensures a member through `MemberService`, reloads the full `members` row through `DataBaseHandler.getFromTable(...)`, and returns `DBResponseSuccess<MembersDB>`. It is medium-risk because non-item services still use it as compatibility glue. Do not include it in the next item write extraction except as an unchanged dependency.

### 4.2 Rarity/type/template admin writes

Methods: `createRarity`, `updateRarity`, `deleteRarity`, `ensureItemType`, `createItemTemplate`, `updateItemTemplate`, `deleteItemTemplate`.

These are the best next extraction candidate. They do not mutate balances, transfer inventory, execute craft, or send notifications. Main risks are implicit item type creation, creator member resolving, and exact delete usage checks.

### 4.3 Inventory direct grants

`giveItemToMember(...)` validates template and target member, then inserts N inventory rows. It has no money or notification behavior, but it directly creates inventory instances and currently has no explicit transaction. It is a possible later medium slice, not the safest first slice.

### 4.4 Public market mutations

Methods: `createPublicListing`, `cancelPublicListing`, `updatePublicListingPrice`, `buyPublicListing`.

`listItemForSale` was searched and is not present. Create/cancel/update are medium-risk listing flows. `buyPublicListing` is high-risk because it combines balance transfer, inventory ownership transfer, listing deletion, and post-commit notification.

### 4.5 Bot shop mutations

Methods: `addOrUpdateBotShopListing`, `deleteBotShopListing`, `buyFromBotShop`, `sellInventoryItemToBot`.

Admin listing config is medium-risk. Purchase and sell-to-bot are high-risk because they mutate `members.balance` and `member_items` in one transaction.

### 4.6 Craft recipe admin writes

Methods: `createCraftRecipe`, `updateCraftRecipe`, `deleteCraftRecipe`.

These are bounded admin config writes and a good later medium slice. They are not the first recommendation because update/delete have explicit transaction and rollback paths and replace child ingredient rows.

### 4.7 Craft execution

`craftForMember(...)` is high-risk. It locks recipe and inventory rows, consumes inventory, deletes related market listings, grants result inventory, and uses dynamic `IN` SQL inside a transaction.

### 4.8 Remaining helpers

Helpers and row interfaces should move only with their direct owning write/execution methods. Do not create a generic validation or repository helper.

## 5. Risk Map

### 5.1 Safe / medium candidates

1. **Rarity/type/template admin write boundary**
   - Candidate owner: `ItemCatalogWriteService`.
   - Best next slice.
   - Avoids balances, inventory transfer, craft execution, and notification side effects.

2. **Craft recipe admin writes**
   - Candidate owner: `CraftRecipeWriteService`.
   - Good later slice.
   - Bounded but transaction-heavy.

3. **Market listing create/cancel/update**
   - Candidate owner: `MarketListingService`.
   - Good later slice.
   - Avoids money transfer but depends on inventory ownership projection and listing locks.

4. **Inventory direct grants**
   - Candidate owner: `InventoryGrantService` or `InventoryService`.
   - Possible later slice.
   - Directly creates inventory instances.

5. **Bot shop admin listing config**
   - Candidate owner: `BotShopAdminService`.
   - Possible later slice.
   - Price config is adjacent to purchase/economy behavior.

### 5.2 High-risk candidates

High-risk surfaces:

- `buyPublicListing(...)`
- `buyFromBotShop(...)`
- `sellInventoryItemToBot(...)`
- `craftForMember(...)`
- direct `UPDATE members SET balance = balance ...` flows;
- inventory transfer or consume/grant combinations;
- flows with `NotificationService` side effects.

### 5.3 Blocked candidates

Blocked for now:

- cases, keys, potions, bundles;
- item use effects;
- upgrade system;
- serial numbering migration;
- schema changes;
- broad `ItemService` rewrite;
- generic repository/helper abstraction;
- market purchase rewrite;
- bot-shop purchase rewrite;
- sell-to-bot rewrite;
- craft execution rewrite;
- economy ledger/audit addition in the same slice;
- moving all `DataBaseHandler` usage out of `ItemService` in one pass.

## 6. Recommended Next Medium Implementation Slice

### 6.1 Verdict

Do the **ItemCatalogWriteService extraction** next.

### 6.2 Goal

Move rarity/type/template admin write ownership out of `ItemService` while keeping `ItemService` as a compatibility facade that delegates the same public methods and returns the same `DBResponse` shapes.

### 6.3 Proposed boundary/service name

```text
src/core/ItemCatalogWriteService.ts
```

Service responsibility:

- rarity create/update/delete;
- item type ensure/create as private/helper behavior;
- item template create/update/delete;
- catalog write normalizers needed by those methods only.

### 6.4 Allowed files

Allowed implementation files for that future slice:

- `src/core/ItemCatalogWriteService.ts`
- `src/core/ItemService.ts`
- optionally `docs/refactor/ITEM_SERVICE_INVENTORY.md` for docs sync after implementation

### 6.5 Do-not-touch list

Do not touch:

- `src/core/ItemCatalogReadService.ts`
- `src/core/ItemInventoryReadService.ts`
- `src/core/BotShopReadService.ts`
- `src/core/CraftRecipeReadService.ts`
- `src/core/PublicMarketReadService.ts`
- `src/core/ItemViewTypes.ts`
- `src/core/DbResult.ts`
- `src/core/DataBaseHandler.ts`
- `src/core/EconomyService.ts`
- `src/core/MemberService.ts`
- `src/core/ShopObsService.ts`
- `src/core/StreamerService.ts`
- `src/core/NotificationService.ts`
- `src/api/**`
- `src/commands/**`
- `src/events/**`
- `sql/**`
- `balkon-website/**`
- `balkon-obs-agent/**`

### 6.6 Exact behavior to preserve

Preserve exactly:

- method names, parameters, and return shapes on `ItemService`;
- all current SQL text and parameter order;
- all current error messages;
- implicit item type creation;
- lowercase normalization for rarity/type names;
- localization, color, image URL, and bot sell price validation;
- `sellable = normalizedBotSellPrice !== null`;
- `tradeable = input.tradeable`;
- creator member resolving through current bridge;
- `deleteItemTemplate(...)` usage checks across `member_items`, `item_general_store`, `craft_recipes`, `craft_recipe_ingredients`, and `item_service_actions`.

### 6.7 Expected diff

Expected implementation diff:

- Add `src/core/ItemCatalogWriteService.ts`.
- Move/copy exact implementations of catalog write methods and their directly owned helpers.
- Keep `ItemService` public methods as same-name delegates.
- Keep `ItemService.ensureMemberByDiscordId(...)` unchanged.
- Do not change SQL, routes, commands, API, response shapes, or `DataBaseHandler` globally.

### 6.8 Validation commands/searches

Run after implementation:

```powershell
npm run build
git diff -- src/core/ItemService.ts src/core/ItemCatalogWriteService.ts docs/refactor/ITEM_SERVICE_INVENTORY.md
```

Run targeted searches:

```text
createRarity
updateRarity
deleteRarity
ensureItemType
createItemTemplate
updateItemTemplate
deleteItemTemplate
DataBaseHandler.getInstance().getFromTable
DataBaseHandler.getInstance().addRecords
DataBaseHandler.getInstance().updateTable
normalizeColorHex
normalizeImageUrl
normalizeBotSellPrice
ItemCatalogWriteService
UPDATE members SET balance
member_items
item_public_market
craftForMember
buyPublicListing
buyFromBotShop
sellInventoryItemToBot
```

Expected validation results:

- Build passes.
- `ItemService` still exposes the same public methods.
- Catalog write methods delegate to `ItemCatalogWriteService`.
- Money-coupled and inventory execution methods remain in `ItemService`.
- No route/command/API imports changed.
- No SQL changed.
- No response shapes changed.

### 6.9 Rejection criteria

Reject the implementation if it:

- changes SQL or SQL parameter order;
- changes any `DBResponse` shape;
- changes any error message;
- changes item type implicit creation behavior;
- changes rarity/type normalization;
- changes item localization field behavior;
- changes `sellable`, `tradeable`, `image_url`, or `bot_sell_price` behavior;
- changes creator member resolving behavior;
- changes `deleteItemTemplate(...)` usage checks;
- touches market purchase, bot-shop purchase, sell-to-bot, craft execution, or direct grants;
- touches routes, commands, events, SQL, frontend, or OBS agent;
- introduces a generic repository/helper abstraction;
- adds schema migrations, item cases, keys, potions, bundles, upgrades, serial numbers, or admin UI.

### 6.10 Why this is safer than other mutation candidates

This slice is safer than direct grant because catalog writes do not create inventory instances.

This slice is safer than craft recipe admin writes because most catalog writes are non-transactional and do not replace child rows in a transaction.

This slice is safer than market listing create/cancel/update because it does not rely on member-owned inventory projections or listing locks.

This slice is safer than bot shop listing config because bot shop pricing is directly adjacent to purchase/economy behavior.

This slice is much safer than market purchase, bot-shop purchase, sell-to-bot, or craft execution because it avoids direct balance mutation, inventory ownership transfer, inventory consume/grant combinations, and notification side effects.

## 7. Validation / Search Commands Used For This Refresh

Required searches run:

```text
class ItemService
DataBaseHandler
pool.query
getFromTable
addRecords
updateTable
ensureMemberByDiscordId
createRarity
updateRarity
deleteRarity
ensureItemType
createItemTemplate
updateItemTemplate
deleteItemTemplate
giveItemToMember
createCraftRecipe
updateCraftRecipe
deleteCraftRecipe
craftForMember
listItemForSale
createPublicListing
cancelPublicListing
buyPublicListing
buyFromBotShop
sellInventoryItemToBot
UPDATE members SET balance
balance = balance
member_items
item_public_market
item_general_store
craft_recipes
craft_recipe_ingredients
NotificationService
beginTransaction
commit
rollback
```

Additional caller searches run:

```text
.createRarity(
.updateRarity(
.deleteRarity(
.createItemTemplate(
.updateItemTemplate(
.deleteItemTemplate(
.giveItemToMember(
.createCraftRecipe(
.updateCraftRecipe(
.deleteCraftRecipe(
.craftForMember(
.createPublicListing(
.cancelPublicListing(
.updatePublicListingPrice(
.buyPublicListing(
.buyFromBotShop(
.sellInventoryItemToBot(
.addOrUpdateBotShopListing(
.deleteBotShopListing(
.ensureMemberByDiscordId(
ItemService.getInstance()
itemService.
```

Search result note:

- `listItemForSale` is not present in current `ItemService`.

## 8. Files Changed By This Inventory Task

Only this documentation file should be changed by this task:

- `docs/refactor/ITEM_SERVICE_INVENTORY.md`

No runtime code was changed.
No service or repository was created.
No method was moved.
No SQL was changed.
No response shape was changed.
