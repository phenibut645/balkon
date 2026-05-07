import { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../db.js";
import type { GuildRolesDB } from "../types/database.types.js";
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

async function getGuildRoles(whereColumns?: Record<string, unknown>): Promise<DBResponse<GuildRolesDB[]>> {
  try {
    let conditions = "";
    let values: unknown[] = [];

    if (whereColumns) {
      const keys = Object.keys(whereColumns);
      conditions = keys.map(key => `${key} = ?`).join(" AND ");
      values = keys.map(key => whereColumns[key]);
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM guild_roles ${whereColumns ? `WHERE ${conditions}` : ""}`,
      values,
    );

    return {
      success: true,
      data: rows as GuildRolesDB[],
    };
  } catch (err: unknown) {
    return errorHandling(err);
  }
}

async function addGuildRoles(records: GuildRolesDB[]): Promise<DBResponse<{ insertId: number }>> {
  try {
    const recordsKeysWithoutId = Object.keys(records[0]).filter(key => key !== "id");
    const columns = recordsKeysWithoutId.join(", ");
    const placeholders = records.map(() => `(${recordsKeysWithoutId.map(() => "?").join(", ")})`).join(", ");
    const values = records.flatMap(record => recordsKeysWithoutId.map(key => record[key]));
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO guild_roles (${columns}) VALUES ${placeholders}`,
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

export class GuildRoleCacheService {
  private static instance: GuildRoleCacheService;

  private constructor() {}

  static getInstance(): GuildRoleCacheService {
    if (!GuildRoleCacheService.instance) {
      GuildRoleCacheService.instance = new GuildRoleCacheService();
    }

    return GuildRoleCacheService.instance;
  }

  async ensureGuildRoles(guildId: number, discordRoleIds: string[]): Promise<DBResponse<{ synced: number; removed: number }>> {
    try {
      const existingResponse = await getGuildRoles({ guild_id: guildId });
      if (isFail(existingResponse)) {
        return existingResponse;
      }

      const existingIds = new Set(existingResponse.data.map(role => role.ds_role_id));
      const discordIdSet = new Set(discordRoleIds);
      const rolesToInsert = discordRoleIds
        .filter(roleId => !existingIds.has(roleId))
        .map(roleId => ({
          id: 0,
          guild_id: guildId,
          ds_role_id: roleId,
        }));
      const staleRoleIds = existingResponse.data
        .filter(role => !discordIdSet.has(role.ds_role_id))
        .map(role => role.id);

      if (staleRoleIds.length) {
        const placeholders = staleRoleIds.map(() => "?").join(", ");
        await pool.query(`DELETE FROM guild_roles WHERE id IN (${placeholders})`, staleRoleIds);
      }

      if (rolesToInsert.length) {
        const insertResponse = await addGuildRoles(rolesToInsert);
        if (isFail(insertResponse)) {
          return insertResponse;
        }
        if (!isSuccess(insertResponse)) {
          return insertResponse;
        }
      }

      return {
        success: true,
        data: { synced: rolesToInsert.length, removed: staleRoleIds.length },
      };
    } catch (err: unknown) {
      return errorHandling(err);
    }
  }
}

export const guildRoleCacheService = GuildRoleCacheService.getInstance();