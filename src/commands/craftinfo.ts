import { AutocompleteInteraction, ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { itemService } from "../core/ItemService.js";
import { Command } from "../core/commands/Command.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { CommandName } from "../types/command.type.js";
import { getUserLocale } from "../utils/commandLocale.js";
import { t } from "../utils/i18n.js";

export default class CraftInfoCommand extends Command {
    commandName: CommandName = "craftinfo";
    commandAccessLevel = CommandAccessLevels.Public;
    data = new SlashCommandBuilder()
        .setName(this.commandName)
        .setDescription("Show full information about one craft recipe.")
        .addIntegerOption(option => option.setName("recipe_id").setDescription("Craft recipe id").setAutocomplete(true).setRequired(true));

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const locale = await getUserLocale(interaction.user.id);
        const recipeId = interaction.options.getInteger("recipe_id", true);
        const response = await itemService.getCraftRecipeById(recipeId);
        if (!response.success) {
            await interaction.reply({ content: response.error.message ?? t(locale, "commands.craftinfo.load_failed"), flags: ["Ephemeral"] });
            return;
        }

        if (!response.data) {
            await interaction.reply({ content: t(locale, "commands.craftinfo.not_found", { recipeId: String(recipeId) }), flags: ["Ephemeral"] });
            return;
        }

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle(`${response.data.resultEmoji ?? "📦"} ${response.data.name}`)
                    .setDescription(response.data.description ?? t(locale, "commands.craftinfo.no_description"))
                    .addFields(
                        { name: t(locale, "commands.craftinfo.recipe_id"), value: String(response.data.recipeId), inline: true },
                        { name: t(locale, "commands.craftinfo.result"), value: `${response.data.resultEmoji ?? "📦"} ${response.data.resultName} x${response.data.resultAmount}`, inline: true },
                        { name: t(locale, "commands.craftinfo.rarity"), value: response.data.resultRarityName, inline: true },
                        { name: t(locale, "commands.craftinfo.ingredients"), value: response.data.ingredients.map(ingredient => `${ingredient.emoji ?? "📦"} ${ingredient.name} x${ingredient.amount}`).join("\n") },
                    )
            ],
            flags: ["Ephemeral"],
        });
    }

    autocomplete = async (interaction: AutocompleteInteraction): Promise<void> => {
        const focused = interaction.options.getFocused(true);
        if (focused.name !== "recipe_id") {
            await interaction.respond([]);
            return;
        }

        const response = await itemService.searchCraftRecipes(String(focused.value ?? ""));
        await interaction.respond(response.success ? response.data : []);
    };
}