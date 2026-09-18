import type { FastifyReply } from "fastify";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const cell = String(value);
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** UTF-8 BOM so Excel (the actual target — plan §10) opens accented names correctly instead of guessing Latin-1. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return "﻿" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function sendCsv(reply: FastifyReply, filename: string, csv: string) {
  reply.header("content-type", "text/csv; charset=utf-8");
  reply.header("content-disposition", `attachment; filename="${filename}"`);
  return reply.send(csv);
}

/**
 * Reads a CSV the office exported from somewhere else — the payment system,
 * a spreadsheet, last season's file. Handles what those actually produce:
 * a UTF-8 BOM, quoted cells with commas or embedded quotes, and CRLF.
 *
 * Returns rows keyed by header, headers lower-cased and trimmed so
 * `Worker Number`, `worker_number` and `WORKERNUMBER` all arrive as one
 * thing — the farm should not have to reformat its own file to be let in.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const body = text.replace(/^\ufeff/, "");

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];

    if (quoted) {
      if (char !== '"') cell += char;
      else if (body[i + 1] === '"') (cell += '"'), (i += 1);
      else quoted = false;
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") (row.push(cell), (cell = ""));
    else if (char === "\n" || char === "\r") {
      // A CRLF is one break, not two empty rows.
      if (char === "\r" && body[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);

  const [headers, ...body_rows] = rows;
  if (!headers) return [];

  const keys = headers.map((header) => header.trim().toLowerCase().replace(/[\s-]+/g, "_"));

  return body_rows.map((values) => Object.fromEntries(keys.map((key, index) => [key, (values[index] ?? "").trim()])));
}
