import cron from "node-cron";
import type { DbClient } from "@symposium/db";
import type { McpClientManager } from "./mcp/client-manager.js";

type JobFn = () => Promise<void>;

// ── 잡별 실패 격리 래퍼 ─────────────────────────────────────
// 한 잡이 throw해도 다른 잡/스케줄러에 영향 없음
function isolated(name: string, fn: JobFn): JobFn {
  return async () => {
    try {
      await fn();
    } catch (err) {
      console.error(`[scheduler] job "${name}" failed:`, err);
    }
  };
}

// ── 중복 실행 방지 래퍼 ─────────────────────────────────────
// 이전 실행이 끝나지 않았으면 이번 실행을 건너뜀
function noOverlap(name: string, fn: JobFn): JobFn {
  let running = false;
  return async () => {
    if (running) {
      console.error(`[scheduler] job "${name}" skipped (still running)`);
      return;
    }
    running = true;
    try {
      await fn();
    } finally {
      running = false;
    }
  };
}

export interface SchedulerDeps {
  db: DbClient;
  mcp: McpClientManager;
  runAnalysisCycle: JobFn;
  runDiscoveryCycle: JobFn;
  runCrisisCheck: JobFn;
}

export function startScheduler(deps: SchedulerDeps): cron.ScheduledTask[] {
  const tasks: cron.ScheduledTask[] = [];

  // 정규 분석: 매 거래일 08:50
  tasks.push(
    cron.schedule(
      "50 8 * * 1-5",
      noOverlap("analysis", isolated("analysis", deps.runAnalysisCycle)),
      { timezone: "Asia/Seoul" }
    )
  );

  // LLM 발굴: 매 거래일 07:30
  tasks.push(
    cron.schedule(
      "30 7 * * 1-5",
      noOverlap("discovery", isolated("discovery", deps.runDiscoveryCycle)),
      { timezone: "Asia/Seoul" }
    )
  );

  // 위기 감지: 30분마다
  tasks.push(
    cron.schedule(
      "*/30 * * * *",
      noOverlap("crisis", isolated("crisis", deps.runCrisisCheck)),
      { timezone: "Asia/Seoul" }
    )
  );

  console.error("[scheduler] started — analysis(08:50), discovery(07:30), crisis(*/30min)");
  return tasks;
}

export function stopScheduler(tasks: cron.ScheduledTask[]): void {
  for (const task of tasks) task.stop();
  console.error("[scheduler] stopped");
}
