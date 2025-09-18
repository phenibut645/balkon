import { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../db.js";
import { CommandsDB, DataBaseTables, DefaultDBTable, GeneralSettingsDB, GuildMembersD, GuildsDB, MembersDB, StreamersDB, TwitchNotificationChannelsDB } from "../types/database.types.js";
import { IStreamers } from "../types/streamers.types.js";
import { Guild } from "discord.js";

export type PossibleErrorReason = "record_not_found" | "mysql_error" | "unknown";
export type RelatedTo = "unknown" | DataBaseTables;

export interface DBError {
    reason: PossibleErrorReason;
    relatedTo: RelatedTo;
    message?: string;
}

export interface DBResponseSuccess<T> {
    success: true;
    data: T;
    error?: undefined;
}

export interface DBResponseFail {
    success: false;
    data?: undefined;
    error: DBError; 
}

export type DBResponse<T> = DBResponseSuccess<T> | DBResponseFail;

export interface InsertIdResponse {
    insertId: number
}

export interface IsExistsResponse {
    exists: boolean,
    memberId?: number,
    guildId?: number,
    guildMemberId?: number,
}

interface StreamerData extends RowDataPacket {
  nickname: string;
  twitch_url: string;
  ds_channel_id: string;
  ds_guild_id: string;
}

export class DataBaseHandler {  
    private static instance: DataBaseHandler;

    private constructor(){}

    static getInstance(): DataBaseHandler{
        if(!DataBaseHandler.instance){
            DataBaseHandler.instance = new DataBaseHandler();
        }
        return DataBaseHandler.instance;
    }

    static isSuccess<T>(res: DBResponse<T>): res is DBResponseSuccess<T> {
        return res.success;
    }

    static isFail<T>(res: DBResponse<T>): res is DBResponseFail {
        return !res.success;
    }

    static errorHandling(err?: unknown, ): DBResponseFail {
        console.log("🚬 Error handling...")
        console.error(err)
        return {
            success: false,
            error: {
                reason: "unknown",
                relatedTo: "unknown",
                message: err instanceof Error ? err.message : undefined
            }
        }
    }

    async getRecords<T extends DefaultDBTable>(table: DataBaseTables, id: number | null): Promise<DBResponse<T[]>> {
        const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM ${table} ${id ? `WHERE id = ${id}` : ""}`)
        return {
            success: true,
            data: rows as T[]
        }
    }

    async addRecords<T extends DefaultDBTable>(records: T[], table: DataBaseTables): Promise<DBResponse<InsertIdResponse>>{
        try{
            const recordsKeysWithoutId = Object.keys(records[0]).filter(key => key !== "id")
            const columns = recordsKeysWithoutId.join(", ");
            const placeholders = records.map(r => `(${recordsKeysWithoutId.map(_ => "?").join(", ")})`).join(", ");
            const values = records.flatMap(r => recordsKeysWithoutId.map(k => r[k]));

            const sql = `INSERT INTO ${table} (${columns}) VALUES ${placeholders}`;
            const [result] = await pool.query<ResultSetHeader>(sql, values)
            return {
                success: true,
                data: {
                    insertId: result.insertId
                }
            }
        }
        catch(err: unknown){
            return DataBaseHandler.errorHandling(err);
        }
    }

    async getFromTable<T extends DefaultDBTable>(table: DataBaseTables, whereColumns?: Record<string, any>, columns?: string[]): Promise<DBResponse<T[]>> {
        try{
            let conditions = "";
            let values = []
            if(whereColumns){
                const keys = Object.keys(whereColumns);
                conditions = keys.map(key => `${key} = ?`).join(" AND ");
                values = keys.map(key => whereColumns[key]);
            }
            const [rows] = await pool.query<RowDataPacket[]>(`SELECT ${columns ? columns.join(", ") : "*"} FROM ${table} ${whereColumns ? `WHERE ${conditions}` : ""}`, [values]);
            return {
                success: true,
                data: rows as T[]
            }
        }
        catch(err: unknown){
            return DataBaseHandler.errorHandling(err)
        }
    }
    async isCommandAllowed(command: number | string, guildMemberId?: number, guildRoleId?: number) {
        if(typeof command === "string"){
            const [commands] = await pool.query<RowDataPacket[]>(`SELECT * commands WHERE tag = ?`, [command])
            if(commands.length) command = commands[0].id
            else{
                return {
                    success: false,
                    error: {
                        possibleReason: "record doesn't exists",
                        relatedTo: "commands"
                    }
                }
            }
        }
        
        if(guildMemberId) {

        }
        else if(guildRoleId) {

        }
        else {

        }
    }
    
    async loadStreamers(): Promise<DBResponse<IStreamers>>{
        try{
            const [rows] = await pool.query<StreamerData[]>("SELECT s.nickname, s.twitch_url, gc.ds_channel_id, g.ds_guild_id FROM twitch_notification_channels as tnc INNER JOIN streamers as s ON tnc.streamer_id = s.id INNER JOIN guild_channels as gc ON tnc.guild_channel_id = gc.id INNER JOIN guilds as g ON gc.guild_id = g.id")
            const finalResponse: IStreamers = {}

            for(let i = 0; i < rows.length; i++){
                if(!finalResponse[rows[i].nickname]){
                    finalResponse[rows[i].nickname] = {
                        guild_id: rows[i].ds_guild_id,
                        channels: [
                            {
                                id: rows[i].ds_channel_id,
                                message_id: null
                            }
                        ],
                        is_live: false,
                        twitch_url: rows[i].twitch_url
                    }
                }
                else{
                    finalResponse[rows[i].nickname].channels.push({
                        id: rows[i].ds_channel_id,
                        message_id: null
                    })
                }
            }
            return {
                success: true,
                data: finalResponse
            }
        }
        catch(err: unknown){
            return DataBaseHandler.errorHandling(err)
        }

    }

    async addGuildToDB(guild: Guild | string): Promise<DBResponse<InsertIdResponse>>{
        try{
            const GeneralSettingsDB = await this.getFromTable<GeneralSettingsDB>("general_settings");
            if(DataBaseHandler.isSuccess(GeneralSettingsDB)) {
                const earningMultiply = GeneralSettingsDB.data[0].default_earning_multiply
                const result = await this.addRecords<GuildsDB>([{
                    id: 0,
                    ds_guild_id: guild instanceof Guild ? guild.id : guild,
                    earning_multiply: earningMultiply
                }], "guilds")
                if(DataBaseHandler.isSuccess(result)) {
                    return {
                        success: true,
                        data: {
                            insertId: result.data.insertId
                        }
                    }
                }
                else return result
            }
            else{
                return GeneralSettingsDB
            }

        }
        catch(err: unknown) {
            return DataBaseHandler.errorHandling(err);
        }
    }

    async deleteGuildFromDB(guild: Guild | string | number): Promise<DBResponse<null>>{
        try{
            if(guild instanceof Guild){
                guild = guild.id;
            }
            const [result] = await pool.query<ResultSetHeader>(`DELETE FROM guilds WHERE ${typeof guild === "number" ? `id = ${guild}` : `ds_guild_id = '${guild}'`}`)
            if(result.affectedRows > 0) {
                return {
                    success: true,
                    data: null
                }
            }
            else{
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "guilds"
                    }
                }
            }
        }
        catch(err: unknown) {
            return DataBaseHandler.errorHandling(err);
        }
    }

    async isMemberExists(member: number | string, writeMember?: boolean, guild?: string | number, writeMemberToGuild?: boolean): Promise<DBResponse<IsExistsResponse>> {
        if (typeof member === "string"){
            const tableResponse = await this.getFromTable<MembersDB>("members", {ds_member_id: member});
            if (DataBaseHandler.isSuccess(tableResponse)){
                if (tableResponse.data.length) member = tableResponse.data[0].id
                else {
                    if(writeMember){
                        const generalSettings = await this.getFromTable<GeneralSettingsDB>("general_settings")
                        if(DataBaseHandler.isSuccess(generalSettings)){
                            if(generalSettings.data.length){
                                const addRecordResponse = await this.addRecords<MembersDB>([{
                                    id: 0,
                                    ds_member_id: member,
                                    balance: generalSettings.data[0].start_balance
                                }], "members")
                                if (DataBaseHandler.isSuccess(addRecordResponse)){
                                    member = addRecordResponse.data.insertId
                                    if(!guild && !writeMemberToGuild)  {
                                        return {
                                            success: true,
                                            data: {
                                                exists: true,
                                                memberId: member
                                            }
                                        }
                                    }
                                } else return addRecordResponse
                            }
                            else {
                                return {
                                    success: false,
                                    error: {
                                        reason: "record_not_found",
                                        relatedTo: "general_settings"
                                    }
                                }
                            }
                        }
                        else return generalSettings
                    }
                    else{
                        return {
                            success: false,
                            error: {
                                reason: "record_not_found",
                                relatedTo: "members"
                            }
                        }
                    }

                }
            }
            else return tableResponse
        }
        if (guild){
            if (typeof guild === "number"){
                const tableResponse = await this.getFromTable<GuildsDB>("guilds", {id: guild})
                if(DataBaseHandler.isSuccess(tableResponse)){
                    if(!tableResponse.data.length) return {
                        success: false,
                        error: {
                            reason: "record_not_found",
                            relatedTo: "guilds"
                        }
                    }
                }
                else {
                    return tableResponse
                }
            }
            else if (typeof guild === "string"){
                const tableResponse = await this.getFromTable<GuildsDB>("guilds", {ds_guild_id: guild});
                if (DataBaseHandler.isSuccess(tableResponse)){
                    if (tableResponse.data.length) guild = tableResponse.data[0].id
                    else {
                        return {
                            success: false,
                            error: {
                                reason: "record_not_found",
                                relatedTo: "guilds"
                            }
                        }
                    }
                }
                else return tableResponse
            }
            const guildMembersResponse = await this.getFromTable<GuildMembersD>("guild_members", {guild_id: guild, member_id: member})
            if(DataBaseHandler.isSuccess(guildMembersResponse)){
                if(guildMembersResponse.data.length){
                    return {
                        success: true,
                        data: {
                            exists: true,
                            memberId: member,
                            guildId: guild,
                            guildMemberId: guildMembersResponse.data[0].id
                        }
                    }
                }
                else if (writeMemberToGuild){
                    const addGuildMember = await this.addRecords<GuildMembersD>([{
                        id: 0,
                        guild_id: guild,
                        member_id: member
                    }], "guild_members")
                    if(DataBaseHandler.isSuccess(addGuildMember)){
                        return {
                            success: true,
                            data: {
                                exists: true,
                                guildId: guild,
                                memberId: member,
                                guildMemberId: addGuildMember.data.insertId
                            }
                        }
                    }
                    else{
                        return addGuildMember
                    }
                }
                else{
                    return {
                        success: true,
                        data: {
                            exists: false,
                            memberId: member,
                            guildId: guild
                        }
                    }
                }
            }
            else{
                return guildMembersResponse
            }
        }
        else {
            const getMemberResponse = await this.getFromTable<MembersDB>("members", {id: member});
            if(DataBaseHandler.isSuccess(getMemberResponse)){
                if(getMemberResponse.data.length){
                    return {
                        success: true,
                        data: {
                            exists: true,
                            memberId: member
                        }
                    }
                }
                else {
                    const response: IsExistsResponse =  {
                        exists: false
                    } 
                    return {
                        success: true,
                        data: response
                    }
                }
            }
            else{
                return getMemberResponse
            }
        }
    }
}

export const dataBaseHandler = DataBaseHandler.getInstance();