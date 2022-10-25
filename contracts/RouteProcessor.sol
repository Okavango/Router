// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "../interfaces/IERC20.sol";
import "../interfaces/IUniswapV2Pair.sol";
import "../interfaces/IBentoBoxMinimal.sol";
import "../interfaces/IPool.sol";
import "hardhat/console.sol";


contract RouteProcessor {
  IBentoBoxMinimal immutable BentoBox;

  constructor(address _BentoBox) {
    BentoBox = IBentoBoxMinimal(_BentoBox);
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
      if (commandCode == 3) { // distribute ERC20 tokens from msg.sender to an address
        uint transferAmount;
        (transferAmount, position) = distributeERC20Amounts(tokenIn, route, position + 1);
        amountInAcc += transferAmount;
      } else if (commandCode == 4) { // distribute ERC20 tokens from this router to an address
        position = distributeERC20Shares(route, position + 1);

      } else if (commandCode == 10) { // Sushi/Uniswap pool swap
        (, position) = swapUniswapPool(route, position + 1);

      } else if (commandCode == 20) {
        position = bentoDepositAmountFromBento(tokenIn, route, position + 1);
      } else if (commandCode == 21) {
        position = swapTrident(route, position + 1);
      } else if (commandCode == 23) {
        position = bentoWithdrawShareFromRP(tokenIn, route, position + 1);
      } else if (commandCode == 24) { // distribute Bento tokens from msg.sender to an address
        uint transferAmount;
        (transferAmount, position) = distributeBentoShares(tokenIn, route, position + 1);
        amountInAcc += transferAmount;
      } else if (commandCode == 25) {
        position = distributeBentoPortions(route, position + 1);
      } else if (commandCode == 26) {
        position = bentoDepositAllFromBento(route, position + 1);
      } else if (commandCode == 27) {
        position = bentoWithdrawAllFromRP(route, position + 1);

      } else revert("Unknown command code");
    }

    require(amountInAcc == amountIn, "Wrong amountIn value");
    uint balanceFinal = IERC20(tokenOut).balanceOf(to);
    require(balanceFinal >= balanceInitial + amountOutMin, "Minimal ouput balance violation");

    amountOut = balanceFinal - balanceInitial;
  }

  // Transfers input tokens from BentoBox to a pool.
  // Expected to be launched for initial liquidity distribution from user to Bento, so we know exact amounts
  function bentoDepositAmountFromBento(address token, bytes memory route, uint position) 
    private returns (uint positionAfter) {
    address to;
    uint amount;
    assembly {
      route := add(route, position)
      to := mload(add(route, 20))
      amount := mload(add(route, 52))
      positionAfter := add(position, 52)
    }

    BentoBox.deposit(token, address(BentoBox), to, amount, 0);
  }

  // Transfers all input tokens from BentoBox to a pool
  function bentoDepositAllFromBento(bytes memory route, uint position) 
    private returns (uint positionAfter) {
    address to;
    address token;
    assembly {
      route := add(route, position)
      to := mload(add(route, 20))
      token := mload(add(route, 40))
      positionAfter := add(position, 40)
    }

    uint amount = IERC20(token).balanceOf(address(BentoBox))
      + BentoBox.strategyData(token).balance
      - BentoBox.totals(token).elastic;
    BentoBox.deposit(token, address(BentoBox), to, amount, 0);
  }

  // Withdraw Bento tokens from Bento to an address.
  function bentoWithdrawShareFromRP(address token, bytes memory route, uint position)
    private returns (uint positionAfter) {
    address to;
    uint amount;
    assembly {
      route := add(route, position)
      to := mload(add(route, 20))
      amount := mload(add(route, 52))
      positionAfter := add(position, 52)
    }

    BentoBox.withdraw(token, address(this), to, amount, 0);
  }

  // Withdraw all Bento tokens from Bento to an address.
  function bentoWithdrawAllFromRP(bytes memory route, uint position) private returns (uint positionAfter) {
    address token;
    address to;
    assembly {
      route := add(route, position)
      token := mload(add(route, 20))
      to := mload(add(route, 40))
      positionAfter := add(position, 40)
    }

    uint amount = BentoBox.balanceOf(token, address(this));
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

  // Distributes input ERC20 tokens from msg.sender to addresses. Tokens should be approved
  // Expected to be launched for initial liquidity distribution from user to pools, so we know exact amounts
  function distributeERC20Amounts(address token, bytes memory route, uint position) 
    private returns (uint amountTotal, uint positionAfter) {
    uint8 num;
    assembly {
      route := add(route, add(position, 1))
      num := mload(route)
    }

    amountTotal = 0;
    address to;  
    uint amount;  
    for (uint i = 0; i < num; ++i) {
      assembly {
        to := mload(add(route, 20))
        route := add(route, 52)
        amount := mload(route)
        amountTotal := add(amountTotal, amount)
      }
      IERC20(token).transferFrom(msg.sender, to, amount);
    }
    positionAfter = position + 1 + uint(num)*52;
  }

  // Distributes input Bento tokens from msg.sender to addresses. Tokens should be approved
  // Expected to be launched for initial liquidity distribution from user to pools, so we know exact amounts
  function distributeBentoShares(address token, bytes memory route, uint position) 
    private returns (uint sharesTotal, uint positionAfter) {
    uint8 num;
    assembly {
      route := add(route, add(position, 1))
      num := mload(route)
    }

    sharesTotal = 0;
    address to;  
    uint share;  
    for (uint i = 0; i < num; ++i) {
      assembly {
        to := mload(add(route, 20))
        route := add(route, 52)
        share := mload(route)
        sharesTotal := add(sharesTotal, share)
      }
      BentoBox.transfer(token, msg.sender, to, share);
    }
    positionAfter = position + 1 + uint(num)*52;
  }

  // Distribute ERC20 tokens from this routeProcessor to addresses. 
  // Quantity for sending is determined by share in 1/65535.
  // During routing we can't predict in advance the actual value of internal swaps because of slippage,
  // so we have to work with shares - not fixed amounts
  function distributeERC20Shares(bytes memory route, uint position) 
    private returns (uint positionAfter) {
    uint8 num;
    address token;
    assembly {
      route := add(route, position)
      token := mload(add(route, 20))
      route := add(route, 21)
      num := mload(route)
    }
    uint amountTotal = IERC20(token).balanceOf(address(this));

    address to;  
    for (uint i = 0; i < num; ++i) {
      uint amount;  
      assembly {
        to := mload(add(route, 20))
        route := add(route, 22)
        let share := and(mload(route), 0xffff)
        amount := div(mul(amountTotal, share), 65535)
        amountTotal := sub(amountTotal, amount)
      }
      IERC20(token).transfer(to, amount);
    }
    positionAfter = position + 21 + uint(num)*22;
  }

  // Distribute Bento tokens from this routeProcessor to addresses. 
  // Quantity for sending is determined by portions in 1/65535.
  // During routing we can't predict in advance the actual value of internal swaps because of slippage,
  // so we have to work with portions - not fixed amounts
  function distributeBentoPortions(bytes memory route, uint position) 
    private returns (uint positionAfter) {
    uint8 num;
    address token;
    assembly {
      route := add(route, position)
      token := mload(add(route, 20))
      route := add(route, 21)
      num := mload(route)
    }
    uint amountTotal = BentoBox.balanceOf(token, address(this));

    address to;  
    for (uint i = 0; i < num; ++i) {
      uint amount;  
      assembly {
        to := mload(add(route, 20))
        route := add(route, 22)
        let share := and(mload(route), 0xffff)
        amount := div(mul(amountTotal, share), 65535)
        amountTotal := sub(amountTotal, amount)
      }
      BentoBox.transfer(token, address(this), to, amount);
    }
    positionAfter = position + 21 + uint(num)*22;
  }
}
