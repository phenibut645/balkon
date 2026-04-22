import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { isBotContributor } from "../core/BotAdmin.js";
import { Command } from "../core/commands/Command.js";
import MenuCommand from "./menu.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { CommandName } from "../types/command.type.js";
import { getUserLocale } from "../utils/commandLocale.js";
import { t } from "../utils/i18n.js";

export default class BotMenuCommand extends Command {
    commandName: CommandName = "botmenu";
    commandAccessLevel = CommandAccessLevels.Public;
    data = new SlashCommandBuilder()
        .setName(this.commandName)
        .setDescription("Open the bot administration menu.");

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const locale = await getUserLocale(interaction.user.id);
        if (!await isBotContributor(interaction.user.id)) {
            await interaction.reply({ content: t(locale, "menu.messages.admin_only"), flags: ["Ephemeral"] });
            return;
        }

        const menuCommand = new MenuCommand();
        await menuCommand.openMenu(interaction, "admin");
    }
}