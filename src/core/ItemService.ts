import { ResultSetHeader, RowDataPacket } from "mysql2";
import { PoolConnection } from "mysql2/promise";
import pool from "../db.js";
import { DataBaseHandler, DBResponse, DBResponseSuccess } from "./DataBaseHandler.js";
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
                `SELECT COUNT(*) AS usage_count FROM items WHERE item_rarity_id = ?`,
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

            return { success: true, data: { itemTemplateId } };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async giveItemToMember(itemTemplateId: number, targetDiscordId: string, amount: number): Promise<DBResponse<{ inserted: number }>> {
        try {
            if (!Number.isInteger(amount) || amount <= 0) {
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "member_items",
                        message: "Amount must be a positive integer.",
                    },
                };
            }

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

            const target = await this.ensureMemberByDiscordId(targetDiscordId);
            const records: MemberItemsDB[] = Array.from({ length: amount }, () => ({
                id: 0,
                member_id: target.data.id,
                item_id: itemTemplateId,
                tier: 1,
                obtained_at: new Date(),
                original_owner_member_id: target.data.id,
            }));

            const insertResponse = await DataBaseHandler.getInstance().addRecords<MemberItemsDB>(records, "member_items");
            if (DataBaseHandler.isFail(insertResponse)) {
                return insertResponse;
            }

            return {
                success: true,
                data: {
                    inserted: amount,
                },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async createCraftRecipe(input: {
        name: string;
        description?: string | null;
        resultItemTemplateId: number;
        resultAmount: number;
        ingredients: Array<{ itemTemplateId: number; amount: number }>;
        createdByDiscordId: string;
    }): Promise<DBResponse<{ recipeId: number }>> {
        let connection: PoolConnection | null = null;

        try {
            const recipeName = this.normalizeRequiredText(input.name, "Recipe name");
            const recipeDescription = this.normalizeOptionalText(input.description);
            const resultAmount = this.normalizePositiveInteger(input.resultAmount, "Result amount");
            const normalizedIngredients = this.normalizeCraftIngredients(input.ingredients);

            const creator = await this.ensureMemberByDiscordId(input.createdByDiscordId);
            const resultItemResponse = await DataBaseHandler.getInstance().getFromTable<ItemsDB>("items", { id: input.resultItemTemplateId });
            if (DataBaseHandler.isFail(resultItemResponse) || !resultItemResponse.data.length) {
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "items",
                        message: "Result item template not found.",
                    },
                };
            }

            for (const ingredient of normalizedIngredients) {
                const ingredientResponse = await DataBaseHandler.getInstance().getFromTable<ItemsDB>("items", { id: ingredient.itemTemplateId });
                if (DataBaseHandler.isFail(ingredientResponse) || !ingredientResponse.data.length) {
                    return {
                        success: false,
                        error: {
                            reason: "record_not_found",
                            relatedTo: "items",
                            message: `Ingredient item template #${ingredient.itemTemplateId} not found.`,
                        },
                    };
                }
            }

            connection = await pool.getConnection();
            await connection.beginTransaction();

            const [existingRows] = await connection.query<RowDataPacket[]>(
                `SELECT id FROM craft_recipes WHERE name = ? LIMIT 1 FOR UPDATE`,
                [recipeName]
            );
            if (existingRows.length) {
                await connection.rollback();
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "craft_recipes",
                        message: "Craft recipe with this name already exists.",
                    },
                };
            }

            const [insertRecipeResult] = await connection.query<ResultSetHeader>(
                `INSERT INTO craft_recipes (name, description, result_item_id, result_amount, created_by_member_id) VALUES (?, ?, ?, ?, ?)`,
                [recipeName, recipeDescription, input.resultItemTemplateId, resultAmount, creator.data.id]
            );

            if (normalizedIngredients.length) {
                const ingredientValues = normalizedIngredients.map(ingredient => [
                    insertRecipeResult.insertId,
                    ingredient.itemTemplateId,
                    ingredient.amount,
                ]);

                await connection.query<ResultSetHeader>(
                    `INSERT INTO craft_recipe_ingredients (craft_recipe_id, item_id, amount) VALUES ?`,
                    [ingredientValues]
                );
            }

            await connection.commit();
            return {
                success: true,
                data: { recipeId: insertRecipeResult.insertId },
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

    async listCraftRecipes(): Promise<DBResponse<CraftRecipeView[]>> {
        try {
            const [recipeRows] = await pool.query<CraftRecipeRow[]>(
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
                 ORDER BY cr.id DESC`
            );

            if (!recipeRows.length) {
                return { success: true, data: [] };
            }

            const [ingredientRows] = await pool.query<(CraftRecipeIngredientRow & { craft_recipe_id: number })[]>(
                `SELECT
                    cri.craft_recipe_id,
                    cri.item_id AS ingredient_item_id,
                    i.name AS ingredient_item_name,
                    i.emoji AS ingredient_item_emoji,
                    cri.amount AS ingredient_amount
                 FROM craft_recipe_ingredients AS cri
                 INNER JOIN items AS i ON i.id = cri.item_id
                 ORDER BY cri.craft_recipe_id ASC, cri.id ASC`
            );

            return {
                success: true,
                data: recipeRows.map(recipeRow => this.mapCraftRecipe(recipeRow, ingredientRows.filter(row => row.craft_recipe_id === recipeRow.recipe_id))),
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async getCraftRecipeById(recipeId: number): Promise<DBResponse<CraftRecipeView | null>> {
        try {
            const [recipeRows] = await pool.query<CraftRecipeRow[]>(
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
                 LIMIT 1`,
                [recipeId]
            );

            if (!recipeRows.length) {
                return { success: true, data: null };
            }

            const [ingredientRows] = await pool.query<CraftRecipeIngredientRow[]>(
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

            return {
                success: true,
                data: this.mapCraftRecipe(recipeRows[0], ingredientRows),
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async craftForMember(discordUserId: string, recipeId: number, craftCount: number): Promise<DBResponse<{ crafted: number; resultItemTemplateId: number; resultAmount: number }>> {
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

    async listItemTemplates(): Promise<DBResponse<ItemTemplateRow[]>> {
        try {
            const [rows] = await pool.query<ItemTemplateRow[]>(
                `SELECT
                    i.id,
                    i.name,
                    i.description,
                    i.emoji,
                    i.image_url,
                    i.tradeable,
                    i.sellable,
                    i.bot_sell_price,
                    it.name AS item_type_name,
                    ir.name AS rarity_name,
                    ir.color_hex AS rarity_color_hex
                 FROM items AS i
                 INNER JOIN item_types AS it ON it.id = i.item_type_id
                 INNER JOIN item_rarities AS ir ON ir.id = i.item_rarity_id
                 ORDER BY i.id DESC`
            );

            return {
                success: true,
                data: rows,
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async getItemTemplateById(itemTemplateId: number): Promise<DBResponse<ItemTemplateView | null>> {
        try {
            const [rows] = await pool.query<ItemTemplateRow[]>(
                `SELECT
                    i.id,
                    i.name,
                    i.description,
                    i.emoji,
                    i.image_url,
                    i.tradeable,
                    i.sellable,
                    i.bot_sell_price,
                    it.name AS item_type_name,
                    ir.name AS rarity_name,
                    ir.color_hex AS rarity_color_hex
                 FROM items AS i
                 INNER JOIN item_types AS it ON it.id = i.item_type_id
                 INNER JOIN item_rarities AS ir ON ir.id = i.item_rarity_id
                 WHERE i.id = ?
                 LIMIT 1`,
                [itemTemplateId]
            );

            if (!rows.length) {
                return {
                    success: true,
                    data: null,
                };
            }

            return {
                success: true,
                data: this.mapItemTemplateRow(rows[0]),
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async addOrUpdateBotShopListing(itemTemplateId: number, price: number): Promise<DBResponse<{ listingId: number }>> {
        try {
            const normalizedPrice = this.normalizeStrictPositivePrice(price, "Bot shop price");
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

            const existing = await DataBaseHandler.getInstance().getFromTable<ItemGeneralStoreDB>("item_general_store", { item_id: itemTemplateId });
            if (DataBaseHandler.isSuccess(existing) && existing.data.length) {
                const updateResponse = await DataBaseHandler.getInstance().updateTable(
                    "item_general_store",
                    "price",
                    normalizedPrice,
                    { item_id: itemTemplateId },
                );
                if (DataBaseHandler.isFail(updateResponse)) {
                    return updateResponse;
                }

                return {
                    success: true,
                    data: {
                        listingId: existing.data[0].id,
                    },
                };
            }

            const insertResponse = await DataBaseHandler.getInstance().addRecords<ItemGeneralStoreDB>([{
                id: 0,
                item_id: itemTemplateId,
                price: normalizedPrice,
            }], "item_general_store");

            if (DataBaseHandler.isFail(insertResponse)) {
                return insertResponse;
            }

            return {
                success: true,
                data: {
                    listingId: insertResponse.data.insertId,
                },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async listBotShop(): Promise<DBResponse<BotShopListingView[]>> {
        try {
            const [rows] = await pool.query<BotShopRow[]>(
                `SELECT
                    igs.id AS listing_id,
                    igs.price,
                    i.id AS item_template_id,
                    i.name AS item_name,
                    i.description AS item_description,
                    i.emoji AS item_emoji,
                    i.image_url,
                    i.tradeable,
                    i.sellable,
                    i.bot_sell_price,
                    it.name AS item_type_name,
                    ir.name AS rarity_name,
                    ir.color_hex AS rarity_color_hex
                 FROM item_general_store AS igs
                 INNER JOIN items AS i ON i.id = igs.item_id
                 INNER JOIN item_types AS it ON it.id = i.item_type_id
                 INNER JOIN item_rarities AS ir ON ir.id = i.item_rarity_id
                 ORDER BY igs.id DESC`
            );

            return {
                success: true,
                data: rows.map(row => ({
                    listingId: row.listing_id,
                    price: Number(row.price),
                    itemTemplateId: row.item_template_id,
                    name: row.item_name,
                    description: row.item_description,
                    emoji: row.item_emoji,
                    imageUrl: row.image_url,
                    tradeable: Boolean(row.tradeable),
                    sellable: Boolean(row.sellable),
                    botSellPrice: row.bot_sell_price === null ? null : Number(row.bot_sell_price),
                    itemType: row.item_type_name,
                    rarityName: row.rarity_name,
                    rarityColorHex: row.rarity_color_hex,
                })),
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async createPublicListing(sellerDiscordId: string, inventoryItemId: number, price: number): Promise<DBResponse<{ listingId: number }>> {
        try {
            const normalizedPrice = this.normalizeStrictPositivePrice(price, "Market price");
            const inventoryItemResponse = await this.getInventoryItemById(inventoryItemId);
            if (DataBaseHandler.isFail(inventoryItemResponse) || !inventoryItemResponse.data) {
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "member_items",
                        message: "Inventory item not found.",
                    },
                };
            }

            if (inventoryItemResponse.data.ownerDiscordId !== sellerDiscordId) {
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "member_items",
                        message: "You do not own this item.",
                    },
                };
            }

            if (!inventoryItemResponse.data.tradeable) {
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "items",
                        message: "This item is not tradeable.",
                    },
                };
            }

            const existing = await DataBaseHandler.getInstance().getFromTable<ItemPublicMarketDB>("item_public_market", { member_item_id: inventoryItemId });
            if (DataBaseHandler.isSuccess(existing) && existing.data.length) {
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "item_public_market",
                        message: "This item is already listed.",
                    },
                };
            }

            const insertResponse = await DataBaseHandler.getInstance().addRecords<ItemPublicMarketDB>([{
                id: 0,
                member_item_id: inventoryItemId,
                price: normalizedPrice,
            }], "item_public_market");

            if (DataBaseHandler.isFail(insertResponse)) {
                return insertResponse;
            }

            return {
                success: true,
                data: {
                    listingId: insertResponse.data.insertId,
                },
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async cancelPublicListing(sellerDiscordId: string, listingId: number): Promise<DBResponse<{ listingId: number; inventoryItemId: number }>> {
        let connection: PoolConnection | null = null;

        try {
            connection = await pool.getConnection();
            await connection.beginTransaction();

            const [rows] = await connection.query<PublicMarketRow[]>(
                `SELECT
                    ipm.id AS listing_id,
                    ipm.price,
                    seller.ds_member_id AS seller_ds_member_id,
                    mi.id AS inventory_item_id,
                    original_owner.ds_member_id AS original_owner_ds_member_id,
                    mi.obtained_at,
                    mi.tier,
                    i.id AS item_template_id,
                    i.name AS item_name,
                    i.description AS item_description,
                    i.emoji AS item_emoji,
                    i.image_url,
                    i.tradeable,
                    i.sellable,
                    i.bot_sell_price,
                    it.name AS item_type_name,
                    ir.name AS rarity_name,
                    ir.color_hex AS rarity_color_hex
                 FROM item_public_market AS ipm
                 INNER JOIN member_items AS mi ON mi.id = ipm.member_item_id
                 INNER JOIN members AS seller ON seller.id = mi.member_id
                 LEFT JOIN members AS original_owner ON original_owner.id = mi.original_owner_member_id
                 INNER JOIN items AS i ON i.id = mi.item_id
                 INNER JOIN item_types AS it ON it.id = i.item_type_id
                 INNER JOIN item_rarities AS ir ON ir.id = i.item_rarity_id
                 WHERE ipm.id = ?
                 LIMIT 1
                 FOR UPDATE`,
                [listingId]
            );

            if (!rows.length) {
                await connection.rollback();
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "item_public_market",
                        message: "Listing not found.",
                    },
                };
            }

            const listing = rows[0];
            if (listing.seller_ds_member_id !== sellerDiscordId) {
                await connection.rollback();
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "item_public_market",
                        message: "You can only cancel your own listing.",
                    },
                };
            }

            await connection.query(`DELETE FROM item_public_market WHERE id = ?`, [listingId]);

            await connection.commit();
            return {
                success: true,
                data: {
                    listingId,
                    inventoryItemId: listing.inventory_item_id,
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

    async updatePublicListingPrice(sellerDiscordId: string, listingId: number, price: number): Promise<DBResponse<{ listingId: number; price: number }>> {
        let connection: PoolConnection | null = null;

        try {
            const normalizedPrice = this.normalizeStrictPositivePrice(price, "Market price");
            connection = await pool.getConnection();
            await connection.beginTransaction();

            const [rows] = await connection.query<PublicMarketRow[]>(
                `SELECT
                    ipm.id AS listing_id,
                    ipm.price,
                    seller.ds_member_id AS seller_ds_member_id,
                    mi.id AS inventory_item_id,
                    original_owner.ds_member_id AS original_owner_ds_member_id,
                    mi.obtained_at,
                    mi.tier,
                    i.id AS item_template_id,
                    i.name AS item_name,
                    i.description AS item_description,
                    i.emoji AS item_emoji,
                    i.image_url,
                    i.tradeable,
                    i.sellable,
                    i.bot_sell_price,
                    it.name AS item_type_name,
                    ir.name AS rarity_name,
                    ir.color_hex AS rarity_color_hex
                 FROM item_public_market AS ipm
                 INNER JOIN member_items AS mi ON mi.id = ipm.member_item_id
                 INNER JOIN members AS seller ON seller.id = mi.member_id
                 LEFT JOIN members AS original_owner ON original_owner.id = mi.original_owner_member_id
                 INNER JOIN items AS i ON i.id = mi.item_id
                 INNER JOIN item_types AS it ON it.id = i.item_type_id
                 INNER JOIN item_rarities AS ir ON ir.id = i.item_rarity_id
                 WHERE ipm.id = ?
                 LIMIT 1
                 FOR UPDATE`,
                [listingId]
            );

            if (!rows.length) {
                await connection.rollback();
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "item_public_market",
                        message: "Listing not found.",
                    },
                };
            }

            const listing = rows[0];
            if (listing.seller_ds_member_id !== sellerDiscordId) {
                await connection.rollback();
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "item_public_market",
                        message: "You can only update your own listing.",
                    },
                };
            }

            await connection.query(`UPDATE item_public_market SET price = ? WHERE id = ?`, [normalizedPrice, listingId]);

            await connection.commit();
            return {
                success: true,
                data: {
                    listingId,
                    price: normalizedPrice,
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

    async listPublicMarket(): Promise<DBResponse<PublicMarketListingView[]>> {
        try {
            const [rows] = await pool.query<PublicMarketRow[]>(
                `SELECT
                    ipm.id AS listing_id,
                    ipm.price,
                    seller.ds_member_id AS seller_ds_member_id,
                    mi.id AS inventory_item_id,
                    original_owner.ds_member_id AS original_owner_ds_member_id,
                    mi.obtained_at,
                    mi.tier,
                    i.id AS item_template_id,
                    i.name AS item_name,
                    i.description AS item_description,
                    i.emoji AS item_emoji,
                    i.image_url,
                    i.tradeable,
                    i.sellable,
                    i.bot_sell_price,
                    it.name AS item_type_name,
                    ir.name AS rarity_name,
                    ir.color_hex AS rarity_color_hex
                 FROM item_public_market AS ipm
                 INNER JOIN member_items AS mi ON mi.id = ipm.member_item_id
                 INNER JOIN members AS seller ON seller.id = mi.member_id
                 LEFT JOIN members AS original_owner ON original_owner.id = mi.original_owner_member_id
                 INNER JOIN items AS i ON i.id = mi.item_id
                 INNER JOIN item_types AS it ON it.id = i.item_type_id
                 INNER JOIN item_rarities AS ir ON ir.id = i.item_rarity_id
                 ORDER BY ipm.id DESC`
            );

            return {
                success: true,
                data: rows.map(row => ({
                    listingId: row.listing_id,
                    sellerDiscordId: row.seller_ds_member_id,
                    price: Number(row.price),
                    inventoryItemId: row.inventory_item_id,
                    ownerDiscordId: row.seller_ds_member_id,
                    originalOwnerDiscordId: row.original_owner_ds_member_id,
                    obtainedAt: new Date(row.obtained_at),
                    tier: row.tier,
                    itemTemplateId: row.item_template_id,
                    name: row.item_name,
                    description: row.item_description,
                    emoji: row.item_emoji,
                    imageUrl: row.image_url,
                    tradeable: Boolean(row.tradeable),
                    sellable: Boolean(row.sellable),
                    botSellPrice: row.bot_sell_price === null ? null : Number(row.bot_sell_price),
                    itemType: row.item_type_name,
                    rarityName: row.rarity_name,
                    rarityColorHex: row.rarity_color_hex,
                })),
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async listUserPublicMarket(discordUserId: string): Promise<DBResponse<PublicMarketListingView[]>> {
        const response = await this.listPublicMarket();
        if (!response.success) {
            return response;
        }

        return {
            success: true,
            data: response.data.filter(item => item.sellerDiscordId === discordUserId),
        };
    }

    async buyPublicListing(buyerDiscordId: string, listingId: number): Promise<DBResponse<{ inventoryItemId: number }>> {
        let connection: PoolConnection | null = null;

        try {
            connection = await pool.getConnection();
            await connection.beginTransaction();

            const [rows] = await connection.query<PublicMarketRow[]>(
                `SELECT
                    ipm.id AS listing_id,
                    ipm.price,
                    seller.ds_member_id AS seller_ds_member_id,
                    mi.id AS inventory_item_id,
                    original_owner.ds_member_id AS original_owner_ds_member_id,
                    mi.obtained_at,
                    mi.tier,
                    i.id AS item_template_id,
                    i.name AS item_name,
                    i.description AS item_description,
                    i.emoji AS item_emoji,
                    i.image_url,
                    i.tradeable,
                    i.sellable,
                    i.bot_sell_price,
                    it.name AS item_type_name,
                    ir.name AS rarity_name,
                    ir.color_hex AS rarity_color_hex
                 FROM item_public_market AS ipm
                 INNER JOIN member_items AS mi ON mi.id = ipm.member_item_id
                 INNER JOIN members AS seller ON seller.id = mi.member_id
                 LEFT JOIN members AS original_owner ON original_owner.id = mi.original_owner_member_id
                 INNER JOIN items AS i ON i.id = mi.item_id
                 INNER JOIN item_types AS it ON it.id = i.item_type_id
                 INNER JOIN item_rarities AS ir ON ir.id = i.item_rarity_id
                 WHERE ipm.id = ?
                 LIMIT 1
                 FOR UPDATE`,
                [listingId]
            );

            if (!rows.length) {
                await connection.rollback();
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "item_public_market",
                        message: "Listing not found.",
                    },
                };
            }

            const listing = rows[0];
            if (listing.seller_ds_member_id === buyerDiscordId) {
                await connection.rollback();
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "item_public_market",
                        message: "You cannot buy your own listing.",
                    },
                };
            }

            const buyer = await this.ensureMemberByDiscordId(buyerDiscordId);
            if (Number(buyer.data.balance) < Number(listing.price)) {
                await connection.rollback();
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "members",
                        message: "Not enough ODM balance.",
                    },
                };
            }

            const [sellerRows] = await connection.query<RowDataPacket[]>(
                `SELECT id, balance FROM members WHERE ds_member_id = ? LIMIT 1 FOR UPDATE`,
                [listing.seller_ds_member_id]
            );
            const seller = sellerRows[0];

            await connection.query(
                `UPDATE members SET balance = balance - ? WHERE ds_member_id = ?`,
                [listing.price, buyerDiscordId]
            );
            await connection.query(
                `UPDATE members SET balance = balance + ? WHERE id = ?`,
                [listing.price, seller.id]
            );
            await connection.query(
                `UPDATE member_items SET member_id = ? WHERE id = ?`,
                [buyer.data.id, listing.inventory_item_id]
            );
            await connection.query(
                `DELETE FROM item_public_market WHERE id = ?`,
                [listingId]
            );

            await connection.commit();
            return {
                success: true,
                data: {
                    inventoryItemId: listing.inventory_item_id,
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

    async buyFromBotShop(buyerDiscordId: string, listingId: number, amount: number): Promise<DBResponse<{ inserted: number }>> {
        let connection: PoolConnection | null = null;

        try {
            const normalizedAmount = this.normalizePositiveInteger(amount, "Amount");
            connection = await pool.getConnection();
            await connection.beginTransaction();

            const [rows] = await connection.query<BotShopRow[]>(
                `SELECT
                    igs.id AS listing_id,
                    igs.price,
                    i.id AS item_template_id,
                    i.name AS item_name,
                    i.description AS item_description,
                    i.emoji AS item_emoji,
                    i.image_url,
                    i.tradeable,
                    i.sellable,
                    i.bot_sell_price,
                    it.name AS item_type_name,
                    ir.name AS rarity_name,
                    ir.color_hex AS rarity_color_hex
                 FROM item_general_store AS igs
                 INNER JOIN items AS i ON i.id = igs.item_id
                 INNER JOIN item_types AS it ON it.id = i.item_type_id
                 INNER JOIN item_rarities AS ir ON ir.id = i.item_rarity_id
                 WHERE igs.id = ?
                 LIMIT 1
                 FOR UPDATE`,
                [listingId]
            );

            if (!rows.length) {
                await connection.rollback();
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "item_general_store",
                        message: "Bot shop listing not found.",
                    },
                };
            }

            const buyer = await this.ensureMemberByDiscordId(buyerDiscordId);
            const totalPrice = Number(rows[0].price) * normalizedAmount;
            if (Number(buyer.data.balance) < totalPrice) {
                await connection.rollback();
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "members",
                        message: "Not enough ODM balance.",
                    },
                };
            }

            await connection.query(
                `UPDATE members SET balance = balance - ? WHERE ds_member_id = ?`,
                [totalPrice, buyerDiscordId]
            );

            const values = Array.from({ length: normalizedAmount }, () => [
                buyer.data.id,
                rows[0].item_template_id,
                1,
                new Date(),
                buyer.data.id,
            ]);

            await connection.query<ResultSetHeader>(
                `INSERT INTO member_items (member_id, item_id, tier, obtained_at, original_owner_member_id)
                 VALUES ?`,
                [values]
            );

            await connection.commit();
            return {
                success: true,
                data: {
                    inserted: normalizedAmount,
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

    async sellInventoryItemToBot(sellerDiscordId: string, inventoryItemId: number): Promise<DBResponse<{ price: number }>> {
        let connection: PoolConnection | null = null;

        try {
            connection = await pool.getConnection();
            await connection.beginTransaction();

            const [rows] = await connection.query<InventoryRow[]>(
                `SELECT
                    mi.id AS inventory_item_id,
                    mi.member_id AS owner_member_id,
                    owner.ds_member_id AS owner_ds_member_id,
                    mi.original_owner_member_id,
                    original_owner.ds_member_id AS original_owner_ds_member_id,
                    mi.obtained_at,
                    mi.tier,
                    i.id AS item_template_id,
                    i.name AS item_name,
                    i.description AS item_description,
                    i.emoji AS item_emoji,
                    i.image_url,
                    i.tradeable,
                    i.sellable,
                    i.bot_sell_price,
                    it.name AS item_type_name,
                    ir.name AS rarity_name,
                    ir.color_hex AS rarity_color_hex
                 FROM member_items AS mi
                 INNER JOIN members AS owner ON owner.id = mi.member_id
                 LEFT JOIN members AS original_owner ON original_owner.id = mi.original_owner_member_id
                 INNER JOIN items AS i ON i.id = mi.item_id
                 INNER JOIN item_types AS it ON it.id = i.item_type_id
                 INNER JOIN item_rarities AS ir ON ir.id = i.item_rarity_id
                 WHERE mi.id = ?
                 LIMIT 1
                 FOR UPDATE`,
                [inventoryItemId]
            );

            if (!rows.length) {
                await connection.rollback();
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "member_items",
                        message: "Inventory item not found.",
                    },
                };
            }

            const item = rows[0];
            if (item.owner_ds_member_id !== sellerDiscordId) {
                await connection.rollback();
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "member_items",
                        message: "You do not own this item.",
                    },
                };
            }

            if (!item.sellable || item.bot_sell_price === null) {
                await connection.rollback();
                return {
                    success: false,
                    error: {
                        reason: "unknown",
                        relatedTo: "items",
                        message: "This item cannot be sold to the bot.",
                    },
                };
            }

            await connection.query(`DELETE FROM item_public_market WHERE member_item_id = ?`, [inventoryItemId]);
            await connection.query(`DELETE FROM member_items WHERE id = ?`, [inventoryItemId]);
            await connection.query(
                `UPDATE members SET balance = balance + ? WHERE ds_member_id = ?`,
                [item.bot_sell_price, sellerDiscordId]
            );

            await connection.commit();
            return {
                success: true,
                data: {
                    price: Number(item.bot_sell_price),
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

    async getInventory(discordUserId: string): Promise<DBResponse<InventoryItemView[]>> {
        try {
            const [rows] = await pool.query<InventoryRow[]>(
                `SELECT
                    mi.id AS inventory_item_id,
                    mi.member_id AS owner_member_id,
                    owner.ds_member_id AS owner_ds_member_id,
                    mi.original_owner_member_id,
                    original_owner.ds_member_id AS original_owner_ds_member_id,
                    mi.obtained_at,
                    mi.tier,
                    i.id AS item_template_id,
                    i.name AS item_name,
                    i.description AS item_description,
                    i.emoji AS item_emoji,
                    i.image_url,
                    i.tradeable,
                    i.sellable,
                    i.bot_sell_price,
                    it.name AS item_type_name,
                    ir.name AS rarity_name,
                    ir.color_hex AS rarity_color_hex
                 FROM member_items AS mi
                 INNER JOIN members AS owner ON owner.id = mi.member_id
                 LEFT JOIN members AS original_owner ON original_owner.id = mi.original_owner_member_id
                 INNER JOIN items AS i ON i.id = mi.item_id
                 INNER JOIN item_types AS it ON it.id = i.item_type_id
                 INNER JOIN item_rarities AS ir ON ir.id = i.item_rarity_id
                 WHERE owner.ds_member_id = ?
                 ORDER BY mi.id DESC`,
                [discordUserId]
            );

            return {
                success: true,
                data: rows.map(this.mapInventoryRow),
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    async getInventoryItemById(inventoryItemId: number): Promise<DBResponse<InventoryItemView | null>> {
        try {
            const [rows] = await pool.query<InventoryRow[]>(
                `SELECT
                    mi.id AS inventory_item_id,
                    mi.member_id AS owner_member_id,
                    owner.ds_member_id AS owner_ds_member_id,
                    mi.original_owner_member_id,
                    original_owner.ds_member_id AS original_owner_ds_member_id,
                    mi.obtained_at,
                    mi.tier,
                    i.id AS item_template_id,
                    i.name AS item_name,
                    i.description AS item_description,
                    i.image_url,
                    i.tradeable,
                    i.sellable,
                    i.bot_sell_price,
                    it.name AS item_type_name,
                    ir.name AS rarity_name,
                    ir.color_hex AS rarity_color_hex
                 FROM member_items AS mi
                 INNER JOIN members AS owner ON owner.id = mi.member_id
                 LEFT JOIN members AS original_owner ON original_owner.id = mi.original_owner_member_id
                 INNER JOIN items AS i ON i.id = mi.item_id
                 INNER JOIN item_types AS it ON it.id = i.item_type_id
                 INNER JOIN item_rarities AS ir ON ir.id = i.item_rarity_id
                 WHERE mi.id = ?
                 LIMIT 1`,
                [inventoryItemId]
            );

            return {
                success: true,
                data: rows.length ? this.mapInventoryRow(rows[0]) : null,
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    private mapInventoryRow(row: InventoryRow): InventoryItemView {
        return {
            inventoryItemId: row.inventory_item_id,
            ownerDiscordId: row.owner_ds_member_id,
            originalOwnerDiscordId: row.original_owner_ds_member_id,
            obtainedAt: new Date(row.obtained_at),
            tier: row.tier,
            itemTemplateId: row.item_template_id,
            name: row.item_name,
            description: row.item_description,
            emoji: row.item_emoji,
            imageUrl: row.image_url,
            tradeable: Boolean(row.tradeable),
            sellable: Boolean(row.sellable),
            botSellPrice: row.bot_sell_price,
            itemType: row.item_type_name,
            rarityName: row.rarity_name,
            rarityColorHex: row.rarity_color_hex,
        };
    }

    private mapItemTemplateRow(row: ItemTemplateRow): ItemTemplateView {
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            emoji: row.emoji,
            imageUrl: row.image_url,
            tradeable: Boolean(row.tradeable),
            sellable: Boolean(row.sellable),
            botSellPrice: row.bot_sell_price === null ? null : Number(row.bot_sell_price),
            itemType: row.item_type_name,
            rarityName: row.rarity_name,
            rarityColorHex: row.rarity_color_hex,
        };
    }

    private mapCraftRecipe(recipeRow: CraftRecipeRow, ingredientRows: CraftRecipeIngredientRow[]): CraftRecipeView {
        return {
            recipeId: recipeRow.recipe_id,
            name: recipeRow.recipe_name,
            description: recipeRow.recipe_description,
            resultAmount: Number(recipeRow.result_amount),
            resultItemTemplateId: recipeRow.result_item_id,
            resultName: recipeRow.result_item_name,
            resultEmoji: recipeRow.result_item_emoji,
            resultRarityName: recipeRow.result_rarity_name,
            ingredients: ingredientRows.map(row => ({
                itemTemplateId: row.ingredient_item_id,
                name: row.ingredient_item_name,
                emoji: row.ingredient_item_emoji,
                amount: Number(row.ingredient_amount),
            })),
        };
    }

    private normalizeRequiredText(value: string, fieldName: string): string {
        const normalizedValue = value.trim();
        if (!normalizedValue.length) {
            throw new Error(`${fieldName} cannot be empty.`);
        }

        return normalizedValue;
    }

    private normalizeOptionalText(value?: string | null): string | null {
        if (value === undefined || value === null) {
            return null;
        }

        const normalizedValue = value.trim();
        return normalizedValue.length ? normalizedValue : null;
    }

    private normalizeColorHex(colorHex?: string): string | null {
        if (!colorHex) {
            return null;
        }

        const normalizedValue = colorHex.trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(normalizedValue)) {
            throw new Error("Rarity color must be a hex value like #ffcc00.");
        }

        return normalizedValue.toLowerCase();
    }

    private normalizeImageUrl(imageUrl?: string | null): string | null {
        const normalizedValue = this.normalizeOptionalText(imageUrl);
        if (!normalizedValue) {
            return null;
        }

        let parsedUrl: URL;
        try {
            parsedUrl = new URL(normalizedValue);
        } catch {
            throw new Error("Image URL must be a valid absolute URL.");
        }

        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
            throw new Error("Image URL must start with http:// or https://.");
        }

        return parsedUrl.toString();
    }

    private normalizeBotSellPrice(botSellPrice?: number | null): number | null {
        if (botSellPrice === undefined || botSellPrice === null) {
            return null;
        }

        if (!Number.isFinite(botSellPrice) || botSellPrice < 0) {
            throw new Error("Bot sell price must be a non-negative number.");
        }

        return Number(botSellPrice.toFixed(2));
    }

    private normalizeStrictPositivePrice(price: number, fieldName: string): number {
        if (!Number.isFinite(price) || price <= 0) {
            throw new Error(`${fieldName} must be greater than 0.`);
        }

        return Number(price.toFixed(2));
    }

    private normalizePositiveInteger(value: number, fieldName: string): number {
        if (!Number.isInteger(value) || value <= 0) {
            throw new Error(`${fieldName} must be a positive integer.`);
        }

        return value;
    }

    private normalizeCraftIngredients(inputIngredients: Array<{ itemTemplateId: number; amount: number }>): Array<{ itemTemplateId: number; amount: number }> {
        if (!inputIngredients.length) {
            throw new Error("Craft recipe must include at least one ingredient.");
        }

        const aggregatedIngredients = new Map<number, number>();
        for (const ingredient of inputIngredients) {
            const amount = this.normalizePositiveInteger(ingredient.amount, `Ingredient amount for item #${ingredient.itemTemplateId}`);
            aggregatedIngredients.set(ingredient.itemTemplateId, (aggregatedIngredients.get(ingredient.itemTemplateId) ?? 0) + amount);
        }

        return Array.from(aggregatedIngredients.entries()).map(([itemTemplateId, amount]) => ({ itemTemplateId, amount }));
    }
}

export const itemService = ItemService.getInstance();
