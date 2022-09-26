import { RouteLeg, RPool } from "@sushiswap/tines"
import { Token } from "../networks/Network"

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

    constructor(r: PoolRegistarator) {
        this.registrator = r
    }

    // abstract updateData(): void;
    abstract getProviderName(): string;
    abstract getPools(t0: Token, t1: Token): Promise<RPool[]>;
    abstract getSwapCodeForRouteProcessor(leg: RouteLeg, toAddress: string): string;
}