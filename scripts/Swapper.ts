import { findMultiRouteExactIn, getBigNumber, MultiRoute, NetworkInfo } from "@sushiswap/tines";
import { BigNumber, Contract, ethers } from "ethers";
import { Network, Token } from "./networks/Network";
import { PoolRegistarator } from "./liquidityProviders/LiquidityProvider";
import { SushiProvider } from "./liquidityProviders/Sushi";
import { getRouteProcessorCode } from "./TinesToRouteProcessor";
import * as RouteProcessorABI from "../artifacts/contracts/RouteProcessor.sol/RouteProcessor.json"
import { UniswapProvider } from "./liquidityProviders/Uniswap";
import { convertTokenToBento, getBentoChainId, TridentProvider } from "./liquidityProviders/Trident";
import { Limited } from "./Limited";

export class Swapper {
  poolRegistarator: PoolRegistarator
  routeProcessor: string
  chainDataProvider: ethers.providers.BaseProvider
  network: Network
  poolsNumber: {[network: string]: number}
  limited: Limited

  constructor(routeProcessor: string, chainDataProvider: ethers.providers.BaseProvider, net: Network) {
    this.poolRegistarator = new PoolRegistarator()
    this.routeProcessor = routeProcessor
    this.chainDataProvider = chainDataProvider
    this.network = net
    this.poolsNumber = {}
    this.limited = new Limited(12, 1000)    // Free Alchemy account allows 330/26 eth_calls per second
  }

  async getRoute(tokenIn: Token, amountIn: BigNumber, tokenOut: Token): Promise<MultiRoute> {
    const providers = [
      //new SushiProvider(this.poolRegistarator, this.chainDataProvider, this.network, this.limited),
      //new UniswapProvider(this.poolRegistarator, this.chainDataProvider, this.network, this.limited),
      new TridentProvider(this.poolRegistarator, this.chainDataProvider, this.network, this.limited),
    ]
    const poolsPromises = providers.map(p => p.getPools(tokenIn, tokenOut))
    const poolsArrays = await Promise.all(poolsPromises)
    poolsArrays.forEach((a, i) => this.poolsNumber[providers[i].getPoolProviderName()] = a.length)
    const pools = poolsArrays.reduce((prev, curr) => prev.concat(curr), [])

    const networks: NetworkInfo[] = [{
      chainId: this.network.chainId,
      baseToken:this.network.baseWrappedToken, 
      gasPrice: 50e9
    }, {
      chainId: getBentoChainId(this.network.chainId),
      baseToken: convertTokenToBento(this.network.baseWrappedToken), 
      gasPrice: 50e9
    }]

    const route = findMultiRouteExactIn(tokenIn, tokenOut, amountIn, pools, networks,  50e9)
    return route
  }

  getRouteProcessorCode(route: MultiRoute, to: string): string {
    //const amountOutMin = route.amountInBN.mul(getBigNumber((1 - slippageTolerance)*1_000_000)).div(1_000_000)
    const code = getRouteProcessorCode(route, this.routeProcessor, to, this.poolRegistarator)
    return code
  }

  getPoolsProviderName(poolAddress: string): string {
    return this.poolRegistarator.getPoolProvider(poolAddress)?.getPoolProviderName() as string
  }
  // async callRouteProcessor(code: string) {
  //   const routeProcessor = new Contract(this.routeProcessor, RouteProcessorABI, "RouteProcessor")
  // }
}