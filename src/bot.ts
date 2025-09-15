import { ButtonInteraction, Client, Events, GatewayIntentBits, VoiceChannel } from "discord.js";
import * as ping from "./commands/ping.js";
import path from "path";
import fs from "fs";
import { DISCORD_TOKEN, GUILD_ID } from "./config.js";
import { checkStream } from "./notifications.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ]
});

const commands = new Map();

const commandsPath = path.join(import.meta.dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".ts") || file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const module = await import(`file://${filePath}`);
  const command = module.default;
  if (command.data && command.execute) {
    commands.set(command.data.name, command);
  }
}

client.once("clientReady", async () => {
  console.log(`✅ Bot joined as ${client.user?.tag}`);

  
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if(interaction.isButton()){
    const buttonInteraction = interaction as ButtonInteraction
  }
  const command = commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: "⚠️ Error while running the command!", ephemeral: true });
  }
});


client.login(DISCORD_TOKEN);

const streamers: IStreamers = {
  "pr1smoo": {
    "guild_id": GUILD_ID!,
    "channels": [{
      "id": "1416520681272774716",
      "message_id": null
    }],
    "is_live": false,
    "twitch_url": "https://www.twitch.tv/pr1smoo"
  },
  // "justhatemeeecatq": {
  //   "guild_id": GUILD_ID!,
  //   "channels": [{
  //     "id": "1416520681272774716",
  //     "message_id": null
  //   }],
  //   "is_live": false,
  //   "twitch_url": "https://www.twitch.tv/justhatemeeecatq"
  // }
}
export interface INotificationChannels {
    "id": string,
    "message_id": string | null
}
export interface IStreamersData {
  "guild_id": string,
  "channels": INotificationChannels[],
  "is_live": boolean,
  "twitch_url": string
}
export interface IStreamers {
  [username: string]: IStreamersData
}

async function setNotification(){
  setInterval(async () => {
    checkStream(client, streamers);
  }, 30_000);
}

setNotification();