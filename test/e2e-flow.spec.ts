import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

jest.setTimeout(30000);

describe('End-to-End Consulting Platform Flow (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. GET /services should return active consulting services', async () => {
    const res = await request(app.getHttpServer()).get('/services').expect(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const service = res.body.data[0];
    expect(service.price).toBeGreaterThan(0);
    expect(service.currency).toBe('INR');
  });

  it('2. GET /availability/slots/:date should return computed slots', async () => {
    const res = await request(app.getHttpServer())
      .get('/availability/slots/2026-09-22?serviceId=svc_60min&timezone=Asia/Kolkata')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.isBlocked).toBe(false);
    expect(Array.isArray(res.body.data.slots)).toBe(true);
    expect(res.body.data.slots.length).toBeGreaterThan(0);
    expect(res.body.data.slots[0].startTime).toBe('09:00');
  });

  let createdBookingId = '';
  let createdBookingNumber = '';

  it('3. POST /bookings should reserve slot and create pending booking', async () => {
    const res = await request(app.getHttpServer())
      .post('/bookings')
      .send({
        serviceId: 'svc_60min',
        customer: {
          name: 'E2E Client',
          email: 'e2e@consulting.com',
          phone: '+919123456780',
          agenda: 'End-to-end integration test scenario verifying slot reservation.',
        },
        schedule: {
          date: '2026-09-22',
          startTime: '09:00',
          timezone: 'Asia/Kolkata',
        },
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.bookingNumber).toMatch(/^BK-\d{4}-\d{5}$/);
    expect(res.body.data.status).toBe('pending_payment');
    expect(res.body.data.amount).toBe(2500);

    createdBookingId = res.body.data.id;
    createdBookingNumber = res.body.data.bookingNumber;
  });

  it('4. POST /bookings should prevent double-booking on the exact same reserved slot', async () => {
    const res = await request(app.getHttpServer())
      .post('/bookings')
      .send({
        serviceId: 'svc_60min',
        customer: {
          name: 'Conflict Client',
          email: 'conflict@consulting.com',
          phone: '+919123456781',
          agenda: 'Attempting to reserve the exact same 09:00 slot on 2026-09-22.',
        },
        schedule: {
          date: '2026-09-22',
          startTime: '09:00',
          timezone: 'Asia/Kolkata',
        },
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('SLOT_UNAVAILABLE');
  });

  it('5. POST /payments/checkout should initiate Razorpay order', async () => {
    const res = await request(app.getHttpServer())
      .post('/payments/checkout')
      .send({ bookingId: createdBookingId })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.orderId).toBeDefined();
    expect(res.body.data.amount).toBe(250000); // 2500 INR in paise
    expect(res.body.data.currency).toBe('INR');
  });

  it('6. POST /webhooks/razorpay/simulate-success should confirm booking, create Google Calendar & Meet link', async () => {
    const res = await request(app.getHttpServer())
      .post(`/webhooks/razorpay/simulate-success/${createdBookingId}`)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('confirmed');
    expect(res.body.data.paymentStatus).toBe('paid');
    expect(res.body.data.googleCalendarEventId).toBeDefined();
    expect(res.body.data.meetingUrl).toContain('meet.google.com');
  });

  it('7. GET /admin/dashboard should reflect revenue and confirmed bookings', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/dashboard')
      .set('Authorization', 'Bearer dev-admin-token')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.metrics.totalRevenue).toBeGreaterThanOrEqual(2500);
    expect(res.body.data.metrics.totalBookings).toBeGreaterThanOrEqual(1);
  });
});
