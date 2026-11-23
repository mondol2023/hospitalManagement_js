import { useSearchParams } from 'react-router-dom';

import { PageHeader, TabPanel, Tabs, type TabItem } from '@/shared/ui';

import { parseTab, type ReportTab } from '../model/report-params';
import { MovementsTab } from './MovementsTab';
import { StockReportTab } from './StockReportTab';

const TABS: readonly TabItem[] = [
  { id: 'stock', label: 'Stock report' },
  { id: 'movements', label: 'Movements' },
];

const TABS_ID = 'pharmacy-reports';

/**
 * Admin and manager only (the route guard and the API both say so). The
 * selected tab lives in the URL, so a link from the stock report opens the
 * movements tab already filtered.
 */
export function PharmacyReportsPage() {
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get('tab'));

  // Each tab owns its own query params, so switching starts the other one clean.
  function chooseTab(next: string) {
    setParams(next === 'stock' ? {} : { tab: next as ReportTab });
  }

  return (
    <div>
      <PageHeader
        title="Pharmacy reports"
        description="Stock that needs attention, and every change to it."
      >
        <Tabs
          tabsId={TABS_ID}
          label="Pharmacy reports"
          value={tab}
          onChange={chooseTab}
          items={TABS}
          layoutId="pharmacy-reports-tab"
        />
      </PageHeader>

      <TabPanel tabsId={TABS_ID} value={tab}>
        {tab === 'stock' ? <StockReportTab /> : <MovementsTab />}
      </TabPanel>
    </div>
  );
}
