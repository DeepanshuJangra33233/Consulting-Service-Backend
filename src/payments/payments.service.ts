import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';
import { BookingsService } from '../bookings/bookings.service';
import { FirebaseService } from '../firebase/firebase.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { ErrorCodes } from '../common/errors/error-codes';
import { VerifyRazorpayPaymentDto } from './dto/payment.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private razorpayClient: Razorpay | null = null;
  private keyId: string | null = null;
  private keySecret: string | null = null;
  private isLive = false;
  private frontendUrl = 'http://localhost:3000';

  constructor(
    private readonly configService: ConfigService,
    private readonly bookingsService: BookingsService,
    private readonly firebaseService: FirebaseService,
    @Inject(forwardRef(() => WebhooksService))
    private readonly webhooksService: WebhooksService,
  ) {
    this.initRazorpay();
  }

  private initRazorpay() {
    this.keyId = this.configService.get<string>('RAZORPAY_KEY_ID') || null;
    this.keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET') || null;
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    const isPlaceholder =
      !this.keyId ||
      !this.keySecret ||
      this.keyId.includes('placeholder') ||
      this.keyId.includes('example') ||
      this.keySecret.includes('placeholder') ||
      this.keySecret.includes('example');

    if (!isPlaceholder && this.keyId && this.keySecret) {
      try {
        this.razorpayClient = new Razorpay({
          key_id: this.keyId,
          key_secret: this.keySecret,
        });
        this.isLive = true;
        this.logger.log('Razorpay client initialized successfully.');
      } catch (error: any) {
        this.logger.warn(`Failed to initialize Razorpay: ${error.message}. Running in mock payment mode.`);
        this.isLive = false;
      }
    } else {
      this.logger.log('No live RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET found. Running in mock payment mode.');
      this.isLive = false;
    }
  }

  async createCheckoutSession(bookingId: string): Promise<{
    orderId: string;
    sessionId: string;
    checkoutUrl: string;
    amount: number;
    currency: string;
    keyId: string;
    bookingId: string;
    bookingNumber: string;
    serviceName: string;
    customer: {
      name: string;
      email: string;
      phone: string;
    };
    mode: 'live' | 'mock';
  }> {
    const booking = await this.bookingsService.findById(bookingId);

    if (booking.status !== 'pending_payment') {
      throw new BadRequestException({
        message: `Booking is in ${booking.status} state. Only pending bookings can initiate checkout.`,
        code: ErrorCodes.BOOKING_ALREADY_PAID,
      });
    }

    // Check reservation expiration
    if (booking.expiresAt && new Date(booking.expiresAt) < new Date()) {
      throw new BadRequestException({
        message: 'The reservation for this time slot has expired. Please select a slot again.',
        code: ErrorCodes.SLOT_UNAVAILABLE,
      });
    }

    const amountInPaise = Math.round(booking.amount * 100);
    const currency = (booking.currency || 'INR').toUpperCase();

    // Live Razorpay Order Creation
    if (this.isLive && this.razorpayClient) {
      try {
        const order = await this.razorpayClient.orders.create({
          amount: amountInPaise,
          currency,
          receipt: booking.bookingNumber,
          notes: {
            bookingId: booking.id,
            bookingNumber: booking.bookingNumber,
            serviceName: booking.serviceName || 'Consultation Session',
          },
        });

        await this.bookingsService.attachPaymentDetails(booking.id, {
          razorpayOrderId: order.id,
          stripeCheckoutSessionId: order.id, // Backwards compatibility
        });

        return {
          orderId: order.id,
          sessionId: order.id,
          checkoutUrl: `${this.frontendUrl}/booking/success?booking_id=${booking.id}&order_id=${order.id}`,
          amount: Number(order.amount),
          currency: String(order.currency),
          keyId: this.keyId!,
          bookingId: booking.id,
          bookingNumber: booking.bookingNumber,
          serviceName: booking.serviceName || 'Consulting Session',
          customer: {
            name: booking.customer.name,
            email: booking.customer.email,
            phone: booking.customer.phone || '',
          },
          mode: 'live',
        };
      } catch (error: any) {
        this.logger.error(`Razorpay order creation failed: ${error.message}`, error.stack);
        throw new BadRequestException({
          message: `Payment gateway error: ${error.message}`,
          code: ErrorCodes.PAYMENT_FAILED,
        });
      }
    }

    // Dev / Mock Order Mode
    const mockOrderId = `order_mock_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const mockCheckoutUrl = `${this.frontendUrl}/booking/success?booking_id=${booking.id}&order_id=${mockOrderId}&mock=true`;

    await this.bookingsService.attachPaymentDetails(booking.id, {
      razorpayOrderId: mockOrderId,
      stripeCheckoutSessionId: mockOrderId,
    });

    this.logger.log(`[Dev Mode] Generated mock Razorpay order for booking ${booking.bookingNumber}`);
    return {
      orderId: mockOrderId,
      sessionId: mockOrderId,
      checkoutUrl: mockCheckoutUrl,
      amount: amountInPaise,
      currency,
      keyId: 'rzp_test_mock',
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      serviceName: booking.serviceName || 'Consulting Session',
      customer: {
        name: booking.customer.name,
        email: booking.customer.email,
        phone: booking.customer.phone || '',
      },
      mode: 'mock',
    };
  }

  async verifyPayment(dto: VerifyRazorpayPaymentDto) {
    const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = dto;
    const booking = await this.bookingsService.findById(bookingId);

    if (this.isLive && this.keySecret) {
      const generatedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

      if (generatedSignature !== razorpaySignature) {
        this.logger.error(`Razorpay signature verification failed for booking ${booking.bookingNumber}`);
        throw new BadRequestException({
          message: 'Invalid Razorpay payment signature',
          code: ErrorCodes.PAYMENT_FAILED,
        });
      }
    } else {
      this.logger.log(`[Mock Mode] Razorpay signature verification bypassed for ${booking.bookingNumber}`);
    }

    // Attach payment details to booking
    await this.bookingsService.attachPaymentDetails(booking.id, {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      paymentStatus: 'paid',
      status: 'confirmed',
    });

    // Complete booking: calendar event and confirmation email
    return this.webhooksService.processSuccessfulPayment(
      booking.id,
      razorpayPaymentId,
      razorpayOrderId,
    );
  }

  async getPaymentDetails(bookingId: string) {
    const booking = await this.bookingsService.findById(bookingId);
    return {
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      amount: booking.amount,
      currency: booking.currency,
      paymentStatus: booking.paymentStatus,
      status: booking.status,
      razorpayOrderId: booking.razorpayOrderId,
      razorpayPaymentId: booking.razorpayPaymentId,
    };
  }
}
