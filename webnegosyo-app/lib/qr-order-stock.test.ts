import { qrOrderStockItems } from './qr-order-stock';

it('carries repeated web extras into the scanner stock notification', () => {
  const items = [{ menuItemId: 'burger', quantity: 2 }];
  expect(qrOrderStockItems(items, { _inventory_selections: { version: 1, items: [{ menuItemId: 'burger', quantity: 2, optionIds: [], addonIds: ['cheese'], addonQuantities: { cheese: 3 } }] } })).toEqual([
    { menuItemId: 'burger', quantity: 2, optionIds: [], addonIds: ['cheese'], addonQuantities: { cheese: 3 } },
  ]);
});

it('does not apply metadata that does not match the accepted cart', () => {
  expect(qrOrderStockItems([{ menuItemId: 'burger', quantity: 2 }], { _inventory_selections: { version: 1, items: [{ menuItemId: 'other', quantity: 2 }] } })).toEqual([{ menuItemId: 'burger', quantity: 2, optionIds: [], addonIds: [] }]);
});
