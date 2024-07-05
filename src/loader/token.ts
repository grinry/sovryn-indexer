import { Provider } from 'ethers';

import { ERC20__factory } from 'artifacts/abis/types';
import { tokens } from 'database/schema';

export const getErc20Balance = (provider: Provider, tokenAddress: string, userAddress: string) =>
  ERC20__factory.connect(tokenAddress, provider).balanceOf(userAddress);

export const findTokenByAddress = (address: string, list: (typeof tokens.$inferSelect)[]) =>
  list.find((item) => item.address === address);
