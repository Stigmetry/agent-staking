/**
 * Arc Agent Staking -- Configuration
 * ===================================
 * Canonical addresses for all layers of the Arc agentic commerce stack
 * deployed on Arc Testnet (Chain ID 5042002).
 */

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export const ARC_TESTNET_CHAIN_ID = 5042002;
export const ARC_TESTNET_RPC = "https://rpc-testnet.arc.fun";

// ---------------------------------------------------------------------------
// Contract Addresses -- Arc Testnet
// ---------------------------------------------------------------------------

export const ADDRESSES = {
  /** Layer 1 -- AgentIdentity (ERC-8004) */
  agentIdentity: "0x5Bef356f89425823FC7eebB3A6ED1A678F3b8233" as `0x${string}`,

  /** Layer 2 -- AgentJob (ERC-8183) */
  agentJob: "0xD698d15F776279c0213444a779941e8E0Cbe5094" as `0x${string}`,

  /** Layer 3 -- AgentMarket */
  agentMarket: "0x6BAf93EB026b7BC3db651065302D1934Ad577ec1" as `0x${string}`,

  /** Layer 4 -- AgentOrchestrator */
  agentOrchestrator: "0xbA99f039b7892d9F546253444c95EDea822471b0" as `0x${string}`,

  /** Layer 6 -- AgentStaking (set after deployment) */
  agentStaking: "0x0000000000000000000000000000000000000000" as `0x${string}`,

  /** USDC ERC-20 (6 decimals) */
  usdc: "0x3600000000000000000000000000000000000000" as `0x${string}`,
} as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** USDC has 6 decimal places. */
export const USDC_DECIMALS = 6;

/** Cooldown period for withdrawals (7 days in seconds). */
export const WITHDRAWAL_COOLDOWN = 604_800;

/** Slash rate in basis points (20%). */
export const SLASH_RATE_BPS = 2_000;

/** Reputation bonus for staking above minimum (+0.25%). */
export const REPUTATION_STAKE_BONUS = 25;

/** Reputation penalty on slash (-3%). */
export const REPUTATION_SLASH_PENALTY = -300;

/** Minimum stake to qualify for reputation bonus (10 USDC). */
export const MIN_STAKE_FOR_BONUS = 10_000_000;

// ---------------------------------------------------------------------------
// Status Maps
// ---------------------------------------------------------------------------

export const WITHDRAWAL_STATUS: Record<number, string> = {
  0: "None",
  1: "Pending",
  2: "Completed",
  3: "Cancelled",
};
