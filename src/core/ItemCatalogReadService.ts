import { RowDataPacket } from "mysql2";
import pool from "../db.js";
import { DataBaseHandler } from "./DataBaseHandler.js";
import type { DBResponse } from "./DataBaseHandler.js";
import type { AutocompleteOption, ItemRarityView, ItemTemplateView } from "./ItemService.js";

interface ItemTemplateRow extends RowDataPacket {
    id: number;
    name: string;
    description: string;
    name_ru: string | null;
    name_en: string | null;
    name_et: string | null;
    description_ru: string | null;
    description_en: string | null;
    description_et: string | null;
    emoji: string | null;
    image_url: string | null;
    tradeable: number;
    sellable: number;
    bot_sell_price: number | null;
    item_type_name: string;
    rarity_name: string;
    rarity_color_hex: string | null;
}

export class ItemCatalogReadService {
    private static instance: ItemCatalogReadService;

    static getInstance(): ItemCatalogReadService {
        if (!ItemCatalogReadService.instance) {
            ItemCatalogReadService.instance = new ItemCatalogReadService();
        }

        return ItemCatalogReadService.instance;
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

    async listItemTemplates(): Promise<DBResponse<ItemTemplateRow[]>> {
        try {
            const [rows] = await pool.query<ItemTemplateRow[]>(
                `SELECT
                    i.id,
                    i.name,
                    i.description,
                    i.name_ru,
                    i.name_en,
                    i.name_et,
                    i.description_ru,
                    i.description_en,
                    i.description_et,
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
                    i.name_ru,
                    i.name_en,
                    i.name_et,
                    i.description_ru,
                    i.description_en,
                    i.description_et,
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

    private mapItemTemplateRow(row: ItemTemplateRow): ItemTemplateView {
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            nameRu: row.name_ru,
            nameEn: row.name_en,
            nameEt: row.name_et,
            descriptionRu: row.description_ru,
            descriptionEn: row.description_en,
            descriptionEt: row.description_et,
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
}