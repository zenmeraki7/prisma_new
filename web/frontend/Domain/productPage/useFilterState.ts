// web/frontend/pages/productsPage/useFilterState.ts
import { useCallback, useMemo, useState } from "react";
import { fieldKind, fieldLabel, fieldSupportedNow } from "./filterRegistry";
import type {
  AppliedFilter,
  FilterKind,
  StringOp,
  NumberOp,
  DateOp,
  EnumOp,
} from "./filterTypes";

export function useProductsPageFilterState() {
  // Filters
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilter[]>([]);

  // Modal 1: Add Filter (picker)
  const [addFilterOpen, setAddFilterOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");

  // Modal 2: Configure filter
  const [configOpen, setConfigOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // config fields (shared)
  const [stringOp, setStringOp] = useState<StringOp>("contains");
  const [stringValue, setStringValue] = useState("");

  const [numberOp, setNumberOp] = useState<NumberOp>("eq");
  const [numberA, setNumberA] = useState<string>("");
  const [numberB, setNumberB] = useState<string>("");

  const [dateOp, setDateOp] = useState<DateOp>("before");
  const [dateValue, setDateValue] = useState<string>(""); // yyyy-mm-dd

  const [enumOp, setEnumOp] = useState<EnumOp>("is");
  const [enumValue, setEnumValue] = useState<string>("");

  const [boolValue, setBoolValue] = useState<boolean>(true);

  /* ----------------------- */
  /* Modal 1: Add Filter     */
  /* ----------------------- */

  const openAddFilter = useCallback(() => {
    setAddFilterOpen(true);
  }, []);

  const closeAddFilter = useCallback(() => {
    setAddFilterOpen(false);
    setFilterSearch("");
  }, []);

  const openConfigForKey = useCallback(
    (key: string) => {
      setActiveKey(key);

      const kind = fieldKind(key);
      const existing = appliedFilters.find((f) => f.key === key);

      // default config
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

      // keep Add Filter modal open and stack config modal
      setConfigOpen(true);
    },
    [appliedFilters],
  );

  /* ----------------------- */
  /* Modal 2: Config Filter  */
  /* ----------------------- */

  const closeConfig = useCallback(() => {
    setConfigOpen(false);
  }, []);

  const removeFilter = useCallback((key: string) => {
    setAppliedFilters((prev) => prev.filter((f) => f.key !== key));
  }, []);

  const applyConfig = useCallback(() => {
    if (!activeKey) return;
    const kind = fieldKind(activeKey);

    setAppliedFilters((prev) => {
      const others = prev.filter((f) => f.key !== activeKey);

      // If empty -> remove filter
      if (kind === "string") {
        const v = stringValue.trim();
        if (!v) return others;
        const next: AppliedFilter = { key: activeKey, kind: "string", op: stringOp, value: v };
        return [...others, next];
      }

      if (kind === "number") {
        const a = Number(numberA);
        const b = Number(numberB);
        if (Number.isNaN(a)) return others;

        if (numberOp === "between") {
          if (Number.isNaN(b)) return others;
          const next: AppliedFilter = { key: activeKey, kind: "number", op: numberOp, value: a, value2: b };
          return [...others, next];
        }

        const next: AppliedFilter = { key: activeKey, kind: "number", op: numberOp, value: a };
        return [...others, next];
      }

      if (kind === "date") {
        const v = dateValue.trim();
        if (!v) return others;
        const next: AppliedFilter = { key: activeKey, kind: "date", op: dateOp, value: v };
        return [...others, next];
      }

      if (kind === "enum") {
        const v = enumValue.trim();
        if (!v) return others;
        const next: AppliedFilter = { key: activeKey, kind: "enum", op: enumOp, value: v };
        return [...others, next];
      }

      if (kind === "boolean") {
        const next: AppliedFilter = { key: activeKey, kind: "boolean", op: "is", value: boolValue };
        return [...others, next];
      }

      return others;
    });

    setConfigOpen(false);
  }, [
    activeKey,
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
  ]);

  const configTitle = activeKey ? `Filter by ${fieldLabel(activeKey)}` : "Filter";
  const configKind: FilterKind = activeKey ? fieldKind(activeKey) : "string";

  const configDisabled = useMemo(() => {
    if (!activeKey) return true;

    if (configKind === "string") return stringValue.trim() === "";
    if (configKind === "number") {
      const a = Number(numberA);
      if (Number.isNaN(a)) return true;
      if (numberOp === "between") return Number.isNaN(Number(numberB));
      return false;
    }
    if (configKind === "date") return dateValue.trim() === "";
    if (configKind === "enum") return enumValue.trim() === "";
    if (configKind === "boolean") return false;
    return true;
  }, [activeKey, configKind, stringValue, numberA, numberB, numberOp, dateValue, enumValue]);

  const primaryActionLabel =
    fieldKind(activeKey ?? "") === "enum" && (activeKey ?? "") === "product.status" ? "Add Filter" : "Apply Filter";

  const clearAllFilters = useCallback(() => {
    setAppliedFilters([]);
    setAddFilterOpen(false);
    setConfigOpen(false);
    setActiveKey(null);
    setFilterSearch("");

    // reset config to defaults
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
  }, []);

  return {
    appliedFilters,
    setAppliedFilters,

    addFilterOpen,
    openAddFilter,
    closeAddFilter,

    filterSearch,
    setFilterSearch,

    configOpen,
    activeKey,
    openConfigForKey,
    closeConfig,

    removeFilter,
    applyConfig,

    configTitle,
    configKind,
    configDisabled,
    primaryActionLabel,

    // config state (passed to modal)
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

    // helpers
    fieldSupportedNow,
    clearAllFilters,
  };
}
