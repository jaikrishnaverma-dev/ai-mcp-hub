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

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import models to register them with Mongoose
import './modules/items/model.js';
import './modules/links/model.js';
import './modules/activity/model.js';
import './modules/decisions/model.js';
import './modules/blockers/model.js';
import './modules/endpoints/model.js';
import './modules/auth/model.js';
import './modules/auth/oauth-model.js';
import { oauthRouter } from './modules/auth/oauth-routes.js';

const PORT = parseInt(process.env['PORT'] || '3000', 10);
const HOST = process.env['HOST'] || '0.0.0.0';

async function main() {
  // 1. Connect database
  await connectDatabase();
  logger.info('Database connected');

  // 2. Create Express app
  const app = express();

  // Middleware
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] || '0.1.0',
    });
  });

  // OAuth 2.0 / 2.1 routes (token exchange, consent discovery, clients)
  app.use(oauthRouter);

  // MCP endpoints — scoped by endpoint slug
  app.get('/mcp/:slug', (req, res) => {
    const slug = req.params['slug'];
    res.json({
      status: 'active',
      type: 'mcp-streamable-http',
      endpoint: `/mcp/${slug}`,
      message: 'This is a Streamable HTTP MCP endpoint. Connect via Claude, ChatGPT, or Cursor using POST JSON-RPC 2.0 requests.',
    });
  });
  app.post('/mcp/:slug', handleMcpRequest);
  app.delete('/mcp/:slug', handleMcpDelete);

  // REST API routes for web portal
  app.use('/api', apiRouter);

  // Serve static portal build if present (for single-port deployment on Hostinger / VPS)
  const candidatePortalPaths = [
    process.env['PORTAL_DIST'],
    path.resolve(__dirname, '../../portal/dist'),
    path.resolve(__dirname, '../portal/dist'),
    path.resolve(__dirname, '../../../portal/dist'),
    path.resolve(process.cwd(), 'portal/dist'),
    path.resolve(process.cwd(), 'public'),
    path.resolve(process.cwd(), 'apps/portal/dist'),
  ].filter(Boolean) as string[];

  const activePortalDist = candidatePortalPaths.find((p) => fs.existsSync(p));
  if (activePortalDist) {
    logger.info({ path: activePortalDist }, 'Serving static portal frontend');
    app.use(express.static(activePortalDist));
    app.use((req, res, next) => {
      // API routes and OAuth token exchange are handled by backend handlers
      if (
        req.path.startsWith('/api') ||
        req.path.startsWith('/health') ||
        req.path === '/oauth/token' ||
        req.path.startsWith('/.well-known')
      ) {
        return next();
      }
      // Everything else (including /oauth/authorize, /workflows, /tools, /settings) serves the React SPA
      res.sendFile(path.join(activePortalDist, 'index.html'));
    });
  }

  // 3. Start server
  const server = app.listen(PORT, HOST, () => {
    logger.info({ port: PORT, host: HOST }, 'Assistant server started');
    logger.info('MCP endpoints available at: POST /mcp/:slug');
    if (activePortalDist) {
      logger.info('Portal UI available at: http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORT);
    }
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
