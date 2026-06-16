import { Link } from 'react-router-dom';
import { PageHeader, Card } from '../../components/ui';

export default function CollectionsPage() {
  return (
    <div>
      <PageHeader
        title="Collections"
        subtitle="Monitor incoming payment collections and success rates"
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Finance' }, { label: 'Collections' }]}
      />

      <Card
        title="Collections Hub"
        subtitle="Use the transaction ledger for detailed transaction-level filtering"
        actions={<Link to="/admin/finance/ledger" className="text-xs text-cyan-600 hover:text-cyan-700 font-medium">Open ledger →</Link>}
      >
        <div className="rounded-xl border border-cyan-100 bg-cyan-50/70 p-4 text-sm text-cyan-800">
          This section is ready for collection analytics (provider/channel/date performance). For now, detailed records live in Transaction Ledger.
        </div>
      </Card>
    </div>
  );
}
