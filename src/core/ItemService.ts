import { ResultSetHeader, RowDataPacket } from "mysql2";
import { PoolConnection } from "mysql2/promise";
import pool from "../db.js";
import { DataBaseHandler, DBResponse, DBResponseSuccess } from "./DataBaseHandler.js";
import { NotificationService } from "./NotificationService.js";
import { CraftRecipeIngredientsDB, CraftRecipesDB, ItemGeneralStoreDB, ItemPublicMarketDB, ItemRaritiesDB, ItemsDB, ItemTypesDB, MemberItemsDB, MembersDB } from "../types/database.types.js";

interface ItemTemplateRow extends RowDataPacket {
    id: number;
    name: string;
    description: string;
    emoji: string | null;
    image_url: string | null;
    tradeable: number;
    sellable: number;
    bot_sell_price: number | null;
    item_type_name: string;
    rarity_name: string;
    rarity_color_hex: string | null;
}

interface InventoryRow extends RowDataPacket {
    inventory_item_id: number;
    owner_member_id: number;
    owner_ds_member_id: string;
    original_owner_member_id: number | null;
    original_owner_ds_member_id: string | null;
    obtained_at: Date;
    tier: number;
    item_template_id: number;
    item_name: string;
    item_description: string;
    item_emoji: string | null;
    image_url: string | null;
    tradeable: number;
    sellable: number;
    bot_sell_price: number | null;
    item_type_name: string;
    rarity_name: string;
    rarity_color_hex: string | null;
}

interface PublicMarketRow extends RowDataPacket {
    listing_id: number;
    price: number;
    seller_ds_member_id: string;
    inventory_item_id: number;
    original_owner_ds_member_id: string | null;
    obtained_at: Date;
    tier: number;
    item_template_id: number;
    item_name: string;
    item_description: string;
    item_emoji: string | null;
    image_url: string | null;
    tradeable: number;
    sellable: number;
    bot_sell_price: number | null;
    item_type_name: string;
    rarity_name: string;
    rarity_color_hex: string | null;
}

interface BotShopRow extends RowDataPacket {
    listing_id: number;
    price: number;
    item_template_id: number;
    item_name: string;
    item_description: string;
    item_emoji: string | null;
    image_url: string | null;
    tradeable: number;
    sellable: number;
    bot_sell_price: number | null;
    item_type_name: string;
    rarity_name: string;
    rarity_color_hex: string | null;
}

interface CraftRecipeRow extends RowDataPacket {
    recipe_id: number;
    recipe_name: string;
    recipe_description: string | null;
    result_amount: number;
    result_item_id: number;
    result_item_name: string;
    result_item_emoji: string | null;
    result_rarity_name: string;
}

interface CraftRecipeIngredientRow extends RowDataPacket {
    ingredient_item_id: number;
    ingredient_item_name: string;
    ingredient_item_emoji: string | null;
    ingredient_amount: number;
}

export interface ItemRarityView {
    id: number;
    name: string;
    colorHex: string | null;
}

export interface InventoryItemView {
    inventoryItemId: number;
    ownerDiscordId: string;
    originalOwnerDiscordId: string | null;
    obtainedAt: Date;
    tier: number;
    itemTemplateId: number;
    name: string;
    description: string;
    emoji: string | null;
    imageUrl: string | null;
    tradeable: boolean;
    sellable: boolean;
    botSellPrice: number | null;
    itemType: string;
    rarityName: string;
    rarityColorHex: string | null;
}

export interface PublicMarketListingView extends InventoryItemView {
    listingId: number;
    sellerDiscordId: string;
    price: number;
}

export interface BotShopListingView {
    listingId: number;
    price: number;
    itemTemplateId: number;
    name: string;
    description: string;
    emoji: string | null;
    imageUrl: string | null;
    tradeable: boolean;
    sellable: boolean;
    botSellPrice: number | null;
    itemType: string;
    rarityName: string;
    rarityColorHex: string | null;
}

export interface AutocompleteOption {
    name: string;
    value: string | number;
}

export interface ItemTemplateView {
    id: number;
    name: string;
    description: string;
    emoji: string | null;
    imageUrl: string | null;
    tradeable: boolean;
    sellable: boolean;
    botSellPrice: number | null;
    itemType: string;
    rarityName: string;
    rarityColorHex: string | null;
}

export interface CraftRecipeIngredientView {
    itemTemplateId: number;
    name: string;
    emoji: string | null;
    amount: number;
}

export interface CraftRecipeView {
    recipeId: number;
    name: string;
    description: string | null;
    resultAmount: number;
    resultItemTemplateId: number;
    resultName: string;
    resultEmoji: string | null;
    resultRarityName: string;
    ingredients: CraftRecipeIngredientView[];
}

export interface CraftExecutionItemView {
    itemTemplateId: number;
    name: string;
    emoji: string | null;
    amount: number;
}

export interface CraftExecutionResult {
    recipeId: number;
    craftedItems: CraftExecutionItemView[];
    consumedItems: CraftExecutionItemView[];
    message: string;
}

export interface AdminGrantItemResult {
    memberId: number;
    memberDiscordId: string;
    itemId: number;
    itemName: string;
    quantity: number;
    tier: number;
}

export class ItemService {
    private static instance: ItemService;

    static getInstance(): ItemService {
        if (!ItemService.instance) {
            ItemService.instance = new ItemService();
        }

        return ItemService.instance;
    }

    async ensureMemberByDiscordId(discordId: string): Promise<DBResponseSuccess<MembersDB>> {
        const existsResponse = await DataBaseHandler.getInstance().isMemberExists(discordId, true);
        if (DataBaseHandler.isFail(existsResponse) || !existsResponse.data.memberId) {
            throw new Error("Unable to create or load member.");
        }

        const memberResponse = await DataBaseHandler.getInstance().getFromTable<MembersDB>("members", { id: existsResponse.data.memberId });
        if (DataBaseHandler.isFail(memberResponse) || !memberResponse.data.length) {
            throw new Error("Member record not found after sync.");
        }

        return {
            success: true,
            data: memberResponse.data[0],
        };
    }

    async createRarity(name: string, colorHex?: string): Promise<DBResponse<{ insertId: number }>> {
        try {
            const normalizedName = this.normalizeRequiredText(name, "Rarity name").toLowerCase();
            const normalizedColorHex = this.normalizeColorHex(colorHex);
            const existing = await DataBaseHandler.getInstance().getFromTable<ItemRaritiesDB>("item_rarities", { name: normalizedName });
            if (DataBaseHandler.isSuccess(existing) && existing.data.length) {
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "item_rarities",
                        message: "Rarity already exists.",
                    },
                };
            }

            return await DataBaseHandler.getInstance().addRecords<ItemRaritiesDB>([{
                id: 0,
                name: normalizedName,
                color_hex: normalizedColorHex,
            }], "item_rarities");
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async listRarities(): Promise<DBResponse<ItemRarityView[]>> {
        try {
            const [rows] = await pool.query<RowDataPacket[]>(
                `SELECT id, name, color_hex FROM item_rarities ORDER BY id DESC`
            );

            return {
                success: true,
                data: rows.map(row => ({
                    id: Number(row.id),
                    name: String(row.name),
                    colorHex: row.color_hex === null ? null : String(row.color_hex),
                })),
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async updateRarity(rarityId: number, input: { name: string; colorHex?: string | null }): Promise<DBResponse<{ rarityId: number }>> {
        try {
            const normalizedName = this.normalizeRequiredText(input.name, "Rarity name").toLowerCase();
            const normalizedColorHex = this.normalizeColorHex(input.colorHex ?? undefined);

            const rarityResponse = await DataBaseHandler.getInstance().getFromTable<ItemRaritiesDB>("item_rarities", { id: rarityId });
            if (DataBaseHandler.isFail(rarityResponse) || !rarityResponse.data.length) {
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "item_rarities",
                        message: "Rarity not found.",
                    },
                };
            }

            const [duplicateRows] = await pool.query<RowDataPacket[]>(
                `SELECT id FROM item_rarities WHERE name = ? AND id <> ? LIMIT 1`,
                [normalizedName, rarityId]
            );
            if (duplicateRows.length) {
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "item_rarities",
                        message: "Another rarity with this name already exists.",
                    },
                };
            }

            await pool.query(
                `UPDATE item_rarities SET name = ?, color_hex = ? WHERE id = ?`,
                [normalizedName, normalizedColorHex, rarityId]
            );

            return { success: true, data: { rarityId } };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async deleteRarity(rarityId: number): Promise<DBResponse<{ rarityId: number }>> {
        try {
            const [usageRows] = await pool.query<RowDataPacket[]>(
                `SELECT
                    (SELECT COUNT(*) FROM items WHERE item_rarity_id = ?) AS usage_count
                 `,
                [rarityId]
            );

            if (Number(usageRows[0]?.usage_count ?? 0) > 0) {
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "item_rarities",
                        message: "Rarity is still used by item templates.",
                    },
                };
            }

            const [result] = await pool.query<ResultSetHeader>(
                `DELETE FROM item_rarities WHERE id = ?`,
                [rarityId]
            );

            if (!result.affectedRows) {
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "item_rarities",
                        message: "Rarity not found.",
                    },
                };
            }

            return { success: true, data: { rarityId } };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async searchRarities(query: string): Promise<DBResponse<AutocompleteOption[]>> {
        try {
            const [rows] = await pool.query<RowDataPacket[]>(
                `SELECT id, name FROM item_rarities WHERE name LIKE ? ORDER BY name ASC LIMIT 25`,
                [`%${query}%`]
            );

            return {
                success: true,
                data: rows.map(row => ({
                    name: String(row.name),
                    value: String(row.name),
                })),
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async searchItemTypes(query: string): Promise<DBResponse<AutocompleteOption[]>> {
        try {
            const [rows] = await pool.query<RowDataPacket[]>(
                `SELECT id, name FROM item_types WHERE name LIKE ? ORDER BY name ASC LIMIT 25`,
                [`%${query}%`]
            );

            return {
                success: true,
                data: rows.map(row => ({
                    name: String(row.name),
                    value: String(row.name),
                })),
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async searchItemTemplates(query: string): Promise<DBResponse<AutocompleteOption[]>> {
        try {
            const [rows] = await pool.query<RowDataPacket[]>(
                `SELECT id, name FROM items WHERE name LIKE ? ORDER BY id DESC LIMIT 25`,
                [`%${query}%`]
            );

            return {
                success: true,
                data: rows.map(row => ({
                    name: `#${row.id} ${row.name}`,
                    value: Number(row.id),
                })),
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async searchUserInventory(discordUserId: string, query: string): Promise<DBResponse<AutocompleteOption[]>> {
        try {
            const [rows] = await pool.query<RowDataPacket[]>(
                `SELECT
                    mi.id,
                    i.name
                 FROM member_items AS mi
                 INNER JOIN members AS m ON m.id = mi.member_id
                 INNER JOIN items AS i ON i.id = mi.item_id
                 WHERE m.ds_member_id = ? AND (CAST(mi.id AS CHAR) LIKE ? OR i.name LIKE ? OR COALESCE(i.emoji, '') LIKE ?)
                 ORDER BY mi.id DESC
                 LIMIT 25`,
                [discordUserId, `%${query}%`, `%${query}%`, `%${query}%`]
            );

            return {
                success: true,
                data: rows.map(row => ({
                    name: `#${row.id} ${row.name}`,
                    value: Number(row.id),
                })),
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async searchPublicListings(query: string): Promise<DBResponse<AutocompleteOption[]>> {
        try {
            const [rows] = await pool.query<RowDataPacket[]>(
                `SELECT
                    ipm.id,
                    i.name,
                    ipm.price
                 FROM item_public_market AS ipm
                 INNER JOIN member_items AS mi ON mi.id = ipm.member_item_id
                 INNER JOIN items AS i ON i.id = mi.item_id
                 WHERE CAST(ipm.id AS CHAR) LIKE ? OR i.name LIKE ?
                 ORDER BY ipm.id DESC
                 LIMIT 25`,
                [`%${query}%`, `%${query}%`]
            );

            return {
                success: true,
                data: rows.map(row => ({
                    name: `#${row.id} ${row.name} (${row.price} ODM)`,
                    value: Number(row.id),
                })),
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async searchUserPublicListings(discordUserId: string, query: string): Promise<DBResponse<AutocompleteOption[]>> {
        try {
            const response = await this.listUserPublicMarket(discordUserId);
            if (!response.success) {
                return response;
            }

            const normalizedQuery = query.trim().toLowerCase();
            const filtered = response.data
                .filter(item => {
                    if (!normalizedQuery) {
                        return true;
                    }

                    return String(item.listingId).includes(normalizedQuery)
                        || item.name.toLowerCase().includes(normalizedQuery)
                        || (item.emoji ?? "").includes(normalizedQuery);
                })
                .slice(0, 25);

            return {
                success: true,
                data: filtered.map(item => ({
                    name: `#${item.listingId} ${item.name} (${item.price} ODM)`,
                    value: Number(item.listingId),
                })),
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async searchBotShopListings(query: string): Promise<DBResponse<AutocompleteOption[]>> {
        try {
            const [rows] = await pool.query<RowDataPacket[]>(
                `SELECT
                    igs.id,
                    i.name,
                    igs.price
                 FROM item_general_store AS igs
                 INNER JOIN items AS i ON i.id = igs.item_id
                 WHERE CAST(igs.id AS CHAR) LIKE ? OR i.name LIKE ?
                 ORDER BY igs.id DESC
                 LIMIT 25`,
                [`%${query}%`, `%${query}%`]
            );

            return {
                success: true,
                data: rows.map(row => ({
                    name: `#${row.id} ${row.name} (${row.price} ODM)`,
                    value: Number(row.id),
                })),
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async searchCraftRecipes(query: string): Promise<DBResponse<AutocompleteOption[]>> {
        try {
            const [rows] = await pool.query<RowDataPacket[]>(
                `SELECT id, name FROM craft_recipes WHERE CAST(id AS CHAR) LIKE ? OR name LIKE ? ORDER BY id DESC LIMIT 25`,
                [`%${query}%`, `%${query}%`]
            );

            return {
                success: true,
                data: rows.map(row => ({
                    name: `#${row.id} ${row.name}`,
                    value: Number(row.id),
                })),
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async ensureItemType(typeName: string): Promise<DBResponseSuccess<ItemTypesDB>> {
        const normalizedName = this.normalizeRequiredText(typeName, "Item type").toLowerCase();
        const existing = await DataBaseHandler.getInstance().getFromTable<ItemTypesDB>("item_types", { name: normalizedName });
        if (DataBaseHandler.isSuccess(existing) && existing.data.length) {
            return {
                success: true,
                data: existing.data[0],
            };
        }

        const insertResponse = await DataBaseHandler.getInstance().addRecords<ItemTypesDB>([{
            id: 0,
            name: normalizedName,
        }], "item_types");

        if (DataBaseHandler.isFail(insertResponse)) {
            throw new Error(insertResponse.error.message ?? "Unable to create item type.");
        }

        return {
            success: true,
            data: {
                id: insertResponse.data.insertId,
                name: normalizedName,
            },
        };
    }

    async createItemTemplate(input: {
        name: string;
        description: string;
        emoji?: string | null;
        imageUrl?: string | null;
        rarityName: string;
        typeName: string;
        tradeable: boolean;
        botSellPrice?: number | null;
        createdByDiscordId: string;
    }): Promise<DBResponse<{ insertId: number }>> {
        try {
            const normalizedRarityName = this.normalizeRequiredText(input.rarityName, "Rarity").toLowerCase();
            const normalizedName = this.normalizeRequiredText(input.name, "Item name");
            const normalizedDescription = this.normalizeRequiredText(input.description, "Item description");
            const normalizedImageUrl = this.normalizeImageUrl(input.imageUrl);
            const normalizedEmoji = this.normalizeOptionalText(input.emoji);
            const normalizedBotSellPrice = this.normalizeBotSellPrice(input.botSellPrice);

            const rarityResponse = await DataBaseHandler.getInstance().getFromTable<ItemRaritiesDB>("item_rarities", {
                name: normalizedRarityName,
            });
            if (DataBaseHandler.isFail(rarityResponse) || !rarityResponse.data.length) {
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "item_rarities",
                        message: "Rarity not found.",
                    },
                };
            }

            const typeResponse = await this.ensureItemType(input.typeName);
            const creator = await this.ensureMemberByDiscordId(input.createdByDiscordId);

            return await DataBaseHandler.getInstance().addRecords<ItemsDB>([{
                id: 0,
                item_type_id: typeResponse.data.id,
                item_rarity_id: rarityResponse.data[0].id,
                name: normalizedName,
                description: normalizedDescription,
                emoji: normalizedEmoji,
                added_at: new Date(),
                sellable: normalizedBotSellPrice !== null,
                tradeable: input.tradeable,
                image_url: normalizedImageUrl,
                bot_sell_price: normalizedBotSellPrice,
                created_by_member_id: creator.data.id,
            }], "items");
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async updateItemTemplate(itemTemplateId: number, input: {
        name: string;
        description: string;
        emoji?: string | null;
        imageUrl?: string | null;
        rarityName: string;
        typeName: string;
        tradeable: boolean;
        botSellPrice?: number | null;
    }): Promise<DBResponse<{ itemTemplateId: number }>> {
        try {
            const normalizedRarityName = this.normalizeRequiredText(input.rarityName, "Rarity").toLowerCase();
            const normalizedName = this.normalizeRequiredText(input.name, "Item name");
            const normalizedDescription = this.normalizeRequiredText(input.description, "Item description");
            const normalizedImageUrl = this.normalizeImageUrl(input.imageUrl);
            const normalizedEmoji = this.normalizeOptionalText(input.emoji);
            const normalizedBotSellPrice = this.normalizeBotSellPrice(input.botSellPrice);

            const templateResponse = await DataBaseHandler.getInstance().getFromTable<ItemsDB>("items", { id: itemTemplateId });
            if (DataBaseHandler.isFail(templateResponse) || !templateResponse.data.length) {
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "items",
                        message: "Item template not found.",
                    },
                };
            }

            const rarityResponse = await DataBaseHandler.getInstance().getFromTable<ItemRaritiesDB>("item_rarities", {
                name: normalizedRarityName,
            });
            if (DataBaseHandler.isFail(rarityResponse) || !rarityResponse.data.length) {
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "item_rarities",
                        message: "Rarity not found.",
                    },
                };
            }

            const typeResponse = await this.ensureItemType(input.typeName);

            await pool.query(
                `UPDATE items
                 SET item_type_id = ?, item_rarity_id = ?, name = ?, description = ?, emoji = ?, sellable = ?, tradeable = ?, image_url = ?, bot_sell_price = ?
                 WHERE id = ?`,
                [
                    typeResponse.data.id,
                    rarityResponse.data[0].id,
                    normalizedName,
                    normalizedDescription,
                    normalizedEmoji,
                    normalizedBotSellPrice !== null,
                    input.tradeable,
                    normalizedImageUrl,
                    normalizedBotSellPrice,
                    itemTemplateId,
                ]
            );

            return { success: true, data: { itemTemplateId } };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async deleteItemTemplate(itemTemplateId: number): Promise<DBResponse<{ itemTemplateId: number }>> {
        try {
            const [usageRows] = await pool.query<RowDataPacket[]>(
                `SELECT
                    (SELECT COUNT(*) FROM member_items WHERE item_id = ?) AS inventory_usage,
                    (SELECT COUNT(*) FROM item_general_store WHERE item_id = ?) AS store_usage,
                    (SELECT COUNT(*) FROM craft_recipes WHERE result_item_id = ?) AS recipe_result_usage,
                    (SELECT COUNT(*) FROM craft_recipe_ingredients WHERE item_id = ?) AS recipe_ingredient_usage,
                    (SELECT COUNT(*) FROM item_service_actions WHERE item_id = ?) AS action_usage`,
                [itemTemplateId, itemTemplateId, itemTemplateId, itemTemplateId, itemTemplateId]
            );

            const usage = usageRows[0];
            const totalUsage = Number(usage?.inventory_usage ?? 0)
                + Number(usage?.store_usage ?? 0)
                + Number(usage?.recipe_result_usage ?? 0)
                + Number(usage?.recipe_ingredient_usage ?? 0)
                + Number(usage?.action_usage ?? 0);

            if (totalUsage > 0) {
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "items",
                        message: "Item template is still used in inventory, shop, recipes, or service actions.",
                    },
                };
            }

            const [result] = await pool.query<ResultSetHeader>(
                `DELETE FROM items WHERE id = ?`,
                [itemTemplateId]
            );

            if (!result.affectedRows) {
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "items",
                        message: "Item template not found.",
                    },
                };
            }

                        relatedTo: "members",
                        message: "Member not found.",
                    },
                };
            }

            await pool.query(
                `UPDATE members SET is_admin = 1 WHERE id = ?`,
                [existing.id]
            );

            return {
                success: true,
                data: {
                    memberId: existing.id,
                },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async executeCraft(discordUserId: string, recipeId: number, craftCount: number): Promise<DBResponse<{ crafted: number; resultItemTemplateId: number; resultAmount: number }>> {
        let connection: PoolConnection | null = null;

        try {
            const normalizedCraftCount = this.normalizePositiveInteger(craftCount, "Craft amount");
            connection = await pool.getConnection();
            await connection.beginTransaction();

            const [recipeRows] = await connection.query<CraftRecipeRow[]>(
                `SELECT
                    cr.id AS recipe_id,
                    cr.name AS recipe_name,
                    cr.description AS recipe_description,
                    cr.result_amount,
                    i.id AS result_item_id,
                    i.name AS result_item_name,
                    i.emoji AS result_item_emoji,
                    ir.name AS result_rarity_name
                 FROM craft_recipes AS cr
                 INNER JOIN items AS i ON i.id = cr.result_item_id
                 INNER JOIN item_rarities AS ir ON ir.id = i.item_rarity_id
                 WHERE cr.id = ?
                 LIMIT 1
                 FOR UPDATE`,
                [recipeId]
            );

            if (!recipeRows.length) {
                await connection.rollback();
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "craft_recipes",
                        message: "Craft recipe not found.",
                    },
                };
            }

            const [ingredientRows] = await connection.query<CraftRecipeIngredientRow[]>(
                `SELECT
                    cri.item_id AS ingredient_item_id,
                    i.name AS ingredient_item_name,
                    i.emoji AS ingredient_item_emoji,
                    cri.amount AS ingredient_amount
                 FROM craft_recipe_ingredients AS cri
                 INNER JOIN items AS i ON i.id = cri.item_id
                 WHERE cri.craft_recipe_id = ?
                 ORDER BY cri.id ASC`,
                [recipeId]
            );

            if (!ingredientRows.length) {
                await connection.rollback();
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "craft_recipe_ingredients",
                        message: "Craft recipe has no ingredients.",
                    },
                };
            }

            const member = await this.ensureMemberByDiscordId(discordUserId);
            const [inventoryRows] = await connection.query<RowDataPacket[]>(
                `SELECT mi.id, mi.item_id
                 FROM member_items AS mi
                 WHERE mi.member_id = ?
                 ORDER BY mi.id ASC
                 FOR UPDATE`,
                [member.data.id]
            );

            const inventoryByTemplate = new Map<number, number[]>();
            for (const row of inventoryRows) {
                const itemId = Number(row.item_id);
                const existing = inventoryByTemplate.get(itemId) ?? [];
                existing.push(Number(row.id));
                inventoryByTemplate.set(itemId, existing);
            }

            const memberItemIdsToConsume: number[] = [];
            for (const ingredient of ingredientRows) {
                const requiredAmount = Number(ingredient.ingredient_amount) * normalizedCraftCount;
                const availableIds = inventoryByTemplate.get(Number(ingredient.ingredient_item_id)) ?? [];
                if (availableIds.length < requiredAmount) {
                    await connection.rollback();
                    return {
                        success: false,
                        error: {
                            reason: "unknown",
                            relatedTo: "member_items",
                            message: `Not enough ${ingredient.ingredient_item_name} to craft this recipe.`,
                        },
                    };
                }

                memberItemIdsToConsume.push(...availableIds.slice(0, requiredAmount));
            }

            if (memberItemIdsToConsume.length) {
                await connection.query(
                    `DELETE FROM item_public_market WHERE member_item_id IN (${memberItemIdsToConsume.map(() => "?").join(", ")})`,
                    memberItemIdsToConsume
                );
                await connection.query(
                    `DELETE FROM member_items WHERE id IN (${memberItemIdsToConsume.map(() => "?").join(", ")})`,
                    memberItemIdsToConsume
                );
            }

            const producedAmount = Number(recipeRows[0].result_amount) * normalizedCraftCount;
            const producedValues = Array.from({ length: producedAmount }, () => [
                member.data.id,
                recipeRows[0].result_item_id,
                1,
                new Date(),
                member.data.id,
            ]);

            await connection.query<ResultSetHeader>(
                `INSERT INTO member_items (member_id, item_id, tier, obtained_at, original_owner_member_id) VALUES ?`,
                [producedValues]
            );

            await connection.commit();
            return {
                success: true,
                data: {
                    crafted: normalizedCraftCount,
                    resultItemTemplateId: recipeRows[0].result_item_id,
                    resultAmount: producedAmount,
                },
            };
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            return DataBaseHandler.errorHandling(error);
        } finally {
            connection?.release();
        }
    }

    async findMemberByDiscordId(discordId: string): Promise<DBResponse<MembersDB | null>> {
        try {
            const existing = await this.findExistingMemberByDiscordId(discordId);
            return {
                success: true,
                data: existing,
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async findMemberById(memberId: number): Promise<DBResponse<MembersDB | null>> {
        try {
            const existing = await this.findExistingMemberById(memberId);
            return {
                success: true,
                data: existing,
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    private async findExistingMemberById(memberId: number): Promise<MembersDB | null> {
        const [rows] = await pool.query<MembersDB[]>(
            `SELECT * FROM members WHERE id = ? LIMIT 1`,
            [memberId]
        );

        return rows[0] ?? null;
    }

    private async findExistingMemberByDiscordId(discordId: string): Promise<MembersDB | null> {
        const [rows] = await pool.query<MembersDB[]>(
            `SELECT * FROM members WHERE ds_member_id = ? LIMIT 1`,
            [discordId]
        );

        return rows[0] ?? null;
    }

        return Array.from(aggregatedIngredients.entries()).map(([itemTemplateId, amount]) => ({ itemTemplateId, amount }));
    }
}

export const itemService = ItemService.getInstance();
