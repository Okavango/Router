// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "../interfaces/IERC20.sol";
import "../interfaces/IUniswapV2Pair.sol";
import "../interfaces/IBentoBoxMinimal.sol";
import "../interfaces/IPool.sol";
import "hardhat/console.sol";


contract RouteProcessor {
  IBentoBoxMinimal BentoBox;

  constructor() {//address _BentoBox) {
    BentoBox = IBentoBoxMinimal(0x0319000133d3AdA02600f0875d2cf03D442C3367);//IBentoBoxMinimal(_BentoBox);
  }

  // To be used in UI. For External Owner Account only
  function processRouteEOA(
    address tokenIn,
    uint amountIn,
    address tokenOut,
    uint amountOutMin,
    address to,
    bytes memory route
  ) external payable  returns (uint amountOut){
    require(tx.origin == msg.sender, "Call from not EOA");      // Prevents reentrance

    uint amountInAcc = 0;
    uint balanceInitial = IERC20(tokenOut).balanceOf(to);

    uint position = 0;  // current reading position in route
    while(position < route.length) {
      uint8 commandCode = uint8(route[position]);
      if        (commandCode == 1) { // transfer ERC20 tokens from msg.sender to an address
        uint transferAmount;
        (transferAmount, position) = transferERC20Amount(tokenIn, route, position + 1);
        amountInAcc += transferAmount;
      } else if (commandCode == 2) { // send ERC20 tokens from this router to an address
        position = sendERC20Share(route, position + 1);

      } else if (commandCode == 10) { // Sushi/Uniswap pool swap
        (, position) = swapUniswapPool(route, position + 1);

      } else if (commandCode == 20) {
        uint transferAmount;
        (transferAmount, position) = bentoDepositAmountFromSender(tokenIn, route, position + 1);
        amountInAcc += transferAmount;
      } else if (commandCode == 21) {
        position = swapTrident(route, position + 1);
      } else if (commandCode == 22) {
        position = bentoWithdrawShare(route, position + 1);

      } else revert("Unknown command code");
    }

    require(amountInAcc == amountIn, "Wrong amountIn value");
    uint balanceFinal = IERC20(tokenOut).balanceOf(to);
    require(balanceFinal >= balanceInitial + amountOutMin, "Minimal ouput balance violation");

    amountOut = balanceFinal - balanceInitial;
  }

  // Send ERC20 tokens from this router to an address. Quantity for sending is determined by share in 1/65535.
  // During routing we can't predict in advance the actual value of internal swaps because of slippage,
  // so we have to work with shares - not fixed amounts
  function sendERC20Share(bytes memory route, uint position) private returns (uint positionAfter) {
    address token;
    address to;
    uint16 share;
    assembly {
      route := add(route, position)
      token := mload(add(route, 20))
      to := mload(add(route, 40))
      share := mload(add(route, 42))
      positionAfter := add(position, 42)
    }

    uint amount; unchecked {
      amount = IERC20(token).balanceOf(address(this))*share/65535;
    }
    IERC20(token).transfer(to, amount);
  }

  // Transfers input tokens from msg.sender to an address. Tokens should be approved
  // Expected to be launched for initial liquidity distribution fro user to pools, so we know exact amounts
  function transferERC20Amount(address token, bytes memory route, uint position) 
    private returns (uint amount, uint positionAfter) {
    address to;
    assembly {
      route := add(route, position)
      to := mload(add(route, 20))
      amount := mload(add(route, 52))
      positionAfter := add(position, 52)
    }

    IERC20(token).transferFrom(msg.sender, to, amount);
  }

  // Transfers input tokens from msg.sender to BentoBox. Tokens should be approved
  // Expected to be launched for initial liquidity distribution from user to Bento, so we know exact amounts
  function bentoDepositAmountFromSender(address token, bytes memory route, uint position) 
    private returns (uint amount, uint positionAfter) {
    address to;
    assembly {
      route := add(route, position)
      to := mload(add(route, 20))
      amount := mload(add(route, 52))
      positionAfter := add(position, 52)
    }

    IERC20(token).transferFrom(msg.sender, address(BentoBox), amount);
    BentoBox.deposit(token, address(BentoBox), to, amount, 0);
  }

  // Withdraw ERC20 tokens from Bento to an address. Quantity for sending is determined by share in 1/65535.
  // During routing we can't predict in advance the actual value of internal swaps because of slippage,
  // so we have to work with shares - not fixed amounts
  function bentoWithdrawShare(bytes memory route, uint position) private returns (uint positionAfter) {
    address token;
    address to;
    uint16 share;
    assembly {
      route := add(route, position)
      token := mload(add(route, 20))
      to := mload(add(route, 40))
      share := mload(add(route, 42))
      positionAfter := add(position, 42)
    }

    uint amount; unchecked {
      amount = BentoBox.balanceOf(token, address(this))*share/65535;
    }
    BentoBox.withdraw(token, address(this), to, amount, 0);
  }

  // Trident pool swap
  function swapTrident(bytes memory data, uint position) 
    private returns (uint positionAfter) {
    address pool;
    bytes memory swapData;
    uint swapDataSize;
    assembly {
      data := add(data, position)
      pool := mload(add(data, 20))
      swapData := add(data, 52)
      swapDataSize := mload(swapData)
    }
    positionAfter = position + 52 + swapDataSize;

    IPool(pool).swap(swapData);
  }

  // Sushi/Uniswap pool swap
  function swapUniswapPool(bytes memory data, uint position) 
    private returns (uint amountOut, uint positionAfter) {
    address pool;
    address tokenIn;
    uint8 direction;
    address to;
    assembly {
      data := add(data, position)
      pool := mload(add(data, 20))
      tokenIn := mload(add(data, 40))
      direction := mload(add(data, 41))
      to := mload(add(data, 61))
      positionAfter := add(position, 61)
    }

    (uint r0, uint r1,) = IUniswapV2Pair(pool).getReserves();
    require(r0 > 0 && r1 > 0, 'Wrong pool reserves');
    (uint reserveIn, uint reserveOut) = direction == 1 ? (r0, r1) : (r1, r0);
    
    uint amountIn = IERC20(tokenIn).balanceOf(pool) - reserveIn;
    uint amountInWithFee = amountIn * 997;
    amountOut = amountInWithFee * reserveOut / (reserveIn * 1000 + amountInWithFee);
    (uint amount0Out, uint amount1Out) = direction == 1 ? (uint(0), amountOut) : (amountOut, uint(0));
    IUniswapV2Pair(pool).swap(amount0Out, amount1Out, to, new bytes(0));
  }

}
