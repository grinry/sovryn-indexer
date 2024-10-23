import { processLegacyChain } from 'cronjobs/legacy/price-migration';
import { tokenRepository } from 'database/repository/token-repository';
import { networks } from 'loader/networks';
import { logger } from 'utils/logger';

export default async function migrate() {
  logger.info('Migrate started');
  await cloneWbtcToRbtc();
}

async function cloneWbtcToRbtc() {
  const chain = networks.getByChainId(30);

  // const wbtc = await tokenRepository.findByAddress(chain.legacy.nativeTokenWrapper, chain.chainId);
  // const rbtc = await tokenRepository.findByAddress(chain.bitcoinAddress, chain.chainId);

  // logger.info({ wbtc, rbtc }, 'Loaded token data.');

  await processLegacyChain(chain.legacy);
}
