export type NetworkConfigFile = Record<string, NetworkConfig>;

export enum NetworkFeature {
  sdex = 'sdex',
  legacy = 'legacy',
}

export type NetworkConfig = {
  chainId: number;
  rpc: string;
  multicall: string;
  features: NetworkFeature[];
  sdex?: SdexChainConfig;
  legacy?: LegacyChainConfig;
};

export type SdexChainConfig = {
  subgraph: string;
  query: string;
  impact: string;
};

export type LegacyChainConfig = {
  subgraph: string;
  // todo: add contract addresses as needed such as staking, pool registries, etc.
};
