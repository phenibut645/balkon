import { SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Отвечает Pong!"),
  async execute(interaction:any){
    await interaction.reply({ content: 'bruh', ephemeral: true});
    await interaction.member.send("gg")
  },
  interactions: {}
} 

