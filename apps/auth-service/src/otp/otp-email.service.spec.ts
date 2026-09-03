import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { OtpEmailService } from './otp-email.service';
import { buildOtpEmailTemplate } from './otp-email.template';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('OtpEmailService', () => {
  const sendMail =
    jest.fn<
      (options: nodemailer.SendMailOptions) => Promise<{ messageId: string }>
    >();
  const createTransport = nodemailer.createTransport as jest.MockedFunction<
    typeof nodemailer.createTransport
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    createTransport.mockReturnValue({ sendMail } as never);
    sendMail.mockResolvedValue({ messageId: 'test-message' });
  });

  it('sends branded HTML and plain-text alternatives', async () => {
    const values: Record<string, string> = {
      SMTP_HOST: 'smtp.office365.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'notify@menuassistapp.com',
      SMTP_PASSWORD: 'mailbox-password',
      SMTP_FROM: 'notify@menuassistapp.com',
      OTP_EMAIL_FROM: 'Menu Assist <notify@menuassistapp.com>',
      APP_NAME: 'Menu Assist',
    };
    const config = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
    const service = new OtpEmailService(config);

    await service.send({
      to: 'user@example.com',
      otp: '123456',
      purpose: 'PASSWORD_RESET',
      expiresInSeconds: 600,
    });

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: 'notify@menuassistapp.com',
        pass: 'mailbox-password',
      },
    });
    const expectedTemplate = buildOtpEmailTemplate({
      appName: 'Menu Assist',
      otp: '123456',
      purpose: 'PASSWORD_RESET',
      expiresInSeconds: 600,
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'notify@menuassistapp.com',
      to: 'user@example.com',
      ...expectedTemplate,
    });
  });

  it('uses OTP_EMAIL_FROM when SMTP_FROM is unset', async () => {
    const values: Record<string, string> = {
      SMTP_HOST: 'smtp.office365.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'notify@menuassistapp.com',
      SMTP_PASSWORD: 'mailbox-password',
      OTP_EMAIL_FROM: 'Menu Assist <notify@menuassistapp.com>',
    };
    const config = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
    const service = new OtpEmailService(config);

    await service.send({
      to: 'user@example.com',
      otp: '123456',
      purpose: 'SIGNUP',
      expiresInSeconds: 600,
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Menu Assist <notify@menuassistapp.com>',
      }),
    );
  });
});
