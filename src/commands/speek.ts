import { SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
  .setName("speek")
  .setDescription("Скажите что нибудь на стриме")
  .addStringOption(option => option
    .setName("text")
    .setDescription("Текст для озвучки")
    .setRequired(true)),
  async execute(interaction:any){
    await interaction.reply({ content: `пока что ничего нету`, ephemeral: true });
  },
  interactions: {
    
  }
} 

