// web/frontend/components/products/ProductsFiltersCard.tsx
import React, { useMemo } from "react";
import {
  Card,
  Box,
  InlineStack,
  Button,
  TextField,
  ButtonGroup,
  Tag,
  Select,
  Text,
  Tooltip,
} from "@shopify/polaris";
import { PlusIcon } from "@shopify/polaris-icons";

import {
  type AppliedFilter,
  stringOpLabel,
  numberOpLabel,
  dateOpLabel,
  enumOpLabel,
  fieldLabel,
} from "../../lib/products/filters";

import { VARIANT_FIELDS } from "../../lib/products/filters";

export interface ProductsFiltersCardProps {
  // Search
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onSearchClick: () => void;
  isSearching: boolean;
  searchTerm: string | null;

  // Filters
  appliedFilters: AppliedFilter[];
  onRemoveFilter: (key: string) => void;

  // Sort
  sortBy: string;
  sortDirection: "asc" | "desc";
  onSortByChange: (value: string) => void;
  onSortDirectionChange: (value: "asc" | "desc") => void;

  // Actions
  onOpenAddFilter: () => void;
  onClearAll: () => void;
}

export function ProductsFiltersCard({
  searchInput,
  onSearchInputChange,
  onSearchClick,
  isSearching,
  searchTerm,
  appliedFilters,
  onRemoveFilter,
  sortBy,
  sortDirection,
  onSortByChange,
  onSortDirectionChange,
  onOpenAddFilter,
  onClearAll,
}: ProductsFiltersCardProps) {
  const clearDisabled = useMemo(
    () =>
      !searchInput &&
      !searchTerm &&
      appliedFilters.length === 0 &&
      sortBy === "sort" &&
      sortDirection === "desc",
    [searchInput, searchTerm, appliedFilters.length, sortBy, sortDirection]
  );

  return (
    <Card>
      <Box padding="400" background="bg-surface-secondary">
        <InlineStack align="space-between" gap="400" wrap blockAlign="start">
          {/* LEFT */}
          <Box>
            <Tag>default</Tag>

            {/* Search input + button */}
            <Box paddingBlockStart="300">
              <InlineStack gap="200" wrap>
                <Box minWidth="360px">
                  <TextField
                    labelHidden
                    label="Search"
                    placeholder="Search products by title, vendor, or handle…"
                    autoComplete="off"
                    value={searchInput}
                    onChange={onSearchInputChange}
                  />
                </Box>
                <Button onClick={onSearchClick} loading={isSearching}>
                  Search
                </Button>
              </InlineStack>
            </Box>

            {/* Add / Clear filters */}
            <Box paddingBlockStart="300">
              <ButtonGroup>
                <Button icon={PlusIcon} onClick={onOpenAddFilter}>
                  Add Filter
                </Button>
                <Button variant="secondary" onClick={onClearAll} disabled={clearDisabled}>
                  Clear
                </Button>
              </ButtonGroup>
            </Box>

            {/* Applied filters as removable tags */}
            {appliedFilters.length > 0 && (
              <Box paddingBlockStart="300">
                <InlineStack gap="200" wrap>
                  {appliedFilters.map((f) => {
                    let desc = "";
                    if (f.kind === "string") desc = `${stringOpLabel(f.op)}: "${f.value}"`;
                    else if (f.kind === "number")
                      desc =
                        f.op === "between"
                          ? `${numberOpLabel(f.op)}: ${f.value}–${f.value2}`
                          : `${numberOpLabel(f.op)}: ${f.value}`;
                    else if (f.kind === "date") desc = `${dateOpLabel(f.op)}: ${f.value}`;
                    else if (f.kind === "enum") desc = `${enumOpLabel(f.op)}: ${f.value}`;
                    else if (f.kind === "boolean") desc = `Is: ${f.value ? "Yes" : "No"}`;

                    // Check if variant field (snapshot)
                    const isVariantField = VARIANT_FIELDS.some((vf) => vf.key === f.key);

                    return (
                      <Tooltip
                        key={f.key}
                        content={
                          isVariantField
                            ? "This is a variant field. Filtering happens server-side (snapshot)."
                            : undefined
                        }
                      >
                        <Tag
                          onRemove={() => onRemoveFilter(f.key)}
                          disabled={isVariantField} // cannot remove here if you want, optional
                        >
                          {fieldLabel(f.key)} — {desc}
                        </Tag>
                      </Tooltip>
                    );
                  })}
                </InlineStack>
              </Box>
            )}
          </Box>

          {/* RIGHT: Sort controls */}
          <Box>
            <InlineStack gap="200">
              <Box minWidth="160px">
                <Select
                  labelHidden
                  label="Sort By"
                  options={[
                    { label: "sortBy", value: "sort" },
                    { label: "Title", value: "title" },
                    { label: "Updated", value: "updated" },
                  ]}
                  value={sortBy}
                  onChange={onSortByChange}
                />
              </Box>

              <Box minWidth="160px">
                <Select
                  labelHidden
                  label="Order"
                  options={[
                    { label: "Descending", value: "desc" },
                    { label: "Ascending", value: "asc" },
                  ]}
                  value={sortDirection}
                  onChange={(value) => onSortDirectionChange(value as "asc" | "desc")}
                />
              </Box>
            </InlineStack>
          </Box>
        </InlineStack>
      </Box>
    </Card>
  );
}
