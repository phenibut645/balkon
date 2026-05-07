import { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../db.js";
import { GuildMembersD, GuildsDB, MemberStatuses } from "../types/database.types.js";
import { memberService } from "./MemberService.js";
import type { DBResponse } from "./DataBaseHandler.js";

type GuildMemberEnsureResult = {
  guildMemberId: number;
  memberId: number;
  guildId: number;
};

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

async function getGuildByDiscordId(discordGuildId: string): Promise<DBResponse<GuildsDB[]>> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT *
       FROM guilds
       WHERE ds_guild_id = ?`,
      [discordGuildId],
    );

    return {
      success: true,
      data: rows as GuildsDB[],
    };
  } catch (err: unknown) {
    return errorHandling(err);
  }
}

async function getGuildMembers(guildId: number, memberId: number): Promise<DBResponse<GuildMembersD[]>> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT *
       FROM guild_members
       WHERE guild_id = ? AND member_id = ?`,
      [guildId, memberId],
    );

    return {
      success: true,
      data: rows as GuildMembersD[],
    };
  } catch (err: unknown) {
    return errorHandling(err);
  }
}

async function addGuildMember(record: GuildMembersD & { member_status_id: number }): Promise<DBResponse<{ insertId: number }>> {
  try {
    const columns = Object.keys(record).filter(column => column !== "id");
    const placeholders = columns.map(() => "?").join(", ");
    const values = columns.map(column => record[column as keyof typeof record]);
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO guild_members (${columns.join(", ")}) VALUES (${placeholders})`,
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

export class GuildMemberService {
  private static instance: GuildMemberService;

  private constructor() {}

  static getInstance(): GuildMemberService {
    if (!GuildMemberService.instance) {
      GuildMemberService.instance = new GuildMemberService();
    }

    return GuildMemberService.instance;
  }

  async ensureInteractionGuildMember(input: {
    discordUserId: string;
    discordGuildId: string;
    isGuildOwner: boolean;
  }): Promise<DBResponse<GuildMemberEnsureResult>> {
    try {
      const memberId = await memberService.ensureMemberByDiscordId(input.discordUserId, { createdSource: "unknown" });
      const guildResponse = await getGuildByDiscordId(input.discordGuildId);
      if (!guildResponse.success) {
        return guildResponse;
      }

      if (!guildResponse.data.length) {
        return {
          success: false,
          error: {
            reason: "record_not_found",
            relatedTo: "guilds",
          },
        };
      }

      const guildId = guildResponse.data[0].id;
      const guildMembersResponse = await getGuildMembers(guildId, memberId);
      if (!guildMembersResponse.success) {
        return guildMembersResponse;
      }

      if (guildMembersResponse.data.length) {
        return {
          success: true,
          data: {
            guildMemberId: guildMembersResponse.data[0].id,
            memberId,
            guildId,
          },
        };
      }

      const insertResponse = await addGuildMember({
        id: 0,
        guild_id: guildId,
        member_id: memberId,
        member_status_id: input.isGuildOwner ? MemberStatuses.GuildOwner : MemberStatuses.Default,
      });
      if (!insertResponse.success) {
        return insertResponse;
      }

      return {
        success: true,
        data: {
          guildMemberId: insertResponse.data.insertId,
          memberId,
          guildId,
        },
      };
    } catch (err: unknown) {
      return errorHandling(err);
    }
  }
}

export const guildMemberService = GuildMemberService.getInstance();