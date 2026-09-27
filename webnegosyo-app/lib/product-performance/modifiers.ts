/**
 * What options one sold line carried — its variations and add-ons — named and
 * priced as consistently as the stored data allows.
 *
 * Three writers store options three ways, and this is the one place that
 * reconciles them:
 *
 * - The register puts EVERY chosen option, add-ons included, in
 *   `variationSelections` with the price it charged (`priceAdjustment`).
 * - A web checkout writes the variation names joined into `variation`
 *   ("Large, Hot") and add-on LABELS in `addons` ("Extra Cheese ×2"), with no
 *   price for either.
 * - An edited order and a QR handoff mix the two.
 *
 * So the kind (variation vs add-on) and the group are resolved against the live
 * menu where possible, falling back to the stored group name. A price the line
 * recorded is exact; a price looked up on today's menu is an ESTIMATE and is
 * labelled as one — never silently presented as what was charged.
 */

import {
  LEGACY_ADDON_GROUP_NAME,
  LEGACY_VARIATION_GROUP_NAME,
  isSingleSelectGroup,
  type ModifierGroup,
  type ModifierOption,
} from "../modifier-groups";
import type { CatalogProduct, LineModifier, ModifierKind, SalesLine } from "./types";

/** A group whose name says "add-on" when the menu no longer can. */
const ADDON_GROUP_PATTERN = /\b(add[\s-]?ons?|extras?|toppings?|sides?)\b/i;

/** "Extra Cheese ×2", "Extra Cheese x2", "Extra Cheese × 2". */
const ADDON_QUANTITY_SUFFIX = /\s+[×x]\s?(\d+)$/i;

/** How a name is shown: menus carry stray spaces ("Plain Rice "). */
function displayName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** How two names are compared — so "Plain Rice " and "plain rice" are one option. */
export function normalizeName(value: string): string {
  return displayName(value).toLowerCase();
}

/** An add-on label as a web checkout writes it, split into name and per-unit count. */
export function splitAddonLabel(label: string): { name: string; quantity: number } {
  const trimmed = label.trim();
  const match = ADDON_QUANTITY_SUFFIX.exec(trimmed);
  if (!match) return { name: trimmed, quantity: 1 };
  const quantity = Number(match[1]);
  return {
    name: trimmed.slice(0, match.index).trim(),
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
  };
}

interface OptionHit {
  group: ModifierGroup;
  option: ModifierOption;
}

/**
 * A variation is a choice the item is sold AS; an add-on is an optional extra
 * put ON it. So a group is an add-on group only when it is optional AND allows
 * several picks. A REQUIRED pick-several group is the item's choice — an
 * eat-all-you-can store sells "Unli Pork" as a ₱0.01 item whose required group
 * carries the ₱299 — and counting that as an add-on made add-ons outsell the
 * items they were "added" to.
 */
function kindOfGroup(group: ModifierGroup): ModifierKind {
  if (isSingleSelectGroup(group) || group.min_select >= 1) return "variation";
  return "addon";
}

function optionIn(group: ModifierGroup, name: string): ModifierOption | undefined {
  const wanted = normalizeName(name);
  return group.options.find((option) => normalizeName(option.name) === wanted);
}

/**
 * Find `name` on the product's menu: in the named group when there is one, else
 * anywhere — groups of the `prefer`red kind first, since an option name can
 * exist both as a size and as an extra.
 */
function findOption(
  product: CatalogProduct | undefined,
  name: string,
  options: { groupName?: string; prefer?: ModifierKind } = {}
): OptionHit | undefined {
  if (!product) return undefined;

  if (options.groupName) {
    const wantedGroup = normalizeName(options.groupName);
    const group = product.groups.find((g) => normalizeName(g.name) === wantedGroup);
    const option = group ? optionIn(group, name) : undefined;
    if (group && option) return { group, option };
  }

  const ordered = options.prefer
    ? [
        ...product.groups.filter((g) => kindOfGroup(g) === options.prefer),
        ...product.groups.filter((g) => kindOfGroup(g) !== options.prefer),
      ]
    : product.groups;
  for (const group of ordered) {
    const option = optionIn(group, name);
    if (option) return { group, option };
  }
  return undefined;
}

function menuPrice(hit: OptionHit | undefined): Pick<LineModifier, "unitPrice" | "priceSource"> {
  if (!hit || !Number.isFinite(hit.option.price_modifier)) {
    return { unitPrice: null, priceSource: "unknown" };
  }
  return { unitPrice: hit.option.price_modifier, priceSource: "menu" };
}

function fromSelections(line: SalesLine, product: CatalogProduct | undefined): LineModifier[] {
  return (line.variationSelections ?? [])
    .filter((selection) => selection.optionName.trim() !== "")
    .map((selection) => {
      const hit =
        findOption(product, selection.optionName, { groupName: selection.typeName }) ??
        findOption(product, selection.optionName);
      const storedGroup = selection.typeName.trim();
      const kind: ModifierKind = hit
        ? kindOfGroup(hit.group)
        : ADDON_GROUP_PATTERN.test(storedGroup)
          ? "addon"
          : "variation";
      const price = Number(selection.priceAdjustment);
      return {
        kind,
        groupName: displayName(hit?.group.name ?? (storedGroup || LEGACY_VARIATION_GROUP_NAME)),
        name: displayName(hit?.option.name ?? selection.optionName),
        perUnit: 1,
        ...(Number.isFinite(price)
          ? { unitPrice: price, priceSource: "recorded" as const }
          : menuPrice(hit)),
      };
    });
}

/** The names a joined `variation` string stands for. */
function variationNames(variation: string, product: CatalogProduct | undefined): string[] {
  const whole = variation.trim();
  if (whole === "") return [];
  // An option can legitimately contain a comma ("Set B (w/ Juice, Ice Cream)").
  if (findOption(product, whole)) return [whole];
  return whole
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function fromVariationString(line: SalesLine, product: CatalogProduct | undefined): LineModifier[] {
  return variationNames(line.variation ?? "", product).map((name) => {
    const hit = findOption(product, name, { prefer: "variation" });
    return {
      kind: hit ? kindOfGroup(hit.group) : "variation",
      groupName: displayName(hit?.group.name ?? LEGACY_VARIATION_GROUP_NAME),
      name: displayName(hit?.option.name ?? name),
      perUnit: 1,
      ...menuPrice(hit),
    };
  });
}

function fromAddons(line: SalesLine, product: CatalogProduct | undefined): LineModifier[] {
  return (line.addons ?? [])
    .map((addon) => ({ addon, label: splitAddonLabel(addon.name) }))
    .filter(({ label }) => label.name !== "")
    .map(({ addon, label }) => {
      const hit = findOption(product, label.name, { prefer: "addon" });
      const stored = Number(addon.price);
      const perUnit = addon.quantity && addon.quantity > 0 ? addon.quantity : label.quantity;
      return {
        // The web writes every multi-pick group here, required ones included.
        kind: hit ? kindOfGroup(hit.group) : ("addon" as const),
        groupName: displayName(hit?.group.name ?? LEGACY_ADDON_GROUP_NAME),
        name: displayName(hit?.option.name ?? label.name),
        perUnit,
        // A stored zero is not evidence of a free add-on: web orders relayed to
        // Convex store every add-on at 0. Only a positive stored price is exact.
        ...(Number.isFinite(stored) && stored > 0
          ? { unitPrice: stored, priceSource: "recorded" as const }
          : menuPrice(hit)),
      };
    });
}

/**
 * Every option `line` carried, variations first.
 *
 * When the line has structured selections its joined `variation` string is a
 * copy of them (an edited order writes both), so the string is read only when
 * there are no selections — otherwise each variation would count twice.
 */
export function parseLineModifiers(
  line: SalesLine,
  product: CatalogProduct | undefined
): LineModifier[] {
  const hasSelections = (line.variationSelections?.length ?? 0) > 0;
  const chosen = hasSelections ? fromSelections(line, product) : fromVariationString(line, product);
  const variations = chosen.filter((modifier) => modifier.kind === "variation");
  const addonsFromSelections = chosen.filter((modifier) => modifier.kind === "addon");
  // The two fields are complementary on every writer today; an option already
  // read from the selections is still skipped here so a mixed line can never
  // count one add-on twice.
  const seen = new Set(chosen.map((modifier) => normalizeName(modifier.name)));
  const fromAddonColumn = fromAddons(line, product).filter(
    (modifier) => !seen.has(normalizeName(modifier.name))
  );
  return [...variations, ...addonsFromSelections, ...fromAddonColumn];
}
