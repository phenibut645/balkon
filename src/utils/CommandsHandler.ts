import fs from "fs";
import path from "path";

export class CommandsHandler {
    commands: any[] = [];

    constructor(){
        this.loadCommands();
    }

    async loadCommands(){
        const commandsPath = path.join(import.meta.dirname, "commands");
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".ts") || file.endsWith(".js"));
        
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const module = await import(`file://${filePath}`);
            const command = module.default;
            if ("data" in command && "execute" in command) {
                this.commands.push(command.data.toJSON());
            } else {
                console.warn(`⚠️ Command in ${filePath} is invalid.`);
            }
        }
    }
}