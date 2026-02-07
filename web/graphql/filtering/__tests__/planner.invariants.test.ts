import { planProductQuery } from "../planProductQuery";
import { astFromJson } from "../../../lib/filters/astFromJson";

describe("Planner invariants", () => {
  const shopId = "test-shop";

  test("same filter yields same planHash", async () => {
    const filter = astFromJson({
      op: "and",
      children: [{ filterId: "product.status", op: "eq", value: "ACTIVE" }],
    });

    const a = await planProductQuery({ shopId, filter });
    const b = await planProductQuery({ shopId, filter });

    expect(a.planHash).toBe(b.planHash);
  });

  test("non-monotonic filters force SNAPSHOT", async () => {
    const filter = astFromJson({
      filterId: "product.title",
      op: "contains",
      value: "shoe",
    });

    const { plan } = await planProductQuery({ shopId, filter });

    expect(plan.mode).toBe("SNAPSHOT");
  });

  test("superset snapshot reuse is safe", async () => {
    const broad = astFromJson({
      filterId: "product.status",
      op: "eq",
      value: "ACTIVE",
    });

    const narrow = astFromJson({
      op: "and",
      children: [
        { filterId: "product.status", op: "eq", value: "ACTIVE" },
        { filterId: "product.hasImages", op: "eq", value: true },
      ],
    });

    const a = await planProductQuery({ shopId, filter: broad });
    const b = await planProductQuery({ shopId, filter: narrow });

    expect(b.plan.snapshotRun.id).toBe(a.plan.snapshotRun.id);
  });
});
