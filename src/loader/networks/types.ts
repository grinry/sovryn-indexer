export type NetworkConfigFile = Record<string, NetworkConfig>;

export enum NetworkFeature {
  sdex = 'sdex',
  legacy = 'legacy',
}

export type NativeNetworkToken = {
  symbol: string;
  name: string;
  decimals: number;
};

export type NetworkConfig = {
  chainId: number;
  rpc: string;
  multicall: string;
  stablecoin: string;
  features: NetworkFeature[];
  token: NativeNetworkToken;
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
  native: string;
  // todo: add contract addresses as needed such as staking, pool registries, etc.
};
