import { MultiRoute, RouteLeg } from "@sushiswap/tines"

interface Point {
  x: number,
  y: number
}

interface GraphPlacement {
  tokens: Map<string, Point>,   // a point where the token with <tokenId> should be rendered
  edges: Map<number, boolean>   // if a routeLeg with <index> should be rendered 
                                // horisontal-vertical (true) or vertical-horisontal (false)
}

function maxPoint(a: Point, b: Point) {
  return {x: Math.max(a.x, b.x), y: Math.max(a.y, b.y)}
}
function incPoint(p: Point) {
  return  {x: p.x + 1, y: p.y + 1}
}

class PlacementTable {
  table: Uint32Array
  size: number

  constructor(n: number) {
    this.size = n
    this.table = new Uint32Array(n*n)
    this.table.fill(0)
  }

  _getIndex(x: number, y: number): number {
    return x*this.size + y
  }

  isEmpty(x: number, y: number) {
    return this.table[this._getIndex(x, y)] == 0
  }
}

export function routePlacement(route: MultiRoute): GraphPlacement {
  const tokens: string[] = []
  const tokenSet = new Set<string>()
  const inputLegs = new Map<string, RouteLeg[]>()
  route.legs.forEach(l => {
    const tokenId = l.tokenFrom.tokenId as string
    if (!tokenSet.has(tokenId)) {
      tokens.push(tokenId)
      tokenSet.add(tokenId)
    }
    const legs = inputLegs.get(l.tokenTo.tokenId as string) || []
    legs.push(l)
    inputLegs.set(l.tokenTo.tokenId as string, legs)
  })
  const tokenTo = route.toToken.tokenId as string
  console.assert(!tokenSet.has(tokenTo), 'No swaps from output tokens are allowed')
  // inputLegs must contain all tokens except fromToken, 'tokens' - all tokens except toToken
  console.assert(tokens.length == inputLegs.size, 'Unexpected error 52')
  tokens.push(tokenTo)
  tokenSet.add(tokenTo)

  const tokenData = new Map<string, [Point, boolean]>()
  const table = new PlacementTable(tokens.length)
  let placementRect = {x: -1, y: -1}
  tokens.forEach(token => {
    let placement: Point = {x: 0, y: 0}
    let inputEdgesHV = false
    let inputEdgesVH = false;
    (inputLegs.get(token) || []).forEach(l => {
      const inputTokenData = tokenData.get(l.tokenFrom.tokenId as string)
      if (inputTokenData !== undefined) {
        placement = maxPoint(placement, inputTokenData[0])
        if (inputTokenData[1] == true) inputEdgesHV = true
        else inputEdgesVH = true
      } else console.assert(0, 'Enexpected error: Token was not placed')
      if (inputEdgesHV && inputEdgesVH) placement = incPoint(placementRect)
      else {

      }
    })
    placementRect = maxPoint(placement, placement)
  })
}