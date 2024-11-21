import { and, eq } from 'drizzle-orm';
import { ZeroAddress } from 'ethers';
import gql from 'graphql-tag';
import { isNil, uniq } from 'lodash';
import { bignumber } from 'mathjs';

import { db } from 'database/client';
import { tokenRepository } from 'database/repository/token-repository';
import { NewTvlItem, tvlRepository } from 'database/repository/tvl-repository';
import { NewToken, tokens, TvlGroup } from 'database/schema';
import { Chain } from 'loader/networks/chain-config';
import { LegacyChain } from 'loader/networks/legacy-chain';
import { SdexChain } from 'loader/networks/sdex-chain';
import { findTokenByAddress, getErc20Balance, getErc20TotalSupply } from 'loader/token';
import { logger } from 'utils/logger';
import { prettyNumber } from 'utils/numbers';

export async function getAmmPoolTvl(chain: LegacyChain) {
  const { liquidityPools } = await chain.queryFromSubgraph<{
    liquidityPools: { id: string; token0: { id: string; symbol: string }; token1: { id: string; symbol: string } }[];
  }>(gql`
    query {
      liquidityPools(where: { activated: true }) {
        id
        token0 {
          id
          symbol
        }
        token1 {
          id
          symbol
        }
      }
    }
  `);

  const tokens = await tokenRepository.findAllByAddress(
    uniq([...liquidityPools.map((pool) => pool.token0.id), ...liquidityPools.map((pool) => pool.token1.id)]),
  );

  const values: NewTvlItem[] = [];

  for (const contract of liquidityPools) {
    const balances: { [key: string]: number } = {};
    for (let i = 0; i < 2; i++) {
      try {
        const token = findTokenByAddress(contract[`token${i}`].id, tokens);
        const balance = await getErc20Balance(chain.context.rpc, contract[`token${i}`].id, contract.id);
        if (!isNil(balance) && balance > 0) {
          balances[contract[`token${i}`].id] = Number(balance);
          const tokenIteratorSymbol: string = !isNil(contract[`token${i}`].symbol) ? contract[`token${i}`].symbol : '';
          const token1Symbol: string = !isNil(contract.token1.symbol) ? contract.token1.symbol : '';
          values.push({
            chainId: chain.context.chainId,
            contract: contract.id,
            tokenId: token.id,
            name: `${tokenIteratorSymbol}_${token1Symbol}`,
            balance: prettyNumber(bignumber(balance).div(10 ** token.decimals)),
            group: TvlGroup.amm,
          });
        }
      } catch (e) {
        logger.error({ contract, error: e.message }, 'Error while processing AMM pool');
      }

      // todo: old service updates summary table, but we don't have it yet
      // await updateLiquidityColumn({
      //   contract: contract.id,
      //   balances: balances,
      // });
    }
  }

  if (values.length > 0) {
    await tvlRepository.create(values);
  }
}

export async function getLendingPoolTvl(chain: LegacyChain) {
  const { lendingPools } = await chain.queryFromSubgraph<{
    lendingPools: { id: string; underlyingAsset: { id: string; symbol: string } }[];
  }>(gql`
    query {
      lendingPools {
        id
        underlyingAsset {
          id
          symbol
        }
      }
    }
  `);

  const tokens = await tokenRepository.findAllByAddress(uniq(lendingPools.map((pool) => pool.underlyingAsset.id)));

  const values: NewTvlItem[] = [];

  for (const contract of lendingPools) {
    try {
      const token = findTokenByAddress(contract.underlyingAsset.id, tokens);
      const balance = await getErc20Balance(chain.context.rpc, contract.underlyingAsset.id, contract.id);

      if (!isNil(balance) && balance > 0) {
        values.push({
          chainId: chain.context.chainId,
          contract: contract.id,
          tokenId: token.id,
          name: `${!isNil(contract.underlyingAsset.symbol) ? contract.underlyingAsset.symbol : ''}_Lending`,
          balance: prettyNumber(bignumber(balance).div(10 ** token.decimals)),
          group: TvlGroup.lending,
        });
      }
    } catch (e) {
      logger.error({ contract }, 'Error while processing lending pool');
    }
  }

  if (values.length > 0) {
    await tvlRepository.create(values);
  }
}

export async function getProtocolTvl(chain: LegacyChain) {
  const tokens = await tokenRepository
    .listForChain(chain.context.chainId)
    .execute()
    .then((items) => items.filter((item) => item.address !== ZeroAddress));

  const values: NewTvlItem[] = [];

  for (const token of tokens) {
    try {
      const balance = await getErc20Balance(chain.context.rpc, token.address, chain.protocolAddress);

      if (!isNil(balance) && balance > 0) {
        values.push({
          chainId: chain.context.chainId,
          contract: chain.protocolAddress,
          tokenId: token.id,
          name: `${!isNil(token.symbol) ? token.symbol : ''}_Protocol`,
          balance: prettyNumber(bignumber(balance).div(10 ** token.decimals)),
          group: TvlGroup.protocol,
        });
      }
    } catch (e) {
      logger.error({ token, protocol: chain.protocolAddress }, 'Error while processing protocol TVL data');
    }
  }

  if (values.length > 0) {
    await tvlRepository.create(values);
  }
}

export async function getStakingTvl(chain: Chain) {
  const sov = await db.query.tokens
    .findFirst({
      where: and(eq(tokens.chainId, chain.chainId), eq(tokens.address, chain.sovAddress)),
    })
    .execute();

  if (sov) {
    const balance = await getErc20Balance(chain.rpc, sov.address, chain.stakingAddress);
    if (!isNil(balance) && balance > 0) {
      await tvlRepository.create({
        chainId: chain.chainId,
        contract: chain.stakingAddress,
        tokenId: sov.id,
        name: 'SOV_Staking',
        balance: prettyNumber(bignumber(balance).div(10 ** sov.decimals)),
        group: TvlGroup.staking,
      });
    }
  }
}

export async function getFishTvl(chain: Chain) {
  const fish = await tokenRepository.getBySymbol('fish', chain.chainId).execute();

  const fishTotalSupply = await getErc20TotalSupply(chain.rpc, fish.address);

  const multisigBalance = chain.legacy.babelFishMultisig
    ? await getErc20Balance(chain.rpc, fish.address, chain.legacy.babelFishMultisig)
    : BigInt(0);

  const stakingBalance = chain.legacy.babelFishStaking
    ? await getErc20Balance(chain.rpc, fish.address, chain.legacy.babelFishStaking)
    : BigInt(0);

  await tvlRepository.create({
    chainId: chain.chainId,
    contract: fish.address,
    tokenId: fish.id,
    name: 'FISH_TVL',
    balance: prettyNumber(
      bignumber(fishTotalSupply).minus(multisigBalance.toString()).minus(stakingBalance.toString()),
    ),
    group: TvlGroup.fish,
  });

  logger.info('Fish TVL data processed');
}

export async function getSubprotocolTvl(chain: LegacyChain) {
  // looks like it does not work in the old service...
}

export async function getZeroTvl(chain: LegacyChain) {
  try {
    const items: NewTvlItem[] = [];

    const btc = await tokenRepository.getByAddress(chain.context.chainId, chain.nativeTokenWrapper).execute();

    if (btc) {
      const collateralBalance = await chain.troveManager
        .getEntireSystemColl()
        .then((item) => bignumber(item).div(1e18));
      items.push({
        chainId: chain.context.chainId,
        contract: await chain.troveManager.getAddress(),
        tokenId: btc.id,
        name: 'BTC_Zero',
        balance: collateralBalance.toString(),
        group: TvlGroup.zero,
      });
    }

    const zusd = await tokenRepository.getByAddress(chain.context.chainId, chain.zusdTokenAddress).execute();

    if (zusd) {
      const zusdBalance = await chain.stabilityPool.getTotalZUSDDeposits().then((item) => bignumber(item).div(1e18));
      items.push({
        chainId: chain.context.chainId,
        contract: await chain.stabilityPool.getAddress(),
        tokenId: zusd.id,
        name: 'ZUSD_Zero',
        balance: zusdBalance.toString(),
        group: TvlGroup.zero,
      });
    }

    if (items) {
      await tvlRepository.create(items);
    }
  } catch (e) {
    logger.error({ error: e.message }, 'Error while processing Zero TVL');
  }
}

export async function getMyntTvl(chain: LegacyChain) {
  try {
    const myntAggregator = chain.config.myntAggregator?.toLowerCase();
    if (!myntAggregator) {
      // chain does not have Mynt aggregator, skipping
      return;
    }

    const zusdToken = await tokenRepository.getByAddress(chain.context.chainId, chain.zusdTokenAddress).execute();
    const docToken = await tokenRepository.getBySymbol('DOC', chain.context.chainId).execute();

    const myntTokens = [docToken, zusdToken].filter((item) => item) as NewToken[];

    const items: NewTvlItem[] = [];

    for (const token of myntTokens) {
      const balance = await getErc20Balance(chain.context.rpc, token.address, myntAggregator);
      if (!isNil(balance)) {
        items.push({
          chainId: chain.context.chainId,
          contract: myntAggregator,
          tokenId: token.id,
          name: `${token.symbol}_Mynt`,
          balance: prettyNumber(bignumber(balance).div(10 ** token.decimals)),
          group: TvlGroup.mynt,
        });
      }
    }

    if (items.length > 0) {
      await tvlRepository.create(items);
    }

    logger.info('Mynt TVL data processed');
  } catch (e) {
    logger.error({ error: e.message }, 'Error while processing Mynt TVL');
  }
}

export async function getSdexTvl(chain: SdexChain) {
  try {
    logger.info('Processing Sdex TVL data');
    const tokens = await tokenRepository.listForChain(chain.context.chainId).execute();

    const items: NewTvlItem[] = [];

    for (const token of tokens) {
      try {
        // todo: put to multicall
        // todo: create multicall helper with batches
        const balance = await getErc20Balance(chain.context.rpc, token.address, chain.config.dex).then((value) =>
          prettyNumber(bignumber(value).div(10 ** token.decimals)),
        );

        items.push({
          chainId: chain.context.chainId,
          contract: chain.config.dex,
          tokenId: token.id,
          name: token.symbol,
          balance: balance,
          group: TvlGroup.sdex,
        });
      } catch (e) {
        logger.error({ token, error: e.message }, 'Error while processing Sdex TVL');
      }
    }

    if (items) {
      await tvlRepository.create(items);
    }

    logger.info('Sdex TVL data processed');
  } catch (e) {
    logger.error({ error: e.message }, 'Error while processing Sdex TVL');
  }
}
