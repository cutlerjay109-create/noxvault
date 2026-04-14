# iExec Nox Developer Feedback

> Submitted as part of the iExec Vibe Coding Challenge
> Project: NoxVault — Confidential Yield Vault
> Builder: cutlerjay109-create
> Date: April 2026

---

## Overall Experience

Building on iExec Nox was an exciting and genuinely novel experience. The concept of bringing FHE (Fully Homomorphic Encryption) to smart contracts is powerful and the protocol delivers on its core promise — encrypted balances that are truly unreadable on-chain. However, as a developer coming in fresh, there were several friction points that made the journey harder than it needed to be.

---

## What Worked Well

### 1. The Solidity library is intuitive
Once we found the correct import path and function names, writing confidential smart contracts felt natural. Functions like `Nox.toEuint256()`, `Nox.add()`, `Nox.sub()`, `Nox.allow()`, and `Nox.allowThis()` map directly to what you would expect from a privacy-preserving arithmetic library. The learning curve from regular Solidity to Nox Solidity was surprisingly gentle.

### 2. The cUSDC contract on Arbitrum Sepolia works perfectly
The deployed cUSDC contract at `0x1CCeC6bC60dB15E4055D43Dc2531BB7D4E5B808e` is solid. The `wrap()` function works reliably, the `ConfidentialTransfer` events correctly emit encrypted handles instead of plaintext amounts, and it integrates cleanly with standard ERC-20 approval flows. This was the most satisfying part of the build — seeing a real encrypted transfer on Arbiscan with an unreadable amount is genuinely impressive.

### 3. The live demo at cdefi.iex.ec is excellent
The demo app is polished, well-designed, and genuinely useful for understanding what the protocol can do. It helped us understand the wrap/unwrap flow and gave us confidence in what we were building. Every new builder should be directed here first.

### 4. Encrypted event logs work as expected
After fixing our vault contract to emit `bytes32` handles instead of `uint256` amounts, the events on Arbiscan correctly show unreadable encrypted handles — matching the privacy behavior of the cUSDC contract. This is the core privacy guarantee working correctly.

### 5. Documentation structure is clear
The docs at docs.iex.ec are logically organized. The separation between Getting Started, Guides, References, and Protocol is clean and makes it easy to find what you need once you know what you are looking for.

---

## Issues and Pain Points

### 1. The JS SDK is not published (Critical)
**Issue:** The `@iexec-nox/nox-sdk` package does not exist on npm.

```bash
npm show @iexec-nox/nox-sdk
# npm error 404 Not Found
```

This is the most significant blocker we encountered. The JS SDK is essential for:
- Encrypting user inputs client-side before sending to contracts
- Using `Nox.fromExternal()` with real proofs
- Decrypting balances off-chain for display
- Implementing proper unwrap flows

Without the SDK, `fromExternal()` cannot be used properly, which means the most privacy-preserving deposit pattern (encrypting amount before it hits calldata) is impossible. We had to fall back to `Nox.toEuint256()` which encrypts after the plaintext amount is already in calldata.

**Request:** Please publish the JS SDK to npm before or at the start of the hackathon. Even a beta version would unblock the most important use cases.

### 2. Function names in documentation do not match the library
**Issue:** The documentation referenced `Nox.asEuint256()` but the actual function is `Nox.toEuint256()`. This caused a compilation error that took time to debug.

```
TypeError: Member "asEuint256" not found or not visible
```

**Request:** Audit the documentation for function name accuracy. Even small discrepancies like this cause significant confusion for new builders.

### 3. Encrypted balance reading requires ACL — not documented clearly
**Issue:** Calling `encryptedBalanceOf()` from the frontend reverts unless the caller has been granted ACL permission. This behavior is correct by design but is not clearly documented with a practical example.

We discovered this only after debugging a silent revert:

```
encryptedBalanceOf error: The contract function reverted
```

**Request:** Add a clear note in the docs explaining that `encryptedBalanceOf` requires ACL permission, and provide a frontend pattern for checking if a user has an active position without reading the encrypted value directly.

### 4. No example project for a vault or DeFi use case
**Issue:** The Hello World example covers basic encrypted storage but there is no example closer to real DeFi use cases like vaults, lending, or token wrapping. Builders targeting the hackathon use cases (vault, RWA, lending) have to figure out patterns from scratch.

**Request:** Add one example project in the docs that shows a complete deposit/withdraw flow with encrypted balances, yield tracking, and access control. This would save every hackathon builder several hours.

### 5. Hardhat 3 compatibility issues
**Issue:** The docs recommend Hardhat but do not specify that Hardhat 3 has breaking changes from Hardhat 2. The `ignition` command does not exist in Hardhat 3, and `eth_accounts` is handled differently. Several hours were lost debugging compatibility issues.

**Request:** Specify in the docs whether examples target Hardhat 2 or 3, and provide a working `hardhat.config.ts` template for Arbitrum Sepolia.

### 6. Nox precompile addresses are not publicly documented
**Issue:** It was unclear whether Nox operations happen via precompile addresses or event-driven async computation. The docs mention the Runner and Handle Gateway but the developer-facing behavior (sync vs async) is not clearly explained for contract authors.

**Request:** Add a clear explanation of the execution model — specifically, when a developer calls `Nox.add()`, what happens synchronously vs asynchronously, and what the developer needs to handle on their end.

---

## Suggestions for Future Versions

### Publish a Nox Starter Kit
A minimal repo with:
- A working Hardhat config for Arbitrum Sepolia
- A simple confidential ERC-20 with deposit/withdraw
- A frontend snippet using the JS SDK to encrypt inputs and decrypt balances
- A README explaining the full flow

This would cut onboarding time from days to hours.

### Add a Nox Wizard for vault contracts
The confidential smart contract wizard at `cdefi-wizard.iex.ec` is useful but limited. Extending it to generate vault templates with yield distribution, access control, and manager patterns would be very valuable for hackathon builders.

### Improve error messages from Nox operations
When a Nox operation fails (wrong proof, missing ACL permission, null handle), the revert reason is generic. More specific error messages would make debugging significantly faster.

---

## Summary Ratings

| Area | Rating | Notes |
|---|---|---|
| Solidity library | 4/5 | Intuitive once function names are confirmed |
| Documentation | 3/5 | Good structure, some inaccuracies and gaps |
| JS SDK | 1/5 | Not published — critical blocker |
| cUSDC contract | 5/5 | Works perfectly, great reference implementation |
| Live demo | 5/5 | Excellent onboarding tool |
| Community support | 4/5 | Discord is responsive |
| Overall DX | 3/5 | Great potential, needs SDK and more examples |

---

## Conclusion

iExec Nox is solving a real and important problem — bringing genuine privacy to DeFi without sacrificing composability. The core protocol works. The cUSDC implementation is a great proof of concept. With the JS SDK published, better documentation accuracy, and a starter kit for common DeFi patterns, this could become the go-to privacy layer for serious DeFi builders.

We are genuinely excited about the direction and look forward to building more on Nox as the tooling matures.

---

*Feedback provided by NoxVault team as part of the iExec Vibe Coding Challenge, April 2026.*
