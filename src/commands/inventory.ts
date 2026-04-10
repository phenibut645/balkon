import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { canViewForeignInventory } from "../core/BotAdmin.js";
import { InventoryItemView, itemService } from "../core/ItemService.js";
import { Command } from "../core/commands/Command.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { CommandName } from "../types/command.type.js";
import { LocalesCodes } from "../types/locales.type.js";
import { getUserLocale } from "../utils/commandLocale.js";
import { t } from "../utils/i18n.js";

export default class InventoryCommand extends Command {
    commandName: CommandName = "inventory";
    commandAccessLevel = CommandAccessLevels.Public;
    data = new SlashCommandBuilder()
        .setName(this.commandName)
        .setDescription("Show your inventory.")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("View someone else's inventory if you are bot admin")
                .setRequired(false)
        );

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const locale = await getUserLocale(interaction.user.id);
        const targetUser = interaction.options.getUser("user") ?? interaction.user;
        if (!canViewForeignInventory(interaction.user.id, targetUser)) {
            await interaction.reply({
                content: t(locale, "commands.inventory.forbidden_foreign"),
                flags: ["Ephemeral"],
            });
            return;
        }

        const response = await itemService.getInventory(targetUser.id);
        if (!response.success) {
            await interaction.reply({
                content: response.error.message ?? t(locale, "commands.inventory.load_failed"),
                flags: ["Ephemeral"],
            });
            return;
        }

        if (!response.data.length) {
            await interaction.reply({
                content: t(locale, "commands.inventory.empty", { user: targetUser.username }),
                flags: ["Ephemeral"],
            });
            return;
        }

        const preview = response.data.slice(0, 20).map(item => this.formatInventoryLine(item, locale)).join("\n");
        const moreText = response.data.length > 20
            ? `\n${t(locale, "commands.inventory.more", { count: String(response.data.length - 20) })}`
            : "";

        const embed = new EmbedBuilder()
            .setTitle(t(locale, "commands.inventory.title", { user: targetUser.username }))
            .setDescription(`${preview}${moreText}`)
            .addFields(
                { name: t(locale, "commands.inventory.summary_label"), value: t(locale, "commands.inventory.summary_value", { count: String(response.data.length) }) },
            )
            .setFooter({ text: t(locale, "commands.inventory.footer") });

        await interaction.reply({
            embeds: [embed],
            flags: ["Ephemeral"],
        });
    }

    private formatInventoryLine(item: InventoryItemView, locale: LocalesCodes): string {
        return t(locale, "commands.inventory.line", {
            id: String(item.inventoryItemId),
            emoji: item.emoji ?? "📦",
            name: item.name,
            rarity: item.rarityName,
            type: item.itemType,
        });
    }
}
