import { AutocompleteInteraction, ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { isBotAdmin } from "../core/BotAdmin.js";
import { itemService } from "../core/ItemService.js";
import { Command } from "../core/commands/Command.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { CommandName } from "../types/command.type.js";
import { getNotAvailable, getUnknown, getUserLocale, getYesNo } from "../utils/commandLocale.js";
import { t } from "../utils/i18n.js";

export default class ItemViewCommand extends Command {
    commandName: CommandName = "itemview";
    commandAccessLevel = CommandAccessLevels.Public;
    data = new SlashCommandBuilder()
        .setName(this.commandName)
        .setDescription("View one concrete inventory item.")
        .addIntegerOption(option =>
            option.setName("inventory_item_id")
                .setDescription("Inventory item id")
                .setAutocomplete(true)
                .setRequired(true)
        )
        .addUserOption(option =>
            option.setName("user")
                .setDescription("Bot admin can target another user's inventory for autocomplete")
                .setRequired(false)
        );

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const locale = await getUserLocale(interaction.user.id);
        const inventoryItemId = interaction.options.getInteger("inventory_item_id", true);
        const response = await itemService.getInventoryItemById(inventoryItemId);

        if (!response.success) {
            await interaction.reply({
                content: response.error.message ?? t(locale, "commands.itemview.load_failed"),
                flags: ["Ephemeral"],
            });
            return;
        }

        if (!response.data) {
            await interaction.reply({
                content: t(locale, "commands.itemview.not_found"),
                flags: ["Ephemeral"],
            });
            return;
        }

        if (response.data.ownerDiscordId !== interaction.user.id && !isBotAdmin(interaction.user.id)) {
            await interaction.reply({
                content: t(locale, "commands.itemview.forbidden"),
                flags: ["Ephemeral"],
            });
            return;
        }

        const color = normalizeColor(response.data.rarityColorHex);
        const embed = new EmbedBuilder()
            .setTitle(`${response.data.name} (#${response.data.inventoryItemId})`)
            .setDescription(response.data.description)
            .setColor(color)
            .addFields(
                { name: t(locale, "commands.itemview.template_id"), value: String(response.data.itemTemplateId), inline: true },
                { name: t(locale, "commands.itemview.type"), value: response.data.itemType, inline: true },
                { name: t(locale, "commands.itemview.rarity"), value: response.data.rarityName, inline: true },
                { name: t(locale, "commands.itemview.tradeable"), value: getYesNo(locale, response.data.tradeable), inline: true },
                { name: t(locale, "commands.itemview.bot_sell_price"), value: response.data.botSellPrice !== null ? String(response.data.botSellPrice) : getNotAvailable(locale), inline: true },
                { name: t(locale, "commands.itemview.original_owner"), value: response.data.originalOwnerDiscordId ? `<@${response.data.originalOwnerDiscordId}>` : getUnknown(locale), inline: true },
            )
            .setFooter({ text: t(locale, "commands.itemview.footer", { date: response.data.obtainedAt.toLocaleString() }) });

        if (response.data.imageUrl) {
            embed.setImage(response.data.imageUrl);
        }

        await interaction.reply({
            embeds: [embed],
            flags: ["Ephemeral"],
        });
    }

    autocomplete = async (interaction: AutocompleteInteraction): Promise<void> => {
        const focused = interaction.options.getFocused(true);
        if (focused.name !== "inventory_item_id") {
            await interaction.respond([]);
            return;
        }

        const rawTargetUserId = interaction.options.data.find(option => option.name === "user")?.value;
        const targetUserId = typeof rawTargetUserId === "string" ? rawTargetUserId : null;
        const inventoryOwnerId = targetUserId && isBotAdmin(interaction.user.id)
            ? targetUserId
            : interaction.user.id;

        const response = await itemService.searchUserInventory(inventoryOwnerId, String(focused.value ?? ""));
        await interaction.respond(response.success ? response.data : []);
    };
}

function normalizeColor(colorHex: string | null): number {
    if (!colorHex) {
        return 0x95a5a6;
    }

    return Number.parseInt(colorHex.replace("#", ""), 16);
}
