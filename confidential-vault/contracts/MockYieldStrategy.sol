// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract MockYieldStrategy {

    IERC20 public immutable USDC;
    address public immutable vault;

    uint256 public totalDeposited;
    uint256 public constant APY_BPS = 500;
    uint256 public lastUpdateTime;

    constructor(address usdcAddress, address vaultAddress) {
        USDC = IERC20(usdcAddress);
        vault = vaultAddress;
        lastUpdateTime = block.timestamp;
    }

    modifier onlyVault() {
        require(msg.sender == vault, "Strategy: only vault");
        _;
    }

    function deposit(uint256 amount) external onlyVault {
        require(amount > 0, "Strategy: zero amount");
        USDC.transferFrom(vault, address(this), amount);
        totalDeposited += amount;
        lastUpdateTime = block.timestamp;
    }

    function withdraw(uint256 amount) external onlyVault {
        require(amount > 0, "Strategy: zero amount");
        uint256 available = USDC.balanceOf(address(this));
        uint256 toSend = amount > available ? available : amount;
        require(toSend > 0, "Strategy: nothing to withdraw");
        if (toSend >= totalDeposited) {
            totalDeposited = 0;
        } else {
            totalDeposited -= toSend;
        }
        lastUpdateTime = block.timestamp;
        bool ok = USDC.transfer(vault, toSend);
        require(ok, "Strategy: transfer failed");
    }

    function accruedYield() public view returns (uint256) {
        uint256 elapsed = block.timestamp - lastUpdateTime;
        return (totalDeposited * APY_BPS * elapsed) / (10000 * 365 days);
    }

    function totalAssets() public view returns (uint256) {
        return totalDeposited + accruedYield();
    }
}
