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

    // Get total registered users from Firestore
    const allUsers = await this.firebaseService.queryDocs<UserEntity>('users');
    const regularUsers = allUsers.filter(
      (u) => u.role !== 'admin' && !this.firebaseService.isAdminEmail(u.email),
    );

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
        totalUsers: regularUsers.length,
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
    // 1. Fetch all registered users from Firestore
    const allUsers = await this.firebaseService.queryDocs<UserEntity>('users');
    const allBookings = await this.firebaseService.queryDocs<BookingEntity>('bookings');

    const customerMap = new Map<
      string,
      {
        id?: string;
        name: string;
        email: string;
        phone: string;
        role: string;
        createdAt?: string;
        totalBookings: number;
        totalSpent: number;
        lastBookingDate: string;
      }
    >();

    // Add all registered users (excluding admin)
    for (const u of allUsers) {
      if (u.role === 'admin' || this.firebaseService.isAdminEmail(u.email)) {
        continue;
      }
      const email = u.email.toLowerCase();
      customerMap.set(email, {
        id: u.id,
        name: u.name || email.split('@')[0],
        email: u.email,
        phone: u.phone || '',
        role: 'user',
        createdAt: u.createdAt,
        totalBookings: 0,
        totalSpent: 0,
        lastBookingDate: u.createdAt ? u.createdAt.split('T')[0] : 'N/A',
      });
    }

    // Merge booking stats for each customer
    for (const b of allBookings) {
      const email = b.customer.email.toLowerCase();
      const existing = customerMap.get(email);
      const spent = b.paymentStatus === 'paid' ? Number(b.amount || 0) : 0;

      if (!existing) {
        customerMap.set(email, {
          name: b.customer.name,
          email: b.customer.email,
          phone: b.customer.phone || '',
          role: 'user',
          createdAt: b.createdAt,
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
      (a, b) => b.totalSpent - a.totalSpent || (b.createdAt && a.createdAt ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() : 0),
    );
  }
}
