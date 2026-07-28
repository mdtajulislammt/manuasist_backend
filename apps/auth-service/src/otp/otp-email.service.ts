import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { AuthOtpEmailPurpose } from './auth-otp.constants';

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
    const gmailUser = this.config.get<string>('GMAIL_APP_USER');
    const gmailAppPassword = this.config.get<string>('GMAIL_APP_PASSWORD');

    // Keep local dev unblocked if SMTP is not configured yet.
    if (!gmailUser || !gmailAppPassword) {
      this.logger.warn(
        `Gmail SMTP credentials missing; falling back to log for ${purpose} OTP`,
      );
      this.logger.log(`${purpose} OTP for ${to}: ${otp}`);
      return;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });
    const appName = this.config.get<string>('APP_NAME') ?? 'Menu Assist';
    const from = this.config.get<string>('OTP_EMAIL_FROM') ?? gmailUser;
    const minutes = Math.max(1, Math.floor(expiresInSeconds / 60));
    const purposeText =
      purpose === 'PASSWORD_RESET'
        ? 'password reset verification'
        : purpose === 'CONTACT_CHANGE'
          ? 'contact change verification'
          : 'account verification';
    const subject = `${appName} ${purposeText} code`;
    const text = `Your ${appName} OTP code is ${otp}. It expires in ${minutes} minute(s).`;

    try {
      await transporter.sendMail({
        from,
        to,
        subject,
        text,
      });
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${to}`, error as Error);
      throw error instanceof Error
        ? error
        : new Error('Failed to send OTP email');
    }
  }
}
