import { GuildMember, Interaction } from "discord.js";
import { commands } from "../core/commands/CommandsLoader.js";
import { permissionController } from "../core/PermissionController.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { CommandDTO } from "../dto/CommandDTO.js";
import { DataBaseHandler, dataBaseHandler } from "../core/DataBaseHandler.js";

export const interactionCreateController = async (interaction: Interaction) => {
  console.log("Interaction...")
  const response = await dataBaseHandler.isMemberExists(interaction.user.id, true, interaction.guild?.id, true, interaction);
  // if(DataBaseHandler.isSuccess(response)){
  //   console.log(`✅ ${interaction.user.globalName} in database.`)
  // }

  if(interaction.isChatInputCommand()){
    const commandInstance = commands.get(interaction.commandName);
    if (!commandInstance) return;
    
    if(commandInstance?.commandAccessLevel === CommandAccessLevels.Private){
      if(interaction.member instanceof GuildMember && !permissionController(interaction.member, interaction.commandName)){
        await interaction.reply({content: "nedostupno"});
        return;
      }
    }

    try {
      await commandInstance.execute(interaction);
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: "⚠️ Error while running the command!", ephemeral: true });
    }
    return;
  }
  else if (interaction.isStringSelectMenu()){
    const commandDTO = CommandDTO.convertToCommandDTO(interaction.customId)
    const commandInstance = commands.get(commandDTO.baseCommand);
    if(!commandInstance) return;

    const execute = commandInstance.stringSelectMenu?.get(commandDTO.toString());
    if(execute){
      execute(interaction);
    }
    return;
  }
  else if (interaction.isButton()){
    const commandDTO = CommandDTO.convertToCommandDTO(interaction.customId)
    const commandInstance = commands.get(commandDTO.baseCommand);
    if(!commandInstance) return;

    const execute = commandInstance.buttons?.get(commandDTO.toString());
    
    if(execute){
      execute(interaction);
    }
    return;
  }
  else if (interaction.isModalSubmit()){
    const commandDTO = CommandDTO.convertToCommandDTO(interaction.customId)
    const commandInstance = commands.get(commandDTO.baseCommand);
    if(!commandInstance) return;

    const execute = commandInstance.modals?.get(commandDTO.toString());
    if(execute){
      execute(interaction);
    }
    return;
  }
}