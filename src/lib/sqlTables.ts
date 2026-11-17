interface SqlToken {
  value: string;
  start: number;
  end: number;
  identifier: boolean;
  quoted: boolean;
}

export interface SqlTableReference {
  name: string;
  start: number;
  end: number;
}

export function sqlTableReferences(sql: string): SqlTableReference[] {
  const tokens: SqlToken[] = [];
  const pattern = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|[a-z_][\w$]*|[^\s]/gi;
  for (const match of sql.matchAll(pattern)) {
    const text = match[0];
    if (text.startsWith("--") || text.startsWith("/*") || text.startsWith("'")) continue;
    tokens.push({
      value: text.startsWith('"') ? text.slice(1, -1).replace(/""/g, '"') : text,
      start: match.index,
      end: match.index + text.length,
      quoted: text.startsWith('"'),
      identifier: text.startsWith('"') || /^[a-z_]/i.test(text),
    });
  }
  const afterParentheses = (open: number): number => {
    let depth = 0;
    for (let cursor = open; cursor < tokens.length; cursor++) {
      if (tokens[cursor].value === "(") depth++;
      if (tokens[cursor].value === ")" && --depth === 0) return cursor + 1;
    }
    return tokens.length;
  };
  const aliases: { name: string; start: number; end: number; bodyStart: number; bodyEnd: number; recursive: boolean }[] = [];
  const enclosing = [{ start: 0, end: tokens.length }];
  for (let i = 0; i < tokens.length; i++) {
    if (!tokens[i].quoted && tokens[i].value === "(") enclosing.push({ start: i, end: afterParentheses(i) });
    if (!tokens[i].quoted && tokens[i].value === ")" && enclosing.length > 1) enclosing.pop();
    if (tokens[i].quoted || tokens[i].value.toLowerCase() !== "with") continue;
    let cursor = i + 1;
    const recursive = tokens[cursor]?.value.toLowerCase() === "recursive";
    if (recursive) cursor++;
    while (tokens[cursor]?.identifier) {
      const alias = tokens[cursor++].value;
      if (tokens[cursor]?.value === "(") {
        cursor = afterParentheses(cursor);
      }
      if (tokens[cursor]?.value.toLowerCase() !== "as") break;
      cursor++;
      if (tokens[cursor]?.value.toLowerCase() === "not") cursor++;
      if (tokens[cursor]?.value.toLowerCase() === "materialized") cursor++;
      if (tokens[cursor]?.value !== "(") break;
      const bodyEnd = afterParentheses(cursor);
      aliases.push({ name: alias.toLowerCase(), start: i, end: enclosing[enclosing.length - 1].end, bodyStart: cursor, bodyEnd, recursive });
      cursor = bodyEnd;
      if (tokens[cursor]?.value !== ",") break;
      cursor++;
    }
  }
  const result: SqlTableReference[] = [];
  const scopes = [{ from: false, expected: false, query: true }];
  const terminators = new Set(["where", "group", "order", "having", "limit", "qualify", "window", "union", "except", "intersect"]);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const value = token.value.toLowerCase();
    const scope = scopes[scopes.length - 1];
    if (scope.expected && token.identifier && (token.quoted || !["lateral", "only"].includes(value))) {
      scope.expected = false;
      let relation = token;
      let qualified = false;
      while (tokens[i + 1]?.value === "." && tokens[i + 2]?.identifier) {
        i += 2;
        relation = tokens[i];
        qualified = true;
      }
      if (tokens[i + 1]?.value === "(") continue;
      const name = relation.value.toLowerCase();
      if (!qualified && (aliases.some((alias) => alias.name === name && i >= alias.start && i < alias.end && (alias.recursive || i < alias.bodyStart || i >= alias.bodyEnd)) || /^input\d*$/i.test(name) || /^_node_/i.test(name))) continue;
      result.push({ name: relation.value, start: relation.start, end: relation.end });
    } else if (value === "(") {
      const subquery = ["select", "with", "from"].includes(tokens[i + 1]?.value.toLowerCase());
      const groupedRelation = scope.expected && !subquery;
      scope.expected = false;
      scopes.push({ from: groupedRelation, expected: groupedRelation, query: subquery || groupedRelation });
    } else if (value === ")") {
      if (scopes.length > 1) scopes.pop();
    } else if (scope.query && !token.quoted && (value === "from" || value === "join")) {
      scope.from = true;
      scope.expected = true;
    } else if (!token.quoted && terminators.has(value)) {
      scope.from = false;
      scope.expected = false;
    } else if (value === "," && scope.from) {
      scope.expected = true;
    }
  }
  return result;
}

export function remapSqlTables(sql: string, tableNames: Record<string, string>): string {
  for (const ref of sqlTableReferences(sql).reverse()) {
    const key = Object.keys(tableNames).find((name) => name.toLowerCase() === ref.name.toLowerCase());
    if (key) sql = `${sql.slice(0, ref.start)}"${tableNames[key].replace(/"/g, '""')}"${sql.slice(ref.end)}`;
  }
  return sql;
}
