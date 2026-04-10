import { describe, it, expect, vi } from "vitest";
import * as db from "../src/db";

vi.mock("mysql2/promise", () => {
  const mockedPool = {
    query: vi.fn().mockResolvedValue([[{ id: 1, name: "Alice" }], []])
  };

  return {
    default: {
      createPool: () => mockedPool,
    },
    createPool: () => mockedPool,
  };
});

describe("db pool", () => {
  it("exports a pool-like object with query support", async () => {
    expect(db.default).toBeDefined();
    expect(typeof (db.default as { query: unknown }).query).toBe("function");

    const result = await db.default.query("SELECT 1");
    expect(result[0]).toEqual([{ id: 1, name: "Alice" }]);
  });
});

