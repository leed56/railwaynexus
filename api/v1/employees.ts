import type { IncomingMessage, ServerResponse } from 'node:http'
import { supabaseAdmin } from '../../inngest/supabaseAdmin'
import { authenticateApiRequest, logApiRequest } from '../../lib/tenantApi/auth'
import { readJsonBody, sendJson } from '../../lib/tenantApi/http'
import { parseListLimit } from '../../lib/tenantApi/listQuery'
import { parseEmployeeCreate, validateEmployeeCreate } from '../../lib/tenantApi/employeeApi'

const EMPLOYEE_FIELDS = [
  'id', 'company_id', 'department_id', 'employee_number', 'first_name', 'last_name',
  'email', 'phone', 'job_title', 'employment_type', 'status', 'hire_date',
  'basic_salary', 'epf_no', 'annual_leave_balance', 'medical_leave_balance', 'casual_leave_balance',
  'created_at', 'updated_at',
  'departments(name)',
].join(', ')

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  const started = Date.now()
  const method = req.method ?? 'GET'
  const path = new URL(req.url ?? '/', 'http://localhost').pathname

  if (method !== 'GET' && method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const auth = await authenticateApiRequest(
    req,
    method === 'GET' ? 'employees:read' : 'employees:write',
  )
  if (!auth.ok) {
    sendJson(res, auth.status, { error: auth.error })
    return
  }

  const { ctx } = auth
  const url = new URL(req.url ?? '/', 'http://localhost')

  try {
    if (method === 'GET') {
      const status = url.searchParams.get('status')
      const limit = parseListLimit(url)

      let query = supabaseAdmin
        .from('employees')
        .select(EMPLOYEE_FIELDS)
        .eq('company_id', ctx.companyId)
        .is('deleted_at', null)
        .order('last_name')
        .limit(limit)

      if (status) query = query.eq('status', status)

      const { data, error } = await query
      if (error) throw error

      sendJson(res, 200, { data: data ?? [] })
      await logApiRequest(ctx, req, path, 200, started)
      return
    }

    const body = await readJsonBody(req)
    const validationError = validateEmployeeCreate(body)
    if (validationError) {
      sendJson(res, 400, { error: validationError })
      await logApiRequest(ctx, req, path, 400, started)
      return
    }

    const input = parseEmployeeCreate(body)

    if (input.department_id) {
      const { data: dept, error: deptErr } = await supabaseAdmin
        .from('departments')
        .select('id')
        .eq('id', input.department_id)
        .eq('company_id', ctx.companyId)
        .is('deleted_at', null)
        .maybeSingle()

      if (deptErr) throw deptErr
      if (!dept) {
        sendJson(res, 400, { error: 'department_id not found for this company' })
        await logApiRequest(ctx, req, path, 400, started)
        return
      }
    }

    const { data, error } = await supabaseAdmin
      .from('employees')
      .insert({
        company_id:            ctx.companyId,
        first_name:            input.first_name,
        last_name:             input.last_name,
        employment_type:       input.employment_type,
        basic_salary:          input.basic_salary,
        department_id:         input.department_id,
        employee_number:       input.employee_number,
        email:                 input.email,
        phone:                 input.phone,
        job_title:             input.job_title,
        status:                input.status ?? 'active',
        hire_date:             input.hire_date,
        epf_no:                input.epf_no,
        annual_leave_balance:  input.annual_leave_balance,
        medical_leave_balance: input.medical_leave_balance,
        casual_leave_balance:  input.casual_leave_balance,
      })
      .select(EMPLOYEE_FIELDS)
      .single()

    if (error) throw error

    sendJson(res, 201, { data })
    await logApiRequest(ctx, req, path, 201, started)
  } catch (e) {
    sendJson(res, 500, { error: e instanceof Error ? e.message : 'Internal server error' })
    await logApiRequest(ctx, req, path, 500, started)
  }
}
