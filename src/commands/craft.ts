import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { itemService } from "../core/ItemService.js";
import { Command } from "../core/commands/Command.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { CommandName } from "../types/command.type.js";
import { getUserLocale } from "../utils/commandLocale.js";
import { t } from "../utils/i18n.js";

export default class CraftCommand extends Command {
    commandName: CommandName = "craft";
    commandAccessLevel = CommandAccessLevels.Public;
    data = new SlashCommandBuilder()
        .setName(this.commandName)
        .setDescription("Craft an item from a recipe.")
        .addIntegerOption(option => option.setName("recipe_id").setDescription("Craft recipe id").setAutocomplete(true).setRequired(true))
        .addIntegerOption(option => option.setName("amount").setDescription("How many times to execute the recipe").setRequired(false));

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const locale = await getUserLocale(interaction.user.id);
        const response = await itemService.craftForMember(
            interaction.user.id,
            interaction.options.getInteger("recipe_id", true),
            interaction.options.getInteger("amount") ?? 1,
        );

        if (!response.success) {
            await interaction.reply({ content: response.error.message ?? t(locale, "commands.craft.load_failed"), flags: ["Ephemeral"] });
            return;
        }

        await interaction.reply({
            content: t(locale, "commands.craft.success", {
                crafted: String(response.data.crafted),
                resultAmount: String(response.data.resultAmount),
                templateId: String(response.data.resultItemTemplateId),
            }),
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