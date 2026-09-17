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
