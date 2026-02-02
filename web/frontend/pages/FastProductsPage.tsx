import { useState } from "react";
import { FilterBar } from "../../components/filters/FilterBar";
import { useFastProducts } from "../queries/fastProducts";
import type { ApiFilterPayload } from "../../types/filters";

const FastProductsPage = () => {
  const [filters, setFilters] = useState<ApiFilterPayload[]>([]);

  const { data } = useFastProducts({
    filter: { predicates: filters },
  });

  return (
    <>
      <FilterBar onApply={setFilters} />
    </>
  );
};

export default FastProductsPage;
