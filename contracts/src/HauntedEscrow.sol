// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title HauntedEscrow — the CryptKeeper's vault
/// @notice Native-BNB escrow for freelance / bounty deals. The buyer locks
///         funds, the seller submits delivery evidence, and an off-chain
///         Keeper agent issues a verdict (RELEASE / REFUND / DISPUTE).
///         Funds move ONLY on a verdict, a mutual settlement, a timeout
///         refund, or a pre-funding cancel. No owner backdoor over funds.
/// @dev Written for the Kiroween 2026 hackathon (Frankenstein category).
///      Testnet / local use only during the hackathon. No mainnet.
///      No external dependencies: the reentrancy guard is inline.
contract HauntedEscrow {
    // ------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------

    enum State {
        Sealed, // draft created, not yet funded
        Buried, // funded, awaiting delivery evidence
        Exhumed, // evidence submitted, awaiting Keeper verdict
        Released, // Keeper said RELEASE — seller paid
        LaidToRest, // Keeper said REFUND (or timeout) — buyer refunded
        Disputed, // Keeper said DISPUTE — funds frozen
        Settled, // disputed deal split by mutual agreement
        Cancelled // buyer cancelled an unfunded draft
    }

    enum Verdict {
        Release,
        Refund,
        Dispute
    }

    struct Deal {
        address buyer;
        address seller;
        uint256 amount; // wei, agreed at creation
        uint256 deadline; // unix timestamp
        string description;
        State state;
        string evidenceUrl;
        bytes32 evidenceHash;
        uint256 evidenceSubmittedAt;
        bool evidenceLate;
        address settlementProposer;
        uint256 settlementSellerShareBps; // 0..10000, set by proposer
    }

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    address public owner;
    address public keeper;
    uint256 public dealCount;
    mapping(uint256 => Deal) public deals;

    bool private _locked;

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    event DealCreated(uint256 indexed dealId, address indexed buyer, address indexed seller, uint256 amount, uint256 deadline);
    event DealFunded(uint256 indexed dealId, uint256 amount);
    event EvidenceSubmitted(uint256 indexed dealId, string url, bytes32 contentHash, bool late);
    event VerdictIssued(uint256 indexed dealId, Verdict verdict, string reasons);
    event DealReleased(uint256 indexed dealId, address indexed seller, uint256 amount);
    event DealRefunded(uint256 indexed dealId, address indexed buyer, uint256 amount);
    event DealDisputed(uint256 indexed dealId);
    event SettlementProposed(uint256 indexed dealId, address indexed proposer, uint256 sellerShareBps);
    event DealSettled(uint256 indexed dealId, uint256 sellerAmount, uint256 buyerAmount);
    event TimeoutRefunded(uint256 indexed dealId, address indexed buyer, uint256 amount);
    event DealCancelled(uint256 indexed dealId);
    event KeeperChanged(address indexed oldKeeper, address indexed newKeeper);

    // ------------------------------------------------------------------
    // Modifiers
    // ------------------------------------------------------------------

    modifier nonReentrant() {
        require(!_locked, "HauntedEscrow: reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "HauntedEscrow: not owner");
        _;
    }

    modifier onlyKeeper() {
        require(msg.sender == keeper, "HauntedEscrow: not keeper");
        _;
    }

    modifier dealExists(uint256 dealId) {
        require(dealId < dealCount, "HauntedEscrow: no such deal");
        _;
    }

    // ------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------

    constructor(address keeper_) {
        require(keeper_ != address(0), "HauntedEscrow: keeper is zero");
        owner = msg.sender;
        keeper = keeper_;
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    /// @notice Rotate the Keeper address. Only the owner; cannot touch funds.
    function setKeeper(address newKeeper) external onlyOwner {
        require(newKeeper != address(0), "HauntedEscrow: keeper is zero");
        address oldKeeper = keeper;
        keeper = newKeeper;
        emit KeeperChanged(oldKeeper, newKeeper);
    }

    // ------------------------------------------------------------------
    // Deal lifecycle
    // ------------------------------------------------------------------

    /// @notice Create an UNFUNDED draft (state Sealed). Buyer funds it later
    ///         with fundDeal(). Use createDeal() to create + fund atomically.
    function createDraft(address seller, uint256 amount, uint256 deadline, string calldata description)
        external
        returns (uint256 dealId)
    {
        require(seller != address(0), "HauntedEscrow: seller is zero");
        require(seller != msg.sender, "HauntedEscrow: buyer is seller");
        require(amount > 0, "HauntedEscrow: amount is zero");
        require(deadline > block.timestamp, "HauntedEscrow: deadline passed");

        dealId = dealCount++;
        deals[dealId] = Deal({
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            deadline: deadline,
            description: description,
            state: State.Sealed,
            evidenceUrl: "",
            evidenceHash: bytes32(0),
            evidenceSubmittedAt: 0,
            evidenceLate: false,
            settlementProposer: address(0),
            settlementSellerShareBps: 0
        });

        emit DealCreated(dealId, msg.sender, seller, amount, deadline);
    }

    /// @notice Fund a Sealed draft with EXACTLY the agreed amount.
    function fundDeal(uint256 dealId) external payable nonReentrant dealExists(dealId) {
        Deal storage deal = deals[dealId];
        require(msg.sender == deal.buyer, "HauntedEscrow: not buyer");
        require(deal.state == State.Sealed, "HauntedEscrow: not sealed");
        require(msg.value == deal.amount, "HauntedEscrow: wrong amount");

        deal.state = State.Buried;
        emit DealFunded(dealId, msg.value);
    }

    /// @notice Create + fund atomically. Amount is msg.value.
    function createDeal(address seller, uint256 deadline, string calldata description)
        external
        payable
        nonReentrant
        returns (uint256 dealId)
    {
        require(seller != address(0), "HauntedEscrow: seller is zero");
        require(seller != msg.sender, "HauntedEscrow: buyer is seller");
        require(msg.value > 0, "HauntedEscrow: amount is zero");
        require(deadline > block.timestamp, "HauntedEscrow: deadline passed");

        dealId = dealCount++;
        deals[dealId] = Deal({
            buyer: msg.sender,
            seller: seller,
            amount: msg.value,
            deadline: deadline,
            description: description,
            state: State.Buried,
            evidenceUrl: "",
            evidenceHash: bytes32(0),
            evidenceSubmittedAt: 0,
            evidenceLate: false,
            settlementProposer: address(0),
            settlementSellerShareBps: 0
        });

        emit DealCreated(dealId, msg.sender, seller, msg.value, deadline);
        emit DealFunded(dealId, msg.value);
    }

    /// @notice Seller submits delivery evidence (URL + content hash).
    function submitEvidence(uint256 dealId, string calldata url, bytes32 contentHash)
        external
        dealExists(dealId)
    {
        Deal storage deal = deals[dealId];
        require(msg.sender == deal.seller, "HauntedEscrow: not seller");
        require(deal.state == State.Buried, "HauntedEscrow: not buried");
        require(bytes(url).length > 0, "HauntedEscrow: empty url");
        require(contentHash != bytes32(0), "HauntedEscrow: empty hash");

        deal.evidenceUrl = url;
        deal.evidenceHash = contentHash;
        deal.evidenceSubmittedAt = block.timestamp;
        deal.evidenceLate = block.timestamp > deal.deadline;
        deal.state = State.Exhumed;

        emit EvidenceSubmitted(dealId, url, contentHash, deal.evidenceLate);
    }

    /// @notice Keeper issues a verdict. Funds move ONLY here (or via
    ///         settlement / timeout / cancel). `reasons` is stored in the
    ///         event log so anyone can audit the verdict.
    function submitVerdict(uint256 dealId, Verdict verdict, string calldata reasons)
        external
        onlyKeeper
        nonReentrant
        dealExists(dealId)
    {
        Deal storage deal = deals[dealId];
        require(deal.state == State.Exhumed, "HauntedEscrow: not exhumed");

        emit VerdictIssued(dealId, verdict, reasons);

        if (verdict == Verdict.Release) {
            deal.state = State.Released;
            uint256 amount = deal.amount;
            (bool ok,) = deal.seller.call{value: amount}("");
            require(ok, "HauntedEscrow: seller payout failed");
            emit DealReleased(dealId, deal.seller, amount);
        } else if (verdict == Verdict.Refund) {
            deal.state = State.LaidToRest;
            uint256 amount = deal.amount;
            (bool ok,) = deal.buyer.call{value: amount}("");
            require(ok, "HauntedEscrow: buyer refund failed");
            emit DealRefunded(dealId, deal.buyer, amount);
        } else {
            deal.state = State.Disputed;
            emit DealDisputed(dealId);
        }
    }

    /// @notice Either party proposes a split for a Disputed deal.
    function proposeSettlement(uint256 dealId, uint256 sellerShareBps) external dealExists(dealId) {
        Deal storage deal = deals[dealId];
        require(deal.state == State.Disputed, "HauntedEscrow: not disputed");
        require(msg.sender == deal.buyer || msg.sender == deal.seller, "HauntedEscrow: not a party");
        require(sellerShareBps <= 10000, "HauntedEscrow: share > 100%");

        deal.settlementProposer = msg.sender;
        deal.settlementSellerShareBps = sellerShareBps;
        emit SettlementProposed(dealId, msg.sender, sellerShareBps);
    }

    /// @notice The OTHER party accepts the proposed split; funds move.
    function acceptSettlement(uint256 dealId) external nonReentrant dealExists(dealId) {
        Deal storage deal = deals[dealId];
        require(deal.state == State.Disputed, "HauntedEscrow: not disputed");
        require(deal.settlementProposer != address(0), "HauntedEscrow: no proposal");
        require(msg.sender != deal.settlementProposer, "HauntedEscrow: proposer cannot accept");
        require(msg.sender == deal.buyer || msg.sender == deal.seller, "HauntedEscrow: not a party");

        uint256 sellerAmount = (deal.amount * deal.settlementSellerShareBps) / 10000;
        uint256 buyerAmount = deal.amount - sellerAmount;

        deal.state = State.Settled;

        if (sellerAmount > 0) {
            (bool okSeller,) = deal.seller.call{value: sellerAmount}("");
            require(okSeller, "HauntedEscrow: seller payout failed");
        }
        if (buyerAmount > 0) {
            (bool okBuyer,) = deal.buyer.call{value: buyerAmount}("");
            require(okBuyer, "HauntedEscrow: buyer payout failed");
        }
        emit DealSettled(dealId, sellerAmount, buyerAmount);
    }

    /// @notice Buyer reclaims funds when the deadline passed with no evidence.
    function timeoutRefund(uint256 dealId) external nonReentrant dealExists(dealId) {
        Deal storage deal = deals[dealId];
        require(msg.sender == deal.buyer, "HauntedEscrow: not buyer");
        require(deal.state == State.Buried, "HauntedEscrow: not buried");
        require(block.timestamp > deal.deadline, "HauntedEscrow: deadline not passed");

        deal.state = State.LaidToRest;
        uint256 amount = deal.amount;
        (bool ok,) = deal.buyer.call{value: amount}("");
        require(ok, "HauntedEscrow: refund failed");
        emit TimeoutRefunded(dealId, deal.buyer, amount);
    }

    /// @notice Buyer cancels an UNFUNDED draft. No funds involved.
    function cancel(uint256 dealId) external dealExists(dealId) {
        Deal storage deal = deals[dealId];
        require(msg.sender == deal.buyer, "HauntedEscrow: not buyer");
        require(deal.state == State.Sealed, "HauntedEscrow: not sealed");

        deal.state = State.Cancelled;
        emit DealCancelled(dealId);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function getDeal(uint256 dealId) external view dealExists(dealId) returns (Deal memory) {
        return deals[dealId];
    }
}
