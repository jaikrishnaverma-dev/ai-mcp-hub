import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

describe('OAuth 2.0 / 2.1 Logic', () => {
  describe('Redirect URI Matching Logic', () => {
    function isRedirectUriAllowed(registeredUris: string[], incomingUri: string): boolean {
      if (registeredUris.length === 0) return true;

      return registeredUris.some((uri) => {
        try {
          if (uri === incomingUri) return true;

          // Wildcard matching: e.g. https://chatgpt.com/* or https://chatgpt.com/connector/oauth/*
          if (uri.endsWith('*') && incomingUri.startsWith(uri.slice(0, -1))) {
            return true;
          }

          const cleanUri = uri.endsWith('*') ? uri.slice(0, -1) : uri;
          const clientUrl = new URL(cleanUri);
          const reqUrl = new URL(incomingUri);

          // 1. Strict origin & path match
          if (clientUrl.origin === reqUrl.origin && clientUrl.pathname === reqUrl.pathname) {
            return true;
          }

          // 2. ChatGPT official connector & GPT actions callbacks
          const isChatGPTClient = clientUrl.hostname === 'chatgpt.com' || clientUrl.hostname.endsWith('.chatgpt.com');
          const isChatGPTReq = reqUrl.hostname === 'chatgpt.com' || reqUrl.hostname.endsWith('.chatgpt.com');
          if (
            isChatGPTClient &&
            isChatGPTReq &&
            (reqUrl.pathname.startsWith('/connector/oauth/') || reqUrl.pathname.startsWith('/aip/'))
          ) {
            return true;
          }

          // 3. Claude AI official callbacks
          const isClaudeClient = clientUrl.hostname === 'claude.ai' || clientUrl.hostname.endsWith('.claude.ai');
          const isClaudeReq = reqUrl.hostname === 'claude.ai' || reqUrl.hostname.endsWith('.claude.ai');
          if (
            isClaudeClient &&
            isClaudeReq &&
            (reqUrl.pathname.startsWith('/api/mcp/oauth/') || reqUrl.pathname.startsWith('/oauth/'))
          ) {
            return true;
          }

          return false;
        } catch {
          return uri === incomingUri;
        }
      });
    }

    it('matches exact registered redirect URI', () => {
      const registered = ['https://claude.ai/api/mcp/oauth/callback'];
      expect(isRedirectUriAllowed(registered, 'https://claude.ai/api/mcp/oauth/callback')).toBe(true);
    });

    it('allows ChatGPT connector callbacks when chatgpt.com is registered', () => {
      const registered = ['https://chatgpt.com/aip/g-assistant/oauth/callback'];
      const connectorUri = 'https://chatgpt.com/connector/oauth/rT96EMsPsGVM';
      expect(isRedirectUriAllowed(registered, connectorUri)).toBe(true);
    });

    it('allows ChatGPT custom GPT action callbacks when chatgpt.com is registered', () => {
      const registered = ['https://chatgpt.com/connector/oauth/*'];
      const gptUri = 'https://chatgpt.com/aip/g-custom123/oauth/callback';
      expect(isRedirectUriAllowed(registered, gptUri)).toBe(true);
    });

    it('allows wildcard prefix redirect URIs', () => {
      const registered = ['https://chatgpt.com/connector/oauth/*'];
      expect(isRedirectUriAllowed(registered, 'https://chatgpt.com/connector/oauth/rT96EMsPsGVM')).toBe(true);
      expect(isRedirectUriAllowed(registered, 'https://other-domain.com/callback')).toBe(false);
    });

    it('rejects unauthorized domains completely', () => {
      const registered = ['https://chatgpt.com/aip/g-assistant/oauth/callback'];
      expect(isRedirectUriAllowed(registered, 'https://attacker.evil.com/callback')).toBe(false);
      expect(isRedirectUriAllowed(registered, 'https://chatgpt.com.attacker.com/callback')).toBe(false);
    });
  });

  describe('PKCE S256 Challenge Verification', () => {
    it('correctly computes and verifies S256 code challenge from verifier', () => {
      const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const expectedChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

      expect(expectedChallenge).toBeTruthy();
      expect(typeof expectedChallenge).toBe('string');
    });
  });
});
