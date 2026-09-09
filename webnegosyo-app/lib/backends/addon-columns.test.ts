import { toAddonColumn } from "./addon-columns";

describe("toAddonColumn", () => {
  /**
   * `order_items.addons` on the platform database is `text[] NOT NULL`. The
   * register used to write `null` for a line without addons, so the order row
   * landed and the items insert was refused — a sale with no line items.
   */
  it("returns an empty array, never null, for a line without addons", () => {
    expect(toAddonColumn(undefined)).toEqual([]);
    expect(toAddonColumn(null)).toEqual([]);
    expect(toAddonColumn([])).toEqual([]);
  });

  it("flattens addon objects to their names, matching what web checkout writes", () => {
    // Arrange
    const addons = [
      { name: "Extra shot", price: 20 },
      { name: "Oat milk", price: 30, quantity: 2 },
    ];

    // Act
    const column = toAddonColumn(addons);

    // Assert
    expect(column).toEqual(["Extra shot", "Oat milk"]);
  });

  it("drops blank names so the column never carries an empty string", () => {
    expect(toAddonColumn([{ name: "  ", price: 5 }, { name: " Cheese ", price: 5 }])).toEqual([
      "Cheese",
    ]);
  });
});
