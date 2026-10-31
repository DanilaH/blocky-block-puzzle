export interface DurableReceipt {
  /** Stable external delivery identity, retained across retries and restarts. */
  id: string;
}

export type ReceiptCommitResult = "applied" | "already-applied";

export interface DurableReceiptAdapter<Receipt extends DurableReceipt> {
  /** Atomically persist the effect AND its deduplication marker before resolving. */
  commit(receipt: Receipt): Promise<ReceiptCommitResult>;
  /** Remove this exact receipt from the durable external pending store. */
  acknowledge(id: string): Promise<void>;
}

/** Serial handoff of externally persisted receipts; never acknowledges a failed commit. */
export class DurableReceiptQueue<Receipt extends DurableReceipt> {
  private tail: Promise<void> = Promise.resolve();

  public constructor(
    private readonly adapter: DurableReceiptAdapter<Receipt>,
  ) {}

  public async deliver(receipt: Receipt): Promise<ReceiptCommitResult> {
    // Capture before queuing: callers may reuse/mutate bridge payloads afterwards.
    const snapshot = structuredClone(receipt);
    if (typeof snapshot.id !== "string" || snapshot.id.trim().length === 0) {
      throw new Error("A durable receipt requires a non-empty id");
    }
    const id = snapshot.id;
    const delivery = this.tail.then(async () => {
      const result = await this.adapter.commit(snapshot);
      if (result !== "applied" && result !== "already-applied") {
        throw new Error("Receipt commit did not confirm durable application");
      }
      await this.adapter.acknowledge(id);
      return result;
    });
    // Failure belongs to the caller, but must not poison later recovery deliveries.
    this.tail = delivery.then(
      () => undefined,
      () => undefined,
    );
    return delivery;
  }
}
