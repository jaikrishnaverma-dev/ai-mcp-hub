/**
 * Database connection configuration.
 *
 * Uses MongoDB replica set (required for transactions).
 * Connection is shared across all modules.
 */
import mongoose from 'mongoose';
import { logger } from './logger.js';

const MONGODB_URI = process.env['MONGODB_URI'] || 'mongodb://localhost:27017/assistant?replicaSet=rs0';

export async function connectDatabase(): Promise<typeof mongoose> {
  try {
    const conn = await mongoose.connect(MONGODB_URI, {
      // Replica set for transaction support
      // Connection pooling defaults are fine for a solo dev
    });

    logger.info({ uri: MONGODB_URI.replace(/\/\/.*@/, '//<redacted>@') }, 'MongoDB connected');

    mongoose.connection.on('error', (err) => {
      logger.error({ err }, 'MongoDB connection error');
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    return conn;
  } catch (err) {
    logger.fatal({ err }, 'Failed to connect to MongoDB');
    process.exit(1);
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected gracefully');
}
