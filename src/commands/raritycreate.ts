import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { ensureBotAdmin } from "../core/BotAdmin.js";
import { itemService } from "../core/ItemService.js";
import { Command } from "../core/commands/Command.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { CommandName } from "../types/command.type.js";

export default class RarityCreateCommand extends Command {
    commandName: CommandName = "raritycreate";
    commandAccessLevel = CommandAccessLevels.Public;
    data = new SlashCommandBuilder()
        .setName(this.commandName)
        .setDescription("Create a new item rarity.")
        .addStringOption(option =>
            option.setName("name")
                .setDescription("Rarity name")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("color")
                .setDescription("Hex color like #ffcc00")
                .setRequired(false)
        );

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!await ensureBotAdmin(interaction)) return;

        const name = interaction.options.getString("name", true);
        const color = interaction.options.getString("color") ?? undefined;
        const response = await itemService.createRarity(name, color);

        if (!response.success) {
            await interaction.reply({
                content: response.error.message ?? "Failed to create rarity.",
                flags: ["Ephemeral"],
            });
            return;
        }

        await interaction.reply({
            content: `Rarity \`${name}\` created with id \`${response.data.insertId}\`.`,
            flags: ["Ephemeral"],
        });
    }
}
