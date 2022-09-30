import { findMultiRouteExactIn, getBigNumber, MultiRoute } from "@sushiswap/tines";
import { BigNumber, Contract, ethers } from "ethers";
import { Network, Token } from "./networks/Network";
import { PoolRegistarator } from "./liquidityProviders/LiquidityProvider";
import { SushiProvider } from "./liquidityProviders/Sushi";
import { getRouteProcessorCode } from "./TinesToRouteProcessor";
import * as RouteProcessorABI from "../artifacts/contracts/RouteProcessor.sol/RouteProcessor.json"
import { UniswapProvider } from "./liquidityProviders/Uniswap";
import { TridentProvider } from "./liquidityProviders/Trident";
import { Limited } from "./Limited";

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
    const limited = new Limited(15, 1000)
    const providers = [
      //new SushiProvider(this.poolRegistarator, this.chainDataProvider, this.network, limited),
      new UniswapProvider(this.poolRegistarator, this.chainDataProvider, this.network, limited),
      new TridentProvider(this.poolRegistarator, this.chainDataProvider, this.network, limited),
    ]
    const poolsPromises = providers.map(p => p.getPools(tokenIn, tokenOut))
    const poolsArrays = await Promise.all(poolsPromises)
    poolsArrays.forEach((a, i) => this.poolsNumber[providers[i].getProviderName()] = a.length)

    const pools = poolsArrays.reduce((prev, curr) => prev.concat(curr), [])
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