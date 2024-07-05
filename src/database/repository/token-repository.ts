import { and, eq, inArray } from 'drizzle-orm';
import { ZeroAddress } from 'ethers';

import { db } from 'database/client';
import { tokens } from 'database/schema';
import { Chain } from 'loader/networks/chain-config';

export const tokenRepository = {
  listForChain: (chainId: number) => db.select().from(tokens).where(eq(tokens.chainId, chainId)),
  findAllByAddress: (address: string[], chainId?: number) =>
    db
      .select()
      .from(tokens)
      .where(
        and(
          chainId ? eq(tokens.chainId, chainId) : undefined,
          inArray(
            tokens.address,
            address.map((item) => item.toLowerCase()),
          ),
        ),
      ),
  getStablecoin: (chain: Chain) =>
    db.query.tokens.findFirst({
      where: and(eq(tokens.chainId, chain.chainId), eq(tokens.address, chain.stablecoinAddress)),
    }),
  getBitcoin: (chain: Chain) =>
    db.query.tokens.findFirst({
      where: and(eq(tokens.chainId, chain.chainId), eq(tokens.address, chain.bitcoinAddress)),
    }),
  getNativeCoin: (chain: Chain) =>
    db.query.tokens.findFirst({ where: and(eq(tokens.chainId, chain.chainId), eq(tokens.address, ZeroAddress)) }),
  findByAddress: (address: string, chainId?: number) =>
    db.query.tokens.findFirst({
      where: and(chainId ? eq(tokens.chainId, chainId) : undefined, eq(tokens.address, address.toLowerCase())),
    }),
};
