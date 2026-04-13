import { useState, useEffect } from "react";
import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  parseUnits,
  formatUnits,
} from "viem";
import { arbitrumSepolia } from "viem/chains";

const VAULT_ADDRESS = "0x5ae401f71890d92b577ef19a9210f4ddddd0f2a9";
const USDC_ADDRESS = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";
const CUSDC_ADDRESS = "0x1CCeC6bC60dB15E4055D43Dc2531BB7D4E5B808e";
const STRATEGY_ADDRESS = "0x898f954c63f5677ff3e12b96f9fd5725e3e27591";
const OWNER_ADDRESS = "0xe59404a92b71a152e96a2e4b7e676198f1756b74";
const RPC = "https://sepolia-rollup.arbitrum.io/rpc";

const VAULT_ABI = [
  { name: "deposit", type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "withdraw", type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "encryptedBalanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "bytes32" }] },
  { name: "previewYield", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "previewWithdraw", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "depositedAmount", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "totalAssets", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "deployToStrategy", type: "function", stateMutability: "nonpayable", inputs: [{ name: "strategyAddress", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { name: "recallFromStrategy", type: "function", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "collectManagerFee", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "vaultBalance", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "managerFees", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
];

const USDC_ABI = [
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
];

const CUSDC_ABI = [
  { name: "wrap", type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bytes32" }] },
];

const STRATEGY_ABI = [
  { name: "totalAssets", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "totalDeposited", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
];

export default function App() {
  const [account, setAccount] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState("0");
  const [encryptedBalance, setEncryptedBalance] = useState<string | null>(null);
  const [userDeposited, setUserDeposited] = useState("0");
  const [userYield, setUserYield] = useState("0");
  const [amount, setAmount] = useState("");
  const [wrapAmount, setWrapAmount] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [managerAmount, setManagerAmount] = useState("");
  const [status, setStatus] = useState("");
  const [wrapStatus, setWrapStatus] = useState("");
  const [transferStatus, setTransferStatus] = useState("");
  const [managerStatus, setManagerStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [wrapLoading, setWrapLoading] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [managerLoading, setManagerLoading] = useState(false);
  const [totalAssets, setTotalAssets] = useState("0");
  const [totalDeposited, setTotalDeposited] = useState("0");
  const [vaultUSDC, setVaultUSDC] = useState("0");
  const [managerFees, setManagerFees] = useState("0");
  const [page, setPage] = useState<"vault" | "wrap" | "manager">("vault");
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const isOwner = account?.toLowerCase() === OWNER_ADDRESS.toLowerCase();
  const NULL_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const hasVaultPosition = encryptedBalance && encryptedBalance !== NULL_HANDLE;

  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(RPC) });

  async function getFreshGas() {
    const feeData = await fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 1 }),
    }).then((r) => r.json());
    const gasPrice = BigInt(feeData.result);
    return { maxFeePerGas: (gasPrice * BigInt(15)) / BigInt(10), maxPriorityFeePerGas: BigInt(1500000) };
  }

  async function connect() {
    if (!window.ethereum) return setStatus("MetaMask not found");
    const [addr] = await window.ethereum.request({ method: "eth_requestAccounts" });
    setAccount(addr);
    setStatus("Wallet connected");
    await loadBalances(addr);
    await loadStrategyData();
  }

  async function loadBalances(addr: string) {
    try {
      const [usdc, enc, deposited, yieldAmt, vaultUsdc, fees] = await Promise.all([
        publicClient.readContract({ address: USDC_ADDRESS as `0x${string}`, abi: USDC_ABI, functionName: "balanceOf", args: [addr] }),
        publicClient.readContract({ address: VAULT_ADDRESS as `0x${string}`, abi: VAULT_ABI, functionName: "encryptedBalanceOf", args: [addr] }),
        publicClient.readContract({ address: VAULT_ADDRESS as `0x${string}`, abi: VAULT_ABI, functionName: "depositedAmount", args: [addr] }),
        publicClient.readContract({ address: VAULT_ADDRESS as `0x${string}`, abi: VAULT_ABI, functionName: "previewYield", args: [addr] }),
        publicClient.readContract({ address: VAULT_ADDRESS as `0x${string}`, abi: VAULT_ABI, functionName: "vaultBalance" }),
        publicClient.readContract({ address: VAULT_ADDRESS as `0x${string}`, abi: VAULT_ABI, functionName: "managerFees" }),
      ]);
      setUsdcBalance(formatUnits(usdc as bigint, 6));
      setEncryptedBalance(enc as string);
      setUserDeposited(formatUnits(deposited as bigint, 6));
      setUserYield(formatUnits(yieldAmt as bigint, 6));
      setVaultUSDC(formatUnits(vaultUsdc as bigint, 6));
      setManagerFees(formatUnits(fees as bigint, 6));
    } catch (e) { console.error(e); }
  }

  async function loadStrategyData() {
    try {
      const [assets, deposited] = await Promise.all([
        publicClient.readContract({ address: STRATEGY_ADDRESS as `0x${string}`, abi: STRATEGY_ABI, functionName: "totalAssets" }),
        publicClient.readContract({ address: STRATEGY_ADDRESS as `0x${string}`, abi: STRATEGY_ABI, functionName: "totalDeposited" }),
      ]);
      setTotalAssets(formatUnits(assets as bigint, 6));
      setTotalDeposited(formatUnits(deposited as bigint, 6));
    } catch (e) { console.error(e); }
  }

  async function deposit() {
    if (!account || !amount) return;
    setLoading(true); setStatus("Approving USDC...");
    try {
      const walletClient = createWalletClient({ chain: arbitrumSepolia, transport: custom(window.ethereum) });
      const parsedAmount = parseUnits(amount, 6);
      const gas1 = await getFreshGas();
      const approveTx = await walletClient.writeContract({ account: account as `0x${string}`, address: USDC_ADDRESS as `0x${string}`, abi: USDC_ABI, functionName: "approve", args: [VAULT_ADDRESS, parsedAmount], ...gas1, gas: BigInt(100000) });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
      setStatus("Depositing...");
      const gas2 = await getFreshGas();
      const depositTx = await walletClient.writeContract({ account: account as `0x${string}`, address: VAULT_ADDRESS as `0x${string}`, abi: VAULT_ABI, functionName: "deposit", args: [parsedAmount], ...gas2, gas: BigInt(300000) });
      await publicClient.waitForTransactionReceipt({ hash: depositTx });
      setStatus("Deposit successful!"); setAmount(""); await loadBalances(account);
    } catch (e: any) { setStatus("Error: " + e.message); }
    setLoading(false);
  }

  async function withdraw() {
    if (!account || !amount) return;
    setLoading(true); setStatus("Withdrawing...");
    try {
      const walletClient = createWalletClient({ chain: arbitrumSepolia, transport: custom(window.ethereum) });
      const parsedAmount = parseUnits(amount, 6);
      const gas = await getFreshGas();
      const withdrawTx = await walletClient.writeContract({ account: account as `0x${string}`, address: VAULT_ADDRESS as `0x${string}`, abi: VAULT_ABI, functionName: "withdraw", args: [parsedAmount], ...gas, gas: BigInt(400000) });
      await publicClient.waitForTransactionReceipt({ hash: withdrawTx });
      setStatus("Withdrawal successful!"); setAmount(""); await loadBalances(account);
    } catch (e: any) { setStatus("Error: " + e.message); }
    setLoading(false);
  }

  async function wrapUSDC() {
    if (!account || !wrapAmount) return;
    setWrapLoading(true); setWrapStatus("Approving...");
    try {
      const walletClient = createWalletClient({ chain: arbitrumSepolia, transport: custom(window.ethereum) });
      const parsedAmount = parseUnits(wrapAmount, 6);
      const gas1 = await getFreshGas();
      const approveTx = await walletClient.writeContract({ account: account as `0x${string}`, address: USDC_ADDRESS as `0x${string}`, abi: USDC_ABI, functionName: "approve", args: [CUSDC_ADDRESS, parsedAmount], ...gas1, gas: BigInt(100000) });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
      setWrapStatus("Wrapping...");
      const gas2 = await getFreshGas();
      const wrapTx = await walletClient.writeContract({ account: account as `0x${string}`, address: CUSDC_ADDRESS as `0x${string}`, abi: CUSDC_ABI, functionName: "wrap", args: [account as `0x${string}`, parsedAmount], ...gas2, gas: BigInt(500000) });
      await publicClient.waitForTransactionReceipt({ hash: wrapTx });
      setWrapStatus("Wrapped! cUSDC balance is now encrypted."); setWrapAmount(""); await loadBalances(account);
    } catch (e: any) { setWrapStatus("Error: " + e.message); }
    setWrapLoading(false);
  }

  async function confidentialTransfer() {
    if (!account || !transferTo || !transferAmount) return;
    setTransferLoading(true); setTransferStatus("Approving...");
    try {
      const walletClient = createWalletClient({ chain: arbitrumSepolia, transport: custom(window.ethereum) });
      const parsedAmount = parseUnits(transferAmount, 6);
      const gas1 = await getFreshGas();
      const approveTx = await walletClient.writeContract({ account: account as `0x${string}`, address: USDC_ADDRESS as `0x${string}`, abi: USDC_ABI, functionName: "approve", args: [CUSDC_ADDRESS, parsedAmount], ...gas1, gas: BigInt(100000) });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
      setTransferStatus("Sending...");
      const gas2 = await getFreshGas();
      const wrapTx = await walletClient.writeContract({ account: account as `0x${string}`, address: CUSDC_ADDRESS as `0x${string}`, abi: CUSDC_ABI, functionName: "wrap", args: [transferTo as `0x${string}`, parsedAmount], ...gas2, gas: BigInt(500000) });
      await publicClient.waitForTransactionReceipt({ hash: wrapTx });
      setTransferStatus("Sent! Amount encrypted on-chain."); setTransferTo(""); setTransferAmount("");
    } catch (e: any) { setTransferStatus("Error: " + e.message); }
    setTransferLoading(false);
  }

  async function deployToStrategy() {
    if (!account || !managerAmount) return;
    setManagerLoading(true); setManagerStatus("Deploying...");
    try {
      const walletClient = createWalletClient({ chain: arbitrumSepolia, transport: custom(window.ethereum) });
      const parsedAmount = parseUnits(managerAmount, 6);
      const gas1 = await getFreshGas();
      const approveTx = await walletClient.writeContract({ account: account as `0x${string}`, address: USDC_ADDRESS as `0x${string}`, abi: USDC_ABI, functionName: "approve", args: [VAULT_ADDRESS, parsedAmount], ...gas1, gas: BigInt(100000) });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
      const gas2 = await getFreshGas();
      const deployTx = await walletClient.writeContract({ account: account as `0x${string}`, address: VAULT_ADDRESS as `0x${string}`, abi: VAULT_ABI, functionName: "deployToStrategy", args: [STRATEGY_ADDRESS, parsedAmount], ...gas2, gas: BigInt(400000) });
      await publicClient.waitForTransactionReceipt({ hash: deployTx });
      setManagerStatus("Deployed!"); setManagerAmount(""); await loadStrategyData(); await loadBalances(account);
    } catch (e: any) { setManagerStatus("Error: " + e.message); }
    setManagerLoading(false);
  }

  async function recallFromStrategy() {
    if (!account || !managerAmount) return;
    setManagerLoading(true); setManagerStatus("Recalling...");
    try {
      const walletClient = createWalletClient({ chain: arbitrumSepolia, transport: custom(window.ethereum) });
      const parsedAmount = parseUnits(managerAmount, 6);
      const gas = await getFreshGas();
      const recallTx = await walletClient.writeContract({ account: account as `0x${string}`, address: VAULT_ADDRESS as `0x${string}`, abi: VAULT_ABI, functionName: "recallFromStrategy", args: [parsedAmount], ...gas, gas: BigInt(400000) });
      await publicClient.waitForTransactionReceipt({ hash: recallTx });
      setManagerStatus("Recalled!"); setManagerAmount(""); await loadStrategyData(); await loadBalances(account);
    } catch (e: any) { setManagerStatus("Error: " + e.message); }
    setManagerLoading(false);
  }

  async function collectManagerFee() {
    if (!account) return;
    setManagerLoading(true); setManagerStatus("Collecting fee...");
    try {
      const walletClient = createWalletClient({ chain: arbitrumSepolia, transport: custom(window.ethereum) });
      const gas = await getFreshGas();
      const feeTx = await walletClient.writeContract({ account: account as `0x${string}`, address: VAULT_ADDRESS as `0x${string}`, abi: VAULT_ABI, functionName: "collectManagerFee", ...gas, gas: BigInt(200000) });
      await publicClient.waitForTransactionReceipt({ hash: feeTx });
      setManagerStatus("Fee collected!"); await loadBalances(account); await loadStrategyData();
    } catch (e: any) { setManagerStatus("Error: " + e.message); }
    setManagerLoading(false);
  }

  const totalUserBalance = (parseFloat(userDeposited) + parseFloat(userYield)).toFixed(6);

  const styles = {
    root: {
      minHeight: "100vh",
      background: dark ? "#0a0a0f" : "#f0f0f5",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      transition: "background 0.4s ease",
    } as React.CSSProperties,
    container: {
      maxWidth: 520,
      margin: "0 auto",
      padding: "32px 20px 80px",
    } as React.CSSProperties,
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 32,
    } as React.CSSProperties,
    logo: {
      fontSize: 20,
      fontWeight: 700,
      color: dark ? "#e8e8f0" : "#0a0a1a",
      letterSpacing: "-0.5px",
    } as React.CSSProperties,
    badge: {
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase" as const,
      color: dark ? "#6366f1" : "#4f46e5",
      background: dark ? "rgba(99,102,241,0.15)" : "rgba(79,70,229,0.1)",
      padding: "3px 8px",
      borderRadius: 20,
      border: `1px solid ${dark ? "rgba(99,102,241,0.3)" : "rgba(79,70,229,0.2)"}`,
    },
    themeToggle: {
      width: 44,
      height: 24,
      borderRadius: 12,
      background: dark ? "#6366f1" : "#d1d5db",
      border: "none",
      cursor: "pointer",
      position: "relative" as const,
      transition: "background 0.3s ease",
      display: "flex",
      alignItems: "center",
      padding: "0 3px",
    },
    themeKnob: {
      width: 18,
      height: 18,
      borderRadius: "50%",
      background: "#fff",
      transition: "transform 0.3s ease",
      transform: dark ? "translateX(20px)" : "translateX(0px)",
      boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
    },
    card: {
      background: dark ? "rgba(255,255,255,0.04)" : "#ffffff",
      border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"}`,
      borderRadius: 16,
      padding: "20px 24px",
      marginBottom: 12,
      transition: "all 0.3s ease",
    } as React.CSSProperties,
    cardGreen: {
      background: dark ? "rgba(16,185,129,0.08)" : "rgba(16,185,129,0.06)",
      border: `1px solid ${dark ? "rgba(16,185,129,0.2)" : "rgba(16,185,129,0.15)"}`,
      borderRadius: 16,
      padding: "20px 24px",
      marginBottom: 12,
    } as React.CSSProperties,
    cardPurple: {
      background: dark ? "rgba(99,102,241,0.08)" : "rgba(99,102,241,0.05)",
      border: `1px solid ${dark ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.12)"}`,
      borderRadius: 16,
      padding: "20px 24px",
      marginBottom: 12,
    } as React.CSSProperties,
    cardBlue: {
      background: dark ? "rgba(59,130,246,0.08)" : "rgba(59,130,246,0.05)",
      border: `1px solid ${dark ? "rgba(59,130,246,0.2)" : "rgba(59,130,246,0.12)"}`,
      borderRadius: 16,
      padding: "20px 24px",
      marginBottom: 12,
    } as React.CSSProperties,
    label: {
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase" as const,
      color: dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)",
      marginBottom: 6,
    },
    value: {
      fontSize: 28,
      fontWeight: 700,
      color: dark ? "#e8e8f0" : "#0a0a1a",
      letterSpacing: "-0.5px",
      lineHeight: 1.2,
    },
    valueGreen: {
      fontSize: 22,
      fontWeight: 700,
      color: "#10b981",
      letterSpacing: "-0.5px",
    },
    valuePurple: {
      fontSize: 22,
      fontWeight: 700,
      color: dark ? "#818cf8" : "#4f46e5",
      letterSpacing: "-0.5px",
    },
    subtext: {
      fontSize: 12,
      color: dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.35)",
      marginTop: 4,
      lineHeight: 1.5,
    },
    input: {
      width: "100%",
      padding: "12px 16px",
      borderRadius: 10,
      border: `1.5px solid ${dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
      background: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
      color: dark ? "#e8e8f0" : "#0a0a1a",
      fontSize: 14,
      outline: "none",
      boxSizing: "border-box" as const,
      transition: "border-color 0.2s",
      fontFamily: "inherit",
    },
    btnPrimary: {
      background: "linear-gradient(135deg, #6366f1, #4f46e5)",
      color: "#fff",
      border: "none",
      borderRadius: 10,
      padding: "12px 20px",
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer",
      transition: "opacity 0.2s, transform 0.1s",
      fontFamily: "inherit",
    },
    btnGreen: {
      background: "linear-gradient(135deg, #10b981, #059669)",
      color: "#fff",
      border: "none",
      borderRadius: 10,
      padding: "12px 20px",
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer",
      transition: "opacity 0.2s, transform 0.1s",
      fontFamily: "inherit",
    },
    btnRed: {
      background: "linear-gradient(135deg, #ef4444, #dc2626)",
      color: "#fff",
      border: "none",
      borderRadius: 10,
      padding: "12px 20px",
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit",
    },
    btnGhost: {
      background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
      color: dark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)",
      border: "none",
      borderRadius: 10,
      padding: "12px 16px",
      fontSize: 13,
      fontWeight: 500,
      cursor: "pointer",
      fontFamily: "inherit",
    },
    btnConnect: {
      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
      color: "#fff",
      border: "none",
      borderRadius: 12,
      padding: "14px 28px",
      fontSize: 15,
      fontWeight: 600,
      cursor: "pointer",
      width: "100%",
      fontFamily: "inherit",
      letterSpacing: "0.02em",
    },
    tabs: {
      display: "flex",
      gap: 4,
      background: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)",
      borderRadius: 12,
      padding: 4,
      marginBottom: 24,
    },
    tab: (active: boolean) => ({
      flex: 1,
      padding: "9px 0",
      borderRadius: 9,
      border: "none",
      background: active ? (dark ? "#6366f1" : "#4f46e5") : "transparent",
      color: active ? "#fff" : (dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)"),
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      transition: "all 0.2s ease",
      fontFamily: "inherit",
      letterSpacing: "0.02em",
    }),
    statusSuccess: {
      padding: "12px 16px",
      background: dark ? "rgba(16,185,129,0.1)" : "rgba(16,185,129,0.08)",
      border: `1px solid ${dark ? "rgba(16,185,129,0.2)" : "rgba(16,185,129,0.15)"}`,
      borderRadius: 10,
      fontSize: 13,
      color: "#10b981",
      marginTop: 8,
    },
    statusError: {
      padding: "12px 16px",
      background: dark ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.06)",
      border: `1px solid ${dark ? "rgba(239,68,68,0.2)" : "rgba(239,68,68,0.12)"}`,
      borderRadius: 10,
      fontSize: 13,
      color: "#ef4444",
      marginTop: 8,
    },
    encHandle: {
      fontSize: 10,
      fontFamily: "monospace",
      color: dark ? "rgba(99,102,241,0.7)" : "rgba(79,70,229,0.6)",
      wordBreak: "break-all" as const,
      marginTop: 8,
      padding: "8px 12px",
      background: dark ? "rgba(99,102,241,0.08)" : "rgba(79,70,229,0.05)",
      borderRadius: 8,
      border: `1px solid ${dark ? "rgba(99,102,241,0.15)" : "rgba(79,70,229,0.1)"}`,
    },
    grid3: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 10,
    },
    miniCard: {
      background: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
      border: `1px solid ${dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)"}`,
      borderRadius: 10,
      padding: "12px 14px",
    },
    miniLabel: {
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase" as const,
      color: dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
      marginBottom: 4,
    },
    miniValue: {
      fontSize: 15,
      fontWeight: 700,
      color: dark ? "#e8e8f0" : "#0a0a1a",
    },
    divider: {
      height: 1,
      background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
      margin: "16px 0",
    },
    walletChip: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
      border: `1px solid ${dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
      borderRadius: 20,
      padding: "6px 12px",
      fontSize: 12,
      fontFamily: "monospace",
      color: dark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)",
    },
    dot: (color: string) => ({
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: color,
      display: "inline-block",
      marginRight: 6,
    }),
  };

  if (!mounted) return null;

  return (
    <div style={styles.root}>
      <div style={styles.container}>

        {/* Header */}
        <div style={styles.header}>
          <div>
            <div style={styles.logo}>NoxVault</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span style={styles.badge}>Arbitrum Sepolia</span>
              <span style={styles.badge}>iExec Nox</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {account && (
              <div style={styles.walletChip}>
                <span style={styles.dot("#10b981")} />
                {account.slice(0, 6)}...{account.slice(-4)}
              </div>
            )}
            <button style={styles.themeToggle} onClick={() => setDark(!dark)}>
              <div style={styles.themeKnob} />
            </button>
          </div>
        </div>

        {/* Hero tagline */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, color: dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)", lineHeight: 1.6 }}>
            Private yield vault — balances encrypted via iExec Nox FHE. Your position is invisible to the blockchain.
          </div>
        </div>

        {!account ? (
          <div style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: dark ? "#e8e8f0" : "#0a0a1a", marginBottom: 8, letterSpacing: "-0.5px" }}>
              Connect to enter the vault
            </div>
            <div style={{ fontSize: 14, color: dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)", marginBottom: 32 }}>
              Your balance will be encrypted the moment you deposit
            </div>
            <button onClick={connect} style={styles.btnConnect}>
              Connect MetaMask
            </button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div style={styles.tabs}>
              <button style={styles.tab(page === "vault")} onClick={() => setPage("vault")}>Vault</button>
              <button style={styles.tab(page === "wrap")} onClick={() => setPage("wrap")}>Wrap</button>
              {isOwner && (
                <button style={styles.tab(page === "manager")} onClick={() => { setPage("manager"); loadStrategyData(); }}>
                  Manager
                </button>
              )}
            </div>

            {/* VAULT TAB */}
            {page === "vault" && (
              <>
                <div style={styles.card}>
                  <div style={styles.label}>Wallet balance</div>
                  <div style={styles.value}>{parseFloat(usdcBalance).toFixed(2)} <span style={{ fontSize: 16, fontWeight: 500, color: dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)" }}>USDC</span></div>
                </div>

                <div style={hasVaultPosition ? styles.cardGreen : styles.card}>
                  <div style={styles.label}>Vault position</div>
                  {hasVaultPosition ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ ...styles.dot("#10b981"), width: 10, height: 10, flexShrink: 0 }} />
                        <span style={{ fontSize: 15, fontWeight: 600, color: "#10b981" }}>Active encrypted position</span>
                      </div>
                      <div style={styles.divider} />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <div>
                          <div style={styles.miniLabel}>Your deposit</div>
                          <div style={styles.valueGreen}>{parseFloat(userDeposited).toFixed(4)}</div>
                          <div style={styles.subtext}>USDC principal</div>
                        </div>
                        <div>
                          <div style={styles.miniLabel}>Yield earned (90%)</div>
                          <div style={styles.valueGreen}>{parseFloat(userYield).toFixed(6)}</div>
                          <div style={styles.subtext}>USDC accrued</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 12, padding: "10px 14px", background: dark ? "rgba(16,185,129,0.1)" : "rgba(16,185,129,0.08)", borderRadius: 10, fontSize: 13, color: "#10b981", fontWeight: 600 }}>
                        You will receive {totalUserBalance} USDC on full withdrawal
                      </div>
                      <div style={styles.encHandle}>
                        Encrypted handle: {encryptedBalance}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 14, color: dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)" }}>No active position</div>
                      <div style={styles.subtext}>Deposit USDC to start earning yield privately</div>
                    </>
                  )}
                </div>

                <div style={styles.card}>
                  <div style={styles.label}>Amount</div>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    style={styles.input}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button onClick={deposit} disabled={loading} style={{ ...styles.btnGreen, flex: 1 }}>
                      {loading ? "Processing..." : "Deposit"}
                    </button>
                    <button onClick={withdraw} disabled={loading} style={{ ...styles.btnRed, flex: 1 }}>
                      {loading ? "Processing..." : "Withdraw"}
                    </button>
                    <button onClick={() => account && loadBalances(account)} style={styles.btnGhost}>
                      Refresh
                    </button>
                  </div>
                </div>

                {status && (
                  <div style={status.startsWith("Error") ? styles.statusError : styles.statusSuccess}>
                    {status}
                  </div>
                )}
              </>
            )}

            {/* WRAP TAB */}
            {page === "wrap" && (
              <>
                <div style={styles.cardBlue}>
                  <div style={styles.label}>What is wrapping?</div>
                  <div style={{ fontSize: 13, color: dark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)", lineHeight: 1.7 }}>
                    Convert public USDC into cUSDC — iExec's confidential token. Transfer amounts are fully encrypted on-chain using Nox FHE. Nobody can see how much you hold or send.
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.label}>USDC balance</div>
                  <div style={styles.value}>{parseFloat(usdcBalance).toFixed(2)} <span style={{ fontSize: 16, fontWeight: 500, color: dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)" }}>USDC</span></div>
                </div>

                <div style={styles.card}>
                  <div style={styles.label}>Wrap USDC to cUSDC</div>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={wrapAmount}
                    onChange={(e) => setWrapAmount(e.target.value)}
                    style={{ ...styles.input, marginTop: 8 }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button onClick={wrapUSDC} disabled={wrapLoading} style={{ ...styles.btnPrimary, flex: 1 }}>
                      {wrapLoading ? "Wrapping..." : "Wrap to cUSDC"}
                    </button>
                    <button onClick={() => account && loadBalances(account)} style={styles.btnGhost}>
                      Refresh
                    </button>
                  </div>
                  {wrapStatus && (
                    <div style={wrapStatus.startsWith("Error") ? styles.statusError : styles.statusSuccess}>
                      {wrapStatus}
                    </div>
                  )}
                </div>

                <div style={styles.card}>
                  <div style={styles.label}>Confidential Transfer</div>
                  <div style={{ fontSize: 12, color: dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)", marginBottom: 12, lineHeight: 1.6 }}>
                    Send cUSDC to any address. The amount is encrypted — invisible to block explorers and on-chain observers.
                  </div>
                  <input
                    type="number"
                    placeholder="Amount in USDC"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    style={{ ...styles.input, marginBottom: 8 }}
                  />
                  <input
                    type="text"
                    placeholder="Recipient address (0x...)"
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                    style={{ ...styles.input, marginBottom: 12 }}
                  />
                  <button
                    onClick={confidentialTransfer}
                    disabled={transferLoading || !transferTo || !transferAmount}
                    style={{ ...styles.btnPrimary, width: "100%" }}
                  >
                    {transferLoading ? "Sending..." : "Send Confidentially"}
                  </button>
                  {transferStatus && (
                    <div style={transferStatus.startsWith("Error") ? styles.statusError : styles.statusSuccess}>
                      {transferStatus}
                    </div>
                  )}
                </div>

                <div style={{ ...styles.card, border: `1px solid ${dark ? "rgba(234,179,8,0.2)" : "rgba(234,179,8,0.15)"}`, background: dark ? "rgba(234,179,8,0.06)" : "rgba(234,179,8,0.04)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: dark ? "#fbbf24" : "#92400e", marginBottom: 6 }}>
                    To unwrap cUSDC back to USDC
                  </div>
                  <div style={{ fontSize: 12, color: dark ? "rgba(251,191,36,0.7)" : "rgba(146,64,14,0.7)", lineHeight: 1.6, marginBottom: 10 }}>
                    Use iExec's official app — handles the two-step TEE decryption proof process.
                  </div>
                  <a href="https://cdefi.iex.ec" target="_blank" style={{ fontSize: 13, color: dark ? "#818cf8" : "#4f46e5", fontWeight: 600, textDecoration: "none" }}>
                    Open cdefi.iex.ec →
                  </a>
                </div>
              </>
            )}

            {/* MANAGER TAB */}
            {page === "manager" && (
              <>
                <div style={styles.cardPurple}>
                  <div style={styles.label}>Manager Console</div>
                  <div style={styles.walletChip}>
                    <span style={styles.dot("#818cf8")} />
                    {account.slice(0, 10)}...{account.slice(-6)}
                  </div>
                  <div style={{ fontSize: 11, color: dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)", marginTop: 8 }}>
                    Owner-only access
                  </div>
                </div>

                <div style={styles.card}>
                  <div style={styles.label}>Strategy overview</div>
                  <div style={styles.grid3}>
                    <div style={styles.miniCard}>
                      <div style={styles.miniLabel}>Reserve</div>
                      <div style={styles.miniValue}>{parseFloat(vaultUSDC).toFixed(4)}</div>
                      <div style={{ fontSize: 10, color: dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)", marginTop: 2 }}>USDC</div>
                    </div>
                    <div style={styles.miniCard}>
                      <div style={styles.miniLabel}>Deployed</div>
                      <div style={styles.miniValue}>{parseFloat(totalDeposited).toFixed(4)}</div>
                      <div style={{ fontSize: 10, color: dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)", marginTop: 2 }}>USDC</div>
                    </div>
                    <div style={{ ...styles.miniCard, border: `1px solid ${dark ? "rgba(16,185,129,0.2)" : "rgba(16,185,129,0.15)"}` }}>
                      <div style={styles.miniLabel}>With yield</div>
                      <div style={{ ...styles.miniValue, color: "#10b981" }}>{parseFloat(totalAssets).toFixed(4)}</div>
                      <div style={{ fontSize: 10, color: "#10b981", marginTop: 2, opacity: 0.7 }}>USDC</div>
                    </div>
                  </div>
                  <button onClick={() => { loadStrategyData(); account && loadBalances(account); }} style={{ ...styles.btnGhost, marginTop: 12, width: "100%" }}>
                    Refresh data
                  </button>
                </div>

                <div style={styles.cardGreen}>
                  <div style={styles.label}>Performance fee (10% of yield)</div>
                  <div style={styles.valueGreen}>{parseFloat(managerFees).toFixed(6)} <span style={{ fontSize: 14, fontWeight: 500 }}>USDC</span></div>
                  <div style={styles.subtext}>Collected so far</div>
                  <button onClick={collectManagerFee} disabled={managerLoading} style={{ ...styles.btnGreen, marginTop: 12 }}>
                    {managerLoading ? "Processing..." : "Collect Fee"}
                  </button>
                </div>

                <div style={styles.card}>
                  <div style={styles.label}>Deploy / Recall funds</div>
                  <input
                    type="number"
                    placeholder="Amount in USDC"
                    value={managerAmount}
                    onChange={(e) => setManagerAmount(e.target.value)}
                    style={{ ...styles.input, marginTop: 8 }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button onClick={deployToStrategy} disabled={managerLoading} style={{ ...styles.btnPrimary, flex: 1 }}>
                      {managerLoading ? "..." : "Deploy"}
                    </button>
                    <button onClick={recallFromStrategy} disabled={managerLoading} style={{ ...styles.btnRed, flex: 1 }}>
                      {managerLoading ? "..." : "Recall"}
                    </button>
                  </div>
                </div>

                <div style={{ ...styles.card, background: dark ? "rgba(234,179,8,0.06)" : "rgba(234,179,8,0.04)", border: `1px solid ${dark ? "rgba(234,179,8,0.15)" : "rgba(234,179,8,0.1)"}` }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: dark ? "#fbbf24" : "#92400e", marginBottom: 6 }}>How yield distribution works</div>
                  <div style={{ fontSize: 12, color: dark ? "rgba(251,191,36,0.7)" : "rgba(146,64,14,0.8)", lineHeight: 1.7 }}>
                    MockYieldStrategy accrues 5% APY. Users receive 90% of yield proportional to their deposit. You collect 10% as performance fee. Withdrawals auto-pull from strategy if vault reserve is low.
                  </div>
                </div>

                {managerStatus && (
                  <div style={managerStatus.startsWith("Error") ? styles.statusError : styles.statusSuccess}>
                    {managerStatus}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 40, fontSize: 11, color: dark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)", letterSpacing: "0.04em" }}>
          NOXVAULT · POWERED BY IEXEC NOX · ARBITRUM SEPOLIA
        </div>
      </div>
    </div>
  );
}
