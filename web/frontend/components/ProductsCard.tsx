import { useState } from "react";
import { Card, TextContainer, Text } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query"; // ✅ v4/v5 package

type ProductCountResponse = {
  count: number;
};

export function ProductsCard() {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const [isPopulating, setIsPopulating] = useState(false);
  const productsCount = 5;

  const {
    data,
    refetch: refetchProductCount,
    isLoading: isLoadingCount,
  } = useQuery<ProductCountResponse>({
    queryKey: ["productCount"],
    queryFn: async () => {
      const response = await fetch("/api/products/count");
      if (!response.ok) {
        throw new Error("Failed to fetch product count");
      }
      return (await response.json()) as ProductCountResponse;
    },
    refetchOnWindowFocus: false,
  });

  const setPopulatingSafe = (flag: boolean) => {
    // You may eventually switch this to App Bridge loading utilities
    // depending on how you're handling global loading state.
    // @ts-ignore – if your app-bridge typings don't expose loading/toast helpers
    shopify.loading?.(flag);
    setIsPopulating(flag);
  };

  const handlePopulate = async () => {
    setPopulatingSafe(true);

    try {
      const response = await fetch("/api/products", { method: "POST" });

      if (response.ok) {
        await refetchProductCount();

        // @ts-ignore – adapt to your toast helper
        shopify.toast?.show(
          t("ProductsCard.productsCreatedToast", { count: productsCount }),
        );
      } else {
        // @ts-ignore – adapt to your toast helper
        shopify.toast?.show(t("ProductsCard.errorCreatingProductsToast"), {
          isError: true,
        });
      }
    } finally {
      setPopulatingSafe(false);
    }
  };

  return (
    <Card
      title={t("ProductsCard.title")}
      sectioned
      primaryFooterAction={{
        content: t("ProductsCard.populateProductsButton", {
          count: productsCount,
        }),
        onAction: handlePopulate,
        loading: isPopulating,
      }}
    >
      <TextContainer spacing="loose">
        <p>{t("ProductsCard.description")}</p>
        <Text as="h4" variant="headingMd">
          {t("ProductsCard.totalProductsHeading")}
          <Text variant="bodyMd" as="p" fontWeight="semibold">
            {isLoadingCount ? "-" : data?.count}
          </Text>
        </Text>
      </TextContainer>
    </Card>
  );
}
