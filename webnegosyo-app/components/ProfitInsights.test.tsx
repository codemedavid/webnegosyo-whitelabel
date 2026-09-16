import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ProfitInsights } from './ProfitInsights';

it('renders concentration and velocity using only the supplied branch rows', () => {
  render(<ProfitInsights rows={[{
    menuItemId: 'coffee', menuItemName: 'North coffee', totalUnitsSold: 10,
    totalRevenue: 1000, totalCost: 400, totalProfit: 600, marginPercent: 60, avgDailyUnits: 2,
  }]} />);
  expect(screen.getByText('Revenue concentration')).toBeTruthy();
  expect(screen.getByText('Fast movers')).toBeTruthy();
  expect(screen.getByText('2/day')).toBeTruthy();
  expect(screen.getByText('100%')).toBeTruthy();
  expect(screen.getAllByText('North coffee')).toHaveLength(3);
});

it('asks for cost data rather than reporting uncosted revenue as profit', () => {
  render(<ProfitInsights rows={[{
    menuItemId: 'coffee', menuItemName: 'Coffee', totalUnitsSold: 10,
    totalRevenue: 1000, avgDailyUnits: 2,
  }]} />);
  expect(screen.getByText(/Add cost prices to your items/)).toBeTruthy();
});
