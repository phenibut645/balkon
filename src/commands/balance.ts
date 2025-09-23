import { ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { dataBaseHandler, DataBaseHandler } from "../core/DataBaseHandler.js";
import { CommandAccessLevels, MembersDB } from "../types/database.types.js";
import { Command } from "../core/commands/Command.js";
import { CommandName, ButtonExecutionFunc, StringSelectMenuExecutionFunc, ModalsExecutionFunc } from "../types/command.type.js";
import { CommandDTO } from "../dto/CommandDTO.js";

export default class BalanceCommand implements Command {
    data: SlashCommandBuilder
    commandAccessLevel = CommandAccessLevels.Public

    constructor(){
        const builder = new SlashCommandBuilder()
            .setName("balance")
            .setDescription("Узнать свой баланс");
        this.data = builder;
        
        
    }
    commandName: CommandName = "balance";
    buttons?: Map<string, ButtonExecutionFunc> | undefined;
    stringSelectMenu?: Map<string, StringSelectMenuExecutionFunc> | undefined;
    modals?: Map<string, ModalsExecutionFunc> | undefined;
    toString(): string {
        throw new Error("Method not implemented.");
    }

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const balance = await dataBaseHandler.getFromTable<MembersDB>("members", {ds_member_id: interaction.member?.user.id}, ["balance"])
        if(DataBaseHandler.isSuccess(balance)){
            const embed = new EmbedBuilder()
            .setTitle("Текущий баланс")
            .setDescription(`- ${balance.data[0].balance}`)
            .setColor("White")
            await interaction.reply({embeds: [embed], flags: ["Ephemeral"]})
        }
        else {
            await interaction.reply({content: "ошибка на стороне бота", flags:"Ephemeral"})
        }
    }
}