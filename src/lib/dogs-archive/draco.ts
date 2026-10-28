import { BufferGeometry, LoadingManager } from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

type DecodeWorker = Worker & {
  _callbacks: Record<string, { reject(error: unknown): void }>;
};
type DracoInternals = {
  workerPool: DecodeWorker[];
  _initDecoder(): Promise<void>;
  _getWorker(id: number, cost: number): Promise<DecodeWorker>;
  _createGeometry(data: unknown): BufferGeometry;
  decodeGeometry(buffer: ArrayBuffer, config: unknown): Promise<BufferGeometry>;
};
const base = DRACOLoader.prototype as unknown as DracoInternals;
const aborted = () => new DOMException("Guardian Draco decode cancelled", "AbortError");

/** Scoped adapter for pinned three r186. Native dispose() terminates workers
 * without rejecting their queued callbacks, and decoder FileLoader cancellation
 * requires AbortSignal.any(). Guard both paths for older WebKit/LAN previews. */
export class GuardianDracoLoader extends DRACOLoader {
  private closed = false;
  private initialization: Promise<void> | null = null;
  private geometries = new Set<BufferGeometry>();
  private firstDecodeAt = 0;
  private lastDecodeAt = 0;
  private decoderFetchStarted = 0;
  private decoderFetchEnded = 0;
  private tasks = 0;
  private finishedTasks = 0;
  private maxWorkers = 0;
  private decoderBytes = 0;
  private signal: AbortSignal;
  private libraryAbort = new AbortController();
  private abortListener = () => this.dispose();

  constructor(signal: AbortSignal, manager: LoadingManager) {
    super(manager);
    this.signal = signal;
    this.setDecoderPath("/dogs-archive-20261028/decoders/draco/");
    this.setWorkerLimit(1);
    signal.addEventListener("abort", this.abortListener, { once: true });
    if (signal.aborted) this.dispose();
  }

  async _loadLibrary(url: string, responseType: string) {
    if (this.closed) throw aborted();
    if (!this.decoderFetchStarted) this.decoderFetchStarted = performance.now();
    const response = await fetch(this.manager.resolveURL(url), {
      signal: this.libraryAbort.signal,
      credentials: "same-origin",
      cache: "force-cache",
    });
    if (!response.ok) throw new Error(`Local Draco decoder: ${response.status}`);
    const data = await response.arrayBuffer();
    this.decoderBytes += data.byteLength;
    this.decoderFetchEnded = performance.now();
    if (this.closed) throw aborted();
    return responseType === "arraybuffer" ? data : new TextDecoder().decode(data);
  }

  _initDecoder() {
    if (this.closed) return Promise.reject(aborted());
    if (!this.initialization) {
      this.initialization = base._initDecoder.call(this).then(() => {
        if (this.closed) {
          super.dispose();
          throw aborted();
        }
      });
    }
    return this.initialization;
  }

  override preload() {
    // GLTFLoader preloads without awaiting. Decode tasks still receive the
    // original rejection; this catch prevents an unhandled preload rejection.
    void this._initDecoder().catch(() => {});
    return this;
  }

  async _getWorker(id: number, cost: number) {
    if (this.closed) throw aborted();
    const worker = await base._getWorker.call(this, id, cost);
    if (this.closed) {
      super.dispose();
      throw aborted();
    }
    worker.onerror = (event) => {
      const error = new Error(`Guardian Draco worker: ${event.message || "decoder failed"}`);
      for (const callback of Object.values(worker._callbacks)) callback.reject(error);
    };
    this.maxWorkers = Math.max(this.maxWorkers, this.internals.workerPool.length);
    return worker;
  }

  decodeGeometry(buffer: ArrayBuffer, config: unknown) {
    if (this.closed) return Promise.reject(aborted());
    this.tasks++;
    if (!this.firstDecodeAt) this.firstDecodeAt = performance.now();
    return base.decodeGeometry.call(this, buffer, config).then((geometry) => {
      this.finishedTasks++;
      this.lastDecodeAt = performance.now();
      return geometry;
    });
  }

  _createGeometry(data: unknown) {
    const geometry = base._createGeometry.call(this, data);
    if (this.closed) {
      geometry.dispose();
      throw aborted();
    }
    this.geometries.add(geometry);
    return geometry;
  }

  /** GLTF scene now owns these buffers; stop its decoder without freeing them. */
  commit() {
    this.geometries.clear();
  }

  getDiagnostics() {
    return {
      workerLimit: 1,
      workers: this.internals.workerPool.length,
      maxWorkers: this.maxWorkers,
      tasks: this.tasks,
      finishedTasks: this.finishedTasks,
      closed: this.closed,
      decoderBytes: this.decoderBytes,
      decoderFetchMs: this.decoderFetchStarted
        ? Math.max(0, this.decoderFetchEnded - this.decoderFetchStarted)
        : 0,
      // Includes initialization/queueing; not a pure worker CPU measurement.
      decodeSpanMs:
        this.firstDecodeAt && this.lastDecodeAt ? this.lastDecodeAt - this.firstDecodeAt : 0,
    };
  }

  private get internals() {
    return this as unknown as DracoInternals;
  }

  override dispose() {
    if (this.closed) return this;
    this.closed = true;
    this.libraryAbort.abort();
    this.signal.removeEventListener("abort", this.abortListener);
    for (const worker of this.internals.workerPool) {
      worker.onmessage = null;
      worker.onerror = null;
      for (const callback of Object.values(worker._callbacks)) callback.reject(aborted());
    }
    super.dispose();
    this.geometries.forEach((geometry) => geometry.dispose());
    this.geometries.clear();
    return this;
  }
}
