import { JsonRpcProvider } from 'ethers';

const initializedProviders: Map<string, JsonRpcProvider> = new Map();

export const getProvider = (url: string): JsonRpcProvider => {
  if (!initializedProviders.has(url)) {
    initializedProviders.set(url, new JsonRpcProvider(url));
  }
  return initializedProviders.get(url)!;
};
