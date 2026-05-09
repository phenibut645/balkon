import { RowDataPacket } from "mysql2";
import pool from "../db.js";
import { DataBaseHandler } from "./DataBaseHandler.js";
import type { DBResponse } from "./DataBaseHandler.js";
import type { AutocompleteOption, InventoryItemView } from "./ItemService.js";

interface InventoryRow extends RowDataPacket {
    inventory_item_id: number;
    owner_member_id: number;
    owner_ds_member_id: string;
    owner_discord_username: string | null;
    owner_discord_global_name: string | null;
    owner_discord_avatar_url: string | null;
    original_owner_member_id: number | null;
    original_owner_ds_member_id: string | null;
    original_owner_discord_username: string | null;
    original_owner_discord_global_name: string | null;
    original_owner_discord_avatar_url: string | null;
    obtained_at: Date;
    tier: number;
    item_template_id: number;
    item_name: string;
    item_description: string;
    name_ru: string | null;
    name_en: string | null;
    name_et: string | null;
    description_ru: string | null;
    description_en: string | null;
    description_et: string | null;
    item_emoji: string | null;
    image_url: string | null;
    tradeable: number;
    sellable: number;
    bot_sell_price: number | null;
    item_type_name: string;
    rarity_name: string;
    rarity_color_hex: string | null;
}

export class ItemInventoryReadService {
    private static instance: ItemInventoryReadService;

    static getInstance(): ItemInventoryReadService {
        if (!ItemInventoryReadService.instance) {
            ItemInventoryReadService.instance = new ItemInventoryReadService();
        }

        return ItemInventoryReadService.instance;
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

    async getInventory(discordUserId: string): Promise<DBResponse<InventoryItemView[]>> {
        try {
            const [rows] = await pool.query<InventoryRow[]>(
                `SELECT
                    mi.id AS inventory_item_id,
                    mi.member_id AS owner_member_id,
                    owner.ds_member_id AS owner_ds_member_id,
                    owner.discord_username AS owner_discord_username,
                    owner.discord_global_name AS owner_discord_global_name,
                    owner.discord_avatar_url AS owner_discord_avatar_url,
                    mi.original_owner_member_id,
                    original_owner.ds_member_id AS original_owner_ds_member_id,
                    original_owner.discord_username AS original_owner_discord_username,
                    original_owner.discord_global_name AS original_owner_discord_global_name,
                    original_owner.discord_avatar_url AS original_owner_discord_avatar_url,
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
                data: rows.map(row => this.mapInventoryRow(row)),
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
                    owner.discord_username AS owner_discord_username,
                    owner.discord_global_name AS owner_discord_global_name,
                    owner.discord_avatar_url AS owner_discord_avatar_url,
                    mi.original_owner_member_id,
                    original_owner.ds_member_id AS original_owner_ds_member_id,
                    original_owner.discord_username AS original_owner_discord_username,
                    original_owner.discord_global_name AS original_owner_discord_global_name,
                    original_owner.discord_avatar_url AS original_owner_discord_avatar_url,
                    mi.obtained_at,
                    mi.tier,
                    i.id AS item_template_id,
                    i.name AS item_name,
                    i.description AS item_description,
                    i.name_ru,
                    i.name_en,
                    i.name_et,
                    i.description_ru,
                    i.description_en,
                    i.description_et,
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
            ownerDisplayName: this.resolveMemberDisplayName(row.owner_ds_member_id, row.owner_discord_global_name, row.owner_discord_username),
            ownerAvatarUrl: row.owner_discord_avatar_url,
            originalOwnerDiscordId: row.original_owner_ds_member_id,
            originalOwnerDisplayName: row.original_owner_ds_member_id
                ? this.resolveMemberDisplayName(
                    row.original_owner_ds_member_id,
                    row.original_owner_discord_global_name,
                    row.original_owner_discord_username,
                )
                : null,
            originalOwnerAvatarUrl: row.original_owner_discord_avatar_url,
            obtainedAt: new Date(row.obtained_at),
            tier: row.tier,
            itemTemplateId: row.item_template_id,
            name: row.item_name,
            description: row.item_description,
            nameRu: row.name_ru,
            nameEn: row.name_en,
            nameEt: row.name_et,
            descriptionRu: row.description_ru,
            descriptionEn: row.description_en,
            descriptionEt: row.description_et,
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

    private resolveMemberDisplayName(discordId: string, globalName: string | null, username: string | null): string {
        const normalizedGlobalName = typeof globalName === "string" ? globalName.trim() : "";
        if (normalizedGlobalName.length) {
            return normalizedGlobalName;
        }

        const normalizedUsername = typeof username === "string" ? username.trim() : "";
        if (normalizedUsername.length) {
            return normalizedUsername;
        }

        return "Unknown Discord user";
    }
}