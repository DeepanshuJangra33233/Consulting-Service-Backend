import { Injectable, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { BookingEntity, UserEntity } from '../common/types';
import { QueryAdminBookingsDto, UpdateAdminBookingDto } from './dto/admin.dto';
import { ErrorCodes } from '../common/errors/error-codes';

@Injectable()
export class AdminService {
  constructor(private readonly firebaseService: FirebaseService) {}

  async getDashboardAnalytics() {
    const allBookings = await this.firebaseService.queryDocs<BookingEntity>('bookings');
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    let totalBookings = allBookings.length;
    let upcomingCount = 0;
    let completedCount = 0;
    let cancelledCount = 0;
    let pendingPaymentCount = 0;
    let totalRevenue = 0;

    for (const b of allBookings) {
      if (b.status === 'cancelled') {
        cancelledCount++;
      } else if (b.status === 'completed') {
        completedCount++;
      } else if (b.status === 'pending_payment') {
        pendingPaymentCount++;
      } else if (b.status === 'confirmed' || b.status === 'paid') {
        if (b.schedule.date >= todayStr) {
          upcomingCount++;
        } else {
          completedCount++;
        }
      }

      if (b.paymentStatus === 'paid') {
        totalRevenue += Number(b.amount || 0);
      }
    }

    // Get 5 most recent bookings
    const recentBookings = [...allBookings]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    return {
      metrics: {
        totalBookings,
        upcomingBookings: upcomingCount,
        completedBookings: completedCount,
        cancelledBookings: cancelledCount,
        pendingPayments: pendingPaymentCount,
        totalRevenue, // in INR ₹
        currency: 'INR',
      },
      recentBookings,
    };
  }

  async getBookings(query: QueryAdminBookingsDto): Promise<BookingEntity[]> {
    let bookings = await this.firebaseService.queryDocs<BookingEntity>('bookings', {
      orderBy: ['createdAt', 'desc'],
    });

    if (query.status) {
      bookings = bookings.filter((b) => b.status === query.status);
    }

    if (query.date) {
      bookings = bookings.filter((b) => b.schedule.date === query.date);
    }

    if (query.search) {
      const q = query.search.toLowerCase();
      bookings = bookings.filter(
        (b) =>
          b.bookingNumber.toLowerCase().includes(q) ||
          b.customer.name.toLowerCase().includes(q) ||
          b.customer.email.toLowerCase().includes(q) ||
          (b.serviceName && b.serviceName.toLowerCase().includes(q)),
      );
    }

    return bookings;
  }

  async updateBooking(id: string, dto: UpdateAdminBookingDto): Promise<BookingEntity> {
    const booking = await this.firebaseService.getDoc<BookingEntity>('bookings', id);
    if (!booking) {
      throw new NotFoundException({
        message: `Booking ${id} not found`,
        code: ErrorCodes.BOOKING_NOT_FOUND,
      });
    }

    const updates: Partial<BookingEntity> = {
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.paymentStatus ? { paymentStatus: dto.paymentStatus } : {}),
      updatedAt: new Date().toISOString(),
    };

    await this.firebaseService.updateDoc('bookings', booking.id, updates);
    return { ...booking, ...updates };
  }

  async getCustomers() {
    const allBookings = await this.firebaseService.queryDocs<BookingEntity>('bookings');
    const customerMap = new Map<
      string,
      {
        name: string;
        email: string;
        phone: string;
        totalBookings: number;
        totalSpent: number;
        lastBookingDate: string;
      }
    >();

    for (const b of allBookings) {
      const email = b.customer.email.toLowerCase();
      const existing = customerMap.get(email);
      const spent = b.paymentStatus === 'paid' ? Number(b.amount || 0) : 0;

      if (!existing) {
        customerMap.set(email, {
          name: b.customer.name,
          email: b.customer.email,
          phone: b.customer.phone,
          totalBookings: 1,
          totalSpent: spent,
          lastBookingDate: b.schedule.date,
        });
      } else {
        existing.totalBookings += 1;
        existing.totalSpent += spent;
        if (b.schedule.date > existing.lastBookingDate) {
          existing.lastBookingDate = b.schedule.date;
        }
      }
    }

    return Array.from(customerMap.values()).sort(
      (a, b) => b.totalSpent - a.totalSpent,
    );
  }
}
