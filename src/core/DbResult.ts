import type { DataBaseTables } from "../types/database.types.js";

export type PossibleErrorReason = "record_not_found" | "mysql_error" | "unknown";
export type RelatedTo = "unknown" | DataBaseTables;

export interface DBError {
    reason: PossibleErrorReason;
    relatedTo: RelatedTo;
    code?: string;
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

export enum UpdateType {
    Add = "add"
}

export function isSuccess<T>(res: DBResponse<T>): res is DBResponseSuccess<T> {
    return res.success;
}

export function isFail<T>(res: DBResponse<T>): res is DBResponseFail {
    return !res.success;
}

export function errorHandling(err?: unknown): DBResponseFail {
    console.log(" Error handling...")
    console.error(err)
    return {
        success: false,
        error: {
            reason: "unknown",
            relatedTo: "unknown",
            code: err instanceof Error && typeof (err as Error & { code?: unknown }).code === "string"
                ? (err as Error & { code?: string }).code
                : undefined,
            message: err instanceof Error ? err.message : undefined
        }
    }
}