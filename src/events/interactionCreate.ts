import { GuildMember, Interaction } from "discord.js";
import { commands } from "../core/commands/CommandsLoader.js";
import { permissionController } from "../core/PermissionController.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { CommandDTO } from "../dto/CommandDTO.js";
import { DataBaseHandler } from "../core/DataBaseHandler.js";
import { guildMemberService } from "../core/GuildMemberService.js";
import { memberService } from "../core/MemberService.js";

export const interactionCreateController = async (interaction: Interaction) => {
  console.log("Interaction...")

  try {
    await memberService.ensureMemberFromDiscordProfile({
      discordId: interaction.user.id,
      username: interaction.user.username,
      globalName: interaction.user.globalName,
      avatar: interaction.user.avatar,
      avatarUrl: interaction.user.displayAvatarURL({ size: 128 }) ?? null,
      createdSource: "discord_interaction",
    });

    await memberService.markMemberSeenByDiscordId(interaction.user.id);
  } catch (error) {
    console.error("Failed to sync interaction Discord profile metadata", error);
  }

  if (interaction.inGuild()) {
    const response = await guildMemberService.ensureInteractionGuildMember({
      discordUserId: interaction.user.id,
      discordGuildId: interaction.guildId,
      isGuildOwner: interaction.user.id === interaction.guild?.ownerId,
    });
    if (!response.success) {
      console.error("Failed to sync interaction user with DB", response.error);
    }
  }

  try {
    if (interaction.isAutocomplete()) {
      const commandInstance = commands.get(interaction.commandName);
      if (!commandInstance?.autocomplete) return;

      await commandInstance.autocomplete(interaction);
      return;
    }

    if(interaction.isChatInputCommand()){
      const commandInstance = commands.get(interaction.commandName);
      if (!commandInstance) return;
      
      if(commandInstance.commandAccessLevel === CommandAccessLevels.Private){
        if(!(interaction.member instanceof GuildMember)) {
          await interaction.reply({ content: "This command is available only inside a server.", flags: ["Ephemeral"] });
          return;
        }

        const permissionResponse = await permissionController(interaction.member, interaction.commandName);
        if (DataBaseHandler.isFail(permissionResponse) || !permissionResponse.data) {
          await interaction.reply({content: "У вас нет доступа к этой команде.", flags: ["Ephemeral"]});
          return;
        }
      }

      await commandInstance.execute(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      const commandDTO = CommandDTO.convertToCommandDTO(interaction.customId);
      const commandInstance = commands.get(commandDTO.baseCommand);
      const interactionHandler = commandInstance?.stringSelectMenu?.get(commandDTO.toString());
      if (interactionHandler) {
        await interactionHandler(interaction);
      }
      return;
    }

    if (interaction.isUserSelectMenu()) {
      const commandDTO = CommandDTO.convertToCommandDTO(interaction.customId);
      const commandInstance = commands.get(commandDTO.baseCommand);
      const interactionHandler = commandInstance?.userSelectMenu?.get(commandDTO.toString());
      if (interactionHandler) {
        await interactionHandler(interaction);
      }
      return;
    }

    if (interaction.isButton()) {
      const commandDTO = CommandDTO.convertToCommandDTO(interaction.customId);
      const commandInstance = commands.get(commandDTO.baseCommand);
      const interactionHandler = commandInstance?.buttons?.get(commandDTO.toString());
      if (interactionHandler) {
        await interactionHandler(interaction);
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      const commandDTO = CommandDTO.convertToCommandDTO(interaction.customId);
      const commandInstance = commands.get(commandDTO.baseCommand);
      const interactionHandler = commandInstance?.modals?.get(commandDTO.toString());
      if (interactionHandler) {
        await interactionHandler(interaction);
      }
    }
  } catch (error) {
    console.error(error);
    await replyWithInteractionError(interaction);
  }
}

async function replyWithInteractionError(interaction: Interaction) {
  const payload = { content: "⚠️ Error while running the command!", flags: ["Ephemeral"] as const };

  if (!interaction.isRepliable()) {
    return;
  }

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (error) {
    const discordErrorCode = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: number }).code
      : undefined;

    if (discordErrorCode === 10062) {
      console.warn("Interaction expired before the error response could be sent.");
      return;
    }

    throw error;
  }
}
