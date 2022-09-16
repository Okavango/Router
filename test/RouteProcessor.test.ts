import { ethers } from "hardhat";
import { expect } from "chai";
import { RouteProcessor__factory } from "../types";

describe("RouteProcessor", function () {
  it("Deploy check", async function () {
    const RouteProcessor: RouteProcessor__factory = await ethers.getContractFactory(
      "RouteProcessor"
    );
    const routeProcessor = await RouteProcessor.deploy();

    await routeProcessor.deployed();
    // expect(await routeProcessor.greet()).to.equal("Hello, world!");

    // await routeProcessor.setGreeting("Hola, mundo!");
    // expect(await routeProcessor.greet()).to.equal("Hola, mundo!");
  });
});
