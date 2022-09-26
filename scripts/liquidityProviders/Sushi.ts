import { ConstantProductRPool, RouteLeg, RPool } from "@sushiswap/tines";
import {ethers} from 'ethers'
import { LiquidityProvider, PoolRegistarator } from "./LiquidityProvider";
import { getCreate2Address } from "ethers/lib/utils";
import { keccak256, pack } from '@ethersproject/solidity'
import { SushiPoolABI } from "../../ABI/SushiPool";
import { HEXer } from "../HEXer";
import { Network, Token } from "../networks/Network";

const SUSHISWAP_FACTORY = {
  1: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac'
}

const INIT_CODE_HASH = {
  1: '0xe18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303'
}

function getAllRouteTokens(net: Network,  t1: Token, t2: Token) {
  const set = new Set<Token>([
    t1, 
    t2, 
    ...net.BASES_TO_CHECK_TRADES_AGAINST, 
    ...(net.ADDITIONAL_BASES[t1.address] || []),
    ...(net.ADDITIONAL_BASES[t2.address] || []),
   ])
   return Array.from(set)
}

export function getPoolAddress(net: Network, t1: Token, t2: Token): string {
  const [token0, token1] = t1.address.toLowerCase() < t2.address.toLowerCase() ? [t1, t2] : [t2, t1]
  return getCreate2Address(
    SUSHISWAP_FACTORY[net.chainId],
    keccak256(['bytes'], [pack(['address', 'address'], [token0.address, token1.address])]),
    INIT_CODE_HASH[net.chainId]
  )
}

async function getPoolData(net: Network, t0: Token, t1: Token, chainDataProvider: ethers.providers.BaseProvider): 
  Promise<RPool|undefined> {
  const [token0, token1] = t0.address.toLowerCase() < t1.address.toLowerCase() ? [t0, t1] : [t1, t0]
  const poolAddress = getPoolAddress(net, token0, token1)
  try {
    const pool = await new ethers.Contract(poolAddress, SushiPoolABI, chainDataProvider)
    const reserves = await pool.getReserves()
    return new ConstantProductRPool(poolAddress, token0, token1, 0.003, reserves.reserve0, reserves.reserve1)
  } catch (e) {
    return undefined
  }
}

async function getAllPools(net: Network, tokens: Token[], chainDataProvider: ethers.providers.BaseProvider): Promise<RPool[]> {
  const poolData: Promise<RPool|undefined>[] = []
  for (let i = 0; i < tokens.length; ++i) {
    for (let j = i+1; j < tokens.length; ++j) {
      poolData.push(getPoolData(net, tokens[i], tokens[j], chainDataProvider))
    }
  }
  const pools = await Promise.all(poolData)
  return pools.filter(p => p !== undefined) as RPool[]
}

export class SushiProvider extends LiquidityProvider {
  pools: Map<string, RPool>
  chainDataProvider: ethers.providers.BaseProvider
  network: Network

  constructor(r: PoolRegistarator, chainDataProvider: ethers.providers.BaseProvider, net: Network) {
    super(r)
    this.pools = new Map<string, RPool>()
    this.chainDataProvider = chainDataProvider
    this.network = net
  }

  getProviderName(): string {return 'Sushiswap'}

  async getPools(t0: Token, t1: Token): Promise<RPool[]> {
    const tokens = getAllRouteTokens(this.network, t0, t1)
    const pools = await getAllPools(this.network, tokens, this.chainDataProvider)
    this.registrator.addPools(pools.map(p => p.address), this)
    pools.forEach(p => this.pools.set(p.address, p))
    return pools
  }

  getSwapCodeForRouteProcessor(leg: RouteLeg, toAddress: string): string {
    const {poolAddress, tokenFrom} = leg
    const pool = this.pools.get(poolAddress)
    if (pool === undefined) {
      throw new Error("Unknown pool " + poolAddress)
    } else {
      if (tokenFrom.address !== pool.token0.address && tokenFrom.address !== pool.token1.address) {
        throw new Error(`Unknown token ${tokenFrom.address} for the pool ${poolAddress}`)
      }
      // swapUniswapPool = 0x20(address pool, address tokenIn, bool direction, address to)
      const code = new HEXer()
        .uint8(20).address(poolAddress)
        .address(tokenFrom.address).bool(tokenFrom.address == pool.token0.address)
        .address(toAddress).toString()
      console.assert(code.length == 62*2, "Sushi.getSwapCodeForRouteProcessor unexpected code length")
      return code
    }
  }
}