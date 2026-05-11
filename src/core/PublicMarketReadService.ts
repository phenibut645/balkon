import { RowDataPacket } from "mysql2";
import pool from "../db.js";
import { errorHandling } from "./DbResult.js";
import type { DBResponse } from "./DbResult.js";
import type { AutocompleteOption, PublicMarketListingView } from "./ItemViewTypes.js";

interface PublicMarketRow extends RowDataPacket {
    listing_id: number;
    price: number;
    seller_ds_member_id: string;
    seller_discord_username: string | null;
    seller_discord_global_name: string | null;
    seller_discord_avatar_url: string | null;
    inventory_item_id: number;
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

export class PublicMarketReadService {
    private static instance: PublicMarketReadService;

    static getInstance(): PublicMarketReadService {
        if (!PublicMarketReadService.instance) {
            PublicMarketReadService.instance = new PublicMarketReadService();
        }

        return PublicMarketReadService.instance;
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
            return errorHandling(error);
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
            return errorHandling(error);
        }
    }

    async listPublicMarket(): Promise<DBResponse<PublicMarketListingView[]>> {
        try {
            const [rows] = await pool.query<PublicMarketRow[]>(
                `SELECT
                    ipm.id AS listing_id,
                    ipm.price,
                    seller.ds_member_id AS seller_ds_member_id,
                    seller.discord_username AS seller_discord_username,
                    seller.discord_global_name AS seller_discord_global_name,
                    seller.discord_avatar_url AS seller_discord_avatar_url,
                    mi.id AS inventory_item_id,
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
                data: rows.map(row => this.mapPublicMarketRow(row)),
            };
        } catch (error) {
            return errorHandling(error);
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

    private mapPublicMarketRow(row: PublicMarketRow): PublicMarketListingView {
        return {
            listingId: row.listing_id,
            sellerDiscordId: row.seller_ds_member_id,
            sellerDisplayName: this.resolveMemberDisplayName(row.seller_ds_member_id, row.seller_discord_global_name, row.seller_discord_username),
            sellerAvatarUrl: row.seller_discord_avatar_url,
            price: Number(row.price),
            inventoryItemId: row.inventory_item_id,
            ownerDiscordId: row.seller_ds_member_id,
            ownerDisplayName: this.resolveMemberDisplayName(row.seller_ds_member_id, row.seller_discord_global_name, row.seller_discord_username),
            ownerAvatarUrl: row.seller_discord_avatar_url,
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
            botSellPrice: row.bot_sell_price === null ? null : Number(row.bot_sell_price),
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