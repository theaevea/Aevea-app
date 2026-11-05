import { randomBytes } from 'node:crypto';

export interface Config {
  jwtSecret: string;
  /** Lifetime of user/device JWTs in seconds. */
  jwtTtlS: number;
  /** Shared secret for admin/factory endpoints (x-admin-key header). */
  adminKey: string;
  /** Auth stub: POST /v1/auth/token mints a user token for any email. NEVER enable in production. */
  authStub: boolean;
  publicBaseUrl: string;
  /** Link checks for commands every ~80 s (LTE-M eDRX). Used to document and to report expected delivery. */
  edrxExpectedS: number;
  commandTtlS: { lost_mode: number; locate_now: number; recall: number };
  rateLimit: { globalPerMin: number; authPerMin: number; contactPerHour: number; contactPerSlugPerHour: number; challengePerMin: number };
  trustProxy: boolean;
  /** Optional PEM public key (P-256) to verify firmware signatures at upload. */
  fwSigningPublicKeyPem?: string;
  /** NTAG 424 DNA SDMMetaReadKey (AES-128, hex). Dev default is all zeros. */
  sdmMetaReadKeyHex: string;
  sdmMacInputMode: 'from-picc-param' | 'full-url';
  app: { iosTeamId: string; iosBundleId: string; iosClipBundleId: string; androidPackage: string; androidSha256: string[] };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, overrides: Partial<Config> = {}): Config {
  const cfg: Config = {
    jwtSecret: env.JWT_SECRET ?? randomBytes(32).toString('hex'),
    jwtTtlS: Number(env.JWT_TTL_S ?? 3600),
    adminKey: env.ADMIN_KEY ?? 'dev-admin-key',
    authStub: (env.AUTH_STUB ?? 'true') === 'true',
    publicBaseUrl: env.PUBLIC_BASE_URL ?? 'https://pet.theaevea.com',
    edrxExpectedS: 80,
    commandTtlS: { lost_mode: 1800, locate_now: 300, recall: 90 },
    rateLimit: { globalPerMin: 300, authPerMin: 10, contactPerHour: 5, contactPerSlugPerHour: 10, challengePerMin: 20 },
    trustProxy: env.TRUST_PROXY === 'true',
    fwSigningPublicKeyPem: env.FW_SIGNING_PUBLIC_KEY_PEM,
    sdmMetaReadKeyHex: env.SDM_META_READ_KEY ?? '00000000000000000000000000000000',
    sdmMacInputMode: (env.SDM_MAC_INPUT_MODE as Config['sdmMacInputMode']) ?? 'from-picc-param',
    app: {
      iosTeamId: env.IOS_TEAM_ID ?? 'TEAMID_PLACEHOLDER',
      iosBundleId: env.IOS_BUNDLE_ID ?? 'com.aevea.app',
      iosClipBundleId: env.IOS_CLIP_BUNDLE_ID ?? 'com.aevea.app.Clip',
      androidPackage: env.ANDROID_PACKAGE ?? 'com.aevea.app',
      androidSha256: (env.ANDROID_SHA256 ?? 'SHA256_FINGERPRINT_PLACEHOLDER').split(','),
    },
  };
  return { ...cfg, ...overrides };
}
