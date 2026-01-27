import React from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  RadioButton,
  Checkbox,
  TextField,
  Button,
  InlineStack,
  BlockStack,
  Banner,
  Divider,
  Badge,
  Icon,
} from "@shopify/polaris";
import {
  SettingsIcon,
  ClockIcon,
  EmailIcon,
} from "@shopify/polaris-icons";

export default function SettingsPage() {
  const [plan, setPlan] = React.useState("pro");
  const [nightlySnapshot, setNightlySnapshot] = React.useState(true);
  const [enableFastPlane, setEnableFastPlane] = React.useState(true);
  const [supportEmail, setSupportEmail] = React.useState(
    "support@zenmeraki.com"
  );
  const [saved, setSaved] = React.useState(false);
  const [hasChanges, setHasChanges] = React.useState(false);

  const handleSave = () => {
    console.log("Saving settings", {
      plan,
      nightlySnapshot,
      enableFastPlane,
      supportEmail,
    });
    setSaved(true);
    setHasChanges(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const handlePlanChange = (checked: boolean, newValue: string) => {
    if (checked) {
      setPlan(newValue);
      setHasChanges(true);
    }
  };

  const getPlanBadge = (planType: string) => {
    const badges = {
      free: <Badge tone="info">Free</Badge>,
      pro: <Badge tone="success">Pro</Badge>,
      enterprise: <Badge tone="attention">Enterprise</Badge>,
    };
    return badges[planType as keyof typeof badges];
  };

  return (
    <Page
      title="Settings"
      fullWidth
      subtitle="Manage your store configuration and preferences"
      primaryAction={{
        content: "Save changes",
        onAction: handleSave,
        disabled: !hasChanges,
      }}
      secondaryActions={[
        {
          content: "Discard",
          disabled: !hasChanges,
          onAction: () => {
            setPlan("pro");
            setNightlySnapshot(true);
            setEnableFastPlane(true);
            setSupportEmail("support@zenmeraki.com");
            setHasChanges(false);
          },
        },
      ]}
    >
      <Layout>
        {saved && (
          <Layout.Section>
            <Banner
              title="Settings saved successfully"
              tone="success"
              onDismiss={() => setSaved(false)}
            >
              Your changes have been applied to your store.
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <BlockStack gap="400">
            {/* Plan Selection */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd" fontWeight="semibold">
                      Subscription Plan
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Select the plan tier for this store
                    </Text>
                  </BlockStack>
                  {getPlanBadge(plan)}
                </InlineStack>

                <Divider />

                <BlockStack gap="300">
                  <BlockStack gap="200">
                    <RadioButton
                      label="Free Plan"
                      helpText="Basic features for small stores"
                      checked={plan === "free"}
                      id="free"
                      name="plan"
                      onChange={handlePlanChange}
                    />
                    <RadioButton
                      label="Pro Plan"
                      helpText="Advanced features and priority support"
                      checked={plan === "pro"}
                      id="pro"
                      name="plan"
                      onChange={handlePlanChange}
                    />
                    <RadioButton
                      label="Enterprise Plan"
                      helpText="Full feature access with dedicated support"
                      checked={plan === "enterprise"}
                      id="enterprise"
                      name="plan"
                      onChange={handlePlanChange}
                    />
                  </BlockStack>

                  <Banner tone="info">
                    <Text as="p" variant="bodySm">
                      Plan changes affect feature availability but don't modify Shopify billing in this demo environment.
                    </Text>
                  </Banner>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Performance Settings */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd" fontWeight="semibold">
                    Performance & Optimization
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Configure performance features and data management
                  </Text>
                </BlockStack>

                <Divider />

                <BlockStack gap="300">
                  <Checkbox
                    label="Enable FAST plane processing"
                    helpText="Accelerates filter operations for supported product types"
                    checked={enableFastPlane}
                    onChange={(checked) => {
                      setEnableFastPlane(checked);
                      setHasChanges(true);
                    }}
                  />

                  <Checkbox
                    label="Automatic nightly snapshots"
                    helpText="Refreshes product data and rollups daily at midnight"
                    checked={nightlySnapshot}
                    onChange={(checked) => {
                      setNightlySnapshot(checked);
                      setHasChanges(true);
                    }}
                  />

                  {nightlySnapshot && (
                    <Banner tone="warning">
                      <Text as="p" variant="bodySm">
                        Background jobs will rebuild product rollups and snapshot sets automatically. This may affect performance during processing.
                      </Text>
                    </Banner>
                  )}
                </BlockStack>
              </BlockStack>
            </Card>

         
          </BlockStack>
        </Layout.Section>

        {/* Sidebar Info */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm" fontWeight="semibold">
                  About Settings
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  These settings control the behavior and features available for your store's bulk editor instance.
                </Text>
                <Divider />
                <BlockStack gap="200">
                  <Text as="p" variant="bodyXs" tone="subdued">
                    • Changes take effect immediately after saving
                  </Text>
                  <Text as="p" variant="bodyXs" tone="subdued">
                    • Plan features are applied instantly
                  </Text>
                  <Text as="p" variant="bodyXs" tone="subdued">
                    • Snapshots run automatically when enabled
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm" fontWeight="semibold">
                  Need Help?
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Contact our support team for assistance with configuration or features.
                </Text>
                <Button
                  variant="plain"
                  onClick={() => window.open("https://docs.zenmeraki.com", "_blank")}
                >
                  View documentation
                </Button>
              </BlockStack>
            </Card>
               {/* Support Settings */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd" fontWeight="semibold">
                    Support Contact
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Configure support email address for this store
                  </Text>
                </BlockStack>

                <Divider />

                <BlockStack gap="300">
                  <TextField
                    label="Support email address"
                    type="email"
                    value={supportEmail}
                    onChange={(value) => {
                      setSupportEmail(value);
                      setHasChanges(true);
                    }}
                    autoComplete="email"
                    placeholder="support@example.com"
                  />

                  <InlineStack gap="200">
                    <Button
                      onClick={() =>
                        window.open(
                          `mailto:${supportEmail}?subject=Bulk Editor Support Request&body=Hello Support Team,%0D%0A%0D%0AI need assistance with...`,
                          "_blank"
                        )
                      }
                      disabled={!supportEmail}
                    >
                      Send test email
                    </Button>
                    <Text as="span" variant="bodySm" tone="subdued">
                      Opens your default email client
                    </Text>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}