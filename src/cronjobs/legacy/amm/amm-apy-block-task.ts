import { CronJob } from 'cron';
import _, { isNil } from 'lodash';
import { bignumber } from 'mathjs';

import { apyBlockRepository } from 'database/repository/apy-block-repository';
import { ammApyBlocks, NewAmmApyBlock } from 'database/schema';
import { networks } from 'loader/networks';
import { LegacyChain, QueryAmmApyDataForBlock } from 'loader/networks/legacy-chain';
import { NetworkFeature } from 'loader/networks/types';
import { logger } from 'utils/logger';

const childLogger = logger.child({ module: 'crontab:legacy:amm_apy_blocks' });

export const ammApyBlockTask = async (ctx: CronJob) => {
  ctx.stop();
  childLogger.info('Retrieving AMM APY blocks...');

  const items = networks.listChains();

  for (const item of items) {
    if (item.hasFeature(NetworkFeature.legacy)) {
      await processLegacyChain(item.legacy);
    }
  }

  childLogger.info('AMM APY blocks retrieved.');
  ctx.start();
};

const CHUNK_SIZE = 50;

async function processLegacyChain(chain: LegacyChain) {
  const endBlock = await chain.queryBlockNumber();

  const startBlock = await apyBlockRepository.getLastBlock(chain.context.chainId).then((block) => {
    if (isNil(block) || endBlock - block > CHUNK_SIZE) {
      return endBlock - CHUNK_SIZE;
    } else {
      return block;
    }
  });
  const startTime = Date.now();

  childLogger.info({ chain: chain.context.chainId, startBlock, endBlock }, 'Processing AMM APY blocks...');

  const blocks = _.range(startBlock, endBlock + 1, 1);

  const items = await Promise.all(blocks.map((block) => getDataForOneBlock(chain, block))).then((data) =>
    data.flatMap((x) => x),
  );

  const added = await apyBlockRepository.storeItems(items).returning({ id: ammApyBlocks.id }).execute();

  const duration = (Date.now() - startTime) / 1000;
  childLogger.info(
    { duration, startBlock, endBlock, adding: items.length, added: added.length },
    'AMM APY blocks processing finished.',
  );
}

async function getDataForOneBlock(chain: LegacyChain, block: number) {
  const blockTimestamp = await chain.context.rpc.getBlock(block).then((block) => block.timestamp);
  const output: NewAmmApyBlock[] = [];

  const { liquidityPools, liquidityMiningAllocationPoints } = await chain.queryAmmApyDataForBlock(block);
  const { conversions } = await chain.queryConversionFessByBlock(block);

  const { liquidityPoolData, rewardTokenAddress, rewardTokenPrice } = getLiquidityPoolData(liquidityPools);
  const conversionData = getConversionFeeData(conversions);
  const rewardsData = getRewardsData(liquidityMiningAllocationPoints, rewardTokenPrice);

  for (const poolToken in liquidityPoolData) {
    if (liquidityPoolData[poolToken].balanceBtc !== '0' || liquidityPoolData[poolToken].balanceUsd !== '0') {
      output.push({
        chainId: chain.context.chainId,
        block,
        blockTimestamp: new Date(blockTimestamp * 1000),
        poolToken: poolToken,
        pool: liquidityPoolData[poolToken].pool,
        balanceBtc: liquidityPoolData[poolToken].balanceBtc,
        balanceUsd: liquidityPoolData[poolToken].balanceUsd,
        conversionFeeBtc: !isNil(conversionData[poolToken]) ? conversionData[poolToken] : '0',
        rewards: !isNil(rewardsData[poolToken]) ? rewardsData[poolToken].rewards : '0',
        rewardsCurrency: rewardTokenAddress,
        rewardsBtc: !isNil(rewardsData[poolToken]) ? rewardsData[poolToken].rewardsBtc : '0',
      });
    }
  }

  return output;
}

interface LiquidityPoolData {
  [key: string]: {
    pool: string;
    balanceBtc: string;
    balanceUsd: string;
  };
}

function getLiquidityPoolData(liquidityPoolData: QueryAmmApyDataForBlock['liquidityPools']) {
  // todo: should use network config to get the rewards token instead of hardcoding it
  const rewardsToken = liquidityPoolData.find((item) => item.token1.symbol === 'SOV')?.token1;
  let rewardTokenAddress = '';
  let rewardTokenPrice = '0';
  let rewardTokenPriceUsd = '0';
  if (!isNil(rewardsToken)) {
    rewardTokenAddress = rewardsToken.id;
    rewardTokenPrice = rewardsToken.lastPriceBtc;
    rewardTokenPriceUsd = rewardsToken.lastPriceUsd;
  }

  const output: LiquidityPoolData = {};
  liquidityPoolData.forEach((item) => {
    if (item.type === 1) {
      const poolToken = item.smartToken.id;
      const balanceBtc = bignumber(item.token0Balance)
        .mul(bignumber(item.token0.lastPriceBtc))
        .plus(bignumber(item.token1Balance).mul(bignumber(item.token1.lastPriceBtc)));
      const balanceUsd = bignumber(item.token0Balance)
        .mul(bignumber(item.token0.lastPriceUsd))
        .plus(bignumber(item.token1Balance).mul(bignumber(item.token1.lastPriceUsd)));
      output[poolToken] = {
        pool: item.id,
        balanceBtc: balanceBtc.toFixed(18),
        balanceUsd: balanceUsd.toFixed(18),
      };
    } else if (item.type === 2) {
      /** For each token, find the pool token */
      const poolToken0 = item.poolTokens.find(
        (i) => i.underlyingAssets[0].id === item.token0.id && i.underlyingAssets[0].id !== item.smartToken.id,
      )?.id;
      const poolToken1 = item.poolTokens.find(
        (i) => i.underlyingAssets[0].id === item.token1.id && i.underlyingAssets[0].id !== item.smartToken.id,
      )?.id;
      const btcBalanceToken0 = bignumber(item.token0Balance).mul(bignumber(item.token0.lastPriceBtc));
      const btcBalanceToken0Usd = bignumber(item.token0Balance).mul(bignumber(item.token0.lastPriceUsd));
      const btcBalanceToken1 = bignumber(item.token1Balance).mul(bignumber(item.token1.lastPriceBtc));
      const btcBalanceToken1Usd = bignumber(item.token1Balance).mul(bignumber(item.token1.lastPriceUsd));
      if (!isNil(poolToken0) && !isNil(poolToken1)) {
        output[poolToken0] = {
          pool: item.id,
          balanceBtc: btcBalanceToken0.toFixed(18),
          balanceUsd: btcBalanceToken0Usd.toFixed(18),
        };
        output[poolToken1] = {
          pool: item.id,
          balanceBtc: btcBalanceToken1.toFixed(18),
          balanceUsd: btcBalanceToken1Usd.toFixed(18),
        };
      }
    }
  });

  return {
    liquidityPoolData: output,
    rewardTokenAddress: rewardTokenAddress,
    rewardTokenPrice: rewardTokenPrice,
  };
}

interface ConversionFeeData {
  [key: string]: string;
}

function getConversionFeeData(conversions: QueryAmmApyDataForBlock['conversions']): ConversionFeeData {
  const output: ConversionFeeData = {};
  conversions.forEach((item) => {
    let poolToken = '';

    if (item.emittedBy.type === 1) {
      poolToken = item.emittedBy.smartToken.id;
    } else if (item.emittedBy.type === 2) {
      const foundPoolToken = item.emittedBy.poolTokens.find((i) => i.underlyingAssets[0].id === item._toToken.id);
      if (!isNil(foundPoolToken)) poolToken = foundPoolToken.id;
    }

    const conversionFeeBtc = bignumber(item._conversionFee).mul(item._toToken.lastPriceBtc);

    if (isNil(output[poolToken])) {
      output[poolToken] = conversionFeeBtc.toFixed(18);
    } else {
      output[poolToken] = bignumber(output[poolToken]).plus(conversionFeeBtc).toFixed(18);
    }
  });
  return output;
}

interface RewardsPerBlockData {
  [key: string]: {
    rewards: string;
    rewardsBtc: string;
  };
}

function getRewardsData(
  rewards: QueryAmmApyDataForBlock['liquidityMiningAllocationPoints'],
  rewardsTokenPriceBtc: string,
): RewardsPerBlockData {
  const rewardsPrice = bignumber(rewardsTokenPriceBtc);
  const output: RewardsPerBlockData = {};
  rewards.forEach((item) => {
    output[item.id] = {
      rewards: item.rewardPerBlock,
      rewardsBtc: bignumber(item.rewardPerBlock).mul(rewardsPrice).toFixed(18),
    };
  });
  return output;
}
