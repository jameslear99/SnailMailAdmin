/** Client-safe types for Lob API credential status (no secret values). */

export type LobCredentialKeyStatus = {
  configured: boolean;
  masked?: string;
  source: "firestore" | "env" | "none";
};

export type LobCredentialsPublicView = {
  test: { secretKey: LobCredentialKeyStatus; publishableKey: LobCredentialKeyStatus };
  live: { secretKey: LobCredentialKeyStatus; publishableKey: LobCredentialKeyStatus };
  storageReady: boolean;
  firestorePath: string;
};

export type LobCredentialsDraft = {
  testSecretKey: string;
  testPublishableKey: string;
  liveSecretKey: string;
  livePublishableKey: string;
};

export type LobCredentialsUpdateBody = {
  testSecretKey?: string;
  testPublishableKey?: string;
  liveSecretKey?: string;
  livePublishableKey?: string;
  clearTest?: boolean;
  clearLive?: boolean;
};

export const EMPTY_CREDENTIALS_DRAFT: LobCredentialsDraft = {
  testSecretKey: "",
  testPublishableKey: "",
  liveSecretKey: "",
  livePublishableKey: "",
};
