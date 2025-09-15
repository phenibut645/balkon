import { ButtonInteraction, SlashCommandBuilder } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { TwitchHandler } from "../utils/TwitchHandler.js";



export default {
  data: new SlashCommandBuilder()
  .setName("islive")
  .setDescription("Говорит о том, стримит ли стример сейчас.")
  .addStringOption(option => option
    .setName("nickname")
    .setDescription("Ник стримера")
    .setRequired(true)),
  async execute(interaction:any){
    const nickname = interaction.options.getString("nickname")
    const streamerInfo = await TwitchHandler.getInstance().getStreamerInfo(nickname)
    await interaction.reply({ content: `${nickname} сейчас ${streamerInfo.isLive ? "стримит." : "не стримит"}`});
  },
  interactions: {
    
  }
} 

