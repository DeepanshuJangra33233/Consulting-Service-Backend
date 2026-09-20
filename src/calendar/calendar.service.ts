import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
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

    if (
      clientId &&
      clientSecret &&
      refreshToken &&
      !clientId.includes('example') &&
      !clientId.includes('placeholder')
    ) {
      try {
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        this.calendarClient = google.calendar({ version: 'v3', auth: oauth2Client });
        this.isLive = true;
        this.logger.log('Google Calendar API initialized with OAuth2 credentials.');
      } catch (error) {
        this.logger.warn(`Failed to initialize Google Calendar API: ${error.message}. Using dev fallback.`);
        this.isLive = false;
      }
    } else {
      this.logger.log('Google Calendar credentials not configured. Running in mock/dev calendar mode.');
      this.isLive = false;
    }
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
        const meetingUrl = res.data.hangoutLink || res.data.conferenceData?.entryPoints?.[0]?.uri || `https://meet.google.com/agt-${Date.now().toString(36).slice(-4)}`;
        this.logger.log(`Google Calendar event created: ${eventId}, Meet URL: ${meetingUrl}`);
        return { eventId, meetingUrl };
      } catch (error) {
        this.logger.error(`Failed to create Google Calendar event: ${error.message}`, error.stack);
      }
    }

    // Dev mode / Mock calendar event & Meet URL
    const sanitizedCode = bookingNumber.toLowerCase().replace(/[^a-z0-9]/g, '').slice(-9);
    const mockMeetId = `${sanitizedCode.slice(0, 3)}-${sanitizedCode.slice(3, 7)}-${sanitizedCode.slice(7) || 'meet'}`;
    const mockMeetUrl = `https://meet.google.com/${mockMeetId}`;
    const mockEventId = `mock_event_${Date.now()}`;

    this.logger.log(`[Dev Mode] Generated mock calendar event ${mockEventId} with Meet link: ${mockMeetUrl}`);
    return {
      eventId: mockEventId,
      meetingUrl: mockMeetUrl,
    };
  }
}
