// web/frontend/components/filters/FilterBuilderModal.tsx
import React, { useMemo, useState, useCallback } from "react";
import {
  Modal,
  Box,
  TextField,
  Divider,
  Text,
  ActionList,
  InlineStack,
  Select,
  ChoiceList,
  Banner,
} from "@shopify/polaris";

import {
  type AppliedFilter,
  type FieldDef,
  type FilterKind,
  type StringOp,
  type NumberOp,
  type DateOp,
  type EnumOp,
  type FilterFieldGroup,
} from "../../lib/filters/registry";

export interface FilterBuilderProps {
  open: boolean;
  onClose: () => void;

  groups: FilterFieldGroup[];

  value: AppliedFilter[];
  onChange: (filters: AppliedFilter[]) => void;
}

function findFieldInGroups(groups: FilterFieldGroup[], key: string): FieldDef | undefined {
  for (const group of groups) {
    const found = group.fields.find((f) => f.key === key);
    if (found) return found;
  }
  return undefined;
}

export function FilterBuilder({
  open,
  onClose,
  groups,
  value,
  onChange,
}: FilterBuilderProps) {
  // Left pane: search over fields
  const [filterSearch, setFilterSearch] = useState("");
  // Active field key
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // Config values
  const [stringOp, setStringOp] = useState<StringOp>("contains");
  const [stringValue, setStringValue] = useState("");

  const [numberOp, setNumberOp] = useState<NumberOp>("eq");
  const [numberA, setNumberA] = useState<string>("");
  const [numberB, setNumberB] = useState<string>("");

  const [dateOp, setDateOp] = useState<DateOp>("before");
  const [dateValue, setDateValue] = useState<string>("");

  const [enumOp, setEnumOp] = useState<EnumOp>("is");
  const [enumValue, setEnumValue] = useState<string>("");

  const [boolValue, setBoolValue] = useState<boolean>(true);

  const filteredGroups = useMemo(() => {
    const needle = filterSearch.trim().toLowerCase();
    if (!needle) return groups;
    return groups.map((group) => ({
      ...group,
      fields: group.fields.filter((f) => f.label.toLowerCase().includes(needle)),
    }));
  }, [groups, filterSearch]);

  const activeField: FieldDef | undefined = useMemo(
    () => (activeKey ? findFieldInGroups(groups, activeKey) : undefined),
    [groups, activeKey],
  );

  const configKind: FilterKind = activeField?.kind ?? "string";

const configDisabled = useMemo(() => {
  if (!activeKey) return true;

  switch (configKind) {
    case "string":
      return stringValue.trim() === "";
    
    case "number": {
      const a = Number(numberA);
      if (Number.isNaN(a)) return true;
      if (numberOp === "between") {
        return Number.isNaN(Number(numberB));
      }
      return false;
    }
    
    case "date":
      return dateValue.trim() === "";
    
    case "enum":
      return enumValue.trim() === "";
    
    case "boolean":
      return false;
    
    default:
      // If we reach here, something is wrong - log it for debugging
      console.warn(`Unknown filter kind: ${configKind} for field ${activeKey}`);
      return false; // Allow the user to proceed instead of blocking them
  }
}, [activeKey, configKind, stringValue, numberA, numberB, numberOp, dateValue, enumValue]);


  const selectFieldForConfig = useCallback(
    (key: string) => {
      setActiveKey(key);

      const field = findFieldInGroups(groups, key);
      const kind = field?.kind ?? "string";
      const existing = value.find((f) => f.key === key);

      // reset defaults
      setStringOp("contains");
      setStringValue("");

      setNumberOp("eq");
      setNumberA("");
      setNumberB("");

      setDateOp("before");
      setDateValue("");

      setEnumOp("is");
      setEnumValue("");

      setBoolValue(true);

      if (existing) {
        if (existing.kind === "string") {
          setStringOp(existing.op);
          setStringValue(existing.value);
        } else if (existing.kind === "number") {
          setNumberOp(existing.op);
          setNumberA(String(existing.value ?? ""));
          setNumberB(String(existing.value2 ?? ""));
        } else if (existing.kind === "date") {
          setDateOp(existing.op);
          setDateValue(existing.value);
        } else if (existing.kind === "enum") {
          setEnumOp(existing.op);
          setEnumValue(existing.value);
        } else if (existing.kind === "boolean") {
          setBoolValue(existing.value);
        }
      } else {
        // sensible defaults per kind
        if (kind === "enum" && key === "product.status") {
          setEnumOp("is");
          setEnumValue("ACTIVE");
        }
        if (kind === "boolean") {
          setBoolValue(true);
        }
      }
    },
    [groups, value],
  );

  const handleClose = useCallback(() => {
    onClose();
    setFilterSearch("");
  }, [onClose]);

  const applyConfig = useCallback(() => {
    if (!activeKey) return;

    const field = findFieldInGroups(groups, activeKey);
    const kind: FilterKind = field?.kind ?? "string";

    const next = (() => {
      const others = value.filter((f) => f.key !== activeKey);

      // If empty -> remove filter
      if (kind === "string") {
        const v = stringValue.trim();
        if (!v) return others;
        const filter: AppliedFilter = { key: activeKey, kind: "string", op: stringOp, value: v };
        return [...others, filter];
      }

      if (kind === "number") {
        const a = Number(numberA);
        const b = Number(numberB);
        if (Number.isNaN(a)) return others;

        if (numberOp === "between") {
          if (Number.isNaN(b)) return others;
          const filter: AppliedFilter = {
            key: activeKey,
            kind: "number",
            op: numberOp,
            value: a,
            value2: b,
          };
          return [...others, filter];
        }

        const filter: AppliedFilter = {
          key: activeKey,
          kind: "number",
          op: numberOp,
          value: a,
        };
        return [...others, filter];
      }

      if (kind === "date") {
        const v = dateValue.trim();
        if (!v) return others;
        const filter: AppliedFilter = {
          key: activeKey,
          kind: "date",
          op: dateOp,
          value: v,
        };
        return [...others, filter];
      }

      if (kind === "enum") {
        const v = enumValue.trim();
        if (!v) return others;
        const filter: AppliedFilter = {
          key: activeKey,
          kind: "enum",
          op: enumOp,
          value: v,
        };
        return [...others, filter];
      }

      if (kind === "boolean") {
        const filter: AppliedFilter = {
          key: activeKey,
          kind: "boolean",
          op: "is",
          value: boolValue,
        };
        return [...others, filter];
      }

      return others;
    })();

    onChange(next);
    onClose();
    setFilterSearch("");
  }, [
    activeKey,
    groups,
    value,
    stringOp,
    stringValue,
    numberOp,
    numberA,
    numberB,
    dateOp,
    dateValue,
    enumOp,
    enumValue,
    boolValue,
    onChange,
    onClose,
  ]);

  const activeLabel = activeField?.label ?? activeKey ?? "Filter";
  const activeSupportedNow = !!activeField?.supportedNow;

  const primaryActionLabel =
    activeKey && activeKey === "product.status" && configKind === "enum"
      ? "Add Filter"
      : "Apply Filter";

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Filter"
      size="large"
      primaryAction={{
        content: primaryActionLabel,
        onAction: applyConfig,
        disabled: configDisabled,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: handleClose,
        },
      ]}
    >
      <Modal.Section>
        <InlineStack align="start" gap="400" wrap={false}>
          {/* LEFT PANE: field picker */}
          <Box minWidth="260px" maxWidth="320px">
            <Box paddingBlockEnd="200">
              <TextField
                label="Search filters"
                labelHidden
                placeholder="Search filters"
                autoComplete="off"
                value={filterSearch}
                onChange={setFilterSearch}
                prefix={<span style={{ display: "inline-flex" }}>{/* Polaris icon spacing */}</span>}
              />
            </Box>

            <Divider />

            {filteredGroups.map((group) => (
              <Box key={group.id} paddingBlockStart="300">
                <Box paddingBlockEnd="200">
                  <Text as="h3" variant="headingSm">
                    {group.label}
                  </Text>
                </Box>

                <ActionList
                  items={group.fields.map((f) => ({
                    content: f.label,
                    onAction: () => selectFieldForConfig(f.key),
                    active: activeKey === f.key,
                  }))}
                />
              </Box>
            ))}
          </Box>

          {/* RIGHT PANE: config for selected field */}
          <Box flex="1">
            {/* STRING */}
            {activeKey && configKind === "string" && (
              <>
                <Box paddingBlockEnd="200">
                  <Text as="h3" variant="headingSm">
                    Filter by {activeLabel}
                  </Text>
                </Box>

                <Box paddingBlockEnd="200">
                  <Text as="h4" variant="headingSm">
                    Filter Option
                  </Text>
                </Box>

                <Box paddingBlockEnd="300">
                  <Select
                    label="Filter option"
                    labelHidden
                    options={[
                      { label: "Equals", value: "equals" },
                      { label: "Not Equals", value: "notEquals" },
                      { label: "Contains", value: "contains" },
                      { label: "Does not contain", value: "notContains" },
                      { label: "Contains any of the words", value: "containsAny" },
                      { label: "Ends with", value: "endsWith" },
                      { label: "Starts with", value: "startsWith" },
                      { label: "Does not start with", value: "notStartsWith" },
                      { label: "Contains (case insensitive)", value: "containsCi" },
                      { label: "Equals (case insensitive)", value: "equalsCi" },
                    ]}
                    value={stringOp}
                    onChange={(v) => setStringOp(v as StringOp)}
                  />
                </Box>

                <Box paddingBlockEnd="200">
                  <Text as="h4" variant="headingSm">
                    Value
                  </Text>
                </Box>

                <TextField
                  label="Value"
                  labelHidden
                  placeholder="Enter value"
                  autoComplete="off"
                  value={stringValue}
                  onChange={setStringValue}
                />
              </>
            )}

            {/* ENUM (Status style) */}
            {activeKey && configKind === "enum" && activeKey === "product.status" && (
              <>
                <Box paddingBlockEnd="200">
                  <Text as="h3" variant="headingSm">
                    Filter by Status
                  </Text>
                </Box>

                <ChoiceList
                  title=""
                  titleHidden
                  choices={[
                    { label: "Draft", value: "DRAFT" },
                    { label: "Active", value: "ACTIVE" },
                    { label: "Archived", value: "ARCHIVED" },
                  ]}
                  selected={[enumValue]}
                  onChange={(selected) => setEnumValue(selected[0] ?? "")}
                />
              </>
            )}

            {/* ENUM (generic) */}
            {activeKey && configKind === "enum" && activeKey !== "product.status" && (
              <>
                <Box paddingBlockEnd="200">
                  <Text as="h3" variant="headingSm">
                    Filter by {activeLabel}
                  </Text>
                </Box>

                <Box paddingBlockEnd="200">
                  <Text as="h4" variant="headingSm">
                    Filter Option
                  </Text>
                </Box>

                <Box paddingBlockEnd="300">
                  <Select
                    label="Filter option"
                    labelHidden
                    options={[
                      { label: "Is", value: "is" },
                      { label: "Is not", value: "isNot" },
                    ]}
                    value={enumOp}
                    onChange={(v) => setEnumOp(v as EnumOp)}
                  />
                </Box>

                <Box paddingBlockEnd="200">
                  <Text as="h4" variant="headingSm">
                    Value
                  </Text>
                </Box>

                <TextField
                  label="Search"
                  labelHidden
                  placeholder="Enter value"
                  value={enumValue}
                  onChange={setEnumValue}
                  autoComplete="off"
                />
              </>
            )}

            {/* DATE */}
            {activeKey && configKind === "date" && (
              <>
                <Box paddingBlockEnd="200">
                  <Text as="h3" variant="headingSm">
                    Filter by {activeLabel}
                  </Text>
                </Box>

                <Box paddingBlockEnd="200">
                  <Text as="h4" variant="headingSm">
                    Select Date Filter
                  </Text>
                </Box>

                <Box paddingBlockEnd="300">
                  <Select
                    label="Date filter"
                    labelHidden
                    options={[
                      { label: "Is before", value: "before" },
                      { label: "Is after", value: "after" },
                      { label: "Is on", value: "on" },
                    ]}
                    value={dateOp}
                    onChange={(v) => setDateOp(v as DateOp)}
                  />
                </Box>

                <Box paddingBlockEnd="200">
                  <Text as="h4" variant="headingSm">
                    Select date
                  </Text>
                </Box>

                <TextField
                  label="Select date"
                  labelHidden
                  type="date"
                  value={dateValue}
                  onChange={setDateValue}
                  autoComplete="off"
                />
              </>
            )}

            {/* NUMBER */}
            {activeKey && configKind === "number" && (
              <>
                <Box paddingBlockEnd="200">
                  <Text as="h3" variant="headingSm">
                    Filter by {activeLabel}
                  </Text>
                </Box>

                <Box paddingBlockEnd="200">
                  <Text as="h4" variant="headingSm">
                    Filter Option
                  </Text>
                </Box>

                <Box paddingBlockEnd="300">
                  <Select
                    label="Number filter"
                    labelHidden
                    options={[
                      { label: "Equals", value: "eq" },
                      { label: "Not equals", value: "neq" },
                      { label: "Greater than", value: "gt" },
                      { label: "Greater than or equal", value: "gte" },
                      { label: "Less than", value: "lt" },
                      { label: "Less than or equal", value: "lte" },
                      { label: "Between", value: "between" },
                    ]}
                    value={numberOp}
                    onChange={(v) => setNumberOp(v as NumberOp)}
                  />
                </Box>

                <Box paddingBlockEnd="200">
                  <Text as="h4" variant="headingSm">
                    Value
                  </Text>
                </Box>

                <InlineStack gap="200" wrap>
                  <Box minWidth="220px">
                    <TextField
                      label="Value"
                      labelHidden
                      type="number"
                      placeholder={numberOp === "between" ? "From" : "Enter value"}
                      value={numberA}
                      onChange={setNumberA}
                      autoComplete="off"
                    />
                  </Box>

                  {numberOp === "between" && (
                    <Box minWidth="220px">
                      <TextField
                        label="Value 2"
                        labelHidden
                        type="number"
                        placeholder="To"
                        value={numberB}
                        onChange={setNumberB}
                        autoComplete="off"
                      />
                    </Box>
                  )}
                </InlineStack>
              </>
            )}

            {/* BOOLEAN */}
            {activeKey && configKind === "boolean" && (
              <>
                <Box paddingBlockEnd="200">
                  <Text as="h3" variant="headingSm">
                    Filter by {activeLabel}
                  </Text>
                </Box>

                <Box paddingBlockEnd="200">
                  <Text as="h4" variant="headingSm">
                    Value
                  </Text>
                </Box>

                <ChoiceList
                  title=""
                  titleHidden
                  choices={[
                    { label: "Yes", value: "yes" },
                    { label: "No", value: "no" },
                  ]}
                  selected={[boolValue ? "yes" : "no"]}
                  onChange={(selected) => setBoolValue(selected[0] === "yes")}
                />
              </>
            )}

            {/* If nothing selected */}
            {!activeKey && (
              <Text as="p" tone="subdued">
                Select a filter field from the list on the left.
              </Text>
            )}

            {/* hint for unsupported */}
            {activeKey && activeField && !activeSupportedNow && (
              <Box paddingBlockStart="400">
                <Banner tone="warning">
                  <p>
                    This filter is UI-ready, but it won’t affect results yet because the current data plane
                    doesn&apos;t include this field.
                  </p>
                </Banner>
              </Box>
            )}
          </Box>
        </InlineStack>
      </Modal.Section>
    </Modal>
  );
}
