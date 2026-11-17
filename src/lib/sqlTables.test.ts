import { describe, expect, it } from "vitest";
import { remapSqlTables, sqlTableReferences } from "./sqlTables";

describe("SQL table provenance", () => {
  it("finds physical tables in nested queries and joins while ignoring CTE and node aliases", () => {
    const sql = 'WITH result AS (SELECT * FROM "data" JOIN other ON true) SELECT * FROM result, (SELECT * FROM third) nested JOIN input ON true';
    expect(sqlTableReferences(sql).map((ref) => ref.name)).toEqual(["data", "other", "third"]);
  });

  it("finds comma-separated tables and ignores comments and string literals", () => {
    const sql = "SELECT 'FROM fake', value FROM data a, other b WHERE a.value = 'JOIN fake' /* FROM fake */";
    expect(sqlTableReferences(sql).map((ref) => ref.name)).toEqual(["data", "other"]);
  });

  it("handles multiple CTEs and preserves a CTE name that matches its physical source", () => {
    const sql = 'WITH data AS (SELECT * FROM data), second AS (SELECT * FROM data) SELECT * FROM second';
    expect(sqlTableReferences(sql).map((ref) => ref.name)).toEqual(["data"]);
    expect(remapSqlTables(sql, { data: "data_2" })).toBe('WITH data AS (SELECT * FROM "data_2"), second AS (SELECT * FROM data) SELECT * FROM second');
  });

  it("tracks qualified tables and keeps CTE aliases inside their scope", () => {
    const sql = 'SELECT * FROM (WITH other AS (SELECT * FROM main.data) SELECT * FROM other) nested JOIN other ON true';
    expect(sqlTableReferences(sql).map((ref) => ref.name)).toEqual(["data", "other"]);
  });

  it("does not treat FROM inside SQL expressions as a table reference", () => {
    const sql = 'SELECT EXTRACT(day FROM recorded_at), SUBSTRING(label FROM 1) FROM data';
    expect(sqlTableReferences(sql).map((ref) => ref.name)).toEqual(["data"]);
  });

  it("renames physical tables without changing column names or literal values", () => {
    expect(remapSqlTables('SELECT data, \'data\' FROM "data" JOIN other ON true', { data: "data_2", other: "other_3" }))
      .toBe('SELECT data, \'data\' FROM "data_2" JOIN "other_3" ON true');
  });
});
