import { ChannelType, Message } from "discord.js";
import { DEVELOPER_DISCORD_ID } from "../config.js";
import { DiscordMetadataService } from "../core/DiscordMetadataService.js";

export const messageCreateController = async (message: Message) => {
    const user = message.author
    if (user.bot) return;

    try {
        await DiscordMetadataService.getInstance().upsertMemberDiscordProfile({
            discordId: user.id,
            username: user.username,
            globalName: user.globalName,
            avatar: user.avatar,
            avatarUrl: user.displayAvatarURL({ size: 128 }) ?? null,
        });
    } catch (error) {
        console.error("Failed to sync message Discord profile metadata", error);
    }

    if(message.channel.type === ChannelType.DM) {
        if(user.id === DEVELOPER_DISCORD_ID){
            return;
        }

        await message.author.send("Используй slash-команды на сервере. DM-управление сейчас не поддерживается.");
    }
}
