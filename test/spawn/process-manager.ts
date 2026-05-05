import { spawn, ChildProcess } from 'node:child_process';
import { join } from 'node:path';

/**
 * Owns the inite-brain-service node child process lifecycle.
 * One responsibility: spawn it, capture stderr, kill it cleanly.
 */
export class ProcessManager {
  private proc: ChildProcess | null = null;
  private stderr = '';

  start(env: NodeJS.ProcessEnv): ChildProcess {
    const repoRoot = join(__dirname, '..', '..');
    this.proc = spawn('node', [join(repoRoot, 'dist', 'main.js')], {
      cwd: repoRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.proc.stderr?.on('data', (d) => {
      this.stderr += d.toString();
    });
    this.proc.stdout?.on('data', () => {
      /* swallow */
    });
    return this.proc;
  }

  capturedStderr(): string {
    return this.stderr;
  }

  async stop(): Promise<void> {
    const proc = this.proc;
    if (!proc) return;
    proc.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve();
      }, 5_000);
      proc.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.proc = null;
  }
}
