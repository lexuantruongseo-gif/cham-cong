import React, { useState, useEffect } from 'react';
import { db, DEFAULT_SETTINGS } from './database';
import { User, Settings } from './types';
import AdminPanel from './components/admin-panel';
import StaffPanel from './components/staff-panel';
import { UsersIcon, ShieldCheckIcon, EnvelopeIcon, LockClosedIcon, UserCircleIcon, KeyIcon } from '@heroicons/react/24/solid';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [passwordChangeMode, setPasswordChangeMode] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChangeError, setPasswordChangeError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const init = async () => {
        try {
            const s = await db.getSettings();
            setSettings(s);
            // Ensure users are loaded/seeded
            await db.getUsers(); 
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };
    init();
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);
      
      try {
          const users = await db.getUsers();
          const user = users.find(u => u.email === email && u.password === password);
          
          if (user) {
              if (user.firstLogin) {
                  setPasswordChangeMode(true);
                  setCurrentUser(user);
                  setNewPassword('');
                  setConfirmPassword('');
                  setPasswordChangeError('');
              } else {
                  setCurrentUser(user);
              }
          } else {
              setError('Email hoặc mật khẩu không chính xác.');
          }
      } catch (err) {
          setError('Lỗi kết nối cơ sở dữ liệu.');
      } finally {
          setLoading(false);
      }
  };

  const handleForgotPassword = (e: React.FormEvent) => {
      e.preventDefault();
      setResetMessage('Nếu email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.');
  };

  const handlePasswordChangeSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setPasswordChangeError('');

      if (newPassword.length < 6) {
          setPasswordChangeError('Mật khẩu phải có ít nhất 6 ký tự.');
          return;
      }
      if (newPassword !== confirmPassword) {
          setPasswordChangeError('Mật khẩu mới và xác nhận mật khẩu không khớp.');
          return;
      }

      if (currentUser) {
          const updatedUser = { ...currentUser, password: newPassword, firstLogin: false };
          await db.updateUser(updatedUser);
          setCurrentUser(updatedUser);
          setPasswordChangeMode(false);
          setEmail(currentUser.email);
          setPassword(newPassword);
          alert("Mật khẩu đã được cập nhật thành công! Vui lòng đăng nhập lại.");
      }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setEmail('');
    setPassword('');
    setError('');
    setSuccessMessage('');
  };

  if (loading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
      );
  }

  if (passwordChangeMode && currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8 border border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-6 flex items-center justify-center gap-2">
            <KeyIcon className="h-7 w-7 text-blue-600"/>
            Đổi mật khẩu
          </h2>
          <p className="text-sm text-gray-600 mb-6 text-center">Đây là lần đăng nhập đầu tiên, vui lòng cập nhật mật khẩu mới.</p>
          <form onSubmit={handlePasswordChangeSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu mới</label>
              <input 
                type="password" 
                placeholder="Mật khẩu mới" 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full border border-gray-300 p-3 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-gray-50" 
                required 
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Xác nhận mật khẩu</label>
              <input 
                type="password" 
                placeholder="Xác nhận mật khẩu" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-gray-300 p-3 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-gray-50" 
                required 
              />
            </div>
            {passwordChangeError && <p className="text-red-500 text-sm text-center mb-4">{passwordChangeError}</p>}
            <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-md font-semibold hover:bg-blue-700 shadow-md transition-colors">Cập nhật mật khẩu</button>
          </form>
        </div>
      </div>
    );
  }

  if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager')) {
    return (
      <div className="min-h-screen bg-gray-100">
        <nav className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16 items-center">
              <div className="flex items-center">
                {settings.companyLogo ? (
                  <img src={settings.companyLogo} alt="Logo" className="h-10 w-auto object-contain mr-3" />
                ) : (
                  <ShieldCheckIcon className="h-8 w-8 text-blue-600 mr-2" />
                )}
                <span className="font-bold text-xl text-gray-800">{settings.companyName}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600 flex items-center gap-2">
                    {currentUser.avatar ? (
                        <img src={currentUser.avatar} alt="avatar" className="h-8 w-8 rounded-full object-cover border border-gray-200" />
                    ) : (
                        <UserCircleIcon className="h-8 w-8 text-gray-400"/>
                    )}
                    <span className="hidden md:inline">
                        {currentUser.role === 'admin' ? 'Admin: ' : 'Quản lý: '}
                        <span className="font-medium text-gray-800">{currentUser.name}</span>
                    </span>
                </span>
                <button onClick={handleLogout} className="text-sm text-red-600 hover:text-red-800 font-medium transition-colors">Đăng xuất</button>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <AdminPanel currentUser={currentUser} />
        </main>
      </div>
    );
  }

  if (currentUser && currentUser.role === 'staff') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <div className="w-full max-w-md">
           <StaffPanel user={currentUser} onUpdateUser={setCurrentUser} onLogout={handleLogout} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-8 py-10">
          <div className="flex justify-center mb-6">
            {settings.companyLogo ? (
                <img src={settings.companyLogo} alt={settings.companyName} className="h-24 w-auto object-contain" />
            ) : (
                <div className="bg-blue-100 p-3 rounded-full">
                    <UsersIcon className="h-10 w-10 text-blue-600" />
                </div>
            )}
          </div>
          <h2 className="text-2xl font-extrabold text-gray-900 text-center mb-2">{settings.companyName}</h2>
          
          {!isForgotPassword ? (
              <>
                <p className="text-center text-gray-500 mb-8">Đăng nhập hệ thống</p>
                <form onSubmit={handleLoginSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <EnvelopeIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                            </div>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md p-3 border text-gray-900 bg-white"
                                placeholder="name@company.com"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Mật khẩu</label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <LockClosedIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                            </div>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md p-3 border text-gray-900 bg-white"
                                placeholder="******"
                            />
                        </div>
                    </div>

                    {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                    {successMessage && <p className="text-green-600 text-sm text-center">{successMessage}</p>}


                    <button
                        type="submit"
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                        disabled={loading}
                    >
                        {loading ? 'Đang xử lý...' : 'Đăng nhập'}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button 
                        onClick={() => setIsForgotPassword(true)}
                        className="text-sm text-blue-600 hover:text-blue-500 font-medium transition-colors"
                    >
                        Quên mật khẩu?
                    </button>
                </div>
                
                <div className="mt-8 pt-6 border-t border-gray-100 text-xs text-center text-gray-400">
                    <p>Demo Accounts:</p>
                    <p className="font-mono">admin@cafune.com / 123</p>
                    <p className="font-mono">manager@cafune.com / 123</p>
                    <p className="font-mono">nva@cafune.com / 123</p>
                </div>
              </>
          ) : (
              <>
                 <h3 className="text-center text-lg font-bold text-gray-800 mb-2">Đặt lại mật khẩu</h3>
                 <p className="text-center text-sm text-gray-500 mb-6">Nhập email để nhận hướng dẫn.</p>
                 
                 {resetMessage ? (
                     <div className="bg-green-50 text-green-700 p-4 rounded text-sm text-center mb-6">
                         {resetMessage}
                     </div>
                 ) : (
                     <form onSubmit={handleForgotPassword} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Email</label>
                            <input
                                type="email"
                                required
                                className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-3 border text-gray-900 bg-white"
                                placeholder="name@company.com"
                            />
                        </div>
                        <button
                            type="submit"
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                        >
                            Gửi yêu cầu
                        </button>
                     </form>
                 )}

                 <div className="mt-6 text-center">
                    <button 
                        onClick={() => { setIsForgotPassword(false); setResetMessage(''); setError(''); }}
                        className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                    >
                        ← Quay lại đăng nhập
                    </button>
                </div>
              </>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;