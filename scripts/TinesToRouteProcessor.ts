
import {getBigNumber, MultiRoute, RouteLeg, RouteStatus, RToken} from "@sushiswap/tines"
import { assert } from "console";
import { BigNumber, ethers } from "ethers";
import { HEXer } from "./HEXer";
import { PoolRegistarator } from "./liquidityProviders/LiquidityProvider";

export function getRouteProcessorCode(
  route: MultiRoute, 
  routeProcessorAddress: string, 
  toAddress: string,
  reg: PoolRegistarator
): string {
  // 0. Check for no route
  if (route.status == RouteStatus.NoWay || route.legs.length == 0) return ''

  const tokenOutputLegs = getTokenOutputLegs(route)
  //const tokenTransferred = new Map<string, BigNumber>()

  let res = '0x'

  // 1. Transfer route.amountIn input tokens from msg.sender to all input pools according to proportion 'leg.absolutePortion'
  const inputLegs = tokenOutputLegs.get(route.fromToken.tokenId as string) as RouteLeg[]
  let inputAmountPrevious: BigNumber = BigNumber.from(0)
  const inputAmount: Map<RouteLeg, BigNumber> = new Map()
  inputLegs.forEach(l => {
    const amount: BigNumber = l.swapPortion != 1 ? 
      getBigNumber(route.amountIn * l.absolutePortion) : route.amountInBN.sub(inputAmountPrevious)
    res += codeTransferERC20(route.fromToken, l.poolAddress, amount)
    inputAmountPrevious = inputAmountPrevious.add(amount)
    inputAmount.set(l, amount)
  })
  assert(inputAmountPrevious.eq(route.amountInBN), "Wrong input distribution")

  route.legs.forEach(l => {
    // 2.1 Transfer tokens from the routeProcessor contract to the pool if it is necessary
    const neibourLegs = tokenOutputLegs.get(l.tokenFrom.tokenId as string) as RouteLeg[]
    if (neibourLegs.length > 1 && l.tokenFrom != route.fromToken) {
      res += codeSendERC20(route.fromToken, l.poolAddress, l.swapPortion)
    }

    // 2.2 Make swap
    const outLegs = tokenOutputLegs.get(l.tokenTo.tokenId as string)
    let outAddress
    if (outLegs == undefined) {
      // output leg - send swap's output directly to toAddress
      outAddress = toAddress
    } else if (outLegs.length == 1) {
      // swap without fork - send swap's output directly to the next pool
      outAddress = outLegs[0].poolAddress
    } else {
      // swap without further fork - send swap's output to the RouteProcessor
      outAddress = routeProcessorAddress
    }
    res += codeSwap(l, outAddress, reg, inputAmount.get(l))
  })

  return res;
}

function getTokenOutputLegs(route: MultiRoute): Map<string, RouteLeg[]> {
  const res = new Map<string, RouteLeg[]>()

  route.legs.forEach(l => {
    const tokenId = l.tokenFrom.tokenId?.toString()
    if (tokenId === undefined) {
      assert(0, "Unseted tokenId")
    } else {
      const legsOutput = res.get(tokenId) || []
      legsOutput.push(l)
      res.set(tokenId, legsOutput)
    }
  })

  return res
}

// Transfers tokens from msg.sender to a pool
function codeTransferERC20(token: RToken, poolAddress: string, amount: BigNumber): string {
  const code = new HEXer().uint8(1).address(poolAddress).uint(amount).toString()
  assert(code.length == 53*2, "codeTransferERC20 unexpected code length")
  return code
}

// Sends tokens from the RouteProcessor to a pool
function codeSendERC20(token: RToken, poolAddress: string, share: number): string {
  const code = new HEXer().uint8(2).address(token.address)
    .address(poolAddress).uint16(Math.round(share*65535)).toString()
  assert(code.length == 43*2, "codeSendERC20 unexpected code length")
  return code
}

function codeSwap(leg: RouteLeg, toAddress: string, reg: PoolRegistarator, exactAmount?: BigNumber): string {
  const provider = reg.getProvider(leg.poolAddress)
  if (provider !== undefined) {
    const code = provider.getSwapCodeForRouteProcessor(leg, toAddress, exactAmount)
    return code
  } else {
    throw new Error("unknown pool: " + leg.poolAddress)
  }
}