import { findMultiRouteExactIn, getBigNumber, MultiRoute } from "@sushiswap/tines";
import { BigNumber, Contract, ethers } from "ethers";
import { Token } from "./liquidityProviders/EthereumTokens";
import { PoolRegistarator } from "./liquidityProviders/LiquidityProvider";
import { SushiProvider } from "./liquidityProviders/Sushi";
import * as ETHEREUM from './liquidityProviders/EthereumTokens'
import { getRouteProcessorCode } from "./TinesToRouter";
import * as RouteProcessorABI from "../artifacts/contracts/RouteProcessor2.sol/RouteProcessor2.json"

export class Swapper {
  poolRegistarator: PoolRegistarator
  routeProcessor: string
  chainDataProvider: ethers.providers.BaseProvider

  constructor(routeProcessor: string, chainDataProvider: ethers.providers.BaseProvider) {
    this.poolRegistarator = new PoolRegistarator()
    this.routeProcessor = routeProcessor
    this.chainDataProvider = chainDataProvider
  }

  async getRoute(tokenIn: Token, amountIn: BigNumber, tokenOut: Token): Promise<MultiRoute> {
    const sushiProvider: SushiProvider = new SushiProvider(this.poolRegistarator, this.chainDataProvider)
    const pools = await sushiProvider.getPools(tokenIn, tokenOut)
    const route = findMultiRouteExactIn(tokenIn, tokenOut, amountIn, pools, ETHEREUM.WETH9,  50e9)
    return route
  }

  getRouterProcessorCode(route: MultiRoute, to: string): string {
    //const amountOutMin = route.amountInBN.mul(getBigNumber((1 - slippageTolerance)*1_000_000)).div(1_000_000)
    const code = getRouteProcessorCode(route, this.routeProcessor, to, this.poolRegistarator)
    return code
  }

  // async callRouter(code: string) {
  //   const routeProcessor = new Contract(this.routeProcessor, RouteProcessorABI, "RouteProcessor2")
  // }
}