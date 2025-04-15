import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("Lottery", function() {
    async function deployLotteryFixture() {
        const BASE_FEE = hre.ethers.parseEther("0.001"); // mock base fee
        const GAS_PRICE_LINK = 1e9;                // mock gas price
        const WEI_PER_UNIT_LINK = hre.ethers.parseEther("0.01");

        const [owner, player1, player2] = await hre.ethers.getSigners();

        const VRFCoordinatorFactory = await hre.ethers.getContractFactory("VRFCoordinatorV2_5Mock");
        const vrfCoordinator = await VRFCoordinatorFactory.deploy(BASE_FEE, GAS_PRICE_LINK, WEI_PER_UNIT_LINK);
        await vrfCoordinator.waitForDeployment();

        const tx = await vrfCoordinator.createSubscription()
        const receipt = await tx.wait(1)
        const subscriptionId = BigInt(receipt.logs[0].topics[1])
        console.log(subscriptionId)

        await vrfCoordinator.fundSubscription(subscriptionId, hre.ethers.parseEther("1"));

        const keyHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("mock-key"));

        const LotteryFactory = await hre.ethers.getContractFactory("Lottery");
        const lottery = await LotteryFactory.deploy(await vrfCoordinator.getAddress(), subscriptionId, keyHash);
        await lottery.waitForDeployment();

        // Add consumer permission
        await vrfCoordinator.addConsumer(subscriptionId, await lottery.getAddress());


        return { lottery, vrfCoordinator, owner, player1, player2, subscriptionId };
    }

    it("Should deploy with correct manager and config", async function() {
        const { lottery, owner, subscriptionId } = await loadFixture(deployLotteryFixture);

        expect(await lottery.manager()).to.equal(owner.address);
        expect(await lottery.subscriptionId()).to.equal(subscriptionId);
    });

    it("Should allow player to enter with exact 0.01 ETH", async function() {
        const { lottery, player1 } = await loadFixture(deployLotteryFixture);
        await lottery.connect(player1).enter({ value: hre.ethers.parseEther("0.01") });
        const players = await lottery.getPlayers();
        expect(players).to.deep.equal([player1.address]);
    });

    it("Should revert if wrong ETH is sent", async function() {
        const { lottery, player1 } = await loadFixture(deployLotteryFixture);
        await expect(lottery.connect(player1).enter({ value: hre.ethers.parseEther("0.02") }))
            .to.be.revertedWith("Ticket = 0.01 ETH");
    });

    it("Should revert pickWinner if no players", async function() {
        const { lottery, owner } = await loadFixture(deployLotteryFixture);
        await expect(lottery.connect(owner).pickWinner())
            .to.be.revertedWith("No players");
    });

    it("Should request randomness when pickWinner is called", async function() {
        const { lottery, player1, owner, vrfCoordinator } = await loadFixture(deployLotteryFixture);
        await lottery.connect(player1).enter({ value: hre.ethers.parseEther("0.01") });

        const tx = await lottery.connect(owner).pickWinner();
        const receipt = await tx.wait();
        const requestId = await lottery.lastRequestId();
        expect(await lottery.validRequests(requestId)).to.be.true;
    });

    it("Should select a winner and transfer funds", async function() {
        const { lottery, player1, player2, owner, vrfCoordinator, subscriptionId } = await loadFixture(deployLotteryFixture);

        const sub = await vrfCoordinator.getSubscription(subscriptionId);

        await lottery.connect(player1).enter({ value: hre.ethers.parseEther("0.01") });
        await lottery.connect(player2).enter({ value: hre.ethers.parseEther("0.01") });

        const initialBalance1 = await hre.ethers.provider.getBalance(player1.address);
        const initialBalance2 = await hre.ethers.provider.getBalance(player2.address);

        console.log("initial balance")
        console.log(hre.ethers.formatEther(initialBalance1))
        console.log(hre.ethers.formatEther(initialBalance2))
        const tx = await lottery.connect(owner).pickWinner();
        await tx.wait();

        const requestId = await lottery.lastRequestId();

        const tx2 = await vrfCoordinator.fulfillRandomWordsWithOverride(
            requestId,
            await lottery.getAddress(),
            [1]
        );

        await tx2.wait();
        const finalBalance1 = await hre.ethers.provider.getBalance(player1.address);
        const finalBalance2 = await hre.ethers.provider.getBalance(player2.address);
        console.log("final balance")
        console.log(hre.ethers.formatEther(finalBalance1))
        console.log(hre.ethers.formatEther(finalBalance2))

        // One player should have received ~0.02 ETH (minus gas)
        const winnerReceived =
            finalBalance1 > initialBalance1 + hre.ethers.parseEther("0.009") ||
            finalBalance2 > initialBalance2 + hre.ethers.parseEther("0.009");

        expect(winnerReceived).to.be.true;
    });
    it("Should hold ETH after players enter the lottery", async function() {
        const { lottery, player1, player2 } = await loadFixture(deployLotteryFixture);

        // Simulate players entering
        const ticketPrice = hre.ethers.parseEther("0.01");

        await lottery.connect(player1).enter({ value: ticketPrice });
        await lottery.connect(player2).enter({ value: ticketPrice });

        // Check contract balance
        const contractBalance = await hre.ethers.provider.getBalance(await lottery.getAddress());

        expect(contractBalance).to.equal(ticketPrice * 2n);
    });
});
