/**
 * The dish on/off switch, through the web app.
 *
 * `POST /api/inventory/dish-availability` owns the decision (contract shared
 * with the web route): switching OFF just saves; switching ON while the recipe
 * can't be made answers `needs_confirmation` with what is short, and the owner
 * picks "Record a count", "Sell anyway until <time>" (re-posted with
 * `sellAnyway: true`, which snoozes auto-86 until then — `auto_86_snoozed_until`)
 * or Cancel. The app used to write `is_available` straight to the row, which
 * re-enabled a dish the kitchen could not make and lost auto-86's reason.
 *
 * Throws an Error whose message is safe to show a merchant on every failure,
 * so the screen can roll its optimistic switch back. Never hangs.
 */

import { getAccessTokenBounded } from "./authorized-post";
import { getWebAppUrl } from "./web-app-url";
import { formatStockQuantity } from "./inventory-stock";

export const DISH_AVAILABILITY_ROUTE = "/api/inventory/dish-availability";

const DEFAULT_TIMEOUT_MS = 12_000;
const TOKEN_TIMEOUT_MS = 4_000;

export interface DishAvailabilityRequest {
  menuItemId: string;
  isAvailable: boolean;
  sellAnyway?: boolean;
}

/** One ingredient standing between the dish and the menu. */
export interface DishAvailabilityBlocker {
  name: string;
  onHand: number;
  unit: string;
  /** The `inventory_items` id, when the route sends it (lets "Record a count" go straight there). */
  inventoryItemId?: string;
}

export type DishAvailabilityResult =
  | { status: "saved"; isAvailable: boolean; snoozedUntil: string | null }
  | { status: "needs_confirmation"; blockers: DishAvailabilityBlocker[]; sellAnywayUntil: string };

export interface SetDishAvailabilityOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const CONNECTION_MESSAGE = "Couldn't reach the server. Check your connection and try again.";
const TIMEOUT_MESSAGE = "This is taking too long. Check your connection and try again.";
const UNREADABLE_MESSAGE = "The server answered in a way this app can't read. Please update the app and try again.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function parseBlocker(raw: unknown): DishAvailabilityBlocker | null {
  if (!isRecord(raw) || !isString(raw.name) || !isFiniteNumber(raw.onHand)) return null;
  const unit = isString(raw.unit) ? raw.unit : "";
  return isString(raw.inventoryItemId) && raw.inventoryItemId !== ""
    ? { name: raw.name, onHand: raw.onHand, unit, inventoryItemId: raw.inventoryItemId }
    : { name: raw.name, onHand: raw.onHand, unit };
}

/** The route's 200 body, or null when it is not one this app understands. */
export function parseDishAvailabilityResponse(body: unknown): DishAvailabilityResult | null {
  if (!isRecord(body)) return null;

  if (body.status === "saved" && typeof body.isAvailable === "boolean") {
    return {
      status: "saved",
      isAvailable: body.isAvailable,
      snoozedUntil: isString(body.snoozedUntil) ? body.snoozedUntil : null,
    };
  }

  if (body.status === "needs_confirmation" && Array.isArray(body.blockers) && isString(body.sellAnywayUntil)) {
    const blockers = body.blockers
      .map(parseBlocker)
      .filter((blocker): blocker is DishAvailabilityBlocker => blocker !== null);
    if (blockers.length === 0) return null;
    return { status: "needs_confirmation", blockers, sellAnywayUntil: body.sellAnywayUntil };
  }

  return null;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as unknown;
    if (isRecord(body) && isString(body.error) && body.error.trim() !== "") return body.error;
  } catch {
    // Not JSON — fall through to the status message.
  }
  if (response.status === 401) return "Please sign in again, then try once more.";
  if (response.status === 403) return "Your account can't change the menu for this store.";
  return `We couldn't save that (${response.status}). Please try again.`;
}

export async function setDishAvailability(
  request: DishAvailabilityRequest,
  options: SetDishAvailabilityOptions = {},
): Promise<DishAvailabilityResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = await getAccessTokenBounded(TOKEN_TIMEOUT_MS);
  if (!token) throw new Error("Please sign in again to change the menu.");

  const body: DishAvailabilityRequest = request.sellAnyway
    ? { menuItemId: request.menuItemId, isAvailable: request.isAvailable, sellAnyway: true }
    : { menuItemId: request.menuItemId, isAvailable: request.isAvailable };

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Aborted AND raced: React Native has not always turned an abort into a rejection.
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(TIMEOUT_MESSAGE));
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  });

  try {
    let response: Response;
    try {
      response = await Promise.race([
        fetchImpl(`${getWebAppUrl()}${DISH_AVAILABILITY_ROUTE}`, {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        }),
        expiry,
      ]);
    } catch (error) {
      if (error instanceof Error && error.message === TIMEOUT_MESSAGE) throw error;
      throw new Error(CONNECTION_MESSAGE);
    }

    if (!response.ok) throw new Error(await Promise.race([readError(response), expiry]));

    const parsed = parseDishAvailabilityResponse(
      await Promise.race([response.json().catch(() => null), expiry]),
    );
    if (!parsed) throw new Error(UNREADABLE_MESSAGE);
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

export interface BlockerCopy {
  title: string;
  message: string;
}

const describeAmount = (blocker: DishAvailabilityBlocker) =>
  formatStockQuantity(Math.max(0, blocker.onHand), blocker.unit);

/** The question's words: "<Ingredient> shows 0 g", and what it would mean. */
export function describeDishAvailabilityBlockers(
  dishName: string,
  blockers: readonly DishAvailabilityBlocker[],
): BlockerCopy {
  const [first, ...rest] = blockers;
  const title = first ? `${first.name} shows ${describeAmount(first)}` : "Stock shows none left";
  const others = rest.length > 0
    ? ` Also short: ${rest.map((b) => `${b.name} (${describeAmount(b)})`).join(", ")}.`
    : "";
  return {
    title,
    message: `The stock count says ${dishName} can't be made.${others} Record a count if you have more, or sell it anyway for today.`,
  };
}

/** The ingredient-list row this lookup reads (`loadIngredientIndex`). */
export interface IngredientNameRow {
  id: string;
  name: string;
  is_active: boolean;
}

const foldName = (name: string) => name.trim().toLowerCase();

/**
 * The ingredient a blocker names, when the route sent no id. Live ingredients
 * win over archived ones; two live matches are ambiguous and return null, so
 * "Record a count" opens the Stock list instead of the wrong shelf.
 */
export function findIngredientIdByName(
  index: readonly IngredientNameRow[],
  name: string,
): string | null {
  const wanted = foldName(name);
  const matches = index.filter((row) => foldName(row.name) === wanted);
  const live = matches.filter((row) => row.is_active);
  const pool = live.length > 0 ? live : matches;
  return pool.length === 1 ? pool[0].id : null;
}
