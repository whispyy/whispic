import { ulid } from 'ulid';
import { db } from '../db/index.js';
import type { JobRow } from '../db/types.js';

type JobHandler = (assetId: string) => Promise<void>;

const handlers = new Map<string, JobHandler>();
let draining = false;

export function registerHandler(kind: string, handler: JobHandler): void {
  handlers.set(kind, handler);
}

export function enqueueJob(kind: string, assetId: string): void {
  db.prepare('INSERT INTO jobs (id, kind, asset_id, status, attempts, created_at) VALUES (?, ?, ?, ?, 0, ?)').run(
    ulid(),
    kind,
    assetId,
    'pending',
    new Date().toISOString(),
  );
  kick();
}

function kick(): void {
  if (draining) return;
  void drain();
}

async function drain(): Promise<void> {
  draining = true;
  try {
    for (;;) {
      const job = db
        .prepare("SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at LIMIT 1")
        .get() as JobRow | undefined;
      if (!job) break;

      db.prepare("UPDATE jobs SET status = 'running', attempts = attempts + 1 WHERE id = ?").run(job.id);
      const handler = handlers.get(job.kind);
      try {
        if (!handler) throw new Error(`No handler registered for job kind: ${job.kind}`);
        await handler(job.asset_id);
        db.prepare("UPDATE jobs SET status = 'done' WHERE id = ?").run(job.id);
      } catch (err) {
        console.error(`Job ${job.id} (${job.kind}) failed:`, err);
        db.prepare("UPDATE jobs SET status = 'failed' WHERE id = ?").run(job.id);
      }
    }
  } finally {
    draining = false;
  }
}

/** Starts the worker: drains any leftover pending jobs, then polls periodically as a safety net. */
export function startWorker(): void {
  kick();
  setInterval(kick, 30_000);
}
