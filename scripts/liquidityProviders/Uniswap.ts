import { ConstantProductRPool, RouteLeg, RPool } from "@sushiswap/tines";
import {ethers} from 'ethers'
import { LiquidityProvider, PoolRegistarator } from "./LiquidityProvider";
import { getCreate2Address } from "ethers/lib/utils";
import { keccak256, pack } from '@ethersproject/solidity'
import { SushiPoolABI } from "../../ABI/SushiPool";
import { HEXer } from "../HEXer";
import { Token } from "../networks/Network";
import {ETHEREUM} from '../networks/Ethereum'

function getAllRouteTokens(t1: Token, t2: Token) {
  const set = new Set<Token>([
    t1, 
    t2, 
    ...ETHEREUM.BASES_TO_CHECK_TRADES_AGAINST, 
    ...(ETHEREUM.ADDITIONAL_BASES[t1.address] || []),
    ...(ETHEREUM.ADDITIONAL_BASES[t2.address] || []),
   ])
   return Array.from(set)
}

export function getPoolAddress(t1: Token, t2: Token): string {
  const [token0, token1] = t1.address.toLowerCase() < t2.address.toLowerCase() ? [t1, t2] : [t2, t1]
  return getCreate2Address(
    '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', // univ2 factoryAddress,
    keccak256(['bytes'], [pack(['address', 'address'], [token0.address, token1.address])]),
    '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f' //INIT_CODE_HASH[token0.chainId]
  )
}

async function getPoolData(t0: Token, t1: Token, chainDataProvider: ethers.providers.BaseProvider): 
  Promise<RPool|undefined> {
  const [token0, token1] = t0.address.toLowerCase() < t1.address.toLowerCase() ? [t0, t1] : [t1, t0]
  const poolAddress = getPoolAddress(token0, token1)
  try {
    const pool = await new ethers.Contract(poolAddress, SushiPoolABI, chainDataProvider)
    const reserves = await pool.getReserves()
    return new ConstantProductRPool(poolAddress, token0, token1, 0.003, reserves.reserve0, reserves.reserve1)
  } catch (e) {
    return undefined
  }
}

async function getAllPools(tokens: Token[], chainDataProvider: ethers.providers.BaseProvider): Promise<RPool[]> {
  const poolData: Promise<RPool|undefined>[] = []
  for (let i = 0; i < tokens.length; ++i) {
    for (let j = i+1; j < tokens.length; ++j) {
      poolData.push(getPoolData(tokens[i], tokens[j], chainDataProvider))
    }
  }
  const pools = await Promise.all(poolData)
  return pools.filter(p => p !== undefined) as RPool[]
}

export class UniswapProvider extends LiquidityProvider {
  pools: Map<string, RPool>
  chainDataProvider: ethers.providers.BaseProvider

  constructor(r: PoolRegistarator, chainDataProvider: ethers.providers.BaseProvider) {
    super(r)
    this.pools = new Map<string, RPool>()
    this.chainDataProvider = chainDataProvider
  }

  getProviderName(): string {return 'UniswapV2'}

  async getPools(t0: Token, t1: Token): Promise<RPool[]> {
    const tokens = getAllRouteTokens(t0, t1)
    const pools = await getAllPools(tokens, this.chainDataProvider)
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