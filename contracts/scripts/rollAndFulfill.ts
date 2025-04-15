import { ethers } from "hardhat";

async function main() {
    const [user] = await ethers.getSigners();
    const lottery = await ethers.getContractFactory("Lottery");

    const enterTx = await lottery.connect(user).enter({ value: ethers.parseEther("0.01") });
    await enterTx.wait();

    const pickTx = await lottery.pickWinner();
    await pickTx.wait();

}

main().catch(console.error);
