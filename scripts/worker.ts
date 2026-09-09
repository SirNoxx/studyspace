import { adminClient } from "../src/lib/supabase/server";
import { executeJob } from "../src/lib/server/jobs";
import { sweepStorage } from "../src/lib/server/maintenance";
const db = adminClient(),
  workerId = process.env.WORKER_ID ?? "worker-" + process.pid;
let stopping = false;
let lastSweep = Date.now();
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
console.log(JSON.stringify({ event: "worker_started", workerId }));
while (!stopping) {
  const { data, error } = await db.rpc("claim_job", { p_worker: workerId });
  if (error) {
    console.error(
      JSON.stringify({ event: "queue_unavailable", code: error.code }),
    );
    await new Promise((r) => setTimeout(r, 5000));
    continue;
  }
  const job = data?.[0];
  if (!job) {
    if (
      Date.now() - lastSweep > 86400000 &&
      process.env.STORAGE_CLEANUP_ENABLED !== "false"
    ) {
      lastSweep = Date.now();
      try {
        const result = await sweepStorage();
        console.log(
          JSON.stringify({ event: "storage_sweep_completed", ...result }),
        );
      } catch {
        console.error(JSON.stringify({ event: "storage_sweep_failed" }));
      }
    }
    await new Promise((r) =>
      setTimeout(r, Number(process.env.WORKER_POLL_MS ?? 3000)),
    );
    continue;
  }
  const heartbeat = setInterval(() => {
    void db
      .from("jobs")
      .update({
        lease_until: new Date(Date.now() + 90000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("worker_id", workerId)
      .then();
  }, 20000);
  try {
    const result = await executeJob(job);
    await db
      .from("jobs")
      .update({
        status:
          "cancelled" in result && result.cancelled ? "cancelled" : "succeeded",
        progress: 100,
        result,
        lease_until: null,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("worker_id", workerId);
    console.log(
      JSON.stringify({ event: "job_completed", jobId: job.id, kind: job.kind }),
    );
  } catch (error) {
    const { data: latest } = await db
      .from("jobs")
      .select("cancel_requested")
      .eq("id", job.id)
      .single();
    const cancelled = latest?.cancel_requested;
    const permanent = job.attempts >= job.max_attempts;
    await db
      .from("jobs")
      .update({
        status: cancelled ? "cancelled" : permanent ? "failed" : "queued",
        error:
          "The job could not complete. Check its source and configuration, then retry.",
        lease_until: null,
        available_at: new Date(
          Date.now() +
            Math.min(60000, 1000 * 2 ** job.attempts) +
            Math.random() * 500,
        ).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("worker_id", workerId);
    console.error(
      JSON.stringify({
        event: "job_attempt_failed",
        jobId: job.id,
        kind: job.kind,
        attempt: job.attempts,
        code: (error as { code?: string }).code ?? "OPERATION_FAILED",
      }),
    );
  } finally {
    clearInterval(heartbeat);
  }
}
console.log(JSON.stringify({ event: "worker_stopped", workerId }));
