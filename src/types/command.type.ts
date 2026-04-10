import { 
    SlashCommandBuilder, ChatInputCommandInteraction, 
    ButtonInteraction, StringSelectMenuInteraction, ModalSubmitInteraction, AutocompleteInteraction, UserSelectMenuInteraction
} from "discord.js";

export type CommandName = string;

export interface ButtonExecutionFunc {
    (interaction: ButtonInteraction): Promise<void>
}

export interface StringSelectMenuExecutionFunc {
    (interaction: StringSelectMenuInteraction): Promise<void>
}

export interface UserSelectMenuExecutionFunc {
    (interaction: UserSelectMenuInteraction): Promise<void>
}

export interface ModalsExecutionFunc {
    (interaction: ModalSubmitInteraction): Promise<void>
}

export interface AutocompleteExecutionFunc {
    (interaction: AutocompleteInteraction): Promise<void>
}
