import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { FirebaseService } from '../firebase/firebase.service';
import { BookingEntity } from '../common/types';

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private isLive = false;
  private fromAddress = '"Consulting Advisory" <no-reply@consultingservices.com>';

  constructor(
    private readonly configService: ConfigService,
    private readonly firebaseService: FirebaseService,
  ) {
    this.initTransporter();
  }

  async onModuleInit() {
    if (this.isLive && this.transporter) {
      try {
        await this.transporter.verify();
        this.logger.log('SMTP connection verified successfully. Ready to send emails.');
      } catch (err: any) {
        this.logger.warn(`SMTP verification failed: ${err.message}. Emails may fail if credentials are invalid.`);
      }
    }
  }

  private initTransporter() {
    const host = this.configService.get<string>('SMTP_HOST');
    const portRaw = this.configService.get<string>('SMTP_PORT');
    const secureRaw = this.configService.get<string>('SMTP_SECURE');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const from =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('EMAIL_FROM') ||
      '"Consulting Advisory" <no-reply@consultingservices.com>';

    this.fromAddress = from;

    const port = portRaw ? parseInt(portRaw, 10) : 587;
    const isSecure = secureRaw !== undefined ? secureRaw === 'true' : port === 465;

    const isPlaceholder =
      !host ||
      host.includes('example.com') ||
      host.includes('placeholder') ||
      !user ||
      user.includes('username') ||
      user.includes('placeholder');

    if (!isPlaceholder && host) {
      try {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: isSecure,
          auth: user && pass ? { user, pass } : undefined,
          tls: {
            rejectUnauthorized: false,
          },
          connectionTimeout: 10000,
        });
        this.isLive = true;
        this.logger.log(`SMTP transport configured for ${host}:${port} (secure: ${isSecure})`);
      } catch (error: any) {
        this.logger.warn(`Failed to initialize SMTP transport: ${error.message}. Running in mock email mode.`);
        this.isLive = false;
      }
    } else {
      this.logger.log('SMTP credentials not configured or placeholder detected. Running in mock email mode.');
      this.isLive = false;
    }
  }

  private async logEmail(
    to: string,
    subject: string,
    type: 'confirmation' | 'cancellation' | 'payment_failed',
    status: 'sent' | 'mocked' | 'failed',
    bookingId?: string,
  ) {
    const logId = `email_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await this.firebaseService.setDoc('email_logs', logId, {
      id: logId,
      to,
      subject,
      type,
      status,
      bookingId,
      timestamp: new Date().toISOString(),
    });
  }

  async sendBookingConfirmation(booking: BookingEntity): Promise<boolean> {
    const { customer, schedule, serviceName, bookingNumber, meetingUrl } = booking;
    const subject = `Your consultation is confirmed: ${serviceName} (${bookingNumber})`;

    const textContent = `
Hello ${customer.name},

Your consultation has been successfully booked and payment is confirmed!

Booking Summary:
- Service: ${serviceName}
- Booking ID: ${bookingNumber}
- Date: ${schedule.date}
- Time: ${schedule.startTime} - ${schedule.endTime} (${schedule.timezone})
${meetingUrl ? `- Google Meet Video Room: ${meetingUrl}` : ''}
${customer.agenda ? `- Meeting Agenda: ${customer.agenda}` : ''}

A Google Calendar invite has been created and synced.
Cancellations are permitted up to 24 hours prior to the session.

Thank you,
Consulting Advisory Team
    `.trim();

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0;">
          <h1 style="font-size: 20px; font-weight: 800; color: #1e293b; margin: 0;">Consultation Confirmed</h1>
          <p style="font-size: 13px; color: #64748b; margin-top: 4px;">Thank you for scheduling with our advisory team.</p>
        </div>

        <p style="font-size: 14px; color: #334155;">Hi <strong>${customer.name}</strong>,</p>
        <p style="font-size: 14px; color: #334155; line-height: 1.5;">
          Your consultation appointment has been scheduled and your payment has been processed successfully.
        </p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 24px 0;">
          <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-top: 0; margin-bottom: 12px;">Session Details</h3>
          <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #64748b; width: 35%;">Service:</td>
              <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">${serviceName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Booking Reference:</td>
              <td style="padding: 6px 0; font-weight: 700; color: #2563eb;">${bookingNumber}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Date:</td>
              <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">${schedule.date}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Time:</td>
              <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">${schedule.startTime} - ${schedule.endTime} (${schedule.timezone})</td>
            </tr>
            ${
              meetingUrl
                ? `
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Video Meeting:</td>
              <td style="padding: 6px 0;">
                <a href="${meetingUrl}" target="_blank" style="color: #2563eb; font-weight: 600; text-decoration: underline;">
                  Join Google Meet
                </a>
              </td>
            </tr>
            `
                : ''
            }
            ${
              customer.agenda
                ? `
            <tr>
              <td style="padding: 6px 0; color: #64748b; vertical-align: top;">Agenda:</td>
              <td style="padding: 6px 0; color: #334155;"><em>${customer.agenda}</em></td>
            </tr>
            `
                : ''
            }
          </table>
        </div>

        <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 4px; margin-bottom: 24px;">
          <p style="font-size: 12px; color: #1e40af; margin: 0; line-height: 1.5;">
            <strong>Calendar Notice:</strong> A Google Calendar invitation has been attached to your email. Cancellations are accepted free of charge up to 24 hours before appointment start.
          </p>
        </div>

        <p style="font-size: 13px; color: #64748b; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
          Best regards,<br/>
          <strong style="color: #0f172a;">Consulting Advisory Team</strong>
        </p>
      </div>
    `;

    if (this.isLive && this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.fromAddress,
          to: customer.email,
          subject,
          text: textContent,
          html: htmlContent,
        });
        await this.logEmail(customer.email, subject, 'confirmation', 'sent', booking.id);
        this.logger.log(`SMTP confirmation email sent to ${customer.email} (${bookingNumber})`);
        return true;
      } catch (error: any) {
        this.logger.error(`Failed to send confirmation email via SMTP: ${error.message}`, error.stack);
        await this.logEmail(customer.email, subject, 'confirmation', 'failed', booking.id);
        return false;
      }
    }

    // Mock Mode
    this.logger.log(`[Dev Mock SMTP] Confirmation email generated for ${customer.email} (Booking ${bookingNumber})`);
    await this.logEmail(customer.email, subject, 'confirmation', 'mocked', booking.id);
    return true;
  }

  async sendCancellationEmail(booking: BookingEntity, reason?: string): Promise<boolean> {
    const { customer, schedule, serviceName, bookingNumber } = booking;
    const subject = `Consultation Cancelled: ${serviceName} (${bookingNumber})`;

    const textContent = `
Hello ${customer.name},

Your consultation appointment scheduled for ${schedule.date} at ${schedule.startTime} (${schedule.timezone}) has been cancelled.

Booking ID: ${bookingNumber}
Service: ${serviceName}
Cancellation Reason: ${reason || 'Cancelled upon request'}

If you believe this was in error, you can reschedule at your convenience through our booking portal.

Best regards,
Consulting Advisory Team
    `.trim();

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #fee2e2; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #fee2e2;">
          <h1 style="font-size: 20px; font-weight: 800; color: #b91c1c; margin: 0;">Consultation Cancelled</h1>
          <p style="font-size: 13px; color: #7f1d1d; margin-top: 4px;">Booking Reference: ${bookingNumber}</p>
        </div>

        <p style="font-size: 14px; color: #334155;">Hi <strong>${customer.name}</strong>,</p>
        <p style="font-size: 14px; color: #334155; line-height: 1.5;">
          Your consultation scheduled for <strong>${schedule.date} at ${schedule.startTime} (${schedule.timezone})</strong> has been cancelled.
        </p>

        <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="font-size: 13px; margin: 0 0 8px 0; color: #991b1b;">
            <strong>Reason:</strong> ${reason || 'Cancelled upon request'}
          </p>
          <p style="font-size: 13px; margin: 0; color: #991b1b;">
            <strong>Service:</strong> ${serviceName}
          </p>
        </div>

        <p style="font-size: 13px; color: #64748b; margin-top: 24px;">
          If you have any questions or would like to rebook for another time, please visit our booking portal.
        </p>

        <p style="font-size: 13px; color: #64748b; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
          Best regards,<br/>
          <strong style="color: #0f172a;">Consulting Advisory Team</strong>
        </p>
      </div>
    `;

    if (this.isLive && this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.fromAddress,
          to: customer.email,
          subject,
          text: textContent,
          html: htmlContent,
        });
        await this.logEmail(customer.email, subject, 'cancellation', 'sent', booking.id);
        this.logger.log(`SMTP cancellation email sent to ${customer.email} (${bookingNumber})`);
        return true;
      } catch (error: any) {
        this.logger.error(`Failed to send cancellation email via SMTP: ${error.message}`);
        await this.logEmail(customer.email, subject, 'cancellation', 'failed', booking.id);
        return false;
      }
    }

    // Mock Mode
    this.logger.log(`[Dev Mock SMTP] Cancellation email logged for ${customer.email} (${bookingNumber})`);
    await this.logEmail(customer.email, subject, 'cancellation', 'mocked', booking.id);
    return true;
  }
}
