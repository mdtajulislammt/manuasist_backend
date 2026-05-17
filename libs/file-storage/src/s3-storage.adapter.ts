import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { StorageProvider } from './storage-provider.enum';
import type { FileStoragePort } from './file-storage.port';
import type {
  FileStorageGetStreamResult,
  FileStorageModuleOptions,
  FileStorageObjectRef,
  FileStoragePutInput,
  FileStorageReplaceInput,
} from './file-storage.types';

function objectKey(namespace: string, storedName: string): string {
  return `${namespace}/${storedName}`;
}

export class S3StorageAdapter implements FileStoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(s3Config: NonNullable<FileStorageModuleOptions['s3']>) {
    this.bucket = s3Config.bucket;
    this.client = new S3Client({
      region: s3Config.region,
      credentials:
        s3Config.accessKeyId && s3Config.secretAccessKey
          ? {
              accessKeyId: s3Config.accessKeyId,
              secretAccessKey: s3Config.secretAccessKey,
            }
          : undefined,
    });
  }

  async put(input: FileStoragePutInput): Promise<FileStorageObjectRef> {
    const key = objectKey(input.namespace, input.storedName);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.contentType,
      }),
    );
    return {
      namespace: input.namespace,
      storedName: input.storedName,
      objectKey: key,
      provider: StorageProvider.S3,
    };
  }

  async replace(input: FileStorageReplaceInput): Promise<FileStorageObjectRef> {
    return this.put(input);
  }

  async delete(ref: Pick<FileStorageObjectRef, 'namespace' | 'objectKey'>): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: ref.objectKey,
      }),
    );
  }

  async getStream(
    ref: Pick<FileStorageObjectRef, 'namespace' | 'storedName' | 'objectKey'>,
  ): Promise<FileStorageGetStreamResult> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: ref.objectKey,
      }),
    );
    if (!response.Body) {
      throw new Error(`S3 object empty: ${ref.objectKey}`);
    }
    const stream =
      response.Body instanceof Readable
        ? response.Body
        : Readable.from(response.Body as AsyncIterable<Uint8Array>);
    return {
      stream,
      contentType: response.ContentType ?? 'application/octet-stream',
      sizeBytes: response.ContentLength,
    };
  }

  async head(
    ref: Pick<FileStorageObjectRef, 'namespace' | 'objectKey'>,
  ): Promise<{ sizeBytes: number; contentType?: string } | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: ref.objectKey,
        }),
      );
      return {
        sizeBytes: response.ContentLength ?? 0,
        contentType: response.ContentType,
      };
    } catch (err: unknown) {
      const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
      if (name === 'NotFound' || name === 'NoSuchKey') {
        return null;
      }
      throw err;
    }
  }
}
