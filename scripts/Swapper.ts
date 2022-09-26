import { findMultiRouteExactIn, getBigNumber, MultiRoute } from "@sushiswap/tines";
import { BigNumber, Contract, ethers } from "ethers";
import { Token } from "./networks/Network";
import { PoolRegistarator } from "./liquidityProviders/LiquidityProvider";
import { SushiProvider } from "./liquidityProviders/Sushi";
import {ETHEREUM} from './networks/Ethereum'
import { getRouteProcessorCode } from "./TinesToRouteProcessor";
import * as RouteProcessorABI from "../artifacts/contracts/RouteProcessor.sol/RouteProcessor.json"
import { UniswapProvider } from "./liquidityProviders/Uniswap";

export class Swapper {
  poolRegistarator: PoolRegistarator
  routeProcessor: string
  chainDataProvider: ethers.providers.BaseProvider

  constructor(routeProcessor: string, chainDataProvider: ethers.providers.BaseProvider) {
    this.poolRegistarator = new PoolRegistarator()
    this.routeProcessor = routeProcessor
    this.chainDataProvider = chainDataProvider
  }

  async getRoute(tokenIn: Token, amountIn: BigNumber, tokenOut: Token): Promise<[MultiRoute, number]> {
    const sushiProvider: SushiProvider = new SushiProvider(this.poolRegistarator, this.chainDataProvider)
    const uniProvider: UniswapProvider = new UniswapProvider(this.poolRegistarator, this.chainDataProvider)
    const poolsSu = sushiProvider.getPools(tokenIn, tokenOut)
    const poolsUni = uniProvider.getPools(tokenIn, tokenOut)
    const poolsPre = await Promise.all([poolsSu, poolsUni])
    const pools = [...poolsPre[0], ...poolsPre[1]]
    const route = findMultiRouteExactIn(tokenIn, tokenOut, amountIn, pools, ETHEREUM.tokens.WETH9,  50e9)
    return [route, pools.length]
  }

  getRouteProcessorCode(route: MultiRoute, to: string): string {
    //const amountOutMin = route.amountInBN.mul(getBigNumber((1 - slippageTolerance)*1_000_000)).div(1_000_000)
    const code = getRouteProcessorCode(route, this.routeProcessor, to, this.poolRegistarator)
    return code
  }

  getPoolsProviderName(poolAddress: string): string {
    return this.poolRegistarator.getProvider(poolAddress)?.getProviderName() as string
  }
  // async callRouteProcessor(code: string) {
  //   const routeProcessor = new Contract(this.routeProcessor, RouteProcessorABI, "RouteProcessor")
  // }
}