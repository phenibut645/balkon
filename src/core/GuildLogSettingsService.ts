import { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../db.js";
import type { LogTypesDB, LogsChannelsDB } from "../types/database.types.js";
import type { DBResponse, DBResponseFail, DBResponseSuccess } from "./DataBaseHandler.js";

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

async function getLogTypes(whereColumns?: Record<string, unknown>): Promise<DBResponse<LogTypesDB[]>> {
  try {
    let conditions = "";
    let values: unknown[] = [];

    if (whereColumns) {
      const keys = Object.keys(whereColumns);
      conditions = keys.map(key => `${key} = ?`).join(" AND ");
      values = keys.map(key => whereColumns[key]);
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM log_types ${whereColumns ? `WHERE ${conditions}` : ""}`,
      values,
    );

    return {
      success: true,
      data: rows as LogTypesDB[],
    };
  } catch (err: unknown) {
    return errorHandling(err);
  }
}

async function addLogType(record: Omit<LogTypesDB, "id">): Promise<DBResponse<number>> {
  try {
    const columns = Object.keys(record);
    const placeholders = columns.map(() => "?").join(", ");
    const values = columns.map(column => record[column as keyof typeof record]);
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO log_types (${columns.join(", ")}) VALUES (${placeholders})`,
      values,
    );

    return {
      success: true,
      data: result.insertId,
    };
  } catch (err: unknown) {
    return errorHandling(err);
  }
}

async function getLogChannels(whereColumns?: Record<string, unknown>): Promise<DBResponse<LogsChannelsDB[]>> {
  try {
    let conditions = "";
    let values: unknown[] = [];

    if (whereColumns) {
      const keys = Object.keys(whereColumns);
      conditions = keys.map(key => `${key} = ?`).join(" AND ");
      values = keys.map(key => whereColumns[key]);
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM logs_channels ${whereColumns ? `WHERE ${conditions}` : ""}`,
      values,
    );

    return {
      success: true,
      data: rows as LogsChannelsDB[],
    };
  } catch (err: unknown) {
    return errorHandling(err);
  }
}

async function addLogChannel(record: Omit<LogsChannelsDB, "id">): Promise<DBResponse<number>> {
  try {
    const columns = Object.keys(record);
    const placeholders = columns.map(() => "?").join(", ");
    const values = columns.map(column => record[column as keyof typeof record]);
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO logs_channels (${columns.join(", ")}) VALUES (${placeholders})`,
      values,
    );

    return {
      success: true,
      data: result.insertId,
    };
  } catch (err: unknown) {
    return errorHandling(err);
  }
}

async function updateLogChannelChannelId(id: number, channelId: string): Promise<DBResponse<{ modified: number }>> {
  try {
    const [result] = await pool.query<ResultSetHeader>(
      "UPDATE logs_channels SET ds_channel_id = ? WHERE id = ?",
      [channelId, id],
    );

    return {
      success: true,
      data: {
        modified: result.affectedRows,
      },
    };
  } catch (err: unknown) {
    return errorHandling(err);
  }
}

export class GuildLogSettingsService {
  private static instance: GuildLogSettingsService;

  private constructor() {}

  static getInstance(): GuildLogSettingsService {
    if (!GuildLogSettingsService.instance) {
      GuildLogSettingsService.instance = new GuildLogSettingsService();
    }

    return GuildLogSettingsService.instance;
  }

  async ensureLogType(name: string): Promise<DBResponse<number>> {
    try {
      const existingResponse = await getLogTypes({ name });
      if (isFail(existingResponse)) {
        return existingResponse;
      }

      if (existingResponse.data.length) {
        return {
          success: true,
          data: existingResponse.data[0].id,
        };
      }

      const insertResponse = await addLogType({ name });
      if (isFail(insertResponse)) {
        return insertResponse;
      }

      if (isSuccess(insertResponse)) {
        return {
          success: true,
          data: insertResponse.data,
        };
      }

      return insertResponse;
    } catch (err: unknown) {
      return errorHandling(err);
    }
  }

  async ensureDefaultLogChannels(guildId: number, channelId: string | null): Promise<DBResponse<{ configured: number }>> {
    try {
      if (!channelId) {
        return {
          success: true,
          data: { configured: 0 },
        };
      }

      const logTypeIds = await Promise.all([
        this.ensureLogType("ban_logs"),
        this.ensureLogType("mute_logs"),
      ]);
      if (logTypeIds.some(result => isFail(result))) {
        return logTypeIds.find(result => isFail(result)) as DBResponse<{ configured: number }>;
      }

      let configured = 0;
      for (const logTypeResult of logTypeIds) {
        const logTypeId = (logTypeResult as DBResponse<number> & { data: number }).data;
        const existingResponse = await getLogChannels({
          guild_id: guildId,
          log_type_id: logTypeId,
        });
        if (isFail(existingResponse)) {
          return existingResponse;
        }

        if (!existingResponse.data.length) {
          const insertResponse = await addLogChannel({
            guild_id: guildId,
            log_type_id: logTypeId,
            ds_channel_id: channelId,
          });
          if (isFail(insertResponse)) {
            return insertResponse;
          }
          configured += 1;
          continue;
        }

        if (existingResponse.data[0].ds_channel_id !== channelId) {
          const updateResponse = await updateLogChannelChannelId(existingResponse.data[0].id, channelId);
          if (isFail(updateResponse)) {
            return updateResponse;
          }
        }
      }

      return {
        success: true,
        data: { configured },
      };
    } catch (err: unknown) {
      return errorHandling(err);
    }
  }
}

export const guildLogSettingsService = GuildLogSettingsService.getInstance();