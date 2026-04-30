import { RowDataPacket } from "mysql2";
import pool from "../db.js";

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
}
