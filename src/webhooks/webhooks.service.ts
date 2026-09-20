import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { FirebaseService } from '../firebase/firebase.service';
import { BookingsService } from '../bookings/bookings.service';
import { CalendarService } from '../calendar/calendar.service';
import { EmailService } from '../email/email.service';
import { BookingEntity } from '../common/types';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private webhookSecret: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly firebaseService: FirebaseService,
    private readonly bookingsService: BookingsService,
    private readonly calendarService: CalendarService,
    private readonly emailService: EmailService,
  ) {
    this.webhookSecret =
      this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET') ||
      this.configService.get<string>('STRIPE_WEBHOOK_SECRET') ||
      null;
  }

  /**
   * Handle Razorpay Webhooks (order.paid, payment.captured, payment.failed)
   */
  async handleRazorpayWebhook(
    payload: Buffer,
    signature: string,
  ): Promise<{ received: boolean; processed: boolean; message?: string }> {
    const rawBody = payload.toString('utf-8');

    // Verify signature if webhook secret is configured
    if (
      this.webhookSecret &&
      !this.webhookSecret.includes('example') &&
      !this.webhookSecret.includes('placeholder')
    ) {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (expectedSignature !== signature) {
        this.logger.error('Razorpay webhook signature verification failed');
        throw new BadRequestException('Invalid Razorpay webhook signature');
      }
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch (err) {
      throw new BadRequestException('Invalid JSON webhook payload');
    }

    // Event ID / payload unique key for idempotency
    const eventId =
      event.id ||
      event.event_id ||
      `rzp_${event.event}_${event.payload?.payment?.entity?.id || event.payload?.order?.entity?.id || Date.now()}`;

    // --- Webhook Idempotency Check ---
    const existingEvent = await this.firebaseService.getDoc('processed_webhook_events', eventId);
    if (existingEvent) {
      this.logger.warn(`Webhook event ${eventId} already processed. Ignoring duplicate.`);
      return { received: true, processed: false, message: 'Event already processed' };
    }

    this.logger.log(`Processing Razorpay webhook event: ${event.event} (${eventId})`);

    switch (event.event) {
      case 'order.paid': {
        const order = event.payload?.order?.entity;
        const payment = event.payload?.payment?.entity;
        const bookingId = order?.notes?.bookingId || payment?.notes?.bookingId;

        if (bookingId) {
          await this.processSuccessfulPayment(bookingId, payment?.id, order?.id);
        }
        break;
      }

      case 'payment.captured': {
        const payment = event.payload?.payment?.entity;
        const bookingId = payment?.notes?.bookingId;
        const orderId = payment?.order_id;

        if (bookingId) {
          await this.processSuccessfulPayment(bookingId, payment.id, orderId);
        }
        break;
      }

      case 'payment.failed': {
        const payment = event.payload?.payment?.entity;
        const bookingId = payment?.notes?.bookingId;
        if (bookingId) {
          await this.bookingsService.updateBookingStatus(bookingId, 'pending_payment', 'failed');
          this.logger.warn(`Payment failed for booking ${bookingId}`);
        }
        break;
      }

      default:
        this.logger.log(`Unhandled Razorpay event type: ${event.event}`);
    }

    // Save event ID to prevent duplicate handling
    await this.firebaseService.setDoc('processed_webhook_events', eventId, {
      id: eventId,
      type: event.event,
      processedAt: new Date().toISOString(),
    });

    return { received: true, processed: true };
  }

  /**
   * Backward-compatible handler for Stripe webhook payloads if triggered
   */
  async handleStripeWebhook(
    payload: Buffer,
    signature: string,
  ): Promise<{ received: boolean; processed: boolean; message?: string }> {
    return this.handleRazorpayWebhook(payload, signature);
  }

  /**
   * Completes payment, creates calendar event, sends confirmation email
   */
  async processSuccessfulPayment(
    bookingId: string,
    paymentId?: string,
    orderId?: string,
  ): Promise<BookingEntity> {
    const booking = await this.bookingsService.findById(bookingId);

    // If already confirmed, don't recreate calendar or re-email
    if (booking.status === 'confirmed' && booking.paymentStatus === 'paid') {
      this.logger.log(`Booking ${booking.bookingNumber} is already confirmed and paid.`);
      return booking;
    }

    // 1. Update Booking & Payment Status
    await this.bookingsService.updateBookingStatus(booking.id, 'confirmed', 'paid');
    if (paymentId || orderId) {
      await this.bookingsService.attachPaymentDetails(booking.id, {
        ...(paymentId ? { razorpayPaymentId: paymentId } : {}),
        ...(orderId ? { razorpayOrderId: orderId } : {}),
      });
    }

    // Refresh booking record
    const updatedBooking = await this.bookingsService.findById(booking.id);

    // 2. Create Google Calendar Event & Meet URL
    try {
      const { eventId, meetingUrl } = await this.calendarService.createEvent(updatedBooking);
      await this.bookingsService.attachMeetingDetails(updatedBooking.id, {
        googleCalendarEventId: eventId,
        meetingUrl,
      });
      updatedBooking.googleCalendarEventId = eventId;
      updatedBooking.meetingUrl = meetingUrl;
    } catch (err: any) {
      this.logger.error(`Error creating calendar event for ${updatedBooking.bookingNumber}: ${err.message}`);
    }

    // 3. Send Confirmation Email via SMTP
    try {
      const emailSent = await this.emailService.sendBookingConfirmation(updatedBooking);
      await this.bookingsService.attachMeetingDetails(updatedBooking.id, {
        confirmationEmailSent: emailSent,
      });
      updatedBooking.confirmationEmailSent = emailSent;
    } catch (err: any) {
      this.logger.error(`Error sending confirmation email for ${updatedBooking.bookingNumber}: ${err.message}`);
    }

    this.logger.log(`Booking ${updatedBooking.bookingNumber} successfully confirmed with calendar & email.`);
    return updatedBooking;
  }
}
