import dotenv from "dotenv";
import mysql from "mysql2/promise";

const env = process.env.NODE_ENV === "prod" ? ".env.prod" : ".env.dev";
dotenv.config({ path: env });

const demoItems = [
  {
    name: "Iron Scrap",
    description: "Bent metal shards salvaged from broken balcony machinery.",
    type: "material",
    rarity: "common",
    tradeable: true,
    botSellPrice: 2,
  },
  {
    name: "Copper Wire",
    description: "Thin conductive wire used in improvised streamer tech.",
    type: "material",
    rarity: "common",
    tradeable: true,
    botSellPrice: 3,
  },
  {
    name: "Glow Dust",
    description: "Luminous powder that reacts to heat and camera light.",
    type: "material",
    rarity: "common",
    tradeable: true,
    botSellPrice: 4,
  },
  {
    name: "Frost Petal",
    description: "A cold blue petal harvested from rare rooftop flowers.",
    type: "material",
    rarity: "cool",
    tradeable: true,
    botSellPrice: 5,
  },
  {
    name: "Echo Crystal",
    description: "A resonant crystal that stores audio and signal pulses.",
    type: "material",
    rarity: "cool",
    tradeable: true,
    botSellPrice: 6,
  },
  {
    name: "Steam Core",
    description: "A compact energy core built from scrap and improvised wiring.",
    type: "material",
    rarity: "cool",
    tradeable: true,
    botSellPrice: 12,
  },
  {
    name: "Neon Lens",
    description: "A focusing lens that sharpens light into clean neon beams.",
    type: "material",
    rarity: "cool",
    tradeable: true,
    botSellPrice: 14,
  },
  {
    name: "Signal Lantern",
    description: "A service tool that floods the stream with controlled color pulses.",
    type: "service",
    rarity: "exclusive",
    tradeable: true,
    botSellPrice: 30,
  },
  {
    name: "OBS Totem",
    description: "An arcane control focus built to command scenes and overlays.",
    type: "service",
    rarity: "exclusive",
    tradeable: true,
    botSellPrice: 45,
  },
  {
    name: "Balkon Crown",
    description: "A prestige artifact proving mastery over the balcony economy.",
    type: "misc",
    rarity: "exclusive",
    tradeable: true,
    botSellPrice: 80,
  },
];

const botShopListings = [
  { itemName: "Iron Scrap", price: 6 },
  { itemName: "Copper Wire", price: 8 },
  { itemName: "Glow Dust", price: 10 },
  { itemName: "Frost Petal", price: 14 },
  { itemName: "Echo Crystal", price: 18 },
];

const craftRecipes = [
  {
    name: "Forge Steam Core",
    description: "Compress iron and copper into a stable heat battery.",
    resultItemName: "Steam Core",
    resultAmount: 1,
    ingredients: [
      { itemName: "Iron Scrap", amount: 2 },
      { itemName: "Copper Wire", amount: 1 },
    ],
  },
  {
    name: "Polish Neon Lens",
    description: "Refine light-sensitive dust through a crystal prism.",
    resultItemName: "Neon Lens",
    resultAmount: 1,
    ingredients: [
      { itemName: "Glow Dust", amount: 2 },
      { itemName: "Echo Crystal", amount: 1 },
    ],
  },
  {
    name: "Assemble Signal Lantern",
    description: "Combine a stable core with petals and a lens for broadcast signaling.",
    resultItemName: "Signal Lantern",
    resultAmount: 1,
    ingredients: [
      { itemName: "Steam Core", amount: 1 },
      { itemName: "Frost Petal", amount: 2 },
      { itemName: "Neon Lens", amount: 1 },
    ],
  },
  {
    name: "Bind OBS Totem",
    description: "Wrap the lantern signal into a control focus for live production.",
    resultItemName: "OBS Totem",
    resultAmount: 1,
    ingredients: [
      { itemName: "Signal Lantern", amount: 1 },
      { itemName: "Echo Crystal", amount: 2 },
    ],
  },
  {
    name: "Crown Of Balkon",
    description: "The final prestige craft for the full demo loop.",
    resultItemName: "Balkon Crown",
    resultAmount: 1,
    ingredients: [
      { itemName: "OBS Totem", amount: 1 },
      { itemName: "Neon Lens", amount: 1 },
      { itemName: "Glow Dust", amount: 3 },
    ],
  },
];

const serviceBindings = [
  {
    itemName: "Signal Lantern",
    actionType: "set_text",
    sourceName: "stream_alert_text",
    textTemplate: "{streamer}: {custom_text}",
    consumeOnUse: true,
  },
  {
    itemName: "OBS Totem",
    actionType: "media_action",
    sourceName: "stream_alert_media",
    mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART",
    consumeOnUse: true,
  },
  {
    itemName: "Balkon Crown",
    actionType: "switch_scene",
    sceneName: "Balkon Crown",
    consumeOnUse: false,
  },
];

const starterInventory = [
  { itemName: "Iron Scrap", amount: 10 },
  { itemName: "Copper Wire", amount: 6 },
  { itemName: "Glow Dust", amount: 12 },
  { itemName: "Frost Petal", amount: 6 },
  { itemName: "Echo Crystal", amount: 6 },
];

const connection = await mysql.createConnection({
  host: process.env.HOST,
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DATABASE,
  multipleStatements: true,
});

const [typeRows] = await connection.query("SELECT id, name FROM item_types");
const [rarityRows] = await connection.query("SELECT id, name FROM item_rarities");

const typeIdByName = new Map(typeRows.map((row) => [row.name, row.id]));
const rarityIdByName = new Map(rarityRows.map((row) => [row.name, row.id]));

const developerDiscordId = process.env.DEVELOPER_DISCORD_ID?.trim() || null;
let developerMemberId = null;

if (developerDiscordId) {
  await connection.query(
    `INSERT INTO members (ds_member_id, balance, ldm_balance)
     VALUES (?, 250, 0)
     ON DUPLICATE KEY UPDATE balance = GREATEST(balance, 250)`,
    [developerDiscordId],
  );

  const [memberRows] = await connection.query("SELECT id FROM members WHERE ds_member_id = ? LIMIT 1", [developerDiscordId]);
  developerMemberId = memberRows[0]?.id ?? null;
}

const itemIdByName = new Map();

for (const item of demoItems) {
  const typeId = typeIdByName.get(item.type);
  const rarityId = rarityIdByName.get(item.rarity);

  if (!typeId || !rarityId) {
    throw new Error(`Missing item type or rarity for ${item.name}`);
  }

  const [existingRows] = await connection.query("SELECT id FROM items WHERE name = ? ORDER BY id ASC LIMIT 1", [item.name]);
  let itemId = existingRows[0]?.id ?? null;

  if (!itemId) {
    const [insertResult] = await connection.query(
      `INSERT INTO items (
        item_type_id,
        item_rarity_id,
        name,
        description,
        sellable,
        tradeable,
        bot_sell_price,
        created_by_member_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [typeId, rarityId, item.name, item.description, true, item.tradeable, item.botSellPrice, developerMemberId],
    );
    itemId = insertResult.insertId;
  } else {
    await connection.query(
      `UPDATE items
       SET item_type_id = ?, item_rarity_id = ?, description = ?, sellable = ?, tradeable = ?, bot_sell_price = ?, created_by_member_id = ?
       WHERE id = ?`,
      [typeId, rarityId, item.description, true, item.tradeable, item.botSellPrice, developerMemberId, itemId],
    );
  }

  itemIdByName.set(item.name, itemId);
}

for (const listing of botShopListings) {
  const itemId = itemIdByName.get(listing.itemName);
  await connection.query(
    `INSERT INTO item_general_store (item_id, price)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE price = VALUES(price)`,
    [itemId, listing.price],
  );
}

for (const recipe of craftRecipes) {
  const resultItemId = itemIdByName.get(recipe.resultItemName);
  await connection.query(
    `INSERT INTO craft_recipes (name, description, result_item_id, result_amount, created_by_member_id)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE description = VALUES(description), result_item_id = VALUES(result_item_id), result_amount = VALUES(result_amount), created_by_member_id = VALUES(created_by_member_id)`,
    [recipe.name, recipe.description, resultItemId, recipe.resultAmount, developerMemberId],
  );

  const [recipeRows] = await connection.query("SELECT id FROM craft_recipes WHERE name = ? LIMIT 1", [recipe.name]);
  const recipeId = recipeRows[0].id;
  await connection.query("DELETE FROM craft_recipe_ingredients WHERE craft_recipe_id = ?", [recipeId]);

  for (const ingredient of recipe.ingredients) {
    const ingredientItemId = itemIdByName.get(ingredient.itemName);
    await connection.query(
      `INSERT INTO craft_recipe_ingredients (craft_recipe_id, item_id, amount)
       VALUES (?, ?, ?)`,
      [recipeId, ingredientItemId, ingredient.amount],
    );
  }
}

for (const binding of serviceBindings) {
  const itemId = itemIdByName.get(binding.itemName);
  await connection.query(
    `INSERT INTO item_service_actions (
      item_id,
      action_type,
      scene_name,
      source_name,
      text_template,
      media_action,
      visible,
      consume_on_use,
      updated_by_member_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      action_type = VALUES(action_type),
      scene_name = VALUES(scene_name),
      source_name = VALUES(source_name),
      text_template = VALUES(text_template),
      media_action = VALUES(media_action),
      visible = VALUES(visible),
      consume_on_use = VALUES(consume_on_use),
      updated_by_member_id = VALUES(updated_by_member_id),
      updated_at = CURRENT_TIMESTAMP`,
    [
      itemId,
      binding.actionType,
      binding.sceneName ?? null,
      binding.sourceName ?? null,
      binding.textTemplate ?? null,
      binding.mediaAction ?? null,
      binding.visible ?? null,
      binding.consumeOnUse,
      developerMemberId,
    ],
  );
}

if (developerMemberId) {
  for (const entry of starterInventory) {
    const itemId = itemIdByName.get(entry.itemName);
    const [countRows] = await connection.query(
      "SELECT COUNT(*) AS count FROM member_items WHERE member_id = ? AND item_id = ?",
      [developerMemberId, itemId],
    );
    const currentCount = Number(countRows[0].count ?? 0);
    const toInsert = Math.max(0, entry.amount - currentCount);

    if (toInsert > 0) {
      const values = Array.from({ length: toInsert }, () => [developerMemberId, itemId, 1, new Date(), developerMemberId]);
      await connection.query(
        `INSERT INTO member_items (member_id, item_id, tier, obtained_at, original_owner_member_id)
         VALUES ?`,
        [values],
      );
    }
  }
}

const [summaryRows] = await connection.query(`
  SELECT
    (SELECT COUNT(*) FROM items WHERE name IN (${demoItems.map(() => "?").join(", ")})) AS demo_items,
    (SELECT COUNT(*) FROM craft_recipes WHERE name IN (${craftRecipes.map(() => "?").join(", ")})) AS demo_recipes,
    (SELECT COUNT(*) FROM item_general_store WHERE item_id IN (${botShopListings.map(() => "?").join(", ")})) AS demo_shop_listings,
    (SELECT COUNT(*) FROM item_service_actions WHERE item_id IN (${serviceBindings.map(() => "?").join(", ")})) AS demo_service_bindings
`, [
  ...demoItems.map((item) => item.name),
  ...craftRecipes.map((recipe) => recipe.name),
  ...botShopListings.map((listing) => itemIdByName.get(listing.itemName)),
  ...serviceBindings.map((binding) => itemIdByName.get(binding.itemName)),
]);

console.log(JSON.stringify({
  database: process.env.DATABASE,
  developerSeeded: Boolean(developerMemberId),
  summary: summaryRows[0],
}, null, 2));

await connection.end();
