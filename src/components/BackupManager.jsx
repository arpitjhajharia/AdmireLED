import React, { useState, useEffect } from 'react';
import { db, appId } from '../lib/firebase';
import { Save, RotateCcw, AlertTriangle, Check, Loader, Clock, ShieldCheck, Database } from 'lucide-react';

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
            isSafetySnapshot: isSafety,
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
            if (!backup.isSafetySnapshot) {
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
        <div className="p-3 md:p-4">
            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-800 to-slate-600 flex items-center justify-center shadow-sm">
                        <Database className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white leading-none">
                            Disaster Recovery
                        </h2>
                        <p className="text-[11px] font-medium text-slate-400 mt-0.5 tracking-wide uppercase">
                            {backups.length} {backups.length === 1 ? 'snapshot' : 'snapshots'} stored
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Smart Status Card ── */}
            <div className={`p-3 rounded-xl mb-4 border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${isFresh ? 'bg-green-50/80 border-green-200/80 dark:bg-green-900/20 dark:border-green-800' : 'bg-amber-50/80 border-amber-200/80 dark:bg-amber-900/20 dark:border-amber-800'}`}>
                <div>
                    <h3 className={`text-sm font-bold flex items-center gap-1.5 ${isFresh ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'}`}>
                        {isFresh ? <Check size={14} /> : <AlertTriangle size={14} />}
                        {isFresh ? "System is Backed Up" : "Daily Backup Pending"}
                    </h3>
                    <p className={`text-[11px] mt-0.5 ${isFresh ? 'text-green-600/70 dark:text-green-400/70' : 'text-amber-600/70 dark:text-amber-400/70'}`}>
                        {lastBackupTime
                            ? `Last manual snapshot: ${lastBackupTime.toLocaleString()}`
                            : "No manual backups found."}
                    </p>
                </div>
                <button
                    onClick={createSnapshot}
                    disabled={loading}
                    className={`flex-shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm ${isFresh ? 'bg-white dark:bg-slate-800 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/30' : 'bg-amber-600 text-white hover:bg-amber-700'}`}
                >
                    {loading ? <Loader className="animate-spin" size={15} /> : <Save size={15} />}
                    {isFresh ? "New Snapshot" : "Backup Now"}
                </button>
            </div>

            {/* ── Snapshot History ── */}
            <div className="space-y-2">
                {backups.map(b => (
                    <div key={b.id} className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${b.isSafetySnapshot ? 'bg-indigo-50/60 border-indigo-200/80 dark:bg-indigo-900/15 dark:border-indigo-800' : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700'} hover:shadow-sm`}>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {b.isSafetySnapshot && (
                                    <span className="bg-indigo-50 text-indigo-600 text-[10px] font-bold px-1.5 py-px rounded-full ring-1 ring-indigo-200/60 flex items-center gap-1">
                                        <ShieldCheck size={10} /> Safety
                                    </span>
                                )}
                                <span className="text-sm font-bold text-slate-700 dark:text-white tabular-nums">
                                    {new Date(b.timestamp).toLocaleString()}
                                </span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-1 flex gap-1.5 flex-wrap">
                                <span className="bg-slate-50 dark:bg-slate-700/50 px-1.5 py-px rounded-full ring-1 ring-slate-200/60 dark:ring-slate-600">📦 {b.stats.inventory}</span>
                                <span className="bg-slate-50 dark:bg-slate-700/50 px-1.5 py-px rounded-full ring-1 ring-slate-200/60 dark:ring-slate-600">📄 {b.stats.quotes}</span>
                                <span className="bg-slate-50 dark:bg-slate-700/50 px-1.5 py-px rounded-full ring-1 ring-slate-200/60 dark:ring-slate-600">📝 {b.stats.transactions}</span>
                            </div>
                        </div>
                        <button
                            onClick={() => restoreSnapshot(b)}
                            className="flex-shrink-0 quote-action-btn text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                        >
                            <RotateCcw size={12} /> Restore
                        </button>
                    </div>
                ))}
                {backups.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <Database className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                        <p className="text-sm text-slate-400">No backups found.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BackupManager;