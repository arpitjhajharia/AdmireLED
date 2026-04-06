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

    // Helper: Save Backup Payload (Now handles Large Payloads via Chunking)
    const saveBackupToFirestore = async (payload, isSafety = false) => {
        const timestampId = payload.timestamp.replace(/[:.]/g, '-');
        const docId = isSafety ? `SAFETY-${timestampId}` : timestampId;

        const baseRef = db.collection('artifacts').doc(appId).collection('private').doc('system').collection('backups');
        const backupRef = baseRef.doc(docId);

        const dataStr = JSON.stringify(payload.data);
        
        // Chunking Logic (Firestore limit is 1MB total doc, so we split at ~800KB)
        const CHUNK_SIZE = 800000;
        const chunks = [];
        for (let i = 0; i < dataStr.length; i += CHUNK_SIZE) {
            chunks.push(dataStr.substring(i, i + CHUNK_SIZE));
        }

        // 1. Save Main Doc (Metadata Only)
        await backupRef.set({
            timestamp: payload.timestamp,
            stats: payload.stats,
            isSafetySnapshot: isSafety,
            hasChunks: true, // Marker for new format
            chunkCount: chunks.length
        });

        // 2. Save Chunks to sub-collection
        const batchSize = 20; // Small batches for chunks
        for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = db.batch();
            const slice = chunks.slice(i, i + batchSize);
            slice.forEach((chunkData, index) => {
                const chunkRef = backupRef.collection('chunks').doc((i + index).toString().padStart(3, '0'));
                batch.set(chunkRef, { data: chunkData, index: i + index });
            });
            await batch.commit();
        }
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

            // 2. Perform Restore (Supports both legacy and chunked formats)
            let payloadString = backup.payload;
            
            if (!payloadString) {
                console.log("Fetching backup chunks...");
                const backupRef = db.collection('artifacts').doc(appId).collection('private').doc('system').collection('backups').doc(backup.id);
                const chunksSnap = await backupRef.collection('chunks').orderBy('index').get();
                payloadString = chunksSnap.docs.map(d => d.data().data).join('');
            }

            if (!payloadString) throw new Error("Backup data is empty or missing.");

            const data = JSON.parse(payloadString);
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

    // Helper: Delete backups older than 30 days (Now cleans up chunks too)
    const cleanupOldBackups = async () => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const oldBackupsSnap = await db.collection('artifacts').doc(appId).collection('private').doc('system').collection('backups')
            .where('timestamp', '<', thirtyDaysAgo.toISOString())
            .get();

        if (oldBackupsSnap.empty) return;

        for (const doc of oldBackupsSnap.docs) {
            try {
                // 1. Delete chunks sub-collection
                const chunksSnap = await doc.ref.collection('chunks').get();
                if (!chunksSnap.empty) {
                    const chunkBatch = db.batch();
                    chunksSnap.forEach(c => chunkBatch.delete(c.ref));
                    await chunkBatch.commit();
                }
                // 2. Delete main doc
                await doc.ref.delete();
            } catch (err) {
                console.warn(`Failed to delete backup ${doc.id}:`, err);
            }
        }
        console.log(`Cleaned up ${oldBackupsSnap.size} old backups.`);
    };

    // Status Logic
    const isFresh = lastBackupTime && (new Date() - lastBackupTime) < (24 * 60 * 60 * 1000); // 24 hours
    const daysSinceLastBackup = lastBackupTime ? Math.floor((new Date() - lastBackupTime) / (24 * 60 * 60 * 1000)) : null;

    return (
        <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-800 to-slate-600 flex items-center justify-center shadow-sm">
                        <Database className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white leading-none">
                            Backups
                        </h2>
                    </div>
                </div>
            </div>

            {/* ── Smart Status Card ── */}
            <div className={`p-3 rounded-xl border flex flex-col gap-3 ${isFresh ? 'bg-green-50/80 border-green-200/80 dark:bg-green-900/20 dark:border-green-800' : 'bg-amber-50/80 border-amber-200/80 dark:bg-amber-900/20 dark:border-amber-800'}`}>
                <div>
                    <h3 className={`text-sm font-bold flex items-center gap-1.5 ${isFresh ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'}`}>
                        {isFresh ? <Check size={14} /> : <AlertTriangle size={14} />}
                        {daysSinceLastBackup === 0 ? "Backed up today" : daysSinceLastBackup === null ? "No backups yet" : `${daysSinceLastBackup} days since last backup`}
                    </h3>
                </div>
                <button
                    onClick={createSnapshot}
                    disabled={loading}
                    className={`w-full flex justify-center items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm ${isFresh ? 'bg-white dark:bg-slate-800 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/30' : 'bg-amber-600 text-white hover:bg-amber-700'}`}
                >
                    {loading ? <Loader className="animate-spin" size={15} /> : <Save size={15} />}
                    {isFresh ? "New Snapshot" : "Backup Now"}
                </button>
            </div>

            {/* ── Snapshot History Accordion ── */}
            <details className="group border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 shadow-sm mt-3 overflow-hidden">
                <summary className="p-3 text-sm font-bold text-slate-800 dark:text-white cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 flex items-center justify-between list-none">
                    <span>Version History ({backups.length})</span>
                    <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="p-3 pt-0 space-y-2 max-h-[300px] overflow-y-auto">
                    {backups.map(b => (
                        <div key={b.id} className={`flex flex-col gap-2 p-2.5 rounded-lg border transition-colors ${b.isSafetySnapshot ? 'bg-indigo-50/60 border-indigo-200/80 dark:bg-indigo-900/15 dark:border-indigo-800' : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700'} hover:shadow-sm`}>
                            <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {b.isSafetySnapshot && (
                                        <span className="bg-indigo-50 text-indigo-600 text-[10px] font-bold px-1 py-px rounded-full ring-1 ring-indigo-200/60 flex items-center gap-1">
                                            <ShieldCheck size={10} /> Safety
                                        </span>
                                    )}
                                    <span className="text-xs font-bold text-slate-700 dark:text-white tabular-nums">
                                        {new Date(b.timestamp).toLocaleString()}
                                    </span>
                                </div>
                                <button
                                    onClick={() => restoreSnapshot(b)}
                                    className="flex-shrink-0 text-blue-500 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded text-[10px] font-bold transition-all flex items-center gap-1"
                                >
                                    <RotateCcw size={10} /> Restore
                                </button>
                            </div>
                            <div className="text-[10px] text-slate-400 flex gap-1 flex-wrap">
                                <span className="bg-slate-50 dark:bg-slate-700/50 px-1 py-px text-[10px] rounded-sm ring-1 ring-slate-200/60 dark:ring-slate-600">📦 {b.stats.inventory}</span>
                                <span className="bg-slate-50 dark:bg-slate-700/50 px-1 py-px text-[10px] rounded-sm ring-1 ring-slate-200/60 dark:ring-slate-600">📄 {b.stats.quotes}</span>
                                <span className="bg-slate-50 dark:bg-slate-700/50 px-1 py-px text-[10px] rounded-sm ring-1 ring-slate-200/60 dark:ring-slate-600">📝 {b.stats.transactions}</span>
                            </div>
                        </div>
                    ))}
                    {backups.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                            <Database className="w-6 h-6 text-slate-300 dark:text-slate-600 mb-2" />
                            <p className="text-xs text-slate-400">No backups found.</p>
                        </div>
                    )}
                </div>
            </details>
        </div>
    );
};

export default BackupManager;