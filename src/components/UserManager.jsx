import React, { useState, useEffect } from 'react';
import firebase from 'firebase/compat/app';
import { db, appId, firebaseApp } from '../lib/firebase';
import { Users, Trash2, Plus, Shield } from 'lucide-react';

const UserManager = () => {
    const [users, setUsers] = useState([]);
    const [newUser, setNewUser] = useState({ username: '', password: '', role: 'labour' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const unsub = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('user_roles')
            .onSnapshot(snap => {
                setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            });
        return () => unsub();
    }, []);

    const handleCreateUser = async () => {
        if (!newUser.username || !newUser.password) return alert("Missing fields");
        setLoading(true);

        // Trick: Use a secondary app instance so creating a user doesn't log YOU out
        const secondaryApp = firebase.initializeApp(firebaseApp.options, "Secondary");

        try {
            const email = `${newUser.username.trim().toLowerCase()}@admire.internal`;
            // 1. Capture the result to get the UID
            const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, newUser.password);
            const uid = userCredential.user.uid;

            // 2. Save Role using the UID as the Document Key (Secure Link)
            await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('user_roles').doc(uid).set({
                username: newUser.username.trim().toLowerCase(), // Store username inside the doc for reference
                role: newUser.role,
                createdAt: new Date().toISOString()
            });

            setNewUser({ username: '', password: '', role: 'labour' });
            alert("User created successfully");
        } catch (error) {
            console.error(error);
            alert("Error: " + error.message);
        } finally {
            secondaryApp.auth().signOut();
            secondaryApp.delete();
            setLoading(false);
        }
    };

    const handleDeleteUser = async (username) => {
        if (confirm(`Remove access for ${username}? (Note: This removes their role. To fully delete login access, use Firebase Console)`)) {
            await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('user_roles').doc(username).delete();
        }
    };

    return (
        <div className="p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h2 className="text-xl font-bold flex items-center gap-2 mb-6 text-slate-800 dark:text-white">
                <Shield className="text-teal-600" /> User Management
            </h2>

            {/* Create Form */}
            <div className="bg-slate-50 dark:bg-slate-700/30 p-4 rounded-lg border border-slate-200 dark:border-slate-700 mb-8">
                <h3 className="text-xs font-bold uppercase text-slate-500 mb-3">Create New User</h3>
                <div className="flex flex-wrap gap-2">
                    <input
                        placeholder="Username"
                        value={newUser.username}
                        onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                        className="flex-1 min-w-[150px] p-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={newUser.password}
                        onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                        className="flex-1 min-w-[150px] p-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    />
                    <select
                        value={newUser.role}
                        onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                        className="p-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    >
                        <option value="labour">Labour (Read Only)</option>
                        <option value="supervisor">Supervisor (Stock Write)</option>
                        <option value="manager">Manager (Full Access)</option>
                        <option value="super_admin">Super Admin</option>
                    </select>
                    <button
                        onClick={handleCreateUser}
                        disabled={loading}
                        className="bg-teal-600 text-white px-4 py-2 rounded font-bold hover:bg-teal-700 disabled:opacity-50 text-sm"
                    >
                        {loading ? '...' : <Plus size={18} />}
                    </button>
                </div>
            </div>

            {/* User List */}
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 uppercase font-bold text-xs">
                        <tr>
                            <th className="p-3">Username</th>
                            <th className="p-3">Role</th>
                            <th className="p-3 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                        {users.map(u => (
                            <tr key={u.id}>
                                <td className="p-3 font-medium dark:text-white">{u.id}</td>
                                <td className="p-3">
                                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${u.role === 'super_admin' ? 'bg-purple-100 text-purple-700' :
                                        u.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                                            u.role === 'supervisor' ? 'bg-amber-100 text-amber-700' :
                                                'bg-gray-100 text-gray-700'
                                        }`}>
                                        {u.role}
                                    </span>
                                </td>
                                <td className="p-3 text-right">
                                    <button onClick={() => handleDeleteUser(u.id)} className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default UserManager;