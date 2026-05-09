# Item System Design Direction

This document records the intended direction for the future Balkon item system.

It is a planning/design artifact, not a migration, implementation task, or final schema contract.

Read together with:

- `docs/ARCHITECTURE_PLAN.md`
- `docs/refactor/STABILIZATION_PLAN.md`
- `docs/refactor/DB_ACCESS_BOUNDARY.md`
- `docs/refactor/ECONOMY_MUTATION_INVENTORY.md`

## 1. Why This Exists

The current item system is not ready for the planned future feature set.

Future items may include:

- keys;
- cases;
- experience potions;
- deterministic item bundles;
- random loot containers;
- upgrade-related items;
- cosmetic/display items;
- service/OBS-related items;
- collectible items.

The goal is not to add one more branch inside `ItemService` for every new item type.

The target is an extensible item platform where new item behavior can be configured and managed through backend/admin/API flows, not by manually editing SQL rows or hardcoding every special item in TypeScript.

## 2. Core Concept Split

The system must separate these concepts:

### Item Template

An item template describes what the item is.

Examples:

- `Cow`
- `Stick`
- `Bronze Key`
- `Beginner Case`
- `XP Potion`
- `Starter Bundle`

Template-level data includes stable identity and display metadata:

- name;
- description;
- rarity;
- type/category;
- emoji;
- icon/image URLs;
- primary color;
- trade/sell/use flags;
- max tier or tier policy if applicable.

### Inventory Item

An inventory item is a concrete owned instance of an item template.

Examples:

- `Cow #1` owned by member A;
- `Cow #2` owned by member B;
- `Stick #1` owned by member C;
- `Beginner Case #43` owned by member A.

Instance-level data includes:

- owner member id;
- template id;
- per-template serial number;
- tier;
- quantity/stack state if stackable;
- obtained date;
- original owner;
- instance metadata if needed.

### Item Behavior / Use Effect

A use effect describes what happens when an item is used.

Examples:

- grant application experience;
- grant Discord-guild-specific experience;
- open a case;
- consume a key;
- grant a fixed bundle of items;
- roll a loot table;
- trigger a service action.

Item behavior must not be hardcoded as scattered `if item.name === ...` logic.

### Presentation Metadata

Presentation metadata describes how the item appears in the UI.

Examples:

- emoji;
- icon URL;
- image URL;
- primary color;
- rarity color;
- badge/accent labels.

Presentation metadata must not be confused with website theme tokens. Item color is item identity color; the frontend theme decides how to render it safely.

## 3. Level Systems

Balkon needs at least two distinct level domains.

### Global Application Level

This is the member's overall app-level progression.

It should be visible on the website as the user's general account/profile progression.

Potential future ownership:

- `MemberProgressionService`
- `MemberProgressionRepository`

Possible data direction:

- global experience;
- global level;
- total earned experience;
- progression events/history later if needed.

### Discord Guild Level

This is server-specific progression.

Each Discord guild/server may have separate level state for the same user.

It should be visible on the website when the user selects a server/guild context.

Potential future ownership:

- `GuildMemberProgressionService`
- `GuildMemberProgressionRepository`

Possible data direction:

- guild id;
- member id;
- guild-specific experience;
- guild-specific level;
- message/activity reward metadata;
- anti-spam/cooldown metadata.

### Item Use and Levels

Experience potions or progression items must explicitly specify which progression domain they affect.

Do not use vague effects such as `grant_level` without a target domain.

Better effect examples:

```json
{
  "effectType": "grant_global_experience",
  "payload": {
    "amount": 500,
    "reason": "item_use"
  }
}
```

```json
{
  "effectType": "grant_guild_experience",
  "payload": {
    "amount": 250,
    "requiresSelectedGuild": true,
    "reason": "item_use"
  }
}
```

Using an item that affects guild level must require an explicit guild context and backend authorization/validation.

## 4. Cases, Keys, Potions, And Bundles

### Cases

A case is an inventory item whose use effect rolls a loot table.

A case may optionally require a key item.

Expected behavior:

- user owns the case;
- user owns the required key if one is configured;
- backend consumes the case and key transactionally if needed;
- backend rolls the loot table;
- backend grants resulting inventory item(s);
- backend returns the result;
- backend records audit/history later when that system exists.

Opening a case must be API-driven and transaction-safe. It must not rely on manual database changes.

### Keys

A key is an item template that can be consumed by specific case-opening effects.

Keys should be normal inventory items so they display in the inventory and can participate in trade/sell/consume rules as configured.

### Experience Potions

An XP potion is an inventory item with a use effect that grants experience to a specific progression domain.

Examples:

- global app XP potion;
- selected Discord guild XP potion;
- possibly future event/battle-pass XP potion if such domain exists.

The item must display in inventory like a normal item, but usage must go through strict backend API validation.

### Bundles

A bundle is an inventory item with a deterministic grant effect.

Example:

```json
{
  "effectType": "grant_item_bundle",
  "payload": {
    "items": [
      { "itemTemplateId": 10, "amount": 1 },
      { "itemTemplateId": 11, "amount": 3 }
    ]
  }
}
```

Bundles are different from cases:

- bundle = deterministic contents;
- case = random loot table.

## 5. Upgrade System Direction

The upgrade system is intentionally not designed as a simple `upgrade_material` field.

That would be too rigid and would likely create a broken one-off abstraction.

Future item upgrades should be designed as a separate system, likely with its own API and UI flow.

Possible user flow:

1. user opens an upgrade page/tab;
2. user selects an inventory item to upgrade;
3. backend checks whether the item is upgradeable;
4. backend calculates cost/chance/material requirements according to configured rules;
5. user confirms upgrade attempt;
6. backend performs the attempt transactionally;
7. backend updates item tier/state and consumes required resources/items/currency;
8. backend returns result.

Potential future ownership:

- `ItemUpgradeService`
- `ItemUpgradeRepository`
- `ItemUpgradeRuleRepository`

Potential concepts:

- upgrade rule;
- max tier;
- tier transition;
- required currency;
- required item inputs;
- success chance;
- failure behavior;
- downgrade/break protection rules;
- audit/history.

Do not implement upgrade behavior by adding one vague column and hardcoding upgrade logic inside `ItemService`.

## 6. Serial Numbering

There are two different ids:

### Template ID

The global database id for the item template.

Example:

- `items.id = 1` means `Cow`;
- `items.id = 2` means `Stick`.

This id must remain globally unique.

### Inventory Instance Serial Number

The per-template sequence number for owned inventory instances.

Example:

- first owned cow is `Cow #1`;
- second owned cow is `Cow #2`;
- first owned stick is `Stick #1`.

This should be modeled as a separate instance-level serial number, not by resetting template primary keys.

Potential future constraint:

```text
UNIQUE(item_id, serial_number)
```

This allows each item template to have its own visible sequence while preserving normal relational ids.

## 7. Presentation Attributes

Stable presentation fields may include:

- `emoji`;
- `icon_url`;
- `image_url`;
- `primary_color_hex`;
- possibly `secondary_color_hex` later;
- rarity color through rarity ownership.

`primary_color_hex` should mean item identity/accent color, not website theme color.

The frontend may render this differently depending on theme:

- dark theme may use it as glow/border/accent;
- light theme may use it as badge/accent;
- high contrast mode may use a safer fallback.

Do not store separate UI-theme-specific item colors unless there is a strong product reason later.

## 8. Administration And Configurability

Future item configuration should be manageable through backend/admin/API flows.

Avoid a future where adding a case, key, potion, bundle, or upgrade rule requires:

- manual SQL editing;
- direct database writes;
- TypeScript code changes for every new item;
- hardcoded item names or ids in service logic.

Potential future admin capabilities:

- create/edit item templates;
- assign rarity/type;
- configure presentation metadata;
- configure whether an item is usable/consumable/tradeable/sellable;
- configure use effects;
- configure loot tables;
- configure bundle contents;
- configure key requirements for cases;
- configure upgrade rules;
- preview item card rendering;
- disable an item or effect without deleting history.

This does not mean all admin UI must be built immediately. It means the data model and services should not block it.

## 9. Candidate Target Boundaries

Do not put all future item behavior into `ItemService`.

Potential future service/repository split:

```text
ItemCatalogService
  item templates, rarities, types, presentation metadata

InventoryService
  owned inventory items, grants, consumes, transfers, serial numbers

ItemUseService
  validates and executes item use effects

LootTableService
  case rolls and random rewards

ItemBundleService
  deterministic bundle grants

ItemUpgradeService
  upgrade attempts, costs, chances, tier transitions

MarketService
  public listing and purchase orchestration

BotShopService
  bot shop buy/sell flows
```

Potential repositories/read models:

```text
ItemCatalogRepository
InventoryRepository
ItemUseEffectRepository
LootTableRepository
ItemUpgradeRuleRepository
MarketRepository
BotShopRepository
InventoryReadModel
```

These names are direction, not a requirement to create all files immediately.

## 10. Candidate Data Direction

Possible future tables or table changes, subject to inventory and migration design:

```text
items
  id
  slug
  name
  description
  item_type_id
  item_rarity_id
  tradeable
  sellable
  usable
  consumable
  stackable
  max_stack
  max_tier
  emoji
  icon_url
  image_url
  primary_color_hex
  created_at
  updated_at

member_items
  id
  member_id
  item_id
  serial_number
  tier
  quantity
  state
  obtained_at
  original_owner_member_id
  metadata_json

item_use_effects
  id
  item_id
  effect_type
  payload_json
  enabled

loot_tables
  id
  slug
  name
  enabled

loot_table_entries
  id
  loot_table_id
  item_id
  weight
  min_quantity
  max_quantity
  min_tier
  max_tier

item_upgrade_rules
  id
  item_id or item_type_id
  from_tier
  to_tier
  cost_payload_json
  chance_payload_json
  failure_payload_json
  enabled
```

Do not create these tables blindly. This is a direction for design, not an immediate migration list.

## 11. Required Next Step Before Implementation

Before implementing cases, keys, potions, bundles, upgrade attempts, or item serial numbering, create or refresh:

```text
docs/refactor/ITEM_SERVICE_INVENTORY.md
```

It must include:

- all public methods in `ItemService`;
- important private helpers;
- current SQL per method;
- transaction usage;
- current callers;
- response shapes;
- direct balance mutations;
- inventory mutations;
- market/shop/craft dependencies;
- OBS/service-item dependencies;
- current use of `tier`;
- current rarity/type behavior;
- target owner recommendation;
- extraction risk;
- candidate medium slices.

No item-system implementation should start before this inventory unless the touched surface is already proven small and isolated.

## 12. Non-Goals For The Next Slice

Do not immediately implement:

- cases;
- keys;
- potions;
- bundle opening;
- loot tables;
- upgrade attempts;
- upgrade materials;
- serial numbering;
- broad `ItemService` rewrite;
- new item admin UI;
- schema migration for all item concepts.

The next correct step is inventory and design validation, not a feature sprint on top of unclear ownership.

## 13. Senior Guardrails

Reject future item-system patches that:

- add special item behavior by hardcoded item name;
- add special item behavior directly inside route handlers;
- add all use logic to the existing broad `ItemService` without inventory;
- add generic CRUD repositories;
- add one vague `upgrade_material` column as the entire upgrade system;
- add case/key/potion logic without transaction safety;
- consume inventory items without rollback-safe grant behavior;
- require manual SQL for every future item configuration;
- break existing inventory, market, craft, bot-shop, or OBS flows.

The target is a configurable item platform with clear ownership, not a pile of one-off item hacks.
