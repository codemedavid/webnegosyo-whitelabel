/**
 * The export catalogue's contract (plan 2026-11-14 §4): every sheet is
 * complete, and no stored id ever changes. Saved formats and Owl specs hold
 * sheet and column ids, so a rename breaks a merchant's saved report.
 */
import {
  EXPORT_SHEETS,
  SHEET_GROUPS,
  SHEET_IDS,
  sheetRefusal,
  visibleColumns,
} from "@/lib/exports/catalogue";
import { tabName } from "@/lib/exports/build/workbook";
import { PAGE_SIZE } from "@/lib/exports/read/detail-read";
import { REPORT_SECTIONS } from "@/lib/reports/api/query-schema";
import { STAFF_PERMISSION_KEYS } from "@/lib/staff-permissions";
import { PLATFORM_MAX_ROWS } from "../../fixtures/fake-supabase-tables";
import { access } from "./export-fixtures";

describe("export catalogue", () => {
  it.each(SHEET_IDS)("%s is a complete entry", (id) => {
    const sheet = EXPORT_SHEETS[id];
    expect(sheet.id).toBe(id);
    expect(SHEET_GROUPS).toContain(sheet.group);
    expect(sheet.rowIs.length).toBeGreaterThan(10);
    // Excel's own rules for a tab name.
    expect(sheet.name).toBe(tabName(sheet.name));
    expect(sheet.columns.length).toBeGreaterThan(1);
    expect(new Set(sheet.columns.map((column) => column.id)).size).toBe(
      sheet.columns.length,
    );
    expect(new Set(sheet.columns.map((column) => column.header)).size).toBe(
      sheet.columns.length,
    );
    for (const key of [
      ...sheet.needs,
      ...sheet.columns.flatMap((column) =>
        column.needs ? [column.needs] : [],
      ),
    ]) {
      expect(STAFF_PERMISSION_KEYS).toContain(key);
    }
    // The Export page lives under Reports, so every sheet needs at least that.
    expect(sheet.needs).toContain("reports");
    if (sheet.source === "summary") {
      expect(sheet.sections.length).toBeGreaterThan(0);
      for (const section of sheet.sections)
        expect(REPORT_SECTIONS).toContain(section);
    } else {
      expect(sheet.sections).toEqual([]);
    }
  });

  it("gives every sheet its own tab name", () => {
    const names = SHEET_IDS.map((id) => EXPORT_SHEETS[id].name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("never renames a stored sheet or column id", () => {
    expect(
      Object.fromEntries(
        SHEET_IDS.map((id) => [
          id,
          EXPORT_SHEETS[id].columns.map((column) => column.id).join(" "),
        ]),
      ),
    ).toMatchInlineSnapshot(`
     {
       "activity": "date time branch category what details who approved_by amount quantity unit order_no reason note needs_look reviewed_by",
       "branches": "name orders quantity gross discounts net share",
       "cancelled": "order_no business_day date time branch order_type channel cashier customer items total refunded cancel_reason order_id",
       "cash_moves": "date time branch kind amount reason recorded_by taken_by to_safe shift_id",
       "categories": "name orders quantity gross discounts net share",
       "channels": "name orders quantity gross discounts net share",
       "customers": "customer contact kind orders net aov first_order last_order lifetime_orders",
       "day_closes": "business_day branch version status closed_by closed_at orders net discounts expected counted difference handed_over received cash_to_account deposit deposit_to deposit_ref forced_shifts open_remittances note reopened_by reopened_at reopen_reason",
       "discounts": "order_no business_day date time branch cashier kind detail amount gross order_id",
       "expenses": "date branch category pl_line paid_to tin doc_type invoice_no gross vatable input_vat ewt net_paid paid_from status void_reason recorded_by notes",
       "items": "name category quantity orders gross discounts net avg_price share",
       "order_lines": "order_no business_day date time status item category choices addons combo quantity unit_price line_total discounts net notes order_id",
       "order_types": "name orders quantity gross discounts net share",
       "orders": "order_no business_day date time branch order_type channel status cashier shift table customer contact items gross discounts net service delivery total collected unpaid payment_method payment_status cancel_reason order_id",
       "payments_by_method": "name orders collected share",
       "payments_received": "order_no date time kind method amount reference recorded_by note order_id",
       "profit": "line value share note",
       "remittances": "business_day date time branch kind cashier handed_over given_to status received difference received_by received_at how receiver_note dispute_reason resolved_by resolved_note shift_id",
       "sales_by_cashier": "cashier orders gross discounts net aov collected unpaid cancelled share",
       "sales_by_day": "day weekday orders gross discounts net aov collected",
       "shifts": "business_day branch cashier drawer opened closed hours close_kind expected first_count final_count difference remittance shift_id",
       "stock_movements": "date time branch ingredient reason change unit balance unit_cost value note order_id",
       "stock_on_hand": "ingredient category quantity unit reorder_level state unit_cost value last_counted",
       "stock_usage": "day ingredient unit opening received used wasted transferred count_change missing closing counted used_cost wasted_cost missing_cost",
       "summary": "line value note",
     }
    `);
  });

  it("leaves a column out for a caller without its key, instead of blanking it", () => {
    const orders = EXPORT_SHEETS.orders;
    const withCustomers = visibleColumns(
      orders,
      access("reports", "customers"),
    ).map((column) => column.id);
    const without = visibleColumns(orders, access("reports")).map(
      (column) => column.id,
    );
    expect(withCustomers).toEqual(
      expect.arrayContaining(["customer", "contact"]),
    );
    expect(without).not.toContain("customer");
    expect(without).not.toContain("contact");
    expect(without.length).toBe(withCustomers.length - 2);
  });

  it("refuses a sheet whose keys the caller lacks, and the branches sheet on a one-branch store", () => {
    expect(
      sheetRefusal(EXPORT_SHEETS.customers, {
        ...access("reports"),
        isMultiBranch: false,
      }),
    ).toBe("no_permission");
    expect(
      sheetRefusal(EXPORT_SHEETS.customers, {
        ...access("reports", "customers"),
        isMultiBranch: false,
      }),
    ).toBeNull();
    expect(
      sheetRefusal(EXPORT_SHEETS.branches, {
        ...access("reports"),
        isMultiBranch: false,
      }),
    ).toBe("single_branch");
    expect(
      sheetRefusal(EXPORT_SHEETS.branches, {
        ...access("reports"),
        isMultiBranch: true,
      }),
    ).toBeNull();
  });

  it('pages at exactly the platform row cap (a short page means "the end")', () => {
    expect(PAGE_SIZE).toBe(PLATFORM_MAX_ROWS);
  });
});
