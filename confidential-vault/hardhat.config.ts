import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-mocha-ethers";

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    arbitrumSepolia: {
      type: "http",
      url: "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};

export default config;
