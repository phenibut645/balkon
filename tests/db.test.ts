// db.test.ts
import { describe, it, expect, vi } from "vitest";
import * as db from "../src/db";

vi.mock("mysql2/promise", () => {
  return {
    createPool: () => ({
      query: vi.fn().mockResolvedValue([[{ id: 1, name: "Alice" }], []])
    })
  };
});

