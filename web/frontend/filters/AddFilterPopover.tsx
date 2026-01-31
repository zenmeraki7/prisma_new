// FILE: web/frontend/filters/AddFilterPopover.tsx
import React, { useCallback, useMemo, useState } from "react";
import {
  Popover,
  Button,
  Box,
  TextField,
  ActionList,
  Scrollable,
} from "@shopify/polaris";

import { FILTERS, type FilterId } from "./FILTERS";

export type AddFilterPopoverProps = {
  onSelect(filterId: FilterId): void;
};

export function AddFilterPopover({ onSelect }: AddFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const toggleOpen = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();

    type Section = {
      title: string;
      items: { content: string; onAction: () => void }[];
    };

    const byGroup = new Map<string, Section>();

    for (const f of FILTERS) {
      if (q) {
        const hay = `${f.label} ${f.groupLabel}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }

      const group = f.groupLabel || "Other";
      let section = byGroup.get(group);
      if (!section) {
        section = { title: group, items: [] };
        byGroup.set(group, section);
      }

      section.items.push({
        content: f.label,
        onAction: () => {
          onSelect(f.id);
          setQuery("");
          close();
        },
      });
    }

    return Array.from(byGroup.values());
  }, [query, onSelect, close]);

  const activator = (
    <Button onClick={toggleOpen}>
      Add filter
    </Button>
  );

  return (
    <Popover
      active={open}
      activator={activator}
      onClose={close}
      autofocusTarget="first-node"
      fullWidth
    >
      <Box padding="300">
        <TextField
          label="Start typing"
          labelHidden
          value={query}
          onChange={setQuery}
          autoComplete="off"
          placeholder="Start typing"
        />
      </Box>
      <Scrollable shadow style={{ maxHeight: 360 }}>
        <ActionList sections={sections} />
      </Scrollable>
    </Popover>
  );
}
