import Joi from 'joi';

import { LegacyChainConfig, LiquidityChainConfig, NetworkConfig, NetworkFeature, SdexChainConfig } from './types';

export function validateConfig(name: string, config: NetworkConfig) {
  const result = Joi.object({
    chainId: Joi.number().required(),
    rpc: Joi.string().required(),
    multicall: Joi.string(),
    staking: Joi.string(),
    stablecoin: Joi.string().required(),
    bitcoin: Joi.string().required(),
    sov: Joi.string().required(),
    features: Joi.array()
      .items(Joi.valid(NetworkFeature.sdex, NetworkFeature.legacy, NetworkFeature.liquidity))
      .required(),
    token: Joi.object({
      symbol: Joi.string().required(),
      name: Joi.string().required(),
      decimals: Joi.number().min(0).required(),
    }).required(),
    sdex: Joi.optional(),
    liquidity: Joi.optional(),
    legacy: Joi.optional(),
  }).validate(config ?? {});

  if (result.error) {
    throw new Error(`Invalid network config for ${name}: ${result.error.message}`);
  }

  if (config.features.includes(NetworkFeature.sdex)) {
    validateSdexConfig(name, config.sdex);
  }

  if (config.features.includes(NetworkFeature.liquidity)) {
    validateLiquidityConfig(name, config.liquidity);
  }

  if (config.features.includes(NetworkFeature.legacy)) {
    validateLegacyConfig(name, config.legacy);
  }
}

function validateSdexConfig(name: string, config: SdexChainConfig) {
  const result = Joi.object({
    subgraph: Joi.string().required(),
    graphcache: Joi.string().required(),
    dex: Joi.string().required(),
    query: Joi.string().required(),
    impact: Joi.string().required(),
    block: Joi.number().default(0),
  }).validate(config ?? {});

  if (result.error) {
    throw new Error(`Invalid Sdex config for ${name}: ${result.error.message}`);
  }
}

function validateLiquidityConfig(name: string, config: LiquidityChainConfig) {
  const result = Joi.object({
    subgraph: Joi.string().required(),
  }).validate(config ?? {});

  if (result.error) {
    throw new Error(`Invalid Liquidity config for ${name}: ${result.error.message}`);
  }
}

function validateLegacyConfig(name: string, config: LegacyChainConfig) {
  const result = Joi.object({
    subgraph: Joi.string().required(),
    native: Joi.string().required(),
    protocol: Joi.string().required(),
    troveManager: Joi.string().required(),
    stabilityPool: Joi.string().required(),
    myntAggregator: Joi.string().default(null),
    zusdToken: Joi.string().default(null),
    babelFishMultisig: Joi.string().default(null),
    babelFishStaking: Joi.string().default(null),
    block: Joi.number().default(0),
  }).validate(config ?? {});

  if (result.error) {
    throw new Error(`Invalid Legacy config for ${name}: ${result.error.message}`);
  }
}

export const chainIdAsHex = (chainId: number) => '0x' + chainId.toString(16);
export const chainIdFromHex = (chainId: string) => parseInt(chainId, 16);
