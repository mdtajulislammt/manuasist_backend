import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export type FcmPushInput = {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
};

export type FcmPushResult = {
  success: boolean;
  providerMessageId?: string;
  error?: string;
  permanentFailure: boolean;
  invalidToken: boolean;
};

@Injectable()
export class FcmPushService {
  private readonly logger = new Logger(FcmPushService.name);
  private readonly app: App | null;

  constructor(private readonly config: ConfigService) {
    this.app = this.createFirebaseApp();
  }

  async send(input: FcmPushInput): Promise<FcmPushResult> {
    if (!this.app) {
      return {
        success: false,
        error: 'Firebase Admin is not configured',
        permanentFailure: true,
        invalidToken: false,
      };
    }

    try {
      const providerMessageId = await getMessaging(this.app).send({
        token: input.token,
        notification: {
          title: input.title,
          body: input.body,
        },
        data: input.data,
      });
      return {
        success: true,
        providerMessageId,
        permanentFailure: false,
        invalidToken: false,
      };
    } catch (error) {
      const code = this.firebaseErrorCode(error);
      const invalidToken = this.isInvalidTokenCode(code);
      return {
        success: false,
        error:
          error instanceof Error
            ? `${code ?? 'firebase_error'}: ${error.message}`
            : String(error),
        permanentFailure: invalidToken || code === 'messaging/invalid-argument',
        invalidToken,
      };
    }
  }

  private createFirebaseApp(): App | null {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.config
      .get<string>('FIREBASE_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn('Firebase Admin credentials are not configured');
      return null;
    }

    const existing = getApps().find((app) => app.name === 'menu-assist');
    if (existing) {
      return existing;
    }

    return initializeApp(
      {
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      },
      'menu-assist',
    );
  }

  private firebaseErrorCode(error: unknown): string | null {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code: unknown }).code === 'string'
    ) {
      return (error as { code: string }).code;
    }
    return null;
  }

  private isInvalidTokenCode(code: string | null): boolean {
    return (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    );
  }
}
