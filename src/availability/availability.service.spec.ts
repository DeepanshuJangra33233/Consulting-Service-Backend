import { Test, TestingModule } from '@nestjs/testing';
import { AvailabilityService } from './availability.service';
import { FirebaseService } from '../firebase/firebase.service';
import { ConfigService } from '@nestjs/config';

describe('AvailabilityService (Slot Generation Engine)', () => {
  let service: AvailabilityService;
  let firebaseService: FirebaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
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

    service = module.get<AvailabilityService>(AvailabilityService);
    firebaseService = module.get<FirebaseService>(FirebaseService);
    firebaseService.onModuleInit(); // seed data
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return working hours for days of week', async () => {
    const hours = await service.getWorkingHours();
    expect(hours.length).toBeGreaterThanOrEqual(5);
    const monday = hours.find((h) => h.dayName === 'Monday');
    expect(monday).toBeDefined();
    expect(monday?.enabled).toBe(true);
  });

  it('should generate available slots on a valid working weekday for 60-minute consultation', async () => {
    // 2026-09-22 is a Tuesday (working day 09:00 - 17:00)
    const result = await service.getAvailableSlots('2026-09-22', 'svc_60min', 'Asia/Kolkata');
    expect(result.isBlocked).toBe(false);
    expect(result.slots.length).toBe(8); // 09:00 to 17:00 -> 8 hourly slots
    expect(result.slots[0].startTime).toBe('09:00');
    expect(result.slots[0].endTime).toBe('10:00');
    expect(result.slots[0].available).toBe(true);
  });

  it('should mark slots as unavailable when a booking exists in that time slot', async () => {
    // Book 14:00 - 15:00 on 2026-09-22
    await firebaseService.setDoc('bookings', 'test_booking_1', {
      id: 'test_booking_1',
      bookingNumber: 'BK-2026-99999',
      schedule: {
        date: '2026-09-22',
        startTime: '14:00',
        endTime: '15:00',
        timezone: 'Asia/Kolkata',
      },
      status: 'confirmed',
      paymentStatus: 'paid',
    });

    const result = await service.getAvailableSlots('2026-09-22', 'svc_60min', 'Asia/Kolkata');
    const slot14 = result.slots.find((s) => s.startTime === '14:00');
    expect(slot14).toBeDefined();
    expect(slot14?.available).toBe(false);
    expect(slot14?.reason).toBe('Booked');

    const slot09 = result.slots.find((s) => s.startTime === '09:00');
    expect(slot09?.available).toBe(true);
  });

  it('should return no slots if the date is blocked by admin', async () => {
    await service.addBlockedDate({
      date: '2026-09-25',
      reason: 'Company Retreat',
    });

    const result = await service.getAvailableSlots('2026-09-25', 'svc_60min', 'Asia/Kolkata');
    expect(result.isBlocked).toBe(true);
    expect(result.slots.length).toBe(0);
    expect(result.blockedReason).toContain('Company Retreat');
  });
});
