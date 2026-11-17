export type Provider = {
  id: string;
  name: string;
  /** The full endpoint. */
  url: string;
  /** The pinned default model. */
  model: string;
  /** The environment variable this kit reads the key from. */
  keyVariable: string;
  requestTokenLimit: number;
};

export const PROVIDERS = {
  subq: {
    id: 'subq',
    name: 'SubQ Snap',
    url: 'https://api.subq.ai/v1/systemone',
    model: 'subq-snap-1.2',
    keyVariable: 'SUBQ_API_KEY',
    requestTokenLimit: 384_000,
  },
  jev: {
    id: 'jev',
    name: 'TypeSafe Jev',
    url: 'https://api.typesafe.ai/v1/systemone',
    model: 'jev-1.14.0',
    keyVariable: 'JEV_API_KEY',
    requestTokenLimit: 64_000,
  },
  sage: {
    id: 'sage',
    name: 'Levanto Sage',
    url: 'https://sage.levanto.ai/v1/systemone',
    model: 'levanto-sage-2',
    keyVariable: 'LEVANTO_API_KEY',
    requestTokenLimit: 32_000,
  },
} as const satisfies Record<string, Provider>;

export const DEFAULT_PROVIDER = 'subq';

export function resolveProvider(id: string | undefined): Provider {
  return id !== undefined && Object.hasOwn(PROVIDERS, id)
    ? PROVIDERS[id as keyof typeof PROVIDERS]
    : PROVIDERS[DEFAULT_PROVIDER];
}
