import { RowDataPacket } from "mysql2";
import pool from "../db.js";
import { DataBaseHandler } from "./DataBaseHandler.js";
import type { DBResponse } from "./DataBaseHandler.js";
import type { AutocompleteOption, CraftRecipeView } from "./ItemService.js";

interface CraftRecipeRow extends RowDataPacket {
    recipe_id: number;
    recipe_name: string;
    recipe_description: string | null;
    result_amount: number;
    result_item_id: number;
    result_item_name: string;
    result_name_ru: string | null;
    result_name_en: string | null;
    result_name_et: string | null;
    result_description: string;
    result_description_ru: string | null;
    result_description_en: string | null;
    result_description_et: string | null;
    result_item_emoji: string | null;
    result_rarity_name: string;
}

interface CraftRecipeIngredientRow extends RowDataPacket {
    ingredient_item_id: number;
    ingredient_item_name: string;
    ingredient_name_ru: string | null;
    ingredient_name_en: string | null;
    ingredient_name_et: string | null;
    ingredient_description: string;
    ingredient_description_ru: string | null;
    ingredient_description_en: string | null;
    ingredient_description_et: string | null;
    ingredient_item_emoji: string | null;
    ingredient_amount: number;
}

interface CraftRecipeIngredientWithRecipeId extends CraftRecipeIngredientRow {
    craft_recipe_id: number;
}

export class CraftRecipeReadService {
    private static instance: CraftRecipeReadService;

    static getInstance(): CraftRecipeReadService {
        if (!CraftRecipeReadService.instance) {
            CraftRecipeReadService.instance = new CraftRecipeReadService();
        }

        return CraftRecipeReadService.instance;
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
                    i.name_ru AS result_name_ru,
                    i.name_en AS result_name_en,
                    i.name_et AS result_name_et,
                    i.description AS result_description,
                    i.description_ru AS result_description_ru,
                    i.description_en AS result_description_en,
                    i.description_et AS result_description_et,
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

            const [ingredientRows] = await pool.query<CraftRecipeIngredientWithRecipeId[]>(
                `SELECT
                    cri.craft_recipe_id,
                    cri.item_id AS ingredient_item_id,
                    i.name AS ingredient_item_name,
                    i.name_ru AS ingredient_name_ru,
                    i.name_en AS ingredient_name_en,
                    i.name_et AS ingredient_name_et,
                    i.description AS ingredient_description,
                    i.description_ru AS ingredient_description_ru,
                    i.description_en AS ingredient_description_en,
                    i.description_et AS ingredient_description_et,
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
                    i.name_ru AS result_name_ru,
                    i.name_en AS result_name_en,
                    i.name_et AS result_name_et,
                    i.description AS result_description,
                    i.description_ru AS result_description_ru,
                    i.description_en AS result_description_en,
                    i.description_et AS result_description_et,
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
                    i.name_ru AS ingredient_name_ru,
                    i.name_en AS ingredient_name_en,
                    i.name_et AS ingredient_name_et,
                    i.description AS ingredient_description,
                    i.description_ru AS ingredient_description_ru,
                    i.description_en AS ingredient_description_en,
                    i.description_et AS ingredient_description_et,
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

    private mapCraftRecipe(recipeRow: CraftRecipeRow, ingredientRows: CraftRecipeIngredientRow[]): CraftRecipeView {
        return {
            recipeId: recipeRow.recipe_id,
            name: recipeRow.recipe_name,
            description: recipeRow.recipe_description,
            resultAmount: Number(recipeRow.result_amount),
            resultItemTemplateId: recipeRow.result_item_id,
            resultName: recipeRow.result_item_name,
            resultNameRu: recipeRow.result_name_ru,
            resultNameEn: recipeRow.result_name_en,
            resultNameEt: recipeRow.result_name_et,
            resultDescription: recipeRow.result_description,
            resultDescriptionRu: recipeRow.result_description_ru,
            resultDescriptionEn: recipeRow.result_description_en,
            resultDescriptionEt: recipeRow.result_description_et,
            resultEmoji: recipeRow.result_item_emoji,
            resultRarityName: recipeRow.result_rarity_name,
            ingredients: ingredientRows.map(row => ({
                itemTemplateId: row.ingredient_item_id,
                name: row.ingredient_item_name,
                nameRu: row.ingredient_name_ru,
                nameEn: row.ingredient_name_en,
                nameEt: row.ingredient_name_et,
                description: row.ingredient_description,
                descriptionRu: row.ingredient_description_ru,
                descriptionEn: row.ingredient_description_en,
                descriptionEt: row.ingredient_description_et,
                emoji: row.ingredient_item_emoji,
                amount: Number(row.ingredient_amount),
            })),
        };
    }
}