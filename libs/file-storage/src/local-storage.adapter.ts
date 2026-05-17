import { mkdirSync, existsSync, writeFileSync, unlinkSync, createReadStream, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { StorageProvider } from './storage-provider.enum';
import type { FileStoragePort } from './file-storage.port';
import type {
  FileStorageGetStreamResult,
  FileStorageObjectRef,
  FileStoragePutInput,
  FileStorageReplaceInput,
} from './file-storage.types';

function namespaceDir(root: string, namespace: string): string {
  return join(root, namespace.toLowerCase().replace(/_/g, '-'));
}

export class LocalStorageAdapter implements FileStoragePort {
  constructor(private readonly localRoot: string) {}

  private objectKey(namespace: string, storedName: string): string {
    return `${namespace}/${storedName}`;
  }

  private fullPath(namespace: string, storedName: string): string {
    return join(namespaceDir(this.localRoot, namespace), storedName);
  }

  async put(input: FileStoragePutInput): Promise<FileStorageObjectRef> {
    const full = this.fullPath(input.namespace, input.storedName);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, input.buffer);
    return {
      namespace: input.namespace,
      storedName: input.storedName,
      objectKey: this.objectKey(input.namespace, input.storedName),
      provider: StorageProvider.LOCAL,
    };
  }

  async replace(input: FileStorageReplaceInput): Promise<FileStorageObjectRef> {
    return this.put(input);
  }

  async delete(ref: Pick<FileStorageObjectRef, 'namespace' | 'objectKey'>): Promise<void> {
    const storedName = ref.objectKey.split('/').pop();
    if (!storedName) return;
    const full = this.fullPath(ref.namespace, storedName);
    if (existsSync(full)) {
      unlinkSync(full);
    }
  }

  async getStream(
    ref: Pick<FileStorageObjectRef, 'namespace' | 'storedName' | 'objectKey'>,
  ): Promise<FileStorageGetStreamResult> {
    const full = this.fullPath(ref.namespace, ref.storedName);
    if (!existsSync(full)) {
      throw new Error(`Local file not found: ${full}`);
    }
    const { size } = statSync(full);
    return {
      stream: createReadStream(full),
      contentType: 'application/octet-stream',
      sizeBytes: size,
    };
  }

  async head(
    ref: Pick<FileStorageObjectRef, 'namespace' | 'objectKey'>,
  ): Promise<{ sizeBytes: number; contentType?: string } | null> {
    const storedName = ref.objectKey.split('/').pop();
    if (!storedName) return null;
    const full = this.fullPath(ref.namespace, storedName);
    if (!existsSync(full)) return null;
    const { size } = statSync(full);
    return { sizeBytes: size };
  }
}
