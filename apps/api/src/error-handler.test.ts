import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { asyncHandler, errorHandler, HttpError } from './error-handler.js';

describe('HttpError', () => {
  it('carries an HTTP status code', () => {
    const err = new HttpError(404, 'Response not found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Response not found');
  });
});

describe('asyncHandler', () => {
  it('forwards rejected promises to next', async () => {
    const error = new Error('boom');
    const handler = asyncHandler(async () => {
      throw error;
    });
    const next = vi.fn();

    await handler({} as Request, {} as Response, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('errorHandler', () => {
  it('maps HttpError to JSON with the correct status', () => {
    const res = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    errorHandler(new HttpError(404, 'Response not found'), {} as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Response not found' });
  });

  it('defaults unknown errors to 500', () => {
    const res = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    errorHandler(new Error('database unavailable'), {} as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'database unavailable' });
  });
});
