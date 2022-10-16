
import {getBigNumber, MultiRoute, RouteLeg, RouteStatus, RToken} from "@sushiswap/tines"
import { BigNumber } from "ethers";
import { HEXer } from "./HEXer";
import { PoolRegistarator } from "./liquidityProviders/LiquidityProvider";

function last<T>(arr: T[]):T {
  return arr[arr.length - 1]
}

export class TinesToRouteProcessor {
  routeProcessorAddress: string
  registrator: PoolRegistarator
  tokenOutputLegs: Map<string, RouteLeg[]>

  constructor(routeProcessorAddress: string, registrator: PoolRegistarator) {
    this.routeProcessorAddress = routeProcessorAddress
    this.registrator = registrator
    this.tokenOutputLegs = new Map()
  }

  getRouteProcessorCode(
    route: MultiRoute,
    toAddress: string,
  ): string {
    // 0. Check for no route
    if (route.status == RouteStatus.NoWay || route.legs.length == 0) return ''

    this.tokenOutputLegs = this.getTokenOutputLegs(route)

    let res = '0x'

    // 1. Transfer route.amountIn input tokens from msg.sender to all input pools according to proportion 'leg.absolutePortion'
    const inputDistribution = this.tokenDistribution(route.fromToken)
    let inputAmountPrevious: BigNumber = BigNumber.from(0)
    const inputAmount: Map<RouteLeg, BigNumber> = new Map()
    const lastLeg = last(last(inputDistribution)[1])
    inputDistribution.forEach(([startPoint, legs]) => {
      let inputAmountForThisStartPoint: BigNumber = BigNumber.from(0)
      legs.forEach(l => {
        const amount: BigNumber = l !== lastLeg ? 
          getBigNumber(route.amountIn * l.absolutePortion) : route.amountInBN.sub(inputAmountPrevious)
          inputAmountPrevious = inputAmountPrevious.add(amount)
          inputAmountForThisStartPoint = inputAmountForThisStartPoint.add(amount)
          inputAmount.set(l, amount)
      })
      res += this.codeTransferERC20(route.fromToken, startPoint, inputAmountForThisStartPoint)
    })
    console.assert(inputAmountPrevious.eq(route.amountInBN), "Wrong input distribution")

    route.legs.forEach(l => {
      // 2.1 Transfer tokens from the routeProcessor contract to the pool if it is necessary
      const neibourLegs = this.tokenOutputLegs.get(l.tokenFrom.tokenId as string) as RouteLeg[]
      if (neibourLegs.length > 1 && l.tokenFrom != route.fromToken) {
        res += this.codeSendERC20(l.tokenFrom, l.poolAddress, l.swapPortion)
      }

      // 2.2 Make swap
      const outLegs = this.tokenOutputLegs.get(l.tokenTo.tokenId as string)
      let outAddress
      if (outLegs == undefined) {
        // output leg - send swap's output directly to toAddress
        outAddress = toAddress
      } else if (outLegs.length == 1) {
        // swap without fork - send swap's output directly to the next pool
        outAddress = outLegs[0].poolAddress
      } else {
        // swap without further fork - send swap's output to the RouteProcessor
        outAddress = this.routeProcessorAddress
      }
      res += this.codeSwap(l, outAddress, this.registrator, inputAmount.get(l))
    })

    return res;
  }

  getTokenOutputLegs(route: MultiRoute): Map<string, RouteLeg[]> {
    const res = new Map<string, RouteLeg[]>()

    route.legs.forEach(l => {
      const tokenId = l.tokenFrom.tokenId?.toString()
      if (tokenId === undefined) {
        console.assert(0, "Unseted tokenId")
      } else {
        const legsOutput = res.get(tokenId) || []
        legsOutput.push(l)
        res.set(tokenId, legsOutput)
      }
    })

    return res
  }

  // Transfers tokens from msg.sender to a pool
  codeTransferERC20(token: RToken, poolAddress: string, amount: BigNumber): string {
    const code = new HEXer().uint8(1).address(poolAddress).uint(amount).toString()
    console.assert(code.length == 53*2, "codeTransferERC20 unexpected code length")
    return code
  }

  // Sends tokens from the RouteProcessor to a pool
  codeSendERC20(token: RToken, poolAddress: string, share: number): string {
    const code = new HEXer().uint8(2).address(token.address)
      .address(poolAddress).uint16(Math.round(share*65535)).toString()
    console.assert(code.length == 43*2, "codeSendERC20 unexpected code length")
    return code
  }

  codeSwap(leg: RouteLeg, toAddress: string, reg: PoolRegistarator, exactAmount?: BigNumber): string {
    const provider = reg.getProvider(leg.poolAddress)
    if (provider !== undefined) {
      const code = provider.getSwapCodeForRouteProcessor(leg, toAddress, exactAmount)
      return code
    } else {
      throw new Error("unknown pool: " + leg.poolAddress)
    }
  }

  tokenDistribution(token: RToken): [string, RouteLeg[]][] {
    const distribution = new Map<string, RouteLeg[]>()
    const legs = this.tokenOutputLegs.get(token.tokenId as string)
    legs?.forEach(l => {
      const provider = this.registrator.getProvider(l.poolAddress)
      const startPoint = provider?.getLegStartPoint(l)
      if (startPoint !== undefined) {
        const legs = distribution.get(startPoint) || []
        legs.push(l)
        distribution.set(startPoint, legs)
      }
    })
    return Array.from(distribution.entries())
  }
}

export function getRouteProcessorCode(
  route: MultiRoute, 
  routeProcessorAddress: string, 
  toAddress: string,
  reg: PoolRegistarator
): string {
  const rpc = new TinesToRouteProcessor(routeProcessorAddress, reg)
  return rpc.getRouteProcessorCode(route, toAddress)
}