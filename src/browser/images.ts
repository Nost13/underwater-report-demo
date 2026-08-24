export interface ThumbnailLease {
  url: string;
  release(): void;
}

interface ObjectUrlApi {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

type ThumbnailProducer = (file: File) => Promise<Blob>;

export class ThumbnailPool {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(
    private readonly producer: ThumbnailProducer = createThumbnailBlob,
    private readonly urlApi: ObjectUrlApi = URL,
    private readonly concurrency = 3,
  ) {}

  async acquire(file: File): Promise<ThumbnailLease> {
    const blob = await this.schedule(() => this.producer(file));
    const url = this.urlApi.createObjectURL(blob);
    let released = false;
    return {
      url,
      release: () => {
        if (released) return;
        released = true;
        this.urlApi.revokeObjectURL(url);
      },
    };
  }

  private async schedule<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= Math.max(1, this.concurrency)) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.queue.shift()?.();
    }
  }
}

async function canvasBlob(file: File, maxEdge: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
    context.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('IMAGE_RESIZE_FAILED'))),
        'image/jpeg',
        quality,
      ),
    );
  } finally {
    bitmap.close();
  }
}

export const createThumbnailBlob = (file: File) => canvasBlob(file, 420, 0.76);

export async function resizeForReport(file: File, maxEdge = 1800): Promise<Uint8Array> {
  const blob = await canvasBlob(file, maxEdge, 0.82);
  return new Uint8Array(await blob.arrayBuffer());
}
