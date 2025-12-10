import type { Db } from '../db/connection.js';
import type { Logger } from '../logger.js';

export interface RecoveryResult {
  readonly pipelines: number;
  readonly jobs: number;
}

export function recoverInterruptedRuns(db: Db, logger: Logger): RecoveryResult {
  const now = Date.now();

  const result = db.transaction((): RecoveryResult => {
    const jobs = db
      .prepare(
        `UPDATE jobs
            SET status = 'canceled',
                finished_at = ?,
                failure_reason = 'runner_failure',
                failure_message = 'interrupted by a server restart'
          WHERE status = 'running'`,
      )
      .run(now).changes;

    const pending = db
      .prepare(
        `UPDATE jobs
            SET status = 'canceled', finished_at = ?
          WHERE status = 'pending'
            AND pipeline_id IN (SELECT id FROM pipelines WHERE status = 'running')`,
      )
      .run(now).changes;

    const pipelines = db
      .prepare(
        `UPDATE pipelines
            SET status = 'canceled', finished_at = ?
          WHERE status = 'running'`,
      )
      .run(now).changes;

    return { pipelines, jobs: jobs + pending };
  })();

  if (result.pipelines > 0) {
    logger.warn(result, 'marked interrupted pipelines as canceled');
  }

  return result;
}
