import { SVG, Svg, Element } from '@svgdotjs/svg.js'

export class RouteRender {
    constructor() {

    }

    insertSVG(element: Element): Svg {
        const svg = SVG(element) as Svg
        svg.rect(100, 100).fill('yellow').move(50,50)
        return svg
    }
}