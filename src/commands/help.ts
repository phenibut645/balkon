import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { Command } from "../core/commands/Command.js";
import { CommandName, ButtonExecutionFunc, StringSelectMenuExecutionFunc, ModalsExecutionFunc } from "../types/command.type.js";
import { getUserLocale } from "../utils/commandLocale.js";
import { t } from "../utils/i18n.js";

export default class HelpCommand implements Command{
    data: SlashCommandBuilder;
    commandAccessLevel = CommandAccessLevels.Public

    constructor(){
        const builder = new SlashCommandBuilder()
            .setName("help")
            .setDescription("Узнайте команды и то что они делают.")
        this.data = builder;
    }
    commandName: CommandName = "help";
    buttons?: Map<string, ButtonExecutionFunc> | undefined;
    stringSelectMenu?: Map<string, StringSelectMenuExecutionFunc> | undefined;
    modals?: Map<string, ModalsExecutionFunc> | undefined;

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const locale = await getUserLocale(interaction.user.id);
        interaction.reply({content: t(locale, "commands.help.content"), flags: ["Ephemeral"]})
    }
}
