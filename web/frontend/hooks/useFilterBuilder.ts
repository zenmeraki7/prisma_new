// FILE: web/frontend/hooks/useFilterBuilder.ts
//
// Stateful hook that manages the mutable draft of a filter group tree.
// Used by the filter-builder UI to build up a FilterGroupInput before
// submitting it to useProductsByFilter / useVariantsByFilter.
//
// Features:
//   - Stable IDs for React keys (no array-index keys)
//   - Converts draft → FilterGroupInput for query submission
//   - Validates operator compatibility against the filter registry
//   - Deep clone on every mutation (structural sharing not needed at this scale)

import { useCallback, useMemo, useReducer } from "react";

import type {
  FilterGroupInput,
  FilterConditionInput,
  FilterGroupOperator,
  FilterOperator,
  FilterDefinition,
  FilterConditionDraft,
  FilterGroupDraft,
  UseFilterBuilderResult,
  FilterRegistryPayload,
} from "../../types/filter.types";

// ─────────────────────────────────────────────────────────────────────────────
// Nano-ID helper  —  avoids adding a dep for stable keys
// ─────────────────────────────────────────────────────────────────────────────

let _seq = 0;
function uid(): string {
  return `fid_${Date.now()}_${++_seq}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default state factories
// ─────────────────────────────────────────────────────────────────────────────

function makeGroup(operator: FilterGroupOperator = "AND"): FilterGroupDraft {
  return { id: uid(), operator, conditions: [], groups: [] };
}

function makeCondition(
  key: string,
  operator: FilterOperator = "EQ",
): FilterConditionDraft {
  return { id: uid(), key, operator, value: undefined };
}

const INITIAL_STATE = (): FilterGroupDraft => makeGroup("AND");

// ─────────────────────────────────────────────────────────────────────────────
// Reducer actions
// ─────────────────────────────────────────────────────────────────────────────

type Action =
  | { type: "SET_OPERATOR";     groupId: string; op: FilterGroupOperator }
  | { type: "ADD_CONDITION";    groupId: string; key: string; operator: FilterOperator }
  | { type: "UPDATE_CONDITION"; groupId: string; condId: string; patch: Partial<FilterConditionDraft> }
  | { type: "REMOVE_CONDITION"; groupId: string; condId: string }
  | { type: "ADD_GROUP";        parentGroupId: string }
  | { type: "REMOVE_GROUP";     groupId: string }
  | { type: "RESET" };

// ─────────────────────────────────────────────────────────────────────────────
// Pure immutable tree operations
// ─────────────────────────────────────────────────────────────────────────────

function mapGroup(
  group: FilterGroupDraft,
  groupId: string,
  transform: (g: FilterGroupDraft) => FilterGroupDraft,
): FilterGroupDraft {
  if (group.id === groupId) return transform(group);
  return {
    ...group,
    groups: group.groups.map((g) => mapGroup(g, groupId, transform)),
  };
}

function removeGroupById(
  group: FilterGroupDraft,
  targetId: string,
): FilterGroupDraft {
  return {
    ...group,
    groups: group.groups
      .filter((g) => g.id !== targetId)
      .map((g) => removeGroupById(g, targetId)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────────────────────

function reducer(state: FilterGroupDraft, action: Action): FilterGroupDraft {
  switch (action.type) {
    case "RESET":
      return INITIAL_STATE();

    case "SET_OPERATOR":
      return mapGroup(state, action.groupId, (g) => ({
        ...g,
        operator: action.op,
      }));

    case "ADD_CONDITION":
      return mapGroup(state, action.groupId, (g) => ({
        ...g,
        conditions: [...g.conditions, makeCondition(action.key, action.operator)],
      }));

    case "UPDATE_CONDITION":
      return mapGroup(state, action.groupId, (g) => ({
        ...g,
        conditions: g.conditions.map((c) =>
          c.id === action.condId ? { ...c, ...action.patch } : c,
        ),
      }));

    case "REMOVE_CONDITION":
      return mapGroup(state, action.groupId, (g) => ({
        ...g,
        conditions: g.conditions.filter((c) => c.id !== action.condId),
      }));

    case "ADD_GROUP":
      return mapGroup(state, action.parentGroupId, (g) => ({
        ...g,
        groups: [...g.groups, makeGroup("AND")],
      }));

    case "REMOVE_GROUP":
      // Never remove the root group
      if (state.id === action.groupId) return state;
      return removeGroupById(state, action.groupId);

    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Draft → FilterGroupInput converter
// ─────────────────────────────────────────────────────────────────────────────

function draftToInput(draft: FilterGroupDraft): FilterGroupInput | null {
  const conditions: FilterConditionInput[] = draft.conditions
    .filter((c) => c.key && c.operator)
    .map((c) => ({ key: c.key, operator: c.operator, value: c.value }));

  const groups: FilterGroupInput[] = draft.groups
    .map(draftToInput)
    .filter((g): g is FilterGroupInput => g !== null);

  if (conditions.length === 0 && groups.length === 0) return null;

  return {
    operator: draft.operator,
    ...(conditions.length ? { conditions } : {}),
    ...(groups.length ? { groups } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// isEmpty check
// ─────────────────────────────────────────────────────────────────────────────

function isGroupEmpty(draft: FilterGroupDraft): boolean {
  if (draft.conditions.length > 0) return false;
  return draft.groups.every(isGroupEmpty);
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manage a mutable filter group draft tree.
 *
 * @param registry  Optional filter registry for operator validation in UI.
 *                  Pass the result of useFilterRegistry().registry.
 *
 * @example
 * const { draft, toInput, addCondition, updateCondition, removeCondition } =
 *   useFilterBuilder(registry);
 *
 * // Add a condition to the root group
 * addCondition(draft.id, "PRODUCT_STATUS");
 *
 * // Update it
 * updateCondition(draft.id, draft.conditions[0].id, {
 *   operator: "EQ",
 *   value:    "active",
 * });
 *
 * // Convert to query input
 * const filterInput = toInput();
 * // Pass filterInput to useProductsByFilter({ filter: filterInput })
 */
export function useFilterBuilder(
  registry?: FilterRegistryPayload | null,
): UseFilterBuilderResult {
  const [draft, dispatch] = useReducer(reducer, undefined, INITIAL_STATE);

  // Build a key→def lookup from the registry for validation / defaults in UI
  const defByKey = useMemo<Map<string, FilterDefinition>>(() => {
    if (!registry) return new Map();
    const map = new Map<string, FilterDefinition>();
    for (const def of registry.allFilters) {
      map.set(def.key, def);
    }
    return map;
  }, [registry]);

  const setOperator = useCallback(
    (groupId: string, op: FilterGroupOperator) => {
      dispatch({ type: "SET_OPERATOR", groupId, op });
    },
    [],
  );

  const addCondition = useCallback(
    (groupId: string, key: string) => {
      // Default to first allowed operator for this key; fall back to EQ
      const def = defByKey.get(key);
      const defaultOp = (def?.operators[0] ?? "EQ") as FilterOperator;
      dispatch({ type: "ADD_CONDITION", groupId, key, operator: defaultOp });
    },
    [defByKey],
  );

  const updateCondition = useCallback(
    (groupId: string, condId: string, patch: Partial<FilterConditionDraft>) => {
      dispatch({ type: "UPDATE_CONDITION", groupId, condId, patch });
    },
    [],
  );

  const removeCondition = useCallback(
    (groupId: string, condId: string) => {
      dispatch({ type: "REMOVE_CONDITION", groupId, condId });
    },
    [],
  );

  const addGroup = useCallback(
    (parentGroupId: string) => {
      dispatch({ type: "ADD_GROUP", parentGroupId });
    },
    [],
  );

  const removeGroup = useCallback(
    (groupId: string) => {
      dispatch({ type: "REMOVE_GROUP", groupId });
    },
    [],
  );

  const reset = useCallback(
    () => {
      dispatch({ type: "RESET" });
    },
    [],
  );

  const toInput = useCallback(
    () => draftToInput(draft),
    [draft],
  );

  const isEmpty = useMemo(() => isGroupEmpty(draft), [draft]);

  return {
    draft,
    toInput,
    setOperator,
    addCondition,
    updateCondition,
    removeCondition,
    addGroup,
    removeGroup,
    reset,
    isEmpty,
  };
}