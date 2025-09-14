import { Client, Events, GatewayIntentBits, VoiceChannel } from "discord.js";
import { config } from "dotenv";
import * as ping from "./commands/ping.js";
import { REST, Routes } from "discord.js";
import { command as pingCommand } from "./commands/ping.js";
import { channel } from "diagnostics_channel";

config();

const commands = [pingCommand.toJSON()];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);

(async () => {
  try {
    console.log("🚀 Обновление (/) команд...");

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID!,
        process.env.GUILD_ID!
        
      ),
      { body: commands }
    );

    console.log("✅ Команды успешно зарегистрированы!");
  } catch (error) {
    console.error(error);
  }
})();


const client = new Client({ intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates, // обязательно
] });

client.once("clientReady", async () => {
  console.log(`✅ Бот вошёл как ${client.user?.tag}`);
  const guild = client.guilds.cache.get(process.env.GUILD_ID!)
  const members = await guild?.members.fetch()
//   members?.forEach(member => {
//     console.log(`🚀 хз ${member.user.displayName}`)
//   })
  const voice = await guild?.channels.fetch()
  voice?.forEach(el => {
    if(el instanceof VoiceChannel){
        if(el.members.size >= 1){
            el.members.forEach(member => {
                const voiceChannel = guild?.channels.cache.get("1262846887132659762")
                if(voiceChannel?.isVoiceBased()) {
                    member.voice.setChannel(null)
                }
                
            })
        }
    }
  })
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    await ping.execute(interaction);
  }
});

client.login(process.env.DISCORD_TOKEN);
