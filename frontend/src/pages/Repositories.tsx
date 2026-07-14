import { Table, TableHead, TableRow, TableCell } from '@/components/ui/Table'
import { StatusBadge, Badge } from '@/components/ui/Badge'
import type { Vendor } from '@/types/api'

export function VendorsTable({ vendors }: { vendors: Vendor[] }) {
  return (
    <Table>
      <TableHead columns={['Vendor', 'Category', 'Data collected', 'Legal coverage', 'Status']} />
      <tbody>
        {vendors.map((vendor) => (
          <TableRow key={vendor.id}>
            <TableCell>
              <span className="font-semibold">{vendor.name}</span>
            </TableCell>
            <TableCell>{vendor.category}</TableCell>
            <TableCell>{vendor.data_collected}</TableCell>
            <TableCell>
              <StatusBadge status={vendor.coverage_status}>{vendor.coverage_detail}</StatusBadge>
            </TableCell>
            <TableCell>
              <Badge tone={vendor.connection_active ? 'muted' : 'gap'}>
                {vendor.connection_active ? 'Active' : 'Disconnected'}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </tbody>
    </Table>
  )
}