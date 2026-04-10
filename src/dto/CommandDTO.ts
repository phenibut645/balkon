import { CommandName } from "../types/command.type.js";

export class CommandDTO {
    baseCommand: CommandName
    additionals: string[]

    constructor(baseCommand: CommandName, ...additionals: string[]){
        this.baseCommand = baseCommand
        this.additionals = additionals
    }
    
    toString(){
        if (!this.additionals.length) {
            return this.baseCommand;
        }

        return `${this.baseCommand}:${this.additionals.join("|")}`
    }

    static convertToCommandDTO(command: string){
        const [commandName, additional = ""] = command.split(":")
        const splittedAdditionals = additional
            ? additional.split("|").filter(Boolean)
            : [];

        return new CommandDTO(commandName as CommandName, ...splittedAdditionals)
    }
}
