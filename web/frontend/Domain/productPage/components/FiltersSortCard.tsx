// web/frontend/pages/productsPage/components/FiltersSortCard.tsx
import React from "react";
import {
  Card,
  Box,
  InlineStack,
  TextField,
  Button,
  ButtonGroup,
  Tag,
  Select,
} from "@shopify/polaris";
import { PlusIcon } from "@shopify/polaris-icons";

import type { AppliedFilter } from "../filterTypes";
import { fieldLabel } from "../filterRegistry";
import { stringOpLabel, numberOpLabel, dateOpLabel, enumOpLabel } from "../filterUtils";

type Props = {
  searchInput: string;
  setSearchInput: (v: string) => void;
  searchTerm: string | null;
  onSearch: () => void;
  onClear: () => void;

  sortBy: string;
  setSortBy: (v: string) => void;
  sortDirection: "asc" | "desc";
  setSortDirection: (v: string) => void;

  appliedFilters: AppliedFilter[];
  onOpenAddFilter: () => void;
  onRemoveFilter: (key: string) => void;

  isSearching: boolean;
  isClearDisabled: boolean;
};

export function FiltersSortCard(props: Props) {
  const {
    searchInput,
    setSearchInput,
    searchTerm,
    onSearch,
    onClear,

    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,

    appliedFilters,
    onOpenAddFilter,
    onRemoveFilter,

    isSearching,
    isClearDisabled,
  } = props;

  return (
    <Card>
      <Box padding="400" background="bg-surface-secondary">
        <InlineStack align="space-between" gap="400" wrap blockAlign="start">
          {/* LEFT */}
          <Box>
            <Tag>default</Tag>

            <Box paddingBlockStart="300">
              <InlineStack gap="200" wrap>
                <Box minWidth="360px">
                  <TextField
                    labelHidden
                    label="Search"
                    placeholder="Search products by title, vendor, or handle…"
                    autoComplete="off"
                    value={searchInput}
                    onChange={(value) => setSearchInput(value)}
                  />
                </Box>
                <Button onClick={onSearch} loading={isSearching && !!searchTerm}>
                  Search
                </Button>
              </InlineStack>
            </Box>

            <Box paddingBlockStart="300">
              <ButtonGroup>
                <Button icon={PlusIcon} onClick={onOpenAddFilter}>
                  Add Filter
                </Button>
                <Button variant="secondary" onClick={onClear} disabled={isClearDisabled}>
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

                    return (
                      <Tag key={f.key} onRemove={() => onRemoveFilter(f.key)}>
                        {fieldLabel(f.key)} — {desc}
                      </Tag>
                    );
                  })}
                </InlineStack>
              </Box>
            )}
          </Box>

          {/* RIGHT */}
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
                  onChange={setSortBy}
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
                  onChange={(v) => setSortDirection(v as "asc" | "desc")}
                />
              </Box>
            </InlineStack>
          </Box>
        </InlineStack>
      </Box>
    </Card>
  );
}
