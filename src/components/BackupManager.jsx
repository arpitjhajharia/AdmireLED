import React, { useState, useEffect } from 'react';
import { db, appId } from '../lib/firebase';
import { Save, RotateCcw, AlertTriangle, Check, Loader, Clock, ShieldCheck } from 'lucide-react';

const BackupManager = () => {
    const [backups, setBackups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [lastBackupTime, setLastBackupTime] = useState(null);

    // 1. Load Backups & Check Freshness
    useEffect(() => {
        // Load last 20 backups to give good visibility
        const unsub = db.collection('artifacts').doc(appId).collection('private').doc('system').collection('backups')
            .orderBy('timestamp', 'desc')
            .limit(20)
            .onSnapshot(snap => {
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setBackups(data);

                if (data.length > 0) {
                    // Filter out "Safety Snapshots" to find the last REAL manual backup
                    const realBackups = data.filter(b => !b.isSafetySnapshot);
                    if (realBackups.length > 0) {
                        setLastBackupTime(new Date(realBackups[0].timestamp));
                    }
                }
            });
        return () => unsub();
    }, []);

    // Helper: Fetch Full Database
    const fetchFullDatabase = async () => {
        const baseRef = db.collection('artifacts').doc(appId).collection('public').doc('data');
        const [inventory, quotes, transactions, roles] = await Promise.all([
            baseRef.collection('inventory').get(),
            baseRef.collection('quotes').get(),
            baseRef.collection('transactions').get(),
            baseRef.collection('user_roles').get()
        ]);

        return {
            timestamp: new Date().toISOString(),
            stats: {
                inventory: inventory.size,
                quotes: quotes.size,
                transactions: transactions.size,
                roles: roles.size
            },
            data: {
                inventory: inventory.docs.map(d => ({ id: d.id, ...d.data() })),
                quotes: quotes.docs.map(d => ({ id: d.id, ...d.data() })),
                transactions: transactions.docs.map(d => ({ id: d.id, ...d.data() })),
                user_roles: roles.docs.map(d => ({ id: d.id, ...d.data() }))
            }
        };
    };

    // Helper: Save Backup Payload
    const saveBackupToFirestore = async (payload, isSafety = false) => {
        const timestampId = payload.timestamp.replace(/[:.]/g, '-');
        const docId = isSafety ? `SAFETY-${timestampId}` : timestampId;

        const backupRef = db.collection('artifacts').doc(appId).collection('private').doc('system').collection('backups').doc(docId);

        await backupRef.set({
            timestamp: payload.timestamp,
            stats: payload.stats,
            isSafetySnapshot: isSafety, // Flag to distinguish auto-backups from manual ones
            payload: JSON.stringify(payload.data)
        });
    };

    // Action: Create Manual Snapshot
    const createSnapshot = async () => {
        setLoading(true);
        try {
            // 1. Create New Backup
            const backupData = await fetchFullDatabase();
            await saveBackupToFirestore(backupData, false);

            // 2. Run Cleanup (Retention Policy: 30 Days)
            await cleanupOldBackups();

            alert("Snapshot Created Successfully!");
        } catch (error) {
            console.error(error);
            alert("Backup Failed: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Action: Restore with Safety Net
    const restoreSnapshot = async (backup) => {
        if (!confirm(`WARNING: You are about to restore data from ${new Date(backup.timestamp).toLocaleString()}.\n\nCurrent data will be overwritten.`)) return;

        const verification = prompt("Type 'RESTORE' to confirm:");
        if (verification !== 'RESTORE') return alert("Cancelled.");

        setLoading(true);
        try {
            // 1. AUTOMATIC SAFETY SNAPSHOT
            // Before wiping data, we save the current state just in case.
            if (!backup.isSafetySnapshot) { // Don't create a safety snapshot if we are ALREADY restoring a safety snapshot (prevents loops)
                console.log("Creating safety snapshot...");
                const currentData = await fetchFullDatabase();
                await saveBackupToFirestore(currentData, true);
            }

            // 2. Perform Restore
            const data = JSON.parse(backup.payload);
            const baseRef = db.collection('artifacts').doc(appId).collection('public').doc('data');

            // Helper to batch write chunks (500 limit)
            const writeBatch = async (collectionName, items) => {
                if (!items) return;
                const chunks = [];
                for (let i = 0; i < items.length; i += 400) chunks.push(items.slice(i, i + 400));
                for (const chunk of chunks) {
                    const batch = db.batch();
                    chunk.forEach(item => {
                        const ref = baseRef.collection(collectionName).doc(item.id);
                        batch.set(ref, item);
                    });
                    await batch.commit();
                }
            };

            await writeBatch('inventory', data.inventory);
            await writeBatch('transactions', data.transactions);
            await writeBatch('quotes', data.quotes);
            await writeBatch('user_roles', data.user_roles);

            alert("System Restored. A 'Safety Snapshot' of your previous data was created just in case.");
            window.location.reload();
        } catch (error) {
            console.error(error);
            alert("Restore Failed: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Helper: Delete backups older than 30 days
    const cleanupOldBackups = async () => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const oldBackups = await db.collection('artifacts').doc(appId).collection('private').doc('system').collection('backups')
            .where('timestamp', '<', thirtyDaysAgo.toISOString())
            .get();

        const batch = db.batch();
        oldBackups.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        if (!oldBackups.empty) console.log(`Cleaned up ${oldBackups.size} old backups.`);
    };

    // Status Logic
    const isFresh = lastBackupTime && (new Date() - lastBackupTime) < (24 * 60 * 60 * 1000); // 24 hours

    return (
        <div className="p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h2 className="text-xl font-bold flex items-center gap-2 mb-6 text-slate-800 dark:text-white">
                <RotateCcw className="text-blue-600" /> Disaster Recovery
            </h2>

            {/* Smart Status Card */}
            <div className={`p-4 rounded-lg mb-6 border flex flex-col md:flex-row justify-between items-center gap-4 ${isFresh ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800'}`}>
                <div>
                    <h3 className={`text-sm font-bold flex items-center gap-2 ${isFresh ? 'text-green-800 dark:text-green-300' : 'text-amber-800 dark:text-amber-300'}`}>
                        {isFresh ? <Check size={16} /> : <AlertTriangle size={16} />}
                        {isFresh ? "System is Backed Up" : "Daily Backup Pending"}
                    </h3>
                    <p className="text-xs opacity-80 mt-1">
                        {lastBackupTime
                            ? `Last manual snapshot: ${lastBackupTime.toLocaleString()}`
                            : "No manual backups found."}
                    </p>
                </div>
                <button
                    onClick={createSnapshot}
                    disabled={loading}
                    className={`whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm ${isFresh ? 'bg-white text-green-700 border border-green-200 hover:bg-green-50' : 'bg-amber-600 text-white hover:bg-amber-700'}`}
                >
                    {loading ? <Loader className="animate-spin" size={16} /> : <Save size={16} />}
                    {isFresh ? "Create New Snapshot" : "Backup Now"}
                </button>
            </div>

            <div className="mt-8">
                <h3 className="text-xs font-bold uppercase text-slate-500 mb-3">Snapshot History</h3>
                <div className="space-y-3">
                    {backups.map(b => (
                        <div key={b.id} className={`flex items-center justify-between p-3 border rounded-lg ${b.isSafetySnapshot ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800' : 'bg-slate-50 border-slate-200 dark:bg-slate-700/30 dark:border-slate-700'}`}>
                            <div>
                                <div className="flex items-center gap-2">
                                    {b.isSafetySnapshot && <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 rounded border border-indigo-200 flex items-center gap-1"><ShieldCheck size={10} /> Safety Auto-Save</span>}
                                    <div className="text-sm font-bold text-slate-700 dark:text-white">
                                        {new Date(b.timestamp).toLocaleString()}
                                    </div>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1 flex gap-2 flex-wrap">
                                    <span className="bg-white dark:bg-slate-600 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-500">📦 {b.stats.inventory} Items</span>
                                    <span className="bg-white dark:bg-slate-600 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-500">📄 {b.stats.quotes} Quotes</span>
                                    <span className="bg-white dark:bg-slate-600 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-500">📝 {b.stats.transactions} Tx</span>
                                </div>
                            </div>
                            <button
                                onClick={() => restoreSnapshot(b)}
                                className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-3 py-1.5 rounded text-xs font-bold border border-transparent hover:border-blue-200 transition-all flex items-center gap-1"
                            >
                                <RotateCcw size={12} /> Restore
                            </button>
                        </div>
                    ))}
                    {backups.length === 0 && <div className="text-center text-xs text-slate-400 py-4">No backups found.</div>}
                </div>
            </div>
        </div>
    );
};

export default BackupManager;