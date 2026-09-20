export type UserRole = 'user' | 'admin' | 'customer';

export type BookingStatus =
  | 'pending_payment'
  | 'paid'
  | 'confirmed'
  | 'cancelled'
  | 'completed';

export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded';

export interface UserEntity {
  id: string;
  email: string;
  name: string;
  phone?: string;
  photoUrl?: string;
  role: UserRole;
  welcomeEmailSent?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceEntity {
  id: string;
  name: string;
  slug: string;
  description: string;
  durationMinutes: number;
  price: number;
  currency: 'INR';
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDetails {
  name: string;
  email: string;
  phone: string;
  agenda: string;
}

export interface ScheduleDetails {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  timezone: string; // e.g. "Asia/Kolkata"
}

export interface BookingEntity {
  id: string;
  bookingNumber: string;
  userId?: string;
  serviceId: string;
  serviceName?: string;
  customer: CustomerDetails;
  schedule: ScheduleDetails;
  amount: number;
  currency: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  googleCalendarEventId?: string;
  meetingUrl?: string;
  confirmationEmailSent: boolean;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string; // For pending_payment expiration
}

export interface AvailabilityWorkingHours {
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  dayName: string;
  enabled: boolean;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface BlockedDateEntity {
  id: string;
  date: string; // YYYY-MM-DD
  reason?: string;
  createdAt: string;
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
  formattedTime: string;
  available: boolean;
  reason?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
}
