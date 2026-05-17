import type { Readable } from 'node:stream';
import { StorageProvider } from './storage-provider.enum';

export type FileStoragePutInput = {
  namespace: string;
  storedName: string;
  buffer: Buffer;
  contentType: string;
};

export type FileStorageReplaceInput = FileStoragePutInput;

export type FileStorageObjectRef = {
  namespace: string;
  storedName: string;
  objectKey: string;
  provider: StorageProvider;
};

export type FileStorageGetStreamResult = {
  stream: Readable;
  contentType: string;
  sizeBytes?: number;
};

export type FileStorageModuleOptions = {
  localRoot: string;
  s3?: {
    region: string;
    bucket: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    publicBaseUrl?: string;
  };
};
