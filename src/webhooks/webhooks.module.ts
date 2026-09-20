import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { BookingsModule } from '../bookings/bookings.module';
import { CalendarModule } from '../calendar/calendar.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [BookingsModule, CalendarModule, EmailModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
