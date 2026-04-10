import path from "path";
import fs from "fs";
import { Command } from "./Command.js";

function isCommand(obj: any): obj is Command {
    return (
        obj &&
        typeof obj === "object" &&
        typeof obj.data?.name === "string" &&
        typeof obj.execute === "function"
    );
}

export const commands = new Map<string, Command>();
export const slashCommands: ReturnType<Command["data"]["toJSON"]>[] = [];

const commandsPath = path.join(import.meta.dirname, "../../commands");
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".ts") || file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const module = await import(`file://${filePath}`);
  const CommandClass = module.default;

  if(typeof CommandClass !== "function") continue;

  const commandInstance = new CommandClass();
  if(isCommand(commandInstance)) {
    commands.set(commandInstance.data.name, commandInstance)
    slashCommands.push(commandInstance.data.toJSON())
  }
}


