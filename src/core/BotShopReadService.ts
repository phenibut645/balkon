import { RowDataPacket } from "mysql2";
import pool from "../db.js";
import { errorHandling } from "./DbResult.js";
import type { DBResponse } from "./DbResult.js";
import type { AutocompleteOption, BotShopListingView } from "./ItemViewTypes.js";

interface BotShopRow extends RowDataPacket {
    listing_id: number;
    price: number;
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

export class BotShopReadService {
    private static instance: BotShopReadService;

    static getInstance(): BotShopReadService {
        if (!BotShopReadService.instance) {
            BotShopReadService.instance = new BotShopReadService();
        }

        return BotShopReadService.instance;
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
            return errorHandling(error);
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
                 FROM item_general_store AS igs
                 INNER JOIN items AS i ON i.id = igs.item_id
                 INNER JOIN item_types AS it ON it.id = i.item_type_id
                 INNER JOIN item_rarities AS ir ON ir.id = i.item_rarity_id
                 ORDER BY igs.id DESC`
            );

            return {
                success: true,
                data: rows.map(row => this.mapBotShopRow(row)),
            };
        } catch (error) {
            return errorHandling(error);
        }
    }

    private mapBotShopRow(row: BotShopRow): BotShopListingView {
        return {
            listingId: row.listing_id,
            price: Number(row.price),
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
}