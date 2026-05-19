import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from './error-handler.js';
import { routes } from './routes.js';

const app = express();
app.use(routes);
app.use(errorHandler);

describe('GET /health', () => {
  it('returns ok: true', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
