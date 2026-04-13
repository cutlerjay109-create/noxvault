// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Nox, euint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IYieldStrategy {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function totalAssets() external view returns (uint256);
}

contract ConfidentialVault {

    // ── Roles ─────────────────────────────────────────
    address public owner;

    // ── Tokens ────────────────────────────────────────
    IERC20 public immutable USDC;

    // ── Strategy ──────────────────────────────────────
    IYieldStrategy public yieldStrategy;

    // ── Share tracking ────────────────────────────────
    mapping(address => uint256) public depositedAmount;
    uint256 public totalDeposits;

    // ── Performance fee ───────────────────────────────
    uint256 public constant PERFORMANCE_FEE_BPS = 1000;
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public managerFees;

    // ── Privacy Ledger ────────────────────────────────
    mapping(address => euint256) private _encryptedBalance;

    // ── Reentrancy guard ──────────────────────────────
    uint256 private _status;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    // ── Events ────────────────────────────────────────
    event Deposited(address indexed user, bytes32 encryptedHandle);
    event Withdrawn(address indexed user, bytes32 encryptedHandle);
    event StrategyDeployed(address indexed strategy, uint256 amount);
    event StrategyRecalled(uint256 amount);
    event ManagerFeeCollected(uint256 amount);

    constructor(address usdcAddress) {
        owner = msg.sender;
        _status = _NOT_ENTERED;
        USDC = IERC20(usdcAddress);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Vault: not owner");
        _;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "Vault: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    // ── Deposit ───────────────────────────────────────
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Vault: zero amount");

        bool ok = USDC.transferFrom(msg.sender, address(this), amount);
        require(ok, "Vault: transfer failed");

        depositedAmount[msg.sender] += amount;
        totalDeposits += amount;

        euint256 encAmount = Nox.toEuint256(amount);

        if (euint256.unwrap(_encryptedBalance[msg.sender]) == bytes32(0)) {
            _encryptedBalance[msg.sender] = encAmount;
        } else {
            _encryptedBalance[msg.sender] = Nox.add(
                _encryptedBalance[msg.sender],
                encAmount
            );
        }

        Nox.allowThis(_encryptedBalance[msg.sender]);
        Nox.allow(_encryptedBalance[msg.sender], msg.sender);

        emit Deposited(msg.sender, euint256.unwrap(encAmount));
    }

    // ── Withdraw ──────────────────────────────────────
    // Automatically pulls from strategy if reserve is low
    // User receives deposit + their proportional yield share
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Vault: zero amount");
        require(
            depositedAmount[msg.sender] >= amount,
            "Vault: insufficient deposit"
        );
        require(
            euint256.unwrap(_encryptedBalance[msg.sender]) != bytes32(0),
            "Vault: no balance"
        );

        // Calculate yield share for this user
        uint256 yieldShare = _calculateUserYield(msg.sender, amount);
        uint256 totalWithdraw = amount + yieldShare;

        // Auto-pull from strategy if vault reserve is insufficient
        uint256 vaultBal = USDC.balanceOf(address(this));
        if (vaultBal < totalWithdraw && address(yieldStrategy) != address(0)) {
            uint256 needed = totalWithdraw - vaultBal;
            yieldStrategy.withdraw(needed);
        }

        require(
            USDC.balanceOf(address(this)) >= totalWithdraw,
            "Vault: insufficient funds"
        );

        // Update tracking
        depositedAmount[msg.sender] -= amount;
        totalDeposits -= amount;

        // Encrypt total withdrawal amount for private event
        euint256 encAmount = Nox.toEuint256(totalWithdraw);

        // Subtract original deposit from encrypted balance
        _encryptedBalance[msg.sender] = Nox.sub(
            _encryptedBalance[msg.sender],
            Nox.toEuint256(amount)
        );

        Nox.allowThis(_encryptedBalance[msg.sender]);
        Nox.allow(_encryptedBalance[msg.sender], msg.sender);

        // Transfer deposit + yield to user
        bool ok = USDC.transfer(msg.sender, totalWithdraw);
        require(ok, "Vault: transfer failed");

        // Emit encrypted handle - never plaintext
        emit Withdrawn(msg.sender, euint256.unwrap(encAmount));
    }

    // ── Calculate user yield share ────────────────────
    function _calculateUserYield(address, uint256 amount)
        internal view returns (uint256)
    {
        if (totalDeposits == 0) return 0;

        // Total yield = vault balance above deposits
        // Plus strategy assets above what was deployed
        uint256 vaultBal = USDC.balanceOf(address(this));
        uint256 strategyBal = address(yieldStrategy) != address(0)
            ? yieldStrategy.totalAssets()
            : 0;
        uint256 _totalAssets = vaultBal + strategyBal;

        if (_totalAssets <= totalDeposits) return 0;

        uint256 totalYield = _totalAssets - totalDeposits;

        // Manager takes 10% performance fee
        uint256 managerCut = (totalYield * PERFORMANCE_FEE_BPS) / BPS_DENOMINATOR;
        uint256 userYield = totalYield - managerCut;

        // User gets proportional share based on their deposit
        uint256 userShare = (userYield * amount) / totalDeposits;

        return userShare;
    }

    // ── Preview yield for a user ──────────────────────
    function previewYield(address user) external view returns (uint256) {
        if (depositedAmount[user] == 0) return 0;
        return _calculateUserYield(user, depositedAmount[user]);
    }

    // ── Preview total withdrawal amount ───────────────
    function previewWithdraw(address user, uint256 amount)
        external view returns (uint256)
    {
        uint256 yieldShare = _calculateUserYield(user, amount);
        return amount + yieldShare;
    }

    // ── View encrypted balance ────────────────────────
    function encryptedBalanceOf(address account)
        external view returns (euint256)
    {
        return _encryptedBalance[account];
    }

    // ── Collect manager fee ───────────────────────────
    function collectManagerFee() external onlyOwner nonReentrant {
        uint256 vaultBal = USDC.balanceOf(address(this));
        uint256 strategyBal = address(yieldStrategy) != address(0)
            ? yieldStrategy.totalAssets()
            : 0;
        uint256 _totalAssets = vaultBal + strategyBal;

        if (_totalAssets <= totalDeposits) return;

        uint256 totalYield = _totalAssets - totalDeposits;
        uint256 fee = (totalYield * PERFORMANCE_FEE_BPS) / BPS_DENOMINATOR;

        require(fee > 0, "Vault: no fees to collect");

        // Pull from strategy if needed
        if (vaultBal < fee && address(yieldStrategy) != address(0)) {
            yieldStrategy.withdraw(fee - vaultBal);
        }

        managerFees += fee;

        bool ok = USDC.transfer(owner, fee);
        require(ok, "Vault: fee transfer failed");

        emit ManagerFeeCollected(fee);
    }

    // ── Deploy to strategy ────────────────────────────
    function deployToStrategy(address strategyAddress, uint256 amount)
        external onlyOwner nonReentrant
    {
        require(strategyAddress != address(0), "Vault: zero address");
        require(amount > 0, "Vault: zero amount");

        yieldStrategy = IYieldStrategy(strategyAddress);
        USDC.approve(strategyAddress, amount);
        yieldStrategy.deposit(amount);

        emit StrategyDeployed(strategyAddress, amount);
    }

    // ── Recall from strategy ──────────────────────────
    function recallFromStrategy(uint256 amount)
        external onlyOwner nonReentrant
    {
        require(address(yieldStrategy) != address(0), "Vault: no strategy");
        require(amount > 0, "Vault: zero amount");

        yieldStrategy.withdraw(amount);

        emit StrategyRecalled(amount);
    }

    // ── Transfer ownership ────────────────────────────
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Vault: zero address");
        owner = newOwner;
    }

    // ── View vault reserve balance ────────────────────
    function vaultBalance() external view returns (uint256) {
        return USDC.balanceOf(address(this));
    }

    // ── View total assets across vault and strategy ───
    function totalAssets() external view returns (uint256) {
        uint256 vaultBal = USDC.balanceOf(address(this));
        uint256 strategyBal = address(yieldStrategy) != address(0)
            ? yieldStrategy.totalAssets()
            : 0;
        return vaultBal + strategyBal;
    }
}
