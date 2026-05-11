# DBResponse / DataBaseHandler Error Handling Usage Inventory

This document is a strict read-only inventory of `DBResponse`, `DBResponseSuccess`, `DBResponseFail`, `DataBaseHandler.errorHandling(...)`, and related `DataBaseHandler` result-helper usage.

No runtime code was changed for this inventory.

## 1. Purpose And Scope

Goal:

```text
Decide whether a neutral result/error module is a safe next medium slice.
```

Explicit non-goals:

- Do not create `DbResult.ts` yet.
- Do not move `errorHandling(...)` yet.
- Do not edit `DataBaseHandler`.
- Do not change service logic.
- Do not change SQL.
- Do not change response shapes.
- Do not retarget routes, commands, events, or broad services in this task.

Allowed file changed by this inventory:

- `docs/refactor/DB_RESPONSE_USAGE_INVENTORY.md`

## 2. Evidence Summary

Current `DataBaseHandler` result contract lives in `src/core/DataBaseHandler.ts`:

- `DBError`
- `DBResponseSuccess<T>`
- `DBResponseFail`
- `DBResponse<T>`
- `InsertIdResponse`
- `IsExistsResponse`
- `UpdateType`
- `DataBaseHandler.isSuccess(...)`
- `DataBaseHandler.isFail(...)`
- `DataBaseHandler.errorHandling(...)`

Current `DataBaseHandler.errorHandling(...)` behavior:

```text
console.log(" Error handling...")
console.error(err)
return {
  success: false,
  error: {
    reason: "unknown",
    relatedTo: "unknown",
    code: err instanceof Error && typeof err.code === "string" ? err.code : undefined,
    message: err instanceof Error ? err.message : undefined
  }
}
```

Important finding:

The five extracted item read services import `DataBaseHandler` at runtime only for `DataBaseHandler.errorHandling(...)`, and import `DBResponse` as type-only from `DataBaseHandler`.

They do not use:

- `DataBaseHandler.getInstance()`
- `getFromTable(...)`
- `addRecords(...)`
- `updateTable(...)`
- `isSuccess(...)`
- `isFail(...)`
- `dataBaseHandler`
- `DBResponseSuccess`
- `DBResponseFail`

Therefore, retargeting only those five read services to a neutral result/error helper can be behavior-preserving if the helper is byte-for-byte equivalent for the failure shape and logging side effects.

## 3. Required Read Files Status

| File | Result evidence |
| --- | --- |
| `docs/ARCHITECTURE_PLAN.md` | Read. Confirms inventory-first, medium safe slices, no SQL in routes/commands, no hidden ownership, preserve behavior. |
| `docs/refactor/STABILIZATION_PLAN.md` | Read. Confirms inventory -> risk map -> medium slice -> validation -> docs sync; preserve public behavior and response shapes. |
| `docs/refactor/ITEM_SERVICE_INVENTORY.md` | Read. Confirms item read-service decomposition is complete and high-risk item mutations remain in `ItemService`. |
| `docs/refactor/DATABASE_HANDLER_USAGE_INVENTORY.md` | Read. Confirms legacy result contract is a DataBaseHandler responsibility and type/error helper replacement is a potential cleanup area. |
| `src/core/DataBaseHandler.ts` | Read. Defines DB response types, static result helpers, error handling, and legacy persistence helpers. |
| `src/core/ItemCatalogReadService.ts` | Read. Runtime `DataBaseHandler` only for `errorHandling`; type-only `DBResponse`. |
| `src/core/ItemInventoryReadService.ts` | Read. Runtime `DataBaseHandler` only for `errorHandling`; type-only `DBResponse`. |
| `src/core/BotShopReadService.ts` | Read. Runtime `DataBaseHandler` only for `errorHandling`; type-only `DBResponse`. |
| `src/core/CraftRecipeReadService.ts` | Read. Runtime `DataBaseHandler` only for `errorHandling`; type-only `DBResponse`. |
| `src/core/PublicMarketReadService.ts` | Read. Runtime `DataBaseHandler` only for `errorHandling`; type-only `DBResponse`. |
| `src/core/ItemService.ts` | Read. Mixed runtime `DataBaseHandler` use: persistence helpers, `isSuccess`, `isFail`, `errorHandling`, `DBResponse`, `DBResponseSuccess`. |
| `src/core/EconomyService.ts` | Read. No `DataBaseHandler` import; uses local result types for some reads/mutations. |
| `src/core/MemberService.ts` | Read. No `DataBaseHandler` import; uses local throws/raw SQL. |
| `src/core/JobService.ts` | Read. No `DataBaseHandler` import; depends on `ItemService.ensureMemberByDiscordId(...)`, which returns legacy `DBResponseSuccess`. |
| `src/core/ShopObsService.ts` | Read. No `DataBaseHandler` import; uses local throws/errors and raw SQL. |

## 4. Inventory Table By File

| File | Imported symbols from `DataBaseHandler` | Type-only or runtime | Usage kind | Location category | Risk of moving away | Recommended target | Candidate medium slice grouping |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `src/core/DataBaseHandler.ts` | Defines `DBError`, `DBResponseSuccess`, `DBResponseFail`, `DBResponse`, `InsertIdResponse`, `IsExistsResponse`, `UpdateType`, `DataBaseHandler`, `dataBaseHandler` | Runtime definition and type source | Type definitions, `errorHandling`, `isSuccess`, `isFail`, legacy DB helper/persistence usage | Legacy DataBaseHandler owner | High if changed directly; all consumers depend on exact shape | Keep for now; later delegate/re-export from neutral module | Neutral result module with compatibility delegation only |
| `src/core/ItemCatalogReadService.ts` | `DataBaseHandler`; type-only `DBResponse` | Mixed: runtime `DataBaseHandler`, type-only `DBResponse` | `DBResponse` type; `errorHandling` runtime call | Read service | Low if helper is equivalent | Runtime errorHandling move to neutral module; type-only move to neutral module | Safest first retarget group |
| `src/core/ItemInventoryReadService.ts` | `DataBaseHandler`; type-only `DBResponse` | Mixed: runtime `DataBaseHandler`, type-only `DBResponse` | `DBResponse` type; `errorHandling` runtime call | Read service | Low if helper is equivalent | Runtime errorHandling move to neutral module; type-only move to neutral module | Safest first retarget group |
| `src/core/BotShopReadService.ts` | `DataBaseHandler`; type-only `DBResponse` | Mixed: runtime `DataBaseHandler`, type-only `DBResponse` | `DBResponse` type; `errorHandling` runtime call | Read service | Low if helper is equivalent | Runtime errorHandling move to neutral module; type-only move to neutral module | Safest first retarget group |
| `src/core/CraftRecipeReadService.ts` | `DataBaseHandler`; type-only `DBResponse` | Mixed: runtime `DataBaseHandler`, type-only `DBResponse` | `DBResponse` type; `errorHandling` runtime call | Read service | Low if helper is equivalent | Runtime errorHandling move to neutral module; type-only move to neutral module | Safest first retarget group |
| `src/core/PublicMarketReadService.ts` | `DataBaseHandler`; type-only `DBResponse` | Mixed: runtime `DataBaseHandler`, type-only `DBResponse` | `DBResponse` type; `errorHandling` runtime call; local explicit `!response.success` check | Read service | Low-medium because public market display response shape is frontend-visible, but result helper move is isolated | Runtime errorHandling move to neutral module; type-only move to neutral module | Safest first retarget group |
| `src/core/ItemService.ts` | `DataBaseHandler`, `DBResponse`, `DBResponseSuccess` | Runtime and regular type import in same import | `DBResponse` type; `DBResponseSuccess` type; `errorHandling`; `isSuccess`; `isFail`; `getInstance().getFromTable`; `addRecords`; `updateTable` | Core service / legacy DataBaseHandler user | High; owns item mutations, market/shop/craft, member bridge, persistence helper calls | Blocked because DataBaseHandler still owns persistence path here | Later item write/service slices, not neutral result first slice |
| `src/core/StreamerService.ts` | `DataBaseHandler`, `DBResponse`, `DBResponseSuccess` | Runtime and regular type import in same import | `DBResponse` type; `DBResponseSuccess` type; `errorHandling`; `isSuccess`; `isFail`; `getInstance().getFromTable`; `addRecords`; `addGuildToDB` | Core service / legacy DataBaseHandler user | High; streamers, OBS, guild/member, service-item side effects | Blocked because DataBaseHandler still owns persistence path here | Later streamer/OBS inventory-driven slice |
| `src/core/PermissionController.ts` | `DataBaseHandler`, `DBResponse` | Runtime and regular type import in same import | `DBResponse` type; `errorHandling` runtime call | Core service / authorization boundary | High; private command authorization behavior and failure shape are sensitive | Keep for now or move only after permission result design | Blocked from first slice |
| `src/core/StreamerServicesService.ts` | `DataBaseHandler` | Runtime | `isFail` runtime helper only, checking `ItemService.ensureMemberByDiscordId(...)` result | Core service | Medium-high; streamer service purchase/manage flows and member resolving | Keep for now; later explicit `success === false` or member service result cleanup | Not in neutral errorHandling slice |
| `src/core/BotAdmin.ts` | `DataBaseHandler` | Runtime | `getFromTable`; `isFail`; likely legacy helper usage for admin/contributor/member checks | Core service / legacy DataBaseHandler user | High; admin/security/settings/member attribution | Blocked because DataBaseHandler still owns persistence path here | Later admin/settings/member inventory |
| `src/bot.ts` | `DataBaseHandler` | Runtime | `getInstance().loadStreamers`; `isSuccess` | Bot startup | Medium; live Twitch notification startup behavior | Keep for now | Later streamer notification read slice |
| `src/events/guildCreate.ts` | `dataBaseHandler`, `DataBaseHandler` | Runtime | `ensureGuildBootstrap`; `isSuccess` | Event/command adapter but calls legacy lifecycle helper | High; guild bootstrap side effects | Blocked because DataBaseHandler owns persistence path | Later guild bootstrap slice |
| `src/events/guildDelete.ts` | `DataBaseHandler`, `dataBaseHandler` | Runtime | `deleteGuildFromDB`; `isSuccess` | Event/command adapter but calls legacy lifecycle helper | High; destructive guild lifecycle | Blocked because DataBaseHandler owns persistence path | Later guild lifecycle/delete policy slice |
| `src/utils/syncWithDatabase.ts` | `DataBaseHandler` | Runtime | `getInstance`; `getFromTable`; `ensureGuildBootstrap`; `deleteGuildFromDB`; `isSuccess`; `isFail` | Utility / legacy DataBaseHandler user | High; startup sync and destructive stale guild delete path | Blocked because DataBaseHandler owns persistence path | Later guild sync inventory |
| `src/core/GuildRecordService.ts` | Type-only `DBResponse`, `DBResponseFail`, `DBResponseSuccess`, `InsertIdResponse` | Type-only | DB response types; local `isSuccess`; local `isFail`; local `errorHandling` equivalent; direct SQL persistence boundary | Core service / persistence boundary | Medium; type move could be safe, but service owns guild persistence and local helpers | Type-only move to neutral module later; do not change local behavior now | Neutral type re-export later, not first if item read services first |
| `src/core/GuildChannelCacheService.ts` | Type-only `DBResponse`, `DBResponseFail`, `DBResponseSuccess` | Type-only | DB response types; local `isSuccess`; local `isFail`; local `errorHandling` equivalent; direct SQL persistence boundary | Core service / persistence boundary | Medium; guild bootstrap path depends on exact result shapes | Type-only move to neutral module later | Neutral type re-export later |
| `src/core/GuildRoleCacheService.ts` | Type-only `DBResponse`, `DBResponseFail`, `DBResponseSuccess` | Type-only | DB response types; local `isSuccess`; local `isFail`; local error helper pattern | Core service / persistence boundary | Medium; guild bootstrap path | Type-only move to neutral module later | Neutral type re-export later |
| `src/core/GuildLogSettingsService.ts` | Type-only `DBResponse`, `DBResponseFail`, `DBResponseSuccess` | Type-only | DB response types; local `isSuccess`; local `isFail`; local error helper pattern | Core service / persistence boundary | Medium; guild bootstrap/log settings path | Type-only move to neutral module later | Neutral type re-export later |
| `src/core/GuildMemberService.ts` | Type-only `DBResponse` | Type-only | DBResponse type only | Core service | Low-medium; guild-member lifecycle result shape used by adapters/services | Type-only move to neutral module later | Type-only migration group |
| `src/core/LocaleService.ts` | Type-only `DBResponse`, `DBResponseSuccess` | Type-only | DB response types; local error helper used in locale set path | Core service | Low-medium; locale response shape should remain stable | Type-only move to neutral module later | Type-only migration group |
| `src/core/LocalePreferenceRepository.ts` | Type-only `DBResponse`, `DBResponseSuccess`, `DBResponseFail` | Type-only | DB response types; local `errorHandling(error, relatedTo)` with different failure shape (`reason: "mysql_error"`) | Core service / narrow persistence boundary | Medium; local error shape differs from `DataBaseHandler.errorHandling` | Type-only move to neutral module only; do not replace local error helper with generic `unknown` helper | Type-only migration group, not runtime helper group |
| `src/core/EconomyService.ts` | None | None | No DBResponse/DataBaseHandler usage; has own `MemberBalancesLookupResult` and `RoulettePayoutResult` | Core service | Not applicable | Keep for now | Not part of DBResponse slice |
| `src/core/MemberService.ts` | None | None | No DBResponse/DataBaseHandler usage | Core service | Not applicable | Keep for now | Not part of DBResponse slice |
| `src/core/JobService.ts` | None directly | None directly | No DataBaseHandler import; indirectly uses `ItemService.ensureMemberByDiscordId(...)` legacy `DBResponseSuccess` result | Core service | Medium only if changing `ItemService.ensureMemberByDiscordId(...)`; no direct import to retarget | Keep for now | Not part of DBResponse slice |
| `src/core/ShopObsService.ts` | None | None | No DBResponse/DataBaseHandler usage; uses local throws/errors | Core service | Not applicable | Keep for now | Not part of DBResponse slice |

## 5. Extracted Item Read Services Classification

### 5.1 `ItemCatalogReadService`

Answers:

- Uses `DataBaseHandler` for anything except `errorHandling` and `DBResponse` typing: **No**.
- Runtime import purpose: `DataBaseHandler.errorHandling(error)` only.
- Type import purpose: `DBResponse` only.
- Persistence helper usage: **None**.
- `isSuccess` / `isFail` usage: **None**.
- Behavior-preserving neutral replacement possible: **Yes**, if neutral `errorHandling` matches current logging and returned object exactly.

Safe implementation touch for this file:

- Replace runtime import with neutral `errorHandling` import.
- Replace type import with neutral `DBResponse` import.
- Replace `DataBaseHandler.errorHandling(error)` calls with `errorHandling(error)`.

### 5.2 `ItemInventoryReadService`

Answers:

- Uses `DataBaseHandler` for anything except `errorHandling` and `DBResponse` typing: **No**.
- Runtime import purpose: `DataBaseHandler.errorHandling(error)` only.
- Type import purpose: `DBResponse` only.
- Persistence helper usage: **None**.
- `isSuccess` / `isFail` usage: **None**.
- Behavior-preserving neutral replacement possible: **Yes**, if neutral helper is byte-for-byte equivalent.

Safe implementation touch for this file:

- Same as `ItemCatalogReadService`.

### 5.3 `BotShopReadService`

Answers:

- Uses `DataBaseHandler` for anything except `errorHandling` and `DBResponse` typing: **No**.
- Runtime import purpose: `DataBaseHandler.errorHandling(error)` only.
- Type import purpose: `DBResponse` only.
- Persistence helper usage: **None**.
- `isSuccess` / `isFail` usage: **None**.
- Behavior-preserving neutral replacement possible: **Yes**.

Safe implementation touch for this file:

- Same as `ItemCatalogReadService`.

### 5.4 `CraftRecipeReadService`

Answers:

- Uses `DataBaseHandler` for anything except `errorHandling` and `DBResponse` typing: **No**.
- Runtime import purpose: `DataBaseHandler.errorHandling(error)` only.
- Type import purpose: `DBResponse` only.
- Persistence helper usage: **None**.
- `isSuccess` / `isFail` usage: **None**.
- Behavior-preserving neutral replacement possible: **Yes**.

Safe implementation touch for this file:

- Same as `ItemCatalogReadService`.

### 5.5 `PublicMarketReadService`

Answers:

- Uses `DataBaseHandler` for anything except `errorHandling` and `DBResponse` typing: **No**.
- Runtime import purpose: `DataBaseHandler.errorHandling(error)` only.
- Type import purpose: `DBResponse` only.
- Persistence helper usage: **None**.
- `isSuccess` / `isFail` usage: **None**.
- Behavior-preserving neutral replacement possible: **Yes**, with the same failure object and logging side effects.

Safe implementation touch for this file:

- Same as `ItemCatalogReadService`.

## 6. Safe Exact Files For The Narrowest Implementation Slice

If implementing the safest version of recommendation A, touch only:

- `src/core/DbResult.ts` new neutral module
- `src/core/DataBaseHandler.ts` compatibility re-export/delegation only
- `src/core/ItemCatalogReadService.ts`
- `src/core/ItemInventoryReadService.ts`
- `src/core/BotShopReadService.ts`
- `src/core/CraftRecipeReadService.ts`
- `src/core/PublicMarketReadService.ts`

Do not touch in that slice:

- `src/core/ItemService.ts`
- `src/core/StreamerService.ts`
- `src/core/PermissionController.ts`
- `src/core/BotAdmin.ts`
- `src/core/StreamerServicesService.ts`
- `src/core/Guild*.ts`
- `src/events/**`
- `src/commands/**`
- `src/api/**`
- `src/utils/syncWithDatabase.ts`
- `src/core/EconomyService.ts`
- `src/core/MemberService.ts`
- `src/core/JobService.ts`
- `src/core/ShopObsService.ts`
- SQL or migration files
- website or OBS agent files

## 7. Risk Map

### 7.1 Safe / medium candidates

1. **Move DBResponse type definitions to a neutral module with compatibility re-exports preserved**
   - Safe if `DataBaseHandler.ts` continues exporting the same names.
   - Avoids broad import churn.
   - Enables future services to import result types without coupling to legacy DB helper.

2. **Move `errorHandling(...)` to a neutral module if behavior is byte-for-byte equivalent and `DataBaseHandler` delegates**
   - Must preserve logging:
     - `console.log(" Error handling...")`
     - `console.error(err)`
   - Must preserve returned failure shape:
     - `success: false`
     - `error.reason: "unknown"`
     - `error.relatedTo: "unknown"`
     - `error.code` only when `err instanceof Error` and `err.code` is string
     - `error.message` only when `err instanceof Error`

3. **Retarget only the five item read services first if global change is too broad**
   - These files use only `DBResponse` type plus `DataBaseHandler.errorHandling(...)`.
   - No persistence helper calls.
   - No result narrowing helper calls.
   - No routes/events/commands affected.

### 7.2 High-risk candidates

1. **Changing DataBaseHandler persistence helpers**
   - `getFromTable`, `addRecords`, `updateTable`, `ensureGuildBootstrap`, `deleteGuildFromDB`, `isMemberExists`, and similar helpers are legacy persistence paths.
   - Do not combine with result/error helper cleanup.

2. **Changing `isSuccess` / `isFail` semantics globally**
   - Used in guild lifecycle, streamer, item, bot startup, and sync flows.
   - Changing type guards can alter behavior or TypeScript narrowing in unrelated domains.

3. **Changing routes/events behavior**
   - `guildCreate`, `guildDelete`, and startup sync still call legacy DB helpers.
   - Permission behavior is security-sensitive.

4. **Changing DB error response shape**
   - API/bot code expects current `DBResponse` shape.
   - Even a small change in `reason`, `relatedTo`, `code`, `message`, or logging could be observable.

5. **Mixing this with item mutation or economy mutation work**
   - `ItemService` still owns high-risk write flows.
   - Economy mutation ownership remains separate and incomplete.

### 7.3 Blocked

Blocked for this slice:

- DataBaseHandler removal.
- Generic repository/helper abstraction.
- Broad rename of `DBResponse` across the whole repo.
- Response shape redesign.
- Error taxonomy redesign.
- Route/command/event retargeting.
- Permission result redesign.
- Item mutation, inventory mutation, market purchase, craft execution, or economy mutation changes.

## 8. Recommended Next Medium Slice

Recommendation: **A, but constrained to compatibility plus the five item read services.**

### 8.1 Goal

Add a neutral result/error module and retarget only the extracted item read services, while preserving compatibility exports/delegation from `DataBaseHandler`.

Proposed shape:

```text
src/core/DbResult.ts
  - DBError
  - DBResponseSuccess<T>
  - DBResponseFail
  - DBResponse<T>
  - InsertIdResponse
  - IsExistsResponse
  - isSuccess<T>(res)
  - isFail<T>(res)
  - errorHandling(err?)
```

Compatibility shape:

```text
src/core/DataBaseHandler.ts
  - continues exporting DBResponse types under the same names
  - DataBaseHandler.errorHandling(err) delegates to neutral errorHandling(err)
  - DataBaseHandler.isSuccess/isFail delegate or preserve exact semantics
  - no persistence helper behavior changes
```

Retarget only:

```text
src/core/ItemCatalogReadService.ts
src/core/ItemInventoryReadService.ts
src/core/BotShopReadService.ts
src/core/CraftRecipeReadService.ts
src/core/PublicMarketReadService.ts
```

### 8.2 Allowed files

Allowed implementation files for that future slice:

- `src/core/DbResult.ts`
- `src/core/DataBaseHandler.ts`
- `src/core/ItemCatalogReadService.ts`
- `src/core/ItemInventoryReadService.ts`
- `src/core/BotShopReadService.ts`
- `src/core/CraftRecipeReadService.ts`
- `src/core/PublicMarketReadService.ts`

Optional docs sync after implementation:

- `docs/refactor/DB_RESPONSE_USAGE_INVENTORY.md`

### 8.3 Do-not-touch list

Do not touch:

- `src/core/ItemService.ts`
- `src/core/StreamerService.ts`
- `src/core/PermissionController.ts`
- `src/core/BotAdmin.ts`
- `src/core/StreamerServicesService.ts`
- `src/core/GuildRecordService.ts`
- `src/core/GuildChannelCacheService.ts`
- `src/core/GuildRoleCacheService.ts`
- `src/core/GuildLogSettingsService.ts`
- `src/core/GuildMemberService.ts`
- `src/core/LocaleService.ts`
- `src/core/LocalePreferenceRepository.ts`
- `src/core/EconomyService.ts`
- `src/core/MemberService.ts`
- `src/core/JobService.ts`
- `src/core/ShopObsService.ts`
- `src/api/**`
- `src/commands/**`
- `src/events/**`
- `src/utils/syncWithDatabase.ts`
- `sql/**`
- `balkon-website/**`
- `balkon-obs-agent/**`

### 8.4 Exact behavior to preserve

Preserve exactly:

- `DBResponseSuccess<T>` shape:
  - `success: true`
  - `data: T`
  - `error?: undefined`
- `DBResponseFail` shape:
  - `success: false`
  - `data?: undefined`
  - `error: DBError`
- `DBError` fields and allowed values:
  - `reason: "record_not_found" | "mysql_error" | "unknown"`
  - `relatedTo: "unknown" | DataBaseTables`
  - optional `code`
  - optional `message`
- `DataBaseHandler.errorHandling(...)` output for all error inputs.
- `DataBaseHandler.errorHandling(...)` logging side effects.
- `isSuccess(...)` semantic: `return res.success`.
- `isFail(...)` semantic: `return !res.success`.
- All item read service public method names and return shapes.
- All SQL, sorting, mapping, null handling, and autocomplete payloads in item read services.

### 8.5 Expected diff

Expected future implementation diff:

- Add one new neutral file: `src/core/DbResult.ts`.
- Move or duplicate result type definitions into `DbResult.ts`.
- Move or duplicate `errorHandling`, `isSuccess`, and `isFail` into `DbResult.ts` with equivalent behavior.
- Keep `DataBaseHandler` compatibility exports and static methods stable.
- Change only the five extracted item read services to import `DBResponse` and `errorHandling` from `DbResult.ts`.
- No SQL changes.
- No route/command/event changes.
- No response shape changes.

### 8.6 Validation commands/searches

Run:

```powershell
npm run build
```

Run targeted searches:

```text
DBResponse
DBResponseSuccess
DBResponseFail
DataBaseHandler.errorHandling
DataBaseHandler.isSuccess
DataBaseHandler.isFail
from "./DataBaseHandler.js"
from "../core/DataBaseHandler.js"
from "./DbResult.js"
errorHandling(error)
return DataBaseHandler.errorHandling
class DataBaseHandler
static errorHandling
```

Expected after implementation:

- The five item read services no longer import `DataBaseHandler`.
- The five item read services import `DBResponse` and `errorHandling` from `DbResult.ts`.
- `DataBaseHandler.errorHandling(...)` still exists and delegates/preserves behavior.
- `ItemService`, `StreamerService`, permission/guild/event/sync files remain untouched.
- Build passes.

### 8.7 Rejection criteria

Reject the implementation if it:

- changes the DB response shape;
- changes error log text or removes logging;
- changes `reason`, `relatedTo`, `code`, or `message` behavior;
- changes `isSuccess` / `isFail` semantics;
- changes SQL or mappings in item read services;
- touches routes, commands, events, or frontend;
- touches item/economy/market/craft/OBS mutation paths;
- performs a broad import rename across the whole repo;
- creates a generic repository/helper abstraction;
- removes or weakens `DataBaseHandler` compatibility exports;
- edits schema or migrations.

## 9. Required Search Report

Searches run:

```text
DBResponse
DBResponseSuccess
DBResponseFail
DataBaseHandler.errorHandling
DataBaseHandler.isSuccess
DataBaseHandler.isFail
from "./DataBaseHandler.js"
from "../core/DataBaseHandler.js"
errorHandling(error)
return DataBaseHandler.errorHandling
class DataBaseHandler
static errorHandling
```

Additional search note:

- One combined regex import search failed because the slash escaping was invalid for the search tool.
- It was corrected by rerunning the two import searches as fixed-string searches:
  - `from "./DataBaseHandler.js"`
  - `from "../core/DataBaseHandler.js"`

Key counts from targeted searches:

- `DataBaseHandler.errorHandling`: 67 matches across 9 files.
- `DataBaseHandler.isSuccess`: 15 matches across 7 files.
- `DataBaseHandler.isFail`: 39 matches across 6 files.
- `DBResponseFail`: 14 matches across 6 files.
- `DBResponseSuccess`: 22 matches across 9 files.
- `from "./DataBaseHandler.js"`: matches across core files including the five item read services, `ItemService`, `StreamerService`, guild services, locale files, permission, bot admin, and streamer services.
- `from "../core/DataBaseHandler.js"`: matches in guild event/sync adapter files.

Evidence conclusions:

- Item read services are clean candidates for neutral result helper retargeting.
- Broad global retargeting is not safe yet because many files still use `DataBaseHandler` for persistence helpers or high-risk lifecycle/mutation paths.
- Type-only consumers can move later, but doing all of them globally is broader than necessary for the next safe slice.
- `LocalePreferenceRepository` has a local `errorHandling(error, relatedTo)` with a different failure reason (`mysql_error`), so it should not be mechanically replaced by neutral `errorHandling(...)` designed to preserve `DataBaseHandler.errorHandling(...)`.

## 10. Files Changed By This Inventory Task

Only:

- `docs/refactor/DB_RESPONSE_USAGE_INVENTORY.md`

No runtime code was changed.
No `DbResult.ts` was created.
No `DataBaseHandler` code was edited.
No service logic was changed.
No SQL was changed.
No response shapes were changed.
