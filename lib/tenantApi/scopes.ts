export const API_SCOPES = [
  { id: 'contacts:read', label: 'Contacts — read' },
  { id: 'contacts:write', label: 'Contacts — write' },
  { id: 'invoices:read', label: 'Invoices — read' },
  { id: 'invoices:write', label: 'Invoices — write' },
  { id: 'bills:read', label: 'Bills — read' },
  { id: 'bills:write', label: 'Bills — write' },
  { id: 'employees:read', label: 'Employees — read' },
  { id: 'employees:write', label: 'Employees — write' },
  { id: 'inventory:read', label: 'Inventory — read' },
  { id: 'inventory:write', label: 'Inventory — write' },
] as const

export type ApiScope = (typeof API_SCOPES)[number]['id']

export function hasScope(scopes: string[], required: ApiScope): boolean {
  return scopes.includes(required)
}
