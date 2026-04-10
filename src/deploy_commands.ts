import { REST, Routes } from "discord.js";
import { CLIENT_ID, DISCORD_TOKEN } from "./config.js";
import { slashCommands } from "./core/commands/CommandsLoader.js";

slashCommands.forEach((command: { name: string }) => {
    console.log(command.name)
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
