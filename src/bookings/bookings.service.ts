import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { AvailabilityService } from '../availability/availability.service';
import {
  BookingEntity,
  BookingStatus,
  PaymentStatus,
  ServiceEntity,
} from '../common/types';
import { CreateBookingDto, CancelBookingDto } from './dto/booking.dto';
import { ErrorCodes } from '../common/errors/error-codes';
import { EmailService } from '../email/email.service';
import { UserEntity } from '../common/types';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly availabilityService: AvailabilityService,
    private readonly emailService: EmailService,
  ) {}

  private toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  private toHHMM(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  private generateJitsiUrl(seed: string): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let hash = 0;
    const cleanSeed = (seed || 'meet').toLowerCase();
    for (let i = 0; i < cleanSeed.length; i++) {
      hash = (hash << 5) - hash + cleanSeed.charCodeAt(i);
      hash |= 0;
    }
    let roomCode = '';
    for (let i = 0; i < 12; i++) {
      const idx = Math.abs((hash * (i + 1) * 31 + i * 17) % chars.length);
      roomCode += chars[idx];
    }
    return `https://meet.jit.si/consultation-${roomCode}`;
  }

  private async getNextBookingNumber(): Promise<string> {
    const currentYear = new Date().getFullYear();
    const counterDoc = await this.firebaseService.getDoc('settings', 'booking_counter');
    const currentCount = (counterDoc && counterDoc.count) ? Number(counterDoc.count) + 1 : 1;
    await this.firebaseService.setDoc('settings', 'booking_counter', { count: currentCount });
    const padded = currentCount.toString().padStart(5, '0');
    return `BK-${currentYear}-${padded}`;
  }

  /**
   * Atomic Booking Creation with Double Booking Prevention
   */
  async createPendingBooking(
    dto: CreateBookingDto,
    userId?: string,
  ): Promise<BookingEntity> {
    const { serviceId, customer, schedule } = dto;
    const timezone = schedule.timezone || 'Asia/Kolkata';

    let finalUserId = userId;
    let finalCustomerEmail = customer.email;
    let finalCustomerName = customer.name;

    if (finalUserId) {
      const userDoc = await this.firebaseService.getDoc<UserEntity>('users', finalUserId);
      if (userDoc?.email) {
        finalCustomerEmail = userDoc.email;
      }
      if (userDoc?.name && !finalCustomerName) {
        finalCustomerName = userDoc.name;
      }
    } else if (customer?.email) {
      const cleanCustomerEmail = customer.email.toLowerCase().trim();
      const userMatches = await this.firebaseService.queryDocs<UserEntity>('users', {
        where: [['email', '==', cleanCustomerEmail]],
        limit: 1,
      });
      if (userMatches.length > 0) {
        finalUserId = userMatches[0].id;
        if (userMatches[0].email) {
          finalCustomerEmail = userMatches[0].email;
        }
        if (userMatches[0].name && !finalCustomerName) {
          finalCustomerName = userMatches[0].name;
        }
      }
    }


    // 1. Validate service
    const service = await this.firebaseService.getDoc<ServiceEntity>('services', serviceId);
    if (!service || !service.active) {
      throw new BadRequestException({
        message: 'Consulting service is invalid or inactive',
        code: ErrorCodes.SERVICE_NOT_FOUND,
      });
    }

    const duration = service.durationMinutes;
    const startMinutes = this.toMinutes(schedule.startTime);
    const endMinutes = startMinutes + duration;
    const computedEndTime = this.toHHMM(endMinutes);

    // 2. Validate availability using Slot Engine
    const availability = await this.availabilityService.getAvailableSlots(
      schedule.date,
      serviceId,
      timezone,
    );

    if (availability.isBlocked) {
      throw new BadRequestException({
        message: `Selected date is blocked: ${availability.blockedReason}`,
        code: ErrorCodes.DATE_BLOCKED,
      });
    }

    // Verify that the requested slot is actually present and available in generated slots
    const targetSlot = availability.slots.find(
      (s) => s.startTime === schedule.startTime,
    );

    if (!targetSlot || !targetSlot.available) {
      throw new BadRequestException({
        message: 'Selected time slot is no longer available',
        code: ErrorCodes.SLOT_UNAVAILABLE,
      });
    }

    // 3. Prevent Double Booking inside an Atomic Transaction
    const createdBooking = await this.firebaseService.runTransaction<BookingEntity>(async (tx) => {
      // Re-read existing bookings on this date inside transaction
      const existingBookings = await tx.queryDocs('bookings', {
        where: [['schedule.date', '==', schedule.date]],
      });

      const now = new Date();
      const hasConflict = existingBookings.some((b: BookingEntity) => {
        if (b.status === 'cancelled') return false;
        if (b.status === 'pending_payment' && b.expiresAt && new Date(b.expiresAt) < now) {
          return false; // Expired reservation
        }
        const bStart = this.toMinutes(b.schedule.startTime);
        const bEnd = this.toMinutes(b.schedule.endTime);
        return Math.max(startMinutes, bStart) < Math.min(endMinutes, bEnd);
      });

      if (hasConflict) {
        throw new BadRequestException({
          message: 'Selected time slot is no longer available',
          code: ErrorCodes.SLOT_UNAVAILABLE,
        });
      }

      // Generate unique booking number
      const bookingNumber = await this.getNextBookingNumber();
      const bookingId = `bk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString(); // 20 min reservation TTL

      const booking: BookingEntity = {
        id: bookingId,
        bookingNumber,
        userId: finalUserId,
        serviceId,
        serviceName: service.name,
        customer: {
          name: finalCustomerName || customer.name,
          email: finalCustomerEmail || customer.email,
          phone: customer.phone,
          agenda: customer.agenda,
        },
        schedule: {
          date: schedule.date,
          startTime: schedule.startTime,
          endTime: computedEndTime,
          timezone,
        },
        amount: service.price,
        currency: service.currency || 'INR',
        status: 'pending_payment',
        paymentStatus: 'pending',
        confirmationEmailSent: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt,
      };

      tx.setDoc('bookings', bookingId, booking);
      this.logger.log(`Slot reserved successfully for booking ${bookingNumber} (${bookingId})`);
      return booking;
    });

    // NOTE: Per requirement, email is only sent AFTER successful payment, NOT before payment.
    return createdBooking;
  }

  async findById(id: string): Promise<BookingEntity> {
    const booking = await this.firebaseService.getDoc<BookingEntity>('bookings', id);
    if (!booking) {
      // Try lookup by bookingNumber as fallback
      const byNumber = await this.firebaseService.queryDocs<BookingEntity>('bookings', {
        where: [['bookingNumber', '==', id]],
        limit: 1,
      });
      if (byNumber.length > 0) {
        return byNumber[0];
      }

      throw new NotFoundException({
        message: `Booking ${id} not found`,
        code: ErrorCodes.BOOKING_NOT_FOUND,
      });
    }
    return booking;
  }

  async findMyBookings(userId: string, email?: string): Promise<BookingEntity[]> {
    const cleanEmail = email?.toLowerCase().trim();
    const bookings: BookingEntity[] = [];

    if (userId) {
      const byUser = await this.firebaseService.queryDocs<BookingEntity>('bookings', {
        where: [['userId', '==', userId]],
      });
      bookings.push(...byUser);
    }

    if (cleanEmail) {
      const byEmail = await this.firebaseService.queryDocs<BookingEntity>('bookings', {
        where: [['customer.email', '==', cleanEmail]],
      });
      for (const b of byEmail) {
        if (!bookings.some((existing) => existing.id === b.id)) {
          bookings.push(b);
        }
      }
      if (email && email !== cleanEmail) {
        const byOrigEmail = await this.firebaseService.queryDocs<BookingEntity>('bookings', {
          where: [['customer.email', '==', email]],
        });
        for (const b of byOrigEmail) {
          if (!bookings.some((existing) => existing.id === b.id)) {
            bookings.push(b);
          }
        }
      }
    }

    // Ensure all confirmed bookings have a valid Jitsi meeting URL
    for (const b of bookings) {
      if (b.status === 'confirmed' && (!b.meetingUrl || b.meetingUrl.includes('meet.google.com'))) {
        b.meetingUrl = this.generateJitsiUrl(b.bookingNumber || b.id);
        this.firebaseService.setDoc('bookings', b.id, { meetingUrl: b.meetingUrl }).catch(() => {});
      }
    }

    // Sort descending by createdAt in memory
    bookings.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    return bookings;
  }

  async cancelBooking(
    id: string,
    dto: CancelBookingDto,
    requesterUserId?: string,
    isAdmin = false,
  ): Promise<BookingEntity> {
    const booking = await this.findById(id);

    if (booking.status === 'cancelled') {
      throw new BadRequestException({
        message: 'Booking is already cancelled',
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }

    if (booking.status === 'completed') {
      throw new BadRequestException({
        message: 'Completed bookings cannot be cancelled',
        code: ErrorCodes.BOOKING_CANNOT_BE_CANCELLED,
      });
    }

    // Check ownership if not admin
    if (!isAdmin && requesterUserId && booking.userId && booking.userId !== requesterUserId) {
      throw new BadRequestException({
        message: 'You can only cancel your own bookings',
        code: ErrorCodes.FORBIDDEN,
      });
    }

    // Cancellation Policy Check: 24 hours prior to appointment start time (Section 38)
    if (!isAdmin) {
      const appointmentDateTimeStr = `${booking.schedule.date}T${booking.schedule.startTime}:00`;
      const appointmentTime = new Date(appointmentDateTimeStr).getTime();
      const now = Date.now();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;

      if (appointmentTime - now < twentyFourHoursMs) {
        throw new BadRequestException({
          message: 'Cancellations must be made at least 24 hours before the appointment time.',
          code: ErrorCodes.BOOKING_CANNOT_BE_CANCELLED,
        });
      }
    }

    const updates: Partial<BookingEntity> = {
      status: 'cancelled',
      cancellationReason: dto.reason || 'Cancelled by user',
      updatedAt: new Date().toISOString(),
    };

    await this.firebaseService.updateDoc('bookings', booking.id, updates);
    this.logger.log(`Booking ${booking.bookingNumber} (${booking.id}) cancelled successfully`);

    return { ...booking, ...updates };
  }

  async updateBookingStatus(
    id: string,
    status: BookingStatus,
    paymentStatus?: PaymentStatus,
  ): Promise<BookingEntity> {
    const booking = await this.findById(id);
    const updates: Partial<BookingEntity> = {
      status,
      ...(paymentStatus ? { paymentStatus } : {}),
      updatedAt: new Date().toISOString(),
    };
    await this.firebaseService.updateDoc('bookings', booking.id, updates);
    return { ...booking, ...updates };
  }

  async attachPaymentDetails(
    id: string,
    details: {
      stripeCheckoutSessionId?: string;
      stripePaymentIntentId?: string;
      razorpayOrderId?: string;
      razorpayPaymentId?: string;
      razorpaySignature?: string;
      paymentStatus?: PaymentStatus;
      status?: BookingStatus;
    },
  ): Promise<void> {
    await this.firebaseService.updateDoc('bookings', id, details);
  }

  async attachMeetingDetails(
    id: string,
    details: {
      googleCalendarEventId?: string;
      meetingUrl?: string;
      confirmationEmailSent?: boolean;
    },
  ): Promise<void> {
    await this.firebaseService.updateDoc('bookings', id, details);
  }
}
