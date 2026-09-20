import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { FirebaseService } from '../firebase/firebase.service';
import { BookingEntity } from '../common/types';
import * as nodemailer from 'nodemailer';

jest.mock('nodemailer');

describe('EmailService (SMTP)', () => {
  let service: EmailService;
  let mockFirebaseService: any;
  let mockConfigService: any;
  let mockTransporter: any;

  const sampleBooking: BookingEntity = {
    id: 'b1',
    bookingNumber: 'BK-2026-00001',
    serviceId: 's1',
    serviceName: 'Architecture Review',
    customer: {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+91 98765 43210',
      agenda: 'Discuss microservice migration',
    },
    schedule: {
      date: '2026-10-15',
      startTime: '10:00',
      endTime: '11:00',
      timezone: 'Asia/Kolkata',
    },
    amount: 15000,
    currency: 'INR',
    status: 'confirmed',
    paymentStatus: 'paid',
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
    confirmationEmailSent: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'msg-123' }),
      verify: jest.fn().mockResolvedValue(true),
    };

    (nodemailer.createTransport as jest.Mock).mockReturnValue(mockTransporter);

    mockFirebaseService = {
      setDoc: jest.fn().mockResolvedValue(undefined),
    };
  });

  describe('When SMTP credentials are valid and live', () => {
    beforeEach(async () => {
      mockConfigService = {
        get: jest.fn((key: string) => {
          switch (key) {
            case 'SMTP_HOST':
              return 'smtp.sendgrid.net';
            case 'SMTP_PORT':
              return '587';
            case 'SMTP_SECURE':
              return 'false';
            case 'SMTP_USER':
              return 'apikey';
            case 'SMTP_PASS':
              return 'SG.secret_key';
            case 'SMTP_FROM':
              return '"Consulting" <advisory@company.com>';
            default:
              return undefined;
          }
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: FirebaseService, useValue: mockFirebaseService },
        ],
      }).compile();

      service = module.get<EmailService>(EmailService);
    });

    it('should initialize nodemailer transport with the provided SMTP config', () => {
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.sendgrid.net',
          port: 587,
          secure: false,
          auth: {
            user: 'apikey',
            pass: 'SG.secret_key',
          },
        }),
      );
    });

    it('should send booking confirmation email via SMTP', async () => {
      const result = await service.sendBookingConfirmation(sampleBooking);

      expect(result).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'john@example.com',
          from: '"Consulting" <advisory@company.com>',
          subject: expect.stringContaining('BK-2026-00001'),
          html: expect.stringContaining('Architecture Review'),
          text: expect.stringContaining('BK-2026-00001'),
        }),
      );
      expect(mockFirebaseService.setDoc).toHaveBeenCalledWith(
        'email_logs',
        expect.any(String),
        expect.objectContaining({
          status: 'sent',
          type: 'confirmation',
        }),
      );
    });

    it('should send cancellation email via SMTP', async () => {
      const result = await service.sendCancellationEmail(sampleBooking, 'Emergency rescheduling');

      expect(result).toBe(true);
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'john@example.com',
          subject: expect.stringContaining('Consultation Cancelled'),
          html: expect.stringContaining('Emergency rescheduling'),
          text: expect.stringContaining('Emergency rescheduling'),
        }),
      );
      expect(mockFirebaseService.setDoc).toHaveBeenCalledWith(
        'email_logs',
        expect.any(String),
        expect.objectContaining({
          status: 'sent',
          type: 'cancellation',
        }),
      );
    });

    it('should handle SMTP transmission failure gracefully', async () => {
      mockTransporter.sendMail.mockRejectedValueOnce(new Error('SMTP Connection timeout'));

      const result = await service.sendBookingConfirmation(sampleBooking);

      expect(result).toBe(false);
      expect(mockFirebaseService.setDoc).toHaveBeenCalledWith(
        'email_logs',
        expect.any(String),
        expect.objectContaining({
          status: 'failed',
          type: 'confirmation',
        }),
      );
    });
  });

  describe('When SMTP credentials are not configured or placeholder (Mock Mode)', () => {
    beforeEach(async () => {
      mockConfigService = {
        get: jest.fn(() => undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: FirebaseService, useValue: mockFirebaseService },
        ],
      }).compile();

      service = module.get<EmailService>(EmailService);
    });

    it('should not initialize a live nodemailer transport', () => {
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });

    it('should log mock confirmation email to Firestore without throwing', async () => {
      const result = await service.sendBookingConfirmation(sampleBooking);

      expect(result).toBe(true);
      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
      expect(mockFirebaseService.setDoc).toHaveBeenCalledWith(
        'email_logs',
        expect.any(String),
        expect.objectContaining({
          status: 'mocked',
          type: 'confirmation',
          to: 'john@example.com',
        }),
      );
    });
  });
});
