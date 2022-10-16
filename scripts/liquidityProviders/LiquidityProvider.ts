import { RouteLeg, RPool } from "@sushiswap/tines"
import { BigNumber, ethers } from "ethers"
import { Limited } from "../Limited"
import { Network, Token } from "../networks/Network"

export class PoolRegistarator {
    pools: Map<string, LiquidityProvider>

    constructor() {
        this.pools = new Map<string, LiquidityProvider>()
    }

    addPools(pools: string[], provider: LiquidityProvider) {
        pools.forEach(p => this.pools.set(p, provider))
    }
    getProvider(pool: string): LiquidityProvider | undefined {
        return this.pools.get(pool)
    }
}

export abstract class LiquidityProvider {
    registrator: PoolRegistarator
    limited: Limited
    chainDataProvider: ethers.providers.BaseProvider
    network: Network

    constructor(
        r: PoolRegistarator, 
        chainDataProvider: ethers.providers.BaseProvider,
        network: Network,
        l: Limited
    ) {
        this.registrator = r
        this.limited = l
        this.chainDataProvider = chainDataProvider
        this.network = network
    }

    abstract getProviderName(): string;
    abstract getPools(t0: Token, t1: Token): Promise<RPool[]>;
    // the address where should be swap amount of liquidity before the swap
    getLegStartPoint(leg: RouteLeg): string {
        return leg.poolAddress
    }
    abstract getSwapCodeForRouteProcessor(leg: RouteLeg, toAddress: string, exactAmount?: BigNumber): string;
}