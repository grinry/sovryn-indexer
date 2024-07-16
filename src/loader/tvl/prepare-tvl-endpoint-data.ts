import { isNil } from 'lodash';
import { bignumber } from 'mathjs';

import { priceRepository } from 'database/repository/price-repository';
import { tokenRepository } from 'database/repository/token-repository';
import { tvlRepository } from 'database/repository/tvl-repository';
import { TvlGroup } from 'database/schema';
import { Chain } from 'loader/networks/chain-config';
import { NetworkFeature } from 'loader/networks/types';
import { findEndPrice } from 'loader/price';
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
    ];
  }
  return [];
}

export async function prepareTvlEndpoint(chain: Chain) {
  const data = await tvlRepository.loadAll(chain.chainId).execute();

  const output = {
    total_btc: '0',
    total_usd: '0',
    updatedAt: new Date(),
  };

  makeGroups(chain).forEach((item) => {
    output[item] = {
      totalBtc: '0',
      totalUsd: '0',
    };
  });

  const priceList = await priceRepository.listLastPrices().execute();
  const stablecoinId = await tokenRepository
    .getStablecoin(chain)
    .execute()
    .then((item) => item.id);

  const bitcoinId = await tokenRepository
    .getBitcoin(chain)
    .execute()
    .then((item) => item.id);

  data.forEach((item) => {
    if (!isNil(output[item.group])) {
      const entry = {
        assetName: item.symbol.split('_')[0],
        contract: item.contract,
        asset: item.asset,
        balance: String(item.balance),
        balanceBtc: fixBnValue(
          bignumber(item.balance).mul(findEndPrice(item.tokenId, bitcoinId, priceList)),
        ).toString(),
        balanceUsd: fixBnValue(
          bignumber(item.balance).mul(findEndPrice(item.tokenId, stablecoinId, priceList)),
        ).toString(),
      };
      output[item.group][item.name] = entry;

      /** Increment tvl btc group */
      if (!isNaN(output[item.group].totalBtc)) {
        output[item.group].totalBtc = fixBnValue(
          bignumber(output[item.group].totalBtc).add(entry.balanceBtc),
        ).toString();
      }
      /** Increment tvl btc total */
      if (output.total_btc) output.total_btc = fixBnValue(bignumber(output.total_btc).add(entry.balanceBtc)).toString();
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
    totalBtc: '0',
    totalUsd: '0',
    updatedAt: new Date(),
    chains: chains.map((chain) => ({
      chainId: chain.chainId,
      name: chain.name,
      totalBtc: '0',
      totalUsd: '0',
    })),
    features: {},
  };

  const groups = Object.values(TvlGroup);

  groups.forEach((item) => {
    output.features[item] = {
      totalBtc: '0',
      totalUsd: '0',
    };
  });

  items.forEach((item, index) => {
    logger.info({ item, index }, 'Tvl data');
    groups.forEach((group) => {
      if (!isNil(item[group])) {
        output.features[group].totalBtc = fixBnValue(
          bignumber(output.features[group].totalBtc).add(item[group].totalBtc),
        ).toString();
        output.features[group].totalUsd = fixBnValue(
          bignumber(output.features[group].totalUsd).add(item[group].totalUsd),
        ).toString();
      }
    });
    output.totalBtc = fixBnValue(bignumber(output.totalBtc).add(item.total_btc)).toString();
    output.totalUsd = fixBnValue(bignumber(output.totalUsd).add(item.total_usd)).toString();

    output.chains[index].totalBtc = item.total_btc;
    output.chains[index].totalUsd = item.total_usd;
  });

  return output;
}
