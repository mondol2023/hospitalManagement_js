import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { TabPanel, Tabs } from './Tabs';

const ITEMS = [
  { id: 'stock', label: 'Stock report' },
  { id: 'movements', label: 'Movements', count: 12 },
  { id: 'other', label: 'Other' },
];

function Harness({ initial = 'stock' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Tabs tabsId="t" label="Reports" value={value} onChange={setValue} items={ITEMS} layoutId="t" />
      <TabPanel tabsId="t" value={value}>
        panel for {value}
      </TabPanel>
    </>
  );
}

describe('Tabs', () => {
  it('renders a labelled tablist with the selected tab marked', () => {
    render(<Harness />);

    expect(screen.getByRole('tablist', { name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Stock report' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Movements/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('shows the count next to the label', () => {
    render(<Harness />);
    expect(screen.getByRole('tab', { name: /Movements/ })).toHaveTextContent('12');
  });

  it('selects a tab on click and points the panel at it', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('tab', { name: /Movements/ }));

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('panel for movements');
    expect(panel).toHaveAttribute('aria-labelledby', screen.getByRole('tab', { name: /Movements/ }).id);
  });

  it('only the selected tab is in the tab order', () => {
    render(<Harness initial="movements" />);

    expect(screen.getByRole('tab', { name: /Movements/ })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Stock report' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: 'Other' })).toHaveAttribute('tabindex', '-1');
  });

  it('arrow keys move focus and selection, wrapping at the ends', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    screen.getByRole('tab', { name: 'Stock report' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Movements/ })).toHaveFocus();
    expect(screen.getByRole('tab', { name: /Movements/ })).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Other' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Other' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Home and End jump to the first and last tab', async () => {
    const user = userEvent.setup();
    render(<Harness initial="movements" />);

    screen.getByRole('tab', { name: /Movements/ }).focus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Other' })).toHaveFocus();

    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Stock report' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Stock report' })).toHaveAttribute('aria-selected', 'true');
  });
});
