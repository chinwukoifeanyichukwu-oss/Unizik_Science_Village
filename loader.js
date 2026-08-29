// ---------------------------------------------------------------------
// PORTAL LOADING SYSTEM
//
// The portal's gate is procedural (built from Three.js primitives, not
// a GLB), so there is no network asset to wait on in the classic
// THREE.LoadingManager sense. What still needs to happen before the
// user can enter:
//   1. Renderer, camera, and lighting created
//   2. Gate geometry built
//   3. Particle field generated
//   4. A minimum on-screen duration so the loading UI never just flashes
//
// This module treats each of those as a "task" — a named async function.
// Progress is simply (tasks completed / total tasks). If any task
// throws, loading fails and the caller is responsible for showing the
// error panel and keeping the enter button disabled.
// ---------------------------------------------------------------------

export class PortalLoader {
  /**
   * @param {Array<{ label: string, run: () => Promise<void> | void }>} tasks
   * @param {(progress: { percent: number, label: string }) => void} onProgress
   */
  constructor(tasks, onProgress) {
    this.tasks = tasks;
    this.onProgress = onProgress;
  }

  async run() {
    const total = this.tasks.length;

    for (let i = 0; i < total; i++) {
      const task = this.tasks[i];

      // Report which stage is starting before running it, so the UI
      // label updates before any blocking work happens on this task.
      this.onProgress({
        percent: Math.round((i / total) * 100),
        label: task.label,
      });

      // eslint-disable-next-line no-await-in-loop
      await task.run();
    }

    this.onProgress({ percent: 100, label: 'System ready' });
  }
}

/**
 * Wraps a task so it never resolves faster than `minMs`. Used for the
 * final task so the loading sequence reads as deliberate rather than
 * an instant flash, without ever blocking longer than necessary.
 */
export function withMinimumDuration(run, minMs) {
  return async () => {
    const start = performance.now();
    await run();
    const elapsed = performance.now() - start;
    const remaining = minMs - elapsed;
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  };
}
