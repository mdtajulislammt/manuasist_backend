import {
  DynamicModule,
  Global,
  InjectionToken,
  Module,
  OptionalFactoryDependency,
  Provider,
  Type,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CompositeAuthGuard } from './composite-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { API_AUTH_OPTIONS, type ApiAuthModuleOptions } from './tokens';

export type ApiAuthModuleAsyncOptions = {
  imports?: Type<unknown>[];
  useFactory: (...args: unknown[]) => ApiAuthModuleOptions | Promise<ApiAuthModuleOptions>;
  inject?: (InjectionToken | OptionalFactoryDependency)[];
};

@Global()
@Module({})
export class ApiAuthModule {
  static forRoot(options: ApiAuthModuleOptions): DynamicModule {
    return this.build([{ provide: API_AUTH_OPTIONS, useValue: options }]);
  }

  static forRootAsync(asyncOpts: ApiAuthModuleAsyncOptions): DynamicModule {
    const factoryProvider: Provider = {
      provide: API_AUTH_OPTIONS,
      useFactory: asyncOpts.useFactory,
      inject: asyncOpts.inject ?? [],
    };
    return this.build([factoryProvider], asyncOpts.imports ?? []);
  }

  private static build(
    optionProviders: Provider[],
    imports: Type<unknown>[] = [],
  ): DynamicModule {
    return {
      module: ApiAuthModule,
      imports,
      providers: [
        ...optionProviders,
        JwtAuthGuard,
        RolesGuard,
        CompositeAuthGuard,
        { provide: APP_GUARD, useExisting: CompositeAuthGuard },
      ],
      exports: [JwtAuthGuard, RolesGuard, CompositeAuthGuard, API_AUTH_OPTIONS],
    };
  }
}
