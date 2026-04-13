import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const USDC_ARBITRUM_SEPOLIA = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";

const VaultModule = buildModule("VaultModule", (m) => {
  const vault = m.contract("ConfidentialVault", [USDC_ARBITRUM_SEPOLIA]);

  const strategy = m.contract("MockYieldStrategy", [
    USDC_ARBITRUM_SEPOLIA,
    vault,
  ]);

  return { vault, strategy };
});

export default VaultModule;
