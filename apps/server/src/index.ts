/**
 * Server entry point.
 *
 * Boots: env → database → Express app → MCP transport → listen.
 * Graceful shutdown on SIGTERM/SIGINT.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { connectDatabase, disconnectDatabase, logger } from './config/index.js';
import { handleMcpRequest, handleMcpDelete } from './mcp/transport.js';
import { apiRouter } from './api/routes.js';

// Import models to register them with Mongoose
import './modules/items/model.js';
import './modules/links/model.js';
import './modules/activity/model.js';
import './modules/decisions/model.js';
import './modules/blockers/model.js';
import './modules/endpoints/model.js';
import './modules/auth/model.js';

const PORT = parseInt(process.env['PORT'] || '3000', 10);
const HOST = process.env['HOST'] || '0.0.0.0';

async function main() {
  // 1. Connect database
  await connectDatabase();
  logger.info('Database connected');

  // 2. Create Express app
  const app = express();

  // Middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] || '0.1.0',
    });
  });

  // MCP endpoints — scoped by endpoint slug
  app.post('/mcp/:slug', handleMcpRequest);
  app.delete('/mcp/:slug', handleMcpDelete);

  // REST API routes for web portal
  app.use('/api', apiRouter);

  // 3. Start server
  const server = app.listen(PORT, HOST, () => {
    logger.info({ port: PORT, host: HOST }, 'Assistant server started');
    logger.info('MCP endpoints available at: POST /mcp/:slug');
  });

  // 4. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down gracefully...');
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Server stopped');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
