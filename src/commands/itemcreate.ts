import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { ensureBotAdmin } from "../core/BotAdmin.js";
import { itemService } from "../core/ItemService.js";
import { Command } from "../core/commands/Command.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { CommandName } from "../types/command.type.js";

export default class ItemCreateCommand extends Command {
    commandName: CommandName = "itemcreate";
    commandAccessLevel = CommandAccessLevels.Public;
    data = new SlashCommandBuilder()
        .setName(this.commandName)
        .setDescription("Create a new item template.")
        .addStringOption(option =>
            option.setName("name")
                .setDescription("Item name")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("description")
                .setDescription("Item description")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("rarity")
                .setDescription("Existing rarity name")
                .setAutocomplete(true)
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("type")
                .setDescription("Item type like material, role, treasure, service, misc")
                .setAutocomplete(true)
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName("tradeable")
                .setDescription("Can players trade this item?")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("emoji")
                .setDescription("Fallback emoji for the item")
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName("image_url")
                .setDescription("Direct image URL")
                .setRequired(false)
        )
        .addNumberOption(option =>
            option.setName("bot_sell_price")
                .setDescription("Static bot sell price")
                .setRequired(false)
        );

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!await ensureBotAdmin(interaction)) return;

        const response = await itemService.createItemTemplate({
            name: interaction.options.getString("name", true),
            description: interaction.options.getString("description", true),
            emoji: interaction.options.getString("emoji"),
            rarityName: interaction.options.getString("rarity", true),
            typeName: interaction.options.getString("type", true),
            tradeable: interaction.options.getBoolean("tradeable", true),
            imageUrl: interaction.options.getString("image_url"),
            botSellPrice: interaction.options.getNumber("bot_sell_price"),
            createdByDiscordId: interaction.user.id,
        });

        if (!response.success) {
            await interaction.reply({
                content: response.error.message ?? "Failed to create item template.",
                flags: ["Ephemeral"],
            });
            return;
        }

        await interaction.reply({
            content: `Item template created with id \`${response.data.insertId}\`.`,
            flags: ["Ephemeral"],
        });
    }

    autocomplete = async (interaction: AutocompleteInteraction): Promise<void> => {
        const focused = interaction.options.getFocused(true);
        if (focused.name === "rarity") {
            const response = await itemService.searchRarities(String(focused.value ?? ""));
            await interaction.respond(response.success ? response.data : []);
            return;
        }

        if (focused.name === "type") {
            const response = await itemService.searchItemTypes(String(focused.value ?? ""));
            await interaction.respond(response.success ? response.data : []);
            return;
        }

        await interaction.respond([]);
    };
}
