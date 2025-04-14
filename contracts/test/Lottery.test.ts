// test/lottery.test.ts
import { ethers } from "hardhat";
import { expect } from "chai";
import { VRFCoordinatorV2Mock, Lottery } from "../typechain-types";

describe("Lottery", function () {
  let vrfCoordinator: VRFCoordinatorV2Mock;
  let lottery: Lottery;
  let subscriptionId: number;
  let keyHash: string;
  let accounts: any[];

  beforeEach(async function () {
    accounts = await ethers.getSigners();

    const baseFee = ethers.utils.parseEther("0.25");
    const gasPriceLink = 1e9;

    const VRFCoordinatorFactory = await ethers.getContractFactory("VRFCoordinatorV2Mock");
    vrfCoordinator = await VRFCoordinatorFactory.deploy(baseFee, gasPriceLink);
    await vrfCoordinator.deployed();

    const tx = await vrfCoordinator.createSubscription();
    const receipt = await tx.wait();
    subscriptionId = receipt.events?.[0].args?.subId;

    await vrfCoordinator.fundSubscription(subscriptionId, ethers.utils.parseEther("10"));

    keyHash = ethers.utils.formatBytes32String("keyHash");

    const LotteryFactory = await ethers.getContractFactory("Lottery");
    lottery = await LotteryFactory.deploy(vrfCoordinator.address, subscriptionId, keyHash);
    await lottery.deployed();

    await vrfCoordinator.addConsumer(subscriptionId, lottery.address);
  });

  it("selects a winner and transfers the pot", async function () {
    // 3 players enter
    for (let i = 0; i < 3; i++) {
      await lottery.connect(accounts[i]).enter({ value: ethers.utils.parseEther("0.01") });
    }

    const initialBalances = await Promise.all(
      accounts.map(acc => ethers.provider.getBalance(acc.address))
    );

    // Pick winner
    const tx = await lottery.connect(accounts[0]).pickWinner();
    const receipt = await tx.wait();
    const requestId = receipt.events?.find((e) => e.event === "RandomWordsRequested")?.args?.requestId;

    // Fulfill randomness
    await vrfCoordinator.fulfillRandomWords(requestId, lottery.address);

    const players = await lottery.getPlayers();
    expect(players.length).to.equal(0);

    const finalBalances = await Promise.all(
      accounts.map(acc => ethers.provider.getBalance(acc.address))
    );

    const pot = ethers.utils.parseEther("0.03");
    const winnerReceived = finalBalances.some((bal, i) =>
      bal.sub(initialBalances[i]).gt(ethers.utils.parseEther("0.009")) // Allow for gas variance
    );

    expect(winnerReceived).to.be.true;
  });
});
