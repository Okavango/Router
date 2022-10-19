import { MultiRoute, RouteLeg, RPool } from "@sushiswap/tines";
import { BigNumber } from "ethers";

// RPool extention for RP coding
export abstract class PoolCode {
  pool: RPool
  providerName: string

  constructor(pool: RPool, providerName: string) {
    this.pool = pool
    this.providerName = providerName
  }

  static RouteProcessorAddress = 'RouteProcessor'

  // the address where should be swap amount of liquidity before the swap
  // returns RouteProcessorAddress if it is a RouteProcessor
  getStartPoint(_leg: RouteLeg, _route: MultiRoute): string {
    return this.pool.address
  }

  abstract getSwapCodeForRouteProcessor(leg: RouteLeg, route: MultiRoute, to: string, exactAmount?: BigNumber): string
}