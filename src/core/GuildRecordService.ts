import { Guild } from "discord.js";
import { GuildsDB } from "../types/database.types.js";
import { DataBaseHandler, DBResponse, InsertIdResponse } from "./DataBaseHandler.js";
import { settingsService } from "./SettingsService.js";

export class GuildRecordService {
  private static instance: GuildRecordService;

  private constructor() {}

  static getInstance(): GuildRecordService {
    if (!GuildRecordService.instance) {
      GuildRecordService.instance = new GuildRecordService();
    }

    return GuildRecordService.instance;
  }

  async addGuildToDB(guild: Guild | string): Promise<DBResponse<InsertIdResponse>> {
    try {
      const generalSettings = await settingsService.ensureGeneralSettings();
      const discordGuildId = guild instanceof Guild ? guild.id : guild;
      const earningMultiply = generalSettings.default_earning_multiply;
      const result = await DataBaseHandler.getInstance().addRecords<GuildsDB>([
        {
          id: 0,
          ds_guild_id: discordGuildId,
          earning_multiply: earningMultiply,
        },
      ], "guilds");

      if (DataBaseHandler.isSuccess(result)) {
        console.log(`Created guild ${discordGuildId} with earning multiply ${earningMultiply}`);
        return {
          success: true,
          data: {
            insertId: result.data.insertId,
          },
        };
      }

      return result;
    } catch (err: unknown) {
      return DataBaseHandler.errorHandling(err);
    }
  }

  async ensureGuildRecord(guild: Guild | string): Promise<DBResponse<GuildsDB>> {
    try {
      const discordGuildId = guild instanceof Guild ? guild.id : guild;
      const existingGuildResponse = await DataBaseHandler.getInstance().getFromTable<GuildsDB>("guilds", { ds_guild_id: discordGuildId });
      if (DataBaseHandler.isFail(existingGuildResponse)) {
        return existingGuildResponse;
      }

      if (existingGuildResponse.data.length) {
        return {
          success: true,
          data: existingGuildResponse.data[0],
        };
      }

      const addGuildResponse = await this.addGuildToDB(guild);
      if (DataBaseHandler.isFail(addGuildResponse)) {
        return addGuildResponse;
      }

      const createdGuildResponse = await DataBaseHandler.getInstance().getFromTable<GuildsDB>("guilds", { id: addGuildResponse.data.insertId });
      if (DataBaseHandler.isFail(createdGuildResponse) || !createdGuildResponse.data.length) {
        return DataBaseHandler.errorHandling(new Error("Created guild record was not found."));
      }

      return {
        success: true,
        data: createdGuildResponse.data[0],
      };
    } catch (err: unknown) {
      return DataBaseHandler.errorHandling(err);
    }
  }
}

export const guildRecordService = GuildRecordService.getInstance();