import { beforeAll, afterAll, describe, expect, it } from 'bun:test';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { THROTTLER_OPTIONS } from '@nestjs/throttler/dist/throttler.constants';
import { ThrottlerStorage } from '@nestjs/throttler/dist/throttler-storage.interface';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { configureSafeConsole } from '../../src/common/utils/console-sanitizer';

const API_KEY = 'test-internal-key';
const HEARTBEAT_ENDPOINT = '/api/v1/chatbot/realtime/heartbeat';

describe('Security e2e', () => {
  let app: INestApplication;
  let server: any;
let throttlerStorage: ThrottlerStorageService;

  beforeAll(async () => {
    process.env.INTERNAL_API_KEY = API_KEY;
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';
    process.env.LOG_VERBOSE = 'false';

    const storageOverride = new ThrottlerStorageService();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(THROTTLER_OPTIONS)
      .useValue([{ ttl: 1000, limit: 2 }])
      .overrideProvider(ThrottlerStorage)
      .useValue(storageOverride)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    server = app.getHttpServer();
    throttlerStorage = storageOverride;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rejects requests without internal key', async () => {
    await request(server).get(HEARTBEAT_ENDPOINT).expect(401);
  });

  it('allows requests with valid internal key', async () => {
    const response = await request(server)
      .get(HEARTBEAT_ENDPOINT)
      .set('x-internal-key', API_KEY)
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'healthy',
      service: 'realtime-control',
    });
  });

  it('enforces throttling limits', async () => {
    throttlerStorage.storage.clear();
    const agent = request(server);

    await agent.get(HEARTBEAT_ENDPOINT).set('x-internal-key', API_KEY).expect(200);
    await agent.get(HEARTBEAT_ENDPOINT).set('x-internal-key', API_KEY).expect(200);
    await agent.get(HEARTBEAT_ENDPOINT).set('x-internal-key', API_KEY).expect(429);
  });
});

describe('Logging sanitization', () => {
  it('redacts sensitive tokens before logging', () => {
    const nativeLog = console.log;
    const nativeWarn = console.warn;
    const nativeError = console.error;

    const captured: string[] = [];

    console.log = () => {
      /* noop stub */
    };
    process.env.LOG_VERBOSE = 'true';

    configureSafeConsole({
      force: true,
      sink: (_level, payload) => {
        captured.push(payload.join(' '));
      },
    });

    console.log('Token sk-super-secret-12345 for thread thread_abcd1234');

    console.log = nativeLog;
    console.warn = nativeWarn;
    console.error = nativeError;

    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]).not.toContain('sk-super-secret-12345');
    expect(captured[0]).toContain('[REDACTED]');
  });
});

