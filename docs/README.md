# Indexer API Ddocs

<!-- no toc -->
- [Endpoints](#endpoints)
- [Response Format](response-format.md)
- [Pagination](pagination.md)
- [Rate Limiting](#rate-limiting)

## Endpoints

#### GET /chains

Returns a list of supported chains and features. `chainId` is the unique identifier for each chain and is used in other endpoints. While chain id returned is a number, endpoints can also accept chain id as hex string (e.g. `0x1e` instead of `30` for Rootstock).

Example response:
```json
{
  "data": [
    {
      "chainId": 30,
      "name": "Rootstock",
      "features": [
        "sdex"
      ]
    }
  ],
  "timestamp": 1630000000
}
```

#### GET /tokens

Returns a list of supported tokens and their details. Supports `pagination`. 
Tokens are ordered by `address`, so native tokens are listed first.

Endpoint data is cached for 1 minute.

`GET /tokens?chainId=30&spam=1`

Use optional `chainId` query parameter to filter tokens by chain.
Use optional `spam=1` query parameter to include tokens marked as spam / ignored by our dex.

Example response:
```json
{
  "data": [
    {
      "symbol": "RBTC",
      "name": "Rootstock Smart Bitcoin",
      "decimals": 18,
      "chainId": 30,
      "address": "0x0000000000000000000000000000000000000000",
      "usdPrice": "64499.13340664030853125",
      "usdPriceDate": "2024-08-26 08:17:00"
    }
  ],
  "timestamp": 1630000000
}
```


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

Example response:
```json
{
  "data": [
    {
      "chainId": 60808,
      "base": "0xba20a5e63eeEFfFA6fD365E7e540628F8fC61474",
      "quote": "0xf3107eEC1e6F067552C035FD87199e1A5169CB20",
      "poolIdx": 400
    }
  ],
  "timestamp": 1630000000
}
```

#### GET /sdex/volume

Returns volume of each token on sdex supported chain. `chainId` is required.

`GET /sdex/volume?chainId=60808`

Example response:
```json
{
  "data": [
    {
      "token": "0x05d032ac25d322df992303dca074ee7392c117b9",
      "volume": "15485068083"
    }
  ],
  "timestamp": 1630000000
}
```

#### GET /sdex/user_pool_positions

Returns active positions of a user in SDEX pools. 

`chainId`, `user`, `base`, `quote`, and `poolIdx` are required.

`base`, `quote` and `poolIdx` values can be obtained from `pool_list` endpoint.

`GET /sdex/user_pool_positions?user=0xe8cf2f9ffb1967cde68c70463b2256d1fff97c14&base=0xba20a5e63eeEFfFA6fD365E7e540628F8fC61474&quote=0xf3107eEC1e6F067552C035FD87199e1A5169CB20&poolIdx=400&chainId=0xed88`

Example response:
```json
{
  "data": [
    {
      "base": "0xba20a5e63eeEFfFA6fD365E7e540628F8fC61474",
      "quote": "0xf3107eEC1e6F067552C035FD87199e1A5169CB20",
      "ambientLiq": "32",
      "time": "1725445055",
      "transactionHash": "0x3bbbe0484395a172d35db9f70f68d30d39b07f5b740012a71a1c67a63550e3ae",
      "concLiq": "0",
      "rewardLiq": "0",
      "baseQty": "0",
      "quoteQty": "0",
      "aggregatedLiquidity": "2.381976568446569244259473638425390214159e+39",
      "aggregatedBaseFlow": "-21071669490001706",
      "aggregatedQuoteFlow": "19792463235931505",
      "positionType": "ambient",
      "bidTick": 0,
      "askTick": 0,
      "aprDuration": "0",
      "aprPostLiq": "0",
      "aprContributedLiq": "0",
      "aprEst": "0"
    },
    {
      "base": "0xba20a5e63eeEFfFA6fD365E7e540628F8fC61474",
      "quote": "0xf3107eEC1e6F067552C035FD87199e1A5169CB20",
      "ambientLiq": "0",
      "time": "1720686473",
      "transactionHash": "0x8f6a68f1210c8bf1106f04f17a29369537e4057993d3908aaa2b844182f1362e",
      "concLiq": "17020958841495730176",
      "rewardLiq": "2248568867146882",
      "baseQty": "5640436419245165444",
      "quoteQty": "0",
      "aggregatedLiquidity": "3000000000000000000",
      "aggregatedBaseFlow": "3000000000000000000",
      "aggregatedQuoteFlow": "1367470955558063389",
      "positionType": "concentrated",
      "bidTick": 2584,
      "askTick": 7696,
      "aprDuration": "1725445056.287",
      "aprPostLiq": "141901438378951078307.7740149289422995857665356746936375458933678",
      "aprContributedLiq": "17020958841495730176",
      "aprEst": "0.04167535218568008"
    },
  ],
  "timestamp": 1630000000
}
```

## Rate Limiting

The API is rate limited to 60 requests per minute. If you exceed this limit, you will receive a `429 Too Many Requests` response.
