import { JsonRpcProvider } from 'ethers';

import { Multicall, Multicall__factory } from 'artifacts/abis/types';
import { getProvider } from 'utils/rpc/rpc';

import { LegacyChain } from './legacy-chain';
import { SdexChain } from './sdex-chain';
import { NativeNetworkToken, NetworkConfig, NetworkFeature } from './types';
import { validateConfig } from './utils';

export class Chain {
  readonly chainId: number;
  readonly chainIdHex: string;
  readonly rpc: JsonRpcProvider;
  readonly supportsMulticall: boolean = false;

  readonly multicall: Multicall;
  readonly stakingAddress: string;
  readonly stablecoinAddress: string;
  readonly bitcoinAddress: string;
  readonly sovAddress: string;
  
  readonly features: NetworkFeature[];
  readonly sdex: SdexChain;
  readonly legacy: LegacyChain;
  readonly token: NativeNetworkToken;

  constructor(public readonly name: string, config: NetworkConfig) {
    validateConfig(name, config);

    this.chainId = config.chainId;
    this.chainIdHex = '0x' + config.chainId.toString(16);
    this.rpc = getProvider(config.rpc);
    this.supportsMulticall = !!config.multicall;
    this.features = config.features;
    this.token = config.token;
    this.stablecoinAddress = config.stablecoin.toLowerCase();
    this.bitcoinAddress = config.bitcoin.toLowerCase();
    this.sovAddress = config.sov.toLowerCase();
    this.stakingAddress = config.staking.toLowerCase();

    if (this.supportsMulticall) {
      this.multicall = Multicall__factory.connect(config.multicall, this.rpc);
    }

    if (config.features.includes(NetworkFeature.sdex)) {
      this.sdex = new SdexChain(this, config.sdex);
    }
    if (config.features.includes(NetworkFeature.legacy)) {
      this.legacy = new LegacyChain(this, config.legacy);
    }
  }

  hasFeature(feature: NetworkFeature) {
    return this.features.includes(feature);
  }

  toJSON() {
    return {
      chainId: this.chainId,
      features: this.features,
    };
  }

  async executeMulticall(calls: Array<{ target: string; callData: string }>) {
    if (!this.multicall) {
      throw new Error('Multicall is not supported on this network');
    }

    const results = await this.multicall.tryAggregate.staticCall(true, calls);
    if (results[0].success && results[0].returnData) {
      return results[0].returnData;
    } else {
      throw new Error('Multicall failed or returned empty');
    }
  }
}
