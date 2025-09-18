import { Interaction } from "discord.js";
import { commands } from "../bot.js";

export const interactionCreateController = async (interaction: Interaction) => {
  if(interaction.isChatInputCommand()){
    const command = commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: "⚠️ Error while running the command!", ephemeral: true });
    }
  }
}