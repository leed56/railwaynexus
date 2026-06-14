const EMPLOYMENT_TYPES = new Set(['full_time', 'part_time', 'contract', 'intern'])
const STATUSES = new Set(['active', 'on_leave', 'terminated'])

export interface ApiEmployeeCreateInput {
  first_name: string
  last_name: string
  employment_type: string
  basic_salary: number
  department_id?: string | null
  employee_number?: string | null
  email?: string | null
  phone?: string | null
  job_title?: string | null
  status?: string
  hire_date?: string | null
  epf_no?: string | null
  annual_leave_balance?: number
  medical_leave_balance?: number
  casual_leave_balance?: number
}

export function validateEmployeeCreate(body: Record<string, unknown>): string | null {
  const firstName = String(body.first_name ?? '').trim()
  const lastName = String(body.last_name ?? '').trim()
  if (!firstName || !lastName) return 'first_name and last_name are required'

  const employmentType = String(body.employment_type ?? 'full_time')
  if (!EMPLOYMENT_TYPES.has(employmentType)) {
    return 'employment_type must be full_time, part_time, contract, or intern'
  }

  const salary = Number(body.basic_salary ?? 0)
  if (!Number.isFinite(salary) || salary < 0) return 'basic_salary must be >= 0'

  const status = body.status != null ? String(body.status) : 'active'
  if (!STATUSES.has(status)) return 'status must be active, on_leave, or terminated'

  return null
}

export function parseEmployeeCreate(body: Record<string, unknown>): ApiEmployeeCreateInput {
  return {
    first_name: String(body.first_name).trim(),
    last_name: String(body.last_name).trim(),
    employment_type: String(body.employment_type ?? 'full_time'),
    basic_salary: Number(body.basic_salary ?? 0),
    department_id: body.department_id != null ? String(body.department_id) : null,
    employee_number: body.employee_number != null ? String(body.employee_number) : null,
    email: body.email != null ? String(body.email) : null,
    phone: body.phone != null ? String(body.phone) : null,
    job_title: body.job_title != null ? String(body.job_title) : null,
    status: body.status != null ? String(body.status) : 'active',
    hire_date: body.hire_date != null ? String(body.hire_date) : null,
    epf_no: body.epf_no != null ? String(body.epf_no) : null,
    annual_leave_balance: body.annual_leave_balance != null ? Number(body.annual_leave_balance) : 14,
    medical_leave_balance: body.medical_leave_balance != null ? Number(body.medical_leave_balance) : 7,
    casual_leave_balance: body.casual_leave_balance != null ? Number(body.casual_leave_balance) : 7,
  }
}

export function validateEmployeePatch(body: Record<string, unknown>): string | null {
  if (body.status != null && !STATUSES.has(String(body.status))) {
    return 'status must be active, on_leave, or terminated'
  }
  if (body.employment_type != null && !EMPLOYMENT_TYPES.has(String(body.employment_type))) {
    return 'employment_type must be full_time, part_time, contract, or intern'
  }
  if (body.basic_salary != null) {
    const salary = Number(body.basic_salary)
    if (!Number.isFinite(salary) || salary < 0) return 'basic_salary must be >= 0'
  }
  return null
}

export const EMPLOYEE_PATCH_KEYS = [
  'department_id', 'employee_number', 'first_name', 'last_name', 'email', 'phone',
  'job_title', 'employment_type', 'status', 'hire_date', 'basic_salary', 'epf_no',
  'annual_leave_balance', 'medical_leave_balance', 'casual_leave_balance',
] as const
