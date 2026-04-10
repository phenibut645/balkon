import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { TwitchHandler } from "../core/TwitchHandler.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { Command } from "../core/commands/Command.js";
import { CommandName } from "../types/command.type.js";
import { getUserLocale } from "../utils/commandLocale.js";
import { t } from "../utils/i18n.js";

export default class IsLiveCommand extends Command {
  commandName: CommandName = "islive";
  data: SlashCommandBuilder
  commandAccessLevel = CommandAccessLevels.Public

  constructor() {
    super();
    
    const builder = new SlashCommandBuilder()
    .setName("islive")
    .setDescription("Говорит о том, стримит ли стример сейчас.")
    builder.addStringOption((option: any) => option
      .setName("nickname")
      .setDescription("Ник стримера")
      .setRequired(true))

    this.data = builder
  }

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const locale = await getUserLocale(interaction.user.id)
    const nickname = interaction.options.getString("nickname")
    if(nickname){
      const streamerInfo = await TwitchHandler.getInstance().getStreamerInfo(nickname)
      await interaction.reply({
        content: streamerInfo.isLive
          ? t(locale, "commands.islive.streaming", { nickname })
          : t(locale, "commands.islive.not_streaming", { nickname }),
        flags: ["Ephemeral"]
      });
    }
    else{
      await interaction.reply({content: t(locale, "commands.islive.missing_nickname"), flags: ["Ephemeral"]})
    }
  }
}
