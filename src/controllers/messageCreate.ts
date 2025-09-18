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
                case "понял":
                    await message.author.send("вот и пошел нахуй")
                    break;
                case "нет":
                    await message.author.send("та все, не еби мозги, гидроцефал")
                    break;
            }
        }
    }
}