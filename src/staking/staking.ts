/**
 * Arc Agent Staking -- TypeScript SDK
 * =====================================
 * AgentStakingClient wraps all AgentStaking.sol functions using viem.
 * Provides auto-approval for USDC spending and human-readable return types.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Address,
  type Hash,
  type Chain,
  formatUnits,
  parseUnits,
} from "viem";
import {
  ADDRESSES,
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_RPC,
  USDC_DECIMALS,
  WITHDRAWAL_STATUS,
} from "../config.js";

// ---------------------------------------------------------------------------
// Chain definition
// ---------------------------------------------------------------------------

export const arcTestnet: Chain = {
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "ARC", symbol: "ARC", decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_TESTNET_RPC] },
  },
};

// ---------------------------------------------------------------------------
// ABIs (minimal for SDK usage)
// ---------------------------------------------------------------------------

const AGENT_STAKING_ABI = [
  // stake
  {
    name: "stake",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentTokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  // requestWithdrawal
  {
    name: "requestWithdrawal",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentTokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "requestId", type: "uint256" }],
  },
  // completeWithdrawal
  {
    name: "completeWithdrawal",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "requestId", type: "uint256" }],
    outputs: [],
  },
  // cancelWithdrawal
  {
    name: "cancelWithdrawal",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "requestId", type: "uint256" }],
    outputs: [],
  },
  // slash
  {
    name: "slash",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentTokenId", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
  },
  // setAuthorizedSlasher
  {
    name: "setAuthorizedSlasher",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "slasher", type: "address" },
      { name: "authorized", type: "bool" },
    ],
    outputs: [],
  },
  // getStake
  {
    name: "getStake",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentTokenId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "agentTokenId", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "stakedAt", type: "uint256" },
          { name: "slashCount", type: "uint256" },
          { name: "active", type: "bool" },
        ],
      },
    ],
  },
  // getWithdrawalRequest
  {
    name: "getWithdrawalRequest",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "requestId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "agentTokenId", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "requestedAt", type: "uint256" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  // getWithdrawalsByAgent
  {
    name: "getWithdrawalsByAgent",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentTokenId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  // isStaked
  {
    name: "isStaked",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentTokenId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  // getStakeAmount
  {
    name: "getStakeAmount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentTokenId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  // getMinStakeForJobValue
  {
    name: "getMinStakeForJobValue",
    type: "function",
    stateMutability: "pure",
    inputs: [{ name: "jobValue", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  // authorizedSlashers
  {
    name: "authorizedSlashers",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  // Events
  {
    name: "Staked",
    type: "event",
    inputs: [
      { name: "agentTokenId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "totalStake", type: "uint256", indexed: false },
    ],
  },
  {
    name: "WithdrawalRequested",
    type: "event",
    inputs: [
      { name: "requestId", type: "uint256", indexed: true },
      { name: "agentTokenId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "WithdrawalCompleted",
    type: "event",
    inputs: [
      { name: "requestId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "WithdrawalCancelled",
    type: "event",
    inputs: [{ name: "requestId", type: "uint256", indexed: true }],
  },
  {
    name: "Slashed",
    type: "event",
    inputs: [
      { name: "agentTokenId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "recipient", type: "address", indexed: false },
      { name: "reason", type: "string", indexed: false },
    ],
  },
] as const;

const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StakeInfo {
  agentTokenId: bigint;
  amount: bigint;
  amountFormatted: string;
  stakedAt: bigint;
  stakedAtDate: Date;
  slashCount: bigint;
  active: boolean;
}

export interface WithdrawalRequestInfo {
  id: bigint;
  agentTokenId: bigint;
  amount: bigint;
  amountFormatted: string;
  requestedAt: bigint;
  requestedAtDate: Date;
  status: number;
  statusLabel: string;
  cooldownEndsAt: bigint;
  canComplete: boolean;
}

export interface StakeResult {
  txHash: Hash;
  agentTokenId: bigint;
  amount: bigint;
  amountFormatted: string;
}

export interface WithdrawalResult {
  txHash: Hash;
  requestId?: bigint;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class AgentStakingClient {
  public readonly publicClient: PublicClient;
  public readonly walletClient: WalletClient;
  public readonly stakingAddress: Address;
  public readonly usdcAddress: Address;

  constructor(params: {
    rpcUrl?: string;
    walletClient: WalletClient;
    stakingAddress?: Address;
    usdcAddress?: Address;
  }) {
    const rpcUrl = params.rpcUrl ?? ARC_TESTNET_RPC;

    this.publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(rpcUrl),
    });

    this.walletClient = params.walletClient;
    this.stakingAddress = params.stakingAddress ?? ADDRESSES.agentStaking;
    this.usdcAddress = params.usdcAddress ?? ADDRESSES.usdc;
  }

  // -----------------------------------------------------------------------
  // Write Functions
  // -----------------------------------------------------------------------

  /**
   * Stake USDC as collateral for an agent.
   * Automatically approves the staking contract to spend USDC if needed.
   *
   * @param agentTokenId - The ERC-8004 token ID of the agent.
   * @param amountUsdc   - The human-readable USDC amount (e.g. "50" for 50 USDC).
   */
  async stake(
    agentTokenId: bigint,
    amountUsdc: string
  ): Promise<StakeResult> {
    const amount = parseUnits(amountUsdc, USDC_DECIMALS);
    const account = this.walletClient.account!;

    // Auto-approve if needed
    await this._ensureAllowance(account.address, amount);

    const txHash = await this.walletClient.writeContract({
      address: this.stakingAddress,
      abi: AGENT_STAKING_ABI,
      functionName: "stake",
      args: [agentTokenId, amount],
      chain: arcTestnet,
      account,
    });

    return {
      txHash,
      agentTokenId,
      amount,
      amountFormatted: amountUsdc,
    };
  }

  /**
   * Request a withdrawal of staked USDC. Starts a 7-day cooldown.
   *
   * @param agentTokenId - The ERC-8004 token ID of the agent.
   * @param amountUsdc   - The human-readable USDC amount to withdraw.
   */
  async requestWithdrawal(
    agentTokenId: bigint,
    amountUsdc: string
  ): Promise<WithdrawalResult> {
    const amount = parseUnits(amountUsdc, USDC_DECIMALS);
    const account = this.walletClient.account!;

    const txHash = await this.walletClient.writeContract({
      address: this.stakingAddress,
      abi: AGENT_STAKING_ABI,
      functionName: "requestWithdrawal",
      args: [agentTokenId, amount],
      chain: arcTestnet,
      account,
    });

    return { txHash };
  }

  /**
   * Complete a withdrawal after the 7-day cooldown has elapsed.
   *
   * @param requestId - The withdrawal request ID.
   */
  async completeWithdrawal(requestId: bigint): Promise<WithdrawalResult> {
    const account = this.walletClient.account!;

    const txHash = await this.walletClient.writeContract({
      address: this.stakingAddress,
      abi: AGENT_STAKING_ABI,
      functionName: "completeWithdrawal",
      args: [requestId],
      chain: arcTestnet,
      account,
    });

    return { txHash, requestId };
  }

  /**
   * Cancel a pending withdrawal request.
   *
   * @param requestId - The withdrawal request ID.
   */
  async cancelWithdrawal(requestId: bigint): Promise<WithdrawalResult> {
    const account = this.walletClient.account!;

    const txHash = await this.walletClient.writeContract({
      address: this.stakingAddress,
      abi: AGENT_STAKING_ABI,
      functionName: "cancelWithdrawal",
      args: [requestId],
      chain: arcTestnet,
      account,
    });

    return { txHash, requestId };
  }

  /**
   * Slash an agent's stake (admin only -- authorized slashers).
   *
   * @param agentTokenId - The ERC-8004 token ID of the agent.
   * @param recipient    - Address to receive the slashed funds.
   * @param reason       - Human-readable reason for the slash.
   */
  async slash(
    agentTokenId: bigint,
    recipient: Address,
    reason: string
  ): Promise<{ txHash: Hash }> {
    const account = this.walletClient.account!;

    const txHash = await this.walletClient.writeContract({
      address: this.stakingAddress,
      abi: AGENT_STAKING_ABI,
      functionName: "slash",
      args: [agentTokenId, recipient, reason],
      chain: arcTestnet,
      account,
    });

    return { txHash };
  }

  /**
   * Authorize or deauthorize an address to slash stakes (owner only).
   *
   * @param slasher    - The address to authorize or deauthorize.
   * @param authorized - Whether the address should be authorized.
   */
  async setAuthorizedSlasher(
    slasher: Address,
    authorized: boolean
  ): Promise<{ txHash: Hash }> {
    const account = this.walletClient.account!;

    const txHash = await this.walletClient.writeContract({
      address: this.stakingAddress,
      abi: AGENT_STAKING_ABI,
      functionName: "setAuthorizedSlasher",
      args: [slasher, authorized],
      chain: arcTestnet,
      account,
    });

    return { txHash };
  }

  // -----------------------------------------------------------------------
  // Read Functions
  // -----------------------------------------------------------------------

  /**
   * Get the full staking record for an agent.
   */
  async getStake(agentTokenId: bigint): Promise<StakeInfo> {
    const raw = (await this.publicClient.readContract({
      address: this.stakingAddress,
      abi: AGENT_STAKING_ABI,
      functionName: "getStake",
      args: [agentTokenId],
    })) as any;

    return {
      agentTokenId: raw.agentTokenId,
      amount: raw.amount,
      amountFormatted: formatUnits(raw.amount, USDC_DECIMALS),
      stakedAt: raw.stakedAt,
      stakedAtDate: new Date(Number(raw.stakedAt) * 1000),
      slashCount: raw.slashCount,
      active: raw.active,
    };
  }

  /**
   * Get the details of a withdrawal request.
   */
  async getWithdrawalRequest(
    requestId: bigint
  ): Promise<WithdrawalRequestInfo> {
    const raw = (await this.publicClient.readContract({
      address: this.stakingAddress,
      abi: AGENT_STAKING_ABI,
      functionName: "getWithdrawalRequest",
      args: [requestId],
    })) as any;

    const status = Number(raw.status);
    const cooldownEndsAt = raw.requestedAt + BigInt(604800);
    const now = BigInt(Math.floor(Date.now() / 1000));

    return {
      id: raw.id,
      agentTokenId: raw.agentTokenId,
      amount: raw.amount,
      amountFormatted: formatUnits(raw.amount, USDC_DECIMALS),
      requestedAt: raw.requestedAt,
      requestedAtDate: new Date(Number(raw.requestedAt) * 1000),
      status,
      statusLabel: WITHDRAWAL_STATUS[status] ?? "Unknown",
      cooldownEndsAt,
      canComplete: status === 1 && now >= cooldownEndsAt,
    };
  }

  /**
   * Get all withdrawal request IDs for an agent.
   */
  async getWithdrawalsByAgent(agentTokenId: bigint): Promise<bigint[]> {
    return (await this.publicClient.readContract({
      address: this.stakingAddress,
      abi: AGENT_STAKING_ABI,
      functionName: "getWithdrawalsByAgent",
      args: [agentTokenId],
    })) as bigint[];
  }

  /**
   * Check whether an agent has an active stake.
   */
  async isStaked(agentTokenId: bigint): Promise<boolean> {
    return (await this.publicClient.readContract({
      address: this.stakingAddress,
      abi: AGENT_STAKING_ABI,
      functionName: "isStaked",
      args: [agentTokenId],
    })) as boolean;
  }

  /**
   * Get the current stake amount for an agent.
   */
  async getStakeAmount(agentTokenId: bigint): Promise<{
    raw: bigint;
    formatted: string;
  }> {
    const raw = (await this.publicClient.readContract({
      address: this.stakingAddress,
      abi: AGENT_STAKING_ABI,
      functionName: "getStakeAmount",
      args: [agentTokenId],
    })) as bigint;

    return {
      raw,
      formatted: formatUnits(raw, USDC_DECIMALS),
    };
  }

  /**
   * Calculate the minimum stake required for a job of a given value.
   */
  async getMinStakeForJobValue(
    jobValueUsdc: string
  ): Promise<{ raw: bigint; formatted: string }> {
    const jobValue = parseUnits(jobValueUsdc, USDC_DECIMALS);

    const raw = (await this.publicClient.readContract({
      address: this.stakingAddress,
      abi: AGENT_STAKING_ABI,
      functionName: "getMinStakeForJobValue",
      args: [jobValue],
    })) as bigint;

    return {
      raw,
      formatted: formatUnits(raw, USDC_DECIMALS),
    };
  }

  /**
   * Check if an address is an authorized slasher.
   */
  async isAuthorizedSlasher(address: Address): Promise<boolean> {
    return (await this.publicClient.readContract({
      address: this.stakingAddress,
      abi: AGENT_STAKING_ABI,
      functionName: "authorizedSlashers",
      args: [address],
    })) as boolean;
  }

  // -----------------------------------------------------------------------
  // USDC Helpers
  // -----------------------------------------------------------------------

  /**
   * Get the USDC balance of an address.
   */
  async getUsdcBalance(address: Address): Promise<{
    raw: bigint;
    formatted: string;
  }> {
    const raw = (await this.publicClient.readContract({
      address: this.usdcAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    })) as bigint;

    return {
      raw,
      formatted: formatUnits(raw, USDC_DECIMALS),
    };
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /**
   * Ensure the staking contract has sufficient USDC allowance from the caller.
   * If not, sends an approval transaction for the exact amount needed.
   */
  private async _ensureAllowance(
    owner: Address,
    amount: bigint
  ): Promise<void> {
    const currentAllowance = (await this.publicClient.readContract({
      address: this.usdcAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, this.stakingAddress],
    })) as bigint;

    if (currentAllowance < amount) {
      const approveHash = await this.walletClient.writeContract({
        address: this.usdcAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [this.stakingAddress, amount],
        chain: arcTestnet,
        account: this.walletClient.account!,
      });

      await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
    }
  }
}

export default AgentStakingClient;
