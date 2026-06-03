// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAgentIdentity
 * @notice Interface for the AgentIdentity (ERC-8004) registry contract.
 */
interface IAgentIdentity {
    struct AgentIdentity {
        address owner;
        string name;
        string metadataURI;
        uint256 reputation;
        uint256 registeredAt;
        bool active;
    }
    function getAgent(uint256 tokenId) external view returns (AgentIdentity memory);
    function adjustReputation(uint256 tokenId, int256 delta) external;
}

/**
 * @title IERC20
 * @notice Minimal ERC-20 interface used for USDC interactions.
 */
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

/**
 * @title AgentStaking
 * @author Arc Protocol
 * @notice Layer 6 of the Arc agentic commerce stack -- USDC staking collateral for AI agents.
 *
 * @dev Agents lock USDC as collateral to signal quality commitment. The staked amount is
 *      visible on-chain as a trust metric for clients evaluating agents. If a job is disputed,
 *      an authorized slasher (the AgentJob or AgentOrchestrator contract) can slash a portion
 *      of the stake and send it to the wronged client. Withdrawals require a 7-day cooldown
 *      period to prevent front-running of anticipated slashes.
 *
 *      Deployed on Arc Testnet (Chain ID 5042002).
 */
contract AgentStaking {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Arc Testnet USDC contract address (6 decimals).
    address public constant USDC = 0x3600000000000000000000000000000000000000;

    /// @notice Cooldown period before a withdrawal can be completed (7 days).
    uint256 public constant WITHDRAWAL_COOLDOWN = 604800;

    /// @notice Percentage of stake slashed per dispute, in basis points (20%).
    uint256 public constant SLASH_RATE_BPS = 2000;

    /// @notice Reputation bonus awarded when an agent stakes above the minimum threshold.
    int256 public constant REPUTATION_STAKE_BONUS = 25;

    /// @notice Reputation penalty applied when an agent's stake is slashed.
    int256 public constant REPUTATION_SLASH_PENALTY = -300;

    /// @notice Minimum stake amount to qualify for a reputation bonus (10 USDC, 6 decimals).
    uint256 public constant MIN_STAKE_FOR_BONUS = 10_000_000;

    // -------------------------------------------------------------------------
    // Enums
    // -------------------------------------------------------------------------

    /// @notice Status of a withdrawal request.
    enum WithdrawalStatus {
        None,
        Pending,
        Completed,
        Cancelled
    }

    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    /// @notice Represents an agent's staking position.
    /// @param agentTokenId The ERC-8004 token ID of the agent.
    /// @param amount The total USDC staked (6 decimals).
    /// @param stakedAt Timestamp of the initial stake.
    /// @param slashCount Number of times this stake has been slashed.
    /// @param active Whether this stake position is currently active.
    struct Stake {
        uint256 agentTokenId;
        uint256 amount;
        uint256 stakedAt;
        uint256 slashCount;
        bool active;
    }

    /// @notice Represents a pending, completed, or cancelled withdrawal request.
    /// @param id Unique withdrawal request identifier.
    /// @param agentTokenId The ERC-8004 token ID of the agent.
    /// @param amount The USDC amount requested for withdrawal (6 decimals).
    /// @param requestedAt Timestamp when the withdrawal was requested.
    /// @param status Current status of the withdrawal request.
    struct WithdrawalRequest {
        uint256 id;
        uint256 agentTokenId;
        uint256 amount;
        uint256 requestedAt;
        WithdrawalStatus status;
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Maps agent token ID to its staking position.
    mapping(uint256 => Stake) public stakes;

    /// @notice Maps withdrawal request ID to the request details.
    mapping(uint256 => WithdrawalRequest) public withdrawalRequests;

    /// @notice Maps agent token ID to an array of its withdrawal request IDs.
    mapping(uint256 => uint256[]) public withdrawalsByAgent;

    /// @notice Auto-incrementing withdrawal request ID counter (starts at 1).
    uint256 private _nextWithdrawalId;

    /// @notice Reference to the AgentIdentity (ERC-8004) registry contract.
    IAgentIdentity public identityRegistry;

    /// @notice Reference to the USDC ERC-20 contract.
    IERC20 private _usdc;

    /// @notice Contract owner (deployer).
    address public owner;

    /// @notice Maps addresses to whether they are authorized to slash stakes.
    /// @dev Typically the AgentJob and AgentOrchestrator contracts.
    mapping(address => bool) public authorizedSlashers;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when an agent stakes USDC collateral.
    /// @param agentTokenId The ERC-8004 token ID of the agent.
    /// @param amount The USDC amount staked in this transaction.
    /// @param totalStake The agent's total stake after this deposit.
    event Staked(
        uint256 indexed agentTokenId,
        uint256 amount,
        uint256 totalStake
    );

    /// @notice Emitted when an agent requests a withdrawal of staked USDC.
    /// @param requestId The unique withdrawal request identifier.
    /// @param agentTokenId The ERC-8004 token ID of the agent.
    /// @param amount The USDC amount requested for withdrawal.
    event WithdrawalRequested(
        uint256 indexed requestId,
        uint256 indexed agentTokenId,
        uint256 amount
    );

    /// @notice Emitted when a withdrawal request is completed and USDC is returned.
    /// @param requestId The unique withdrawal request identifier.
    /// @param amount The USDC amount withdrawn.
    event WithdrawalCompleted(
        uint256 indexed requestId,
        uint256 amount
    );

    /// @notice Emitted when a pending withdrawal request is cancelled.
    /// @param requestId The unique withdrawal request identifier.
    event WithdrawalCancelled(uint256 indexed requestId);

    /// @notice Emitted when an agent's stake is slashed due to a dispute.
    /// @param agentTokenId The ERC-8004 token ID of the slashed agent.
    /// @param amount The USDC amount slashed.
    /// @param recipient The address that receives the slashed funds (the wronged client).
    /// @param reason A human-readable reason for the slash.
    event Slashed(
        uint256 indexed agentTokenId,
        uint256 amount,
        address recipient,
        string reason
    );

    /// @notice Emitted when a slasher is authorized or deauthorized.
    /// @param slasher The address being authorized or deauthorized.
    /// @param authorized Whether the address is now authorized.
    event SlasherAuthorized(
        address indexed slasher,
        bool authorized
    );

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    /// @dev Restricts function access to the contract owner.
    modifier onlyOwner() {
        require(msg.sender == owner, "AgentStaking: caller is not the owner");
        _;
    }

    /// @dev Restricts function access to authorized slashers.
    modifier onlyAuthorizedSlasher() {
        require(
            authorizedSlashers[msg.sender],
            "AgentStaking: caller is not an authorized slasher"
        );
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @notice Deploys the AgentStaking contract.
     * @param _identityRegistry Address of the AgentIdentity (ERC-8004) registry.
     * @param _usdcAddress Address of the USDC ERC-20 token contract.
     */
    constructor(address _identityRegistry, address _usdcAddress) {
        require(
            _identityRegistry != address(0),
            "AgentStaking: identity registry cannot be zero address"
        );
        require(
            _usdcAddress != address(0),
            "AgentStaking: USDC address cannot be zero address"
        );

        identityRegistry = IAgentIdentity(_identityRegistry);
        _usdc = IERC20(_usdcAddress);
        owner = msg.sender;
        _nextWithdrawalId = 1;
    }

    // -------------------------------------------------------------------------
    // Core Functions
    // -------------------------------------------------------------------------

    /**
     * @notice Stake USDC as collateral for an AI agent.
     * @dev Caller must own the agent and have approved this contract to spend USDC.
     *      If this is the first stake for the agent, a new Stake record is created.
     *      If adding to an existing stake, the amount is increased.
     *      A reputation bonus is awarded if the total stake crosses the minimum threshold.
     *
     * @param agentTokenId The ERC-8004 token ID of the agent to stake for.
     * @param amount The USDC amount to stake (6 decimals).
     */
    function stake(uint256 agentTokenId, uint256 amount) external {
        require(amount > 0, "AgentStaking: amount must be greater than zero");

        // Verify the agent exists and is active
        IAgentIdentity.AgentIdentity memory agent = identityRegistry.getAgent(agentTokenId);
        require(agent.active, "AgentStaking: agent is not active");
        require(
            agent.owner == msg.sender,
            "AgentStaking: caller does not own this agent"
        );

        // Transfer USDC from the caller to this contract
        bool success = _usdc.transferFrom(msg.sender, address(this), amount);
        require(success, "AgentStaking: USDC transfer failed");

        Stake storage s = stakes[agentTokenId];

        bool wasBelowThreshold = s.amount < MIN_STAKE_FOR_BONUS;

        if (!s.active) {
            // First-time stake -- create a new record
            s.agentTokenId = agentTokenId;
            s.amount = amount;
            s.stakedAt = block.timestamp;
            s.slashCount = 0;
            s.active = true;
        } else {
            // Adding to existing stake
            s.amount += amount;
        }

        // Award reputation bonus if stake crosses the minimum threshold
        if (wasBelowThreshold && s.amount >= MIN_STAKE_FOR_BONUS) {
            identityRegistry.adjustReputation(agentTokenId, REPUTATION_STAKE_BONUS);
        }

        emit Staked(agentTokenId, amount, s.amount);
    }

    /**
     * @notice Request a withdrawal of staked USDC for an agent.
     * @dev The withdrawal enters a 7-day cooldown period before it can be completed.
     *      The requested amount must not exceed the agent's available stake (total stake
     *      minus any pending withdrawal amounts).
     *
     * @param agentTokenId The ERC-8004 token ID of the agent.
     * @param amount The USDC amount to withdraw (6 decimals).
     * @return requestId The unique identifier for this withdrawal request.
     */
    function requestWithdrawal(
        uint256 agentTokenId,
        uint256 amount
    ) external returns (uint256 requestId) {
        require(amount > 0, "AgentStaking: amount must be greater than zero");

        // Verify ownership
        IAgentIdentity.AgentIdentity memory agent = identityRegistry.getAgent(agentTokenId);
        require(
            agent.owner == msg.sender,
            "AgentStaking: caller does not own this agent"
        );

        Stake storage s = stakes[agentTokenId];
        require(s.active, "AgentStaking: no active stake for this agent");

        // Calculate available balance (stake minus pending withdrawals)
        uint256 pendingAmount = _getPendingWithdrawalAmount(agentTokenId);
        uint256 availableAmount = s.amount - pendingAmount;
        require(
            amount <= availableAmount,
            "AgentStaking: amount exceeds available stake"
        );

        // Create the withdrawal request
        requestId = _nextWithdrawalId++;

        withdrawalRequests[requestId] = WithdrawalRequest({
            id: requestId,
            agentTokenId: agentTokenId,
            amount: amount,
            requestedAt: block.timestamp,
            status: WithdrawalStatus.Pending
        });

        withdrawalsByAgent[agentTokenId].push(requestId);

        emit WithdrawalRequested(requestId, agentTokenId, amount);
    }

    /**
     * @notice Complete a withdrawal request after the cooldown period has elapsed.
     * @dev Transfers USDC back to the agent owner. If the stake reaches zero, the
     *      stake position is deactivated.
     *
     * @param requestId The unique withdrawal request identifier.
     */
    function completeWithdrawal(uint256 requestId) external {
        WithdrawalRequest storage request = withdrawalRequests[requestId];
        require(
            request.status == WithdrawalStatus.Pending,
            "AgentStaking: withdrawal is not pending"
        );

        // Verify ownership
        IAgentIdentity.AgentIdentity memory agent = identityRegistry.getAgent(
            request.agentTokenId
        );
        require(
            agent.owner == msg.sender,
            "AgentStaking: caller does not own this agent"
        );

        // Enforce cooldown
        require(
            block.timestamp >= request.requestedAt + WITHDRAWAL_COOLDOWN,
            "AgentStaking: cooldown period has not elapsed"
        );

        // Update state
        Stake storage s = stakes[request.agentTokenId];
        s.amount -= request.amount;
        request.status = WithdrawalStatus.Completed;

        // Deactivate stake if it reaches zero
        if (s.amount == 0) {
            s.active = false;
        }

        // Transfer USDC to agent owner
        bool success = _usdc.transfer(agent.owner, request.amount);
        require(success, "AgentStaking: USDC transfer failed");

        emit WithdrawalCompleted(requestId, request.amount);
    }

    /**
     * @notice Cancel a pending withdrawal request.
     * @dev Only the agent owner can cancel. The requested amount becomes available again.
     *
     * @param requestId The unique withdrawal request identifier.
     */
    function cancelWithdrawal(uint256 requestId) external {
        WithdrawalRequest storage request = withdrawalRequests[requestId];
        require(
            request.status == WithdrawalStatus.Pending,
            "AgentStaking: withdrawal is not pending"
        );

        // Verify ownership
        IAgentIdentity.AgentIdentity memory agent = identityRegistry.getAgent(
            request.agentTokenId
        );
        require(
            agent.owner == msg.sender,
            "AgentStaking: caller does not own this agent"
        );

        request.status = WithdrawalStatus.Cancelled;

        emit WithdrawalCancelled(requestId);
    }

    /**
     * @notice Slash an agent's stake due to a dispute resolution.
     * @dev Only callable by authorized slashers (AgentJob, AgentOrchestrator).
     *      Slashes SLASH_RATE_BPS (20%) of the agent's current stake and sends
     *      the slashed amount to the recipient (the wronged client). Also applies
     *      a reputation penalty and increments the slash counter.
     *
     * @param agentTokenId The ERC-8004 token ID of the agent to slash.
     * @param recipient The address to receive the slashed funds.
     * @param reason A human-readable reason for the slash.
     */
    function slash(
        uint256 agentTokenId,
        address recipient,
        string calldata reason
    ) external onlyAuthorizedSlasher {
        require(
            recipient != address(0),
            "AgentStaking: recipient cannot be zero address"
        );

        Stake storage s = stakes[agentTokenId];
        require(s.active, "AgentStaking: no active stake for this agent");
        require(s.amount > 0, "AgentStaking: stake amount is zero");

        // Calculate slash amount (20% of current stake)
        uint256 slashAmount = (s.amount * SLASH_RATE_BPS) / 10000;
        require(slashAmount > 0, "AgentStaking: slash amount is zero");

        // Update state
        s.amount -= slashAmount;
        s.slashCount += 1;

        // Deactivate stake if it reaches zero
        if (s.amount == 0) {
            s.active = false;
        }

        // Apply reputation penalty
        identityRegistry.adjustReputation(agentTokenId, REPUTATION_SLASH_PENALTY);

        // Transfer slashed USDC to the wronged client
        bool success = _usdc.transfer(recipient, slashAmount);
        require(success, "AgentStaking: USDC transfer failed");

        emit Slashed(agentTokenId, slashAmount, recipient, reason);
    }

    // -------------------------------------------------------------------------
    // Admin Functions
    // -------------------------------------------------------------------------

    /**
     * @notice Authorize or deauthorize an address to slash agent stakes.
     * @dev Only callable by the contract owner. Typically used to authorize
     *      the AgentJob and AgentOrchestrator contracts.
     *
     * @param slasher The address to authorize or deauthorize.
     * @param authorized Whether the address should be authorized.
     */
    function setAuthorizedSlasher(
        address slasher,
        bool authorized
    ) external onlyOwner {
        require(
            slasher != address(0),
            "AgentStaking: slasher cannot be zero address"
        );
        authorizedSlashers[slasher] = authorized;
        emit SlasherAuthorized(slasher, authorized);
    }

    // -------------------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------------------

    /**
     * @notice Get the full staking record for an agent.
     * @param agentTokenId The ERC-8004 token ID of the agent.
     * @return The Stake struct for the agent.
     */
    function getStake(uint256 agentTokenId) external view returns (Stake memory) {
        return stakes[agentTokenId];
    }

    /**
     * @notice Get the details of a withdrawal request.
     * @param requestId The unique withdrawal request identifier.
     * @return The WithdrawalRequest struct.
     */
    function getWithdrawalRequest(
        uint256 requestId
    ) external view returns (WithdrawalRequest memory) {
        return withdrawalRequests[requestId];
    }

    /**
     * @notice Get all withdrawal request IDs for an agent.
     * @param agentTokenId The ERC-8004 token ID of the agent.
     * @return An array of withdrawal request IDs.
     */
    function getWithdrawalsByAgent(
        uint256 agentTokenId
    ) external view returns (uint256[] memory) {
        return withdrawalsByAgent[agentTokenId];
    }

    /**
     * @notice Check whether an agent has an active stake.
     * @param agentTokenId The ERC-8004 token ID of the agent.
     * @return True if the agent has an active stake with amount > 0.
     */
    function isStaked(uint256 agentTokenId) external view returns (bool) {
        Stake storage s = stakes[agentTokenId];
        return s.active && s.amount > 0;
    }

    /**
     * @notice Get the current stake amount for an agent.
     * @param agentTokenId The ERC-8004 token ID of the agent.
     * @return The USDC amount currently staked (6 decimals).
     */
    function getStakeAmount(uint256 agentTokenId) external view returns (uint256) {
        return stakes[agentTokenId].amount;
    }

    /**
     * @notice Calculate the minimum stake required for a given job value.
     * @dev Implements the 10% collateral rule: agents must stake at least 10%
     *      of the job value to participate.
     *
     * @param jobValue The USDC value of the job (6 decimals).
     * @return The minimum USDC stake required (6 decimals).
     */
    function getMinStakeForJobValue(uint256 jobValue) external pure returns (uint256) {
        return jobValue / 10;
    }

    // -------------------------------------------------------------------------
    // Internal Functions
    // -------------------------------------------------------------------------

    /**
     * @dev Calculates the total pending withdrawal amount for an agent.
     * @param agentTokenId The ERC-8004 token ID of the agent.
     * @return total The sum of all pending withdrawal amounts.
     */
    function _getPendingWithdrawalAmount(
        uint256 agentTokenId
    ) internal view returns (uint256 total) {
        uint256[] storage requestIds = withdrawalsByAgent[agentTokenId];
        for (uint256 i = 0; i < requestIds.length; i++) {
            WithdrawalRequest storage request = withdrawalRequests[requestIds[i]];
            if (request.status == WithdrawalStatus.Pending) {
                total += request.amount;
            }
        }
    }
}
