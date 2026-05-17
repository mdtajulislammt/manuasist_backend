import type {
  FileStorageGetStreamResult,
  FileStorageObjectRef,
  FileStoragePutInput,
  FileStorageReplaceInput,
} from './file-storage.types';

export interface FileStoragePort {
  put(input: FileStoragePutInput): Promise<FileStorageObjectRef>;
  replace(input: FileStorageReplaceInput): Promise<FileStorageObjectRef>;
  delete(ref: Pick<FileStorageObjectRef, 'namespace' | 'objectKey'>): Promise<void>;
  getStream(
    ref: Pick<FileStorageObjectRef, 'namespace' | 'storedName' | 'objectKey'>,
  ): Promise<FileStorageGetStreamResult>;
  head(
    ref: Pick<FileStorageObjectRef, 'namespace' | 'objectKey'>,
  ): Promise<{ sizeBytes: number; contentType?: string } | null>;
}
