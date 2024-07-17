import { Provider, ZeroAddress } from 'ethers';

import { ERC20__factory } from 'artifacts/abis/types';
import { tokens } from 'database/schema';

export const getErc20Balance = (provider: Provider, tokenAddress: string, userAddress: string) =>
  tokenAddress === ZeroAddress
    ? provider.getBalance(userAddress)
    : ERC20__factory.connect(tokenAddress, provider).balanceOf(userAddress);

export const getErc20TotalSupply = (provider: Provider, tokenAddress: string) =>
  ERC20__factory.connect(tokenAddress, provider).totalSupply();

export const findTokenByAddress = (address: string, list: (typeof tokens.$inferSelect)[]) =>
  list.find((item) => item.address === address);
