import React, { useState } from 'react';
import { auth } from '../lib/firebase';
import { Lock, User } from 'lucide-react';

const Login = () => {
    const [formData, setFormData] = useState({ username: '', password: '' });
    const [error, setError] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        try {
            // Internally convert username to email for Firebase
            const email = `${formData.username.trim().toLowerCase()}@admire.internal`;
            await auth.signInWithEmailAndPassword(email, formData.password);
        } catch (err) {
            console.error(err);
            setError('Invalid credentials');
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
            <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm border border-slate-200">
                <div className="flex flex-col items-center mb-6">
                    <img src="/AdmireLED/logo.png" alt="Logo" className="h-12 mb-4" />
                    <h1 className="text-xl font-bold text-slate-800">Staff Portal</h1>
                    <p className="text-slate-500 text-xs">Please log in to continue</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Username</label>
                        <div className="relative">
                            <User className="absolute left-3 top-2.5 text-slate-400" size={16} />
                            <input
                                type="text"
                                className="w-full pl-10 p-2 text-sm border rounded focus:ring-2 focus:ring-teal-500 outline-none"
                                placeholder="Enter username"
                                value={formData.username}
                                onChange={e => setFormData({ ...formData, username: e.target.value })}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-2.5 text-slate-400" size={16} />
                            <input
                                type="password"
                                className="w-full pl-10 p-2 text-sm border rounded focus:ring-2 focus:ring-teal-500 outline-none"
                                placeholder="Enter password"
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                            />
                        </div>
                    </div>

                    {error && <div className="text-red-500 text-xs text-center font-bold bg-red-50 p-2 rounded">{error}</div>}

                    <button type="submit" className="w-full bg-teal-600 text-white py-2 rounded-lg font-bold hover:bg-teal-700 transition shadow-sm text-sm">
                        Login
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;