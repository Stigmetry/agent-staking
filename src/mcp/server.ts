/**
 * Arc Agent Staking -- MCP Server
 * =================================
 * Model Context Protocol server exposing 8 staking tools for AI agent
 * integration. Runs as a stdio-based MCP server.
 *
 * Tools:
 *   arc_stake                    -- Stake USDC collateral for an agent
 *   arc_get_stake                -- Get an agent's staking info
 *   arc_request_withdrawal       -- Request withdrawal (starts 7-day cooldown)
 *   arc_complete_withdrawal      -- Complete withdrawal after cooldown
 *   arc_cancel_withdrawal        -- Cancel a pending withdrawal
 *   arc_get_withdrawal           -- Get withdrawal request details
 *   arc_list_withdrawals_by_agent -- List all withdrawals for an agent
 *   arc_slash                    -- Slash an agent's stake (admin only)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AgentStakingClient, arcTestnet } from "../staking/staking.js";
import { ARC_TESTNET_RPC, WITHDRAWAL_STATUS } from "../config.js";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}` | undefined;
const STAKING_ADDRESS = process.env.AGENT_STAKING_ADDRESS as Address | undefined;
const RPC_URL = process.env.ARC_TESTNET_RPC ?? ARC_TESTNET_RPC;

// ---------------------------------------------------------------------------
// Client Setup
// ---------------------------------------------------------------------------

function createClient(): AgentStakingClient {
  if (!PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY environment variable is required");
  }
  if (!STAKING_ADDRESS) {
    throw new Error("AGENT_STAKING_ADDRESS environment variable is required");
  }

  const account = privateKeyToAccount(PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(RPC_URL),
  });

  return new AgentStakingClient({
    rpcUrl: RPC_URL,
    walletClient,
    stakingAddress: STAKING_ADDRESS,
  });
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "arc-agent-staking",
  version: "1.0.0",
});

// ----- arc_stake -----------------------------------------------------------

server.tool(
  "arc_stake",
  "Stake USDC collateral for an AI agent on Arc. Auto-approves USDC if needed.",
  {
    agentTokenId: z.string().describe("The ERC-8004 agent token ID"),
    amountUsdc: z.string().describe("USDC amount to stake (e.g. '50' for 50 USDC)"),
  },
  async ({ agentTokenId, amountUsdc }) => {
    try {
      const client = createClient();
      const result = await client.stake(BigInt(agentTokenId), amountUsdc);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                txHash: result.txHash,
                agentTokenId: result.agentTokenId.toString(),
                amountUsdc: result.amountFormatted,
                message: `Staked ${result.amountFormatted} USDC for agent #${result.agentTokenId}`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: error.message }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ----- arc_get_stake -------------------------------------------------------

server.tool(
  "arc_get_stake",
  "Get staking information for an AI agent on Arc.",
  {
    agentTokenId: z.string().describe("The ERC-8004 agent token ID"),
  },
  async ({ agentTokenId }) => {
    try {
      const client = createClient();
      const stake = await client.getStake(BigInt(agentTokenId));
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                agentTokenId: stake.agentTokenId.toString(),
                amountUsdc: stake.amountFormatted,
                amountRaw: stake.amount.toString(),
                stakedAt: stake.stakedAtDate.toISOString(),
                slashCount: stake.slashCount.toString(),
                active: stake.active,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: error.message }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ----- arc_request_withdrawal -----------------------------------------------

server.tool(
  "arc_request_withdrawal",
  "Request withdrawal of staked USDC. Starts a 7-day cooldown period.",
  {
    agentTokenId: z.string().describe("The ERC-8004 agent token ID"),
    amountUsdc: z.string().describe("USDC amount to withdraw (e.g. '25')"),
  },
  async ({ agentTokenId, amountUsdc }) => {
    try {
      const client = createClient();
      const result = await client.requestWithdrawal(
        BigInt(agentTokenId),
        amountUsdc
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                txHash: result.txHash,
                message: `Withdrawal of ${amountUsdc} USDC requested for agent #${agentTokenId}. 7-day cooldown started.`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: error.message }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ----- arc_complete_withdrawal -----------------------------------------------

server.tool(
  "arc_complete_withdrawal",
  "Complete a withdrawal after the 7-day cooldown has elapsed.",
  {
    requestId: z.string().describe("The withdrawal request ID"),
  },
  async ({ requestId }) => {
    try {
      const client = createClient();
      const result = await client.completeWithdrawal(BigInt(requestId));
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                txHash: result.txHash,
                requestId: result.requestId?.toString(),
                message: `Withdrawal #${requestId} completed. USDC transferred to agent owner.`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: error.message }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ----- arc_cancel_withdrawal -------------------------------------------------

server.tool(
  "arc_cancel_withdrawal",
  "Cancel a pending withdrawal request.",
  {
    requestId: z.string().describe("The withdrawal request ID to cancel"),
  },
  async ({ requestId }) => {
    try {
      const client = createClient();
      const result = await client.cancelWithdrawal(BigInt(requestId));
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                txHash: result.txHash,
                requestId: result.requestId?.toString(),
                message: `Withdrawal #${requestId} cancelled.`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: error.message }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ----- arc_get_withdrawal ----------------------------------------------------

server.tool(
  "arc_get_withdrawal",
  "Get details of a withdrawal request.",
  {
    requestId: z.string().describe("The withdrawal request ID"),
  },
  async ({ requestId }) => {
    try {
      const client = createClient();
      const info = await client.getWithdrawalRequest(BigInt(requestId));
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                id: info.id.toString(),
                agentTokenId: info.agentTokenId.toString(),
                amountUsdc: info.amountFormatted,
                requestedAt: info.requestedAtDate.toISOString(),
                status: info.statusLabel,
                cooldownEndsAt: new Date(
                  Number(info.cooldownEndsAt) * 1000
                ).toISOString(),
                canComplete: info.canComplete,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: error.message }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ----- arc_list_withdrawals_by_agent ----------------------------------------

server.tool(
  "arc_list_withdrawals_by_agent",
  "List all withdrawal request IDs for an agent.",
  {
    agentTokenId: z.string().describe("The ERC-8004 agent token ID"),
  },
  async ({ agentTokenId }) => {
    try {
      const client = createClient();
      const ids = await client.getWithdrawalsByAgent(BigInt(agentTokenId));

      // Fetch details for each
      const withdrawals = await Promise.all(
        ids.map(async (id) => {
          const info = await client.getWithdrawalRequest(id);
          return {
            id: info.id.toString(),
            amountUsdc: info.amountFormatted,
            requestedAt: info.requestedAtDate.toISOString(),
            status: info.statusLabel,
            canComplete: info.canComplete,
          };
        })
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                agentTokenId,
                count: withdrawals.length,
                withdrawals,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: error.message }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ----- arc_slash -------------------------------------------------------------

server.tool(
  "arc_slash",
  "Slash an agent's stake (admin only -- caller must be an authorized slasher). Slashes 20% of the agent's current stake and sends it to the recipient.",
  {
    agentTokenId: z.string().describe("The ERC-8004 agent token ID to slash"),
    recipient: z.string().describe("Address to receive slashed funds (the wronged client)"),
    reason: z.string().describe("Human-readable reason for the slash"),
  },
  async ({ agentTokenId, recipient, reason }) => {
    try {
      const client = createClient();
      const result = await client.slash(
        BigInt(agentTokenId),
        recipient as Address,
        reason
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                txHash: result.txHash,
                message: `Agent #${agentTokenId} slashed. 20% of stake sent to ${recipient}. Reason: ${reason}`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: error.message }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Arc Agent Staking MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
