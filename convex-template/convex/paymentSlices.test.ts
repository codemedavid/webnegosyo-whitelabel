import { orderMethodSlices } from './paymentSlices';

describe('orderMethodSlices', () => {
  it('reads an order with no ledger as paid wholly by its own method', () => {
    expect(orderMethodSlices({ total: 300, paymentMethod: 'Cash' })).toEqual([{ method: 'Cash', amount: 300 }]);
  });

  it('splits a bill paid ₱120 by GCash and the rest in cash', () => {
    expect(orderMethodSlices({ total: 300, paymentMethod: 'Cash' }, [
      { kind: 'charge', amount: 120, paymentMethodName: 'GCash' },
      { kind: 'charge', amount: 180, paymentMethodName: 'Cash' },
    ])).toEqual([{ method: 'GCash', amount: 120 }, { method: 'Cash', amount: 180 }]);
  });

  it('leaves the unpaid part under the order method and nets refunds', () => {
    expect(orderMethodSlices({ total: 300, paymentMethod: 'Cash' }, [
      { kind: 'charge', amount: 150, paymentMethodName: 'GCash' },
      { kind: 'refund', amount: 30, paymentMethodName: 'GCash' },
    ])).toEqual([{ method: 'GCash', amount: 120 }, { method: 'Cash', amount: 180 }]);
  });

  it('scales an over-collected ledger down to the total', () => {
    expect(orderMethodSlices({ total: 200 }, [
      { kind: 'charge', amount: 150, paymentMethodName: 'GCash' },
      { kind: 'charge', amount: 150, paymentMethodName: 'Cash' },
    ])).toEqual([{ method: 'GCash', amount: 100 }, { method: 'Cash', amount: 100 }]);
  });
});
