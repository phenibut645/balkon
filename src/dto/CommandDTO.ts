import { CommandName } from "../types/command.type.js";

export class CommandDTO {
    baseCommand: CommandName
    additionals: string[]

    constructor(baseCommand: CommandName, ...additionals: string[]){
        this.baseCommand = baseCommand
        this.additionals = additionals
    }
    
    toString(){
        return `${this.baseCommand}:${this.additionals.join("|")}`
    }

    static convertToCommandDTO(command: string){
        const splittedCommand = command.split(":")
        const commandName = splittedCommand[0]
        const additional = splittedCommand[1]
        const splittedAdditionals = additional.split("|");

        return new CommandDTO(commandName as CommandName, ...splittedAdditionals)
    }
}