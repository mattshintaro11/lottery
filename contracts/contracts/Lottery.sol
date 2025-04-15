pragma solidity ^0.8.20;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

contract Lottery is VRFConsumerBaseV2Plus {
    address public manager;
    address[] public players;

    uint256 public subscriptionId;
    bytes32 public keyHash;
    uint32 public callbackGasLimit = 100000;
    uint16 public requestConfirmations = 3;
    uint32 public numWords = 1;

    uint256 public lastRequestId;

    mapping(uint256 => bool) public validRequests;


    event WinnerPicked(address indexed winner, uint256 amount);

    constructor(
        address _vrfCoordinator,
        uint256 _subscriptionId,
        bytes32 _keyHash
    ) VRFConsumerBaseV2Plus(_vrfCoordinator) {
        manager = msg.sender;
        subscriptionId = _subscriptionId;
        keyHash = _keyHash;
    }

    function enter() public payable {
        require(msg.value == 0.01 ether, "Ticket = 0.01 ETH");
        players.push(msg.sender);
    }

    function pickWinner() public onlyManager {
        require(players.length > 0, "No players");

        lastRequestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: keyHash,
                subId: subscriptionId,
                requestConfirmations: requestConfirmations,
                callbackGasLimit: callbackGasLimit,
                numWords: numWords,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({
                        nativePayment: false // use LINK instead of ETH
                    })
                )
            })
        );

        validRequests[lastRequestId] = true;
    }

    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {
        require(validRequests[requestId], "Invalid request ID");

        uint256 prize = address(this).balance;

        uint256 winnerIndex = randomWords[0] % players.length;
        address winner = players[winnerIndex];
        payable(winner).transfer(address(this).balance);

        emit WinnerPicked(winner, prize);

        delete players;
        delete validRequests[requestId];
    }

    function getPlayers() public view returns (address[] memory) {
        return players;
    }

    modifier onlyManager() {
        require(msg.sender == manager, "Only manager can call this");
        _;
    }
}
