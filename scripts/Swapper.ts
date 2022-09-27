import { findMultiRouteExactIn, getBigNumber, MultiRoute } from "@sushiswap/tines";
import { BigNumber, Contract, ethers } from "ethers";
import { Network, Token } from "./networks/Network";
import { PoolRegistarator } from "./liquidityProviders/LiquidityProvider";
import { SushiProvider } from "./liquidityProviders/Sushi";
import { getRouteProcessorCode } from "./TinesToRouteProcessor";
import * as RouteProcessorABI from "../artifacts/contracts/RouteProcessor.sol/RouteProcessor.json"
import { UniswapProvider } from "./liquidityProviders/Uniswap";

export class Swapper {
  poolRegistarator: PoolRegistarator
  routeProcessor: string
  chainDataProvider: ethers.providers.BaseProvider
  network: Network
  poolsNumber: {[network: string]: number}

  constructor(routeProcessor: string, chainDataProvider: ethers.providers.BaseProvider, net: Network) {
    this.poolRegistarator = new PoolRegistarator()
    this.routeProcessor = routeProcessor
    this.chainDataProvider = chainDataProvider
    this.network = net
    this.poolsNumber = {}
  }

  async getRoute(tokenIn: Token, amountIn: BigNumber, tokenOut: Token): Promise<MultiRoute> {
    const sushiProvider: SushiProvider = new SushiProvider(this.poolRegistarator, this.chainDataProvider, this.network)
    const uniProvider: UniswapProvider = new UniswapProvider(this.poolRegistarator, this.chainDataProvider, this.network)
    const poolsSu = sushiProvider.getPools(tokenIn, tokenOut)
    const poolsUni = uniProvider.getPools(tokenIn, tokenOut)
    const poolsPre = await Promise.all([poolsSu, poolsUni])
    this.poolsNumber[sushiProvider.getProviderName()] = poolsPre[0].length
    this.poolsNumber[uniProvider.getProviderName()] = poolsPre[1].length
    const pools = [...poolsPre[0], ...poolsPre[1]]
    const route = findMultiRouteExactIn(tokenIn, tokenOut, amountIn, pools, this.network.baseWrappedToken,  50e9)
    return route
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