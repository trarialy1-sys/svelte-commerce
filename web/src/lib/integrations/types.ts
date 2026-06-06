export interface ShopifyCreds {
  shopDomain: string;
  adminAccessToken: string;
  apiVersion: string;
}

export interface OzonCreds {
  customerId: string;
  apiKey: string;
}

export type AnyCreds = ShopifyCreds | OzonCreds;

export type IntegrationStatus = "connected" | "unverified" | "disconnected";

/** Result returned to the client — never contains secrets. */
export interface VaultResult {
  ok: boolean;
  status: IntegrationStatus;
  message: string;
}

/** Safe projection sent to the browser (no credentialsEnc, no secrets). */
export interface SafeIntegration {
  provider: string;
  status: string;
  meta: Record<string, unknown> | null;
  connectedAt: string | null;
}
