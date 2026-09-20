import { Controller, Get, Post, Body, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CalendarService } from './calendar.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Calendar')
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Public()
  @Get('auth-url')
  @ApiOperation({ summary: 'Get Google OAuth authorization URL for Calendar & Meet integration' })
  getAuthUrl() {
    try {
      const url = this.calendarService.getAuthUrl();
      return { success: true, url };
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  @Public()
  @Post('oauth-token')
  @ApiOperation({ summary: 'Exchange OAuth authorization code for tokens and save refresh token' })
  async exchangeToken(@Body() body: { code: string }) {
    if (!body?.code) {
      throw new BadRequestException('Authorization code is required');
    }
    try {
      const result = await this.calendarService.exchangeAuthCode(body.code);
      return result;
    } catch (err: any) {
      throw new BadRequestException(err.message || 'Failed to exchange authorization code');
    }
  }

  @Public()
  @Get('status')
  @ApiOperation({ summary: 'Check Google Calendar integration status' })
  getStatus() {
    return {
      connected: this.calendarService.isCalendarConnected(),
    };
  }
}
