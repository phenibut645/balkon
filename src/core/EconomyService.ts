import { ResultSetHeader, RowDataPacket } from "mysql2";
import { PoolConnection } from "mysql2/promise";
import pool from "../db.js";
import { NotificationService } from "./NotificationService.js";
import { memberService } from "./MemberService.js";

type EconomyTotals = {
  totalOdm: number;
  totalLdm: number;
  membersCount: number;
};

type EconomySnapshotPoint = {
  date: string;
  totalOdm: number;
  totalLdm: number;
  membersCount: number;
};

type CapitalizationChange = {
  previousTotalOdm: number | null;
  absolute: number | null;
  percent: number | null;
  direction: "up" | "down" | "flat" | "unknown";
};

export type MarketCapitalization = {
  points: EconomySnapshotPoint[];
  current: EconomyTotals;
  change: CapitalizationChange;
};

export type AdminEconomyCurrency = "ODM" | "LDM";

export type AdminAdjustMemberBalanceInput = {
  adminDiscordId: string;
  targetDiscordId: string;
  currency: AdminEconomyCurrency;
  amount: number;
  reason: string;
};

export type AdminAdjustMemberBalanceResult = {
  targetDiscordId: string;
  currency: AdminEconomyCurrency;
  amount: number;
  balanceAfter: number;
  reason: string;
};

export type RoulettePayoutResult = {
  success: boolean;
  modified?: number;
  error?: unknown;
};

export type JobRewardCreditResult = {
  balanceAfter: number;
};

export type MemberBalancesLookupResult =
  | {
    success: true;
    data: {
      balance: number | string | null;
      ldm_balance: number | string | null;
    } | null;
  }
  | {
    success: false;
    error: unknown;
  };

interface TotalsRow extends RowDataPacket {
  total_odm: number | string | null;
  total_ldm: number | string | null;
  members_count: number | string | null;
}

interface SnapshotRow extends RowDataPacket {
  snapshot_date: Date | string;
  total_odm: number | string;
  total_ldm: number | string;
  members_count: number | string;
}

interface MemberBalanceRow extends RowDataPacket {
  id: number;
  ds_member_id: string;
  balance: number | string | null;
  ldm_balance: number | string | null;
}

interface MemberBalanceOnlyRow extends RowDataPacket {
  balance: number | string | null;
}

class EconomyAdjustmentError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "EconomyAdjustmentError";
  }
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoDate(value: Date | string): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export class EconomyService {
  private static instance: EconomyService;

  static getInstance(): EconomyService {
    if (!EconomyService.instance) {
      EconomyService.instance = new EconomyService();
    }

    return EconomyService.instance;
  }

  async getCurrentEconomyTotals(): Promise<EconomyTotals> {
    const [rows] = await pool.query<TotalsRow[]>(
      `SELECT
        COALESCE(SUM(balance), 0) AS total_odm,
        COALESCE(SUM(ldm_balance), 0) AS total_ldm,
        COUNT(*) AS members_count
       FROM members`
    );

    const row = rows[0];

    return {
      totalOdm: toNumber(row?.total_odm),
      totalLdm: toNumber(row?.total_ldm),
      membersCount: toNumber(row?.members_count),
    };
  }

  async upsertTodayEconomySnapshot(): Promise<void> {
    const totals = await this.getCurrentEconomyTotals();

    await pool.query(
      `INSERT INTO economy_daily_snapshots (
         snapshot_date,
         total_odm,
         total_ldm,
         members_count
       ) VALUES (CURRENT_DATE(), ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         total_odm = VALUES(total_odm),
         total_ldm = VALUES(total_ldm),
         members_count = VALUES(members_count),
         updated_at = CURRENT_TIMESTAMP`,
      [totals.totalOdm, totals.totalLdm, totals.membersCount]
    );
  }

  async listEconomySnapshots(days: number): Promise<EconomySnapshotPoint[]> {
    const safeDays = Math.max(2, Math.min(60, Math.floor(days)));

    const [rows] = await pool.query<SnapshotRow[]>(
      `SELECT snapshot_date, total_odm, total_ldm, members_count
       FROM economy_daily_snapshots
       ORDER BY snapshot_date DESC
       LIMIT ?`,
      [safeDays]
    );

    return rows
      .slice()
      .reverse()
      .map(row => ({
        date: toIsoDate(row.snapshot_date),
        totalOdm: toNumber(row.total_odm),
        totalLdm: toNumber(row.total_ldm),
        membersCount: toNumber(row.members_count),
      }));
  }

  async getMarketCapitalization(days = 15): Promise<MarketCapitalization> {
    await this.upsertTodayEconomySnapshot();

    const points = await this.listEconomySnapshots(days);
    const currentPoint = points.at(-1) ?? null;
    const previousPoint = points.length >= 2 ? points[points.length - 2] : null;

    const current: EconomyTotals = currentPoint
      ? {
        totalOdm: currentPoint.totalOdm,
        totalLdm: currentPoint.totalLdm,
        membersCount: currentPoint.membersCount,
      }
      : await this.getCurrentEconomyTotals();

    let change: CapitalizationChange;

    if (!previousPoint) {
      change = {
        previousTotalOdm: null,
        absolute: null,
        percent: null,
        direction: "unknown",
      };
    } else {
      const previous = previousPoint.totalOdm;
      const absolute = current.totalOdm - previous;

      if (previous === 0) {
        if (current.totalOdm > 0) {
          change = {
            previousTotalOdm: previous,
            absolute,
            percent: null,
            direction: "up",
          };
        } else {
          change = {
            previousTotalOdm: previous,
            absolute,
            percent: null,
            direction: "flat",
          };
        }
      } else {
        const percent = (absolute / previous) * 100;
        change = {
          previousTotalOdm: previous,
          absolute,
          percent,
          direction: absolute > 0 ? "up" : absolute < 0 ? "down" : "flat",
        };
      }
    }

    return {
      points,
      current,
      change,
    };
  }

  async getMemberBalancesByDiscordId(discordUserId: string): Promise<MemberBalancesLookupResult> {
    try {
      const [rows] = await pool.query<MemberBalanceRow[]>(
        `SELECT balance, ldm_balance
         FROM members
         WHERE ds_member_id = ?
         LIMIT 1`,
        [discordUserId],
      );

      const row = rows[0] ?? null;

      return {
        success: true,
        data: row
          ? {
            balance: row.balance,
            ldm_balance: row.ldm_balance,
          }
          : null,
      };
    } catch (error) {
      return {
        success: false,
        error,
      };
    }
  }

  async creditRoulettePayoutByDiscordId(
    discordUserId: string,
    payoutAmount: number,
  ): Promise<RoulettePayoutResult> {
    try {
      const [result] = await pool.query<ResultSetHeader>(
        `UPDATE members
         SET balance = balance + ?
         WHERE ds_member_id = ?`,
        [payoutAmount, discordUserId],
      );

      return {
        success: true,
        modified: result.affectedRows,
      };
    } catch (error) {
      return {
        success: false,
        error,
      };
    }
  }

  async creditJobReward(
    input: {
      memberId: number;
      amount: number;
    },
    connection: PoolConnection,
  ): Promise<JobRewardCreditResult> {
    await connection.query<ResultSetHeader>(
      `UPDATE members
       SET balance = balance + ?
       WHERE id = ?`,
      [input.amount, input.memberId],
    );

    const [balanceRows] = await connection.query<MemberBalanceOnlyRow[]>(
      `SELECT balance
       FROM members
       WHERE id = ?
       LIMIT 1`,
      [input.memberId],
    );

    const balanceRow = balanceRows[0];
    if (!balanceRow) {
      throw new Error("Failed to load job reward balance.");
    }

    return {
      balanceAfter: toNumber(balanceRow.balance),
    };
  }

  async adjustMemberBalanceByAdmin(input: AdminAdjustMemberBalanceInput): Promise<AdminAdjustMemberBalanceResult> {
    let adminMemberId: number;
    try {
      adminMemberId = await memberService.ensureMemberByDiscordId(input.adminDiscordId, { createdSource: "unknown" });
    } catch {
      throw new EconomyAdjustmentError("TARGET_MEMBER_CREATE_FAILED", "Failed to resolve admin member.");
    }

    let targetMemberId: number;
    try {
      targetMemberId = await memberService.ensureMemberByDiscordId(input.targetDiscordId, { createdSource: "unknown" });
    } catch {
      throw new EconomyAdjustmentError("TARGET_MEMBER_CREATE_FAILED", "Failed to resolve target member.");
    }

    const column = input.currency === "ODM" ? "balance" : "ldm_balance";

    let connection: PoolConnection | null = null;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      let updateResult: ResultSetHeader;
      if (input.amount > 0) {
        const [result] = await connection.query<ResultSetHeader>(
          `UPDATE members SET ${column} = ${column} + ? WHERE id = ?`,
          [input.amount, targetMemberId],
        );
        updateResult = result;
      } else {
        const [result] = await connection.query<ResultSetHeader>(
          `UPDATE members SET ${column} = ${column} + ? WHERE id = ? AND ${column} + ? >= 0`,
          [input.amount, targetMemberId, input.amount],
        );
        updateResult = result;
      }

      if (updateResult.affectedRows !== 1) {
        await connection.rollback();
        throw new EconomyAdjustmentError("NOT_ENOUGH_BALANCE_TO_DEDUCT", "Target user does not have enough balance for this deduction.");
      }

      const [balanceRows] = await connection.query<MemberBalanceRow[]>(
        `SELECT id, ds_member_id, balance, ldm_balance FROM members WHERE id = ? LIMIT 1`,
        [targetMemberId],
      );

      const balanceRow = balanceRows[0];
      if (!balanceRow) {
        await connection.rollback();
        throw new EconomyAdjustmentError("BALANCE_ADJUST_FAILED", "Failed to load adjusted balance.");
      }

      const balanceAfter = toNumber(input.currency === "ODM" ? balanceRow.balance : balanceRow.ldm_balance);

      await connection.query(
        `INSERT INTO admin_economy_adjustments (
           admin_member_id,
           target_member_id,
           currency,
           amount,
           balance_after,
           reason
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [adminMemberId, targetMemberId, input.currency, input.amount, balanceAfter, input.reason],
      );

      await connection.commit();

      void this.notifyTargetMember({
        targetMemberId: targetMemberId,
        currency: input.currency,
        amount: input.amount,
        reason: input.reason,
      });

      return {
        targetDiscordId: input.targetDiscordId,
        currency: input.currency,
        amount: input.amount,
        balanceAfter,
        reason: input.reason,
      };
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }

      if (error instanceof EconomyAdjustmentError) {
        throw error;
      }

      throw new EconomyAdjustmentError("BALANCE_ADJUST_FAILED", error instanceof Error ? error.message : "Failed to adjust balance.");
    } finally {
      connection?.release();
    }
  }

  isAdminAdjustmentError(error: unknown): error is { code: string; message: string } {
    return error instanceof EconomyAdjustmentError;
  }

  private async notifyTargetMember(input: {
    targetMemberId: number;
    currency: AdminEconomyCurrency;
    amount: number;
    reason: string;
  }): Promise<void> {
    try {
      const amountWithSign = `${input.amount > 0 ? "+" : ""}${input.amount} ${input.currency}`;
      await NotificationService.getInstance().createForMember(input.targetMemberId, {
        type: "economy_adjustment",
        severity: input.amount > 0 ? "success" : "warning",
        title: "Balance updated",
        body: `Your balance was adjusted by ${amountWithSign}. Reason: ${input.reason}`,
      });
    } catch (error) {
      console.error("Failed to create economy adjustment notification", error);
    }
  }
}
