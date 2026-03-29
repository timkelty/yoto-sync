import type pino from "pino";
import { TokenStore, type TokenData } from "./token-store.js";

const AUTH_DOMAIN = "login.yotoplay.com";
const AUDIENCE = "https://api.yotoplay.com";

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Implements OAuth2 Device Code flow for headless/CLI authentication
 * against the Yoto auth endpoint (Auth0-based).
 */
export class DeviceCodeAuth {
  constructor(
    private readonly clientId: string,
    private readonly tokenStore: TokenStore,
    private readonly logger: pino.Logger,
  ) {}

  /**
   * Get a valid access token. Attempts:
   * 1. Load from store (if not expired)
   * 2. Refresh using stored refresh_token
   * 3. Run interactive device code flow
   */
  async getAccessToken(): Promise<string> {
    const stored = await this.tokenStore.getToken();

    if (stored && !this.tokenStore.isExpired(stored)) {
      this.logger.debug("Using cached access token");
      return stored.accessToken;
    }

    if (stored?.refreshToken) {
      this.logger.info("Access token expired, attempting refresh");
      try {
        const refreshed = await this.refreshToken(stored.refreshToken);
        await this.tokenStore.saveToken(refreshed);
        return refreshed.accessToken;
      } catch (err) {
        this.logger.warn(
          { err },
          "Token refresh failed, falling back to device code flow",
        );
      }
    }

    this.logger.info("Starting device code authentication flow");
    const tokenData = await this.runDeviceCodeFlow();
    await this.tokenStore.saveToken(tokenData);
    return tokenData.accessToken;
  }

  /**
   * Step 1: Request a device code from the auth server.
   */
  private async requestDeviceCode(): Promise<DeviceCodeResponse> {
    const res = await fetch(`https://${AUTH_DOMAIN}/oauth/device/code`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        scope: "profile offline_access",
        audience: AUDIENCE,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Device code request failed (${res.status}): ${body}`);
    }

    return (await res.json()) as DeviceCodeResponse;
  }

  /**
   * Step 2: Poll for token after user authorizes.
   */
  private async pollForToken(
    deviceCode: string,
    interval: number,
    expiresIn: number,
  ): Promise<TokenResponse> {
    const deadline = Date.now() + expiresIn * 1000;
    let pollInterval = interval * 1000;

    while (Date.now() < deadline) {
      await this.sleep(pollInterval);

      const res = await fetch(`https://${AUTH_DOMAIN}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: deviceCode,
          client_id: this.clientId,
        }),
      });

      if (res.ok) {
        return (await res.json()) as TokenResponse;
      }

      const body = (await res.json()) as { error: string };

      if (body.error === "authorization_pending") {
        continue;
      }

      if (body.error === "slow_down") {
        pollInterval += 5000;
        this.logger.debug(
          { pollInterval },
          "Received slow_down, increasing poll interval",
        );
        continue;
      }

      throw new Error(`Token polling failed: ${body.error}`);
    }

    throw new Error("Device code flow timed out — user did not authorize");
  }

  /**
   * Run the full interactive device code flow.
   */
  private async runDeviceCodeFlow(): Promise<TokenData> {
    const deviceCode = await this.requestDeviceCode();

    // Print instructions for the user
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║         Yoto Authentication Required         ║");
    console.log("╠══════════════════════════════════════════════╣");
    console.log(`║  Visit: ${deviceCode.verification_uri_complete}`);
    console.log(`║  Code:  ${deviceCode.user_code}`);
    console.log("╚══════════════════════════════════════════════╝\n");

    this.logger.info(
      { verification_uri: deviceCode.verification_uri_complete },
      "Waiting for user to authorize...",
    );

    const tokenResponse = await this.pollForToken(
      deviceCode.device_code,
      deviceCode.interval,
      deviceCode.expires_in,
    );

    this.logger.info("Authentication successful");

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: new Date(
        Date.now() + tokenResponse.expires_in * 1000,
      ).toISOString(),
    };
  }

  /**
   * Refresh an expired access token.
   */
  private async refreshToken(refreshToken: string): Promise<TokenData> {
    const res = await fetch(`https://${AUTH_DOMAIN}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.clientId,
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Token refresh failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as TokenResponse;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
