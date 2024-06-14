import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { cwd } from 'process';

import { sql } from 'drizzle-orm';

import config from 'config';
import { db } from 'database/client';
import { chains } from 'database/schema/chains';
import { logger } from 'utils/logger';

import { Chain } from './chain-config';
import { NetworkConfigFile } from './types';

const path = resolve(cwd(), config.networks);

logger.info(`Loading network config file: ${path}`);

if (!existsSync(path)) {
  throw new Error(`Network config file not found at ${path}`);
}

class NetworkConfigs {
  readonly networks: string[] = [];
  private readonly _chains: Map<number, Chain> = new Map();
  private readonly _chainMap: Map<string, number> = new Map();

  constructor(private readonly items: NetworkConfigFile) {
    Object.keys(this.items).forEach((network) => {
      this.networks.push(network);
      this._chains.set(this.items[network].chainId, new Chain(network, this.items[network]));
      this._chainMap.set(network, this.items[network].chainId);
    });
  }

  public getNetwork(network: string) {
    return this._chains.get(this._chainMap.get(network));
  }

  public getByChainId(chainId: number) {
    return this._chains.get(chainId);
  }

  public listChains() {
    return Array.from(this._chains.values());
  }
}

export const networks = new NetworkConfigs(JSON.parse(readFileSync(path, 'utf-8')) as NetworkConfigFile);
logger.info(`Network configs loaded: ${networks.networks.join(', ')}`);

export const updateChains = async () => {
  const items = networks.listChains();
  const result = await db
    .insert(chains)
    .values(items.map((chain) => ({ id: chain.chainId, name: chain.name, stablecoinAddress: chain.stablecoinAddress })))
    .onConflictDoUpdate({
      target: [chains.id],
      set: {
        name: sql`excluded.name`,
        stablecoinAddress: sql`excluded.stablecoin_address`,
      },
    })
    .returning({ id: chains.id })
    .execute();
  logger.info(`Updated chains: ${result.length}`);
};
