import React, { useState, useEffect, useRef } from 'react';
import { User, Shift, AttendanceRecord, ShiftRegistration, SalaryAdjustment } from '../types';
import { db } from '../database';
import { fetchPublicIp } from '../geo';
import { 
  ClockIcon, ExclamationTriangleIcon, CalendarDaysIcon, 
  ClipboardDocumentListIcon, CurrencyDollarIcon, 
  BellAlertIcon, UserCircleIcon, 
  WifiIcon, CheckCircleIcon as CheckIcon, XCircleIcon as XIcon, ArrowPathIcon,
  ChevronLeftIcon, ChevronRightIcon,
  SignalIcon,
  SunIcon,
  MoonIcon,
  InformationCircleIcon,
  TrashIcon,
  EnvelopeIcon,
  PhoneIcon,
  BuildingOfficeIcon,
  CreditCardIcon,
  IdentificationIcon,
  ArrowRightOnRectangleIcon,
  CameraIcon
} from '@heroicons/react/24/outline'; 

interface StaffPanelProps {
  user: User;
  onLogout: () => void;
  onUpdateUser?: (user: User) => void;
}

type ValidationStatus = 'pending' | 'valid' | 'invalid';
interface ValidationResult {
    isValid: boolean;
    messages: string[];
    details: {
        time: ValidationStatus;
        ip: ValidationStatus;
    };
    currentIp?: string;
}

interface PopupState {
    show: boolean;
    message: string;
    type: 'success' | 'warning';
}

const StaffPanel: React.FC<StaffPanelProps> = ({ user, onLogout, onUpdateUser }) => {
  const [activeRecord, setActiveRecord] = useState<AttendanceRecord | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null); 
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedShift, setSelectedShift] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(new Date());

  const [notificationPopup, setNotificationPopup] = useState<PopupState>({ show: false, message: '', type: 'success' });

  const [confirmState, setConfirmState] = useState<{
      show: boolean;
      registration?: ShiftRegistration;
  }>({ show: false });

  const [showReminder, setShowReminder] = useState(false);
  const [isWithinCompanyIP, setIsWithinCompanyIP] = useState<boolean | null>(null);
  const [lastInteractionTime, setLastInteractionTime] = useState(Date.now());

  const [viewMode, setViewMode] = useState<'main' | 'profile' | 'history' | 'register' | 'salary'>('main');
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [adjustments, setAdjustments] = useState<SalaryAdjustment[]>([]);
  
  const [registrations, setRegistrations] = useState<ShiftRegistration[]>([]);
  const [regDate, setRegDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([]); 

  const [viewDate, setViewDate] = useState(new Date());

  const [historyTab, setHistoryTab] = useState<'attendance' | 'registration'>('attendance');
  const todayStr = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  
  const [historyStartDate, setHistoryStartDate] = useState(firstDayOfMonth);
  const [historyEndDate, setHistoryEndDate] = useState(todayStr);

  const [salaryStartDate, setSalaryStartDate] = useState<string>(firstDayOfMonth);
  const [salaryEndDate, setSalaryEndDate] = useState<string>(todayStr);

  const [currentValidationResult, setCurrentValidationResult] = useState<ValidationResult | null>(null);
  const [isLoadingValidation, setIsLoadingValidation] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const reminderTimerRef = useRef<number | null>(null);
  const popupTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    
    const loadData = async () => {
        try {
            const existing = await db.getActiveCheckIn(user.id);
            setActiveRecord(existing);
            
            const allShifts = await db.getShifts();
            setShifts(allShifts);

            const allAttendance = await db.getAttendance();
            const userHistory = allAttendance.filter(r => r.userId === user.id).sort((a,b) => b.checkInTime - a.checkInTime);
            setHistory(userHistory);

            const allRegs = await db.getShiftRegistrations();
            const userRegs = allRegs.filter(r => r.userId === user.id).sort((a,b) => b.date.localeCompare(a.date));
            setRegistrations(userRegs);

            const allAdjustments = await db.getAdjustments();
            setAdjustments(allAdjustments);
            
            if(allShifts.length > 0) {
                const suggestedShift = getSuggestedShift(allShifts, userRegs);
                setSelectedShift(suggestedShift?.id || allShifts[0].id);
            }
        } catch (e) {
            console.error("Error loading staff data", e);
        }
    };
    loadData();

    reminderTimerRef.current = window.setInterval(checkReminderConditions, 30 * 1000);
    checkReminderConditions();

    const handleInteraction = () => setLastInteractionTime(Date.now());
    window.addEventListener('mousedown', handleInteraction);
    window.addEventListener('keydown', handleInteraction);

    return () => {
      clearInterval(timer);
      if (reminderTimerRef.current) clearInterval(reminderTimerRef.current);
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
      window.removeEventListener('mousedown', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, [user.id]);

  useEffect(() => {
    if (notificationPopup.show) {
        if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
        popupTimerRef.current = window.setTimeout(() => {
            setNotificationPopup(prev => ({ ...prev, show: false }));
        }, 3000);
    }
  }, [notificationPopup.show]);

  const showPopup = (message: string, type: 'success' | 'warning') => {
      setNotificationPopup({ show: true, message, type });
  };

  const getSuggestedShift = (allShifts: Shift[], userRegistrations: ShiftRegistration[]): Shift | undefined => {
      const now = new Date();
      const currentHM = now.toTimeString().slice(0, 5);
      const today = now.toISOString().split('T')[0];

      const approvedRegToday = userRegistrations.find(r => r.date === today && r.status === 'approved');
      if (approvedRegToday) {
          const shift = allShifts.find(s => s.id === approvedRegToday.shiftId);
          if (shift) {
              const [sh, sm] = shift.startTime.split(':').map(Number);
              const [eh, em] = shift.endTime.split(':').map(Number);
              const shiftStart = new Date(now);
              shiftStart.setHours(sh, sm, 0, 0);
              const shiftEnd = new Date(now);
              shiftEnd.setHours(eh, em, 0, 0);
              const checkInWindowStart = new Date(shiftStart.getTime() - (30 * 60 * 1000));
              if (now >= checkInWindowStart && now <= shiftEnd) return shift;
          }
      }
      return allShifts.find(s => currentHM >= s.startTime && currentHM <= s.endTime);
  };

  const checkReminderConditions = async () => {
    const settings = await db.getSettings();
    
    let ipMatch = false;
    try {
        const publicIp = await fetchPublicIp();
        if (settings.officeIp && settings.officeIp.trim() !== '') {
          ipMatch = (settings.officeIp === publicIp);
        } else {
          ipMatch = true;
        }
        setIsWithinCompanyIP(ipMatch);
    } catch (e) {
        setIsWithinCompanyIP(false);
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const allRegs = await db.getShiftRegistrations();
    const hasRelevantShift = allRegs.some(r => {
        if (r.userId !== user.id || r.date !== today || r.status !== 'approved') return false;
        const shift = shifts.find(s => s.id === r.shiftId);
        if (!shift) return false;
        const [sh, sm] = shift.startTime.split(':').map(Number);
        const [eh, em] = shift.endTime.split(':').map(Number);
        const sTime = new Date(now); sTime.setHours(sh, sm, 0, 0);
        const eTime = new Date(now); eTime.setHours(eh, em, 0, 0);
        return now >= new Date(sTime.getTime() - 30 * 60000) && now <= eTime;
    });

    const timeSinceLastInteraction = Date.now() - lastInteractionTime;
    const shouldRemind = ipMatch && hasRelevantShift && !activeRecord && timeSinceLastInteraction > 10000;
    setShowReminder(shouldRemind);
  };

  const validateTimeAndLocation = async (): Promise<ValidationResult> => {
    const settings = await db.getSettings();
    let currentMessages: string[] = [];
    let currentDetails: ValidationResult['details'] = { time: 'pending', ip: 'pending' };
    let overallValid = true;

    const now = new Date();
    const currentHM = now.toTimeString().slice(0, 5);
    const startHM = settings.allowedCheckInStart || '00:00';
    const endHM = settings.allowedCheckInEnd || '23:59';
    const isAllowedTime = startHM <= endHM ? (currentHM >= startHM && currentHM <= endHM) : (currentHM >= startHM || currentHM <= endHM);
    
    if (!isAllowedTime) {
        currentMessages.push(`Chấm công ngoài giờ quy định (${startHM} - ${endHM}).`);
        currentDetails.time = 'invalid';
        overallValid = false;
    } else {
        currentDetails.time = 'valid';
    }

    let publicIp = '';
    try {
        publicIp = await fetchPublicIp();
        if (settings.officeIp && settings.officeIp.trim() !== '' && settings.officeIp !== publicIp) {
            currentMessages.push(`Địa chỉ IP (${publicIp}) không thuộc văn phòng.`);
            currentDetails.ip = 'invalid';
            overallValid = false;
        } else {
            currentDetails.ip = 'valid';
        }
    } catch {
        currentMessages.push("Không thể xác thực địa chỉ IP.");
        currentDetails.ip = 'invalid';
        overallValid = false;
    }

    return { isValid: overallValid, messages: currentMessages, details: currentDetails, currentIp: publicIp };
  };

  const executeAttendance = async (ip: string) => {
    setLoading(true);
    try {
        if (!activeRecord) {
            const newRecord: AttendanceRecord = {
                id: Date.now().toString(),
                userId: user.id,
                userName: user.name,
                date: new Date().toISOString().split('T')[0],
                checkInTime: Date.now(),
                status: 'approved',
                ipAddress: ip,
                shiftId: selectedShift,
            };
            await db.addAttendance(newRecord);
            setActiveRecord(newRecord);
            setSuccess("Check-in thành công!");
        } else {
            const checkOutTime = Date.now();
            const workHours = (checkOutTime - activeRecord.checkInTime) / 3600000;
            const updated: AttendanceRecord = { 
                ...activeRecord, 
                checkOutTime, 
                workHours, 
            };
            await db.updateAttendance(updated);
            setActiveRecord(undefined);
            setSuccess("Checkout thành công!");
        }
        const allAttendance = await db.getAttendance();
        setHistory(allAttendance.filter(r => r.userId === user.id).sort((a,b) => b.checkInTime - a.checkInTime));
    } catch (err: any) {
        setError(err.message);
    } finally {
        setLoading(false);
    }
  };

  const initiateAction = async () => {
    setIsLoadingValidation(true);
    setError(null); setSuccess(null);
    const result = await validateTimeAndLocation();
    setCurrentValidationResult(result);
    setIsLoadingValidation(false);
    
    if (result.isValid && result.currentIp) {
        executeAttendance(result.currentIp);
    }
  };

  const handleRegisterShift = async () => {
      if (selectedShiftIds.length === 0 || !regDate) return alert("Vui lòng chọn ít nhất một ca làm việc!");
      
      const allRegs = await db.getShiftRegistrations();
      let successCount = 0;
      
      for (const shiftId of selectedShiftIds) {
          const shift = shifts.find(s => s.id === shiftId);
          if (!shift) continue;
          
          const exists = allRegs.find(r => r.userId === user.id && r.date === regDate && r.shiftId === shiftId);
          if (exists) continue; 

          const newReg: ShiftRegistration = {
              id: Date.now().toString() + Math.random().toString(),
              userId: user.id,
              userName: user.name,
              shiftId: shiftId,
              shiftName: shift.name,
              date: regDate,
              status: 'approved'
          };
          await db.addShiftRegistration(newReg);
          successCount++;
      }

      if (successCount > 0) {
          const updatedRegs = await db.getShiftRegistrations();
          setRegistrations(updatedRegs.filter(r => r.userId === user.id).sort((a,b) => b.date.localeCompare(a.date)));
          showPopup("Đã đăng ký ca thành công", "success");
          setSelectedShiftIds([]); 
      } else {
          alert("Các ca đã chọn đều đã được đăng ký trước đó.");
      }
  };

  const handleConfirmAction = async () => {
      const { registration } = confirmState;
      if (!registration) return;

      await db.deleteShiftRegistration(registration.id);
      const updatedRegs = await db.getShiftRegistrations();
      setRegistrations(updatedRegs.filter(r => r.userId === user.id).sort((a,b) => b.date.localeCompare(a.date)));
      showPopup("Đã xóa đăng ký", "success");
      
      setConfirmState({ ...confirmState, show: false });
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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsUploadingAvatar(true);
      try {
          const base64Avatar = await resizeImage(file);
          const updatedUser: User = { ...user, avatar: base64Avatar };
          
          await db.updateUser(updatedUser);
          
          if (onUpdateUser) {
              onUpdateUser(updatedUser);
          }
          showPopup("Đã cập nhật ảnh đại diện!", "success");
      } catch (error) {
          console.error("Avatar upload error:", error);
          showPopup("Lỗi khi tải ảnh lên. Vui lòng thử lại.", "warning");
      } finally {
          setIsUploadingAvatar(false);
      }
  };

  const getSalaryReport = () => {
      const userAttendance = history.filter(r => 
          r.userId === user.id && 
          r.date >= salaryStartDate && 
          r.date <= salaryEndDate && 
          r.status === 'approved'
      );
      const userAdjustments = adjustments.filter(a => 
          a.userId === user.id &&
          a.date >= salaryStartDate &&
          a.date <= salaryEndDate
      );

      let hours = 0;
      let salary = 0;
      userAttendance.forEach(r => {
          if (r.workHours) {
              hours += r.workHours;
              const shift = shifts.find(s => s.id === r.shiftId);
              const rate = shift ? shift.hourlyRate : (user.baseHourlyRate || 25000);
              salary += r.workHours * rate;
          }
      });
      const bonus = userAdjustments.filter(a => a.type === 'bonus').reduce((s, a) => s + a.amount, 0);
      const fine = userAdjustments.filter(a => a.type === 'fine').reduce((s, a) => s + a.amount, 0);
      const net = salary + bonus - fine;

      return { hours, salary, bonus, fine, net, adjustments: userAdjustments };
  };

  const salaryData = getSalaryReport();
  const formatVND = (amount: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

  const renderHeader = (title: string) => (
    <div className="flex items-center gap-4 mb-6">
        <button 
            onClick={() => setViewMode('main')} 
            className="p-2 hover:bg-gray-200 rounded-full transition-all group flex items-center justify-center active:scale-90"
            aria-label="Quay lại"
        >
            <ChevronLeftIcon className="h-6 w-6 text-gray-900"/>
        </button>
        <h2 className="text-xl font-black text-gray-900">{title}</h2>
    </div>
  );

  // Profile View Rendering
  if (viewMode === 'profile') {
      return (
        <div className="max-w-md mx-auto p-4 space-y-6 min-h-screen bg-gray-50">
            {renderHeader("Thông tin nhân viên")}
            
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-gray-100 flex flex-col items-center">
                <div className="relative group mb-6">
                    <div className="h-28 w-28 rounded-full overflow-hidden border-4 border-white shadow-lg bg-gray-100 flex items-center justify-center">
                         {user.avatar ? (
                             <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" />
                         ) : (
                             <div className="h-full w-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-4xl">
                                {user.name.charAt(0)}
                             </div>
                         )}
                    </div>
                    
                    <label className="absolute bottom-0 right-0 p-2 bg-white rounded-full shadow-md cursor-pointer hover:bg-gray-50 transition-colors border border-gray-200 group-hover:scale-105 active:scale-95">
                        {isUploadingAvatar ? (
                             <ArrowPathIcon className="h-5 w-5 text-blue-600 animate-spin"/>
                        ) : (
                             <CameraIcon className="h-5 w-5 text-gray-600"/>
                        )}
                        <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" disabled={isUploadingAvatar} />
                    </label>
                </div>

                <h3 className="text-2xl font-black text-gray-900">{user.name}</h3>
                <span className="text-xs font-black text-blue-600 uppercase tracking-widest mt-1 bg-blue-50 px-3 py-1 rounded-full">
                    {user.role === 'admin' ? 'Quản trị viên' : user.role === 'manager' ? 'Quản lý' : 'Nhân viên'}
                </span>

                <div className="w-full mt-10 space-y-6">
                    <div className="flex items-center gap-4 group">
                        <div className="p-3 bg-gray-50 rounded-2xl group-hover:bg-blue-50 transition-colors">
                            <IdentificationIcon className="h-6 w-6 text-gray-400 group-hover:text-blue-600"/>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mã nhân viên</p>
                            <p className="text-sm font-bold text-gray-900">{user.code || 'Chưa cập nhật'}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 group">
                        <div className="p-3 bg-gray-50 rounded-2xl group-hover:bg-blue-50 transition-colors">
                            <EnvelopeIcon className="h-6 w-6 text-gray-400 group-hover:text-blue-600"/>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Email</p>
                            <p className="text-sm font-bold text-gray-900">{user.email}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 group">
                        <div className="p-3 bg-gray-50 rounded-2xl group-hover:bg-blue-50 transition-colors">
                            <PhoneIcon className="h-6 w-6 text-gray-400 group-hover:text-blue-600"/>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Số điện thoại</p>
                            <p className="text-sm font-bold text-gray-900">{user.phone || 'Chưa cập nhật'}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 group">
                        <div className="p-3 bg-gray-50 rounded-2xl group-hover:bg-blue-50 transition-colors">
                            <BuildingOfficeIcon className="h-6 w-6 text-gray-400 group-hover:text-blue-600"/>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Bộ phận</p>
                            <p className="text-sm font-bold text-gray-900">{user.department || 'Chưa cập nhật'}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 group">
                        <div className="p-3 bg-gray-50 rounded-2xl group-hover:bg-blue-50 transition-colors">
                            <CreditCardIcon className="h-6 w-6 text-gray-400 group-hover:text-blue-600"/>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tài khoản ngân hàng</p>
                            <p className="text-sm font-bold text-gray-900">{user.bankAccount || 'Chưa cập nhật'}</p>
                        </div>
                    </div>
                </div>

                <button 
                    onClick={onLogout}
                    className="w-full mt-12 py-4 bg-gray-100 text-gray-600 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-red-50 hover:text-red-600 transition-all flex items-center justify-center gap-2"
                >
                    <ArrowRightOnRectangleIcon className="h-5 w-5"/>
                    Đăng xuất
                </button>
            </div>
        </div>
      );
  }

  // Salary View Rendering
  if (viewMode === 'salary') {
      return (
        <div className="max-w-md mx-auto p-4 space-y-6 min-h-screen bg-gray-50">
            {renderHeader("Báo cáo thu nhập")}
            
            <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-gray-100 space-y-6">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest block mb-1">Từ ngày</label>
                        <input type="date" value={salaryStartDate} onChange={e => setSalaryStartDate(e.target.value)} className="w-full border-black border-2 rounded-xl p-3 text-sm font-bold bg-blue-50 text-black outline-none focus:ring-2 focus:ring-indigo-100 transition-all"/>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest block mb-1">Đến ngày</label>
                        <input type="date" value={salaryEndDate} onChange={e => setSalaryEndDate(e.target.value)} className="w-full border-black border-2 rounded-xl p-3 text-sm font-bold bg-blue-50 text-black outline-none focus:ring-2 focus:ring-indigo-100 transition-all"/>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 p-4 rounded-3xl border border-blue-100">
                        <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Tổng giờ công</p>
                        <p className="text-xl font-black text-blue-900">{salaryData.hours.toFixed(1)}h</p>
                    </div>
                    <div className="bg-emerald-50 p-4 rounded-3xl border border-emerald-100">
                        <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Lương cứng</p>
                        <p className="text-xl font-black text-emerald-900">{formatVND(salaryData.salary)}</p>
                    </div>
                </div>

                <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-600">Thưởng (+)</span>
                        <span className="text-sm font-black text-green-600">+{formatVND(salaryData.bonus)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-600">Phạt (-)</span>
                        <span className="text-sm font-black text-red-600">-{formatVND(salaryData.fine)}</span>
                    </div>
                    <div className="pt-3 border-t border-gray-200 flex justify-between items-center">
                        <span className="text-sm font-black text-gray-900 uppercase tracking-widest">Thực lãnh</span>
                        <span className="text-xl font-black text-purple-600">{formatVND(salaryData.net)}</span>
                    </div>
                </div>

                {salaryData.adjustments.length > 0 && (
                    <div className="space-y-4 pt-4">
                        <h4 className="text-[10px] font-black text-gray-700 uppercase tracking-[0.2em]">CHI TIẾT ĐIỀU CHỈNH</h4>
                        <div className="space-y-3">
                            {salaryData.adjustments.map(adj => (
                                <div key={adj.id} className="flex justify-between items-center p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                                    <div className="space-y-1">
                                        <p className="text-xs font-black text-gray-900">{adj.reason}</p>
                                        <p className="text-[10px] font-bold text-gray-400">{new Date(adj.date).toLocaleDateString('vi-VN')}</p>
                                    </div>
                                    <span className={`text-sm font-black ${adj.type === 'bonus' ? 'text-green-600' : 'text-red-600'}`}>
                                        {adj.type === 'bonus' ? '+' : '-'}{formatVND(adj.amount)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
      );
  }

  if (viewMode === 'history') {
      return (
        <div className="max-w-md mx-auto p-4 space-y-6 min-h-screen bg-gray-50">
            {renderHeader("Lịch sử hoạt động")}
            
            <div className="flex bg-gray-200 p-1 rounded-xl mb-4 shadow-inner">
                <button onClick={() => setHistoryTab('attendance')} className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${historyTab === 'attendance' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>Ngày Công</button>
                <button onClick={() => setHistoryTab('registration')} className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${historyTab === 'registration' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>Lịch Đăng Ký</button>
            </div>

            <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest block mb-1">Từ ngày</label>
                        <input type="date" value={historyStartDate} onChange={e => setHistoryStartDate(e.target.value)} className="w-full border-black border-2 rounded-xl p-3 text-sm font-bold bg-blue-50 text-black outline-none focus:ring-2 focus:ring-indigo-100 transition-all"/>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest block mb-1">Đến ngày</label>
                        <input type="date" value={historyEndDate} onChange={e => setHistoryEndDate(e.target.value)} className="w-full border-black border-2 rounded-xl p-3 text-sm font-bold bg-blue-50 text-black outline-none focus:ring-2 focus:ring-indigo-100 transition-all"/>
                    </div>
                </div>

                <div className="space-y-3 pt-2">
                    {historyTab === 'attendance' ? (
                        history.filter(r => r.date >= historyStartDate && r.date <= historyEndDate).length === 0 ? (
                            <p className="text-center text-gray-400 py-12 text-sm italic">Chưa có dữ liệu chấm công.</p>
                        ) : (
                            history.filter(r => r.date >= historyStartDate && r.date <= historyEndDate).map(r => (
                                <div key={r.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <div className="space-y-1">
                                        <p className="text-sm font-black text-gray-900">{new Date(r.date).toLocaleDateString('vi-VN')}</p>
                                        <p className="text-[10px] font-bold text-gray-600 uppercase">{shifts.find(s => s.id === r.shiftId)?.name || 'Ngoài ca'}</p>
                                    </div>
                                    <div className="text-right space-y-1">
                                        <p className="text-sm font-mono font-bold text-gray-700">
                                            {new Date(r.checkInTime).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'})} - 
                                            {r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'}) : '...'}
                                        </p>
                                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${r.status === 'approved' ? 'bg-green-100 text-green-800 border-green-200' : r.status === 'rejected' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-yellow-100 text-yellow-800 border-yellow-200'}`}>
                                            {r.status === 'approved' ? 'Hợp lệ' : r.status === 'rejected' ? 'Bị loại' : 'Chờ duyệt'}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )
                    ) : (
                        registrations.filter(r => r.date >= historyStartDate && r.date <= historyEndDate).length === 0 ? (
                            <p className="text-center text-gray-400 py-12 text-sm italic">Chưa có đăng ký ca.</p>
                        ) : (
                            registrations.filter(r => r.date >= historyStartDate && r.date <= historyEndDate).map(r => (
                                <div key={r.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <div className="space-y-1">
                                        <p className="text-sm font-black text-gray-900">{new Date(r.date).toLocaleDateString('vi-VN')}</p>
                                        <p className="text-[10px] font-bold text-gray-500 uppercase">{r.shiftName}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-full border ${r.status === 'approved' ? 'bg-green-100 text-green-800 border-green-200' : r.status === 'rejected' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-yellow-100 text-yellow-800 border-yellow-200'}`}>
                                            {r.status === 'approved' ? 'Đã đăng ký' : r.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt'}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )
                    )}
                </div>
            </div>
        </div>
      );
  }

  if (viewMode === 'register') {
      const getStartOfWeek = (date: Date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
        return new Date(d.setDate(diff));
      };

      const startOfWeek = getStartOfWeek(viewDate);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      const weekDates: Date[] = [];
      for (let i = 0; i < 7; i++) {
          const d = new Date(startOfWeek);
          d.setDate(startOfWeek.getDate() + i);
          weekDates.push(d);
      }

      const weekDays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

      const isSelected = (d: Date) => {
        const dateStr = d.toISOString().split('T')[0];
        return dateStr === regDate;
      };

      const isToday = (d: Date) => {
        const now = new Date();
        return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      };
      
      const getRegistrationStatus = (d: Date) => {
         const dateStr = d.toISOString().split('T')[0];
         const regs = registrations.filter(r => r.date === dateStr);
         if (regs.length === 0) return null;
         if (regs.some(r => r.status === 'approved')) return 'approved';
         if (regs.some(r => r.status === 'rejected')) return 'rejected';
         return 'pending';
      };

      const handleDateClick = (d: Date) => {
         const dateStr = d.toISOString().split('T')[0];
         setRegDate(dateStr);
         setSelectedShiftIds([]); 
      };

      const changeWeek = (offset: number) => {
        const newDate = new Date(viewDate);
        newDate.setDate(newDate.getDate() + (offset * 7));
        setViewDate(newDate);
      };

      return (
        <div className="max-w-md mx-auto p-4 space-y-6 min-h-screen bg-gray-50">
            {renderHeader("Đăng ký ca làm việc")}
            
            {confirmState.show && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm transition-all duration-300">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all">
                        <div className="p-6 border-b flex items-center gap-4 bg-red-50 border-red-100">
                            <div className="p-2 rounded-full bg-red-100">
                                <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                            </div>
                            <h3 className="text-lg font-black text-red-900">Xác nhận xóa</h3>
                        </div>
                        <div className="p-6">
                            <p className="text-gray-700 font-medium leading-relaxed">
                                Bạn có chắc chắn muốn xóa đăng ký ca "{confirmState.registration?.shiftName}" ngày {new Date(confirmState.registration?.date || '').toLocaleDateString('vi-VN')} không?
                            </p>
                        </div>
                        <div className="bg-gray-50 px-6 py-4 flex gap-3 justify-end">
                            <button 
                                onClick={() => setConfirmState({ show: false })}
                                className="flex-1 py-3 px-4 rounded-xl text-gray-700 font-bold bg-white border border-gray-300 hover:bg-gray-100 transition-colors"
                            >
                                Hủy bỏ
                            </button>
                            <button 
                                onClick={handleConfirmAction}
                                className="flex-1 py-3 px-4 rounded-xl text-white font-bold bg-red-600 hover:bg-red-700 shadow-lg shadow-red-500/20 transition-all"
                            >
                                Đồng ý
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-gray-100 space-y-6">
                
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-start gap-3">
                    <InformationCircleIcon className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-900 font-medium leading-relaxed">
                        Lưu ý: Vui lòng thông báo cho quản lý nếu thay đổi lịch gấp.
                    </p>
                </div>

                <div className="bg-gray-50/50 rounded-3xl border-2 border-gray-100 p-4 mb-2">
                    <div className="flex justify-between items-center px-2 mb-4">
                        <button onClick={() => changeWeek(-1)} className="p-2 hover:bg-white hover:shadow-sm rounded-full transition-all">
                            <ChevronLeftIcon className="h-4 w-4 text-gray-600"/>
                        </button>
                        <div className="text-center">
                            <span className="block text-sm font-black text-gray-900 capitalize">
                                Tháng {startOfWeek.getMonth() + 1}, {startOfWeek.getFullYear()}
                            </span>
                            <span className="text-[10px] font-bold text-gray-500">
                                {startOfWeek.getDate()}/{startOfWeek.getMonth() + 1} - {endOfWeek.getDate()}/{endOfWeek.getMonth() + 1}
                            </span>
                        </div>
                        <button onClick={() => changeWeek(1)} className="p-2 hover:bg-white hover:shadow-sm rounded-full transition-all">
                            <ChevronRightIcon className="h-4 w-4 text-gray-600"/>
                        </button>
                    </div>

                    <div className="grid grid-cols-7 gap-2">
                        {weekDays.map(d => (
                            <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider py-1">{d}</div>
                        ))}
                        
                        {weekDates.map((dateObj, i) => {
                            const status = getRegistrationStatus(dateObj);
                            const selected = isSelected(dateObj);
                            const today = isToday(dateObj);
                            
                            return (
                                <div 
                                    key={i} 
                                    onClick={() => handleDateClick(dateObj)}
                                    className={`
                                        aspect-square rounded-xl flex flex-col items-center justify-center relative cursor-pointer transition-all border
                                        ${selected 
                                            ? 'bg-purple-600 text-white shadow-lg shadow-purple-200 border-purple-600 scale-105 z-10' 
                                            : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200'
                                        }
                                        ${today && !selected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
                                    `}
                                >
                                    <span className={`text-sm font-bold ${selected ? 'text-white' : 'text-gray-900'}`}>{dateObj.getDate()}</span>
                                    
                                    {status && (
                                        <div className="flex gap-0.5 mt-1">
                                            <div className={`w-1.5 h-1.5 rounded-full ${
                                                status === 'approved' ? 'bg-green-500' : 
                                                status === 'rejected' ? 'bg-red-500' : 'bg-yellow-400'
                                            } ${selected ? 'ring-1 ring-white' : ''}`}></div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-gray-100">
                    <div>
                        <label className="text-[10px] font-black text-gray-700 uppercase tracking-[0.2em] mb-2 block">NGÀY ĐÃ CHỌN</label>
                        <div className="w-full border-2 border-purple-100 rounded-2xl p-4 text-sm font-black text-purple-900 bg-purple-50 text-center">
                            {new Date(regDate).toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-gray-700 uppercase tracking-[0.2em] mb-3 block">CHỌN CA LÀM VIỆC</label>
                        <div className="grid grid-cols-3 gap-3">
                             {shifts.map(s => {
                                 const existingReg = registrations.find(r => r.date === regDate && r.shiftId === s.id);
                                 const isSelected = selectedShiftIds.includes(s.id);
                                 
                                 return (
                                     <div key={s.id} 
                                          onClick={() => {
                                              if (existingReg) return;
                                              if (isSelected) {
                                                  setSelectedShiftIds(prev => prev.filter(id => id !== s.id));
                                              } else {
                                                  setSelectedShiftIds(prev => [...prev, s.id]);
                                              }
                                          }}
                                          className={`
                                            relative flex flex-col items-center justify-center p-3 h-28 rounded-2xl border-2 transition-all duration-200 cursor-pointer text-center
                                            ${existingReg 
                                                ? 'bg-gray-50 border-gray-100 opacity-60 cursor-not-allowed' 
                                                : isSelected 
                                                    ? 'bg-indigo-50 border-indigo-500 shadow-md shadow-indigo-100' 
                                                    : 'bg-white border-gray-100 hover:border-indigo-200 hover:shadow-sm'
                                            }
                                          `}
                                     >
                                        <div className={`
                                            w-8 h-8 rounded-lg flex items-center justify-center mb-2 transition-colors
                                            ${existingReg 
                                                ? 'bg-gray-200 text-gray-500' 
                                                : isSelected 
                                                    ? 'bg-indigo-500 text-white' 
                                                    : 'bg-blue-50 text-blue-500'
                                            }
                                        `}>
                                            {parseInt(s.startTime) < 12 ? <SunIcon className="h-5 w-5"/> : <MoonIcon className="h-5 w-5"/>}
                                        </div>
                                        
                                        <h4 className={`text-[10px] font-black uppercase tracking-wide leading-tight mb-1 ${existingReg ? 'text-gray-500' : isSelected ? 'text-indigo-900' : 'text-gray-900'}`}>
                                            {s.name}
                                        </h4>
                                        <p className={`text-[9px] font-bold ${existingReg ? 'text-gray-400' : isSelected ? 'text-indigo-600' : 'text-gray-500'}`}>
                                            {s.startTime} - {s.endTime}
                                        </p>
                                        
                                        <div className="absolute top-2 right-2">
                                            {existingReg ? (
                                                <div className={`w-2 h-2 rounded-full ${
                                                    existingReg.status === 'approved' ? 'bg-green-500' :
                                                    existingReg.status === 'rejected' ? 'bg-red-500' :
                                                    'bg-yellow-400'
                                                }`}></div>
                                            ) : isSelected && (
                                                <CheckIcon className="h-4 w-4 text-indigo-600"/>
                                            )}
                                        </div>

                                        {existingReg && (
                                            <div className="absolute bottom-2 w-full text-center">
                                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${
                                                    existingReg.status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' :
                                                    existingReg.status === 'rejected' ? 'bg-red-100 text-red-700 border-red-200' :
                                                    'bg-yellow-100 text-yellow-700 border-yellow-200'
                                                }`}>
                                                    {existingReg.status === 'approved' ? 'Đã đăng ký' : existingReg.status === 'rejected' ? 'Từ chối' : 'Đã gửi'}
                                                </span>
                                            </div>
                                        )}
                                     </div>
                                 );
                             })}
                        </div>
                    </div>
                    
                    <button onClick={handleRegisterShift} className="w-full py-5 bg-purple-600 text-white rounded-[1.5rem] font-black text-sm shadow-xl hover:bg-purple-700 active:scale-[0.98] transition-all tracking-widest uppercase">
                        ĐĂNG KÝ CA
                    </button>
                    
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="text-[10px] font-black text-gray-700 uppercase tracking-[0.2em] ml-4">ĐĂNG KÝ GẦN ĐÂY</h3>
                <div className="space-y-3">
                    {registrations.slice(0, 10).map(r => (
                        <div key={r.id} className="bg-white p-5 rounded-3xl border border-gray-100 flex justify-between items-center shadow-sm relative group">
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-2xl ${r.status === 'approved' ? 'bg-green-50 text-green-600' : r.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-600'}`}>
                                    <CalendarDaysIcon className="h-6 w-6"/>
                                </div>
                                    <div>
                                    <p className="text-sm font-black text-gray-900">{new Date(r.date).toLocaleDateString('vi-VN')}</p>
                                    <p className="text-[10px] font-bold text-gray-500 uppercase">{r.shiftName}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={`text-[9px] font-black uppercase px-3 py-1.5 rounded-full border ${r.status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' : r.status === 'rejected' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-yellow-100 text-yellow-700 border-yellow-200'}`}>
                                    {r.status === 'approved' ? 'Đã đăng ký' : r.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt'}
                                </span>
                                <button 
                                    onClick={() => setConfirmState({ show: true, registration: r })}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Xóa"
                                >
                                    <TrashIcon className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                    {registrations.length === 0 && <p className="text-center text-gray-400 py-6 text-sm italic">Chưa có đăng ký nào.</p>}
                </div>
            </div>
        </div>
      );
  }

  return (
    <div className="max-w-md mx-auto p-4 space-y-6 pb-12 relative">
      {notificationPopup.show && (
          <div className="fixed inset-0 flex items-center justify-center z-[150] pointer-events-none px-6">
              <div className={`
                  px-6 py-4 rounded-2xl shadow-2xl backdrop-blur-md border border-white/20 flex flex-col items-center gap-2 animate-bounce-slow
                  ${notificationPopup.type === 'success' ? 'bg-green-600/90 text-white' : 'bg-orange-600/90 text-white'}
              `}>
                   {notificationPopup.type === 'success' ? <CheckIcon className="h-8 w-8 text-white mb-1"/> : <ExclamationTriangleIcon className="h-8 w-8 text-white mb-1"/>}
                   <span className="text-sm font-black uppercase tracking-widest text-center leading-relaxed max-w-[200px]">{notificationPopup.message}</span>
              </div>
          </div>
      )}

      <div className="flex justify-between items-center bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
        <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full overflow-hidden border-2 border-white shadow-inner bg-gray-100 flex items-center justify-center">
                 {user.avatar ? (
                     <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" />
                 ) : (
                    <div className="h-full w-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-2xl">
                        {user.name.charAt(0)}
                    </div>
                 )}
            </div>
            <div>
                <h1 className="text-xl font-black text-gray-900 tracking-tight">{user.name}</h1>
                <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em]">{currentTime.toLocaleTimeString('vi-VN')}</p>
            </div>
        </div>
        <button onClick={() => setViewMode('profile')} className="p-3 hover:bg-gray-50 rounded-full transition-colors">
            <UserCircleIcon className="h-8 w-8 text-gray-400"/>
        </button>
      </div>

      <div className="flex gap-3">
          <div 
            onClick={() => checkReminderConditions()}
            className={`w-full cursor-pointer flex items-center justify-center gap-2 p-5 rounded-3xl border text-xs font-black uppercase tracking-widest transition-all ${
              isWithinCompanyIP === null ? 'bg-gray-50 text-gray-400 border-gray-100' :
              isWithinCompanyIP ? 'bg-green-50 text-green-700 border-green-100' : 
              'bg-red-50 text-red-700 border-red-100'
          }`}>
              <WifiIcon className="h-5 w-5"/> 
              {isWithinCompanyIP === null ? 'Đang kiểm tra kết nối...' : isWithinCompanyIP ? 'Đã kết nối Wifi Công Ty' : 'Sai địa chỉ IP'}
          </div>
      </div>

      {showReminder && (
          <div className="bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-[1.5rem] shadow-sm flex items-center justify-between animate-bounce-slow">
              <div className="flex items-center gap-4">
                  <div className="p-2 bg-amber-100 rounded-full text-amber-600">
                    <BellAlertIcon className="h-6 w-6"/>
                  </div>
                  <p className="text-xs font-black text-amber-900 leading-tight uppercase tracking-wide">Bạn đã đến văn phòng!<br/><span className="text-[10px] opacity-80">Hãy thực hiện CHECKIN để vào ca</span></p>
              </div>
              <button onClick={initiateAction} className="bg-amber-600 text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow hover:bg-amber-700 transition-all">CHECKIN NGAY</button>
          </div>
      )}

      <div className="grid grid-cols-3 gap-4">
          {[
              { id: 'history', label: 'Lịch sử', icon: ClipboardDocumentListIcon, color: 'orange' },
              { id: 'salary', label: 'Thu nhập', icon: CurrencyDollarIcon, color: 'green' },
              { id: 'register', label: 'Đăng ký ca', icon: CalendarDaysIcon, color: 'purple' }
          ].map(btn => (
              <button 
                key={btn.id} 
                onClick={() => {
                    setViewMode(btn.id as any);
                }} 
                className="bg-white p-5 rounded-[2rem] border border-gray-100 flex flex-col items-center gap-3 shadow-sm hover:shadow-md transition-all group active:scale-[0.95]"
              >
                  <div className={`p-4 bg-${btn.color}-50 text-${btn.color}-600 rounded-2xl group-hover:scale-110 transition-transform shadow-inner`}>
                      <btn.icon className="h-7 w-7"/>
                  </div>
                  <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{btn.label}</span>
              </button>
          ))}
      </div>

      {currentValidationResult && !currentValidationResult.isValid && (
          <div className="bg-rose-50 p-6 rounded-[2rem] border border-rose-100 space-y-4 shadow-sm">
              <div className="flex items-center gap-3 text-rose-800 font-black text-sm uppercase tracking-wide">
                <ExclamationTriangleIcon className="h-6 w-6"/> Lỗi Điều Kiện Chấm Công
              </div>
              <ul className="text-xs text-rose-700 space-y-2 pl-8 list-disc font-medium">
                  {currentValidationResult.messages.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
              <button onClick={() => setCurrentValidationResult(null)} className="w-full flex items-center justify-center gap-3 py-4 bg-white border-2 border-rose-200 text-rose-600 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-rose-50 transition-all">
                  <ArrowPathIcon className="h-5 w-5"/> Đóng và Thử Lại
              </button>
          </div>
      )}

      <div className={`relative overflow-hidden rounded-[3rem] p-10 shadow-2xl transition-all duration-700 ${!activeRecord ? 'bg-gradient-to-br from-indigo-600 to-blue-700' : 'bg-gradient-to-br from-emerald-600 to-teal-700'}`}>
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-black/10 rounded-full blur-3xl"></div>

          {!activeRecord ? (
              <div className="relative z-10 space-y-8 text-center">
                  <div className="mx-auto w-24 h-24 bg-white/20 rounded-[2.5rem] flex items-center justify-center backdrop-blur-md border border-white/30 shadow-2xl">
                      <SignalIcon className="h-12 w-12 text-white"/>
                  </div>
                  <div>
                      <h2 className="text-3xl font-black text-white tracking-tight uppercase">Sẵn sàng vào ca</h2>
                      <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Nhớ chấm công nhé</p>
                  </div>
                  <div className="space-y-4">
                      <div className="w-full bg-white/20 border border-white/30 rounded-2xl p-4 flex items-center justify-center shadow-lg backdrop-blur-md">
                          <span className="text-2xl font-black text-white tracking-wider">
                              {currentTime.toLocaleTimeString('vi-VN')}
                          </span>
                      </div>
                      
                      <button 
                        onClick={initiateAction} 
                        disabled={isLoadingValidation} 
                        className="w-full py-5 bg-white text-indigo-700 rounded-2xl font-black text-sm shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 tracking-tight uppercase flex items-center justify-center gap-2"
                      >
                         {isLoadingValidation ? <ArrowPathIcon className="h-5 w-5 animate-spin"/> : <WifiIcon className="h-6 w-6"/>}
                         CHECKIN
                      </button>
                  </div>
              </div>
          ) : (
              <div className="relative z-10 space-y-8 text-center">
                  <div className="mx-auto w-24 h-24 bg-white/20 rounded-[2.5rem] flex items-center justify-center backdrop-blur-md border border-white/30 shadow-2xl animate-pulse">
                      <ClockIcon className="h-12 w-12 text-white"/>
                  </div>
                  <div>
                      <h2 className="text-3xl font-black text-white tracking-tight uppercase">Đang làm việc</h2>
                      <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Bắt đầu: {new Date(activeRecord.checkInTime).toLocaleTimeString('vi-VN')}</p>
                  </div>
                  
                  <button 
                    onClick={initiateAction} 
                    disabled={isLoadingValidation} 
                    className="w-full py-5 bg-white text-emerald-700 rounded-2xl font-black text-sm shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 tracking-tight uppercase flex items-center justify-center gap-2"
                  >
                        {isLoadingValidation ? <ArrowPathIcon className="h-5 w-5 animate-spin"/> : <ArrowPathIcon className="h-6 w-6"/>}
                        CHECKOUT
                  </button>
              </div>
          )}
      </div>

      {success && <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[110] bg-green-600 text-white px-8 py-4 rounded-full shadow-2xl font-black text-xs uppercase tracking-widest flex items-center gap-3" onClick={() => setSuccess(null)}><CheckIcon className="h-6 w-6"/> {success}</div>}
      {error && <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[110] bg-rose-600 text-white px-8 py-4 rounded-full shadow-2xl font-black text-xs uppercase tracking-widest flex items-center gap-3" onClick={() => setError(null)}><XIcon className="h-6 w-6"/> {error}</div>}

      <div className="text-center py-6">
          <button onClick={onLogout} className="text-[9px] font-black text-gray-400 uppercase tracking-[0.3em] hover:text-rose-500 transition-colors">THOÁT TÀI KHOẢN</button>
      </div>
    </div>
  );
};

export default StaffPanel;