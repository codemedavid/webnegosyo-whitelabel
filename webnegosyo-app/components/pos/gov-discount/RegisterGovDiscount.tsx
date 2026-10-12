import React, { useCallback } from "react";
import { router } from "expo-router";
import { usePosCartStore } from "../../../stores/pos-cart-store";
import { useAuthStore } from "../../../stores/auth-store";
import { useGovDiscountContextStore } from "../../../stores/gov-discount-context-store";
import { cartTotals } from "../../../lib/pos-cart";
import { chargeableDeliveryFee } from "../../../lib/pos-delivery";
import { effectiveEditCart } from "../../../lib/pos-edit-mode";
import { newLocalOrderId } from "../../../lib/offline/local-id";
import {
  EMPTY_GOV_SESSION,
  priceGovSession,
  type PosGovSession,
} from "../../../lib/pos-gov-discount";
import { TAX_SETTINGS_ROUTE } from "../../../lib/gov-ledger/routes";
import { GovDiscountSheet } from "./GovDiscountSheet";

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * The Senior / PWD sheet, wired to the register's cart. Kept out of the
 * register screen so the screen only decides WHEN it opens.
 */
export function RegisterGovDiscount({ visible, onClose }: Props) {
  // Re-render on any cart change or when the store's rules arrive.
  const state = usePosCartStore();
  useGovDiscountContextStore();
  const tenantId = useAuthStore((s) => s.tenantId);
  const isOwner = useAuthStore((s) => s.isOwner);

  const context = state.govContext();
  const cart = state.editContext ? effectiveEditCart(state.lines, state.editContext) : state.lines;
  const serviceCharge = state.editContext
    ? state.editContext.serviceCharge
    : cartTotals(state.lines, state.serviceCharge).serviceCharge;
  const deliveryFee = state.editContext ? state.editContext.deliveryFee : chargeableDeliveryFee(state.delivery);
  // `cartTotals` owns the sum (the money-wiring guardrail), not this file.
  const saleGross = cartTotals(cart, { type: "fixed", value: serviceCharge }, [], deliveryFee).total;

  const sessionDiscount = state.sessionDiscount();
  const otherDiscountTotal =
    sessionDiscount.regime?.regime === "other"
      ? sessionDiscount.total
      : sessionDiscount.government.status === "priced"
        ? 0
        : sessionDiscount.total;

  const price = useCallback(
    (session: PosGovSession) => priceGovSession({ session, cart, context, serviceCharge, deliveryFee }),
    [cart, context, serviceCharge, deliveryFee],
  );

  if (!tenantId) return null;

  return (
    <GovDiscountSheet
      visible={visible}
      onClose={onClose}
      tenantId={tenantId}
      outletId={state.editContext?.outletId ?? state.saleOutlet?.id ?? null}
      cart={cart}
      session={state.discount.government ?? EMPTY_GOV_SESSION}
      context={context}
      saleGross={saleGross}
      otherDiscountTotal={otherDiscountTotal}
      price={price}
      onApply={state.setGovernment}
      canSetUp={isOwner === true}
      onSetUp={() => {
        onClose();
        router.push(TAX_SETTINGS_ROUTE);
      }}
      newClaimantId={newLocalOrderId}
    />
  );
}
