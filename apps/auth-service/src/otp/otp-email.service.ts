import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { AuthOtpEmailPurpose } from './auth-otp.constants';
import { buildOtpEmailTemplate } from './otp-email.template';

function parseSmtpSecure(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

@Injectable()
export class OtpEmailService implements OnModuleInit {
  private readonly logger = new Logger(OtpEmailService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const settings = this.resolveSmtpSettings();
    if (settings) {
      this.logger.log(
        `OTP email via SMTP ${settings.host}:${settings.port} as ${settings.user}`,
      );
      return;
    }
    const missing = this.missingSmtpKeys();
    if (missing.length === 0) {
      return;
    }
    if (missing.length < 3) {
      this.logger.error(
        `OTP SMTP is incomplete (missing ${missing.join(', ')}). ` +
          'Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in apps/auth-service/.env, then recreate auth-service.',
      );
      return;
    }
    this.logger.warn(
      'SMTP credentials missing; OTP emails will be logged only',
    );
  }

  async send(input: {
    to: string;
    otp: string;
    purpose: AuthOtpEmailPurpose;
    expiresInSeconds: number;
  }): Promise<void> {
    const { to, otp, purpose, expiresInSeconds } = input;
    const settings = this.resolveSmtpSettings();

    if (!settings) {
      const missing = this.missingSmtpKeys();
      if (missing.length > 0 && missing.length < 3) {
        throw new Error(
          `SMTP is not fully configured (missing ${missing.join(', ')}); OTP email was not sent`,
        );
      }
      this.logger.warn(
        `SMTP credentials missing; falling back to log for ${purpose} OTP`,
      );
      this.logger.log(`${purpose} OTP for ${to}: ${otp}`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      requireTLS: !settings.secure,
      auth: {
        user: settings.user,
        pass: settings.password,
      },
      tls: {
        minVersion: 'TLSv1.2',
        servername: settings.host,
      },
    });
    const appName = this.config.get<string>('APP_NAME') ?? 'Menu Assist';
    const { subject, text, html } = buildOtpEmailTemplate({
      appName,
      otp,
      purpose,
      expiresInSeconds,
    });

    try {
      await transporter.sendMail({
        from: settings.from,
        to,
        subject,
        text,
        html,
      });
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${to}`, error as Error);
      throw error instanceof Error
        ? error
        : new Error('Failed to send OTP email');
    }
  }

  private resolveSmtpSettings(): SmtpSettings | null {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const password = this.config.get<string>('SMTP_PASSWORD')?.trim();
    if (!host || !user || !password) {
      return null;
    }
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    return {
      host,
      port: Number.isFinite(port) ? port : 587,
      secure: parseSmtpSecure(this.config.get<string>('SMTP_SECURE')),
      user,
      password,
      from:
        this.config.get<string>('SMTP_FROM')?.trim() ||
        this.config.get<string>('OTP_EMAIL_FROM')?.trim() ||
        user,
    };
  }

  private missingSmtpKeys(): string[] {
    const missing: string[] = [];
    if (!this.config.get<string>('SMTP_HOST')?.trim()) {
      missing.push('SMTP_HOST');
    }
    if (!this.config.get<string>('SMTP_USER')?.trim()) {
      missing.push('SMTP_USER');
    }
    if (!this.config.get<string>('SMTP_PASSWORD')?.trim()) {
      missing.push('SMTP_PASSWORD');
    }
    return missing;
  }
}
