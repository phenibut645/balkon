import { GuildMember, User } from "discord.js";
import { DataBaseHandler, dataBaseHandler, DBResponse } from "./DataBaseHandler.js";
import { GuildMembersD, MembersDB } from "../types/database.types.js";
import pool from "../db.js";
import { RowDataPacket } from "mysql2";

interface NextFunction {
  (member: GuildMember, command: string, guildId?: string): Promise<DBResponse<boolean>>;
}

export const permissionController: NextFunction = async (member: GuildMember | string, command: string, guildId?: string) => {
  if(typeof member === "string"){
    // ...
    return {
      success: false,
      error: {
        reason: "unknown",
        relatedTo: "unknown"
      }
    };
  }
  try{
    const [ roleCommandPermissions ] = await pool.query<RowDataPacket[]>(`SELECT gr.ds_role_id FROM guilds as g INNER JOIN guild_roles AS gr ON gr.guild_id = g.id INNER JOIN role_command_permissions AS rcp ON rcp.guild_role_id = gr.id INNER JOIN commands as c ON c.id = rcp.command_id WHERE c.tag = '${command}' AND g.ds_guild_id = '${member.guild.id}'`);    
    if(roleCommandPermissions.length){
      const guildRolesDiscordIDs =  new Set(roleCommandPermissions.map(guildRole => guildRole["ds_guild_id"]));
      const memberRoles = member.roles.cache.map(role => role.id);
      const filteredRoles = memberRoles.filter(item => guildRolesDiscordIDs.has(item))
      if(filteredRoles.length){
        return {
          success: true,
          data: true
        }
      }
      else {
        const [ memberPermissions ] = await pool.query<RowDataPacket[]>(`SELECT gm.id FROM members as m INNER JOIN guild_members as gm ON gm.member_id = m.id INNER JOIN member_command_permissions as mcp ON mcp.guild_member_id = gm.id INNER JOIN commands as c ON c.id = mcp.command_id WHERE m.ds_member_id = '${member.user.id}' AND c.tag = '${command}'`);
        if(memberPermissions.length){
          return {
            success: true,
            data: true
          }
        }
        else {
          return {
            success:true,
            data: false
          }
        }
      }

    }
  }
  catch(err: unknown){
    return DataBaseHandler.errorHandling(err)
  }
  return {
    success: false,
    error: {
      reason: "unknown",
      relatedTo: "unknown"
    }
  }
}