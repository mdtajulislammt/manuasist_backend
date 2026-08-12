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
      GMAIL_APP_USER: 'sender@example.com',
      GMAIL_APP_PASSWORD: 'app-password',
      OTP_EMAIL_FROM: 'Menu Assist <sender@example.com>',
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
      service: 'gmail',
      auth: {
        user: 'sender@example.com',
        pass: 'app-password',
      },
    });
    const expectedTemplate = buildOtpEmailTemplate({
      appName: 'Menu Assist',
      otp: '123456',
      purpose: 'PASSWORD_RESET',
      expiresInSeconds: 600,
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'Menu Assist <sender@example.com>',
      to: 'user@example.com',
      ...expectedTemplate,
    });
  });
});
