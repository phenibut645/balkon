import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { CraftRecipeView, itemService } from "../core/ItemService.js";
import { Command } from "../core/commands/Command.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { CommandName } from "../types/command.type.js";
import { getUserLocale } from "../utils/commandLocale.js";
import { t } from "../utils/i18n.js";

export default class CraftRecipesCommand extends Command {
    commandName: CommandName = "craftrecipes";
    commandAccessLevel = CommandAccessLevels.Public;
    data = new SlashCommandBuilder()
        .setName(this.commandName)
        .setDescription("Show available craft recipes.")
        .addBooleanOption(option =>
            option
                .setName("craftable_only")
                .setDescription("Show only recipes you can craft right now")
                .setRequired(false)
        );

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const locale = await getUserLocale(interaction.user.id);
        const craftableOnly = interaction.options.getBoolean("craftable_only") ?? false;
        const [recipesResponse, inventoryResponse] = await Promise.all([
            itemService.listCraftRecipes(),
            itemService.getInventory(interaction.user.id),
        ]);

        if (!recipesResponse.success) {
            await interaction.reply({ content: recipesResponse.error.message ?? t(locale, "commands.craftrecipes.load_failed"), flags: ["Ephemeral"] });
            return;
        }

        if (!inventoryResponse.success) {
            await interaction.reply({ content: inventoryResponse.error.message ?? t(locale, "commands.craftrecipes.inventory_failed"), flags: ["Ephemeral"] });
            return;
        }

        const availabilityByTemplateId = inventoryResponse.data.reduce<Map<number, number>>((map, item) => {
            map.set(item.itemTemplateId, (map.get(item.itemTemplateId) ?? 0) + 1);
            return map;
        }, new Map());

        const recipes = recipesResponse.data.map(recipe => ({
            recipe,
            craftableCount: this.getCraftableCount(recipe, availabilityByTemplateId),
        }));

        const visibleRecipes = craftableOnly ? recipes.filter(item => item.craftableCount > 0) : recipes;

        if (!recipes.length) {
            await interaction.reply({ content: t(locale, "commands.craftrecipes.empty"), flags: ["Ephemeral"] });
            return;
        }

        if (!visibleRecipes.length) {
            await interaction.reply({ content: t(locale, "commands.craftrecipes.no_craftable"), flags: ["Ephemeral"] });
            return;
        }

        const description = visibleRecipes.slice(0, 20).map(({ recipe, craftableCount }) =>
            t(locale, "commands.craftrecipes.line", {
                id: String(recipe.recipeId),
                emoji: recipe.resultEmoji ?? "📦",
                name: recipe.resultName,
                amount: String(recipe.resultAmount),
                ingredients: recipe.ingredients.map(ingredient => `${ingredient.emoji ?? "📦"} ${ingredient.name} x${ingredient.amount}`).join(", "),
                craftable: String(craftableCount),
            })
        ).join("\n");

        const craftableRecipesCount = recipes.filter(item => item.craftableCount > 0).length;

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle(t(locale, "commands.craftrecipes.title"))
                    .setDescription(description)
                    .addFields(
                        { name: t(locale, "commands.craftrecipes.summary_label"), value: t(locale, "commands.craftrecipes.summary_value", { count: String(visibleRecipes.length) }) },
                        { name: t(locale, "commands.craftrecipes.craftable_label"), value: t(locale, "commands.craftrecipes.craftable_value", { count: String(craftableRecipesCount) }) },
                    )
                    .setFooter({ text: t(locale, "commands.craftrecipes.footer") })
            ],
            flags: ["Ephemeral"],
        });
    }

    private getCraftableCount(recipe: CraftRecipeView, availabilityByTemplateId: Map<number, number>): number {
        if (!recipe.ingredients.length) {
            return 0;
        }

        return recipe.ingredients.reduce((minimum, ingredient) => {
            const available = availabilityByTemplateId.get(ingredient.itemTemplateId) ?? 0;
            const possible = Math.floor(available / ingredient.amount);
            return Math.min(minimum, possible);
        }, Number.MAX_SAFE_INTEGER);
    }
}