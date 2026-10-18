import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateVehicle, looksVehicleRelated, vehicleTotals } from '../src/core/vehicles.js';
import { validatePurchase } from '../src/core/purchases.js';

test('vehicle validation', () => {
  const r = validateVehicle({ id: 'v1', name: '  Swift ', type: 'car' }, null, 5);
  assert.equal(r.ok, true);
  assert.deepEqual(r.vehicle, { name: 'Swift', type: 'car', notes: '', status: 'active', id: 'v1', createdAt: 5, updatedAt: 5 });
  assert.equal(validateVehicle({ name: '' }).ok, false);
  assert.equal(validateVehicle({ name: 'Bike', type: 'rocket' }).vehicle.type, 'car');
  assert.equal(validateVehicle({ name: 'Activa', notes: 'card 4111 1111 1111 1111' }).ok, false);
});

test('vehicle-related detection', () => {
  for (const m of ['HP Petrol Pump', 'Sparkle Car Wash', 'Bike wash', 'Car Care Centre', 'Maruti Service', 'Tata AIG insurance', 'Ravi Garage', 'MRF Tyres', 'FASTag recharge', 'Bosch car maintenance', 'Wash'])
    assert.equal(looksVehicleRelated({ merchant: m }), true, m);
  for (const m of ['Croma', 'Swiggy', 'Tiffin', 'Carnival Cinemas', 'Bikanervala', 'Washington Bakery'])
    assert.equal(looksVehicleRelated({ merchant: m }), false, m);
  assert.equal(looksVehicleRelated({ merchant: 'Shell', category: 'fuel' }), true);
  assert.equal(looksVehicleRelated({ merchant: 'Ramesh', notes: 'bike puncture' }), true);
});

test('purchases keep the vehicle; totals per vehicle', () => {
  const base = { date: '2026-10-09', merchant: 'Shell', category: 'fuel', amountPaise: 200000, cardId: 'c1' };
  assert.equal(validatePurchase({ ...base, vehicleId: 'v1' }).purchase.vehicleId, 'v1');
  assert.equal(validatePurchase({ ...base }).purchase.vehicleId, null);
  const ps = [
    { ...base, vehicleId: 'v1', status: 'completed' },
    { ...base, merchant: 'Car wash', category: 'other', amountPaise: 30000, vehicleId: 'v1', status: 'completed' },
    { ...base, vehicleId: 'v2', status: 'cancelled' },
    { ...base, date: '2026-09-30', vehicleId: 'v1', status: 'completed' },
    { ...base, status: 'completed' },
  ];
  assert.deepEqual(vehicleTotals(ps, '2026-10-01', '2026-10-31'), { v1: { paise: 230000, count: 2, fuelPaise: 200000 } });
});
