// web/frontend/pages/productsPage/components/ConfigureFilterModal.tsx
import React from "react";
import {
  Modal,
  Box,
  Text,
  Select,
  TextField,
  ChoiceList,
  InlineStack,
  Banner,
} from "@shopify/polaris";

import type { FilterKind, StringOp, NumberOp, DateOp, EnumOp } from "../filterTypes";
import { fieldKind, fieldSupportedNow } from "../filterRegistry";

export function ConfigureFilterModal(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  primaryActionLabel: string;
  onApply: () => void;
  primaryDisabled: boolean;

  activeKey: string | null;
  configKind: FilterKind;

  stringOp: StringOp;
  setStringOp: (v: StringOp) => void;
  stringValue: string;
  setStringValue: (v: string) => void;

  numberOp: NumberOp;
  setNumberOp: (v: NumberOp) => void;
  numberA: string;
  setNumberA: (v: string) => void;
  numberB: string;
  setNumberB: (v: string) => void;

  dateOp: DateOp;
  setDateOp: (v: DateOp) => void;
  dateValue: string;
  setDateValue: (v: string) => void;

  enumOp: EnumOp;
  setEnumOp: (v: EnumOp) => void;
  enumValue: string;
  setEnumValue: (v: string) => void;

  boolValue: boolean;
  setBoolValue: (v: boolean) => void;
}) {
  const {
    open,
    onClose,
    title,
    primaryActionLabel,
    onApply,
    primaryDisabled,

    activeKey,
    configKind,

    stringOp,
    setStringOp,
    stringValue,
    setStringValue,

    numberOp,
    setNumberOp,
    numberA,
    setNumberA,
    numberB,
    setNumberB,

    dateOp,
    setDateOp,
    dateValue,
    setDateValue,

    enumOp,
    setEnumOp,
    enumValue,
    setEnumValue,

    boolValue,
    setBoolValue,
  } = props;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="large"
      primaryAction={{
        content:
          fieldKind(activeKey ?? "") === "enum" && (activeKey ?? "") === "product.status"
            ? "Add Filter"
            : primaryActionLabel,
        onAction: onApply,
        disabled: primaryDisabled,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        {/* STRING */}
        {activeKey && configKind === "string" && (
          <>
            <Box paddingBlockEnd="200">
              <Text as="h3" variant="headingSm">
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
              <Text as="h3" variant="headingSm">
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
                Status
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
              <Text as="h3" variant="headingSm">
                Search
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
              <Text as="h3" variant="headingSm">
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
              <Text as="h3" variant="headingSm">
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
            Select a filter field.
          </Text>
        )}

        {/* hint for unsupported */}
        {activeKey && !fieldSupportedNow(activeKey) && (
          <Box paddingBlockStart="400">
            <Banner tone="warning">
              <p>
                This filter is UI-ready, but it won’t affect results yet because the FAST-plane product DTO doesn’t
                include this field today.
              </p>
            </Banner>
          </Box>
        )}
      </Modal.Section>
    </Modal>
  );
}
