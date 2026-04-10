import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { ensureBotAdmin } from "../core/BotAdmin.js";
import { itemService } from "../core/ItemService.js";
import { Command } from "../core/commands/Command.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { CommandName } from "../types/command.type.js";
import { getUserLocale, getYesNo } from "../utils/commandLocale.js";
import { t } from "../utils/i18n.js";

export default class ItemCatalogCommand extends Command {
    commandName: CommandName = "itemcatalog";
    commandAccessLevel = CommandAccessLevels.Public;
    data = new SlashCommandBuilder()
        .setName(this.commandName)
        .setDescription("Show item templates catalog.");

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!await ensureBotAdmin(interaction)) return;

        const locale = await getUserLocale(interaction.user.id);
        const response = await itemService.listItemTemplates();
        if (!response.success) {
            await interaction.reply({
                content: response.error.message ?? t(locale, "commands.itemcatalog.load_failed"),
                flags: ["Ephemeral"],
            });
            return;
        }

        if (!response.data.length) {
            await interaction.reply({
                content: t(locale, "commands.itemcatalog.empty"),
                flags: ["Ephemeral"],
            });
            return;
        }

        const text = response.data.slice(0, 30).map(item =>
            t(locale, "commands.itemcatalog.line", {
                id: String(item.id),
                emoji: item.emoji ?? "📦",
                name: item.name,
                rarity: item.rarity_name,
                type: item.item_type_name,
                tradeable: getYesNo(locale, Boolean(item.tradeable)),
                sellable: getYesNo(locale, Boolean(item.sellable)),
            })
        ).join("\n");

        const moreText = response.data.length > 30
            ? `\n${t(locale, "commands.itemcatalog.more", { count: String(response.data.length - 30) })}`
            : "";

        const embed = new EmbedBuilder()
            .setTitle(t(locale, "commands.itemcatalog.title"))
            .setDescription(`${text}${moreText}`)
            .addFields(
                { name: t(locale, "commands.itemcatalog.actions_label"), value: t(locale, "commands.itemcatalog.actions_value") },
            )
            .setFooter({ text: t(locale, "commands.itemcatalog.footer") });

        await interaction.reply({
            embeds: [embed],
            flags: ["Ephemeral"],
        });
    }
}
