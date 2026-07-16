const path = require("path");

const demoFile = path.resolve(process.env.DEMO_DATA_FILE || path.join(process.cwd(), ".data", "demo-db.json"));
process.env.NODE_ENV = "test-file";
process.env.DATA_FILE = demoFile;

const { resetLocalData, withData } = require("../server/store");
const { ARMOR, addItem, emptyInventory, id, nowIso } = require("../server/core");

const demoPlayers = [
  ["김민준", "믿음팀", "male"],
  ["이서연", "믿음팀", "female"],
  ["박지호", "믿음팀", "male"],
  ["최하은", "믿음팀", "female"],
  ["정도윤", "소망팀", "male"],
  ["한예린", "소망팀", "female"],
  ["오시온", "소망팀", "male"],
  ["윤다은", "사랑팀", "female"],
  ["강주원", "사랑팀", "male"],
  ["신하람", "사랑팀", "female"]
];

const missionCodes = [
  "mission-truth",
  "mission-righteousness",
  "mission-gospel",
  "mission-faith",
  "mission-salvation",
  "mission-word"
];

function demoInventory(index) {
  let inventory = emptyInventory();
  const first = ARMOR[index % ARMOR.length].code;
  const second = ARMOR[(index + 2) % ARMOR.length].code;
  inventory = addItem(inventory, first, "B", 1 + (index % 3));
  inventory = addItem(inventory, second, index % 2 === 0 ? "A" : "B", 1);
  if (index % 4 === 0) inventory = addItem(inventory, "sword", "S", 1);
  return inventory;
}

async function main() {
  await resetLocalData();
  await withData(async (data) => {
    data.players = demoPlayers.map(([name, team, gender], index) => ({
      id: id("demo"),
      name,
      team,
      gender,
      access_code: String(1200 + index),
      active: true,
      talent: 20 + index * 7,
      exp: 0,
      score: 0,
      created_at: nowIso(),
      updated_at: nowIso()
    }));

    data.inventories = {};
    data.qrClaims = [];
    data.rewardTransactions = [];
    data.drawLogs = [];
    data.eventLogs = [];

    data.players.forEach((player, index) => {
      data.inventories[player.id] = demoInventory(index);
      const completedCount = 1 + (index % 4);
      missionCodes.slice(0, completedCount).forEach((missionCode) => {
        const claimId = id("demo_qr");
        data.qrClaims.push({
          id: claimId,
          playerId: player.id,
          qrCode: missionCode,
          reward: { talent: 10, draws: 1, demo: true },
          createdAt: nowIso()
        });
        data.rewardTransactions.push({
          id: id("demo_reward"),
          playerId: player.id,
          source: `mission:${missionCode}`,
          talent: 10,
          drawCount: 1,
          results: [],
          promotions: [],
          createdAt: nowIso()
        });
      });
      data.eventLogs.push({
        id: id("demo_log"),
        playerId: player.id,
        action: "demo_seed",
        detail: { team: player.team },
        createdAt: nowIso()
      });
    });
  });
  console.log(`Demo data written to ${demoFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
