# Economy Mutation Inventory

Task: KAN economy stabilization follow-up

This document is a focused factual inventory for known `members.balance` and `members.ldm_balance` mutation surfaces.

It is inventory-only. It does not change runtime code, schema, migrations, or ownership by itself.

## Current Mutation Status

| Mutation surface | Current owner | Member resolving path | Status | Remaining risks |
| --- | --- | --- | --- | --- |
| Admin economy adjustment | `src/core/EconomyService.ts` | `MemberService.ensureMemberByDiscordId(...)` for admin and target member ids | accepted; member resolving cleanup completed | audit/ledger still absent; balance semantics still rely on direct column mutation; notification remains post-commit only |
| Job reward credit | `src/core/EconomyService.ts` via `creditJobReward(...)` called from `src/core/JobService.ts` | caller passes resolved `memberId` | accepted transitional slice | no audit/ledger; broader job/economy semantics still need separate review |
| OBS media charge/refund | `src/core/ShopObsService.ts` | unresolved in this inventory | open | direct charge/refund remains outside `EconomyService`; external side effects and refund semantics stay coupled |
| Market and bot-shop balance mutations | `src/core/ItemService.ts` | unresolved in this inventory | open | market purchase, bot-shop buy, and sell-to-bot balance mutations remain in `ItemService` |
| Roulette payout semantics | `src/core/EconomyService.ts` and `src/commands/roulette.ts` | unresolved in this inventory | open | payout route exists, but wider roulette semantics remain open |

## Accepted Slice Notes

- Admin adjustment member resolving cleanup is completed and accepted.
- `EconomyService.adjustMemberBalanceByAdmin(...)` no longer depends on `ItemService` for member resolving.
- `EconomyService` now uses `MemberService` directly for admin and target member id resolution.
- This does not complete economy ownership centralization.
- This does not resolve OBS/media, market, bot-shop, or roulette semantics.
- This does not add an audit log, ledger, schema change, or migration.

## Explicit Non-Changes

- No schema or migration changes are implied by this inventory.
- No route, command, event, OBS agent, or frontend behavior is changed by this document.
- This document does not declare the economy mutation surface fully stabilized.