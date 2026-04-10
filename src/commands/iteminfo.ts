import { AutocompleteInteraction, ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { ensureBotAdmin } from "../core/BotAdmin.js";
import { itemService } from "../core/ItemService.js";
import { Command } from "../core/commands/Command.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { CommandName } from "../types/command.type.js";
import { getNotAvailable, getUserLocale, getYesNo } from "../utils/commandLocale.js";
import { t } from "../utils/i18n.js";

export default class ItemInfoCommand extends Command {
    commandName: CommandName = "iteminfo";
    commandAccessLevel = CommandAccessLevels.Public;
    data = new SlashCommandBuilder()
        .setName(this.commandName)
        .setDescription("Show full info about one item template by id.")
        .addIntegerOption(option =>
            option.setName("item_id")
                .setDescription("Item template id")
                .setAutocomplete(true)
                .setRequired(true)
        );

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!await ensureBotAdmin(interaction)) return;

        const locale = await getUserLocale(interaction.user.id);
        const itemId = interaction.options.getInteger("item_id", true);
        const response = await itemService.getItemTemplateById(itemId);

        if (!response.success) {
            await interaction.reply({
                content: response.error.message ?? t(locale, "commands.iteminfo.load_failed"),
                flags: ["Ephemeral"],
            });
            return;
        }

        if (!response.data) {
            await interaction.reply({
                content: t(locale, "commands.iteminfo.not_found", { itemId: String(itemId) }),
                flags: ["Ephemeral"],
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(`${response.data.emoji ?? "📦"} ${response.data.name} (#${response.data.id})`)
            .setDescription(response.data.description)
            .setColor(normalizeColor(response.data.rarityColorHex))
            .addFields(
                { name: t(locale, "commands.iteminfo.rarity"), value: response.data.rarityName, inline: true },
                { name: t(locale, "commands.iteminfo.type"), value: response.data.itemType, inline: true },
                { name: t(locale, "commands.iteminfo.tradeable"), value: getYesNo(locale, response.data.tradeable), inline: true },
                { name: t(locale, "commands.iteminfo.bot_sellable"), value: getYesNo(locale, response.data.sellable), inline: true },
                { name: t(locale, "commands.iteminfo.bot_sell_price"), value: response.data.botSellPrice !== null ? `${response.data.botSellPrice} ODM` : getNotAvailable(locale), inline: true },
                { name: t(locale, "commands.iteminfo.image"), value: response.data.imageUrl ? t(locale, "commands.iteminfo.image_attached") : t(locale, "commands.iteminfo.no_image"), inline: true },
            )
            .setFooter({ text: t(locale, "commands.iteminfo.footer") });

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
        if (focused.name !== "item_id") {
            await interaction.respond([]);
            return;
        }

        const response = await itemService.searchItemTemplates(String(focused.value ?? ""));
        await interaction.respond(response.success ? response.data : []);
    };
}

function normalizeColor(colorHex: string | null): number {
    if (!colorHex) {
        return 0x95a5a6;
    }

    return Number.parseInt(colorHex.replace("#", ""), 16);
}
