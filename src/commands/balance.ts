import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { dataBaseHandler, DataBaseHandler } from "../core/DataBaseHandler.js";
import { CommandAccessLevels, MembersDB } from "../types/database.types.js";
import { Command } from "../core/commands/Command.js";
import { CommandName } from "../types/command.type.js";
import { getUserLocale } from "../utils/commandLocale.js";
import { t } from "../utils/i18n.js";

export default class BalanceCommand extends Command {
    data: SlashCommandBuilder
    commandAccessLevel = CommandAccessLevels.Public

    constructor(){
        super();
        const builder = new SlashCommandBuilder()
            .setName("balance")
            .setDescription("Show your current ODM and LDM balance.");
        this.data = builder;
    }
    commandName: CommandName = "balance";

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const locale = await getUserLocale(interaction.user.id);
        const balance = await dataBaseHandler.getFromTable<MembersDB>("members", {ds_member_id: interaction.user.id}, ["balance", "ldm_balance"])
        if(DataBaseHandler.isSuccess(balance) && balance.data.length){
            const embed = new EmbedBuilder()
            .setTitle(t(locale, "commands.balance.title"))
            .setColor("White")
            .addFields(
                { name: t(locale, "commands.balance.odm"), value: String(balance.data[0].balance), inline: true },
                { name: t(locale, "commands.balance.ldm"), value: String(balance.data[0].ldm_balance ?? 0), inline: true },
            )
            .setFooter({ text: t(locale, "commands.balance.footer") })
            await interaction.reply({embeds: [embed], flags: ["Ephemeral"]})
        }
        else {
            await interaction.reply({content: t(locale, "commands.balance.load_failed"), flags:["Ephemeral"]})
        }
    }
}
