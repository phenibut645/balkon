import { 
    SlashCommandBuilder, ChatInputCommandInteraction, 
    ButtonInteraction, StringSelectMenuInteraction, ModalSubmitInteraction 
} from "discord.js";
import { CommandAccessLevels } from "./database.types.js";
import { CommandDTO } from "../dto/CommandDTO.js";

export type CommandName = "balance" | "help" | "isLive" | "ping" | "roulette";

export interface ButtonExecutionFunc {
    (interaction: ButtonInteraction): Promise<void>
}

export interface StringSelectMenuExecutionFunc {
    (interaction: StringSelectMenuInteraction): Promise<void>
}

export interface ModalsExecutionFunc {
    (interaction: ModalSubmitInteraction): Promise<void>
}
