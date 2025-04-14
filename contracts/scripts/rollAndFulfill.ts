import { ethers } from "hardhat";

async function main() {
  const [user] = await ethers.getSigners();
  const lottery = await ethers.getContract("Lottery");
  const vrf = await ethers.getContract("VRFCoordinatorV2PlusMock");

  const enterTx = await lottery.connect(user).enter({ value: ethers.parseEther("0.01") });
  await enterTx.wait();

  const pickTx = await lottery.pickWinner();
  await pickTx.wait();

  const requestId = await lottery.lastRequestId();
  const fulfillTx = await vrf.fulfillRandomWords(
    await lottery.getAddress(),
    requestId,
    [Math.floor(Math.random() * 100)]
  );
  await fulfillTx.wait();
}

main().catch(console.error);
