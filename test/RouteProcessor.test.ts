import { ethers } from "hardhat";
import { expect } from "chai";
import { RouteProcessor__factory } from "../types";
import { Swapper } from "../scripts/Swapper";
import * as ETHEREUM from '../scripts/liquidityProviders/EthereumTokens'
import { getBigNumber, RouteStatus } from "@sushiswap/tines";

describe("RouteProcessor", async function () {
  it("Deploy check", async function () {
    const [Alice] = await ethers.getSigners()

    const RouteProcessor: RouteProcessor__factory = await ethers.getContractFactory(
      "RouteProcessor2"
    );
    const routeProcessor = await RouteProcessor.deploy();

    await routeProcessor.deployed();

    const provider = new ethers.providers.AlchemyProvider("homestead", process.env.ALCHEMY_API_KEY)
    
    const swapper = new Swapper(routeProcessor.address, provider)
    const route = await swapper.getRoute(ETHEREUM.SUSHI, getBigNumber(100e18), ETHEREUM.FEI)
    const code = swapper.getRouterProcessorCode(route, Alice.address)

    expect(code).not.equals('')
    // expect(await routeProcessor.greet()).to.equal("Hello, world!");

    // await routeProcessor.setGreeting("Hola, mundo!");
    // expect(await routeProcessor.greet()).to.equal("Hola, mundo!");
  });
});
