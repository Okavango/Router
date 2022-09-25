# Universal RouterProcessor Proof of Concept

## install

```sh
yarn
```

## Test

```sh
yarn test
```

## Test Result Example:

```sh
  RouteProcessor
1. RouterProcessor deployment ...
2. User creation ...
3. Deposit user's 10ETH to WETH9
4. Approve user's WETH to the route processor ...
5. Fetch Sushiswap and Uniswap pools' data ...
    54 pools were found
6. Create Route ...
    Input: 10000000000000000000 Wrapped Ether
    Wrapped Ether 20% Sushiswap -> USD Coin
    Wrapped Ether 6% Sushiswap -> FRAX
    Wrapped Ether 4% Sushiswap -> SushiToken
    Wrapped Ether 68% UniswapV2 -> Fei USD
    Wrapped Ether 2% UniswapV2 -> DPI
    DPI 100% Sushiswap -> Fei USD
    SushiToken 100% Sushiswap -> FRAX
    FRAX 100% UniswapV2 -> Fei USD
    USD Coin 100% UniswapV2 -> Fei USD
    Output: 4605120249550685077504 Fei USD
7. Create route processor code ...
8. Call route processor ...
9. Fetching user's output balance ...
    expected amountOut: 4605120249550685077504
    real amountOut:     4605120249502987925860
    slippage: 0%
    gas use: 593233
    √ RouteProcessor WETH => FEI check (253808ms)
```