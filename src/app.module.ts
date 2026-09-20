import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { FirebaseModule } from './firebase/firebase.module';
import { AuthModule } from './auth/auth.module';
import { ServicesModule } from './services/services.module';
import { AvailabilityModule } from './availability/availability.module';
import { BookingsModule } from './bookings/bookings.module';
import { PaymentsModule } from './payments/payments.module';
import { CalendarModule } from './calendar/calendar.module';
import { EmailModule } from './email/email.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),
    FirebaseModule,
    AuthModule,
    ServicesModule,
    AvailabilityModule,
    BookingsModule,
    PaymentsModule,
    CalendarModule,
    EmailModule,
    WebhooksModule,
    AdminModule,
  ],
})
export class AppModule {}
