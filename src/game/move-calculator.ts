import { applyMove, type GameState, type Move } from "../core/rules";

type MoveWorker = Pick<
  Worker,
  "onmessage" | "onerror" | "onmessageerror" | "postMessage" | "terminate"
>;

/** Keep a healthy worker warm, but never reuse a failed or timed-out search. */
export class MoveCalculator {
  private worker: MoveWorker | null = null;
  private pending = false;

  constructor(private createWorker: () => MoveWorker) {}

  async calculate(state: GameState, move: Move, revision: number) {
    if (this.pending) throw new Error("Move search already pending");
    if (
      !["flow-v1", "flow-v2", "flow-v3", "flow-v4", "director-v1", "director-v2"].includes(
        state.dealerVersion,
      ) ||
      state.tray.filter((s) => s.used).length !== 2
    )
      return applyMove(state, move, revision);

    const worker = (this.worker ??= this.createWorker());
    this.pending = true;
    return new Promise<ReturnType<typeof applyMove>>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error, result?: ReturnType<typeof applyMove>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        worker.onmessage = worker.onerror = worker.onmessageerror = null;
        this.pending = false;
        if (error) {
          worker.terminate();
          this.worker = null;
          reject(error);
        } else resolve(result!);
      };
      const timeout = setTimeout(
        () => finish(new Error("Move search timed out")),
        5000,
      );
      worker.onmessage = (event) =>
        event.data.error
          ? finish(new Error("Move search failed"))
          : finish(undefined, event.data.result);
      worker.onerror = () => finish(new Error("Move worker failed"));
      worker.onmessageerror = () =>
        finish(new Error("Move response could not be read"));
      try {
        worker.postMessage({ state, move, revision });
      } catch {
        finish(new Error("Move request could not be sent"));
      }
    });
  }
}
