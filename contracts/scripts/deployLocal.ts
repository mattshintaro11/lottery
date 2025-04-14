import { ethers } from "hardhat"
import { BigNumber } from "ethers"

async function main() {
    const [deployer] = await ethers.getSigners()

    // === Step 1: Deploy Mock VRF Coordinator ===
    const BASE_FEE = ethers.parseEther("0.001")         // Minimum LINK cost per request
    const GAS_PRICE_LINK = "50000000000"                // 50 gwei
    const WEI_PER_UNIT_LINK = ethers.parseEther("0.01") // Conversion rate LINK/ETH

    const VRFMockFactory = await ethers.getContractFactory("VRFCoordinatorV2_5Mock")
    const vrfCoordinator = await VRFMockFactory.deploy(BASE_FEE, GAS_PRICE_LINK, WEI_PER_UNIT_LINK)
    await vrfCoordinator.waitForDeployment()

    console.log("✅ VRFCoordinatorV2_5Mock deployed at:", await vrfCoordinator.getAddress())

    // === Step 2: Create and fund subscription ===
    const tx = await vrfCoordinator.createSubscription()
    const receipt = await tx.wait(1)
    const subscriptionId = BigNumber.from(receipt.logs[0].topics[1])

    console.log("🧾 Subscription ID:", subscriptionId.toString())

    const FUND_AMOUNT = ethers.parseEther("1") // 1 ETH as LINK equivalent for mock
    await vrfCoordinator.fundSubscription(subscriptionId, FUND_AMOUNT)

    console.log("Deploying Lottery contract...")
    // === Step 3: Deploy the Lottery contract ===
    const keyHash =
        "0xd89b2bf150e3b9e13446986e571fb9cab24b13cea0a43ea20a6049a85cc807cc" // Dummy value

    const LotteryFactory = await ethers.getContractFactory("Lottery")
    const lottery = await LotteryFactory.deploy(
        await vrfCoordinator.getAddress(),
        subscriptionId,
        keyHash
    )
    await lottery.waitForDeployment()

    console.log("🎲 Lottery contract deployed at:", await lottery.getAddress())

    // === Step 4: Add Lottery as a consumer ===
    await vrfCoordinator.addConsumer(subscriptionId, await lottery.getAddress())
    console.log("🔗 Lottery added as consumer to subscription.")
}

main().catch((error) => {
    console.error("❌ Deployment failed:", error)
    process.exit(1)
})
