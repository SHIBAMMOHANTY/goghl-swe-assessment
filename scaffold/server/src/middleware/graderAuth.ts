import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { config } from '../config.js';

function tokensMatch(provided: string | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Protects grader-only endpoints using the `x-grader-token` header
 * compared against `GRADER_TOKEN`.
 */
export const requireGraderToken: RequestHandler = (req, res, next) => {
  const provided = req.header('x-grader-token');
  const expected = process.env.GRADER_TOKEN ?? config.graderToken;

  if (!tokensMatch(provided, expected)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
};
