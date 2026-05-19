import cron from 'node-cron';

export function startScheduler(
  worker: { run: () => Promise<unknown> },
  intervalSeconds: number,
  logger: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
): { stop: () => void } {
  const tick = () => {
    void worker.run().catch((err) => {
      logger.error({ err }, 'scheduler: worker.run() failed unexpectedly');
    });
  };

  if (intervalSeconds < 60) {
    const timer = setInterval(tick, intervalSeconds * 1000);
    return {
      stop: () => clearInterval(timer),
    };
  }

  const intervalMinutes = Math.max(1, Math.round(intervalSeconds / 60));
  const cronExpression = `*/${intervalMinutes} * * * *`;
  const task = cron.schedule(cronExpression, tick);

  return {
    stop: () => {
      task.stop();
    },
  };
}
