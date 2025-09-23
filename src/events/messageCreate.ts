import { ChannelType, Message } from "discord.js";
import { DEVELOPER_DISCORD_ID } from "../config.js";

export const messageCreateController = async (message: Message) => {
    const user = message.author
    if (user.bot) return;
    if(message.channel.type === ChannelType.DM) {

        if(user.id === DEVELOPER_DISCORD_ID){
            // add logic for interaction with bot
        }
        else {
            switch (message.content.toLowerCase()) {
                case "ok":
                    await message.author.send("go outside, touch the grass")
                    break;
                case "no":
                    await message.author.send("don't disturb me")
                    break;
            }
        }
    }
}