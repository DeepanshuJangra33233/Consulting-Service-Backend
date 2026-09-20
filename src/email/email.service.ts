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
  private fromAddress = '';

  private frontendUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly firebaseService: FirebaseService,
  ) {
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    this.initTransporter();
  }

  async onModuleInit() {
    if (this.isLive && this.transporter) {
      try {
        await this.transporter.verify();
        this.logger.log('SMTP connection verified successfully. Ready to send emails.');
      } catch (err: any) {
        this.logger.warn(`SMTP verification note: ${err.message}`);
      }
    }
  }

  private initTransporter() {
    const host = this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const port = Number(this.configService.get<string>('SMTP_PORT')) || 465;
    const secure = this.configService.get<string>('SMTP_SECURE') === 'true' || port === 465;
    const user = this.configService.get<string>('MAIL_USER') || this.configService.get<string>('SMTP_USER') || '';
    const pass = this.configService.get<string>('MAIL_PASSWORD') || this.configService.get<string>('SMTP_PASS') || '';

    this.fromAddress = user ? `"Consulting Advisory" <${user}>` : '';

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
      });
      this.isLive = true;
      this.logger.log(`SMTP configured for ${user} via ${host}:${port}`);
    } else {
      this.logger.warn('SMTP credentials not provided. Running in dev mock email mode.');
      this.isLive = false;
    }
  }

  private async logEmail(
    to: string,
    subject: string,
    type: 'confirmation' | 'cancellation' | 'payment_failed' | 'welcome' | 'booking_initiated',
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
${meetingUrl ? `- Video Meeting: ${meetingUrl}` : ''}
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
                  ${meetingUrl.includes('meet.google.com') ? 'Join Google Meet' : 'Join Video Meeting'}
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

        ${
          meetingUrl
            ? `
        <div style="text-align: center; margin: 28px 0; padding: 18px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px;">
          <p style="font-size: 13px; font-weight: 600; color: #166534; margin: 0 0 12px 0;">Your video meeting room is ready:</p>
          <a href="${meetingUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block;">
            🎥 Join Video Call
          </a>
          <p style="font-size: 12px; color: #475569; margin-top: 10px; word-break: break-all;">
            Direct Meeting Link: <a href="${meetingUrl}" target="_blank" style="color: #2563eb; text-decoration: underline;">${meetingUrl}</a>
          </p>
        </div>
        `
            : ''
        }

        <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 4px; margin-bottom: 24px;">
          <p style="font-size: 12px; color: #1e40af; margin: 0; line-height: 1.5;">
            <strong>Notice:</strong> You can also access and rejoin this meeting anytime directly from your <a href="${this.frontendUrl}/dashboard/bookings" style="color: #1e40af; font-weight: 700; text-decoration: underline;">Consultations Dashboard</a>.
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

  async sendRegistrationWelcome(email: string, name: string): Promise<boolean> {
    const subject = `Welcome to Consulting Advisory, ${name}!`;

    const textContent = `
Hello ${name},

Welcome to Consulting Advisory! Your account has been successfully created.

With your new account, you can:
- Explore our expert consulting services and strategy sessions
- Schedule appointments with real-time slot availability
- Access instant Google Meet links directly from your account
- Track upcoming bookings and session history

Visit your portal to explore services and book a session:
${this.frontendUrl}/services

If you have any questions or need help, simply reply to this email.

Best regards,
Consulting Advisory Team
    `.trim();

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0;">
          <h1 style="font-size: 22px; font-weight: 800; color: #1e293b; margin: 0;">Welcome to Consulting Advisory</h1>
          <p style="font-size: 13px; color: #64748b; margin-top: 4px;">Your advisory portal account is ready</p>
        </div>

        <p style="font-size: 15px; color: #334155;">Hi <strong>${name}</strong>,</p>
        <p style="font-size: 14px; color: #334155; line-height: 1.6;">
          Thank you for joining <strong>Consulting Advisory</strong>! We are thrilled to have you on board.
          You can now seamlessly schedule consultations, connect with industry experts, and manage your strategy sessions.
        </p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 24px 0;">
          <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; margin-top: 0; margin-bottom: 12px;">What You Can Do:</h3>
          <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #334155; line-height: 1.8;">
            <li><strong>Expert Advisory:</strong> Choose from 30, 45, or 90-minute technical and architectural reviews.</li>
            <li><strong>Integrated Google Meet:</strong> Rejoin your video calls anytime directly from your dashboard.</li>
            <li><strong>Personal Dashboard:</strong> Manage upcoming appointments, view history, and update notes.</li>
          </ul>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${this.frontendUrl}/services" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
            Explore Advisory Services
          </a>
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
          to: email,
          subject,
          text: textContent,
          html: htmlContent,
        });
        await this.logEmail(email, subject, 'welcome', 'sent');
        this.logger.log(`SMTP welcome email sent to ${email}`);
        return true;
      } catch (error: any) {
        this.logger.error(`Failed to send welcome email via SMTP: ${error.message}`);
        await this.logEmail(email, subject, 'welcome', 'failed');
        return false;
      }
    }

    // Mock Mode
    this.logger.log(`[Dev Mock SMTP] Welcome registration email logged for ${email}`);
    await this.logEmail(email, subject, 'welcome', 'mocked');
    return true;
  }

  async sendBookingInitiated(booking: BookingEntity): Promise<boolean> {
    const { customer, schedule, serviceName, bookingNumber, amount } = booking;
    const subject = `Booking Received: ${serviceName} (${bookingNumber})`;

    const textContent = `
Hello ${customer.name},

We have received your reservation request for ${serviceName}.

Session Details:
- Booking Reference: ${bookingNumber}
- Service: ${serviceName}
- Date: ${schedule.date}
- Time: ${schedule.startTime} - ${schedule.endTime} (${schedule.timezone})
- Amount: ₹${amount}

Next Steps:
Please complete the payment step to lock in your calendar slot.
Once confirmed, you will receive an updated email with the Google Meet link and calendar invitation.

You can view your bookings anytime at:
${this.frontendUrl}/dashboard/bookings

Best regards,
Consulting Advisory Team
    `.trim();

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0;">
          <h1 style="font-size: 20px; font-weight: 800; color: #1e293b; margin: 0;">Consultation Booking Received</h1>
          <p style="font-size: 13px; color: #64748b; margin-top: 4px;">Your session slot has been reserved.</p>
        </div>

        <p style="font-size: 14px; color: #334155;">Hi <strong>${customer.name}</strong>,</p>
        <p style="font-size: 14px; color: #334155; line-height: 1.5;">
          We have recorded your booking request for <strong>${serviceName}</strong>.
        </p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 24px 0;">
          <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-top: 0; margin-bottom: 12px;">Reservation Details</h3>
          <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #64748b; width: 35%;">Service:</td>
              <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">${serviceName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Booking ID:</td>
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
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Amount:</td>
              <td style="padding: 6px 0; font-weight: 700; color: #0f172a;">₹${amount}</td>
            </tr>
          </table>
        </div>

        <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; margin-bottom: 24px;">
          <p style="font-size: 12px; color: #92400e; margin: 0; line-height: 1.5;">
            <strong>Next Step:</strong> Complete payment to lock in your appointment. Once payment is processed, you will receive full meeting details and a calendar invitation.
          </p>
        </div>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${this.frontendUrl}/dashboard/bookings" style="background-color: #2563eb; color: #ffffff; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px; display: inline-block;">
            View My Bookings
          </a>
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
        await this.logEmail(customer.email, subject, 'booking_initiated', 'sent', booking.id);
        this.logger.log(`SMTP booking initiated email sent to ${customer.email} (${bookingNumber})`);
        return true;
      } catch (error: any) {
        this.logger.error(`Failed to send booking initiated email via SMTP: ${error.message}`);
        await this.logEmail(customer.email, subject, 'booking_initiated', 'failed', booking.id);
        return false;
      }
    }

    // Mock Mode
    this.logger.log(`[Dev Mock SMTP] Booking initiated email logged for ${customer.email} (${bookingNumber})`);
    await this.logEmail(customer.email, subject, 'booking_initiated', 'mocked', booking.id);
    return true;
  }
}
