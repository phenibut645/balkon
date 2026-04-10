import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { streamerService } from "../core/StreamerService.js";
import { itemService } from "../core/ItemService.js";
import { Command } from "../core/commands/Command.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { CommandName } from "../types/command.type.js";
import { getUserLocale, getYesNo } from "../utils/commandLocale.js";
import { t } from "../utils/i18n.js";

export default class ServiceUseCommand extends Command {
    commandName: CommandName = "serviceuse";
    commandAccessLevel = CommandAccessLevels.Public;
    data = new SlashCommandBuilder()
        .setName(this.commandName)
        .setDescription("Use a service item against a streamer registered on this server.")
        .addIntegerOption(option => option.setName("inventory_item_id").setDescription("Your service inventory item id").setAutocomplete(true).setRequired(true))
        .addStringOption(option => option.setName("streamer").setDescription("Registered streamer nickname on this server").setAutocomplete(true).setRequired(false))
        .addStringOption(option => option.setName("text").setDescription("Optional custom text for text-based services").setRequired(false));

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const locale = await getUserLocale(interaction.user.id);
        if (!interaction.guildId) {
            await interaction.reply({ content: t(locale, "commands.serviceuse.guild_only"), flags: ["Ephemeral"] });
            return;
        }

        const response = await streamerService.useServiceItem({
            discordUserId: interaction.user.id,
            discordGuildId: interaction.guildId,
            inventoryItemId: interaction.options.getInteger("inventory_item_id", true),
            streamerNickname: interaction.options.getString("streamer"),
            customText: interaction.options.getString("text"),
        });

        await interaction.reply({
            content: response.success
                ? t(locale, "commands.serviceuse.success", {
                    streamer: response.data.streamerNickname,
                    actionType: response.data.actionType,
                    consumed: getYesNo(locale, response.data.consumed),
                })
                : response.error.message ?? t(locale, "commands.serviceuse.failed"),
            flags: ["Ephemeral"],
        });
    }

    autocomplete = async (interaction: AutocompleteInteraction): Promise<void> => {
        const focused = interaction.options.getFocused(true);
        if (focused.name === "inventory_item_id") {
            const response = await itemService.searchUserInventory(interaction.user.id, String(focused.value ?? ""));
            await interaction.respond(response.success ? response.data : []);
            return;
        }

        if (focused.name === "streamer") {
            if (!interaction.guildId) {
                await interaction.respond([]);
                return;
            }

            const response = await streamerService.searchGuildStreamers(interaction.guildId, String(focused.value ?? ""));
            await interaction.respond(response.success ? response.data : []);
            return;
        }

        await interaction.respond([]);
    };
}