import { describe, it, expect } from 'vitest'
import { validateEmployeeCreate, parseEmployeeCreate } from './employeeApi'

describe('employeeApi', () => {
  it('requires names', () => {
    expect(validateEmployeeCreate({ employment_type: 'full_time', basic_salary: 0 })).toBe(
      'first_name and last_name are required',
    )
  })

  it('parses create payload', () => {
    const input = parseEmployeeCreate({
      first_name: 'Kamal',
      last_name: 'Perera',
      employment_type: 'full_time',
      basic_salary: 120000,
    })
    expect(input.first_name).toBe('Kamal')
    expect(input.status).toBe('active')
    expect(input.annual_leave_balance).toBe(14)
  })
})
