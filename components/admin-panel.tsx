import React, { useState, useEffect, useRef } from 'react';
import { db, getRolePermissions, DEFAULT_SETTINGS } from '../database';
import { fetchPublicIp } from '../geo';
import { Settings, Shift, AttendanceRecord, User, UserRole, PermissionKey, ShiftRegistration, SalaryAdjustment } from '../types';
import { 
  ArrowDownTrayIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  HomeIcon, 
  Cog6ToothIcon, 
  ClockIcon, 
  ClipboardDocumentCheckIcon, 
  UserGroupIcon, 
  BriefcaseIcon, 
  ChartBarIcon, 
  SignalIcon, 
  ExclamationTriangleIcon, 
  LightBulbIcon, 
  PencilSquareIcon, 
  PhotoIcon, 
  ArrowUpTrayIcon, 
  WifiIcon, 
  FunnelIcon, 
  HandThumbUpIcon, 
  BanknotesIcon, 
  CurrencyDollarIcon, 
  GiftIcon, 
  BookOpenIcon, 
  BuildingOfficeIcon, 
  PlusIcon, 
  ShieldCheckIcon, 
  ComputerDesktopIcon, 
  CalendarDaysIcon, 
  TrashIcon, 
  BellAlertIcon, 
  UserCircleIcon, 
  CameraIcon,
  TableCellsIcon 
} from '@heroicons/react/24/solid';

declare global {
    interface Window {
        XLSX: any;
    }
}

interface AdminPanelProps {
    currentUser: User;
}

interface ToastState {
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
}

const ALL_PERMISSIONS: { key: PermissionKey; label: string }[] = [
    { key: 'view_dashboard', label: 'Xem Tổng Quan' },
    { key: 'manage_users', label: 'Quản lý Nhân sự' },
    { key: 'manage_shifts_config', label: 'Cấu hình Ca (Thêm/Sửa/Xóa)' },
    { key: 'view_reports', label: 'Xem Báo cáo Chấm công' },
    { key: 'view_salary', label: 'Xem Báo cáo Lương' },
    { key: 'manage_settings', label: 'Quản lý Cấu hình Chung' },
    { key: 'manage_rules', label: 'Quản lý Nội Quy' },
];

const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  
  // Data States (initialized with defaults)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [adjustments, setAdjustments] = useState<SalaryAdjustment[]>([]);
  const [registrations, setRegistrations] = useState<ShiftRegistration[]>([]);
  const [rulesContent, setRulesContent] = useState<string>('');
  const [departments, setDepartments] = useState<string[]>([]);
  
  const [isLoadingData, setIsLoadingData] = useState(false);

  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [currentAdminIp, setCurrentAdminIp] = useState<string>('Đang tải...');

  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });
  const toastTimerRef = useRef<number | null>(null);

  const [deleteConfirmation, setDeleteConfirmation] = useState<{ 
      show: boolean, 
      id: string, 
      type: 'user' | 'shift' | 'registration', 
      title: string, 
      message: string 
  }>({ 
      show: false, 
      id: '', 
      type: 'user', 
      title: '', 
      message: '' 
  });

  const [isEditingUser, setIsEditingUser] = useState<User | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [userForm, setUserForm] = useState<Partial<User>>({ 
      name: '', email: '', password: '', role: 'staff', firstLogin: true, permissions: [], code: '', baseHourlyRate: 20000, department: '', bankAccount: '', avatar: '' 
  });
  
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');

  const [isEditingRules, setIsEditingRules] = useState(false);
  const [tempRulesContent, setTempRulesContent] = useState('');

  const [isBonusModalOpen, setIsBonusModalOpen] = useState(false);
  const [selectedUserForBonus, setSelectedUserForBonus] = useState<string>('');
  const [bonusForm, setBonusForm] = useState({ amount: 0, type: 'bonus' as 'bonus' | 'fine', reason: '' });

  const todayStr = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const lastDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];
  const [reportStartDate, setReportStartDate] = useState(firstDayOfMonth);
  const [reportEndDate, setReportEndDate] = useState(todayStr);
  const [reportUserFilter, setReportUserFilter] = useState<string>('all');

  // State riêng cho module Lịch Làm Việc (Work Schedule) - Mặc định là Hôm nay
  const [workScheduleStart, setWorkScheduleStart] = useState<string>(todayStr);
  const [workScheduleEnd, setWorkScheduleEnd] = useState<string>(todayStr);

  const [isShiftAssignmentModalOpen, setIsShiftAssignmentModalOpen] = useState(false);
  const [shiftAssignmentForm, setShiftAssignmentForm] = useState<{id?: string, userId: string, shiftIds: string[], date: string}>({ userId: '', shiftIds: [], date: '' });


  const hasPermission = (key: PermissionKey) => currentUser.permissions.includes(key);

  // REAL-TIME LISTENERS SETUP
  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    fetchPublicIp().then(ip => setCurrentAdminIp(ip));

    // Đăng ký các Listener
    const unsubAttendance = db.subscribeAttendance(setAttendance);
    const unsubUsers = db.subscribeUsers(setUsers);
    const unsubShifts = db.subscribeShifts(setShifts);
    const unsubRegs = db.subscribeRegistrations(setRegistrations);
    const unsubSettings = db.subscribeSettings(setSettings);

    // Một số dữ liệu ít thay đổi vẫn lấy 1 lần hoặc lấy thủ công khi cần
    db.getRulesContent().then(setRulesContent);
    db.getDepartments().then(setDepartments);
    db.getAdjustments().then(setAdjustments);

    return () => {
      clearInterval(timer);
      unsubAttendance();
      unsubUsers();
      unsubShifts();
      unsubRegs();
      unsubSettings();
    };
  }, []);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast({ show: true, message, type });
      toastTimerRef.current = window.setTimeout(() => {
          setToast(prev => ({ ...prev, show: false }));
      }, 3000);
  };

  const handleSetCurrentIp = () => {
    setSettings(prev => ({ ...prev, officeIp: currentAdminIp }));
    showToast('Đã cập nhật IP văn phòng thành công!');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              setSettings({ ...settings, companyLogo: reader.result as string });
          };
          reader.readAsDataURL(file);
      }
  };

  const resizeImage = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = (event) => {
              const img = new Image();
              img.src = event.target?.result as string;
              img.onload = () => {
                  const canvas = document.createElement('canvas');
                  const MAX_WIDTH = 300;
                  const scaleSize = MAX_WIDTH / img.width;
                  canvas.width = MAX_WIDTH;
                  canvas.height = img.height * scaleSize;
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                  } else {
                    reject(new Error("Canvas context is null"));
                  }
              };
              img.onerror = () => reject(new Error("Failed to load image"));
          };
          reader.onerror = (error) => reject(error);
      });
  };

  const handleUserAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          try {
              const base64Avatar = await resizeImage(file);
              setUserForm({ ...userForm, avatar: base64Avatar });
          } catch (error) {
              console.error("Avatar resize error:", error);
              showToast("Lỗi khi tải ảnh lên.", 'error');
          }
      }
  };

  const handleSaveSettings = async () => {
    await db.saveSettings(settings);
    await db.saveShifts(shifts);
    showToast('Đã lưu cấu hình thành công!');
  };

  const handleSaveShiftsConfig = async () => {
      await db.saveShifts(shifts);
      showToast('Đã lưu cấu hình ca làm việc!');
  };

  const handleAddShift = async () => {
    const newShift: Shift = {
      id: Date.now().toString(),
      name: 'Ca Mới',
      startTime: '08:00',
      endTime: '17:00',
      allowedLateMinutes: 15,
      hourlyRate: 20000
    };
    const updated = [...shifts, newShift];
    setShifts(updated);
    await db.saveShifts(updated);
    showToast('Đã thêm ca làm việc mới');
  };

  const updateShift = async (id: string, field: keyof Shift, value: any) => {
    const updated = shifts.map(s => s.id === id ? { ...s, [field]: value } : s);
    setShifts(updated);
  };

  const handleDeleteShiftRequest = (id: string, name: string) => {
    setDeleteConfirmation({
        show: true,
        id,
        type: 'shift',
        title: 'Xác nhận xóa ca làm việc',
        message: `Bạn có chắc chắn muốn xóa ca "${name}" không? Hành động này không thể hoàn tác.`
    });
  };

  const handleDeleteUserRequest = (id: string, name: string) => {
    setDeleteConfirmation({
        show: true,
        id,
        type: 'user',
        title: 'Xác nhận xóa nhân sự',
        message: `Bạn có chắc chắn muốn xóa nhân viên "${name}" khỏi hệ thống không? Dữ liệu chấm công liên quan có thể bị ảnh hưởng.`
    });
  };

  const handleDeleteRegistrationRequest = (id: string, userName: string, date: string, shiftName: string) => {
    setDeleteConfirmation({
        show: true,
        id,
        type: 'registration',
        title: 'Xóa lịch làm việc',
        message: `Bạn có chắc chắn muốn xóa lịch làm việc của ${userName} (Ca: ${shiftName}) vào ngày ${new Date(date).toLocaleDateString('vi-VN')} không?`
    });
  };

  const handleSaveRules = async () => {
      await db.saveRulesContent(tempRulesContent);
      setRulesContent(tempRulesContent);
      setIsEditingRules(false);
      showToast('Đã lưu nội quy!');
  };

  const handleAddDepartment = async () => {
      if (!newDeptName.trim()) return;
      const updated = [...departments, newDeptName.trim()];
      setDepartments(updated);
      await db.saveDepartments(updated);
      setNewDeptName('');
      showToast('Đã thêm bộ phận');
  };

  const formatVND = (amount: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

  const setFilterWeek = () => {
      const curr = new Date();
      const first = curr.getDate() - curr.getDay() + 1; // Monday
      const last = first + 6; // Sunday
      const firstDay = new Date(curr.setDate(first)).toISOString().split('T')[0];
      const lastDay = new Date(curr.setDate(last)).toISOString().split('T')[0];
      setReportStartDate(firstDay);
      setReportEndDate(lastDay);
  };

  const setFilterMonth = () => {
      const date = new Date();
      const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];
      setReportStartDate(firstDay);
      setReportEndDate(lastDay);
  };

  const setFilterYear = () => {
      const date = new Date();
      const firstDay = new Date(date.getFullYear(), 0, 1).toISOString().split('T')[0]; // January 1st
      const lastDay = new Date(date.getFullYear(), 11, 31).toISOString().split('T')[0]; // December 31st
      setReportStartDate(firstDay);
      setReportEndDate(lastDay);
  };

  // Helper cho Lịch Làm Việc Filter
  const setWorkScheduleToday = () => {
    setWorkScheduleStart(todayStr);
    setWorkScheduleEnd(todayStr);
  };

  const setWorkScheduleThisWeek = () => {
    const curr = new Date();
    const first = curr.getDate() - curr.getDay() + 1; // Monday
    const last = first + 6; // Sunday
    const firstDay = new Date(curr.setDate(first)).toISOString().split('T')[0];
    const lastDay = new Date(curr.setDate(last)).toISOString().split('T')[0];
    setWorkScheduleStart(firstDay);
    setWorkScheduleEnd(lastDay);
  };

  const setWorkScheduleThisMonth = () => {
    const date = new Date();
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];
    setWorkScheduleStart(firstDay);
    setWorkScheduleEnd(lastDay);
  };

  const getDaysArray = (start: string, end: string) => {
    const arr = [];
    const dt = new Date(start);
    const endDt = new Date(end);
    while (dt <= endDt) {
        arr.push(new Date(dt).toISOString().split('T')[0]);
        dt.setDate(dt.getDate() + 1);
    }
    return arr;
  };

  const getDashboardStats = () => {
    const staffUsers = users.filter(u => u.role === 'staff');
    
    const currentlyWorkingRecords = attendance.filter(r => !r.checkOutTime);
    
    const todayRecords = attendance.filter(r => r.date === todayStr);
    const finishedToday = todayRecords.filter(r => r.checkOutTime).length;
    
    const totalStaff = staffUsers.length;
    const actualPresent = currentlyWorkingRecords.length + finishedToday;
    
    const activeUserIds = new Set([
        ...todayRecords.map(r => r.userId), 
        ...currentlyWorkingRecords.map(r => r.userId)
    ]);
    const absentStaff = staffUsers.filter(u => !activeUserIds.has(u.id));

    let onTimeCount = 0;
    let lateCount = 0;
    const earlyLeavers: { record: AttendanceRecord, shiftName: string, missingHours: number }[] = [];

    todayRecords.forEach(record => {
        const shift = shifts.find(s => s.id === record.shiftId);
        if (shift) {
            const checkInDate = new Date(record.checkInTime);
            const [sh, sm] = shift.startTime.split(':').map(Number);
            const shiftStart = new Date(checkInDate);
            shiftStart.setHours(sh, sm, 0, 0);
            const lateThreshold = new Date(shiftStart.getTime() + shift.allowedLateMinutes * 60000);

            if (checkInDate > lateThreshold) lateCount++;
            else onTimeCount++;

            if (record.checkOutTime && record.workHours) {
                const [eh, em] = shift.endTime.split(':').map(Number);
                const shiftDuration = (eh + em/60) - (sh + sm/60);
                if (record.workHours < (shiftDuration - 0.25)) {
                    earlyLeavers.push({
                        record,
                        shiftName: shift.name,
                        missingHours: shiftDuration - record.workHours
                    });
                }
            }
        } else {
            onTimeCount++;
        }
    });

    type ActivityEvent = { id: string; userName: string; type: 'check-in' | 'check-out'; time: number; shiftName?: string; };
    let activities: ActivityEvent[] = [];
    attendance.forEach(r => {
        const shift = shifts.find(s => s.id === r.shiftId);
        activities.push({ id: r.id + '_in', userName: r.userName, type: 'check-in', time: r.checkInTime, shiftName: shift?.name });
        if (r.checkOutTime) {
            activities.push({ id: r.id + '_out', userName: r.userName, type: 'check-out', time: r.checkOutTime, shiftName: shift?.name });
        }
    });
    const recentActivity = activities.sort((a, b) => b.time - a.time).slice(0, 10);

    const participationRate = totalStaff > 0 ? (actualPresent / totalStaff) * 100 : 0;
    let assessment = "";
    let assessmentColor = "bg-green-100 border-green-200 text-green-900";
    let assessmentIcon = HandThumbUpIcon;

    if (participationRate < 50) {
        assessment = "CẢNH BÁO: Tỷ lệ đi làm thấp (< 50%).";
        assessmentColor = "bg-red-100 border-red-200 text-red-900";
        assessmentIcon = ExclamationTriangleIcon;
    } else if (lateCount > onTimeCount) {
        assessment = "LƯU Ý: Đa số nhân viên đi làm muộn.";
        assessmentColor = "bg-yellow-100 border-yellow-200 text-yellow-900";
        assessmentIcon = ExclamationTriangleIcon;
    } else {
        assessment = "TỐT: Tỷ lệ đi làm ổn định và tuân thủ giờ giấc khá tốt.";
        assessmentColor = "bg-green-100 border-green-200 text-green-900";
        assessmentIcon = LightBulbIcon;
    }

    const now = new Date();
    const currentHM = now.toTimeString().slice(0, 5);
    const activeShift = shifts.find(s => currentHM >= s.startTime && currentHM <= s.endTime);

    const workingListWithDept = currentlyWorkingRecords.map(r => {
        const user = users.find(u => u.id === r.userId);
        return {
            ...r,
            shiftName: shifts.find(s => s.id === r.shiftId)?.name || 'Không xác định',
            department: user?.department || '---',
            code: user?.code || '---',
            avatar: user?.avatar
        };
    });

    return {
      totalStaff,
      currentlyWorking: currentlyWorkingRecords.length,
      workingList: workingListWithDept,
      finishedToday,
      absentStaff,
      earlyLeavers,
      recentActivity,
      performance: { onTime: onTimeCount, late: lateCount, score: actualPresent > 0 ? Math.round((onTimeCount / actualPresent) * 100) : 100 },
      actualPresent,
      assessment,
      assessmentColor,
      assessmentIcon,
      activeShiftName: activeShift ? `${activeShift.name} (${activeShift.startTime} - ${activeShift.endTime})` : 'Ngoài giờ làm việc'
    };
  };

  const dashboardStats = getDashboardStats();

  const handleSaveUser = async () => {
      if (!userForm.name || !userForm.email) return showToast("Vui lòng nhập tên và email", 'error');
      const permissions = userForm.permissions || [];
      const code = userForm.code || `NV${Date.now().toString().slice(-4)}`;

      if (isEditingUser) {
          const updatedUser = { ...isEditingUser, ...userForm, permissions } as User;
          await db.updateUser(updatedUser);
      } else {
          const newUser: User = {
              id: Date.now().toString(),
              code,
              name: userForm.name || '',
              email: userForm.email || '',
              password: '123',
              role: userForm.role as UserRole || 'staff',
              permissions: permissions,
              phone: userForm.phone,
              bankAccount: userForm.bankAccount,
              firstLogin: true,
              baseHourlyRate: userForm.baseHourlyRate || 20000,
              department: userForm.department || '',
              avatar: userForm.avatar || ''
          };
          await db.addUser(newUser);
      }
      setIsAddingUser(false);
      setIsEditingUser(null);
      setUserForm({ name: '', role: 'staff', permissions: [] });
      showToast('Đã lưu thông tin nhân viên');
  };

  const confirmDeletion = async () => {
      if (deleteConfirmation.type === 'user') {
          await db.deleteUser(deleteConfirmation.id);
      } else if (deleteConfirmation.type === 'shift') {
          await db.deleteShift(deleteConfirmation.id);
      } else if (deleteConfirmation.type === 'registration') {
          await db.deleteShiftRegistration(deleteConfirmation.id);
      }
      setDeleteConfirmation({ ...deleteConfirmation, show: false });
      showToast('Đã xóa thành công!');
  };

  const handleBonusFineSubmit = async () => {
      if(!selectedUserForBonus || bonusForm.amount <= 0) return showToast('Vui lòng nhập số tiền hợp lệ', 'error');
      const adj: SalaryAdjustment = {
          id: Date.now().toString(),
          userId: selectedUserForBonus,
          date: todayStr,
          amount: bonusForm.amount,
          type: bonusForm.type,
          reason: bonusForm.reason || (bonusForm.type === 'bonus' ? 'Thưởng' : 'Phạt')
      };
      await db.addAdjustment(adj);
      const fetchedAdjustments = await db.getAdjustments();
      setAdjustments(fetchedAdjustments);
      setIsBonusModalOpen(false);
      showToast('Đã lưu thành công!');
  };

  const openBonusModal = (userId: string) => {
      setSelectedUserForBonus(userId);
      setBonusForm({ amount: 0, type: 'bonus', reason: '' });
      setIsBonusModalOpen(true);
  };

  const openFineModal = (userId: string) => {
      setSelectedUserForBonus(userId);
      setBonusForm({ amount: 0, type: 'fine', reason: '' });
      setIsBonusModalOpen(true);
  };

  const exportToExcelHTML = (filename: string, headers: string[], data: (string | number)[][]) => {
      const tableContent = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="UTF-8">
          <style>
            body, table, th, td {
                font-family: 'Times New Roman', Times, serif;
                font-size: 12pt;
            }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 0.5pt solid #000; padding: 5px; text-align: left; }
            th { background-color: #f0f0f0; font-weight: bold; }
          </style>
        </head>
        <body>
          <table>
            <thead>
              <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${data.map(row => `<tr>${row.map(cell => `<td>${cell ?? ''}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </body>
        </html>
      `;
      const blob = new Blob([tableContent], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename + ".xls";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const exportEmployeesExcel = () => {
      const headers = ["Mã NV", "Họ Tên", "Email", "SĐT", "Bộ Phận", "Lương Cơ Bản"];
      const rows = users.filter(u => u.role !== 'admin').map(u => [
          u.code || '', 
          u.name, 
          u.email, 
          u.phone || '', 
          u.department || '', 
          u.baseHourlyRate || 0
      ]);
      exportToExcelHTML("danh_sach_nhan_vien", headers, rows);
  };

  const handleImportEmployeesExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!window.XLSX) {
          showToast("Lỗi: Thư viện xử lý Excel chưa được tải. Vui lòng tải lại trang.", 'error');
          return;
      }

      const reader = new FileReader();
      reader.onload = async (evt) => {
          try {
              const data = new Uint8Array(evt.target?.result as ArrayBuffer);
              const workbook = window.XLSX.read(data, { type: 'array' });
              
              const wsname = workbook.SheetNames[0];
              const ws = workbook.Sheets[wsname];
              
              const jsonData: any[][] = window.XLSX.utils.sheet_to_json(ws, { header: 1 });
              
              if (jsonData.length < 2) {
                  showToast("File không có dữ liệu.", 'error');
                  return;
              }

              let count = 0;
              for (let i = 1; i < jsonData.length; i++) {
                  const row = jsonData[i];
                  const code = row[0]?.toString().trim();
                  const name = row[1]?.toString().trim();
                  const email = row[2]?.toString().trim();
                  const phone = row[3]?.toString().trim();
                  const dept = row[4]?.toString().trim();
                  const rate = parseFloat(row[5]);

                  if (name && email) {
                      const newUser: User = {
                          id: Date.now().toString() + Math.random(),
                          code: code,
                          name: name,
                          email: email,
                          password: '123',
                          role: 'staff',
                          permissions: [],
                          phone: phone,
                          firstLogin: true,
                          baseHourlyRate: rate || 20000,
                          department: dept
                      };
                      await db.addUser(newUser);
                      count++;
                  }
              }
              showToast(`Đã nhập thành công ${count} nhân viên.`);
              e.target.value = '';
          } catch (error) {
              console.error(error);
              showToast("Lỗi khi đọc file Excel. Vui lòng đảm bảo đúng định dạng.", 'error');
          }
      };
      reader.readAsArrayBuffer(file);
  };

  const openAddShiftAssignment = () => {
      setShiftAssignmentForm({ userId: '', shiftIds: [], date: todayStr });
      setIsShiftAssignmentModalOpen(true);
  };

  const openEditShiftAssignment = (reg: ShiftRegistration) => {
      setShiftAssignmentForm({ id: reg.id, userId: reg.userId, shiftIds: [reg.shiftId], date: reg.date });
      setIsShiftAssignmentModalOpen(true);
  };

  const handleSaveShiftAssignment = async () => {
      if (!shiftAssignmentForm.userId || shiftAssignmentForm.shiftIds.length === 0 || !shiftAssignmentForm.date) return showToast("Vui lòng nhập đủ thông tin", 'error');

      const selectedUser = users.find(u => u.id === shiftAssignmentForm.userId);
      if (!selectedUser) return;

      for (const sId of shiftAssignmentForm.shiftIds) {
          const selectedShift = shifts.find(s => s.id === sId);
          if (selectedShift) {
              const newReg: ShiftRegistration = {
                  id: Date.now().toString() + Math.random(),
                  userId: shiftAssignmentForm.userId,
                  userName: selectedUser.name,
                  shiftId: sId,
                  shiftName: selectedShift.name,
                  date: shiftAssignmentForm.date,
                  status: 'approved'
              };
              await db.addShiftRegistration(newReg);
          }
      }
      
      setIsShiftAssignmentModalOpen(false);
      showToast('Đã lưu lịch làm việc thành công');
  };

  const getSalaryReport = () => {
    const reportData: any[] = [];
    let totalHours = 0;
    let totalSalary = 0;
    let totalBonus = 0;
    let totalFine = 0;

    users.filter(u => u.role !== 'admin').forEach(user => {
        if(reportUserFilter !== 'all' && user.id !== reportUserFilter) return;

        const userAttendance = attendance.filter(r => 
            r.userId === user.id && 
            r.date >= reportStartDate && 
            r.date <= reportEndDate && 
            r.status === 'approved'
        );
        
        const userAdjustments = adjustments.filter(a => 
            a.userId === user.id &&
            a.date >= reportStartDate &&
            a.date <= reportEndDate
        );

        let uHours = 0;
        let uSalary = 0;
        let uShiftCount = userAttendance.length;
        
        userAttendance.forEach(r => {
            if(r.workHours) {
                uHours += r.workHours;
                const shift = shifts.find(s => s.id === r.shiftId);
                const rate = shift ? shift.hourlyRate : (user.baseHourlyRate || 0);
                uSalary += r.workHours * rate;
            }
        });

        const uBonus = userAdjustments.filter(a => a.type === 'bonus').reduce((sum, a) => sum + a.amount, 0);
        const uFine = userAdjustments.filter(a => a.type === 'fine').reduce((sum, a) => sum + a.amount, 0);
        const uNet = uSalary + uBonus - uFine;

        totalHours += uHours;
        totalSalary += uSalary;
        totalBonus += uBonus;
        totalFine += uFine;

        reportData.push({
            userId: user.id,
            code: user.code,
            name: user.name,
            shiftCount: uShiftCount,
            hours: uHours,
            salary: uSalary,
            bonus: uBonus,
            fine: uFine,
            net: uNet,
            rate: user.baseHourlyRate
        });
    });
    
    return { reportData, totalHours, totalSalary, totalBonus, totalFine, totalNet: totalSalary + totalBonus - totalFine };
  };

  const salaryReport = getSalaryReport();

  const exportSalaryExcel = () => {
      const headers = ["Mã NV", "Họ Tên", "Số Ca", "Tổng Giờ Công", "Lương Cứng", "Thưởng", "Phạt", "Thực Lãnh"];
      const rows = salaryReport.reportData.map(r => [
          r.code || '',
          r.name,
          r.shiftCount,
          parseFloat(r.hours.toFixed(2)),
          r.salary,
          r.bonus,
          r.fine,
          r.net
      ]);
      exportToExcelHTML(`bao_cao_luong_${reportStartDate}_${reportEndDate}`, headers, rows);
  };

  const canViewSchedule = hasPermission('manage_shifts_config') || hasPermission('view_dashboard'); 

  const allTabs = [
      { id: 'dashboard', label: 'Tổng Quan', icon: HomeIcon, permission: 'view_dashboard' },
      { id: 'employees', label: 'Nhân Sự', icon: UserGroupIcon, permission: 'manage_users' },
      { id: 'shift_schedule', label: 'Xếp Ca', icon: ClockIcon, permission: 'view_dashboard', customCheck: canViewSchedule },
      { id: 'work_schedule', label: 'Lịch Làm Việc', icon: TableCellsIcon, permission: 'view_dashboard', customCheck: canViewSchedule },
      { id: 'attendance', label: 'Chấm Công', icon: ClipboardDocumentCheckIcon, permission: 'view_reports' }, 
      { id: 'salary', label: 'Báo Cáo Lương', icon: BanknotesIcon, permission: 'view_salary' },
      { id: 'rules', label: 'Nội Quy', icon: BookOpenIcon, permission: 'manage_rules' },
      { id: 'general', label: 'Cấu hình Chung', icon: Cog6ToothIcon, permission: 'manage_settings' },
  ];

  const allowedTabs = allTabs.filter(tab => {
      if (tab.customCheck !== undefined) return tab.customCheck;
      return hasPermission(tab.permission as PermissionKey);
  });

  return (
    <div className="bg-gray-100 rounded-lg shadow-xl overflow-hidden min-h-[800px] flex flex-col md:flex-row relative">
      
      {toast.show && (
          <div className={`fixed top-4 right-4 z-[200] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-bounce-slow
              ${toast.type === 'success' ? 'bg-green-600 text-white' : toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}
          `}>
              {toast.type === 'success' && <CheckCircleIcon className="h-6 w-6"/>}
              {toast.type === 'error' && <ExclamationTriangleIcon className="h-6 w-6"/>}
              <span className="font-bold text-sm">{toast.message}</span>
              <button onClick={() => setToast(prev => ({...prev, show: false}))}><XCircleIcon className="h-5 w-5 opacity-80 hover:opacity-100"/></button>
          </div>
      )}

      {deleteConfirmation.show && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transform transition-all">
                  <div className="bg-red-50 p-6 border-b border-red-100 flex items-center gap-4">
                      <div className="bg-red-100 p-2 rounded-full">
                          <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                      </div>
                      <h3 className="text-lg font-bold text-red-900">{deleteConfirmation.title}</h3>
                  </div>
                  <div className="p-6">
                      <p className="text-gray-700 leading-relaxed font-medium">{deleteConfirmation.message}</p>
                  </div>
                  <div className="bg-gray-50 px-6 py-4 flex flex-col sm:flex-row gap-3 justify-end">
                      <button 
                        onClick={() => setDeleteConfirmation({ ...deleteConfirmation, show: false })}
                        className="px-5 py-2.5 rounded-xl text-gray-700 font-bold bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
                      >
                          Hủy bỏ
                      </button>
                      <button 
                        onClick={confirmDeletion}
                        className="px-5 py-2.5 rounded-xl text-white font-bold bg-red-600 hover:bg-red-700 shadow-lg shadow-red-500/20 transition-all flex items-center justify-center gap-2"
                      >
                          <TrashIcon className="h-5 w-5" />
                          Xác nhận xóa
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="w-full md:w-64 lg:w-72 bg-gray-900 text-white flex-shrink-0">
        <div className="p-6 border-b border-gray-800">
            <div className="flex items-center gap-3 mb-4">
                 {settings.companyLogo ? <img src={settings.companyLogo} className="h-10 w-10 object-contain bg-white rounded-full p-1" alt={settings.companyName} /> : <div className="h-10 w-10 bg-blue-600 rounded-full flex items-center justify-center font-bold">HR</div>}
                 <h2 className="text-xl font-bold tracking-wide text-white">{settings.companyName}</h2>
            </div>
            
            <div className="mt-2 flex items-center text-gray-400 text-xs mb-4">
                 <ClockIcon className="h-4 w-4 mr-1" />
                 <span>{currentDateTime.toLocaleDateString('vi-VN')} {currentDateTime.toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'})}</span>
            </div>

            <p className="text-xs text-gray-500 uppercase">{currentUser.role === 'admin' ? 'Admin' : 'Quản lý: '}: {currentUser.name}</p>
        </div>
        <nav className="mt-4 px-2 space-y-2">
          {allowedTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`w-full flex items-center px-4 py-3 text-left rounded-lg transition-all duration-200 group ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
                <Icon className={`h-6 w-6 mr-3 ${activeTab === tab.id ? 'text-white' : 'text-gray-500'}`} />
                <span className="font-medium">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 bg-gray-50 p-8 overflow-y-auto h-[800px]">
        {activeTab === 'dashboard' && hasPermission('view_dashboard') && (
            <div className="flex flex-col h-full gap-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-gray-100 p-5 rounded-lg shadow-sm flex items-center border border-gray-200">
                        <div className="p-3 bg-blue-100 rounded-full mr-4">
                            <UserGroupIcon className="h-6 w-6 text-blue-800" />
                        </div>
                        <div>
                            <p className="text-gray-600 text-xs font-bold uppercase whitespace-nowrap">Tổng nhân sự</p>
                            <p className="text-2xl font-black text-gray-900">{dashboardStats.totalStaff}</p>
                        </div>
                    </div>
                    <div className="bg-gray-100 p-5 rounded-lg shadow-sm flex items-center border border-gray-200">
                        <div className="p-3 bg-green-100 rounded-full mr-4">
                            <SignalIcon className="h-6 w-6 text-green-800" />
                        </div>
                        <div>
                            <p className="text-gray-600 text-xs font-bold uppercase">Đang Online</p>
                            <p className="text-2xl font-black text-gray-900">{dashboardStats.currentlyWorking}</p>
                        </div>
                    </div>
                    <div className="bg-gray-100 p-5 rounded-lg shadow-sm flex items-center border border-gray-200">
                        <div className="p-3 bg-purple-100 rounded-full mr-4">
                            <CheckCircleIcon className="h-6 w-6 text-purple-800" />
                        </div>
                        <div>
                            <p className="text-gray-600 text-xs font-bold uppercase">Đã xong ca</p>
                            <p className="text-2xl font-black text-gray-900">{dashboardStats.finishedToday}</p>
                        </div>
                    </div>
                    <div className="bg-gray-100 p-5 rounded-lg shadow-sm flex items-center border border-gray-200">
                        <div className="p-3 bg-yellow-100 rounded-full mr-4">
                            <ChartBarIcon className="h-6 w-6 text-yellow-800" />
                        </div>
                        <div>
                            <p className="text-gray-600 text-xs font-bold uppercase">Đúng giờ</p>
                            <p className="text-2xl font-black text-gray-900">{dashboardStats.performance.score}%</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-6">
                    <div className={`p-6 rounded-lg border ${dashboardStats.assessmentColor} flex items-start gap-4 w-full`}>
                        <dashboardStats.assessmentIcon className="h-8 w-8 flex-shrink-0 mt-1" />
                        <div>
                            <h3 className="font-bold text-lg text-black">Đánh giá nhanh hiệu suất</h3>
                            <p className="text-sm mt-2 text-black opacity-90">{dashboardStats.assessment}</p>
                        </div>
                    </div>

                     <div className="bg-gray-100 p-6 rounded-lg shadow-sm border border-gray-200 w-full">
                            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                                <BriefcaseIcon className="h-5 w-5 mr-2 text-gray-600" />
                                Tình hình nhân sự hôm nay
                            </h3>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                                <div className="bg-green-100 p-3 rounded-lg border-l-4 border-green-600">
                                    <p className="text-green-900 text-xs font-bold uppercase">Đúng giờ</p>
                                    <p className="text-2xl font-black text-gray-900 mt-1">{dashboardStats.performance.onTime}</p>
                                </div>
                                <div className="bg-red-100 p-3 rounded-lg border-l-4 border-red-600">
                                    <p className="text-red-900 text-xs font-bold uppercase">Đi muộn</p>
                                    <p className="text-2xl font-black text-gray-900 mt-1">{dashboardStats.performance.late}</p>
                                </div>
                                <div className="bg-orange-100 p-3 rounded-lg border-l-4 border-orange-600">
                                    <p className="text-orange-900 text-xs font-bold uppercase">Vắng</p>
                                    <p className="text-2xl font-black text-gray-900 mt-1">{dashboardStats.absentStaff.length}</p>
                                </div>
                                <div className="bg-yellow-100 p-3 rounded-lg border-l-4 border-yellow-600">
                                    <p className="text-yellow-900 text-xs font-bold uppercase">Về sớm</p>
                                    <p className="text-2xl font-black text-gray-900 mt-1">{dashboardStats.earlyLeavers.length}</p>
                                </div>
                            </div>

                            <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-300 max-h-[400px] overflow-y-auto">
                                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center sticky top-0 z-10">
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-sm uppercase tracking-wide">Danh sách nhân viên đang trong ca</h4>
                                        <p className="text-xs text-gray-500 mt-1">Cập nhật lúc: {currentDateTime.toLocaleTimeString('vi-VN')}</p>
                                    </div>
                                    <span className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full border border-green-200">
                                        Đang làm việc: {dashboardStats.currentlyWorking}
                                    </span>
                                </div>
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Mã NV</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Họ Tên</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Ca làm việc</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Giờ Vào</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Bộ Phận</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 bg-white">
                                        {dashboardStats.workingList.map((r) => (
                                            <tr key={r.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 text-sm font-mono text-gray-900 font-bold">{r.code}</td>
                                                <td className="px-6 py-4 text-sm text-gray-900 flex items-center">
                                                    {r.avatar ? (
                                                        <img src={r.avatar} alt={r.userName} className="h-6 w-6 rounded-full object-cover mr-2 border border-gray-200" />
                                                    ) : (
                                                        <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-xs mr-2 font-bold">{r.userName.charAt(0)}</div>
                                                    )}
                                                    {r.userName}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-900">{r.shiftName}</td>
                                                <td className="px-6 py-4 text-sm font-mono text-gray-900 bg-green-50 w-32">
                                                    {new Date(r.checkInTime).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'})}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-900">{r.department}</td>
                                            </tr>
                                        ))}
                                        {dashboardStats.workingList.length === 0 && (
                                            <tr><td colSpan={5} className="px-6 py-6 text-center text-gray-500 italic">Không có nhân viên nào đang làm việc.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                </div>

                <div className="bg-gray-100 rounded-lg shadow-sm flex flex-col border border-gray-200 flex-1 min-h-[300px]">
                    <div className="px-6 py-4 border-b border-gray-200 sticky top-0 bg-gray-100 z-10">
                        <h3 className="text-lg font-bold text-gray-900">Lịch sử hoạt động</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {dashboardStats.recentActivity.map((activity) => (
                            <div key={activity.id} className="flex items-start space-x-3 pb-4 border-b border-gray-200 last:border-0 hover:bg-gray-200 p-2 rounded transition-colors">
                                <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${activity.type === 'check-in' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-gray-900">
                                        {activity.userName}
                                    </p>
                                    <p className="text-xs text-gray-600">
                                        {activity.type === 'check-in' ? 'Đã check-in' : 'Đã check-out'} • {activity.shiftName}
                                    </p>
                                </div>
                                <div className="text-xs text-gray-500 font-mono whitespace-nowrap">
                                    {new Date(activity.time).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'})}
                                </div>
                            </div>
                        ))}
                        {dashboardStats.recentActivity.length === 0 && <p className="text-center text-gray-500 text-sm">Chưa có hoạt động.</p>}
                    </div>
                </div>
            </div>
        )}

        {/* ... (Existing Employees Tab Code) ... */}
        {activeTab === 'employees' && hasPermission('manage_users') && (
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-center border-b pb-4 gap-4 sticky top-0 bg-gray-50 z-20 pt-2">
                    <h2 className="text-2xl font-bold text-gray-800">Danh sách Nhân sự</h2>
                    <div className="flex gap-2">
                         {currentUser.role === 'admin' && (
                            <button onClick={() => setIsDeptModalOpen(true)} className="bg-gray-800 text-white px-3 py-2 rounded shadow hover:bg-black text-sm font-bold flex items-center transition-colors">
                                <BuildingOfficeIcon className="h-4 w-4 mr-1"/> Quản lý Bộ phận
                            </button>
                        )}
                        <label className="bg-green-600 text-white px-3 py-2 rounded shadow hover:bg-green-700 cursor-pointer text-sm font-bold flex items-center transition-colors">
                            <ArrowDownTrayIcon className="h-4 w-4 mr-1"/> Nhập Excel
                            <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleImportEmployeesExcel} />
                        </label>
                        <button onClick={exportEmployeesExcel} className="bg-gray-600 text-white px-3 py-2 rounded shadow hover:bg-gray-700 text-sm font-bold flex items-center transition-colors">
                            <ArrowUpTrayIcon className="h-4 w-4 mr-1"/> Xuất Excel
                        </button>
                        <button onClick={() => { setIsAddingUser(true); setIsEditingUser(null); }} className="bg-blue-600 text-white px-3 py-2 rounded shadow hover:bg-blue-700 text-sm font-bold flex items-center transition-colors">
                            <UserGroupIcon className="h-4 w-4 mr-1"/> + Thêm mới
                        </button>
                    </div>
                </div>

                {isDeptModalOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-lg shadow-xl w-96">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-gray-900">Quản lý Bộ Phận</h3>
                                <button onClick={() => setIsDeptModalOpen(false)}><XCircleIcon className="h-6 w-6 text-gray-500 hover:text-red-500 transition-colors"/></button>
                            </div>
                            
                            <div className="flex gap-2 mb-4">
                                <input 
                                    value={newDeptName}
                                    onChange={(e) => setNewDeptName(e.target.value)}
                                    placeholder="Tên bộ phận mới..."
                                    className="flex-1 border p-2 rounded text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                                />
                                <button onClick={handleAddDepartment} className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 transition-colors">
                                    <PlusIcon className="h-5 w-5"/>
                                </button>
                            </div>

                            <div className="max-h-60 overflow-y-auto space-y-2 border-t pt-2">
                                {departments.length === 0 && <p className="text-gray-500 italic text-sm text-center">Chưa có bộ phận nào.</p>}
                                {departments.map((dept, idx) => (
                                    <div key={dept} className="flex justify-between items-center bg-gray-50 p-2 rounded border border-gray-200">
                                        <span className="text-gray-900 font-medium">{dept}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                
                {isBonusModalOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-lg shadow-xl w-96">
                            <h3 className="text-lg font-bold mb-4 text-gray-900">
                                {bonusForm.type === 'bonus' ? 'Thưởng Nhân viên' : 'Phạt Nhân viên'}
                            </h3>
                            <div className="space-y-3">
                                <input type="number" placeholder="Số tiền" value={bonusForm.amount} onChange={e => setBonusForm({...bonusForm, amount: parseFloat(e.target.value)})} className="w-full border p-2 rounded text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors" />
                                <input type="text" placeholder="Lý do" value={bonusForm.reason} onChange={e => setBonusForm({...bonusForm, reason: e.target.value})} className="w-full border p-2 rounded text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors" />
                                <div className="flex gap-2 mt-4">
                                    <button onClick={handleBonusFineSubmit} className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition-colors">Lưu</button>
                                    <button onClick={() => setIsBonusModalOpen(false)} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300 transition-colors">Hủy</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {(isAddingUser || isEditingUser) && (
                    <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 mt-4 mb-6 transition-all duration-300 ease-in-out">
                        <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                            <h3 className="text-xl font-bold text-gray-900 flex items-center">
                                {isEditingUser ? <PencilSquareIcon className="h-6 w-6 mr-2 text-blue-600"/> : <PlusIcon className="h-6 w-6 mr-2 text-green-600"/>}
                                {isEditingUser ? 'Chỉnh sửa thông tin' : 'Thêm nhân viên mới'}
                            </h3>
                            <button onClick={() => { setIsAddingUser(false); setIsEditingUser(null); }} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <XCircleIcon className="h-6 w-6"/>
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                 <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Mã Nhân Viên</label>
                                    <input 
                                        placeholder="VD: NV01 (Tự động nếu trống)" 
                                        value={userForm.code || ''} 
                                        onChange={e => setUserForm({...userForm, code: e.target.value})} 
                                        className="w-full border border-gray-300 p-2.5 rounded-lg text-gray-900 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Họ và Tên <span className="text-red-500">*</span></label>
                                    <input 
                                        placeholder="Nguyễn Văn A" 
                                        value={userForm.name} 
                                        onChange={e => setUserForm({...userForm, name: e.target.value})} 
                                        className="w-full border border-gray-300 p-2.5 rounded-lg text-gray-900 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
                                    <input 
                                        placeholder="email@company.com" 
                                        value={userForm.email} 
                                        onChange={e => setUserForm({...userForm, email: e.target.value})} 
                                        className="w-full border border-gray-300 p-2.5 rounded-lg text-gray-900 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Số điện thoại</label>
                                    <input 
                                        placeholder="09xxxx..." 
                                        value={userForm.phone || ''} 
                                        onChange={e => setUserForm({...userForm, phone: e.target.value})} 
                                        className="w-full border border-gray-300 p-2.5 rounded-lg text-gray-900 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Ảnh đại diện</label>
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-full overflow-hidden border border-gray-300 bg-gray-100 flex items-center justify-center">
                                            {userForm.avatar ? (
                                                <img src={userForm.avatar} className="h-full w-full object-cover" alt="avatar"/>
                                            ) : (
                                                <UserCircleIcon className="h-8 w-8 text-gray-400"/>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                             <input 
                                                type="file" 
                                                accept="image/*"
                                                onChange={handleUserAvatarUpload}
                                                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-colors" 
                                             />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Tài khoản Ngân hàng</label>
                                    <input 
                                        placeholder="Số TK - Tên Ngân hàng" 
                                        value={userForm.bankAccount || ''} 
                                        onChange={e => setUserForm({...userForm, bankAccount: e.target.value})} 
                                        className="w-full border border-gray-300 p-2.5 rounded-lg text-gray-900 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Bộ Phận</label>
                                    <select 
                                        value={userForm.department || ''} 
                                        onChange={e => setUserForm({...userForm, department: e.target.value})} 
                                        className="w-full border border-gray-300 p-2.5 rounded-lg text-gray-900 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                    >
                                        <option value="">-- Chọn Bộ Phận --</option>
                                        {departments.map(dept => (
                                            <option key={dept} value={dept}>{dept}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Lương Cơ Bản (VNĐ/h)</label>
                                    <input 
                                        type="number" 
                                        placeholder="20000" 
                                        value={userForm.baseHourlyRate} 
                                        onChange={e => setUserForm({...userForm, baseHourlyRate: parseFloat(e.target.value)})} 
                                        className="w-full border border-gray-300 p-2.5 rounded-lg text-gray-900 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                                    />
                                </div>
                                 <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Vai trò hệ thống</label>
                                    <select 
                                        value={userForm.role}
                                        onChange={e => {
                                            const role = e.target.value as UserRole;
                                            setUserForm({...userForm, role, permissions: getRolePermissions(role)});
                                        }}
                                        className="w-full border border-gray-300 p-2.5 rounded-lg text-gray-900 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                    >
                                        <option value="staff">Nhân viên (Chỉ chấm công)</option>
                                        <option value="manager">Quản lý (Duyệt ca/công)</option>
                                        <option value="admin">Quản trị viên (Toàn quyền)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 border-t border-gray-100 pt-6">
                            <h4 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Phân quyền chi tiết</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {ALL_PERMISSIONS.map(perm => (
                                    <label key={perm.key} className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-white hover:border-blue-300 transition-all cursor-pointer">
                                        <input 
                                            type="checkbox"
                                            checked={userForm.permissions?.includes(perm.key)}
                                            onChange={e => {
                                                const currentPerms = userForm.permissions || [];
                                                let newPerms;
                                                if (e.target.checked) {
                                                    newPerms = [...currentPerms, perm.key];
                                                } else {
                                                    newPerms = currentPerms.filter(k => k !== perm.key);
                                                }
                                                setUserForm({...userForm, permissions: newPerms});
                                            }}
                                            className="h-4 w-4 rounded"
                                        />
                                        <span className="text-sm font-medium text-gray-700">{perm.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="mt-8 flex gap-4 justify-end">
                                <button onClick={() => { setIsAddingUser(false); setIsEditingUser(null); }} className="px-6 py-2.5 rounded-lg text-gray-700 font-bold bg-gray-100 hover:bg-gray-200 transition-colors">Hủy bỏ</button>
                                <button onClick={handleSaveUser} className="px-6 py-2.5 rounded-lg text-white font-bold bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl transition-all">
                                {isEditingUser ? 'Cập nhật' : 'Lưu nhân viên'}
                                </button>
                        </div>
                    </div>
                )}

                <div className="bg-gray-100 rounded-lg shadow overflow-hidden border border-gray-200 max-h-[600px] overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-200 relative">
                        <thead className="bg-gray-200 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Mã NV</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Họ Tên</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Bộ Phận</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Vai trò</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-50 divide-y divide-gray-200">
                            {users.filter(u => u.role !== 'admin').map(u => (
                                <tr key={u.id} className="hover:bg-gray-200">
                                    <td className="px-6 py-4 text-sm font-mono text-gray-900">{u.code || '-'}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center">
                                            {u.avatar ? (
                                                <img src={u.avatar} alt={u.name} className="h-8 w-8 rounded-full object-cover mr-3 border border-gray-200" />
                                            ) : (
                                                <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-xs mr-3 font-bold">{u.name.charAt(0)}</div>
                                            )}
                                            <div>
                                                <div className="text-sm font-bold text-gray-900">{u.name}</div>
                                                <div className="text-xs text-gray-600">{u.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900">{u.department || '-'}</td>
                                    <td className="px-6 py-4 text-sm">
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                            u.role === 'manager' ? 'bg-purple-100 text-purple-800' : 'bg-gray-200 text-gray-800'
                                        }`}>
                                            {u.role === 'manager' ? 'Quản lý' : 'Nhân viên'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 flex gap-3 items-center">
                                        <button title="Sửa" onClick={() => { setIsEditingUser(u); setUserForm(u); setIsAddingUser(false); }} className="text-blue-600 hover:text-blue-800 transition-colors"><PencilSquareIcon className="h-5 w-5"/></button>
                                        <button title="Thưởng" onClick={() => openBonusModal(u.id)} className="text-yellow-600 hover:text-yellow-800 transition-colors"><GiftIcon className="h-5 w-5"/></button>
                                        <button title="Phạt" onClick={() => openFineModal(u.id)} className="text-orange-600 hover:text-orange-800 transition-colors"><CurrencyDollarIcon className="h-5 w-5"/></button>
                                        {currentUser.role === 'admin' && (
                                            <button 
                                                title="Xóa" 
                                                onClick={() => handleDeleteUserRequest(u.id, u.name)} 
                                                className="text-red-600 hover:text-red-800 transition-colors"
                                            >
                                                <TrashIcon className="h-5 w-5"/>
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* Tab Xếp Ca (Config Only) */}
        {activeTab === 'shift_schedule' && canViewSchedule && (
          <div className="space-y-8 max-w-5xl mx-auto">
             {hasPermission('manage_shifts_config') && (
                 <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                     <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <h3 className="text-lg font-bold text-gray-900 flex items-center">
                            <ClockIcon className="h-5 w-5 mr-2 text-gray-600"/> 
                            Cấu Hình Ca Làm Việc
                        </h3>
                        <div className="flex gap-2">
                            <button 
                                onClick={handleSaveShiftsConfig} 
                                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 shadow-sm flex items-center transition-all"
                            >
                                <CheckCircleIcon className="h-4 w-4 mr-1 text-white"/> Lưu Cấu Hình
                            </button>
                            <button 
                                onClick={handleAddShift} 
                                className="bg-white text-gray-900 border border-gray-300 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-50 shadow-sm flex items-center transition-all"
                            >
                                <PlusIcon className="h-4 w-4 mr-1 text-gray-600"/> Thêm Ca
                            </button>
                        </div>
                     </div>

                     <div className="p-6 grid gap-4">
                         {shifts.length === 0 && (
                            <div className="text-center py-8 text-gray-400">
                                <p>Chưa có ca làm việc nào được cấu hình.</p>
                            </div>
                         )}
                         
                         {shifts.map((shift) => (
                             <div key={shift.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow relative group">
                                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 items-end">
                                     <div className="lg:col-span-1">
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Tên Ca</label>
                                        <input 
                                            value={shift.name} 
                                            onChange={(e) => updateShift(shift.id, 'name', e.target.value)} 
                                            className="w-full bg-white border border-gray-300 text-gray-900 text-sm font-bold rounded-lg focus:ring-2 focus:ring-gray-200 focus:border-gray-400 block p-2.5 transition-all"
                                            placeholder="VD: Ca Sáng"
                                        />
                                     </div>
                                     
                                     <div className="lg:col-span-2 grid grid-cols-2 gap-2">
                                         <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Bắt đầu</label>
                                            <input 
                                                type="time" 
                                                value={shift.startTime} 
                                                onChange={(e) => updateShift(shift.id, 'startTime', e.target.value)} 
                                                className="w-full bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-lg focus:ring-2 focus:ring-gray-200 focus:border-gray-400 block p-2.5" 
                                            />
                                         </div>
                                         <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Kết thúc</label>
                                            <input 
                                                type="time" 
                                                value={shift.endTime} 
                                                onChange={(e) => updateShift(shift.id, 'endTime', e.target.value)} 
                                                className="w-full bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-lg focus:ring-2 focus:ring-gray-200 focus:border-gray-400 block p-2.5" 
                                            />
                                         </div>
                                     </div>

                                     <div className="lg:col-span-2 grid grid-cols-3 gap-3">
                                         <div className="col-span-1">
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5" title="Phút trễ cho phép">Trễ (p)</label>
                                            <input 
                                                type="number" 
                                                value={shift.allowedLateMinutes} 
                                                onChange={(e) => updateShift(shift.id, 'allowedLateMinutes', parseInt(e.target.value))} 
                                                className="w-full bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-lg focus:ring-2 focus:ring-gray-200 focus:border-gray-400 block p-2.5" 
                                            />
                                         </div>
                                         <div className="col-span-1">
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Lương/h</label>
                                            <input 
                                                type="number" 
                                                value={shift.hourlyRate} 
                                                onChange={(e) => updateShift(shift.id, 'hourlyRate', parseInt(e.target.value))} 
                                                className="w-full bg-white border border-gray-300 text-gray-900 text-sm font-medium rounded-lg focus:ring-2 focus:ring-gray-200 focus:border-gray-400 block p-2.5" 
                                            />
                                         </div>
                                         <div className="col-span-1 flex items-end justify-center">
                                             {currentUser.role === 'admin' && (
                                                <button 
                                                    onClick={() => handleDeleteShiftRequest(shift.id, shift.name)}
                                                    className="p-2.5 rounded-lg text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all"
                                                    title="Xóa ca"
                                                >
                                                    <TrashIcon className="h-6 w-6" />
                                                </button>
                                             )}
                                         </div>
                                     </div>
                                 </div>
                             </div>
                         ))}
                     </div>
                 </div>
             )}
          </div>
        )}

        {/* Tab Lịch Làm Việc Mới (Matrix View) */}
        {activeTab === 'work_schedule' && canViewSchedule && (
            <div className="max-w-full space-y-6">
                
                {/* Stats Widget */}
                {(() => {
                    const rangeRegs = registrations.filter(r => 
                        r.date >= workScheduleStart && 
                        r.date <= workScheduleEnd && 
                        r.status === 'approved'
                    );
                    const uniqueStaff = new Set(rangeRegs.map(r => r.userId)).size;
                    const totalShifts = rangeRegs.length;
                    
                    const shiftCounts: Record<string, number> = {};
                    shifts.forEach(s => shiftCounts[s.name] = 0);
                    rangeRegs.forEach(r => {
                        if(shiftCounts[r.shiftName] !== undefined) shiftCounts[r.shiftName]++;
                        else shiftCounts[r.shiftName] = 1;
                    });

                    return (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-center gap-4">
                                <div className="p-3 bg-blue-100 rounded-full text-blue-600">
                                    <UserGroupIcon className="h-8 w-8"/>
                                </div>
                                <div>
                                    <p className="text-gray-500 text-xs font-bold uppercase">Nhân viên hoạt động</p>
                                    <p className="text-2xl font-black text-gray-900">{uniqueStaff} <span className="text-sm font-medium text-gray-400">người</span></p>
                                </div>
                            </div>
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-center gap-4">
                                <div className="p-3 bg-green-100 rounded-full text-green-600">
                                    <ClipboardDocumentCheckIcon className="h-8 w-8"/>
                                </div>
                                <div>
                                    <p className="text-gray-500 text-xs font-bold uppercase">Tổng Ca Đăng Ký</p>
                                    <p className="text-2xl font-black text-gray-900">{totalShifts} <span className="text-sm font-medium text-gray-400">ca</span></p>
                                </div>
                            </div>
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col justify-center">
                                <p className="text-gray-500 text-xs font-bold uppercase mb-2">Phân bổ ca làm việc</p>
                                <div className="flex w-full h-4 rounded-full overflow-hidden bg-gray-100">
                                    {shifts.map((s, idx) => {
                                        const count = shiftCounts[s.name] || 0;
                                        const percent = totalShifts > 0 ? (count / totalShifts) * 100 : 0;
                                        if (percent === 0) return null;
                                        // Simple cyclic colors
                                        const colors = ['bg-yellow-400', 'bg-green-500', 'bg-red-500', 'bg-blue-500'];
                                        const color = colors[idx % colors.length];
                                        return (
                                            <div key={s.id} className={`${color}`} style={{ width: `${percent}%` }} title={`${s.name}: ${count}`}></div>
                                        );
                                    })}
                                </div>
                                <div className="flex gap-3 mt-2 text-[10px] font-bold text-gray-600 flex-wrap">
                                    {shifts.map((s, idx) => {
                                         const count = shiftCounts[s.name] || 0;
                                         if (count === 0) return null;
                                         const colors = ['text-yellow-600', 'text-green-600', 'text-red-600', 'text-blue-600'];
                                         return <span key={s.id} className={colors[idx % colors.length]}>{s.name}: {count}</span>
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })()}

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <div className="flex items-center">
                            <TableCellsIcon className="h-5 w-5 mr-2 text-gray-900"/> 
                            <h3 className="text-lg font-bold text-gray-900">Bảng Tổng Hợp Lịch Làm Việc</h3>
                        </div>
                        {['admin', 'manager'].includes(currentUser.role) && (
                            <button 
                                onClick={openAddShiftAssignment} 
                                className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm flex items-center transition-all"
                            >
                                <PlusIcon className="h-4 w-4 mr-1"/> Phân Ca
                            </button>
                        )}
                    </div>
                    
                    <div className="p-6">
                        <div className="flex flex-col md:flex-row gap-4 bg-gray-100 p-4 rounded-lg border border-gray-200 items-center justify-between mb-6">
                            <div className="flex gap-2 items-center">
                                <div className="flex bg-gray-200 p-1 rounded-lg">
                                    <button onClick={setWorkScheduleToday} className="px-4 py-1.5 rounded-md text-sm font-medium text-gray-700 hover:bg-white hover:shadow-sm transition-all">Hôm nay</button>
                                    <button onClick={setWorkScheduleThisWeek} className="px-4 py-1.5 rounded-md text-sm font-medium text-gray-700 hover:bg-white hover:shadow-sm transition-all">Tuần này</button>
                                    <button onClick={setWorkScheduleThisMonth} className="px-4 py-1.5 rounded-md text-sm font-medium text-gray-700 hover:bg-white hover:shadow-sm transition-all">Tháng này</button>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-600 text-sm font-bold">Từ:</span>
                                <input 
                                    type="date" 
                                    value={workScheduleStart} 
                                    onChange={(e) => setWorkScheduleStart(e.target.value)} 
                                    className="border-black border-2 bg-blue-50 text-black p-2 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm font-medium" 
                                />
                                <span className="text-gray-600 text-sm font-bold">Đến:</span>
                                <input 
                                    type="date" 
                                    value={workScheduleEnd} 
                                    onChange={(e) => setWorkScheduleEnd(e.target.value)} 
                                    className="border-black border-2 bg-blue-50 text-black p-2 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm font-medium" 
                                />
                            </div>
                        </div>

                        <div className="overflow-x-auto rounded-lg shadow-sm border border-gray-200">
                            <table className="min-w-max w-full divide-y divide-gray-200 border-collapse table-auto">
                                <thead className="bg-blue-600 text-white sticky top-0 z-20 shadow-sm">
                                    <tr>
                                        <th rowSpan={2} className="px-2 py-3 text-left text-xs font-bold uppercase tracking-wider border-r border-blue-500 w-20 sticky left-0 bg-blue-600 z-30 whitespace-nowrap">
                                            Mã NV
                                        </th>
                                        <th rowSpan={2} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider border-r border-blue-500 min-w-[150px] sticky left-20 bg-blue-600 z-30 whitespace-nowrap">
                                            Tên Nhân Viên
                                        </th>
                                        {getDaysArray(workScheduleStart, workScheduleEnd).map(dateStr => {
                                            const isToday = dateStr === new Date().toISOString().split('T')[0];
                                            return (
                                                <th key={dateStr} colSpan={shifts.length} className={`px-2 py-2 text-center text-xs font-bold border-r border-blue-500 whitespace-nowrap ${isToday ? 'bg-blue-800 border-b-4 border-yellow-400' : ''}`}>
                                                    {new Date(dateStr).toLocaleDateString('vi-VN', {day: '2-digit', month: '2-digit'})}
                                                    <br/>
                                                    <span className="text-[10px] opacity-80 uppercase">{new Date(dateStr).toLocaleDateString('vi-VN', {weekday: 'short'})}</span>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                    <tr>
                                        {getDaysArray(workScheduleStart, workScheduleEnd).map(dateStr => (
                                            shifts.map((shift, index) => {
                                                // Simple logic to color code headers based on keywords or index
                                                let headerColor = 'bg-gray-100 text-gray-700';
                                                const sName = shift.name.toLowerCase();
                                                if (sName.includes('sáng')) headerColor = 'bg-yellow-300 text-yellow-900';
                                                else if (sName.includes('chiều')) headerColor = 'bg-green-400 text-green-900';
                                                else if (sName.includes('tối')) headerColor = 'bg-red-500 text-white';
                                                else {
                                                    // Fallback cyclic colors if names don't match
                                                    if (index % 3 === 0) headerColor = 'bg-yellow-300 text-yellow-900';
                                                    else if (index % 3 === 1) headerColor = 'bg-green-400 text-green-900';
                                                    else headerColor = 'bg-red-500 text-white';
                                                }

                                                return (
                                                    <th key={dateStr + shift.id} className={`px-2 py-1 text-center text-[10px] font-bold border-r border-gray-300 whitespace-nowrap ${headerColor}`}>
                                                        {shift.name.replace('Ca ', '')}
                                                    </th>
                                                )
                                            })
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                    {users.filter(u => u.role !== 'admin').map(user => (
                                        <tr key={user.id} className="hover:bg-blue-50/50 transition-colors group">
                                            <td className="px-2 py-3 text-sm font-mono font-bold text-gray-900 border-r border-gray-200 sticky left-0 bg-white z-10 group-hover:bg-blue-50/50 whitespace-nowrap">
                                                {user.code}
                                            </td>
                                            <td className="px-4 py-3 text-sm font-bold text-gray-900 border-r border-gray-200 sticky left-20 bg-white z-10 group-hover:bg-blue-50/50 whitespace-nowrap">
                                                {user.name}
                                            </td>
                                            {getDaysArray(workScheduleStart, workScheduleEnd).map(dateStr => {
                                                const isToday = dateStr === new Date().toISOString().split('T')[0];
                                                return shifts.map(shift => {
                                                    const hasReg = registrations.some(r => 
                                                        r.userId === user.id && 
                                                        r.date === dateStr && 
                                                        r.shiftId === shift.id && 
                                                        r.status === 'approved'
                                                    );
                                                    
                                                    return (
                                                        <td key={dateStr + shift.id} className={`p-0 border-r border-gray-200 text-center align-middle h-10 ${isToday ? 'border-y-2 border-y-blue-200 bg-blue-50/30' : ''}`}>
                                                            <div className={`w-full h-full flex items-center justify-center ${hasReg ? 'bg-green-500 text-white font-bold shadow-inner' : ''}`}>
                                                                {hasReg ? 'R' : ''}
                                                            </div>
                                                        </td>
                                                    );
                                                });
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* ... (Rest of tabs: Attendance, Salary, Rules, General - No changes needed) ... */}
        {activeTab === 'attendance' && hasPermission('view_reports') && (
           <div className="space-y-4">
              <div className="flex flex-row flex-nowrap items-center gap-3 bg-white p-3 rounded-lg shadow-sm border border-gray-200 overflow-x-auto whitespace-nowrap scrollbar-hide">
                  {/* ... (Filter controls) ... */}
                  <div className="flex bg-gray-100 p-1 rounded-lg flex-shrink-0">
                      <button onClick={setFilterWeek} className="px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-tight text-gray-700 hover:bg-white hover:shadow-sm transition-all">Tuần</button>
                      <button onClick={setFilterMonth} className="px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-tight text-gray-700 hover:bg-white hover:shadow-sm transition-all">Tháng</button>
                      <button onClick={setFilterYear} className="px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-tight text-gray-700 hover:bg-white hover:shadow-sm transition-all">Năm</button>
                  </div>
                  <div className="h-5 w-px bg-gray-300 flex-shrink-0"></div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-gray-500 text-[10px] font-bold uppercase">Từ:</span>
                      <input 
                          type="date" 
                          value={reportStartDate} 
                          onChange={(e) => setReportStartDate(e.target.value)} 
                          className="border-black border bg-blue-50 text-black px-1.5 py-1 rounded text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none w-[115px]" 
                      />
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-gray-500 text-[10px] font-bold uppercase">Đến:</span>
                      <input 
                          type="date" 
                          value={reportEndDate} 
                          onChange={(e) => setReportEndDate(e.target.value)} 
                          className="border-black border bg-blue-50 text-black px-1.5 py-1 rounded text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none w-[115px]" 
                      />
                  </div>
                  <div className="h-5 w-px bg-gray-300 flex-shrink-0"></div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 flex-1 min-w-[150px]">
                      <FunnelIcon className="h-3.5 w-3.5 text-gray-400" />
                      <select 
                        value={reportUserFilter} 
                        onChange={(e) => setReportUserFilter(e.target.value)} 
                        className="border border-gray-300 bg-white text-gray-900 px-2 py-1 rounded text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none w-full"
                      >
                          <option value="all">Tất cả nhân viên</option>
                          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                  </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200 max-h-[600px] overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-200 relative">
                      <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                          <tr>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Ngày</th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Nhân viên</th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Giờ làm</th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Tổng giờ</th>
                              <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Trạng thái</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                          {attendance.filter(r => 
                              r.date >= reportStartDate && r.date <= reportEndDate && 
                              (reportUserFilter === 'all' || r.userId === reportUserFilter)
                          ).sort((a,b) => b.checkInTime - a.checkInTime).map(r => (
                              <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-6 py-4 text-sm text-gray-900">{new Date(r.date).toLocaleDateString('vi-VN')}</td>
                                  <td className="px-6 py-4 text-sm font-bold text-gray-900">{r.userName}</td>
                                  <td className="px-6 py-4 text-sm text-gray-900 font-mono">
                                      {new Date(r.checkInTime).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'})} - 
                                      {r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'}) : '...'}
                                  </td>
                                  <td className="px-6 py-4 text-sm text-gray-900 font-bold">{r.workHours ? r.workHours.toFixed(2) : '-'}</td>
                                  <td className="px-6 py-4 text-sm">
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold border ${
                                        r.status === 'approved' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'
                                    }`}>
                                        {r.status === 'approved' ? 'Hợp lệ' : 'Không hợp lệ'}
                                    </span>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
           </div>
        )}

        {activeTab === 'salary' && hasPermission('view_salary') && (
           <div className="space-y-6">
               <div className="flex justify-between items-center bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                   {/* ... (Salary Filter controls) ... */}
                   <div className="flex gap-4 items-center">
                        <div className="flex bg-gray-100 p-1 rounded-lg flex-nowrap">
                            <button onClick={setFilterWeek} className="px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-tight text-gray-700 hover:bg-white hover:shadow-sm transition-all whitespace-nowrap">Tuần này</button>
                            <button onClick={setFilterMonth} className="px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-tight text-gray-700 hover:bg-white hover:shadow-sm transition-all whitespace-nowrap">Tháng này</button>
                            <button onClick={setFilterYear} className="px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-tight text-gray-700 hover:bg-white hover:shadow-sm transition-all whitespace-nowrap">Năm này</button>
                        </div>
                        <div className="h-6 w-px bg-gray-300 mx-2"></div>
                        <div className="flex items-center gap-2">
                             <input 
                                type="date" 
                                value={reportStartDate} 
                                onChange={e => setReportStartDate(e.target.value)} 
                                className="border-black border-2 bg-blue-50 text-black p-1.5 rounded-lg text-sm font-medium shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                            />
                            <span className="text-gray-400">-</span>
                            <input 
                                type="date" 
                                value={reportEndDate} 
                                onChange={e => setReportEndDate(e.target.value)} 
                                className="border-black border-2 bg-blue-50 text-black p-1.5 rounded-lg text-sm font-medium shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                            />
                        </div>
                   </div>
                   <button onClick={exportSalaryExcel} className="bg-white border border-green-600 text-green-700 px-4 py-2 rounded-lg font-bold text-sm hover:bg-green-50 flex items-center shadow-sm transition-all">
                        <ArrowUpTrayIcon className="h-4 w-4 mr-2"/> Xuất Báo Cáo
                   </button>
               </div>
                
                {/* ... (Salary Cards and Table) ... */}
               <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                   <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 relative overflow-hidden group">
                       <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                       <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Tổng Giờ Công</p>
                       <p className="text-2xl font-black text-gray-900 group-hover:scale-105 transition-transform origin-left">{salaryReport.totalHours.toFixed(1)}h</p>
                   </div>
                   <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 relative overflow-hidden group">
                       <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
                       <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Tổng Lương Cứng</p>
                       <p className="text-2xl font-black text-gray-900 group-hover:scale-105 transition-transform origin-left">{formatVND(salaryReport.totalSalary)}</p>
                   </div>
                   <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 relative overflow-hidden group">
                       <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500"></div>
                       <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Thưởng / Phạt</p>
                       <p className="text-xl font-black text-gray-900 group-hover:scale-105 transition-transform origin-left">
                           <span className="text-green-600">+{formatVND(salaryReport.totalBonus)}</span> / 
                           <span className="text-red-600">-{formatVND(salaryReport.totalFine)}</span>
                       </p>
                   </div>
                   <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 relative overflow-hidden group">
                       <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
                       <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Tổng Thực Lãnh</p>
                       <p className="text-2xl font-black text-purple-900 group-hover:scale-105 transition-transform origin-left">{formatVND(salaryReport.totalNet)}</p>
                   </div>
               </div>

               <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200 max-h-[600px] overflow-y-auto">
                   <table className="min-w-full divide-y divide-gray-200 relative">
                        <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Mã NV</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Họ Tên</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Lương/h</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Số Ca</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Tổng Giờ (Hợp lệ)</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Lương Cứng</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Thưởng/Phạt</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Thực Lãnh</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {salaryReport.reportData.map((row: any) => (
                                <tr key={row.userId} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-mono text-gray-600">{row.code}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-gray-900">{row.name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{formatVND(row.rate)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600 font-medium">{row.shiftCount}</td>
                                    <td className="px-6 py-4 text-sm text-gray-900 font-bold">{row.hours.toFixed(2)}h</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{formatVND(row.salary)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        <span className="text-green-600 bg-green-50 px-1 rounded">+{formatVND(row.bonus)}</span> <span className="text-gray-300">|</span> <span className="text-red-600 bg-red-50 px-1 rounded">-{formatVND(row.fine)}</span>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-black text-purple-800">{formatVND(row.net)}</td>
                                </tr>
                            ))}
                        </tbody>
                   </table>
               </div>
           </div>
        )}

        {activeTab === 'rules' && hasPermission('manage_rules') && (
           <div className="bg-white p-8 rounded shadow h-full flex flex-col">
               <div className="flex justify-between items-center mb-6">
                   <h2 className="text-2xl font-bold text-gray-900">Nội quy công ty</h2>
                   {isEditingRules ? (
                       <div className="flex gap-2">
                           <button onClick={handleSaveRules} className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700 transition-colors">Lưu thay đổi</button>
                           <button onClick={() => setIsEditingRules(false)} className="bg-gray-200 text-gray-800 px-4 py-2 rounded font-bold hover:bg-gray-300 transition-colors">Hủy</button>
                       </div>
                   ) : (
                       <button onClick={() => { setTempRulesContent(rulesContent); setIsEditingRules(true); }} className="bg-gray-800 text-white px-4 py-2 rounded font-bold hover:bg-gray-900 transition-colors">Chỉnh sửa</button>
                   )}
               </div>
               
               {isEditingRules ? (
                   <textarea 
                        className="w-full flex-1 border p-4 rounded font-mono text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none transition-colors" 
                        value={tempRulesContent}
                        onChange={(e) => setTempRulesContent(e.target.value)}
                   />
               ) : (
                   <div className="prose max-w-none whitespace-pre-wrap text-gray-700 bg-gray-50 p-6 rounded border border-gray-100 flex-1 overflow-y-auto">
                       {rulesContent}
                   </div>
               )}
           </div>
        )}

        {activeTab === 'general' && hasPermission('manage_settings') && (
            <div className="max-w-5xl mx-auto space-y-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center">
                        <ComputerDesktopIcon className="h-5 w-5 text-blue-600 mr-2"/>
                        <h3 className="text-lg font-bold text-gray-900">Thông tin Hệ thống</h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Tên Công Ty / Cửa Hàng</label>
                            <input 
                                value={settings.companyName} 
                                onChange={e => setSettings({...settings, companyName: e.target.value})} 
                                className="w-full border border-gray-300 rounded-lg p-3 bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Logo Doanh nghiệp</label>
                            <div className="flex items-center gap-4">
                                <div className="h-16 w-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden group-hover:border-blue-500 transition-all">
                                    {settings.companyLogo ? (
                                        <img src={settings.companyLogo} className="h-full w-full object-contain" alt={settings.companyName + " Logo"}/>
                                    ) : (
                                        <PhotoIcon className="h-8 w-8 text-gray-400"/>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <input type="file" onChange={handleLogoUpload} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-colors" />
                                    <p className="text-xs text-gray-400 mt-1">PNG, JPG, GIF up to 2MB</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                     <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center">
                        <ShieldCheckIcon className="h-5 w-5 text-green-600 mr-2"/>
                        <h3 className="text-lg font-bold text-gray-900">Bảo mật & Vận hành</h3>
                    </div>
                    <div className="p-6 space-y-8">
                        <div>
                            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 border-b pb-2 flex items-center"><ClockIcon className="h-4 w-4 mr-2 text-gray-500"/>Thời gian Check-in</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Giờ mở hệ thống</label>
                                    <div className="relative">
                                        <ClockIcon className="h-5 w-5 text-gray-400 absolute left-3 top-2.5"/>
                                        <input 
                                            type="time" 
                                            value={settings.allowedCheckInStart} 
                                            onChange={e => setSettings({...settings, allowedCheckInStart: e.target.value})} 
                                            className="w-full pl-10 border border-gray-300 rounded-lg p-2.5 bg-white text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors" 
                                        />
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">Giờ sớm nhất nhân viên có thể chấm công.</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Giờ đóng hệ thống</label>
                                     <div className="relative">
                                        <ClockIcon className="h-5 w-5 text-gray-400 absolute left-3 top-2.5"/>
                                        <input 
                                            type="time" 
                                            value={settings.allowedCheckInEnd} 
                                            onChange={e => setSettings({...settings, allowedCheckInEnd: e.target.value})} 
                                            className="w-full pl-10 border border-gray-300 rounded-lg p-2.5 bg-white text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors" 
                                        />
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">Giờ muộn nhất nhân viên có thể chấm công.</p>
                                </div>
                            </div>
                        </div>

                        <div>
                             <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 border-b pb-2 flex items-center"><WifiIcon className="h-4 w-4 mr-2 text-gray-500"/>Bảo mật Mạng (IP)</h4>
                             <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-500 mb-1">IP Văn phòng Whitelist</label>
                                    <div className="relative flex items-center">
                                        <WifiIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"/>
                                        <input 
                                            value={settings.officeIp} 
                                            onChange={e => setSettings({...settings, officeIp: e.target.value})} 
                                            className="w-full pl-10 border border-gray-300 rounded-lg p-2.5 bg-white text-gray-900 font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" 
                                            placeholder="Để trống nếu không giới hạn" 
                                        />
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">Chỉ cho phép chấm công từ địa chỉ IP này.</p>
                                    <p className="text-xs text-gray-500 mt-2 font-semibold">IP hiện tại của bạn: <span className="font-mono text-blue-600">{currentAdminIp}</span></p>
                                </div>
                                <button onClick={handleSetCurrentIp} className="bg-gray-100 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-gray-200 border border-gray-300 flex items-center whitespace-nowrap transition-colors">
                                    <ArrowDownTrayIcon className="h-4 w-4 mr-1 text-gray-600"/> Lấy IP Hiện tại
                                </button>
                             </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button onClick={handleSaveSettings} className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold text-lg hover:bg-blue-700 shadow-lg hover:shadow-xl transition-all flex items-center">
                        <CheckCircleIcon className="h-6 w-6 mr-2" /> Lưu Cấu Hình
                    </button>
                </div>
            </div>
        )}

      </div>
      
      {isShiftAssignmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm transition-all duration-300">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all ring-1 ring-black/5">
                
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 relative">
                    <h3 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                        {shiftAssignmentForm.id ? <PencilSquareIcon className="h-6 w-6 text-blue-200"/> : <PlusIcon className="h-6 w-6 text-blue-200"/>}
                        {shiftAssignmentForm.id ? 'Cập Nhật Lịch Làm Việc' : 'Phân Ca Làm Việc Mới'}
                    </h3>
                    <p className="text-blue-100 text-sm font-medium mt-1">
                        {shiftAssignmentForm.id ? 'Điều chỉnh thông tin ca làm việc cho nhân viên' : 'Sắp xếp lịch làm việc cho nhân viên trong tuần'}
                    </p>
                    <button onClick={() => setIsShiftAssignmentModalOpen(false)} className="absolute top-4 right-4 text-blue-200 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all">
                        <XCircleIcon className="h-6 w-6"/>
                    </button>
                </div>
                
                <div className="p-8 space-y-6">
                    
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Nhân viên</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <UserGroupIcon className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors"/>
                            </div>
                            <select 
                                value={shiftAssignmentForm.userId}
                                onChange={(e) => setShiftAssignmentForm({...shiftAssignmentForm, userId: e.target.value})}
                                className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all outline-none"
                                disabled={!!shiftAssignmentForm.id}
                            >
                                <option value="">-- Chọn nhân viên --</option>
                                {users.filter(u => u.role === 'staff').map(u => (
                                    <option key={u.id} value={u.id}>{u.name} ({u.code})</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Ngày làm việc</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <CalendarDaysIcon className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors"/>
                            </div>
                            <input 
                                type="date"
                                value={shiftAssignmentForm.date}
                                onChange={(e) => setShiftAssignmentForm({...shiftAssignmentForm, date: e.target.value})}
                                className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all outline-none"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Ca làm việc (Có thể chọn nhiều)</label>
                        <div className="border border-gray-200 rounded-xl p-3 bg-gray-50 max-h-60 overflow-y-auto space-y-2">
                            {shifts.map(s => (
                                <label key={s.id} className="flex items-center p-3 bg-white border border-gray-100 rounded-lg hover:border-blue-400 cursor-pointer transition-all shadow-sm">
                                    <input 
                                        type="checkbox"
                                        checked={shiftAssignmentForm.shiftIds.includes(s.id)}
                                        onChange={(e) => {
                                            const current = shiftAssignmentForm.shiftIds;
                                            if (e.target.checked) {
                                                setShiftAssignmentForm({...shiftAssignmentForm, shiftIds: [...current, s.id]});
                                            } else {
                                                setShiftAssignmentForm({...shiftAssignmentForm, shiftIds: current.filter(id => id !== s.id)});
                                            }
                                        }}
                                        className="h-5 w-5"
                                    />
                                    <div className="ml-3 flex-1">
                                        <div className="text-sm font-bold text-gray-900">{s.name}</div>
                                        <div className="text-xs text-gray-500">{s.startTime} - {s.endTime}</div>
                                    </div>
                                </label>
                            ))}
                            {shifts.length === 0 && <p className="text-sm text-gray-500 italic p-2">Chưa có ca làm việc nào được cấu hình.</p>}
                        </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                        <button 
                            onClick={() => setIsShiftAssignmentModalOpen(false)}
                            className="flex-1 px-6 py-3.5 rounded-xl text-gray-700 font-bold bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-all text-sm uppercase tracking-wide"
                        >
                            Hủy bỏ
                        </button>
                        <button 
                            onClick={handleSaveShiftAssignment}
                            className="flex-1 px-6 py-3.5 rounded-xl text-white font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-all text-sm uppercase tracking-wide flex justify-center items-center gap-2"
                        >
                            <CheckCircleIcon className="h-5 w-5"/>
                            Lưu Thay Đổi
                        </button>
                    </div>
                </div>
            </div>
        </div>
     )}
    </div>
  );
};

export default AdminPanel;