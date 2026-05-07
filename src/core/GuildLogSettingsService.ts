import { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../db.js";
import type { LogTypesDB } from "../types/database.types.js";
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
}

export const guildLogSettingsService = GuildLogSettingsService.getInstance();