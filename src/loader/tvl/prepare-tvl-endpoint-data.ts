import { isNil } from 'lodash';
import { bignumber } from 'mathjs';

import { tvlRepository } from 'database/repository/tvl-repository';
import { TvlGroup } from 'database/schema';
import { Chain } from 'loader/networks/chain-config';
import { NetworkFeature } from 'loader/networks/types';
import { findUsdPrice, getLastPrices } from 'loader/price';
import { logger } from 'utils/logger';
import { fixBnValue } from 'utils/price';

function makeGroups(chain: Chain) {
  if (chain.hasFeature(NetworkFeature.legacy) && chain.hasFeature(NetworkFeature.sdex)) {
    return Object.values(TvlGroup);
  }
  if (chain.hasFeature(NetworkFeature.sdex)) {
    return [TvlGroup.staking, TvlGroup.sdex];
  }
  if (chain.hasFeature(NetworkFeature.legacy)) {
    return [
      TvlGroup.amm,
      TvlGroup.lending,
      TvlGroup.protocol,
      TvlGroup.subprotocol,
      TvlGroup.zero,
      TvlGroup.mynt,
      TvlGroup.staking,
      TvlGroup.fish,
    ];
  }
  return [];
}

export async function prepareTvlEndpoint(chain: Chain) {
  const data = await tvlRepository.loadAll(chain.chainId).execute();

  const output = {
    total_usd: '0',
    updatedAt: new Date(),
  };

  makeGroups(chain).forEach((item) => {
    output[item] = {
      totalUsd: '0',
    };
  });

  const priceList = await getLastPrices();

  data.forEach((item) => {
    if (!isNil(output[item.group])) {
      const entry = {
        assetName: item.symbol.split('_')[0],
        contract: item.contract,
        asset: item.asset,
        balance: String(item.balance),
        balanceUsd: fixBnValue(bignumber(item.balance).mul(findUsdPrice(item.tokenId, priceList))).toString(),
      };
      output[item.group][item.name] = entry;

      /** Increment tvl usd group */
      if (!isNaN(output[item.group].totalUsd)) {
        output[item.group].totalUsd = fixBnValue(
          bignumber(output[item.group].totalUsd).add(entry.balanceUsd),
        ).toString();
      }
      /** Increment tvl usd total */
      if (output.total_usd) output.total_usd = fixBnValue(bignumber(output.total_usd).add(entry.balanceUsd)).toString();
    }
  });

  return output;
}

export async function prepareTvlSummaryEndpoint(chains: Chain[]) {
  const items = await Promise.all(chains.map((chain) => prepareTvlEndpoint(chain)));
  // sum all tvl values
  const output = {
    totalUsd: '0',
    updatedAt: new Date(),
    chains: chains.map((chain) => ({
      chainId: chain.chainId,
      name: chain.name,
      totalUsd: '0',
    })),
    features: {},
  };

  const groups = Object.values(TvlGroup);

  groups.forEach((item) => {
    output.features[item] = {
      totalUsd: '0',
    };
  });

  items.forEach((item, index) => {
    logger.info({ item, index }, 'Tvl data');
    groups.forEach((group) => {
      if (!isNil(item[group])) {
        output.features[group].totalUsd = fixBnValue(
          bignumber(output.features[group].totalUsd).add(item[group].totalUsd),
        ).toString();
      }
    });
    output.totalUsd = fixBnValue(bignumber(output.totalUsd).add(item.total_usd)).toString();

    output.chains[index].totalUsd = item.total_usd;
  });

  return output;
}
