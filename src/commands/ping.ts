import { ButtonInteraction, SlashCommandBuilder } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const row = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('primary')
      .setLabel('Нажми!')
      .setStyle(ButtonStyle.Primary),
  );

const interactionPrimary = async (buttonInteraction: ButtonInteraction) => {
  await buttonInteraction.reply({content: "Ты нажал на кнопку!", ephemeral: true})
}

export default {
  data: new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Отвечает Pong!"),
  async execute(interaction:any){
    await interaction.reply({ content: 'Кнопка:', components: [row] });
  },
  interactions: {
    "primary": interactionPrimary
  }
} 

