
export interface Shift {
  id: string;
  name: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  allowedLateMinutes: number;
  hourlyRate: number;
}

export type AttendanceStatus = 'pending' | 'approved' | 'rejected';

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  date: string; // YYYY-MM-DD
  checkInTime: number; // timestamp
  checkOutTime?: number; // timestamp
  status: AttendanceStatus;
  ipAddress: string;
  workHours?: number;
  note?: string; // Explanation for late checkouts or issues
  shiftId?: string;
}

export interface Settings {
  companyName: string;
  companyLogo: string; // Base64 string or URL
  officeIp: string;
  allowedCheckInStart: string; // HH:mm - System open time
  allowedCheckInEnd: string;   // HH:mm - System close time
}

export type UserRole = 'admin' | 'manager' | 'staff';

// Defined permission keys
export type PermissionKey = 
  | 'view_dashboard'
  | 'manage_users'
  | 'manage_shifts_config' // CRUD Shifts (Create/Read/Update/Delete)
  | 'approve_shift_reg'    // Approve Registrations only
  | 'view_reports'
  | 'view_salary' // Can view salary details in reports/shifts
  | 'approve_attendance'
  | 'manage_settings'
  | 'manage_rules';

export interface User {
  id: string;
  code?: string; // Employee ID (Mã NV)
  name: string;
  email: string;
  password?: string; // In real app, this should be hashed. Mocking plain for demo.
  role: UserRole;
  permissions: PermissionKey[];
  phone?: string;
  bankAccount?: string;
  firstLogin: boolean;
  baseHourlyRate?: number; // For display in Employee list
  department?: string; // New field: Bộ phận
  avatar?: string; // Base64 string of avatar
}

export interface SalaryAdjustment {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  amount: number;
  type: 'bonus' | 'fine';
  reason: string;
}

export interface ShiftRegistration {
  id: string;
  userId: string;
  userName: string;
  shiftId: string;
  shiftName: string;
  date: string; // YYYY-MM-DD
  status: 'pending' | 'approved' | 'rejected';
}

export interface UserSession {
  user: User;
}
