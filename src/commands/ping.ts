import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { Command } from "../core/commands/Command.js";
import { CommandName } from "../types/command.type.js";

export default class PingCommand extends Command {
  commandName: CommandName = "ping";
  data = new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Проверка")
  commandAccessLevel = CommandAccessLevels.Public

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    interaction.reply({content: "pong", flags: ["Ephemeral"]})
  }
}