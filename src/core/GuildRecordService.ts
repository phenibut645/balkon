import { ResultSetHeader, RowDataPacket } from "mysql2";
import { Guild } from "discord.js";
import pool from "../db.js";
import type { GuildsDB } from "../types/database.types.js";
import type { DBResponse, DBResponseFail, DBResponseSuccess, InsertIdResponse } from "./DataBaseHandler.js";
import { settingsService } from "./SettingsService.js";

function isSuccess<T>(res: DBResponse<T>): res is DBResponseSuccess<T> {
  return res.success;
}

function isFail<T>(res: DBResponse<T>): res is DBResponseFail {
  return !res.success;
}

function errorHandling(err?: unknown): DBResponse<never> {
  console.log(" Error handling...");
  console.error(err);
  return {
    success: false,
    error: {
      reason: "unknown",
      relatedTo: "unknown",
      code:
        err instanceof Error && typeof (err as Error & { code?: unknown }).code === "string"
          ? (err as Error & { code?: string }).code
          : undefined,
      message: err instanceof Error ? err.message : undefined,
    },
  };
}

async function addGuildRecord(record: Omit<GuildsDB, "id">): Promise<DBResponse<InsertIdResponse>> {
  try {
    const columns = Object.keys(record);
    const placeholders = columns.map(() => "?").join(", ");
    const values = columns.map(column => record[column as keyof typeof record]);
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO guilds (${columns.join(", ")}) VALUES (${placeholders})`,
      values,
    );

    return {
      success: true,
      data: {
        insertId: result.insertId,
      },
    };
  } catch (err: unknown) {
    return errorHandling(err);
  }
}

async function getGuilds(whereColumns?: Record<string, unknown>): Promise<DBResponse<GuildsDB[]>> {
  try {
    let conditions = "";
    let values: unknown[] = [];

    if (whereColumns) {
      const keys = Object.keys(whereColumns);
      conditions = keys.map(key => `${key} = ?`).join(" AND ");
      values = keys.map(key => whereColumns[key]);
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM guilds ${whereColumns ? `WHERE ${conditions}` : ""}`,
      values,
    );

    return {
      success: true,
      data: rows as GuildsDB[],
    };
  } catch (err: unknown) {
    return errorHandling(err);
  }
}

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
      const result = await addGuildRecord({
        ds_guild_id: discordGuildId,
        earning_multiply: earningMultiply,
      });

      if (isSuccess(result)) {
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
      return errorHandling(err);
    }
  }

  async ensureGuildRecord(guild: Guild | string): Promise<DBResponse<GuildsDB>> {
    try {
      const discordGuildId = guild instanceof Guild ? guild.id : guild;
      const existingGuildResponse = await getGuilds({ ds_guild_id: discordGuildId });
      if (isFail(existingGuildResponse)) {
        return existingGuildResponse;
      }

      if (existingGuildResponse.data.length) {
        return {
          success: true,
          data: existingGuildResponse.data[0],
        };
      }

      const addGuildResponse = await this.addGuildToDB(guild);
      if (isFail(addGuildResponse)) {
        return addGuildResponse;
      }

      const createdGuildResponse = await getGuilds({ id: addGuildResponse.data.insertId });
      if (isFail(createdGuildResponse) || !createdGuildResponse.data.length) {
        return errorHandling(new Error("Created guild record was not found."));
      }

      return {
        success: true,
        data: createdGuildResponse.data[0],
      };
    } catch (err: unknown) {
      return errorHandling(err);
    }
  }
}

export const guildRecordService = GuildRecordService.getInstance();