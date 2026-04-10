import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { ensureBotAdmin } from "../core/BotAdmin.js";
import { itemService } from "../core/ItemService.js";
import { Command } from "../core/commands/Command.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { CommandName } from "../types/command.type.js";

export default class CraftRecipeCreateCommand extends Command {
    commandName: CommandName = "craftrecipecreate";
    commandAccessLevel = CommandAccessLevels.Public;
    data = new SlashCommandBuilder()
        .setName(this.commandName)
        .setDescription("Create a craft recipe.")
        .addStringOption(option => option.setName("name").setDescription("Recipe name").setRequired(true))
        .addIntegerOption(option => option.setName("result_item_id").setDescription("Result item template id").setAutocomplete(true).setRequired(true))
        .addIntegerOption(option => option.setName("ingredient_1_item_id").setDescription("Ingredient #1 item template id").setAutocomplete(true).setRequired(true))
        .addIntegerOption(option => option.setName("ingredient_1_amount").setDescription("Ingredient #1 amount").setRequired(true))
        .addStringOption(option => option.setName("description").setDescription("Recipe description").setRequired(false))
        .addIntegerOption(option => option.setName("result_amount").setDescription("How many result copies are produced").setRequired(false))
        .addIntegerOption(option => option.setName("ingredient_2_item_id").setDescription("Ingredient #2 item template id").setAutocomplete(true).setRequired(false))
        .addIntegerOption(option => option.setName("ingredient_2_amount").setDescription("Ingredient #2 amount").setRequired(false))
        .addIntegerOption(option => option.setName("ingredient_3_item_id").setDescription("Ingredient #3 item template id").setAutocomplete(true).setRequired(false))
        .addIntegerOption(option => option.setName("ingredient_3_amount").setDescription("Ingredient #3 amount").setRequired(false))
        .addIntegerOption(option => option.setName("ingredient_4_item_id").setDescription("Ingredient #4 item template id").setAutocomplete(true).setRequired(false))
        .addIntegerOption(option => option.setName("ingredient_4_amount").setDescription("Ingredient #4 amount").setRequired(false));

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!await ensureBotAdmin(interaction)) return;

        const ingredients = [1, 2, 3, 4].flatMap(index => {
            const itemId = interaction.options.getInteger(`ingredient_${index}_item_id`);
            const amount = interaction.options.getInteger(`ingredient_${index}_amount`);

            if (itemId === null && amount === null) {
                return [];
            }

            if (itemId === null || amount === null) {
                throw new Error(`Ingredient #${index} must include both item id and amount.`);
            }

            return [{ itemTemplateId: itemId, amount }];
        });

        const response = await itemService.createCraftRecipe({
            name: interaction.options.getString("name", true),
            description: interaction.options.getString("description"),
            resultItemTemplateId: interaction.options.getInteger("result_item_id", true),
            resultAmount: interaction.options.getInteger("result_amount") ?? 1,
            ingredients,
            createdByDiscordId: interaction.user.id,
        });

        if (!response.success) {
            await interaction.reply({ content: response.error.message ?? "Failed to create craft recipe.", flags: ["Ephemeral"] });
            return;
        }

        await interaction.reply({ content: `Craft recipe created with id \`${response.data.recipeId}\`.`, flags: ["Ephemeral"] });
    }

    autocomplete = async (interaction: AutocompleteInteraction): Promise<void> => {
        const focused = interaction.options.getFocused(true);
        if (!focused.name.endsWith("item_id") && focused.name !== "result_item_id") {
            await interaction.respond([]);
            return;
        }

        const response = await itemService.searchItemTemplates(String(focused.value ?? ""));
        await interaction.respond(response.success ? response.data : []);
    };
}