import { REST, Routes, SlashCommandBuilder } from "discord.js";
import fs from "fs";
import path from "path";
import "dotenv/config";
import { CLIENT_ID, DISCORD_TOKEN } from "./config.js";
import { commands } from "./core/commands/CommandsLoader.js";

const slashCommands: any[] = []
commands.forEach(command => {
    console.log(command.data.name)
    slashCommands.push(command.data.toJSON())
})

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN!);

(async () => {
    try {
        console.log(`📝 Loading ${slashCommands.length} commands...`);

        await rest.put(
            Routes.applicationCommands(CLIENT_ID!),
            { body: slashCommands }
        );

        console.log("✅ All commands succesfly loaded!");
    } catch (error) {
        console.error(error);
    }
})();