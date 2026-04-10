import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { ensureBotAdmin } from "../core/BotAdmin.js";
import { itemService } from "../core/ItemService.js";
import { Command } from "../core/commands/Command.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { CommandName } from "../types/command.type.js";

export default class ItemGiveCommand extends Command {
    commandName: CommandName = "itemgive";
    commandAccessLevel = CommandAccessLevels.Public;
    data = new SlashCommandBuilder()
        .setName(this.commandName)
        .setDescription("Give an item template to a user.")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("Target user")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName("item_id")
                .setDescription("Item template id")
                .setAutocomplete(true)
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName("amount")
                .setDescription("How many copies to give")
                .setRequired(false)
        );

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!await ensureBotAdmin(interaction)) return;

        const targetUser = interaction.options.getUser("user", true);
        const itemId = interaction.options.getInteger("item_id", true);
        const amount = interaction.options.getInteger("amount") ?? 1;

        if (amount <= 0) {
            await interaction.reply({
                content: "Amount must be greater than 0.",
                flags: ["Ephemeral"],
            });
            return;
        }

        const response = await itemService.giveItemToMember(itemId, targetUser.id, amount);
        if (!response.success) {
            await interaction.reply({
                content: response.error.message ?? "Failed to give item.",
                flags: ["Ephemeral"],
            });
            return;
        }

        await interaction.reply({
            content: `Given \`${amount}\` item(s) of template \`${itemId}\` to <@${targetUser.id}>.`,
            flags: ["Ephemeral"],
        });
    }

    autocomplete = async (interaction: AutocompleteInteraction): Promise<void> => {
        const focused = interaction.options.getFocused(true);
        if (focused.name !== "item_id") {
            await interaction.respond([]);
            return;
        }

        const response = await itemService.searchItemTemplates(String(focused.value ?? ""));
        await interaction.respond(response.success ? response.data : []);
    };
}
