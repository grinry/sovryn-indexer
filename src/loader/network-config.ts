import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { cwd } from 'process';

import { JsonRpcProvider } from 'ethers';

import { Multicall__factory, SdexQuery, SdexQuery__factory } from 'artifacts/abis/types';
import { Multicall } from 'artifacts/abis/types/Multicall';
import config from 'config';
import { logger } from 'utils/logger';
import { getProvider } from 'utils/rpc/rpc';

import { queryFromSubgraph } from './subgraph';

type NetworkConfigFile = {
  dexNetworks: Record<string, SdexChainConfig>;
};

type SdexChainConfig = {
  chainId: number;
  rpc: string;
  subgraph: string;
  queryAddress: string;
  impactAddress: string;
  multicallAddress: string;
};

const path = resolve(cwd(), config.networks);

logger.info(`Loading network config file: ${path}`);

if (!existsSync(path)) {
  throw new Error(`Network config file not found at ${path}`);
}

const content = JSON.parse(readFileSync(path, 'utf-8')) as NetworkConfigFile;

class NetworkConfigs {
  readonly networks: string[] = [];
  private readonly _chains: Map<number, NetworkConfig> = new Map();
  private readonly _chainMap: Map<string, number> = new Map();
  constructor(private readonly items: NetworkConfigFile) {
    Object.keys(this.items.dexNetworks).forEach((network) => {
      this.networks.push(network);
      this._chains.set(
        this.items.dexNetworks[network].chainId,
        new NetworkConfig(network, this.items.dexNetworks[network]),
      );
      this._chainMap.set(network, this.items.dexNetworks[network].chainId);
    });
  }

  public getNetwork(network: string) {
    return this._chains.get(this._chainMap.get(network));
  }

  public getByChainId(chainId: number) {
    return this._chains.get(chainId);
  }
}

class NetworkConfig {
  readonly rpc: JsonRpcProvider;
  readonly chainId: number;
  readonly supportsMulticall: boolean = false;

  readonly multicall: Multicall;
  readonly query: SdexQuery;
  // todo: add impact

  constructor(public readonly name: string, private readonly config: SdexChainConfig) {
    this.chainId = config.chainId;
    this.rpc = getProvider(config.rpc);
    this.supportsMulticall = !!config.multicallAddress;

    this.query = SdexQuery__factory.connect(config.queryAddress, this.rpc);

    if (this.supportsMulticall) {
      this.multicall = Multicall__factory.connect(config.multicallAddress, this.rpc);
    }
  }

  public queryFromSubgraph<T>(query: string, startTime: number, endTime: number, isAsc = true) {
    return queryFromSubgraph<T>(this.config.subgraph, query, startTime, endTime, isAsc);
  }
}

export const networkConfig = new NetworkConfigs(content);
logger.info(`DEX networks loaded: ${networkConfig.networks.join(', ')}`);
