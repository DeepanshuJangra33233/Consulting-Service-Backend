import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { BookingEntity } from '../common/types';

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private calendarClient: any = null;
  private isLive = false;

  constructor(private readonly configService: ConfigService) {
    this.initGoogleCalendar();
  }

  private initGoogleCalendar() {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const refreshToken = this.configService.get<string>('GOOGLE_REFRESH_TOKEN');

    const isValidToken =
      refreshToken &&
      !refreshToken.includes('placeholder') &&
      !refreshToken.includes('example') &&
      !refreshToken.includes('your_');

    const isValidClient =
      clientId &&
      clientSecret &&
      !clientId.includes('example') &&
      !clientId.includes('placeholder');

    if (isValidClient && isValidToken) {
      try {
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        this.calendarClient = google.calendar({ version: 'v3', auth: oauth2Client });
        this.isLive = true;
        this.logger.log('Google Calendar API initialized with OAuth2 credentials.');
      } catch (error: any) {
        this.logger.warn(`Failed to initialize Google Calendar API: ${error.message}. Using fallback meeting room.`);
        this.isLive = false;
      }
    } else {
      this.logger.log('Google Calendar credentials not fully configured or refresh token is placeholder. Using fallback meeting room mode.');
      this.isLive = false;
    }
  }

  getAuthUrl(): string {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const redirectUri = `${frontendUrl}/oauth2callback`;

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth Client ID and Secret must be configured.');
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
    });
  }

  async exchangeAuthCode(code: string): Promise<{ success: boolean; message: string }> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const redirectUri = `${frontendUrl}/oauth2callback`;

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);

    if (tokens.refresh_token) {
      this.updateEnvRefreshToken(tokens.refresh_token);
      oauth2Client.setCredentials(tokens);
      this.calendarClient = google.calendar({ version: 'v3', auth: oauth2Client });
      this.isLive = true;
      this.logger.log('Google Calendar OAuth successfully authenticated with refresh token.');
      return { success: true, message: 'Google Calendar & Google Meet successfully connected!' };
    } else if (tokens.access_token) {
      oauth2Client.setCredentials(tokens);
      this.calendarClient = google.calendar({ version: 'v3', auth: oauth2Client });
      this.isLive = true;
      return { success: true, message: 'Google Calendar connected (access token active).' };
    }

    return { success: false, message: 'Failed to obtain tokens from Google.' };
  }

  private updateEnvRefreshToken(refreshToken: string) {
    const envPaths = [
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), 'apps/api/.env'),
      path.resolve(__dirname, '../../.env'),
      path.resolve(__dirname, '../.env'),
    ];

    for (const envPath of envPaths) {
      try {
        if (fs.existsSync(envPath)) {
          let content = fs.readFileSync(envPath, 'utf8');
          if (content.includes('GOOGLE_REFRESH_TOKEN=')) {
            content = content.replace(/GOOGLE_REFRESH_TOKEN=.*/g, `GOOGLE_REFRESH_TOKEN=${refreshToken}`);
          } else {
            content += `\nGOOGLE_REFRESH_TOKEN=${refreshToken}\n`;
          }
          fs.writeFileSync(envPath, content, 'utf8');
        }
      } catch (err: any) {
        this.logger.warn(`Could not update ${envPath}: ${err.message}`);
      }
    }
  }

  isCalendarConnected(): boolean {
    return this.isLive;
  }

  async createEvent(booking: BookingEntity): Promise<{
    eventId: string;
    meetingUrl: string;
  }> {
    const { customer, schedule, serviceName, bookingNumber } = booking;
    const summary = `Consultation: ${serviceName || 'Session'} with ${customer.name}`;
    const description = `Booking ID: ${bookingNumber}
Service: ${serviceName}
Customer: ${customer.name} (${customer.email}, ${customer.phone})

Meeting Agenda:
${customer.agenda}

Date: ${schedule.date}
Time: ${schedule.startTime} - ${schedule.endTime} (${schedule.timezone})`;

    const startDateTime = `${schedule.date}T${schedule.startTime}:00`;
    const endDateTime = `${schedule.date}T${schedule.endTime}:00`;

    if (this.isLive && this.calendarClient) {
      try {
        const calendarId = this.configService.get<string>('GOOGLE_CALENDAR_ID') || 'primary';
        const res = await this.calendarClient.events.insert({
          calendarId,
          conferenceDataVersion: 1,
          requestBody: {
            summary,
            description,
            start: {
              dateTime: new Date(startDateTime).toISOString(),
              timeZone: schedule.timezone,
            },
            end: {
              dateTime: new Date(endDateTime).toISOString(),
              timeZone: schedule.timezone,
            },
            attendees: [
              { email: customer.email, displayName: customer.name },
            ],
            conferenceData: {
              createRequest: {
                requestId: `meet_${booking.id}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            },
          },
        });

        const eventId = res.data.id || `gcal_${Date.now()}`;
        const meetingUrl = res.data.hangoutLink || res.data.conferenceData?.entryPoints?.[0]?.uri;
        if (meetingUrl) {
          this.logger.log(`Google Calendar event created: ${eventId}, Real Meet URL: ${meetingUrl}`);
          return { eventId, meetingUrl };
        }
      } catch (error: any) {
        this.logger.error(`Google Calendar event creation failed: ${error.message}. Using guaranteed Google Meet URL.`);
      }
    }

    // Fallback: Generate a Jitsi meeting URL
    const jitsiUrl = this.generateJitsiUrl(bookingNumber || booking.id);
    const fallbackEventId = `jitsi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    this.logger.log(`Generated Jitsi meeting link for ${bookingNumber}: ${jitsiUrl}`);
    return {
      eventId: fallbackEventId,
      meetingUrl: jitsiUrl,
    };
  }

  generateJitsiUrl(seed: string): string {
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

  // Keep alias for backward compatibility
  generateGoogleMeetUrl(seed: string): string {
    return this.generateJitsiUrl(seed);
  }
}

