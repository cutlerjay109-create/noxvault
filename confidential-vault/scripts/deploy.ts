import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { readFileSync } from "fs";
import { resolve } from "path";

const USDC = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";

async function main() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
  if (!privateKey) throw new Error("PRIVATE_KEY not set");

  const account = privateKeyToAccount(
    privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
  );

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http("https://sepolia-rollup.arbitrum.io/rpc"),
  });

  const walletClient = createWalletClient({
    account,
    chain: arbitrumSepolia,
    transport: http("https://sepolia-rollup.arbitrum.io/rpc"),
  });

  console.log("Deploying from:", account.address);

  const artifacts = JSON.parse(
    readFileSync(
      resolve("artifacts/contracts/ConfidentialVault.sol/ConfidentialVault.json"),
      "utf8"
    )
  );

  const stratArtifacts = JSON.parse(
    readFileSync(
      resolve("artifacts/contracts/MockYieldStrategy.sol/MockYieldStrategy.json"),
      "utf8"
    )
  );

  console.log("Deploying ConfidentialVault...");
  const vaultHash = await walletClient.deployContract({
    abi: artifacts.abi,
    bytecode: artifacts.bytecode,
    args: [USDC],
  });
  const vaultReceipt = await publicClient.waitForTransactionReceipt({
    hash: vaultHash,
  });
  const vaultAddress = vaultReceipt.contractAddress!;
  console.log("ConfidentialVault deployed to:", vaultAddress);

  console.log("Deploying MockYieldStrategy...");
  const stratHash = await walletClient.deployContract({
    abi: stratArtifacts.abi,
    bytecode: stratArtifacts.bytecode,
    args: [USDC, vaultAddress],
  });
  const stratReceipt = await publicClient.waitForTransactionReceipt({
    hash: stratHash,
  });
  const strategyAddress = stratReceipt.contractAddress!;
  console.log("MockYieldStrategy deployed to:", strategyAddress);

  console.log("\nDone!");
  console.log("Vault:", vaultAddress);
  console.log("Strategy:", strategyAddress);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
