import type { ObjectId } from "mongodb";
import { collections, invoiceToSummary } from "../db";
import { lastMonths, todayAR } from "../format";
import type { InvoiceSummaryDTO } from "../types";

export interface Metrics {
  month: string; // "AAAA-MM"
  clients: number;
  drafts: number;
  billedThisMonth: { cents: number; count: number };
  collectedThisMonth: { cents: number; count: number };
  pending: { cents: number; count: number };
  overdue: { cents: number; count: number; list: InvoiceSummaryDTO[] };
  byMonth: { month: string; cents: number; count: number }[];
  recent: InvoiceSummaryDTO[];
}

/**
 * El resumen del panel. Lo facturado cuenta emitidas y pagadas por fecha de
 * emisión (una anulada no cuenta); lo cobrado, las pagadas por fecha de pago.
 */
export async function userMetrics(userId: ObjectId, today = todayAR()): Promise<Metrics> {
  const { invoices, clients } = await collections();
  const [docs, clientCount, drafts] = await Promise.all([
    invoices.find({ userId, status: { $in: ["issued", "paid", "cancelled"] } }).sort({ issueDate: -1, number: -1 }).toArray(),
    clients.countDocuments({ userId }),
    invoices.countDocuments({ userId, status: "draft" }),
  ]);

  const month = today.slice(0, 7);
  const months = lastMonths(today, 6);
  const byMonth = new Map(months.map((m) => [m, { month: m, cents: 0, count: 0 }]));
  const billed = { cents: 0, count: 0 };
  const collected = { cents: 0, count: 0 };
  const pending = { cents: 0, count: 0 };
  const overdue = { cents: 0, count: 0, list: [] as InvoiceSummaryDTO[] };

  for (const doc of docs) {
    if (doc.status === "cancelled" || !doc.issueDate) continue;
    const total = doc.totals.totalCents;
    const bucket = byMonth.get(doc.issueDate.slice(0, 7));
    if (bucket) {
      bucket.cents += total;
      bucket.count += 1;
    }
    if (doc.issueDate.startsWith(month)) {
      billed.cents += total;
      billed.count += 1;
    }
    if (doc.status === "paid" && doc.paidAt && todayAR(doc.paidAt).startsWith(month)) {
      collected.cents += total;
      collected.count += 1;
    }
    if (doc.status === "issued") {
      pending.cents += total;
      pending.count += 1;
      if (doc.dueDate < today) {
        overdue.cents += total;
        overdue.count += 1;
        overdue.list.push(invoiceToSummary(doc, today));
      }
    }
  }
  overdue.list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  overdue.list = overdue.list.slice(0, 5);

  return {
    month,
    clients: clientCount,
    drafts,
    billedThisMonth: billed,
    collectedThisMonth: collected,
    pending,
    overdue,
    byMonth: [...byMonth.values()],
    recent: docs.slice(0, 5).map((doc) => invoiceToSummary(doc, today)),
  };
}
