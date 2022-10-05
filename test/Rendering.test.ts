import { expect } from "chai";
import { createSVGWindow } from 'svgdom'
import { registerWindow } from '@svgdotjs/svg.js'
import { RouteRender } from "../scripts/render/RouteRender";

describe("Route Rendering", async function () {
    it("Simple test", function () {
        const window = createSVGWindow()
        const document = window.document
        registerWindow(window, document)

        const render = new RouteRender()
        const svg = render.insertSVG(document.documentElement)
        //console.log(svg.svg())        

        expect(svg).not.undefined
    })
});
  