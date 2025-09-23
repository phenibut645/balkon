import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { ButtonExecutionFunc, CommandName, ModalsExecutionFunc, StringSelectMenuExecutionFunc } from "../../types/command.type.js";
import { CommandAccessLevels } from "../../types/database.types.js";
import { CommandDTO } from "../../dto/CommandDTO.js";

export abstract class Command {
  abstract commandName: CommandName;
  abstract data: SlashCommandBuilder;
  abstract commandAccessLevel: CommandAccessLevels;

  buttons?: Map<string, ButtonExecutionFunc>;
  stringSelectMenu?: Map<string, StringSelectMenuExecutionFunc>;
  modals?: Map<string, ModalsExecutionFunc>;

  abstract execute(interaction: ChatInputCommandInteraction): Promise<void>;

  toString(): string {
    return `${this.commandName}`;
  }

}
