# Item System Senior Notes

This document records the senior interpretation of the item-system product intent.

It exists because early product ideas are not automatically implementation truth. They must be translated into safe architecture before code, schema, or admin UI work starts.

Read together with:

- `docs/refactor/ITEM_SYSTEM_DESIGN.md`
- `docs/ARCHITECTURE_PLAN.md`
- `docs/refactor/STABILIZATION_PLAN.md`

## 1. Product Intent vs Implementation Truth

The user intent is valid:

- items should support future cases, keys, potions, bundles, upgrade flows, display metadata, and inventory usage;
- items should be visible as normal inventory entries even when they have special behavior;
- usage should go through strict backend/API validation;
- adding new item behavior should not require manual SQL editing or TypeScript changes for every item;
- the system should be flexible enough for future admin/API-driven configuration.

However, product examples such as `case`, `key`, `XP potion`, `bundle`, `upgrade material`, `Cow`, or `Stick` are examples of desired capabilities, not final database schema or final service names.

Senior correction:

```text
Do not implement the literal examples directly.
First design the ownership boundary, behavior model, transaction rules, and admin/configuration path.
```

## 2. Correct Architectural Reading

The item system should become a configurable item platform, not a pile of hardcoded special cases.

Correct target direction:

```text
Item template -> describes the item
Inventory item -> owned instance of a template
Use effect -> describes what happens when used
Use service -> validates and executes usage transactionally
Admin/API layer -> configures templates/effects/loot/upgrade rules safely
```

Incorrect direction:

```text
if item.name === "XP Potion" then add exp
if item.name === "Case" then random reward
if item.name === "Bundle" then grant items
```

Hardcoded item names, hardcoded template ids, and route-level special item logic are rejected.

## 3. Level System Clarification

Balkon needs separate progression domains.

### Global app progression

This is the user's overall account/application level. It appears on the website as global profile progression.

Potential owner:

- `MemberProgressionService`

### Discord guild progression

This is per-guild/server progression. The same member can have different levels in different guilds.

It appears on the website only in a selected guild/server context.

Potential owner:

- `GuildMemberProgressionService`

### XP item effects

XP potions or similar items must explicitly target one progression domain.

Accepted idea:

```text
grant_global_experience
grant_guild_experience
```

Rejected idea:

```text
grant_level
```

Reason: `level` is ambiguous and would cause bugs when both global and guild-specific levels exist.

## 4. Cases, Keys, And Bundles

Cases, keys, and bundles should be normal inventory items for display and ownership purposes.

Their special behavior should be represented as configured use effects.

### Case

A case is an item whose use effect rolls a loot table.

Case opening must:

- verify ownership;
- verify required key ownership if configured;
- consume required items transactionally;
- roll configured loot;
- grant resulting items transactionally;
- return the result;
- later record audit/history when that system exists.

### Key

A key is a normal item that can be consumed by case-opening rules.

A key is not a magic hardcoded concept inside routes.

### Bundle

A bundle is a normal item whose use effect grants deterministic configured contents.

Bundle is not the same as case:

- bundle = deterministic;
- case = random loot table.

## 5. Upgrade System Clarification

The user specifically does not want the upgrade system reduced to one vague field such as `upgrade_material`.

Senior interpretation:

```text
Upgrade is a separate feature domain, not an item metadata field.
```

Correct direction:

- selected item to upgrade;
- configured upgrade rule;
- cost/currency/material requirements;
- success chance or deterministic upgrade rule;
- failure behavior;
- transactional resource consumption;
- tier/state update;
- result response;
- later audit/history.

Potential owner:

- `ItemUpgradeService`
- `ItemUpgradeRuleRepository`

Do not implement upgrades until an upgrade design is written and reviewed.

## 6. Configurability Requirement

The future system should allow adding and changing item templates and item behavior through backend/admin/API flows.

This does not mean the full admin UI must be implemented immediately.

It means the backend design must not force:

- manual SQL for every item;
- code changes for every case/key/potion/bundle;
- hardcoded item names;
- hardcoded item ids;
- broad edits inside `ItemService` for every new item behavior.

Good future direction:

```text
admin/API creates template
admin/API configures effect
admin/API configures loot table or bundle contents
backend validates and executes configured behavior
```

## 7. Serialization / Numbering Clarification

The user's desired display behavior is understood as per-template instance numbering.

Correct model:

```text
items.id = global item template id
member_items.id = global inventory instance id
member_items.serial_number = per-template visible number
```

Example:

```text
Cow template id = 1
Stick template id = 2
Cow #1 = first Cow inventory instance
Stick #1 = first Stick inventory instance
```

Do not implement this by resetting primary keys or creating per-item-template tables.

## 8. Safe Implementation Order

Do not implement item platform features directly from this idea discussion.

Required order:

1. Create or refresh `docs/refactor/ITEM_SERVICE_INVENTORY.md`.
2. Map current `ItemService` methods, SQL, transactions, callers, response shapes, tier usage, market/shop/craft/OBS dependencies.
3. Validate current schema and frontend expectations.
4. Write a concrete item-system implementation plan.
5. Choose one medium bounded slice.
6. Implement with strict behavior preservation and validation.

## 9. Rejection Criteria For Future Patches

Reject a future item-system patch if it:

- hardcodes special item behavior by item name;
- hardcodes special item behavior by template id without a documented migration path;
- puts all use behavior into the current broad `ItemService`;
- creates a generic CRUD repository layer;
- implements upgrades as one vague `upgrade_material` column;
- adds case/key/bundle usage without transaction safety;
- consumes items before guaranteeing rollback-safe grant behavior;
- requires manual SQL for ordinary future item configuration;
- mixes global progression and guild progression under one vague `level` field;
- changes market/shop/craft/OBS behavior without inventory and senior review.

## 10. Current Decision

The discussion is accepted as product direction and architecture intent.

It is not accepted as an immediate implementation task.

Next correct task for this area:

```text
Strong Tommy read-only ITEM_SERVICE_INVENTORY.md
```

After that, Mickey should shape one medium safe item-system slice with concrete allowed files, do-not-touch list, behavior preservation rules, validation searches, and rejection criteria.
