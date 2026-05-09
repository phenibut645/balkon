# Economy Mutation Inventory

This document records the current economy mutation surfaces and replacement map.

It is a factual inventory and planning aid. It does not change runtime code, schema, migrations, or behavior by itself.

Read together with:

- `docs/ARCHITECTURE_PLAN.md`
- `docs/refactor/STABILIZATION_PLAN.md`
- `docs/refactor/DB_ACCESS_BOUNDARY.md`
- `docs/refactor/DATABASE_HANDLER_USAGE_INVENTORY.md`
- `docs/refactor/DATABASE_INVENTORY.md`
- `docs/refactor/DB_TABLE_OWNERSHIP.md`

## 1. Accepted Direction

Economy ownership direction:

- balance and `ldm_balance` mutations must move toward explicit economy ownership;
- routes, Discord commands, job services, shop services, market services, and OBS services must not own raw balance mutation SQL long term;
- `EconomyService` may remain the current economy owner during stabilization;
- future extraction may introduce narrow repositories such as `MemberBalanceRepository` or `EconomyLedgerRepository`, but not generic CRUD abstractions;
- no `BaseRepository`, `GenericRepository`, `SqlHelper`, `DataBaseHandler 2.0`, or broad catch-all `EconomyRepository` should be created;
- economy changes should use medium safe domain slices, not endless line edits and not broad rewrites.

Current preferred flow:

```text
inventory -> risk map -> medium safe domain slice -> validation -> docs sync
```

## 2. Current Status Summary

### Completed / accepted

- `/balance` reads use `EconomyService.getMemberBalancesByDiscordId(...)`.
- `/menu` balance summary uses `EconomyService.getMemberBalancesByDiscordId(...)`.
- Roulette payout no longer performs direct command-layer `DataBaseHandler.updateTable(...)`; it delegates to `EconomyService.creditRoulettePayoutByDiscordId(...)`.
- `JobService.runJob(...)` no longer directly executes reward balance SQL. The job use case still owns the transaction, cooldown logic, optional item reward, and response shape, but the reward credit SQL now lives in `EconomyService.creditJobReward(...)` and uses the active `PoolConnection`.
<<<<<<< HEAD
- `EconomyService.adjustMemberBalanceByAdmin(...)` no longer resolves admin/target members through `ItemService`; it uses `MemberService.ensureMemberByDiscordId(...)` directly.
- Dashboard `/economy/me` no longer reads balance through `ItemService.ensureMemberByDiscordId(...)`; it ensures the member through `MemberService` and reads balances through `EconomyService.getMemberBalancesByDiscordId(...)`.
=======
- `EconomyService.adjustMemberBalanceByAdmin(...)` no longer depends on `ItemService` for admin or target member resolving. It now resolves admin and target member ids through `MemberService.ensureMemberByDiscordId(...)` via `memberService`.
>>>>>>> 215cedf46f949cdc67f59139f12b8ad058cea23f

### Still open

- `ShopObsService` still owns direct OBS media charge/refund balance SQL and coordinates external OBS side effects.
- `ItemService` still owns direct balance SQL for public market purchase, bot shop purchase, and sell-to-bot flows.
- General audit ledger does not exist yet.
- Roulette semantics remain weak even though the payout SQL is behind `EconomyService`.
- `JobService` and other services may still call `ItemService.ensureMemberByDiscordId(...)` for non-admin-adjustment member resolving; that is separate from the accepted admin economy cleanup.

## 3. Mutation Inventory

| Surface | File | Current DB behavior | Business reason | Transaction behavior | Refund behavior | Audit / ledger behavior | Current owner | Target direction | Risk | Replace now? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Balance lookup for commands/menu | `src/core/EconomyService.ts` | `SELECT balance, ldm_balance FROM members WHERE ds_member_id = ?` | User balance display | No transaction | N/A | N/A | `EconomyService` | Keep; future read model only if needed | Low | No |
| Economy totals/snapshots | `src/core/EconomyService.ts` | Reads `members.balance`, `members.ldm_balance`; writes `economy_daily_snapshots` | Economy dashboard/reporting | No wrapping transaction | N/A | Snapshot table only | `EconomyService` | Keep; future economy read model optional | Medium | No |
| Roulette payout | `src/core/EconomyService.ts` | `UPDATE members SET balance = balance + ? WHERE ds_member_id = ?` | Roulette win payout | Single statement | None | No ledger; result reports affected rows | `EconomyService` | Future game/economy use case | Medium-high semantic risk | Not first |
<<<<<<< HEAD
| Admin balance adjustment | `src/core/EconomyService.ts` | Dynamic `balance` / `ldm_balance` update plus insert into `admin_economy_adjustments` | Admin manual balance correction | Explicit transaction | Rollback before commit | `admin_economy_adjustments`; no general ledger | `EconomyService` with member resolving via `MemberService` | `EconomyService` + `MemberService`; later audit ledger | Medium | Completed member-resolving cleanup |
=======
| Admin balance adjustment | `src/core/EconomyService.ts` | Dynamic `balance` / `ldm_balance` update plus insert into `admin_economy_adjustments` | Admin manual balance correction | Explicit transaction | Rollback before commit | `admin_economy_adjustments`; no general ledger | `EconomyService`, with admin/target member resolving through `MemberService` | Later audit ledger; later repository split if justified | Medium | Completed |
>>>>>>> 215cedf46f949cdc67f59139f12b8ad058cea23f
| Job reward credit | `src/core/EconomyService.ts` + `src/core/JobService.ts` | `EconomyService.creditJobReward(...)` updates `members.balance` and reads balance using the provided transaction connection | Reward user for running a job | Existing `JobService.runJob(...)` transaction still owns job lock, cooldown lock, reward credit, optional item grant, cooldown write, commit/rollback | Rollback before commit | No ledger/job run history | `JobService` owns use case; `EconomyService` owns balance SQL | Accepted current boundary; later audit/ledger | Medium | Completed |
| OBS media charge | `src/core/ShopObsService.ts` | `UPDATE members SET balance = balance - ? WHERE id = ? AND balance >= ?` | Charge buyer for OBS media/service purchase | Single statement before OBS action/queue flow; not one DB transaction with all side effects | Explicit refund path if later OBS command/action fails | OBS action status only; no general ledger | `ShopObsService` | OBS purchase use case + `EconomyService` charge/refund methods | High | No |
| OBS media refund | `src/core/ShopObsService.ts` | `UPDATE members SET balance = balance + ? WHERE id = ?` | Refund failed OBS media purchase | Single statement compensation | This is the refund primitive; refund failure is marked when possible | OBS action status only; no general ledger | `ShopObsService` | OBS purchase use case + `EconomyService` refund method | High | No |
| Public market purchase | `src/core/ItemService.ts` | Buyer debit and seller credit on `members.balance` | Buyer pays seller for item listing | Explicit transaction with item/listing mutations | Rollback before commit | Seller notification only; no ledger | `ItemService` | Market use case + economy transfer method | High | No |
| Bot shop purchase | `src/core/ItemService.ts` | Buyer debit on `members.balance` | Buyer purchases bot shop item(s) | Explicit transaction with listing/inventory mutations | Rollback before commit | No ledger | `ItemService` | Bot shop use case + economy debit method | High | No |
| Sell inventory item to bot | `src/core/ItemService.ts` | Seller credit on `members.balance` after inventory/listing cleanup | User sells inventory item to bot | Explicit transaction with inventory/listing deletion | Rollback before commit | No ledger | `ItemService` | Inventory/bot-shop use case + economy credit method | Medium-high | Not first |
| Dashboard `/economy/me` read | `src/api/routes/dashboardRoutes.ts` | Ensures member through `MemberService.ensureMemberByDiscordId(...)` and reads balance through `EconomyService.getMemberBalancesByDiscordId(...)` | Website current balance | No transaction | N/A | N/A | Route + accepted member/economy read boundaries | Keep this read path narrow; broader dashboard extraction remains separate | Low-medium | Completed |

## 4. Direct Mutation Search Expectations

After the accepted job reward and admin resolving slices:

- `src/core/JobService.ts` should not contain direct `UPDATE members` reward balance SQL.
- `src/core/EconomyService.ts` should contain job reward credit SQL through `creditJobReward(...)`.
- `src/core/EconomyService.ts` should not import `ItemService`.
- `src/core/EconomyService.ts` should resolve admin and target member ids through `MemberService` / `memberService`.
- Existing direct balance mutations are still expected in:
  - `src/core/EconomyService.ts` for roulette/admin/job reward;
  - `src/core/ShopObsService.ts` for OBS charge/refund;
  - `src/core/ItemService.ts` for market/bot-shop/sell-to-bot.

Useful searches:

```text
UPDATE members SET balance
balance = balance +
balance = balance -
UPDATE members SET ldm_balance
ldm_balance
creditJobReward
creditRoulettePayoutByDiscordId
adjustMemberBalanceByAdmin
memberService.ensureMemberByDiscordId
ItemService.getInstance().ensureMemberByDiscordId
tryChargeMember
refundMember
buyPublicListing
buyFromBotShop
sellInventoryItemToBot
```

## 5. Risk Map

### Medium candidates

1. Dashboard `/economy/me` read cleanup.
   - Move current balance read away from `ItemService.ensureMemberByDiscordId(...)` toward an economy/member-aware read path.
   - Useful but read-only; not a mutation ownership win.

2. Sell inventory item to bot, later.
   - Simpler than market transfer or OBS, but still includes destructive inventory/listing changes.
   - Needs focused `ItemService` method inventory first.

3. Member resolving cleanup in other non-economy services.
   - Some services may still depend on `ItemService.ensureMemberByDiscordId(...)` for member resolving.
   - Should be handled as separate ownership cleanup slices, not hidden inside economy mutation changes.

### High-risk candidates

1. OBS media charge/refund.
   - Money + OBS action state + command queue + external side effect + compensation.
   - Needs dedicated OBS/economy purchase inventory or use-case design.

2. Public market purchase.
   - Buyer debit + seller credit + item transfer + listing deletion + notification.
   - Needs market/economy transfer boundary design.

3. Bot shop purchase.
   - Buyer debit + inventory grants + listing lock.
   - Needs bot shop/inventory/economy boundary design.

4. Full `ItemService` economy extraction.
   - Blocked by large-file/god-service risk.
   - Needs `ITEM_SERVICE_INVENTORY.md` first.

5. Roulette semantic hardening.
   - Already delegated to `EconomyService`, but game semantics remain underdefined: stake debit, sufficiency check, fractional payout, audit/ledger, and idempotency.
   - Requires explicit gameplay/economy rules before implementation.

## 6. Recommended Next Slices

Recommended order after the completed job reward and admin resolving slices:

<<<<<<< HEAD
1. **Admin adjustment member resolving cleanup**
   - Completed: `EconomyService` now resolves admin/target members through `MemberService` without changing balance update semantics, `admin_economy_adjustments`, notification behavior, schema, or audit.

2. **Dashboard `/economy/me` read cleanup**
   - Completed: the route now ensures the current user through `MemberService` and reads balances through `EconomyService` while preserving the existing response shape.
=======
1. **Dashboard `/economy/me` read cleanup**
   - Goal: stop using `ItemService` as balance read owner in the dashboard economy route.
   - Why: simple read ownership cleanup; useful after admin cleanup.
   - Guardrail: preserve response shape.
>>>>>>> 215cedf46f949cdc67f59139f12b8ad058cea23f

2. **ItemService inventory before market/bot-shop/sell-to-bot changes**
   - Goal: map item/economy/inventory transaction boundaries before moving any purchase/sale balance mutations.
   - Why: these flows are too coupled for blind extraction.

3. **OBS purchase/refund inventory before any OBS economy implementation**
   - Goal: document charge/refund/action/queue/side-effect ordering before changing money flow.
   - Why: high risk of refund/side-effect bugs.

4. **Audit/economy ledger design**
   - Goal: design audit/ledger shape before adding broad audit writes.
   - Why: audit must be consistent and should not be sprinkled randomly.

## 7. Completed Slice Note: Job Reward Credit

Accepted implementation shape:

```text
JobService.runJob(...)
  owns job use case and transaction
  -> EconomyService.creditJobReward(..., connection)
       owns members.balance reward SQL and balanceAfter read
```

Preserved behavior:

- member resolving stayed unchanged;
- job lookup still uses `FOR UPDATE`;
- disabled job behavior unchanged;
- cooldown lock and cooldown error details unchanged;
- reward amount unchanged;
- optional item reward behavior unchanged;
- cooldown upsert unchanged;
- returned `JobRunResult` shape unchanged;
- no audit/ledger/schema change was added.

Follow-up:

- Audit/ledger remains absent and should be handled by a dedicated audit/economy slice later.
<<<<<<< HEAD
- JobService still uses `ItemService.ensureMemberByDiscordId(...)`; that belongs to a member resolving cleanup, not the completed reward-credit slice.

## 8. Explicit Non-Changes

- This document does not resolve OBS charge/refund ownership.
- This document does not resolve ItemService market, bot-shop, or sell-to-bot balance mutations.
- This document does not add an audit log, ledger, schema change, or migration.
- This document does not declare the economy mutation surface fully stabilized.
=======
- JobService still uses `ItemService.ensureMemberByDiscordId(...)`; that belongs to a separate member resolving cleanup, not the completed reward-credit slice.

## 8. Completed Slice Note: Admin Adjustment Member Resolving

Accepted implementation shape:

```text
EconomyService.adjustMemberBalanceByAdmin(...)
  -> memberService.ensureMemberByDiscordId(adminDiscordId, { createdSource: "unknown" })
  -> memberService.ensureMemberByDiscordId(targetDiscordId, { createdSource: "unknown" })
  -> existing transaction and balance adjustment SQL
```

Preserved behavior:

- admin and target member ids are still ensured before the adjustment transaction;
- existing `TARGET_MEMBER_CREATE_FAILED` error code and messages are preserved;
- dynamic ODM/LDM column selection is unchanged;
- positive adjustment and non-negative deduction guard are unchanged;
- adjusted balance read is unchanged;
- `admin_economy_adjustments` insert is unchanged except it now uses numeric ids returned by `MemberService` directly;
- commit/rollback behavior is unchanged;
- notification remains post-commit;
- route response mapping is unchanged;
- no audit/ledger/schema change was added.

Follow-up:

- General audit/ledger remains absent.
- Admin adjustment SQL still lives in `EconomyService`; a future repository split may be considered only after stronger persistence boundaries are justified.
>>>>>>> 215cedf46f949cdc67f59139f12b8ad058cea23f
