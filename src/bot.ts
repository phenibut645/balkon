import { ButtonInteraction, Client, Events, GatewayIntentBits, VoiceChannel } from "discord.js";
import * as ping from "./commands/ping.js";
import path from "path";
import fs from "fs";
import { DISCORD_TOKEN } from "./config.js";

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
