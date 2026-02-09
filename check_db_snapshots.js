import { prisma } from "./web/db/prisma.js";

async function checkSnapshots() {
  try {
    const runs = await prisma.snapshotRun.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        Shop: {
          select: { shopDomain: true }
        }
      }
    });

    console.log("----- SNAPSHOT RUNS -----");
    if (runs.length === 0) {
      console.log("No SnapshotRun records found.");
    } else {
      runs.forEach(r => {
        console.log(`ID: ${r.id}`);
        console.log(`Shop: ${r.Shop.shopDomain}`);
        console.log(`State: ${r.state}`);
        console.log(`PlanHash: ${r.planHash}`);
        console.log(`Total: ${r.total}, Progress: ${r.progress}`);
        console.log(`Created: ${r.createdAt}`);
        console.log("-------------------------");
      });
    }

    const successfulRuns = await prisma.snapshotRun.count({
      where: { state: "SUCCEEDED" }
    });
    console.log(`\nTotal SUCCEEDED runs: ${successfulRuns}`);

  } catch (e) {
    console.error("Error checking snapshots:", e);
  } finally {
    await prisma.$disconnect();
  }
}

checkSnapshots();
