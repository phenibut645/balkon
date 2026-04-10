import { GuildMember } from "discord.js";
import { DataBaseHandler, DBResponse } from "./DataBaseHandler.js";
import pool from "../db.js";
import { RowDataPacket } from "mysql2";

interface NextFunction {
  (member: GuildMember, command: string): Promise<DBResponse<boolean>>;
}

export const permissionController: NextFunction = async (member: GuildMember, command: string) => {
  try{
    const [ roleCommandPermissions ] = await pool.query<RowDataPacket[]>(
      `SELECT gr.ds_role_id
       FROM guilds AS g
       INNER JOIN guild_roles AS gr ON gr.guild_id = g.id
       INNER JOIN role_command_permissions AS rcp ON rcp.guild_role_id = gr.id
       INNER JOIN commands AS c ON c.id = rcp.command_id
       WHERE c.tag = ? AND g.ds_guild_id = ? AND rcp.allowed = TRUE`,
      [command, member.guild.id]
    );

    const guildRoleDiscordIds = new Set(roleCommandPermissions.map(guildRole => guildRole["ds_role_id"] as string));
    const memberHasAllowedRole = member.roles.cache.some(role => guildRoleDiscordIds.has(role.id));

    if (memberHasAllowedRole) {
      return {
        success: true,
        data: true
      };
    }

    const [ memberPermissions ] = await pool.query<RowDataPacket[]>(
      `SELECT gm.id
       FROM members AS m
       INNER JOIN guild_members AS gm ON gm.member_id = m.id
       INNER JOIN member_command_permissions AS mcp ON mcp.guild_member_id = gm.id
       INNER JOIN commands AS c ON c.id = mcp.command_id
       WHERE m.ds_member_id = ? AND gm.guild_id = (
         SELECT id FROM guilds WHERE ds_guild_id = ?
       ) AND c.tag = ? AND mcp.allowed = TRUE`,
      [member.user.id, member.guild.id, command]
    );

    return {
      success: true,
      data: memberPermissions.length > 0
    };
  }
  catch(err: unknown){
    return DataBaseHandler.errorHandling(err)
  }
}
