# Indexer API Ddocs

<!-- no toc -->
- [Endpoints](#endpoints)
- [Response Format](response-format.md)
- [Pagination](pagination.md)
- [Rate Limiting](#rate-limiting)

## Endpoints

#### GET /chains

Returns a list of supported chains and features. `chainId` is the unique identifier for each chain and is used in other endpoints. While chain id returned is a number, endpoints can also accept chain id as hex string (e.g. `0x1e` instead of `30` for Rootstock).

#### GET /tokens

Returns a list of supported tokens and their details. Supports `pagination`. 
Tokens are ordered by `address`, so native tokens are listed first.

Endpoint data is cached for 1 minute.

`GET /tokens?chainId=30&spam=1`

Use optional `chainId` query parameter to filter tokens by chain.
Use optional `spam=1` query parameter to include tokens marked as spam / ignored by our dex.

### Legacy endpoints

Legacy endpoints are endpoints moved from the old API and are mostly used for rootstock chain data. It will likely be deprecated in the future. They are prefixed with `/legacy`.

#### GET /legacy/amm

Returns list of rootstock AMM pools. `chainId` is required.

`GET /legacy/amm?chainId=30`


#### GET /legacy/amm/pool/:poolId

Returns details of a rootstock AMM pool. `chainId` and `poolId` are required.

`GET /legacy/amm/pool/0xe76ea314b32fcf641c6c57f14110c5baa1e45ff4?chainId=30`

#### GET /legacy/amm/today/:poolId

Returns daily data of a rootstock AMM pool. `chainId` and `poolId` are required.

`GET /legacy/amm/today/0xe76ea314b32fcf641c6c57f14110c5baa1e45ff4?chainId=30`

#### GET /legacy/amm/volume

Returns daily volume of rootstock AMM pools. `chainId` is required.

`GET /legacy/amm/volume?chainId=30`

#### GET /legacy/amm/volume/pool/:poolId

Returns daily volume of a rootstock AMM pool. `chainId` and `poolId` are required.

`GET /legacy/amm/volume/pool/0xe76ea314b32fcf641c6c57f14110c5baa1e45ff4?chainId=30`

#### GET /legacy/amm/pool-balance/:poolId

Returns balance of a rootstock AMM pool. `chainId` and `poolId` are required.

`GET /legacy/amm/pool-balance/0xe76ea314b32fcf641c6c57f14110c5baa1e45ff4?chainId=30`


#### GET /legacy/cmc/summary

Returns summary of all rootstock trading pairs.

`GET /legacy/cmc/summary`

#### GET /legacy/cmc/tvl

Returns TVL of protocol features and pools on specific chain. `chainId` is required.

`GET /legacy/cmc/tvl?chainId=30`

#### GET /legacy/cmc/tvl/sumary

Returns summary of TVL of protocol features and pools across all chains.

`GET /legacy/cmc/tvl/summary`

### SDEX endpoints

SDEX endpoints returns data for chains flagged with `sdex` feature. Data is built from Ambient smart contracts.

#### GET /sdex/pool_list

Returns list of SDEX pools. Supports `pagination`. `chainId` is required.

`GET /sdex/pool_list?chainId=60808`

#### GET /sdex/volume

Returns volume of each token on sdex supported chain. `chainId` is required.

`GET /sdex/volume?chainId=60808`

#### GET /sdex/user_pool_positions

Returns active positions of a user in SDEX pools. 

`chainId`, `user`, `base`, `quote`, and `poolIdx` are required.

`base`, `quote` and `poolIdx` values can be obtained from `pool_list` endpoint.

`GET /sdex/user_pool_positions?user=0xe8cf2f9ffb1967cde68c70463b2256d1fff97c14&base=0xba20a5e63eeEFfFA6fD365E7e540628F8fC61474&quote=0xf3107eEC1e6F067552C035FD87199e1A5169CB20&poolIdx=400&chainId=0xed88`


## Rate Limiting

The API is rate limited to 60 requests per minute. If you exceed this limit, you will receive a `429 Too Many Requests` response.
