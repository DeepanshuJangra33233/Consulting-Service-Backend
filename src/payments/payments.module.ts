import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { BookingsModule } from '../bookings/bookings.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [BookingsModule, WebhooksModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
