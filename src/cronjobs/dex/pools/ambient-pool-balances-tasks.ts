import { CronJob } from 'cron';

import { poolBalanceRepository } from 'database/repository/pool-balance-repository';
import { networks } from 'loader/networks';
import { SdexChain } from 'loader/networks/sdex-chain';
import { NetworkFeature } from 'loader/networks/types';
import { logger } from 'utils/logger';

const childLogger = logger.child({ module: 'crontab:dex:pools:ambient' });

// to populate database with pools balances
export const updateDexPoolBalances = async (ctx: CronJob) => {
  try {
    childLogger.info('Updating pool balances...');

    const items = networks.listChains();

    for (const item of items) {
      await Promise.allSettled([
        item.hasFeature(NetworkFeature.sdex) && prepareAmbientPoolBalances(item.sdex, item.chainId),
      ]);
    }

    childLogger.info('Pool balances update finished.');
  } catch (e) {
    childLogger.error({ error: e.message }, 'Error retrieving pools');
  } finally {
    ctx.start();
  }
  ctx.stop();
};

export const prepareAmbientPoolBalances = async (chain: SdexChain, chainId: number) => {
  try {
    const blockNumber = await chain.queryBlockNumber();
    const lastBalance = await poolBalanceRepository.loadLastBalance(chainId);

    childLogger.info('lastBalance:', lastBalance);

    if (!lastBalance || lastBalance.block < blockNumber) {
      //New liqChanges
      const balanceChanges = await chain.queryBalanceChanges(lastBalance?.block || 0);

      childLogger.info('itesm:');
      childLogger.info(balanceChanges);

      // //Old balances
      // const balances = await poolBalanceRepository.loadUsersBalances(users, chainId);

      // childLogger.info(balances);

      //calculate the new balances -> New liqChanges Balances + Old balances => new Balance

      //   const values = items.userBinLiquidities.map((bin) => ({
      //     tickAt: new Date(Number(bin.timestamp) * 1000),
      //     chainId: chainId,
      //     user: bin.user.id,
      //     liquidity: bin.liquidity,
      //     binId: bin.binId,
      //     priceX: bin.lbPairBinId.priceX,
      //     priceY: bin.lbPairBinId.priceY,
      //     totalSupply: bin.lbPairBinId.totalSupply,
      //     reserveX: bin.lbPairBinId.reserveX,
      //     reserveY: bin.lbPairBinId.reserveY,
      //     block: bin.block,
      //   }));

      // await binRepository.create(values);
    }
  } catch (error) {
    childLogger.error(error, 'Error while preparing ambient pool balances', error);
  }
};
