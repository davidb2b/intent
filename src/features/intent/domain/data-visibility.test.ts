import { describe, expect, it } from "vitest";
import {
  canClientReadPersonStatus,
  CLIENT_VISIBLE_PERSON_COLUMNS,
  isServerOnlyTable,
  PRIVATE_PERSON_COLUMNS,
  SERVER_ONLY_TABLES,
} from "./data-visibility";

describe("Intent v1 private data boundary", () => {
  it("keeps the internal radar out of every client list", () => {
    expect(canClientReadPersonStatus("vigiado")).toBe(false);
    expect(canClientReadPersonStatus("fora_icp")).toBe(false);
    expect(canClientReadPersonStatus("fora_icp", true)).toBe(true);
    expect(canClientReadPersonStatus("lead")).toBe(true);
  });

  it("uses an explicit client column allowlist", () => {
    for (const column of PRIVATE_PERSON_COLUMNS) {
      expect(CLIENT_VISIBLE_PERSON_COLUMNS).not.toContain(column);
    }
  });

  it("makes all operational and contact tables server-only", () => {
    expect(SERVER_ONLY_TABLES).toHaveLength(5);
    for (const table of SERVER_ONLY_TABLES) expect(isServerOnlyTable(table)).toBe(true);
    expect(isServerOnlyTable("pessoas")).toBe(false);
  });
});
