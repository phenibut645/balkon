import { Client, TextChannel, EmbedBuilder, MessageMentionTypes } from "discord.js";
import { TwitchHandler } from "./utils/TwitchHandler.js";
import type { IStreamers } from "./types/streamers.types.ts";

export async function checkStream(client: Client, streamers: IStreamers) {
  const twitchHandler = TwitchHandler.getInstance();
  for (const streamer of Object.keys(streamers)) {
    const streamerObj = streamers[streamer];
    const streamerInfo = await twitchHandler.getStreamerInfo(streamer);
    const guild = await client.guilds.fetch(streamerObj.guild_id);

    for (const channelObj of streamerObj.channels) {
      const channel = await guild.channels.fetch(channelObj.id);

      if (!channel?.isTextBased()) continue;

      if (!streamerInfo.isLive) {
        streamerObj.is_live = false;

        if (channelObj.message_id) {
          try {
            const message = await (channel as TextChannel).messages.fetch(channelObj.message_id);
            await message.delete();
          } catch (e) {
            console.warn(`⚠️ Failed to delete message: ${channelObj.message_id}`, e);
          }
          channelObj.message_id = null;
        }

        continue;
      }

      const avatar = await twitchHandler.getAvatar(streamer);
      const notificationEmbed = new EmbedBuilder()
        .setTitle(`${streamer} стримит прямо сейчас!`)
        .setDescription(streamerInfo.title ?? "Нет заголовка")
        .setColor(0x9146ff)
        .setURL(streamerObj.twitch_url ?? `https://www.twitch.tv/${streamer}`)
        .setFooter({ text: "by Balkon" });

      if (avatar?.avatar) notificationEmbed.setThumbnail(avatar.avatar);
      if (avatar?.banner) notificationEmbed.setImage(avatar.banner);

      notificationEmbed.addFields(
        { name: "Игра:", value: streamerInfo.game ?? "Неизвестно", inline: true },
        { name: "Зрители:", value: String(streamerInfo.viewer_count ?? 0), inline: true },
        { name: "URL:", value: streamerObj.twitch_url ?? "" }
      );

      const messageTemplate = {
        content: "@everyone",
        embeds: [notificationEmbed],
        allowedMentions: { parse: ["everyone"] as readonly MessageMentionTypes[] },
      };

      if (streamerInfo.isLive && !channelObj.message_id) {
        streamerObj.is_live = true;
        const message = await (channel as TextChannel).send(messageTemplate);
        channelObj.message_id = message.id;
      }
      else if (channelObj.message_id) {
        try {
          const message = await (channel as TextChannel).messages.fetch(channelObj.message_id);
          await message.edit(messageTemplate);
        } catch (e) {
          console.warn(`⚠️ Failed to edit message: ${channelObj.message_id}`, e);
          channelObj.message_id = null;
        }
      }
    }
  }
}
