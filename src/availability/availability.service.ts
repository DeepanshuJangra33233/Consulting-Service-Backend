import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import {
  AvailabilityWorkingHours,
  BlockedDateEntity,
  BookingEntity,
  ServiceEntity,
  TimeSlot,
} from '../common/types';
import {
  CreateBlockedDateDto,
  UpdateWorkingHoursDto,
} from './dto/availability.dto';
import { ErrorCodes } from '../common/errors/error-codes';

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  private toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  private toHHMM(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  private format12Hour(hhmm: string): string {
    const [hStr, mStr] = hhmm.split(':');
    let h = parseInt(hStr, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; // 0 should be 12
    return `${h}:${mStr} ${ampm}`;
  }

  async getWorkingHours(): Promise<AvailabilityWorkingHours[]> {
    const hours = await this.firebaseService.queryDocs<AvailabilityWorkingHours>(
      'availability',
      { orderBy: ['dayOfWeek', 'asc'] },
    );
    return hours;
  }

  async updateWorkingHours(dto: UpdateWorkingHoursDto): Promise<AvailabilityWorkingHours> {
    const id = `day_${dto.dayOfWeek}`;
    await this.firebaseService.setDoc('availability', id, dto);
    return dto;
  }

  async getBlockedDates(): Promise<BlockedDateEntity[]> {
    return this.firebaseService.queryDocs<BlockedDateEntity>('blocked_dates', {
      orderBy: ['date', 'asc'],
    });
  }

  async addBlockedDate(dto: CreateBlockedDateDto): Promise<BlockedDateEntity> {
    const existing = await this.firebaseService.queryDocs<BlockedDateEntity>('blocked_dates', {
      where: [['date', '==', dto.date]],
      limit: 1,
    });

    if (existing.length > 0) {
      throw new BadRequestException({
        message: `Date ${dto.date} is already blocked`,
        code: ErrorCodes.VALIDATION_ERROR,
      });
    }

    const id = `blk_${Date.now()}`;
    const blockedDate: BlockedDateEntity = {
      id,
      date: dto.date,
      reason: dto.reason || 'Blocked by Admin',
      createdAt: new Date().toISOString(),
    };

    await this.firebaseService.setDoc('blocked_dates', id, blockedDate);
    return blockedDate;
  }

  async removeBlockedDate(id: string): Promise<{ id: string; deleted: boolean }> {
    const item = await this.firebaseService.getDoc<BlockedDateEntity>('blocked_dates', id);
    if (!item) {
      throw new NotFoundException({
        message: `Blocked date record ${id} not found`,
        code: 'NOT_FOUND',
      });
    }
    await this.firebaseService.deleteDoc('blocked_dates', id);
    return { id, deleted: true };
  }

  /**
   * Main Slot Generation Engine
   * Generates time slots for a given date, checking:
   * - Working hours for that day of week
   * - Service duration
   * - Blocked dates
   * - Existing bookings (confirmed, paid, active pending_payment)
   * - Past time if target date is today
   */
  async getAvailableSlots(
    dateStr: string,
    serviceId: string,
    timezone = 'Asia/Kolkata',
  ): Promise<{
    date: string;
    dayName: string;
    isBlocked: boolean;
    blockedReason?: string;
    slots: TimeSlot[];
  }> {
    // Validate date format YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) {
      throw new BadRequestException({
        message: 'Invalid date format. Expected YYYY-MM-DD.',
        code: ErrorCodes.INVALID_TIME,
      });
    }

    // 1. Fetch Service to know duration
    const service = await this.firebaseService.getDoc<ServiceEntity>('services', serviceId);
    if (!service || !service.active) {
      throw new NotFoundException({
        message: `Active consulting service with ID ${serviceId} not found`,
        code: ErrorCodes.SERVICE_NOT_FOUND,
      });
    }

    // Parse date parts directly to avoid timezone shift on plain date
    const [year, month, day] = dateStr.split('-').map(Number);
    const targetDateObj = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = targetDateObj.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[dayOfWeek];

    // 2. Check if date is blocked
    const blockedRecords = await this.firebaseService.queryDocs<BlockedDateEntity>(
      'blocked_dates',
      { where: [['date', '==', dateStr]], limit: 1 },
    );

    if (blockedRecords.length > 0) {
      return {
        date: dateStr,
        dayName,
        isBlocked: true,
        blockedReason: blockedRecords[0].reason || 'Admin blocked this date',
        slots: [],
      };
    }

    // 3. Check working hours
    const dayHours = await this.firebaseService.getDoc<AvailabilityWorkingHours>(
      'availability',
      `day_${dayOfWeek}`,
    );

    if (!dayHours || !dayHours.enabled) {
      return {
        date: dateStr,
        dayName,
        isBlocked: false,
        blockedReason: `${dayName} is not a working day`,
        slots: [],
      };
    }

    const startMinutes = this.toMinutes(dayHours.startTime);
    const endMinutes = this.toMinutes(dayHours.endTime);
    const duration = service.durationMinutes;

    // 4. Fetch existing bookings on this date
    const existingBookings = await this.firebaseService.queryDocs<BookingEntity>(
      'bookings',
      { where: [['schedule.date', '==', dateStr]] },
    );

    const now = new Date();
    // Exclude cancelled bookings and expired pending_payment bookings
    const activeBookings = existingBookings.filter((b) => {
      if (b.status === 'cancelled') return false;
      if (b.status === 'pending_payment') {
        if (b.expiresAt && new Date(b.expiresAt) < now) {
          return false; // Reservation expired
        }
      }
      return true;
    });

    // 5. Generate slots
    const slots: TimeSlot[] = [];
    let currentSlotStart = startMinutes;

    // Determine current local time in target timezone (default Asia/Kolkata +05:30)
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    const isToday = todayStr === dateStr;
    const currentHourMin = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
    const currentNowMinutes = this.toMinutes(currentHourMin);

    while (currentSlotStart + duration <= endMinutes) {
      const currentSlotEnd = currentSlotStart + duration;
      const startTimeStr = this.toHHMM(currentSlotStart);
      const endTimeStr = this.toHHMM(currentSlotEnd);

      // Check overlap with active bookings
      const isBooked = activeBookings.some((b) => {
        const bStart = this.toMinutes(b.schedule.startTime);
        const bEnd = this.toMinutes(b.schedule.endTime);
        // Overlap condition: max(start1, start2) < min(end1, end2)
        return Math.max(currentSlotStart, bStart) < Math.min(currentSlotEnd, bEnd);
      });

      // Check if slot has already passed today
      const isPast = isToday && currentSlotStart <= currentNowMinutes + 15; // 15 mins buffer

      let available = true;
      let reason: string | undefined = undefined;

      if (isBooked) {
        available = false;
        reason = 'Booked';
      } else if (isPast) {
        available = false;
        reason = 'Time has passed';
      }

      slots.push({
        startTime: startTimeStr,
        endTime: endTimeStr,
        formattedTime: `${this.format12Hour(startTimeStr)} - ${this.format12Hour(endTimeStr)}`,
        available,
        reason,
      });

      // Increment step by duration or fixed standard interval
      currentSlotStart += duration;
    }

    return {
      date: dateStr,
      dayName,
      isBlocked: false,
      slots,
    };
  }
}
