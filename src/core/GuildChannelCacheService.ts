import { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../db.js";
import type { GuildChannels } from "../types/database.types.js";
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

async function getGuildChannels(whereColumns?: Record<string, unknown>): Promise<DBResponse<GuildChannels[]>> {
  try {
    let conditions = "";
    let values: unknown[] = [];

    if (whereColumns) {
      const keys = Object.keys(whereColumns);
      conditions = keys.map(key => `${key} = ?`).join(" AND ");
      values = keys.map(key => whereColumns[key]);
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM guild_channels ${whereColumns ? `WHERE ${conditions}` : ""}`,
      values,
    );

    return {
      success: true,
      data: rows as GuildChannels[],
    };
  } catch (err: unknown) {
    return errorHandling(err);
  }
}

async function addGuildChannels(records: GuildChannels[]): Promise<DBResponse<{ insertId: number }>> {
  try {
    const recordsKeysWithoutId = Object.keys(records[0]).filter(key => key !== "id");
    const columns = recordsKeysWithoutId.join(", ");
    const placeholders = records.map(() => `(${recordsKeysWithoutId.map(() => "?").join(", ")})`).join(", ");
    const values = records.flatMap(record => recordsKeysWithoutId.map(key => record[key]));
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO guild_channels (${columns}) VALUES ${placeholders}`,
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

export class GuildChannelCacheService {
  private static instance: GuildChannelCacheService;

  private constructor() {}

  static getInstance(): GuildChannelCacheService {
    if (!GuildChannelCacheService.instance) {
      GuildChannelCacheService.instance = new GuildChannelCacheService();
    }

    return GuildChannelCacheService.instance;
  }

  async ensureGuildChannels(guildId: number, discordChannelIds: string[]): Promise<DBResponse<{ synced: number; removed: number }>> {
    try {
      const existingResponse = await getGuildChannels({ guild_id: guildId });
      if (isFail(existingResponse)) {
        return existingResponse;
      }

      const existingIds = new Set(existingResponse.data.map(channel => channel.ds_channel_id));
      const discordIdSet = new Set(discordChannelIds);
      const channelsToInsert = discordChannelIds
        .filter(channelId => !existingIds.has(channelId))
        .map(channelId => ({
          id: 0,
          guild_id: guildId,
          ds_channel_id: channelId,
        }));
      const staleChannelIds = existingResponse.data
        .filter(channel => !discordIdSet.has(channel.ds_channel_id))
        .map(channel => channel.id);

      if (staleChannelIds.length) {
        const placeholders = staleChannelIds.map(() => "?").join(", ");
        await pool.query(`DELETE FROM guild_channels WHERE id IN (${placeholders})`, staleChannelIds);
      }

      if (staleChannelIds.length || discordChannelIds.length) {
        const activeChannelIds = discordChannelIds;
        if (activeChannelIds.length) {
          const placeholders = activeChannelIds.map(() => "?").join(", ");
          await pool.query(
            `DELETE lc FROM logs_channels lc
             INNER JOIN guilds g ON g.id = lc.guild_id
             WHERE lc.guild_id = ? AND lc.ds_channel_id NOT IN (${placeholders})`,
            [guildId, ...activeChannelIds],
          );
        } else {
          await pool.query(`DELETE FROM logs_channels WHERE guild_id = ?`, [guildId]);
        }
      }

      if (channelsToInsert.length) {
        const insertResponse = await addGuildChannels(channelsToInsert);
        if (isFail(insertResponse)) {
          return insertResponse;
        }
        if (!isSuccess(insertResponse)) {
          return insertResponse;
        }
      }

      return {
        success: true,
        data: { synced: channelsToInsert.length, removed: staleChannelIds.length },
      };
    } catch (err: unknown) {
      return errorHandling(err);
    }
  }
}

export const guildChannelCacheService = GuildChannelCacheService.getInstance();