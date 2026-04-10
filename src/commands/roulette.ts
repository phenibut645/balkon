import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { ButtonExecutionFunc, CommandName } from "../types/command.type.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { commandSessionHandler } from "../core/commands/CommandSessionHandler.js";
import { Command } from "../core/commands/Command.js";
import { CommandDTO } from "../dto/CommandDTO.js";
import { dataBaseHandler, UpdateType } from "../core/DataBaseHandler.js";

export interface RouletteSession {
    bullet: number,
    bet: number,
    alive: boolean
}   

export function isRouletteSession(session: object): session is RouletteSession {
    return Object.hasOwn(session, "bullet") && Object.hasOwn(session, "alive")
}

const MAX_BULLETS = 6;
const WIN_MULTIPLY = 1.6;

export default class RouletteCommand extends Command {
    commandName: CommandName = "roulette"
    data: SlashCommandBuilder 

    commandAccessLevel = CommandAccessLevels.Public
    buttons: Map<string, ButtonExecutionFunc>;

    playCommand = new CommandDTO(this.commandName, "play")
    declineCommand = new CommandDTO(this.commandName, "decline")
    shootCommand = new CommandDTO(this.commandName, "shoot")

    constructor() {
        super();

        const builder = new SlashCommandBuilder()
            .setName(this.commandName)
            .setDescription("Игра в русскую рулетку...")
        builder.addNumberOption(option => 
            option.setName("bet")
                .setDescription("Ставка на выживание")
                .setRequired(true)
        );

        this.data = builder

        this.buttons = new Map();
        this.buttons.set(this.playCommand.toString(), this.play)
        this.buttons.set(this.declineCommand.toString(), this.decline)
        this.buttons.set(this.shootCommand.toString(), this.shoot)
    }
    

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await dataBaseHandler.isMemberExists(interaction.user.id, true);
        const bet = interaction.options.getNumber("bet");

        if (bet === null || bet <= 0) {
            await interaction.reply({ content: "Укажите ставку больше 0.", flags: ["Ephemeral"] });
            return;
        }
        
        commandSessionHandler.createSession(interaction.user.id, this.commandName, {
            bullet: 0,
            bet,
            alive: true
        })

        const buttons = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(this.declineCommand.toString())
                    .setLabel("Отказаться")
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(this.playCommand.toString())
                    .setLabel("Согласиться")
                    .setStyle(ButtonStyle.Success)
            )
        await interaction.reply({content: "Действительно ли вы хотите сыграть?", flags: ["Ephemeral"], components: [buttons]})
    }

    play: ButtonExecutionFunc = async (interaction) => {
        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(this.shootCommand.toString())
                    .setLabel("Стреляю")
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(this.declineCommand.toString())
                    .setLabel("Я передумал")
                    .setStyle(ButtonStyle.Primary)
            )
        
        await interaction.update({content: `Итак, в барабане сейчас находится ${MAX_BULLETS} патронов. Стреляешь?`, components: [row]})
    }

    decline: ButtonExecutionFunc = async (interaction) => {
        commandSessionHandler.deleteSession(interaction.user.id, this.commandName)
        await interaction.update({content: "Ну, как хочешь.", components: []})
    }

    private randomShoot(attempt: number): boolean {
        const randomNumber = Math.random();
        console.log(randomNumber, MAX_BULLETS / attempt)
        return randomNumber > attempt / MAX_BULLETS;
    }

    shoot: ButtonExecutionFunc = async (interaction) => {
        const session = commandSessionHandler.getSession(interaction.user.id, this.commandName)
        if(session && isRouletteSession(session)){
            const attempt = this.randomShoot(session.bullet + 1)
            if(attempt) {
                session.bullet = session.bullet + 1

                if(session.bullet < MAX_BULLETS){
                    const row = new ActionRowBuilder<ButtonBuilder>()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(this.shootCommand.toString())
                                .setLabel("Стреляю!")
                                .setStyle(ButtonStyle.Danger),
                            new ButtonBuilder()
                                .setCustomId(this.declineCommand.toString())
                                .setLabel("Пожалуй нет.")
                                .setStyle(ButtonStyle.Secondary)
                        )
                    
                    commandSessionHandler.updateSession(interaction.user.id, this.commandName, session);
                    await interaction.update({content: `Поздравляю, ${session.bullet} из ${MAX_BULLETS} холостая. Продолжим?`, components: [row]})
                }
                else if(session.bullet === MAX_BULLETS){
                    commandSessionHandler.deleteSession(interaction.user.id, this.commandName);
                    await dataBaseHandler.updateTable(
                        "members",
                        "balance",
                        session.bet * WIN_MULTIPLY,
                        { ds_member_id: interaction.user.id },
                        UpdateType.Add
                    );
                    await interaction.update({content: `Поздравляю, ты выжил после всех ${MAX_BULLETS} пуль! Ты заработал ${session.bet * WIN_MULTIPLY}`, components: []})
                }

            }
            else {
                commandSessionHandler.updateSession(interaction.user.id, this.commandName, {
                    bullet: 0,
                    bet: session.bet,
                    alive: true
                })

                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(this.playCommand.toString())
                            .setLabel("Еще раз!")
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId(this.declineCommand.toString())
                            .setLabel("Не")
                            .setStyle(ButtonStyle.Primary)
                    )
                await interaction.update({content: `К сожалению ${session.bullet + 1} из ${MAX_BULLETS} оказалась не холостой и вы умерли... Сыграем еще раз?`, components: [row]})
            }
        }
        else{
            const playButton = new ButtonBuilder()
                .setCustomId(this.playCommand.toString())
                .setLabel("Играть")
                .setStyle(ButtonStyle.Primary)
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(playButton)

            await interaction.reply({content: "К сожалению сессия вашей рулетки не найдена либо устарела, начните заново.", flags: ["Ephemeral"], components:[row]})
        }
    }
}
