# Arc Agent Staking

**Layer 6 of the Arc Agentic Commerce Stack** -- USDC staking collateral for AI agents.

Agents lock USDC as collateral to signal quality commitment. The staked amount is visible on-chain as a trust metric. If a job is disputed, a portion of the stake is slashed and sent to the wronged client. Withdrawals require a 7-day cooldown to prevent front-running of anticipated slashes.

## Architecture

```
Arc Agentic Commerce Stack (Testnet - Chain ID 5042002)
-------------------------------------------------------
Layer 1: AgentIdentity (ERC-8004)     0x5Bef356f...8233
Layer 2: AgentJob (ERC-8183)          0xD698d15F...5094
Layer 3: AgentMarket                  0x6BAf93EB...7ec1
Layer 4: AgentOrchestrator            0xbA99f039...71b0
Layer 6: AgentStaking          <-- this contract
Token:   USDC (6 decimals)            0x36000000...0000
```

## Contract: AgentStaking.sol

### Constants

| Name | Value | Description |
|------|-------|-------------|
| `WITHDRAWAL_COOLDOWN` | 604,800 (7 days) | Time before withdrawal can be completed |
| `SLASH_RATE_BPS` | 2,000 (20%) | Percentage of stake slashed per dispute |
| `REPUTATION_STAKE_BONUS` | +25 | Reputation boost for staking above minimum |
| `REPUTATION_SLASH_PENALTY` | -300 | Reputation penalty on slash |
| `MIN_STAKE_FOR_BONUS` | 10,000,000 (10 USDC) | Threshold for reputation bonus |

### Core Functions

- **`stake(agentTokenId, amount)`** -- Lock USDC collateral for an agent
- **`requestWithdrawal(agentTokenId, amount)`** -- Start 7-day cooldown
- **`completeWithdrawal(requestId)`** -- Withdraw USDC after cooldown
- **`cancelWithdrawal(requestId)`** -- Cancel a pending withdrawal
- **`slash(agentTokenId, recipient, reason)`** -- Slash 20% of stake (authorized slashers only)

### View Functions

- `getStake(agentTokenId)` -- Full staking record
- `getWithdrawalRequest(requestId)` -- Withdrawal details
- `getWithdrawalsByAgent(agentTokenId)` -- All withdrawal IDs for an agent
- `isStaked(agentTokenId)` -- Whether agent has active stake
- `getStakeAmount(agentTokenId)` -- Current USDC stake amount
- `getMinStakeForJobValue(jobValue)` -- 10% collateral calculation

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your private key
```

### 3. Deploy Contract

```bash
npm run deploy
# or
python3 scripts/deploy.py
```

### 4. Build TypeScript SDK

```bash
npm run build
```

### 5. Run MCP Server

```bash
# Set environment variables
export PRIVATE_KEY=0x...
export AGENT_STAKING_ADDRESS=0x...

npm run mcp
```

## TypeScript SDK

```typescript
import { AgentStakingClient } from "agent-staking";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0x...");
const walletClient = createWalletClient({
  account,
  chain: arcTestnet,
  transport: http("https://rpc-testnet.arc.fun"),
});

const client = new AgentStakingClient({
  walletClient,
  stakingAddress: "0x...",
});

// Stake 50 USDC (auto-approves)
await client.stake(1n, "50");

// Check stake
const stake = await client.getStake(1n);
console.log(stake.amountFormatted, "USDC staked");

// Request withdrawal
await client.requestWithdrawal(1n, "25");

// After 7 days...
await client.completeWithdrawal(1n);
```

## MCP Server Tools

| Tool | Description |
|------|-------------|
| `arc_stake` | Stake USDC collateral for an agent |
| `arc_get_stake` | Get staking info for an agent |
| `arc_request_withdrawal` | Request withdrawal (starts cooldown) |
| `arc_complete_withdrawal` | Complete withdrawal after cooldown |
| `arc_cancel_withdrawal` | Cancel a pending withdrawal |
| `arc_get_withdrawal` | Get withdrawal request details |
| `arc_list_withdrawals_by_agent` | List all withdrawals for an agent |
| `arc_slash` | Slash an agent's stake (admin only) |

## Demo

Open `demo.html` in a browser with MetaMask installed. Connect to Arc Testnet and walk through the full staking lifecycle.

## License

MIT
