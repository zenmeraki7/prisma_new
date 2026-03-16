// FILE: frontend/components/SaveBulkEditPresetModal.tsx

import { useState } from "react";
import {
  Banner,
  BlockStack,
  Checkbox,
  Modal,
  TextField,
} from "@shopify/polaris";
import {
  createBulkEditPreset,
  type BulkEditAction,
  type BulkEditFieldKey,
  type BulkEditScope,
  type FilterExpr,
} from "../../../frontend/lib/bulkEdit/bulkEditApi";

interface SaveBulkEditPresetModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;

  scope: BulkEditScope;
  fieldKey: BulkEditFieldKey;
  action: BulkEditAction;
  value: unknown;
  filterExpr: FilterExpr;
}

export default function SaveBulkEditPresetModal({
  open,
  onClose,
  onSaved,
  scope,
  fieldKey,
  action,
  value,
  filterExpr,
}: SaveBulkEditPresetModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      await createBulkEditPreset({
        name,
        description,
        scope,
        fieldKey,
        action,
        value,
        filterExpr,
        isFavorite,
      });

      onSaved?.();
      onClose();
      setName("");
      setDescription("");
      setIsFavorite(false);
    } catch (err: any) {
      setError(err?.message || "Failed to save preset");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title="Save bulk edit preset"
      primaryAction={{
        content: saving ? "Saving…" : "Save preset",
        onAction: handleSave,
        loading: saving,
        disabled: !name.trim() || saving,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: onClose,
          disabled: saving,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          {error ? (
            <Banner tone="critical">
              <p>{error}</p>
            </Banner>
          ) : null}

          <TextField
            label="Preset name"
            value={name}
            onChange={setName}
            autoComplete="off"
            placeholder="Discounted Nike compare-at fix"
          />

          <TextField
            label="Description"
            value={description}
            onChange={setDescription}
            autoComplete="off"
            multiline={3}
            placeholder="Optional internal note"
          />

          <Checkbox
            label="Mark as favorite"
            checked={isFavorite}
            onChange={setIsFavorite}
          />
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}