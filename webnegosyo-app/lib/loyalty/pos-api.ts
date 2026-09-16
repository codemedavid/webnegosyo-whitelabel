import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { supabase } from "../supabase";
import { getWebAppUrl } from "../web-app-url";
export const isLoyaltyPosEnabled = () =>
  Constants.expoConfig?.extra?.loyaltyPosEnabled === true;
export interface PendingLoyaltySale {
  quoteId: string;
  clientOrderId: string;
  tender: {
    methodId: string;
    amountTenderedCentavos: number;
    reference?: string;
  };
}
const key = (tenant: string, actor: string) =>
  `loyalty-sale:${tenant}:${actor}`;
export async function readReservedLoyaltyQuote(
  tenant: string,
  actor: string,
): Promise<string | null> {
  return AsyncStorage.getItem(`${key(tenant, actor)}:quote`);
}
export async function saveReservedLoyaltyQuote(
  tenant: string,
  actor: string,
  quoteId: string | null,
) {
  if (quoteId)
    await AsyncStorage.setItem(`${key(tenant, actor)}:quote`, quoteId);
  else await AsyncStorage.removeItem(`${key(tenant, actor)}:quote`);
}
export async function readPendingLoyaltySale(
  tenant: string,
  actor: string,
): Promise<PendingLoyaltySale | null> {
  const raw = await AsyncStorage.getItem(key(tenant, actor));
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!parsed.quoteId || !parsed.clientOrderId || !parsed.tender)
    throw new Error("The pending loyalty sale needs recovery.");
  return parsed;
}
export async function savePendingLoyaltySale(
  tenant: string,
  actor: string,
  sale: PendingLoyaltySale | null,
) {
  if (sale)
    await AsyncStorage.setItem(key(tenant, actor), JSON.stringify(sale));
  else await AsyncStorage.removeItem(key(tenant, actor));
}
export class LoyaltyPosApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function callLoyaltyPos(
  path: string,
  body: Record<string, unknown>,
  method = "POST",
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Request timed out. Retry to confirm the same sale."));
    }, 15000);
  });
  try {
    const { data } = await Promise.race([supabase.auth.getSession(), deadline]);
    if (!data.session) throw new Error("Sign in to continue.");
    const response = await Promise.race([
      fetch(`${getWebAppUrl()}/api/loyalty/${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      deadline,
    ]);
    const result = await Promise.race([response.json(), deadline]);
    if (!response.ok)
      throw new LoyaltyPosApiError(
        result?.error || "The reward request failed.",
        response.status,
      );
    if (
      path === "settlements" &&
      (!result?.receipt ||
        typeof result.receipt.settlementId !== "string" ||
        !Number.isSafeInteger(result.receipt.totalCentavos) ||
        result.receipt.totalCentavos < 0)
    ) {
      throw new Error("Receipt could not be confirmed. Recover the same sale.");
    }
    if (
      path === "quotes" &&
      method === "POST" &&
      (!result?.quote ||
        typeof result.quote.quoteId !== "string" ||
        !Number.isSafeInteger(result.quote.totalCentavos) ||
        !result.quote.discount ||
        !Array.isArray(result.quote.paymentMethods))
    ) {
      throw new Error(
        "Quote could not be confirmed. Retry the same preview or cancel.",
      );
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}
/** Non-secret idempotency reference; never used as proof of a claim. */
export function newLoyaltyRequestId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const value = Math.floor(Math.random() * 16);
    return (c === "x" ? value : (value & 3) | 8).toString(16);
  });
}
