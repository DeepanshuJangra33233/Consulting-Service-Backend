import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { BookingsService } from '../bookings/bookings.service';
import { AvailabilityService } from '../availability/availability.service';
import { CalendarService } from '../calendar/calendar.service';
import { EmailService } from '../email/email.service';
import { FirebaseService } from '../firebase/firebase.service';
import { ConfigService } from '@nestjs/config';

describe('WebhooksService (Razorpay Processing & Idempotency)', () => {
  let service: WebhooksService;
  let bookingsService: BookingsService;
  let firebaseService: FirebaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        BookingsService,
        AvailabilityService,
        CalendarService,
        EmailService,
        FirebaseService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
    bookingsService = module.get<BookingsService>(BookingsService);
    firebaseService = module.get<FirebaseService>(FirebaseService);
    firebaseService.onModuleInit();
  });

  it('should process order.paid Razorpay webhook event and confirm booking', async () => {
    // Create a pending booking
    const booking = await bookingsService.createPendingBooking({
      serviceId: 'svc_60min',
      customer: {
        name: 'Razorpay Client',
        email: 'razorpay@example.com',
        phone: '+919988776655',
        agenda: 'Testing automated Razorpay confirmation flow.',
      },
      schedule: {
        date: '2026-09-22',
        startTime: '15:00',
        timezone: 'Asia/Kolkata',
      },
    });

    const mockEvent = {
      id: 'evt_rzp_order_paid_123',
      event: 'order.paid',
      payload: {
        order: {
          entity: {
            id: 'order_test_123',
            amount: 250000,
            currency: 'INR',
            notes: {
              bookingId: booking.id,
            },
          },
        },
        payment: {
          entity: {
            id: 'pay_test_123',
            order_id: 'order_test_123',
            amount: 250000,
            status: 'captured',
          },
        },
      },
    };

    const payload = Buffer.from(JSON.stringify(mockEvent));
    const result = await service.handleRazorpayWebhook(payload, '');
    expect(result.processed).toBe(true);

    const updatedBooking = await bookingsService.findById(booking.id);
    expect(updatedBooking.status).toBe('confirmed');
    expect(updatedBooking.paymentStatus).toBe('paid');
    expect(updatedBooking.razorpayOrderId).toBe('order_test_123');
    expect(updatedBooking.razorpayPaymentId).toBe('pay_test_123');
    expect(updatedBooking.googleCalendarEventId).toBeDefined();
    expect(updatedBooking.meetingUrl).toContain('meet.google.com');
  });

  it('should process payment.captured Razorpay webhook event', async () => {
    const booking = await bookingsService.createPendingBooking({
      serviceId: 'svc_60min',
      customer: {
        name: 'Captured Client',
        email: 'captured@example.com',
        phone: '+919988776656',
        agenda: 'Testing payment.captured event.',
      },
      schedule: {
        date: '2026-09-22',
        startTime: '16:00',
        timezone: 'Asia/Kolkata',
      },
    });

    const mockEvent = {
      id: 'evt_rzp_captured_456',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_captured_456',
            order_id: 'order_captured_456',
            notes: {
              bookingId: booking.id,
            },
          },
        },
      },
    };

    const payload = Buffer.from(JSON.stringify(mockEvent));
    const result = await service.handleRazorpayWebhook(payload, '');
    expect(result.processed).toBe(true);

    const updatedBooking = await bookingsService.findById(booking.id);
    expect(updatedBooking.status).toBe('confirmed');
    expect(updatedBooking.paymentStatus).toBe('paid');
  });

  it('should ignore duplicate Razorpay webhook events (Idempotency)', async () => {
    const booking = await bookingsService.createPendingBooking({
      serviceId: 'svc_60min',
      customer: {
        name: 'Idempotency Test',
        email: 'idemp@example.com',
        phone: '+919988776654',
        agenda: 'Testing duplicate event deduplication.',
      },
      schedule: {
        date: '2026-09-23',
        startTime: '11:00',
        timezone: 'Asia/Kolkata',
      },
    });

    const duplicateEvent = {
      id: 'evt_rzp_dup_789',
      event: 'order.paid',
      payload: {
        order: {
          entity: {
            id: 'order_dup_789',
            notes: { bookingId: booking.id },
          },
        },
      },
    };

    const payload = Buffer.from(JSON.stringify(duplicateEvent));

    // First delivery
    const res1 = await service.handleRazorpayWebhook(payload, '');
    expect(res1.processed).toBe(true);

    // Second duplicate delivery
    const res2 = await service.handleRazorpayWebhook(payload, '');
    expect(res2.processed).toBe(false);
    expect(res2.message).toBe('Event already processed');
  });
});
