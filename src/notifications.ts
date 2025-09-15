import { Client } from "discord.js";
import { TwitchHandler } from "./utils/TwitchHandler.js";
import { EmbedBuilder } from "discord.js";
import { IStreamers } from "./bot.js";

export async function checkStream(client: Client, streamers: IStreamers) {
  Object.keys(streamers).forEach(async streamer => {
    const twitchHandler = TwitchHandler.getInstance();
    const streamerInfo = await twitchHandler.getStreamerInfo(streamer);
    const streamerObj = streamers[streamer]
    const guild = (await client.guilds.fetch(streamerObj.guild_id))

    const channels = streamerObj.channels;

    channels.forEach(async channelObj => {
      const channel = (await guild.channels.fetch(channelObj.id))
      if(channel?.isSendable()){
        if (!streamerInfo.isLive) {
          streamerObj.is_live = false;
          if(channelObj.message_id){
            const message = await channel.messages.fetch(channelObj.message_id!)
            await message.delete();
          }
          channelObj.message_id = null;
          return
        }
        const avatar = await TwitchHandler.getInstance().getAvatar(streamer);
        const notificationEmbed = new EmbedBuilder()
            .setTitle(`${streamer} стримит прямо сейчас!`)
            .setDescription(streamerInfo.title ?? "Нет заголовка")
            .setColor(0x9146ff)
            .setURL(streamerObj.twitch_url ?? "https://www.twitch.tv/")
            .setFooter({ text: "by Balkon"});
        if(avatar?.banner){
          notificationEmbed.setThumbnail(avatar.banner)
        }
        if(avatar?.avatar){
          notificationEmbed.setImage(avatar.avatar)
        }
        notificationEmbed.addFields(
          {name: "Игра:", value: streamerInfo.game, inline: true},
          {name: "Зрители:", value: String(streamerInfo.viewer_count), inline: true},
          {name: "URL:", value: streamerObj.twitch_url}
        )
        const messageTemplate = {content: "@everyone", embeds: [notificationEmbed], allowedMentions: { users: ["1416518304394117424"] }};
        if (streamerInfo.isLive && !channelObj.message_id) {
          streamerObj.is_live = true;
          const message = await channel.send(messageTemplate);
          // if(message.crosspost){
          //   await message.crosspost()
          // }
          channelObj.message_id = (await message).id
        }
        
        else if (channelObj.message_id) {
          const message = await channel.messages.fetch(channelObj.message_id!)
          await message.edit(messageTemplate)
          return
        }
      }
    })
  })
}

