import { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../db.js";
import { CommandsDB, DataBaseTables, DefaultDBTable, GeneralSettingsDB, GuildChannels, GuildMembersD, GuildRolesDB, GuildsDB, LogsChannelsDB, LogTypesDB, MembersDB, MemberStatuses, StreamersDB, TwitchNotificationChannelsDB } from "../types/database.types.js";
import { IStreamers } from "../types/streamers.types.js";
import { ChannelType, Guild, Interaction, PermissionsBitField } from "discord.js";

export interface GuildBootstrapSummary {
    guildId: number;
    syncedChannels: number;
    removedChannels: number;
    syncedRoles: number;
    removedRoles: number;
    bootstrapChannelId: string | null;
    configuredLogChannels: number;
}

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

export enum UpdateType {
    Add = "add"
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
            console.log("EUU", `SELECT ${columns ? columns.join(", ") : "*"} FROM ${table} ${whereColumns ? `WHERE ${conditions}` : ""}`)
            console.log("AAAAND", values)
            const [rows] = await pool.query<RowDataPacket[]>(`SELECT ${columns ? columns.join(", ") : "*"} FROM ${table} ${whereColumns ? `WHERE ${conditions}` : ""}`, values);
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

    async ensureGuildBootstrap(guild: Guild): Promise<DBResponse<GuildBootstrapSummary>> {
        try {
            const guildRecordResponse = await this.ensureGuildRecord(guild);
            if (DataBaseHandler.isFail(guildRecordResponse)) {
                return guildRecordResponse;
            }

            const ownerResponse = await this.ensureGuildMemberStatus(guild.ownerId, guildRecordResponse.data.id, MemberStatuses.GuildOwner);
            if (DataBaseHandler.isFail(ownerResponse)) {
                return ownerResponse;
            }

            const channelIds = guild.channels.cache
                .filter(channel => !channel.isThread() && channel.type !== ChannelType.GuildCategory)
                .map(channel => channel.id);
            const roleIds = guild.roles.cache
                .filter(role => !role.managed)
                .map(role => role.id);
            const bootstrapChannelId = this.resolveBootstrapChannelId(guild);

            const channelsResponse = await this.ensureGuildChannels(guildRecordResponse.data.id, channelIds);
            if (DataBaseHandler.isFail(channelsResponse)) {
                return channelsResponse;
            }

            const rolesResponse = await this.ensureGuildRoles(guildRecordResponse.data.id, roleIds);
            if (DataBaseHandler.isFail(rolesResponse)) {
                return rolesResponse;
            }

            const logChannelResponse = await this.ensureDefaultLogChannels(guildRecordResponse.data.id, bootstrapChannelId);
            if (DataBaseHandler.isFail(logChannelResponse)) {
                return logChannelResponse;
            }

            return {
                success: true,
                data: {
                    guildId: guildRecordResponse.data.id,
                    syncedChannels: channelsResponse.data.synced,
                    removedChannels: channelsResponse.data.removed,
                    syncedRoles: rolesResponse.data.synced,
                    removedRoles: rolesResponse.data.removed,
                    bootstrapChannelId,
                    configuredLogChannels: logChannelResponse.data.configured,
                }
            };
        }
        catch (err: unknown) {
            return DataBaseHandler.errorHandling(err);
        }
    }

    async updateTable(
        table: DataBaseTables,
        column: string,
        value: any,
        whereColumns?: Record<string, any>,
        updateType?: UpdateType
    ): Promise<DBResponse<{modified: number}>>{
        try{
            let result: ResultSetHeader
            let conditions = "";
            let values = [value];

            if (whereColumns && Object.keys(whereColumns).length) {
                const keys = Object.keys(whereColumns);
                conditions = ` WHERE ${keys.map(key => `${key} = ?`).join(" AND ")}`;
                values = [value, ...keys.map(key => whereColumns[key])];
            }

            if(updateType === UpdateType.Add){
                result = (await pool.query<ResultSetHeader>(`UPDATE ${table} SET ${column} = ${column} + ?${conditions}`, values))[0]
            }
            else {
                result = (await pool.query<ResultSetHeader>(`UPDATE ${table} SET ${column} = ?${conditions}`, values))[0]
            }
            return {
                success: true,
                data: {
                    modified: result.affectedRows
                }
            }
        }
        catch(err: unknown){
            return DataBaseHandler.errorHandling(err);
        }
    }

    private async ensureGuildRecord(guild: Guild | string): Promise<DBResponse<GuildsDB>> {
        try {
            const discordGuildId = guild instanceof Guild ? guild.id : guild;
            const existingGuildResponse = await this.getFromTable<GuildsDB>("guilds", { ds_guild_id: discordGuildId });
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

            const createdGuildResponse = await this.getFromTable<GuildsDB>("guilds", { id: addGuildResponse.data.insertId });
            if (DataBaseHandler.isFail(createdGuildResponse) || !createdGuildResponse.data.length) {
                return DataBaseHandler.errorHandling(new Error("Created guild record was not found."));
            }

            return {
                success: true,
                data: createdGuildResponse.data[0],
            };
        }
        catch (err: unknown) {
            return DataBaseHandler.errorHandling(err);
        }
    }

    private async ensureGuildMemberStatus(discordUserId: string, guildId: number, memberStatusId: MemberStatuses): Promise<DBResponse<{ guildMemberId: number }>> {
        try {
            const memberResponse = await this.isMemberExists(discordUserId, true);
            if (DataBaseHandler.isFail(memberResponse) || !memberResponse.data.memberId) {
                return DataBaseHandler.isFail(memberResponse)
                    ? memberResponse
                    : DataBaseHandler.errorHandling(new Error("Unable to resolve member."));
            }

            const guildMemberResponse = await this.getFromTable<GuildMembersD>("guild_members", {
                guild_id: guildId,
                member_id: memberResponse.data.memberId,
            });
            if (DataBaseHandler.isFail(guildMemberResponse)) {
                return guildMemberResponse;
            }

            if (guildMemberResponse.data.length) {
                const guildMember = guildMemberResponse.data[0] as GuildMembersD & { member_status_id?: number };
                if (guildMember.member_status_id !== memberStatusId) {
                    const updateResponse = await this.updateTable("guild_members", "member_status_id", memberStatusId, { id: guildMember.id });
                    if (DataBaseHandler.isFail(updateResponse)) {
                        return updateResponse;
                    }
                }

                return {
                    success: true,
                    data: {
                        guildMemberId: guildMember.id,
                    },
                };
            }

            const insertResponse = await this.addRecords<GuildMembersD>([{
                id: 0,
                guild_id: guildId,
                member_id: memberResponse.data.memberId,
                member_status_id: memberStatusId,
            }], "guild_members");
            if (DataBaseHandler.isFail(insertResponse)) {
                return insertResponse;
            }

            return {
                success: true,
                data: {
                    guildMemberId: insertResponse.data.insertId,
                },
            };
        }
        catch (err: unknown) {
            return DataBaseHandler.errorHandling(err);
        }
    }

    private async ensureGuildChannels(guildId: number, discordChannelIds: string[]): Promise<DBResponse<{ synced: number; removed: number }>> {
        try {
            const existingResponse = await this.getFromTable<GuildChannels>("guild_channels", { guild_id: guildId });
            if (DataBaseHandler.isFail(existingResponse)) {
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
                        [guildId, ...activeChannelIds]
                    );
                } else {
                    await pool.query(`DELETE FROM logs_channels WHERE guild_id = ?`, [guildId]);
                }
            }

            if (channelsToInsert.length) {
                const insertResponse = await this.addRecords<GuildChannels>(channelsToInsert, "guild_channels");
                if (DataBaseHandler.isFail(insertResponse)) {
                    return insertResponse;
                }
            }

            return {
                success: true,
                data: { synced: channelsToInsert.length, removed: staleChannelIds.length },
            };
        }
        catch (err: unknown) {
            return DataBaseHandler.errorHandling(err);
        }
    }

    private async ensureGuildRoles(guildId: number, discordRoleIds: string[]): Promise<DBResponse<{ synced: number; removed: number }>> {
        try {
            const existingResponse = await this.getFromTable<GuildRolesDB>("guild_roles", { guild_id: guildId });
            if (DataBaseHandler.isFail(existingResponse)) {
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
                const insertResponse = await this.addRecords<GuildRolesDB>(rolesToInsert, "guild_roles");
                if (DataBaseHandler.isFail(insertResponse)) {
                    return insertResponse;
                }
            }

            return {
                success: true,
                data: { synced: rolesToInsert.length, removed: staleRoleIds.length },
            };
        }
        catch (err: unknown) {
            return DataBaseHandler.errorHandling(err);
        }
    }

    private resolveBootstrapChannelId(guild: Guild): string | null {
        const me = guild.members.me;
        const canSend = (channelId?: string | null): boolean => {
            if (!channelId) {
                return false;
            }

            const channel = guild.channels.cache.get(channelId);
            if (!channel || !channel.isTextBased() || channel.isThread()) {
                return false;
            }

            if (!me) {
                return true;
            }

            return channel.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages) ?? false;
        };

        if (canSend(guild.systemChannelId)) {
            return guild.systemChannelId;
        }

        const fallbackChannel = guild.channels.cache.find(channel => {
            if (!channel.isTextBased() || channel.isThread()) {
                return false;
            }

            if (!me) {
                return true;
            }

            return channel.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages) ?? false;
        });

        return fallbackChannel?.id ?? null;
    }

    private async ensureDefaultLogChannels(guildId: number, channelId: string | null): Promise<DBResponse<{ configured: number }>> {
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
            if (logTypeIds.some(result => DataBaseHandler.isFail(result))) {
                return logTypeIds.find(result => DataBaseHandler.isFail(result)) as DBResponse<{ configured: number }>;
            }

            let configured = 0;
            for (const logTypeResult of logTypeIds) {
                const logTypeId = (logTypeResult as DBResponse<InsertIdResponse | number> & { data: number }).data;
                const existingResponse = await this.getFromTable<LogsChannelsDB>("logs_channels", {
                    guild_id: guildId,
                    log_type_id: logTypeId,
                });
                if (DataBaseHandler.isFail(existingResponse)) {
                    return existingResponse;
                }

                if (!existingResponse.data.length) {
                    const insertResponse = await this.addRecords<LogsChannelsDB>([{
                        id: 0,
                        guild_id: guildId,
                        log_type_id: logTypeId,
                        ds_channel_id: channelId,
                    }], "logs_channels");
                    if (DataBaseHandler.isFail(insertResponse)) {
                        return insertResponse;
                    }
                    configured += 1;
                    continue;
                }

                if (existingResponse.data[0].ds_channel_id !== channelId) {
                    const updateResponse = await this.updateTable("logs_channels", "ds_channel_id", channelId, { id: existingResponse.data[0].id });
                    if (DataBaseHandler.isFail(updateResponse)) {
                        return updateResponse;
                    }
                }
            }

            return {
                success: true,
                data: { configured },
            };
        }
        catch (err: unknown) {
            return DataBaseHandler.errorHandling(err);
        }
    }

    private async ensureLogType(name: string): Promise<DBResponse<number>> {
        try {
            const existingResponse = await this.getFromTable<LogTypesDB>("log_types", { name });
            if (DataBaseHandler.isFail(existingResponse)) {
                return existingResponse;
            }

            if (existingResponse.data.length) {
                return {
                    success: true,
                    data: existingResponse.data[0].id,
                };
            }

            const insertResponse = await this.addRecords<LogTypesDB>([{ id: 0, name }], "log_types");
            if (DataBaseHandler.isFail(insertResponse)) {
                return insertResponse;
            }

            return {
                success: true,
                data: insertResponse.data.insertId,
            };
        }
        catch (err: unknown) {
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

    async isMemberExists(member: number | string, writeMember?: boolean, guild?: string | number, writeMemberToGuild?: boolean, interaction?: Interaction): Promise<DBResponse<IsExistsResponse>> {
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
                        member_id: member,
                        member_status_id: (interaction?.user.id === interaction?.guild?.ownerId ? MemberStatuses.GuildOwner : MemberStatuses.Default)
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
