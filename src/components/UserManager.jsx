import React, { useState, useEffect } from 'react';
import { db, appId, secondaryApp } from '../lib/firebase';
import { Trash2, UserPlus, Shield, Edit2, Save, X, Check } from 'lucide-react';

const UserManager = ({ user }) => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);

    // Create User State
    const [newUser, setNewUser] = useState({ username: '', password: '', role: 'labour' });

    // Edit User State
    const [editingId, setEditingId] = useState(null);
    const [editRole, setEditRole] = useState('');

    // Load Users
    useEffect(() => {
        const unsub = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('user_roles')
            .onSnapshot(snap => {
                const userList = snap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setUsers(userList);
            });
        return () => unsub();
    }, []);

    const handleCreateUser = async () => {
        if (!newUser.username || !newUser.password) return alert("Please fill all fields");
        if (newUser.password.length < 6) return alert("Password must be at least 6 characters");

        setLoading(true);
        try {
            const email = `${newUser.username.trim().toLowerCase()}@admire.internal`;

            // 1. Create in Firebase Auth (Using secondary app to keep admin logged in)
            const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, newUser.password);
            const uid = userCredential.user.uid;

            // 2. Save Role & Username to Firestore
            // We store the 'username' field explicitly so we can display it later
            await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('user_roles').doc(uid).set({
                username: newUser.username.trim(),
                role: newUser.role,
                createdAt: new Date().toISOString()
            });

            setNewUser({ username: '', password: '', role: 'labour' });
            alert("User Created Successfully");
        } catch (error) {
            console.error(error);
            alert("Error: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteUser = async (userId, username) => {
        if (!confirm(`Are you sure you want to remove access for "${username}"?`)) return;

        try {
            // We only delete the Role document. This effectively blocks their login
            // because the app checks for this document to allow access.
            await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('user_roles').doc(userId).delete();
        } catch (error) {
            console.error(error);
            alert("Error deleting user role: " + error.message);
        }
    };

    const startEditing = (user) => {
        setEditingId(user.id);
        setEditRole(user.role);
    };

    const saveEdit = async (userId) => {
        try {
            await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('user_roles').doc(userId).update({
                role: editRole
            });
            setEditingId(null);
        } catch (error) {
            console.error(error);
            alert("Update failed: " + error.message);
        }
    };

    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
                <Shield className="text-teal-600 dark:text-teal-400" />
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">User Management</h2>
            </div>

            {/* Create User Form */}
            <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-xs font-bold uppercase text-slate-500 mb-4">Create New User</h3>
                <div className="flex flex-col md:flex-row gap-3">
                    <input
                        type="text"
                        placeholder="Username (e.g. arpit)"
                        value={newUser.username}
                        onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                        className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                    />
                    <input
                        type="password"
                        placeholder="Password (min 6 chars)"
                        value={newUser.password}
                        onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                        className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                    />
                    <select
                        value={newUser.role}
                        onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                        className="p-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                    >
                        <option value="labour">Labour (Read Only)</option>
                        <option value="supervisor">Supervisor (Can Update Stock)</option>
                        <option value="manager">Manager (Can Edit Price/Quotes)</option>
                        <option value="super_admin">Super Admin (Full Access)</option>
                    </select>
                    <button
                        onClick={handleCreateUser}
                        disabled={loading}
                        className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded flex items-center gap-2 text-sm font-bold transition-colors"
                    >
                        {loading ? 'Saving...' : <><UserPlus size={16} /> Add</>}
                    </button>
                </div>
            </div>

            {/* User List */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 uppercase text-xs font-bold text-slate-500">
                        <tr>
                            <th className="px-6 py-4">Username</th>
                            <th className="px-6 py-4">Role</th>
                            <th className="px-6 py-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {users.map(u => (
                            <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                <td className="px-6 py-4 font-medium text-slate-800 dark:text-white">
                                    {/* DISPLAY LOGIC: Show username if exists, otherwise show truncated ID */}
                                    {u.username || <span className="text-slate-400 italic font-normal" title={u.id}>Unknown (ID: {u.id.substr(0, 8)}...)</span>}
                                </td>
                                <td className="px-6 py-4">
                                    {editingId === u.id ? (
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={editRole}
                                                onChange={e => setEditRole(e.target.value)}
                                                className="p-1 border rounded text-xs bg-white dark:bg-slate-800"
                                            >
                                                <option value="labour">Labour</option>
                                                <option value="supervisor">Supervisor</option>
                                                <option value="manager">Manager</option>
                                                <option value="super_admin">Super Admin</option>
                                            </select>
                                        </div>
                                    ) : (
                                        <span className={`inline-block px-2 py-1 rounded text-xs font-bold uppercase tracking-wider 
                                            ${u.role === 'super_admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' :
                                                u.role === 'manager' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                                                    u.role === 'supervisor' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                                                        'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
                                            {u.role.replace('_', ' ')}
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right flex justify-end gap-2">
                                    {editingId === u.id ? (
                                        <>
                                            <button onClick={() => saveEdit(u.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Save"><Check size={16} /></button>
                                            <button onClick={() => setEditingId(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded" title="Cancel"><X size={16} /></button>
                                        </>
                                    ) : (
                                        <>
                                            <button onClick={() => startEditing(u)} className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Edit Role">
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(u.id, u.username || 'User')}
                                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                                title="Delete User"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {users.length === 0 && (
                            <tr>
                                <td colSpan="3" className="px-6 py-8 text-center text-slate-400 italic">
                                    No users found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/10 p-3 text-xs text-amber-800 dark:text-amber-400 border-t border-amber-100 dark:border-amber-900/20 text-center">
                To change a password or username, please delete the user and create them again.
            </div>
        </div>
    );
};

export default UserManager;