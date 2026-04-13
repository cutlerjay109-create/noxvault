# NoxVault — Confidential Yield Vault powered by iExec Nox

> iExec Vibe Coding Challenge Submission — Confidential DeFi category

NoxVault is a privacy-preserving yield vault built on iExec Nox protocol. Users deposit USDC and earn yield while their balance remains completely encrypted on-chain using Fully Homomorphic Encryption (FHE). Nobody — not bots, not competitors, not block explorers — can see your position size or yield earned.

## Live Demo

- **Network:** Arbitrum Sepolia (Chain ID: 421614)
- **Explorer:** https://sepolia.arbiscan.io

## Deployed Contracts

| Contract | Address | Explorer |
|---|---|---|
| ConfidentialVault | `0x5ae401f71890d92b577ef19a9210f4ddddd0f2a9` | [View](https://sepolia.arbiscan.io/address/0x5ae401f71890d92b577ef19a9210f4ddddd0f2a9) |
| MockYieldStrategy | `0x898f954c63f5677ff3e12b96f9fd5725e3e27591` | [View](https://sepolia.arbiscan.io/address/0x898f954c63f5677ff3e12b96f9fd5725e3e27591) |
| iExec cUSDC | `0x1CCeC6bC60dB15E4055D43Dc2531BB7D4E5B808e` | [View](https://sepolia.arbiscan.io/address/0x1CCeC6bC60dB15E4055D43Dc2531BB7D4E5B808e) |
| USDC (testnet) | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` | [View](https://sepolia.arbiscan.io/address/0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d) |

## Features

### Private Vault
- Deposit USDC — balance encrypted immediately via Nox FHE
- Earn 5% APY yield (MockYieldStrategy — pluggable with Aave for mainnet)
- Withdraw anytime — auto-pulls from strategy if vault reserve is low
- 90% of yield goes to depositors, 10% to vault manager as performance fee

### cUSDC Wrap
- Convert public USDC to iExec confidential token (cUSDC)
- Transfer amounts are fully encrypted on-chain using ERC-7984
- Nobody can see how much you sent or hold
- Uses iExec's official deployed cUSDC contract on Arbitrum Sepolia

### Confidential Transfer
- Send cUSDC to any address with encrypted amount
- On-chain event shows encrypted handle not plaintext amount
- Composable with iExec's cdefi.iex.ec ecosystem

### Manager Console (Owner Only)
- Deploy vault funds to yield strategy
- Recall funds back to vault reserve
- Collect 10% performance fee
- Real-time strategy overview dashboard

## Privacy Guarantees

| Data | Visibility |
|---|---|
| Your vault balance | Hidden — encrypted euint256 handle |
| Your yield earned | Hidden — encrypted |
| Your position size | Hidden — encrypted |
| Deposit event amount | Hidden — encrypted handle emitted |
| Withdrawal event amount | Hidden — encrypted handle emitted |
| That a deposit happened | Visible — USDC transfer in calldata |
| That a withdrawal happened | Visible — USDC transfer in calldata |
| Vault total balance | Visible — public contract state |

**Note:** Deposit and withdrawal calldata amounts are visible — this is a known trade-off when wrapping public ERC-20 tokens. This is the same limitation as iExec's own cUSDC demo. Privacy is fully guaranteed for balances and positions inside the vault.

## Architecture

```
User
 |
 | deposit(amount)
 v
ConfidentialVault.sol
 |
 | Nox.toEuint256(amount)  <-- encrypts inside TEE
 |
 | _encryptedBalance[user] = euint256 handle
 |
 | emit Deposited(user, encryptedHandle)  <-- no plaintext
 |
 | deployToStrategy(strategyAddress, amount)
 v
MockYieldStrategy.sol
 |
 | totalAssets() = principal + 5% APY yield
 |
 | withdraw(amount)  <-- auto-called on user withdrawal
 v
User receives deposit + yield share
```

## iExec Nox Integration

```solidity
import {Nox, euint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

// Encrypt deposit amount inside TEE
euint256 encAmount = Nox.toEuint256(amount);

// Homomorphic addition -- add to encrypted balance
_encryptedBalance[msg.sender] = Nox.add(
    _encryptedBalance[msg.sender],
    encAmount
);

// Homomorphic subtraction -- subtract on withdrawal
_encryptedBalance[msg.sender] = Nox.sub(
    _encryptedBalance[msg.sender],
    encAmount
);

// Access control -- only user can decrypt their balance
Nox.allowThis(_encryptedBalance[msg.sender]);
Nox.allow(_encryptedBalance[msg.sender], msg.sender);
```

## Prerequisites

- Node.js 18+
- npm 9+
- MetaMask browser extension
- Arbitrum Sepolia ETH — get from https://www.alchemy.com/faucets/arbitrum-sepolia
- Testnet USDC — get from https://cdefi.iex.ec (faucet tab)

## Installation and Setup

### 1. Clone the repository

```bash
git clone https://github.com/cutlerjay109-create/noxvault.git
cd noxvault
```

### 2. Set up smart contracts

```bash
cd confidential-vault
npm install
```

Set your private key as an environment variable:

```bash
export PRIVATE_KEY=your_private_key_here
```

Compile contracts:

```bash
npx hardhat compile
```

### 3. Deploy contracts (optional — already deployed on Arbitrum Sepolia)

```bash
npx hardhat run scripts/deploy.ts --network arbitrumSepolia
```

After deployment, update the contract addresses in `vault-frontend/src/App.tsx`.

### 4. Set up and run the frontend

```bash
cd ../vault-frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Using the dApp

### Step 1 — Add Arbitrum Sepolia to MetaMask

| Field | Value |
|---|---|
| Network name | Arbitrum Sepolia |
| RPC URL | https://sepolia-rollup.arbitrum.io/rpc |
| Chain ID | 421614 |
| Currency symbol | ETH |
| Block explorer | https://sepolia.arbiscan.io |

### Step 2 — Get testnet funds

- ETH from https://www.alchemy.com/faucets/arbitrum-sepolia
- USDC from https://cdefi.iex.ec (click Faucet tab)

### Step 3 — Deposit into vault

1. Connect MetaMask on Arbitrum Sepolia
2. Go to **Vault** tab
3. Enter an amount and click **Deposit**
4. Approve USDC spending in MetaMask
5. Confirm deposit transaction
6. Your balance shows as an encrypted position

### Step 4 — Deploy to yield strategy (Manager only)

1. Go to **Manager** tab (only visible to vault owner)
2. Enter amount and click **Deploy to strategy**
3. Funds start earning 5% APY immediately

### Step 5 — Check your yield

1. Go to **Vault** tab and click **Refresh**
2. Your deposit and yield share are displayed
3. Total withdrawal amount shown before you withdraw

### Step 6 — Withdraw

1. Enter amount and click **Withdraw**
2. Vault auto-pulls from strategy if reserve is low
3. You receive your deposit plus your proportional yield share

### Step 7 — Wrap USDC to cUSDC

1. Go to **Wrap** tab
2. Enter amount and click **Wrap to cUSDC**
3. Your cUSDC balance is now encrypted on iExec's ERC-7984 contract
4. Use **Send Confidentially** to transfer with hidden amounts
5. Unwrap back to USDC at https://cdefi.iex.ec

## Project Structure

```
noxvault/
├── confidential-vault/
│   ├── contracts/
│   │   ├── ConfidentialVault.sol    # Main vault contract using Nox FHE
│   │   └── MockYieldStrategy.sol   # 5% APY mock strategy
│   ├── scripts/
│   │   └── deploy.ts               # Viem-based deployment script
│   ├── hardhat.config.ts           # Hardhat + Arbitrum Sepolia config
│   └── package.json
└── vault-frontend/
    ├── src/
    │   ├── App.tsx                  # Full React app with all features
    │   └── main.jsx                 # Entry point
    ├── index.html
    └── package.json
```

## Yield Distribution Formula

```
Total yield     = strategy.totalAssets() - totalDeposits
Manager fee     = totalYield * 10%
User yield pool = totalYield * 90%
User share      = userYieldPool * (userDeposit / totalDeposits)
User receives   = userDeposit + userShare
```

## Upgrading to Real Yield (Mainnet)

```solidity
contract AaveYieldStrategy is IYieldStrategy {
    IPool public aave = IPool(AAVE_POOL_ADDRESS);

    function deposit(uint256 amount) external onlyVault {
        USDC.approve(address(aave), amount);
        aave.supply(USDC_ADDRESS, amount, address(this), 0);
    }

    function withdraw(uint256 amount) external onlyVault {
        aave.withdraw(USDC_ADDRESS, amount, vault);
    }

    function totalAssets() external view returns (uint256) {
        return aUSDC.balanceOf(address(this));
    }
}
```

Deploy and call `vault.deployToStrategy(newAaveStrategyAddress, amount)` — no vault changes needed.

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contracts | Solidity 0.8.28 |
| Privacy layer | iExec Nox FHE |
| Network | Arbitrum Sepolia |
| Frontend | React 18 + Vite + TypeScript |
| Blockchain client | viem 2.x |
| Development | Hardhat 3 |

## Future Improvements

- Replace MockYieldStrategy with AaveYieldStrategy for real yield
- Integrate iExec JS SDK when published for fully encrypted calldata
- Add ERC-7984 compliant unwrap directly in the app
- Add selective disclosure for regulatory compliance

## License

MIT
