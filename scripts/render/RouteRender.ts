import { MultiRoute, RouteLeg, RToken } from '@sushiswap/tines'
import { SVG, Svg, Element, Box, Rect, Point } from '@svgdotjs/svg.js'
import { pbkdf2 } from 'crypto'

const TOKEN_WIDTH = 200
const TOKEN_HEIGH = 100
const TOKEN_RX = 20
const TOKEN_RY = TOKEN_RX
const TOKEN_IN = 50
const TOKEN_OUT = 150
const TOKEN_BETWEEN = 200

const EDGE_DIST = 50
const EDGE_R = 25
const EDGE_LABEL_VSHIFT = -10

const VIEWBOX_AROUND = 5

// svg text{
//     text-anchor: middle;
//     //alignment-baseline: middle;
//     //dominant-baseline: central;
// }

export class RouteRender {
    svg: Svg
    bbox: Box
    placement: Map<string, Point>
    edges: Map<[string, string], RouteLeg[]>
    lastEdgeLevel: number

    constructor(element: Element) {
        this.svg = SVG(element) as Svg
        this.bbox = new Box(0,0,0,0)
        this.placement = new Map()
        this.edges = new Map()
        this.lastEdgeLevel = 0
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
          const tokenPair: [string, string] = [l.tokenFrom.tokenId as string, l.tokenTo.tokenId as string]
          const legs = this.edges.get(tokenPair) || []
          legs.push(l)
          this.edges.set(tokenPair, legs)
        })
        const tokenTo = route.toToken.tokenId as string
        console.assert(!tokenSet.has(tokenTo), 'No swaps from output tokens are allowed')
        tokens.push(route.toToken)

        tokens.forEach ((t, i) => this.printToken(t, i))

        Array.from(this.edges.values()).forEach(e => {
            this.printEdge(e)
        })

        this.svg.viewbox(this.bbox)
        return this.svg
    }

    renderTest() {
        const tokens = [{
            address: '',
            name: 'USDC coin',
            symbol: 'USDC',
            tokenId: '1'
        },{
            address: '',
            name: 'Dai stable coin',
            symbol: 'Dai',
            tokenId: '2'
        }]

        const legs: RouteLeg[] = [{
            tokenFrom: tokens[0],
            tokenTo: tokens[1],
            poolAddress: 'erwerfwerwer',
            poolFee:0.003,
            assumedAmountIn: 0,
            assumedAmountOut: 0,
            swapPortion: 1,
            absolutePortion: 1
        }]

        tokens.forEach ((t, i) => this.printToken(t, i))
debugger
        this.printEdge(legs)

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
        group.text(token.symbol)
            .move(bbox.x + bbox.w/2, bbox.y + bbox.h/2)
            .font({size: 70, family: 'Helvetica'})

        this.placement.set(token.tokenId as string, new Point(x, 0))
        this._addBox(x, 0, TOKEN_WIDTH, TOKEN_HEIGH)
    }

    printEdge(legs: RouteLeg[]) {
        const tokenFrom = this.placement.get(legs[0].tokenFrom.tokenId as string)
        const tokenTo = this.placement.get(legs[0].tokenTo.tokenId as string)
        if (tokenFrom !== undefined && tokenTo !== undefined) {
            this.lastEdgeLevel = -this.lastEdgeLevel + (this.lastEdgeLevel < 0 ? 0 : -1 )
            const p0 = new Point(tokenFrom.x + TOKEN_OUT, this.lastEdgeLevel < 0 ? 0 : TOKEN_HEIGH)
            const p1 = new Point(p0.x, p0.y + EDGE_DIST*this.lastEdgeLevel)
            const p2 = new Point(tokenTo.x + TOKEN_IN, p1.y)
            const p3 = new Point(p2.x, this.lastEdgeLevel < 0 ? 0 : TOKEN_HEIGH)
            const absolutePortion = legs.reduce((prev, curr) => prev += curr.absolutePortion, 0)
            this.printArrow([p0, p1, p2, p3], `${Math.round(absolutePortion*100)}% / ${legs.length} pools`)
        } else console.assert(0, `Unplaced token`)
    }

    printArrow(points: Point[], label: string) {
        let p0 = points[0]
        let path = `M${p0.x} ${p0.y}`
        let maxHorSegment = -1
        let maxHorSegmLength = 0
        for (let i = 1; i < points.length; ++i) {
            const p0 = points[i-1]
            const p1 = points[i]
            if (p1.x == p0.x) path += ` v${p1.y - p0.y}`
            else if (p1.y == p0.y) {
                path += ` h${p1.x - p0.x}`
                const segmLength = Math.abs(p1.x - p0.x)
                if (segmLength > maxHorSegmLength) {
                    maxHorSegment = i
                    maxHorSegmLength = segmLength
                }
            } else path += ` l${p1.x - p0.x} ${p1.y - p0.y}`
        }
        this.svg.path(path).stroke({ color: 'black', width: 2 })
        points.forEach(p => this._addBox(p.x, p.y, 0, 0))

        const p1 = points[maxHorSegment - 1]
        const p2 = points[maxHorSegment]
        const labelCenterDown = new Point((p1.x + p2.x)/2, p1.y + EDGE_LABEL_VSHIFT)
        const textBbox = this.svg.text(label).move(labelCenterDown.x, labelCenterDown.y).bbox()
        this._addBox(textBbox)
    }

    

    _addBox(x: number | Box, y?: number, w?: number, h?: number) {
        if (typeof x == 'number') {
            const box = new Box(
                Math.round(x - VIEWBOX_AROUND), 
                Math.round(y as number - VIEWBOX_AROUND), 
                Math.round(w as number + 2*VIEWBOX_AROUND), 
                Math.round(h as number + 2*VIEWBOX_AROUND)
            )
            this.bbox = this.bbox.merge(box)
        } else this._addBox(x.x, x.y, x.h, x.w)
    }
}