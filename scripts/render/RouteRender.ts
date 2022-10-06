import { MultiRoute, RToken } from '@sushiswap/tines'
import { SVG, Svg, Element, Box, Rect } from '@svgdotjs/svg.js'

const TOKEN_WIDTH = 200
const TOKEN_HEIGH = 100
const TOKEN_RX = 20
const TOKEN_RY = TOKEN_RX
const TOKEN_BETWEEN = 200
const TOKEN_AROUND = 5

// svg text{
//     text-anchor: middle;
//     //alignment-baseline: middle;
//     //dominant-baseline: central;
// }

export class RouteRender {
    svg: Svg
    bbox: Box

    constructor(element: Element) {
        this.svg = SVG(element) as Svg
        this.bbox = new Box(0,0,0,0)
    }

    render(route: MultiRoute): Svg {
        const tokens: RToken[] = []
        const tokenSet = new Set<string>()
        route.legs.forEach(l => {
          const tokenId = l.tokenFrom.tokenId as string
          if (!tokenSet.has(tokenId)) {
            tokens.push(l.tokenFrom)
            tokenSet.add(tokenId)
          }
        })
        const tokenTo = route.toToken.tokenId as string
        console.assert(!tokenSet.has(tokenTo), 'No swaps from output tokens are allowed')
        tokens.push(route.toToken)

        tokens.forEach ((t, i) => this.printToken(t, i))

        this.svg.viewbox(this.bbox)
        return this.svg
    }

    renderTest() {
        const tokens = [1,2]

        tokens.forEach ((t, i) => this.printToken(t, i))

        this.svg.viewbox(this.bbox)
        return this.svg
    }

    printToken(token: RToken, index: number) {
        const group = this.svg.group()
        const x = index * (TOKEN_WIDTH + TOKEN_BETWEEN)
        group.rect(TOKEN_WIDTH, TOKEN_HEIGH)
            .move(x, 0).radius(TOKEN_RX, TOKEN_RY)
            .fill('transparent')
            .stroke('black')
        const bbox = group.bbox()
        group.text("Test")
            .move(bbox.x + bbox.w/2, bbox.y + bbox.h/2)
            .font({size: 70, family: 'Helvetica'})
        this._addBox(new Box(x-TOKEN_AROUND, -TOKEN_AROUND, TOKEN_WIDTH + 2*TOKEN_AROUND, TOKEN_HEIGH + 2*TOKEN_AROUND))
    }

    _addBox(box: Box) {
        this.bbox = this.bbox.merge(box)
    }
}