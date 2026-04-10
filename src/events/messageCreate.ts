import { ChannelType, Message } from "discord.js";
import { DEVELOPER_DISCORD_ID } from "../config.js";

export const messageCreateController = async (message: Message) => {
    const user = message.author
    if (user.bot) return;
    if(message.channel.type === ChannelType.DM) {
        if(user.id === DEVELOPER_DISCORD_ID){
            return;
        }

        await message.author.send("Используй slash-команды на сервере. DM-управление сейчас не поддерживается.");
    }
}
