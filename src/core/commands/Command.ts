import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import { AutocompleteExecutionFunc, ButtonExecutionFunc, CommandName, ModalsExecutionFunc, StringSelectMenuExecutionFunc, UserSelectMenuExecutionFunc } from "../../types/command.type.js";
import { CommandAccessLevels } from "../../types/database.types.js";
import { CommandDTO } from "../../dto/CommandDTO.js";

export abstract class Command {
  abstract commandName: CommandName;
  abstract data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  abstract commandAccessLevel: CommandAccessLevels;

  buttons?: Map<string, ButtonExecutionFunc>;
  stringSelectMenu?: Map<string, StringSelectMenuExecutionFunc>;
  userSelectMenu?: Map<string, UserSelectMenuExecutionFunc>;
  modals?: Map<string, ModalsExecutionFunc>;
  autocomplete?: AutocompleteExecutionFunc;

  abstract execute(interaction: ChatInputCommandInteraction): Promise<void>;

  toString(): string {
    return `${this.commandName}`;
  }

}
