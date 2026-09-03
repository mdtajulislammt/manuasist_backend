import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { AuthOtpEmailPurpose } from './auth-otp.constants';
import { buildOtpEmailTemplate } from './otp-email.template';

function parseSmtpSecure(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

@Injectable()
export class OtpEmailService {
  private readonly logger = new Logger(OtpEmailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(input: {
    to: string;
    otp: string;
    purpose: AuthOtpEmailPurpose;
    expiresInSeconds: number;
  }): Promise<void> {
    const { to, otp, purpose, expiresInSeconds } = input;
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const password = this.config.get<string>('SMTP_PASSWORD');

    if (!host || !user || !password) {
      this.logger.warn(
        `SMTP credentials missing; falling back to log for ${purpose} OTP`,
      );
      this.logger.log(`${purpose} OTP for ${to}: ${otp}`);
      return;
    }

    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    const secure = parseSmtpSecure(this.config.get<string>('SMTP_SECURE'));
    const transporter = nodemailer.createTransport({
      host,
      port: Number.isFinite(port) ? port : 587,
      secure,
      requireTLS: !secure,
      auth: {
        user,
        pass: password,
      },
    });
    const appName = this.config.get<string>('APP_NAME') ?? 'Menu Assist';
    const from =
      this.config.get<string>('SMTP_FROM')?.trim() ||
      this.config.get<string>('OTP_EMAIL_FROM')?.trim() ||
      user;
    const { subject, text, html } = buildOtpEmailTemplate({
      appName,
      otp,
      purpose,
      expiresInSeconds,
    });

    try {
      await transporter.sendMail({
        from,
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
}
