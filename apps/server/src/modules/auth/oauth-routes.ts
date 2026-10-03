import { Router, type Request, type Response, type NextFunction } from 'express';
import { oauthService } from './oauth-service.js';
import { User } from './model.js';
import { ValidationError } from '../../errors.js';
import { createModuleLogger } from '../../config/index.js';

const log = createModuleLogger('oauth-routes');

export const oauthRouter: Router = Router();

/**
 * 1. RFC 8414: OAuth 2.0 Authorization Server Metadata Discovery
 */
oauthRouter.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
  const host = req.get('host') || 'localhost:3000';
  const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
  const baseUrl = `${proto}://${host}`;

  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256', 'plain'],
    scopes_supported: ['read', 'write'],
  });
});

/**
 * 2. OAuth Token Exchange Endpoint (RFC 6749)
 * Used by Claude, ChatGPT Custom Actions, etc.
 * Supports application/x-www-form-urlencoded and application/json, and HTTP Basic Auth.
 */
oauthRouter.post('/oauth/token', async (req: Request, res: Response) => {
  try {
    let clientId = req.body['client_id'] as string | undefined;
    let clientSecret = req.body['client_secret'] as string | undefined;

    // Check HTTP Basic Auth (Authorization: Basic base64(client_id:client_secret))
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Basic ')) {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
      const [u, p] = decoded.split(':');
      if (u) clientId = u;
      if (p) clientSecret = p;
    }

    const grantType = (req.body['grant_type'] as string) || 'authorization_code';
    const code = req.body['code'] as string | undefined;
    const redirectUri = req.body['redirect_uri'] as string | undefined;
    const codeVerifier = req.body['code_verifier'] as string | undefined;

    const tokenResponse = await oauthService.exchangeToken({
      grantType,
      clientId,
      clientSecret,
      code,
      redirectUri,
      codeVerifier,
    });

    res.json(tokenResponse);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Token exchange failed';
    log.error({ err }, 'OAuth token exchange error');
    res.status(400).json({
      error: 'invalid_grant',
      error_description: errorMsg,
    });
  }
});

/**
 * 3. Client Validation for OAuth Consent Screen (Frontend UI)
 */
oauthRouter.get('/api/oauth/client-info', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clientId = req.query['client_id'] as string;
    const redirectUri = req.query['redirect_uri'] as string;
    const responseType = (req.query['response_type'] as string) || 'code';
    const state = req.query['state'] as string | undefined;
    const scope = req.query['scope'] as string | undefined;

    const info = await oauthService.validateAuthorize({
      clientId,
      redirectUri,
      responseType,
      state,
      scope,
    });

    res.json({
      success: true,
      ...info,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 4. User Consent Approval: Issues Authorization Code and Returns Redirect URL
 */
oauthRouter.post('/api/oauth/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      clientId,
      redirectUri,
      endpointId,
      scopes,
      state,
      codeChallenge,
      codeChallengeMethod,
    } = req.body;

    if (!clientId || !redirectUri) {
      throw new ValidationError('clientId and redirectUri are required');
    }

    // Resolve user (from x-user-id header or first user)
    const requestedUserId = req.headers['x-user-id'] as string | undefined;
    let user = null;
    if (requestedUserId && requestedUserId !== 'none') {
      user = await User.findById(requestedUserId);
    }
    if (!user) {
      user = await User.findOne({});
    }

    if (!user) {
      res.status(401).json({ error: 'User must be authenticated to authorize applications' });
      return;
    }

    const result = await oauthService.approveAuthorization({
      userId: user.id,
      clientId,
      redirectUri,
      endpointId,
      scopes,
      state,
      codeChallenge,
      codeChallengeMethod,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 5. Manage OAuth Clients (Portal UI)
 */
oauthRouter.get('/api/oauth-clients', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestedUserId = req.headers['x-user-id'] as string | undefined;
    let user = null;
    if (requestedUserId && requestedUserId !== 'none') {
      user = await User.findById(requestedUserId);
    }
    if (!user) {
      user = await User.findOne({});
    }

    if (!user) {
      res.json({ clients: [] });
      return;
    }

    const clients = await oauthService.listClients(user.id);
    res.json({ clients });
  } catch (err) {
    next(err);
  }
});

oauthRouter.post('/api/oauth-clients', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestedUserId = req.headers['x-user-id'] as string | undefined;
    let user = null;
    if (requestedUserId && requestedUserId !== 'none') {
      user = await User.findById(requestedUserId);
    }
    if (!user) {
      user = await User.findOne({});
    }

    if (!user) {
      res.status(401).json({ error: 'User must be authenticated to create OAuth clients' });
      return;
    }

    const { clientName, redirectUris, endpointId, scopes } = req.body;

    const client = await oauthService.createClient({
      userId: user.id,
      clientName,
      redirectUris,
      endpointId,
      scopes,
    });

    res.status(201).json({
      success: true,
      client,
    });
  } catch (err) {
    next(err);
  }
});

oauthRouter.delete('/api/oauth-clients/:clientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestedUserId = req.headers['x-user-id'] as string | undefined;
    let user = null;
    if (requestedUserId && requestedUserId !== 'none') {
      user = await User.findById(requestedUserId);
    }
    if (!user) {
      user = await User.findOne({});
    }

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const clientId = String(req.params['clientId']);
    await oauthService.revokeClient(user.id, clientId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
