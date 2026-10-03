import crypto from 'crypto';
import mongoose from 'mongoose';
import { OAuthClient, OAuthCode, OAuthToken } from './oauth-model.js';
import { User, type UserDocument } from './model.js';
import { Endpoint, type EndpointDocument } from '../endpoints/model.js';
import { ValidationError, UnauthorizedError, NotFoundError } from '../../errors.js';
import { createModuleLogger } from '../../config/index.js';

const log = createModuleLogger('oauth');

export interface CreateClientInput {
  userId: string;
  clientName: string;
  redirectUris?: string[];
  endpointId?: string;
  scopes?: string[];
}

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  responseType: string;
  state?: string;
  scope?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}

export interface ApproveParams {
  userId: string;
  clientId: string;
  redirectUri: string;
  endpointId?: string;
  scopes?: string[];
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}

export interface TokenParams {
  grantType: string;
  clientId?: string;
  clientSecret?: string;
  code?: string;
  redirectUri?: string;
  codeVerifier?: string;
  refreshToken?: string;
}

export class OAuthService {
  /**
   * 1. Create a new OAuth client for ChatGPT, Claude, etc.
   */
  async createClient(input: CreateClientInput) {
    if (!input.clientName || !input.clientName.trim()) {
      throw new ValidationError('Client name is required');
    }

    const clientId = 'client_' + crypto.randomBytes(16).toString('hex');
    const clientSecret = 'sec_' + crypto.randomBytes(32).toString('hex');

    const client = await OAuthClient.create({
      clientId,
      clientSecret,
      clientName: input.clientName.trim(),
      userId: new mongoose.Types.ObjectId(input.userId),
      endpointId: input.endpointId ? new mongoose.Types.ObjectId(input.endpointId) : undefined,
      redirectUris: input.redirectUris || [],
      scopes: input.scopes && input.scopes.length > 0 ? input.scopes : ['read', 'write'],
      isActive: true,
    });

    log.info({ clientId, name: input.clientName }, 'OAuth client created');

    return {
      id: client.id,
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      clientName: client.clientName,
      redirectUris: client.redirectUris,
      endpointId: client.endpointId ? client.endpointId.toString() : null,
      scopes: client.scopes,
      createdAt: client.createdAt,
    };
  }

  /**
   * List OAuth clients for a specific user
   */
  async listClients(userId: string) {
    const clients = await OAuthClient.find({
      userId: new mongoose.Types.ObjectId(userId),
      isActive: true,
    }).sort({ createdAt: -1 });

    return clients.map((c) => ({
      id: c.id,
      clientId: c.clientId,
      clientName: c.clientName,
      redirectUris: c.redirectUris,
      endpointId: c.endpointId ? c.endpointId.toString() : null,
      scopes: c.scopes,
      createdAt: c.createdAt,
    }));
  }

  /**
   * Revoke/Delete an OAuth client
   */
  async revokeClient(userId: string, clientId: string) {
    const client = await OAuthClient.findOneAndUpdate(
      { clientId, userId: new mongoose.Types.ObjectId(userId) },
      { isActive: false },
      { new: true },
    );
    if (!client) {
      throw new NotFoundError('OAuth client not found');
    }
    // Also revoke all tokens issued to this client
    await OAuthToken.deleteMany({ clientId });
    await OAuthCode.deleteMany({ clientId });
    log.info({ clientId }, 'OAuth client revoked');
    return { success: true };
  }

  /**
   * 2. Validate incoming /oauth/authorize request parameters
   */
  async validateAuthorize(params: AuthorizeParams) {
    if (!params.clientId) {
      throw new ValidationError('client_id is required');
    }
    if (!params.redirectUri) {
      throw new ValidationError('redirect_uri is required');
    }
    if (params.responseType && params.responseType !== 'code') {
      throw new ValidationError('Unsupported response_type: only "code" is supported');
    }

    const client = await OAuthClient.findOne({
      clientId: params.clientId,
      isActive: true,
    });

    if (!client) {
      throw new NotFoundError('Invalid or inactive client_id');
    }

    // If client has registered redirect URIs, verify it matches
    if (client.redirectUris.length > 0) {
      const allowed = client.redirectUris.some((uri) => {
        try {
          const clientUrl = new URL(uri);
          const reqUrl = new URL(params.redirectUri);
          return clientUrl.origin === reqUrl.origin && clientUrl.pathname === reqUrl.pathname;
        } catch {
          return uri === params.redirectUri;
        }
      });

      if (!allowed) {
        log.warn({ redirectUri: params.redirectUri, allowed: client.redirectUris }, 'Redirect URI mismatch');
        throw new ValidationError('redirect_uri does not match any registered redirect URIs for this client');
      }
    }

    // Get client owner's endpoints to display in consent screen
    const endpoints = await Endpoint.find({
      ownerId: client.userId,
      status: 'active',
    }).select('id name slug toolAllowlist scopes');

    return {
      client: {
        id: client.id,
        clientId: client.clientId,
        clientName: client.clientName,
        scopes: client.scopes,
        endpointId: client.endpointId ? client.endpointId.toString() : null,
      },
      endpoints: endpoints.map((e) => ({
        id: e.id,
        name: e.name,
        slug: e.slug,
        scopes: e.scopes,
        toolCount: e.toolAllowlist.length,
      })),
    };
  }

  /**
   * 3. Issue Authorization Code upon user approval
   */
  async approveAuthorization(params: ApproveParams) {
    const { client } = await this.validateAuthorize({
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      responseType: 'code',
    });

    const code = 'code_' + crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes TTL

    const chosenEndpointId = params.endpointId || client.endpointId;

    await OAuthCode.create({
      code,
      clientId: params.clientId,
      userId: new mongoose.Types.ObjectId(params.userId),
      endpointId: chosenEndpointId ? new mongoose.Types.ObjectId(chosenEndpointId) : undefined,
      redirectUri: params.redirectUri,
      scopes: params.scopes || client.scopes,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod || 'S256',
      expiresAt,
    });

    log.info({ clientId: params.clientId, userId: params.userId }, 'Issued OAuth authorization code');

    // Build redirection URL with code and state
    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (params.state) {
      redirectUrl.searchParams.set('state', params.state);
    }

    return {
      code,
      redirectUrl: redirectUrl.toString(),
    };
  }

  /**
   * 4. Exchange authorization code for Bearer access token
   */
  async exchangeToken(params: TokenParams) {
    if (params.grantType !== 'authorization_code') {
      throw new ValidationError(`Unsupported grant_type: "${params.grantType}". Only "authorization_code" is supported.`);
    }

    if (!params.code) {
      throw new ValidationError('code parameter is required');
    }

    const authCode = await OAuthCode.findOne({ code: params.code });
    if (!authCode) {
      throw new UnauthorizedError('Invalid or expired authorization code');
    }

    // Code is single-use: delete it immediately
    await OAuthCode.deleteOne({ _id: authCode._id });

    // Validate client
    const client = await OAuthClient.findOne({
      clientId: authCode.clientId,
      isActive: true,
    });
    if (!client) {
      throw new UnauthorizedError('Client is invalid or inactive');
    }

    // If client secret is provided, verify it
    if (params.clientSecret && params.clientSecret !== client.clientSecret) {
      throw new UnauthorizedError('Invalid client_secret');
    }

    // If PKCE was used, verify code_verifier
    if (authCode.codeChallenge) {
      if (!params.codeVerifier) {
        throw new ValidationError('code_verifier is required for PKCE-enabled authorization');
      }

      let computedChallenge = '';
      if (authCode.codeChallengeMethod === 'S256') {
        computedChallenge = crypto
          .createHash('sha256')
          .update(params.codeVerifier)
          .digest('base64url');
      } else {
        computedChallenge = params.codeVerifier;
      }

      if (computedChallenge !== authCode.codeChallenge) {
        throw new UnauthorizedError('Invalid code_verifier for PKCE challenge');
      }
    }

    // Generate Bearer Access Token (30 days TTL)
    const accessToken = 'mcp_' + crypto.randomBytes(32).toString('hex');
    const refreshToken = 'mcpr_' + crypto.randomBytes(32).toString('hex');
    const expiresIn = 30 * 24 * 60 * 60; // 30 days in seconds
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await OAuthToken.create({
      accessToken,
      refreshToken,
      clientId: client.clientId,
      userId: authCode.userId,
      endpointId: authCode.endpointId,
      scopes: authCode.scopes,
      expiresAt,
    });

    log.info({ clientId: client.clientId, userId: authCode.userId }, 'Issued OAuth Bearer access token');

    // Fetch endpoint slug if endpoint is assigned
    let endpointSlug = null;
    if (authCode.endpointId) {
      const ep = await Endpoint.findById(authCode.endpointId);
      if (ep) endpointSlug = ep.slug;
    }

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: authCode.scopes.join(' '),
      endpoint_slug: endpointSlug,
    };
  }

  /**
   * 5. Verify Bearer token on incoming MCP or API requests
   */
  async verifyBearerToken(tokenStr: string): Promise<{
    user: UserDocument;
    endpoint: EndpointDocument | null;
    scopes: string[];
  } | null> {
    if (!tokenStr) return null;

    const tokenDoc = await OAuthToken.findOne({
      accessToken: tokenStr,
      expiresAt: { $gt: new Date() },
    });

    if (!tokenDoc) return null;

    const user = await User.findById(tokenDoc.userId);
    if (!user) return null;

    let endpoint: EndpointDocument | null = null;
    if (tokenDoc.endpointId) {
      endpoint = await Endpoint.findById(tokenDoc.endpointId);
    }

    return {
      user,
      endpoint,
      scopes: tokenDoc.scopes,
    };
  }
}

export const oauthService = new OAuthService();
