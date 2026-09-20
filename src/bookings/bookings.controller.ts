import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, CancelBookingDto } from './dto/booking.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { UserEntity } from '../common/types';

@ApiTags('Bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Public()
  @UseGuards(FirebaseAuthGuard)
  @Post()
  @ApiOperation({ summary: 'Create pending booking and reserve time slot' })
  @ApiResponse({ status: 201, description: 'Booking slot reserved' })
  async create(
    @Body() dto: CreateBookingDto,
    @CurrentUser() user?: UserEntity,
  ) {
    const booking = await this.bookingsService.createPendingBooking(dto, user?.id);
    return {
      success: true,
      data: booking,
      message: 'Slot reserved successfully. Please proceed to payment.',
    };
  }

  @ApiBearerAuth()
  @UseGuards(FirebaseAuthGuard)
  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user bookings' })
  @ApiResponse({ status: 200, description: 'User bookings returned' })
  async getMyBookings(@CurrentUser() user: UserEntity) {
    const data = await this.bookingsService.findMyBookings(user.id, user.email);
    return {
      success: true,
      data,
      message: 'Bookings retrieved successfully',
    };
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get booking details by ID or booking number' })
  @ApiResponse({ status: 200, description: 'Booking details returned' })
  async getById(@Param('id') id: string) {
    const data = await this.bookingsService.findById(id);
    return {
      success: true,
      data,
      message: 'Booking details retrieved successfully',
    };
  }

  @Public()
  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a booking (subject to 24-hour cancellation policy)' })
  @ApiResponse({ status: 200, description: 'Booking cancelled' })
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
    @CurrentUser() user?: UserEntity,
  ) {
    const isAdmin = user?.role === 'admin';
    const data = await this.bookingsService.cancelBooking(id, dto, user?.id, isAdmin);
    return {
      success: true,
      data,
      message: 'Booking cancelled successfully',
    };
  }
}
