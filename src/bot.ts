import { ButtonInteraction, Client, Events, GatewayIntentBits, Interaction, Partials, VoiceChannel } from "discord.js";
import * as ping from "./commands/ping.js";
import path from "path";
import fs from "fs";
import { DISCORD_TOKEN, GUILD_ID } from "./config.js";
import { checkStream } from "./notifications.js";
import { IStreamers } from "./types/streamers.types.js";
import { DataBaseHandler } from "./utils/DataBaseHandler.js";
import { clientReadyController } from "./controllers/clientReady.js";
import { interactionCreateController } from "./controllers/interactionCreate.js";
import { guildCreateController } from "./controllers/guildCreate.js";
import { guildDeleteController } from "./controllers/guildDelete.js";
import { messageCreateController } from "./controllers/messageCreate.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.DirectMessageTyping,
    GatewayIntentBits.MessageContent  
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.GuildMember,
    Partials.User,
    Partials.ThreadMember
  ]
});

export interface FunctionWithInteraction {
  (interaction: Interaction): never
}
export interface CommandInfo {
  command: string
}

export const commands = new Map();

const commandsPath = path.join(import.meta.dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".ts") || file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const module = await import(`file://${filePath}`);
  const command = module.default;
  if (command.data && command.execute && command.interactions) {
    commands.set(command.data.name, {
      execute: command.execute,
      interactions: command.interactions
    });
  }
}

client.once("clientReady", clientReadyController);

client.on("interactionCreate", interactionCreateController);
client.on("guildCreate", guildCreateController)
client.on("guildDelete", guildDeleteController)
client.on("messageCreate", messageCreateController)

client.login(DISCORD_TOKEN);

let streamers: IStreamers
  // "pr1smoo": {
  //   "guild_id": GUILD_ID!,
  //   "channels": [{
  //     "id": "1416520681272774716",
  //     "message_id": null
  //   }],
  //   "is_live": false,
  //   "twitch_url": "https://www.twitch.tv/pr1smoo"
  // },
  // "justhatemeeecatq": {
  //   "guild_id": GUILD_ID!,
  //   "channels": [{
  //     "id": "1416520681272774716",
  //     "message_id": null
  //   }],
  //   "is_live": false,
  //   "twitch_url": "https://www.twitch.tv/justhatemeeecatq"
  // }
async function setNotification(){
  const response = await DataBaseHandler.getInstance().loadStreamers();
  if(DataBaseHandler.isSuccess(response)){
      streamers = response.data
      setInterval(async () => {
        checkStream(client, streamers);
      }, 2_000);
  }
  else {
    console.log("⚠️ Database Error...", streamers)
  }
}

setNotification();