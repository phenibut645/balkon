import { SlashCommandBuilder } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const row = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('primary')
      .setLabel('Нажми!')
      .setStyle(ButtonStyle.Primary),
  );

export const command = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Отвечает Pong!");

export async function execute(interaction: any) {
  await interaction.reply({ content: 'Кнопка:', components: [row] });
}
