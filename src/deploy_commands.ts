import { REST, Routes, SlashCommandBuilder } from "discord.js";
import fs from "fs";
import path from "path";
import "dotenv/config";
import { CLIENT_ID, DISCORD_TOKEN } from "./config.js";

const commands: any[] = [];

const commandsPath = path.join(import.meta.dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".ts") || file.endsWith(".js"));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const module = await import(`file://${filePath}`);
    const command = module.default;
    if ("data" in command && "execute" in command) {
        commands.push(command.data.toJSON());
    } else {
        console.warn(`⚠️ Command in ${filePath} is invalid.`);
    }
}

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN!);

(async () => {
    try {
        console.log(`📝 Loading ${commands.length} commands...`);

        await rest.put(
            Routes.applicationCommands(CLIENT_ID!),
            { body: commands }
        );

        console.log("✅ All commands succesfly loaded!");
    } catch (error) {
        console.error(error);
    }
})();
