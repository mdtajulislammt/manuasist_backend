import {
  DynamicModule,
  Global,
  InjectionToken,
  Module,
  OptionalFactoryDependency,
  Provider,
  Type,
} from '@nestjs/common';
import { LocalStorageAdapter } from './local-storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';
import type { FileStorageModuleOptions } from './file-storage.types';
import { FILE_STORAGE_OPTIONS, LOCAL_FILE_STORAGE, S3_FILE_STORAGE } from './tokens';

export type FileStorageModuleAsyncOptions = {
  imports?: Type<unknown>[];
  useFactory: (...args: unknown[]) => FileStorageModuleOptions | Promise<FileStorageModuleOptions>;
  inject?: (InjectionToken | OptionalFactoryDependency)[];
};

@Global()
@Module({})
export class FileStorageModule {
  static forRoot(options: FileStorageModuleOptions): DynamicModule {
    return this.build([{ provide: FILE_STORAGE_OPTIONS, useValue: options }]);
  }

  static forRootAsync(asyncOpts: FileStorageModuleAsyncOptions): DynamicModule {
    const factoryProvider: Provider = {
      provide: FILE_STORAGE_OPTIONS,
      useFactory: asyncOpts.useFactory,
      inject: asyncOpts.inject ?? [],
    };
    return this.build([factoryProvider], asyncOpts.imports ?? []);
  }

  private static build(optionProviders: Provider[], imports: Type<unknown>[] = []): DynamicModule {
    return {
      module: FileStorageModule,
      imports,
      providers: [
        ...optionProviders,
        {
          provide: LOCAL_FILE_STORAGE,
          useFactory: (opts: FileStorageModuleOptions) =>
            new LocalStorageAdapter(opts.localRoot),
          inject: [FILE_STORAGE_OPTIONS],
        },
        {
          provide: S3_FILE_STORAGE,
          useFactory: (opts: FileStorageModuleOptions) => {
            if (!opts.s3?.bucket || !opts.s3?.region) {
              return null;
            }
            return new S3StorageAdapter(opts.s3);
          },
          inject: [FILE_STORAGE_OPTIONS],
        },
      ],
      exports: [FILE_STORAGE_OPTIONS, LOCAL_FILE_STORAGE, S3_FILE_STORAGE],
    };
  }
}
