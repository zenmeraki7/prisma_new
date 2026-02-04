export function buildFilterExpr({
  status,
  vendor,
  productType,
  hasImages,
}: {
  status?: string | null;
  vendor?: string;
  productType?: string;
  hasImages?: boolean;
}) {
  const children: any[] = [];

  if (status) {
    children.push({
      type: "leaf",
      filterId: "product.status",
      op: "eq",
      value: status,
    });
  }

  if (vendor) {
    children.push({
      type: "leaf",
      filterId: "product.vendor",
      op: "contains",
      value: vendor,
    });
  }

  if (productType) {
    children.push({
      type: "leaf",
      filterId: "product.productType",
      op: "contains",
      value: productType,
    });
  }

  if (hasImages !== undefined) {
    children.push({
      type: "leaf",
      filterId: "product.hasImages",
      op: "eq",
      value: hasImages,
    });
  }

  return {
    type: "group",
    op: "and",
    children,
  };
}
