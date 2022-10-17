import { RouteLeg, RPool } from "@sushiswap/tines"
import { BigNumber, ethers } from "ethers"
import { Limited } from "../Limited"
import { Network, Token } from "../networks/Network"

export class PoolRegistarator {
    pools: Map<string, LiquidityProvider>
    tokens: Map<string, LiquidityProvider>

    constructor() {
        this.pools = new Map<string, LiquidityProvider>()
        this.tokens = new Map<string, LiquidityProvider>()
    }

    addPools(pools: string[], provider: LiquidityProvider) {
        pools.forEach(p => this.pools.set(p, provider))
    }
    getPoolProvider(pool: string): LiquidityProvider | undefined {
        return this.pools.get(pool)
    }
    
    addTokens(tokenIds: string[], provider: LiquidityProvider) {
        tokenIds.forEach(p => this.tokens.set(p, provider))
    }
    getTokenProvider(tokenId: string): LiquidityProvider | undefined {
        return this.tokens.get(tokenId)
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

    abstract getPoolProviderName(): string;
    abstract getPools(t0: Token, t1: Token): Promise<RPool[]>;
    abstract getSwapCodeForRouteProcessor(leg: RouteLeg, toAddress: string, exactAmount?: BigNumber): string;

    // the address where should be swap amount of liquidity before the swap
    // returns 'RouteProcessor' if it is a RouteProcessor
    getLegStartPoint(leg: RouteLeg): string {
        return leg.poolAddress
    }

    getTokenSendCodeFromRouteProcessor(_leg: RouteLeg, _toAddress: string, _share: number): string {
        return 'getTokenSendCodeFromRouteProcessor is Undefined'
    }
}