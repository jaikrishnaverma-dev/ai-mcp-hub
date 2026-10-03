/**
 * Structured logger using Pino.
 * 
 * Rules:
 * - Never log tokens, passwords, or item bodies at info level
 * - Request IDs on every contextual log
 * - Use child loggers for module context
 */
import pino from 'pino';

const LOG_LEVEL = process.env['LOG_LEVEL'] || 'debug';
const NODE_ENV = process.env['NODE_ENV'] || 'development';

export const logger = pino({
  level: LOG_LEVEL,
  transport: NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  // Redact sensitive fields
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token', '*.secret'],
    censor: '[REDACTED]',
  },
});

/**
 * Create a child logger with module context.
 * Usage: const log = createModuleLogger('items');
 */
export function createModuleLogger(module: string) {
  return logger.child({ module });
}
