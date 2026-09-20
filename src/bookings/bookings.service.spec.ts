import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { AvailabilityService } from '../availability/availability.service';
import { FirebaseService } from '../firebase/firebase.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';

describe('BookingsService (Double Booking Prevention & State)', () => {
  let service: BookingsService;
  let firebaseService: FirebaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        AvailabilityService,
        FirebaseService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
    firebaseService = module.get<FirebaseService>(FirebaseService);
    firebaseService.onModuleInit();
  });

  it('should reserve a slot and create pending booking', async () => {
    const booking = await service.createPendingBooking({
      serviceId: 'svc_60min',
      customer: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+919876543210',
        agenda: 'Discussion on cloud migrations and cost optimization.',
      },
      schedule: {
        date: '2026-09-22',
        startTime: '10:00',
        timezone: 'Asia/Kolkata',
      },
    });

    expect(booking).toBeDefined();
    expect(booking.bookingNumber).toMatch(/^BK-\d{4}-\d{5}$/);
    expect(booking.status).toBe('pending_payment');
    expect(booking.paymentStatus).toBe('pending');
    expect(booking.schedule.endTime).toBe('11:00');
    expect(booking.amount).toBe(2500);
  });

  it('should prevent double booking for the same slot', async () => {
    // First booking
    await service.createPendingBooking({
      serviceId: 'svc_60min',
      customer: {
        name: 'Client A',
        email: 'clienta@example.com',
        phone: '+919876543211',
        agenda: 'Architecture consultation for new payments product.',
      },
      schedule: {
        date: '2026-09-22',
        startTime: '11:00',
        timezone: 'Asia/Kolkata',
      },
    });

    // Attempting identical slot booking must throw BadRequestException (SLOT_UNAVAILABLE)
    await expect(
      service.createPendingBooking({
        serviceId: 'svc_60min',
        customer: {
          name: 'Client B',
          email: 'clientb@example.com',
          phone: '+919876543212',
          agenda: 'Duplicate attempt on the same 11:00 slot.',
        },
        schedule: {
          date: '2026-09-22',
          startTime: '11:00',
          timezone: 'Asia/Kolkata',
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should enforce 24-hour cancellation rule for customer', async () => {
    // Create a booking for tomorrow or near future (within 24 hours)
    const nearDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
    const dateStr = nearDate.toISOString().split('T')[0];
    const booking = await firebaseService.setDoc('bookings', 'near_booking_1', {
      id: 'near_booking_1',
      bookingNumber: 'BK-2026-00099',
      schedule: {
        date: dateStr,
        startTime: '10:00',
        endTime: '11:00',
        timezone: 'Asia/Kolkata',
      },
      status: 'confirmed',
      paymentStatus: 'paid',
      customer: { email: 'client@example.com', name: 'Client' },
    });

    // Customer cancellation within 24h should fail
    await expect(
      service.cancelBooking('near_booking_1', { reason: 'Busy' }, undefined, false),
    ).rejects.toThrow(BadRequestException);
  });
});
