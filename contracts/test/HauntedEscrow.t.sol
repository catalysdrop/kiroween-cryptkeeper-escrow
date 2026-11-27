// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/HauntedEscrow.sol";

/// @notice Malicious seller that tries to reenter on payout.
contract ReentrantSeller {
    HauntedEscrow public escrow;
    uint256 public dealId;

    constructor(HauntedEscrow escrow_) {
        escrow = escrow_;
    }

    function setDeal(uint256 dealId_) external {
        dealId = dealId_;
    }

    // Called when this contract receives ETH: try to reenter submitVerdict.
    receive() external payable {
        // Attempt a second verdict on the same deal (must fail: state moved).
        escrow.submitVerdict(dealId, HauntedEscrow.Verdict.Release, "reenter");
    }
}

contract HauntedEscrowTest is Test {
    HauntedEscrow public escrow;
    address public buyer = address(0xB0B);
    address public seller = address(0x5E11);
    address public keeper = address(0x6EE9);
    address public stranger = address(0x57A);

    uint256 constant AMOUNT = 1 ether;
    bytes32 constant HASH = bytes32(uint256(0xabc123));

    function setUp() public {
        vm.prank(buyer);
        escrow = new HauntedEscrow(keeper);
        vm.deal(buyer, 10 ether);
        vm.deal(seller, 1 ether);
        vm.deal(stranger, 10 ether); // so value-carrying reverts reach the contract checks
    }

    // -- helpers -------------------------------------------------------

    function _fundedDeal() internal returns (uint256 dealId) {
        vm.prank(buyer);
        dealId = escrow.createDeal{value: AMOUNT}(seller, block.timestamp + 1 days, "Build a landing page");
    }

    function _exhumedDeal() internal returns (uint256 dealId) {
        dealId = _fundedDeal();
        vm.prank(seller);
        escrow.submitEvidence(dealId, "https://example.com/delivery", HASH);
    }

    // -- creation + funding --------------------------------------------

    function testCreateDealAtomic() public {
        uint256 dealId = _fundedDeal();
        HauntedEscrow.Deal memory d = escrow.getDeal(dealId);
        assertEq(uint256(d.state), uint256(HauntedEscrow.State.Buried));
        assertEq(d.buyer, buyer);
        assertEq(d.seller, seller);
        assertEq(d.amount, AMOUNT);
        assertEq(address(escrow).balance, AMOUNT);
    }

    function testCreateDealZeroValueReverts() public {
        vm.prank(buyer);
        vm.expectRevert("HauntedEscrow: amount is zero");
        escrow.createDeal{value: 0}(seller, block.timestamp + 1 days, "x");
    }

    function testCreateDraftThenFund() public {
        vm.prank(buyer);
        uint256 dealId = escrow.createDraft(seller, AMOUNT, block.timestamp + 1 days, "Draft deal");
        HauntedEscrow.Deal memory d = escrow.getDeal(dealId);
        assertEq(uint256(d.state), uint256(HauntedEscrow.State.Sealed));

        vm.prank(buyer);
        escrow.fundDeal{value: AMOUNT}(dealId);
        assertEq(uint256(escrow.getDeal(dealId).state), uint256(HauntedEscrow.State.Buried));
    }

    function testFundWrongAmountReverts() public {
        vm.prank(buyer);
        uint256 dealId = escrow.createDraft(seller, AMOUNT, block.timestamp + 1 days, "Draft");
        vm.prank(buyer);
        vm.expectRevert("HauntedEscrow: wrong amount");
        escrow.fundDeal{value: AMOUNT - 1}(dealId);
    }

    function testFundByNonBuyerReverts() public {
        vm.prank(buyer);
        uint256 dealId = escrow.createDraft(seller, AMOUNT, block.timestamp + 1 days, "Draft");
        vm.prank(stranger);
        vm.expectRevert("HauntedEscrow: not buyer");
        escrow.fundDeal{value: AMOUNT}(dealId);
    }

    function testDoubleFundReverts() public {
        uint256 dealId = _fundedDeal();
        vm.prank(buyer);
        vm.expectRevert("HauntedEscrow: not sealed");
        escrow.fundDeal{value: AMOUNT}(dealId);
    }

    function testCancelDraft() public {
        vm.prank(buyer);
        uint256 dealId = escrow.createDraft(seller, AMOUNT, block.timestamp + 1 days, "Draft");
        vm.prank(buyer);
        escrow.cancel(dealId);
        assertEq(uint256(escrow.getDeal(dealId).state), uint256(HauntedEscrow.State.Cancelled));
    }

    function testCancelFundedReverts() public {
        uint256 dealId = _fundedDeal();
        vm.prank(buyer);
        vm.expectRevert("HauntedEscrow: not sealed");
        escrow.cancel(dealId);
    }

    // -- evidence ------------------------------------------------------

    function testSubmitEvidence() public {
        uint256 dealId = _fundedDeal();
        vm.prank(seller);
        escrow.submitEvidence(dealId, "https://example.com/delivery", HASH);
        HauntedEscrow.Deal memory d = escrow.getDeal(dealId);
        assertEq(uint256(d.state), uint256(HauntedEscrow.State.Exhumed));
        assertEq(d.evidenceUrl, "https://example.com/delivery");
        assertEq(d.evidenceHash, HASH);
        assertFalse(d.evidenceLate);
    }

    function testEvidenceByNonSellerReverts() public {
        uint256 dealId = _fundedDeal();
        vm.prank(stranger);
        vm.expectRevert("HauntedEscrow: not seller");
        escrow.submitEvidence(dealId, "https://example.com/x", HASH);
    }

    function testEvidenceLateFlag() public {
        uint256 dealId = _fundedDeal();
        vm.warp(block.timestamp + 2 days); // past deadline
        vm.prank(seller);
        escrow.submitEvidence(dealId, "https://example.com/late", HASH);
        assertTrue(escrow.getDeal(dealId).evidenceLate);
    }

    // -- verdicts ------------------------------------------------------

    function testVerdictReleasePaysSeller() public {
        uint256 dealId = _exhumedDeal();
        uint256 sellerBefore = seller.balance;
        vm.prank(keeper);
        escrow.submitVerdict(dealId, HauntedEscrow.Verdict.Release, "All checks passed");
        assertEq(uint256(escrow.getDeal(dealId).state), uint256(HauntedEscrow.State.Released));
        assertEq(seller.balance, sellerBefore + AMOUNT);
        assertEq(address(escrow).balance, 0);
    }

    function testVerdictRefundPaysBuyer() public {
        uint256 dealId = _exhumedDeal();
        uint256 buyerBefore = buyer.balance;
        vm.prank(keeper);
        escrow.submitVerdict(dealId, HauntedEscrow.Verdict.Refund, "Hash mismatch");
        assertEq(uint256(escrow.getDeal(dealId).state), uint256(HauntedEscrow.State.LaidToRest));
        assertEq(buyer.balance, buyerBefore + AMOUNT);
    }

    function testVerdictDisputeFreezes() public {
        uint256 dealId = _exhumedDeal();
        vm.prank(keeper);
        escrow.submitVerdict(dealId, HauntedEscrow.Verdict.Dispute, "Ambiguous evidence");
        assertEq(uint256(escrow.getDeal(dealId).state), uint256(HauntedEscrow.State.Disputed));
        assertEq(address(escrow).balance, AMOUNT);
    }

    function testVerdictByNonKeeperReverts() public {
        uint256 dealId = _exhumedDeal();
        vm.prank(stranger);
        vm.expectRevert("HauntedEscrow: not keeper");
        escrow.submitVerdict(dealId, HauntedEscrow.Verdict.Release, "x");
    }

    function testDoubleVerdictReverts() public {
        uint256 dealId = _exhumedDeal();
        vm.prank(keeper);
        escrow.submitVerdict(dealId, HauntedEscrow.Verdict.Release, "ok");
        vm.prank(keeper);
        vm.expectRevert("HauntedEscrow: not exhumed");
        escrow.submitVerdict(dealId, HauntedEscrow.Verdict.Refund, "x");
    }

    // -- settlement ----------------------------------------------------

    function testSettlementSplit() public {
        uint256 dealId = _exhumedDeal();
        vm.prank(keeper);
        escrow.submitVerdict(dealId, HauntedEscrow.Verdict.Dispute, "split it");
        vm.prank(buyer);
        escrow.proposeSettlement(dealId, 6000); // seller 60%
        uint256 sellerBefore = seller.balance;
        uint256 buyerBefore = buyer.balance;
        vm.prank(seller);
        escrow.acceptSettlement(dealId);
        assertEq(uint256(escrow.getDeal(dealId).state), uint256(HauntedEscrow.State.Settled));
        assertEq(seller.balance, sellerBefore + (AMOUNT * 6000) / 10000);
        assertEq(buyer.balance, buyerBefore + (AMOUNT * 4000) / 10000);
    }

    function testSettlementProposerCannotAccept() public {
        uint256 dealId = _exhumedDeal();
        vm.prank(keeper);
        escrow.submitVerdict(dealId, HauntedEscrow.Verdict.Dispute, "split it");
        vm.prank(buyer);
        escrow.proposeSettlement(dealId, 5000);
        vm.prank(buyer);
        vm.expectRevert("HauntedEscrow: proposer cannot accept");
        escrow.acceptSettlement(dealId);
    }

    // -- timeout -------------------------------------------------------

    function testTimeoutRefund() public {
        uint256 dealId = _fundedDeal();
        vm.warp(block.timestamp + 2 days);
        uint256 buyerBefore = buyer.balance;
        vm.prank(buyer);
        escrow.timeoutRefund(dealId);
        assertEq(uint256(escrow.getDeal(dealId).state), uint256(HauntedEscrow.State.LaidToRest));
        assertEq(buyer.balance, buyerBefore + AMOUNT);
    }

    function testTimeoutBeforeDeadlineReverts() public {
        uint256 dealId = _fundedDeal();
        vm.prank(buyer);
        vm.expectRevert("HauntedEscrow: deadline not passed");
        escrow.timeoutRefund(dealId);
    }

    // -- keeper rotation -----------------------------------------------

    function testSetKeeper() public {
        address newKeeper = address(0x999);
        vm.prank(buyer); // buyer deployed the contract => owner
        escrow.setKeeper(newKeeper);
        assertEq(escrow.keeper(), newKeeper);
    }

    function testSetKeeperByNonOwnerReverts() public {
        vm.prank(stranger);
        vm.expectRevert("HauntedEscrow: not owner");
        escrow.setKeeper(address(0x999));
    }

    // -- reentrancy ----------------------------------------------------

    function testReentrancyBlocked() public {
        ReentrantSeller evil = new ReentrantSeller(escrow);
        vm.deal(buyer, 10 ether);
        vm.prank(buyer);
        uint256 dealId = escrow.createDeal{value: AMOUNT}(address(evil), block.timestamp + 1 days, "evil job");
        evil.setDeal(dealId);
        vm.prank(address(evil));
        escrow.submitEvidence(dealId, "https://example.com/evil", HASH);
        // The payout to the evil seller triggers receive() -> reentrant
        // submitVerdict, which must fail (state already Released) and the
        // whole payout must revert, so the verdict call itself reverts.
        vm.prank(keeper);
        vm.expectRevert("HauntedEscrow: seller payout failed");
        escrow.submitVerdict(dealId, HauntedEscrow.Verdict.Release, "pay the evil one");
        // Funds must still be in the contract and the deal still Exhumed.
        assertEq(address(escrow).balance, AMOUNT);
        assertEq(uint256(escrow.getDeal(dealId).state), uint256(HauntedEscrow.State.Exhumed));
    }
}
