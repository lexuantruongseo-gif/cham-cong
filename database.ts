
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  onSnapshot 
} from "firebase/firestore";
import { AttendanceRecord, PermissionKey, SalaryAdjustment, Settings, Shift, ShiftRegistration, User, UserRole } from './types';

// Safely access environment variables handling cases where import.meta.env might be undefined
const getEnv = () => {
  try {
    return (import.meta as any).env || {};
  } catch {
    return {};
  }
};

const env = getEnv();

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyD4qJnqf2-hcIpPedcLmFozAUDAcEHUg8I",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "parttime-manager.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "parttime-manager",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "parttime-manager.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1043788087050",
  appId: env.VITE_FIREBASE_APP_ID || "1:1043788087050:web:df47fbe5f36704e48b84f3",
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || "G-GSP2FNZCWV"
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

// --- Defaults for Initialization ---

export const DEFAULT_SETTINGS: Settings = {
  companyName: 'THE CAFUNE',
  companyLogo: 'https://ui-avatars.com/api/?name=TC&background=0D8ABC&color=fff&size=128',
  officeIp: '',
  allowedCheckInStart: '00:00',
  allowedCheckInEnd: '23:59',
};

const DEFAULT_SHIFTS: Shift[] = [
  { id: '1', name: 'Ca Sáng', startTime: '08:00', endTime: '12:00', allowedLateMinutes: 15, hourlyRate: 25000 },
  { id: '2', name: 'Ca Chiều', startTime: '13:00', endTime: '17:00', allowedLateMinutes: 10, hourlyRate: 25000 },
  { id: '3', name: 'Ca Tối', startTime: '18:00', endTime: '22:00', allowedLateMinutes: 5, hourlyRate: 30000 },
];

const DEFAULT_DEPARTMENTS = ['Gói Hàng', 'Đóng Hàng', 'Vận Chuyển', 'Kế Toán', 'Bán Hàng'];

export const getRolePermissions = (role: UserRole): PermissionKey[] => {
    switch (role) {
        case 'admin':
            return ['view_dashboard', 'manage_users', 'manage_shifts_config', 'approve_shift_reg', 'view_reports', 'view_salary', 'approve_attendance', 'manage_settings', 'manage_rules'];
        case 'manager':
            return ['view_dashboard', 'approve_shift_reg', 'view_reports', 'approve_attendance', 'manage_shifts_config']; 
        case 'staff':
            return [];
        default:
            return [];
    }
};

const DEFAULT_USERS: User[] = [
  { id: 'admin1', code: 'AD01', name: 'Quản Trị Viên', email: 'admin@cafune.com', password: '123', role: 'admin', permissions: getRolePermissions('admin'), firstLogin: false, department: 'Ban Giám Đốc' },
  { id: 'manager1', code: 'QL01', name: 'Lê Quản Lý', email: 'manager@cafune.com', password: '123', role: 'manager', permissions: getRolePermissions('manager'), firstLogin: false, department: 'Nhân Sự' },
  { id: 'staff1', code: 'NV01', name: 'Nguyễn Văn A', email: 'nva@cafune.com', password: '123', role: 'staff', permissions: getRolePermissions('staff'), firstLogin: false, phone: '0901234567', bankAccount: '123456789', baseHourlyRate: 25000, department: 'Gói Hàng' },
];

class DBService {
  
  subscribeAttendance(callback: (data: AttendanceRecord[]) => void) {
    return onSnapshot(collection(firestore, "attendance"), (snapshot) => {
      const records: AttendanceRecord[] = [];
      snapshot.forEach(doc => records.push(doc.data() as AttendanceRecord));
      callback(records);
    });
  }

  subscribeUsers(callback: (data: User[]) => void) {
    return onSnapshot(collection(firestore, "users"), (snapshot) => {
      const users: User[] = [];
      snapshot.forEach(doc => users.push(doc.data() as User));
      callback(users);
    });
  }

  subscribeShifts(callback: (data: Shift[]) => void) {
    return onSnapshot(collection(firestore, "shifts"), (snapshot) => {
      const shifts: Shift[] = [];
      snapshot.forEach(doc => shifts.push(doc.data() as Shift));
      callback(shifts);
    });
  }

  subscribeRegistrations(callback: (data: ShiftRegistration[]) => void) {
    return onSnapshot(collection(firestore, "registrations"), (snapshot) => {
      const list: ShiftRegistration[] = [];
      snapshot.forEach(doc => list.push(doc.data() as ShiftRegistration));
      callback(list);
    });
  }

  subscribeSettings(callback: (data: Settings) => void) {
    return onSnapshot(doc(firestore, "config", "settings"), (docSnap) => {
      if (docSnap.exists()) callback(docSnap.data() as Settings);
    });
  }

  async getSettings(): Promise<Settings> {
    const docRef = doc(firestore, "config", "settings");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) return docSnap.data() as Settings;
    await setDoc(docRef, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }

  async saveSettings(settings: Settings): Promise<void> {
    await setDoc(doc(firestore, "config", "settings"), settings);
  }

  async getShifts(): Promise<Shift[]> {
    const snapshot = await getDocs(collection(firestore, "shifts"));
    const shifts: Shift[] = [];
    snapshot.forEach(doc => shifts.push(doc.data() as Shift));
    if (shifts.length === 0) {
       for (const s of DEFAULT_SHIFTS) await setDoc(doc(firestore, "shifts", s.id), s);
       return DEFAULT_SHIFTS;
    }
    return shifts;
  }

  async saveShifts(shifts: Shift[]): Promise<void> {
    for (const s of shifts) await setDoc(doc(firestore, "shifts", s.id), s);
  }

  async deleteShift(shiftId: string): Promise<void> {
    await deleteDoc(doc(firestore, "shifts", shiftId));
  }

  async getAttendance(): Promise<AttendanceRecord[]> {
    const snapshot = await getDocs(collection(firestore, "attendance"));
    const records: AttendanceRecord[] = [];
    snapshot.forEach(doc => records.push(doc.data() as AttendanceRecord));
    return records;
  }

  async addAttendance(record: AttendanceRecord): Promise<void> {
    await setDoc(doc(firestore, "attendance", record.id), record);
  }

  async updateAttendance(record: AttendanceRecord): Promise<void> {
    await setDoc(doc(firestore, "attendance", record.id), record);
  }

  async getUsers(): Promise<User[]> {
    const snapshot = await getDocs(collection(firestore, "users"));
    const users: User[] = [];
    snapshot.forEach(doc => users.push(doc.data() as User));
    if (users.length === 0) {
        for (const u of DEFAULT_USERS) await setDoc(doc(firestore, "users", u.id), u);
        return DEFAULT_USERS;
    }
    return users;
  }

  async addUser(user: User): Promise<void> {
    await setDoc(doc(firestore, "users", user.id), user);
  }

  async updateUser(user: User): Promise<void> {
    await setDoc(doc(firestore, "users", user.id), user);
  }

  async deleteUser(userId: string): Promise<void> {
    await deleteDoc(doc(firestore, "users", userId));
  }

  async getDepartments(): Promise<string[]> {
    const docSnap = await getDoc(doc(firestore, "config", "departments"));
    if (docSnap.exists()) return docSnap.data().list || [];
    await setDoc(doc(firestore, "config", "departments"), { list: DEFAULT_DEPARTMENTS });
    return DEFAULT_DEPARTMENTS;
  }

  async saveDepartments(depts: string[]): Promise<void> {
    await setDoc(doc(firestore, "config", "departments"), { list: depts });
  }

  async getAdjustments(): Promise<SalaryAdjustment[]> {
    const snapshot = await getDocs(collection(firestore, "adjustments"));
    const list: SalaryAdjustment[] = [];
    snapshot.forEach(doc => list.push(doc.data() as SalaryAdjustment));
    return list;
  }

  async addAdjustment(adj: SalaryAdjustment): Promise<void> {
    await setDoc(doc(firestore, "adjustments", adj.id), adj);
  }

  async getShiftRegistrations(): Promise<ShiftRegistration[]> {
    const snapshot = await getDocs(collection(firestore, "registrations"));
    const list: ShiftRegistration[] = [];
    snapshot.forEach(doc => list.push(doc.data() as ShiftRegistration));
    return list;
  }

  async addShiftRegistration(reg: ShiftRegistration): Promise<void> {
    await setDoc(doc(firestore, "registrations", reg.id), reg);
  }

  async updateShiftRegistration(reg: ShiftRegistration): Promise<void> {
    await setDoc(doc(firestore, "registrations", reg.id), reg);
  }

  async deleteShiftRegistration(id: string): Promise<void> {
    await deleteDoc(doc(firestore, "registrations", id));
  }

  async getRulesContent(): Promise<string> {
    const docSnap = await getDoc(doc(firestore, "config", "rules"));
    if (docSnap.exists()) return docSnap.data().content || "";
    return "1. Đi làm đúng giờ.\n2. Mặc đồng phục đúng quy định.\n3. Hoàn thành công việc được giao.\n4. Tuyệt đối tuân thủ giờ check-in/out.";
  }

  async saveRulesContent(content: string): Promise<void> {
    await setDoc(doc(firestore, "config", "rules"), { content });
  }

  async getActiveCheckIn(userId: string): Promise<AttendanceRecord | undefined> {
    const q = query(collection(firestore, "attendance"), where("userId", "==", userId));
    const snapshot = await getDocs(q);
    let active: AttendanceRecord | undefined;
    snapshot.forEach(doc => {
        const data = doc.data() as AttendanceRecord;
        if (!data.checkOutTime) active = data;
    });
    return active;
  }
}

export const db = new DBService();
