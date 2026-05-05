import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import ExcelJS from 'exceljs';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, serverTimestamp, onSnapshot, writeBatch } from 'firebase/firestore';
import { firebaseApp, appId } from '../lib/firebase';
const db = getFirestore(firebaseApp);

import {
    Upload,
    Truck,
    Package,
    FileText,
    Users,
    LogOut,
    Plus,
    Filter,
    ChevronDown,
    ChevronUp,
    Trash2,
    Printer,
    X,
    FileImage as ImageIcon,
    ChevronLeft,
    ChevronRight,
    Camera,
    Edit,
    User as UserIcon,
    Clock,
    Settings,
    Save,
    AlertTriangle,
    Eye,
    EyeOff,
    List,
    CheckSquare,
    ArrowUpDown,
    Minus,
    BookOpen,
    TrendingUp
} from 'lucide-react';

const ROLES = {
    ADMIN: 'admin',
    FACTORY: 'factory',
    SITE: 'site',
    DUAL: 'dual'
};

const STATUS = {
    DRAFT: 'Draft',
    READY_PROD: 'Ready for Production',
    PROD_APPROVAL: 'Factory Approval Pending',
    READY_DISPATCH: 'Ready for Dispatch',
    INSTALL_APPROVAL: 'Installation Approval Pending',
    READY_HANDOVER: 'Ready for Handover',
    COMPLETED: 'Handover Completed'
};

const DEFAULT_STATUS_BUTTONS = [
    { label: 'Mark Ready for Prod', value: STATUS.READY_PROD },
    { label: 'Mark Ready for Dispatch', value: STATUS.READY_DISPATCH },
    { label: 'Mark Ready for Handover', value: STATUS.READY_HANDOVER },
    { label: 'Complete', value: STATUS.COMPLETED },
];

// --- Helper Functions ---

const loadXLSX = () => {
    return new Promise((resolve, reject) => {
        if (window.XLSX) return resolve(window.XLSX);
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        script.onload = () => resolve(window.XLSX);
        script.onerror = reject;
        document.head.appendChild(script);
    });
};

const compressImage = (file, maxWidth = 1200) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const elem = document.createElement('canvas');
                const scaleFactor = maxWidth / img.width;
                elem.width = maxWidth;
                elem.height = img.height * scaleFactor;
                const ctx = elem.getContext('2d');
                ctx.drawImage(img, 0, 0, elem.width, elem.height);
                resolve(elem.toDataURL('image/jpeg', 0.7));
            };
        };
    });
};

const readFileAsArrayBuffer = (file) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsArrayBuffer(file);
    });
};

const arrayBufferToBase64 = (buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
};

// ── Gemini AI QC ─────────────────────────────────────────────────────────────

const GEMINI_MODEL = 'gemini-3-flash-preview';

// Key is stored in Firestore (never in the bundle) so it can be rotated without redeployment.
// Path: artifacts/{appId}/public/data/app_config/ai_settings  →  field: geminiKey
let _geminiKeyCache = null;
const getGeminiKey = async () => {
    if (_geminiKeyCache) return _geminiKeyCache;
    try {
        const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'app_config', 'ai_settings'));
        if (snap.exists()) _geminiKeyCache = snap.data().geminiKey || null;
    } catch { /* silently fail — QC will be skipped */ }
    return _geminiKeyCache;
};

// Convert a stored image URL (data URI or external URL) to a Gemini inlineData part.
// Returns null if the image cannot be loaded.
const imageUrlToBase64Part = async (url) => {
    if (!url) return null;
    if (url.startsWith('data:')) {
        const m = url.match(/^data:([^;]+);base64,(.+)$/);
        if (!m) return null;
        return { inlineData: { mimeType: m[1], data: m[2] } };
    }
    // External URL — attempt browser fetch (may fail on CORS-restricted hosts)
    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) return null;
        const blob = await resp.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onerror = () => resolve(null);
            reader.onloadend = () => {
                const dataUrl = reader.result;
                if (!dataUrl) { resolve(null); return; }
                const parts = dataUrl.split(',');
                if (parts.length < 2) { resolve(null); return; }
                resolve({ inlineData: { mimeType: blob.type || 'image/jpeg', data: parts[1] } });
            };
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
};

// Call Gemini Vision to compare a factory photo against all artwork images.
// Returns { artworkIdx: number, pass: boolean, issues: string[] } or null on failure.
const runGeminiQC = async (artworkImages, factoryPhotoDataUrl) => {
    const apiKey = await getGeminiKey();
    if (!apiKey || !artworkImages?.length || !factoryPhotoDataUrl) return null;
    try {
        const artCount = artworkImages.length;
        const parts = [];

        parts.push({
            text:
                `You are a strict quality-control inspector for a custom signage manufacturing company.\n\n` +
                `You will be shown ${artCount} Master Artwork reference image(s) (labeled Artwork 1 to ${artCount}), ` +
                `followed by one factory production photograph.\n\n` +
                `Your task:\n` +
                `1. Identify which Master Artwork the factory photo is intended to be. Output its 0-based index in "artworkIdx".\n` +
                `2. Perform an EXACT match comparison between the factory photo and that artwork. The printed sign must replicate the artwork completely — no more, no less.\n` +
                `3. FAIL (pass: false) if ANY of the following are true:\n` +
                `   - The factory photo contains extra panels, sections, or content NOT present in the artwork\n` +
                `   - The factory photo is missing any panel, section, or content shown in the artwork\n` +
                `   - Overall sign layout or structure differs from the artwork\n` +
                `   - Any multilingual text (Malayalam, Hindi, Arabic, English, etc.) is misspelled or missing\n` +
                `   - Icons, logos, arrows, or graphic elements are wrong, missing, or misplaced\n` +
                `   - Colors are significantly inaccurate\n` +
                `   - The factory photo only partially matches the artwork (e.g. one matching section inside a larger sign)\n\n` +
                `Respond ONLY with valid JSON (no markdown, no explanation):\n` +
                `{ "artworkIdx": <integer>, "pass": <true|false>, "issues": ["issue 1", ...] }\n\n` +
                `Set "pass": true and "issues": [] ONLY when the factory photo is an exact match of the entire artwork.`
        });

        for (let i = 0; i < artworkImages.length; i++) {
            parts.push({ text: `Master Artwork ${i + 1}:` });
            const part = await imageUrlToBase64Part(artworkImages[i].url);
            if (part) parts.push(part);
        }

        parts.push({ text: 'Factory Production Photo (compare against the identified artwork):' });
        const factPart = await imageUrlToBase64Part(factoryPhotoDataUrl);
        if (factPart) parts.push(factPart);

        const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
                })
            }
        );

        if (!resp.ok) {
            const errBody = await resp.json().catch(() => ({}));
            console.error('Gemini QC API error', resp.status, errBody);
            return null;
        }

        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            console.warn('Gemini QC: empty/blocked response', JSON.stringify(data).slice(0, 500));
            return null;
        }

        // Strip possible markdown code fences
        const jsonText = text.replace(/^```json\n?|\n?```$/g, '').trim();
        return JSON.parse(jsonText);
    } catch (e) {
        console.error('runGeminiQC error:', e);
        return null;
    }
};

// Derive the sign-level factory QC status from its factory photos array.
const computeFactoryQcStatus = (factoryImages, artworkCount) => {
    if (artworkCount === 0) return 'na';
    if (!factoryImages || factoryImages.length === 0) return 'awaiting_photos';

    // Rework beats everything — if any photo failed, flag it immediately
    if (factoryImages.some(img => img.qcStatus === 'fail')) return 'rework_needed';

    // Still waiting on in-flight QC calls
    if (factoryImages.some(img => img.qcStatus === 'pending')) return 'processing';

    // All results are in — check all-sides coverage
    const coveredArtworks = new Set(
        factoryImages
            .filter(img => img.qcStatus === 'pass' && img.qcArtworkIdx != null)
            .map(img => img.qcArtworkIdx)
    );

    if (coveredArtworks.size >= artworkCount) return 'ready_for_dispatch';

    return 'awaiting_photos';
};

// --- Components ---

const Loading = () => (
    <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-600">
        <div className="animate-spin mr-3">
            <Package size={24} />
        </div>
        Loading Admire Project Tracker...
    </div>
);

const Lightbox = ({ images, initialIndex = 0, onClose, onDelete }) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);

    const next = (e) => { e.stopPropagation(); setCurrentIndex((prev) => (prev + 1) % images.length); };
    const prev = (e) => { e.stopPropagation(); setCurrentIndex((prev) => (prev - 1 + images.length) % images.length); };

    if (!images || images.length === 0) return null;

    const currentImg = images[currentIndex];

    const handleDelete = (e) => {
        e.stopPropagation();
        if (onDelete) {
            onDelete(currentIndex);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/95 z-[100] flex flex-col justify-center items-center p-4 animate-in fade-in duration-200" onClick={onClose}>
            <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white p-2 z-10">
                <X size={32} />
            </button>

            {onDelete && (
                <button
                    onClick={handleDelete}
                    className="absolute top-4 right-20 text-red-400 hover:text-red-500 hover:bg-white/10 p-2 rounded-full transition z-10 cursor-pointer"
                    title="Delete Image"
                >
                    <Trash2 size={28} />
                </button>
            )}

            <div className="relative w-full max-w-4xl max-h-[85vh] flex items-center justify-center">
                <img
                    src={currentImg.url || currentImg}
                    alt="Full view"
                    className="max-w-full max-h-[80vh] object-contain shadow-2xl rounded-sm"
                    onClick={(e) => e.stopPropagation()}
                />

                {images.length > 1 && (
                    <>
                        <button
                            onClick={prev}
                            className="absolute left-2 md:left-[-60px] top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-black/20 hover:bg-white/10 p-3 rounded-full transition backdrop-blur-sm"
                        >
                            <ChevronLeft size={32} />
                        </button>
                        <button
                            onClick={next}
                            className="absolute right-2 md:right-[-60px] top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-black/20 hover:bg-white/10 p-3 rounded-full transition backdrop-blur-sm"
                        >
                            <ChevronRight size={32} />
                        </button>
                    </>
                )}
            </div>

            <div className="absolute bottom-6 left-0 right-0 text-center text-white/80 pointer-events-none px-4">
                <p className="font-bold text-lg mb-2">{currentImg.stage || 'Image Preview'}</p>

                <div className="flex items-center justify-center gap-6 text-sm opacity-80 mb-2">
                    <span>{currentIndex + 1} of {images.length}</span>
                    {currentImg.timestamp && (
                        <span className="flex items-center gap-1">
                            <Clock size={14} /> {new Date(currentImg.timestamp).toLocaleString()}
                        </span>
                    )}
                    {currentImg.uploadedBy && (
                        <span className="flex items-center gap-1">
                            <UserIcon size={14} /> {currentImg.uploadedBy}
                        </span>
                    )}
                </div>

                {currentImg.qcStatus === 'fail' && currentImg.qcIssues?.length > 0 && (
                    <div className="pointer-events-auto inline-block bg-red-900/80 border border-red-500 rounded-lg px-4 py-2 text-left max-w-md mx-auto">
                        <p className="text-xs font-bold text-red-300 uppercase tracking-wide mb-1.5">
                            QC Rework Required — Artwork {(currentImg.qcArtworkIdx ?? 0) + 1}
                        </p>
                        {currentImg.qcIssues.map((issue, i) => (
                            <p key={i} className="text-xs text-red-200">• {issue}</p>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const UploadModal = ({ isOpen, onClose, onUpload, type, stages, defaultStage }) => {
    const [items, setItems] = useState([]); // [{id, file, stage, preview}]
    const [uploading, setUploading] = useState(false);

    const defaultSt = defaultStage || (stages && stages.length > 0 ? stages[0] : '');

    useEffect(() => {
        if (isOpen) setItems([]);
    }, [isOpen]);

    if (!isOpen) return null;

    const addFiles = (fileList) => {
        const newItems = Array.from(fileList).map(file => ({
            id: Math.random().toString(36).slice(2),
            file,
            stage: defaultSt,
            preview: URL.createObjectURL(file),
        }));
        setItems(prev => [...prev, ...newItems]);
    };

    const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id));
    const setItemStage = (id, stage) => setItems(prev => prev.map(i => i.id === id ? { ...i, stage } : i));

    const handleSubmit = async () => {
        if (items.length === 0) return;
        setUploading(true);
        await onUpload(items.map(i => ({ file: i.file, stage: i.stage })));
        setUploading(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold">Add {type} Photos</h3>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700"><X size={18} /></button>
                </div>

                {/* File pickers — always visible so user can add more */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <label className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 cursor-pointer hover:bg-indigo-100 active:bg-indigo-200 transition select-none">
                        <Camera size={22} className="text-indigo-500" />
                        <span className="text-sm font-semibold text-indigo-700">Take Photo</span>
                        <input type="file" accept="image/*" capture="environment" className="hidden"
                            onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }} />
                    </label>
                    <label className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 active:bg-slate-200 transition select-none">
                        <ImageIcon size={22} className="text-slate-400" />
                        <span className="text-sm font-semibold text-slate-600">From Gallery</span>
                        <input type="file" accept="image/*" multiple className="hidden"
                            onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }} />
                    </label>
                </div>

                {/* Pending images list */}
                {items.length > 0 && (
                    <div className="space-y-2 max-h-56 overflow-y-auto mb-4 pr-1">
                        {items.map(item => (
                            <div key={item.id} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border">
                                <img src={item.preview} className="h-11 w-11 object-cover rounded border flex-shrink-0 bg-white" alt="" />
                                <span className="flex-1 text-xs text-slate-600 truncate min-w-0">{item.file.name}</span>
                                {stages && stages.length > 0 ? (
                                    <select
                                        className="text-xs border rounded-lg px-1.5 py-1 bg-white flex-shrink-0 max-w-[130px]"
                                        value={item.stage}
                                        onChange={e => setItemStage(item.id, e.target.value)}
                                    >
                                        {stages.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                ) : (
                                    <span className="text-[10px] text-slate-400 flex-shrink-0">{item.stage || '—'}</span>
                                )}
                                <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 flex-shrink-0 p-0.5"><X size={13} /></button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 font-medium text-sm">Cancel</button>
                    <button
                        onClick={handleSubmit}
                        disabled={items.length === 0 || uploading}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-2 text-sm"
                    >
                        {uploading ? <span className="animate-spin"><Package size={15} /></span> : <Upload size={15} />}
                        {items.length > 0 ? `Upload ${items.length} Photo${items.length > 1 ? 's' : ''}` : 'Upload'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const BOQSettingsModal = ({ boq, onClose }) => {
    const [name, setName] = useState(boq.name);
    const [factoryStages, setFactoryStages] = useState(boq.factoryStages || []);
    const [siteStages, setSiteStages] = useState(boq.siteStages || []);
    const [statusButtons, setStatusButtons] = useState(boq.statusButtons || DEFAULT_STATUS_BUTTONS);
    const [newFactoryStage, setNewFactoryStage] = useState('');
    const [newSiteStage, setNewSiteStage] = useState('');
    const [saving, setSaving] = useState(false);

    const handleAddStage = (type) => {
        if (type === 'factory' && newFactoryStage.trim()) {
            setFactoryStages([...factoryStages, newFactoryStage.trim()]);
            setNewFactoryStage('');
        }
        if (type === 'site' && newSiteStage.trim()) {
            setSiteStages([...siteStages, newSiteStage.trim()]);
            setNewSiteStage('');
        }
    };

    const handleRemoveStage = (type, index) => {
        if (type === 'factory') {
            setFactoryStages(factoryStages.filter((_, i) => i !== index));
        }
        if (type === 'site') {
            setSiteStages(siteStages.filter((_, i) => i !== index));
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id), {
                name,
                factoryStages,
                siteStages,
                statusButtons: statusButtons.filter(b => b.label.trim() && b.value.trim())
            });
            onClose();
        } catch (e) {
            console.error(e);
            alert("Failed to save settings");
        }
        setSaving(false);
    };

    const handleDeleteBOQ = async () => {
        if (!window.confirm(`CRITICAL WARNING: This will delete BOQ "${boq.name}" and ALL ${boq.stats?.total || 0} signs inside it. This cannot be undone. Are you sure?`)) return;

        setSaving(true);
        try {
            const signsRef = collection(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id, 'signs');
            const snapshot = await getDocs(signsRef);
            const batch = writeBatch(db);

            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });
            await batch.commit();

            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id));

            window.location.reload();
        } catch (e) {
            console.error("Delete failed", e);
            alert("Delete failed: " + e.message);
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-white z-[80] overflow-y-auto">
            <div className="max-w-2xl mx-auto p-6">
                <div className="flex justify-between items-center mb-8 border-b pb-4">
                    <h2 className="text-2xl font-bold flex items-center gap-2"><Settings className="text-slate-400" /> BOQ Settings</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X /></button>
                </div>

                <div className="space-y-8">
                    <section>
                        <label className="block text-sm font-bold text-slate-700 mb-2">BOQ Name</label>
                        <input
                            className="w-full border p-2 rounded-lg text-lg"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </section>

                    <div className="grid md:grid-cols-2 gap-8">
                        <section className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                            <h3 className="font-bold text-orange-800 mb-4 flex items-center gap-2"><Package size={18} /> Factory Stages</h3>
                            <div className="space-y-2 mb-4">
                                {factoryStages.map((stage, i) => (
                                    <div key={i} className="flex justify-between items-center bg-white p-2 rounded border shadow-sm">
                                        <span className="text-sm">{stage}</span>
                                        <button onClick={() => handleRemoveStage('factory', i)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                                    </div>
                                ))}
                                {factoryStages.length === 0 && <p className="text-xs text-orange-400 italic">No custom stages (Using default)</p>}
                            </div>
                            <div className="flex gap-2">
                                <input
                                    placeholder="New Stage Name"
                                    className="flex-1 text-sm p-2 border rounded"
                                    value={newFactoryStage}
                                    onChange={e => setNewFactoryStage(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddStage('factory')}
                                />
                                <button onClick={() => handleAddStage('factory')} className="bg-orange-200 text-orange-800 p-2 rounded hover:bg-orange-300"><Plus size={18} /></button>
                            </div>
                        </section>

                        <section className="bg-green-50 p-4 rounded-xl border border-green-100">
                            <h3 className="font-bold text-green-800 mb-4 flex items-center gap-2"><Truck size={18} /> Site Stages</h3>
                            <div className="space-y-2 mb-4">
                                {siteStages.map((stage, i) => (
                                    <div key={i} className="flex justify-between items-center bg-white p-2 rounded border shadow-sm">
                                        <span className="text-sm">{stage}</span>
                                        <button onClick={() => handleRemoveStage('site', i)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                                    </div>
                                ))}
                                {siteStages.length === 0 && <p className="text-xs text-green-400 italic">No custom stages (Using default)</p>}
                            </div>
                            <div className="flex gap-2">
                                <input
                                    placeholder="New Stage Name"
                                    className="flex-1 text-sm p-2 border rounded"
                                    value={newSiteStage}
                                    onChange={e => setNewSiteStage(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddStage('site')}
                                />
                                <button onClick={() => handleAddStage('site')} className="bg-green-200 text-green-800 p-2 rounded hover:bg-green-300"><Plus size={18} /></button>
                            </div>
                        </section>
                    </div>

                    <section className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                        <h3 className="font-bold text-indigo-800 mb-1 flex items-center gap-2"><List size={18} /> Status Workflow Buttons</h3>
                        <p className="text-xs text-indigo-600 mb-4">Customise the bulk-action buttons shown when items are selected. The last button gets green styling.</p>
                        <div className="space-y-2 mb-4">
                            <div className="grid grid-cols-2 gap-2 px-1 mb-1">
                                <span className="text-[10px] font-bold uppercase text-indigo-500">Button Label</span>
                                <span className="text-[10px] font-bold uppercase text-indigo-500">Status Value</span>
                            </div>
                            {statusButtons.map((btn, i) => (
                                <div key={i} className="flex items-center gap-2 bg-white p-2 rounded border shadow-sm">
                                    <input
                                        className="flex-1 text-sm border rounded p-1.5 min-w-0 focus:ring-1 focus:ring-indigo-400 outline-none"
                                        placeholder="e.g. Mark Ready for Prod"
                                        value={btn.label}
                                        onChange={e => {
                                            const updated = [...statusButtons];
                                            updated[i] = { ...updated[i], label: e.target.value };
                                            setStatusButtons(updated);
                                        }}
                                    />
                                    <input
                                        className="flex-1 text-sm border rounded p-1.5 min-w-0 focus:ring-1 focus:ring-indigo-400 outline-none"
                                        placeholder="e.g. Ready for Production"
                                        value={btn.value}
                                        onChange={e => {
                                            const updated = [...statusButtons];
                                            updated[i] = { ...updated[i], value: e.target.value };
                                            setStatusButtons(updated);
                                        }}
                                    />
                                    <button onClick={() => setStatusButtons(statusButtons.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 flex-shrink-0">
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                            {statusButtons.length === 0 && <p className="text-xs text-indigo-400 italic">No buttons configured — defaults will be used.</p>}
                        </div>
                        <button
                            onClick={() => setStatusButtons([...statusButtons, { label: '', value: '' }])}
                            className="flex items-center gap-1.5 text-sm text-indigo-700 hover:text-indigo-900 font-semibold"
                        >
                            <Plus size={15} /> Add Button
                        </button>
                    </section>

                    <section className="pt-8 border-t">
                        <h3 className="text-red-600 font-bold mb-2 flex items-center gap-2"><AlertTriangle size={20} /> Danger Zone</h3>
                        <div className="bg-red-50 border border-red-100 rounded-lg p-4 flex justify-between items-center">
                            <div className="text-sm text-red-800">
                                <p className="font-bold">Delete this BOQ</p>
                                <p>Once deleted, it will be gone forever. Please be certain.</p>
                            </div>
                            <button
                                onClick={handleDeleteBOQ}
                                disabled={saving}
                                className="bg-red-600 text-white px-4 py-2 rounded font-bold hover:bg-red-700 disabled:opacity-50"
                            >
                                Delete BOQ
                            </button>
                        </div>
                    </section>
                </div>

                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t flex justify-end gap-3 md:static md:bg-transparent md:border-0 md:mt-8">
                    <button onClick={onClose} className="px-6 py-2 text-slate-600 font-medium">Cancel</button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-8 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving && <span className="animate-spin"><Package size={16} /></span>}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Login Component Removed since App handles Authentication ---

const Dashboard = ({ user, onViewBOQ, onManageUsers, onLogout }) => {
    const [boqs, setBOQs] = useState([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editBOQ, setEditBOQ] = useState(null); // {id, name}
    const [deleteBOQ, setDeleteBOQ] = useState(null); // {id, name}
    const [newBOQName, setNewBOQName] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'boqs'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const boqList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setBOQs(boqList);
        }, (err) => console.error("Error fetching boqs", err));
        return () => unsubscribe();
    }, []);

    const handleUpdateBOQName = async () => {
        if (!editBOQ || !editBOQ.name.trim()) return;
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'boqs', editBOQ.id), {
                name: editBOQ.name
            });
            setEditBOQ(null);
        } catch (e) {
            console.error("Error updating BOQ name", e);
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteBOQ) return;
        try {
            // This only deletes the BOQ doc, not the sub-collections. 
            // In a real app, you'd want a recursive delete or a cloud function.
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'boqs', deleteBOQ.id));
            setDeleteBOQ(null);
        } catch (e) {
            console.error("Error deleting BOQ", e);
        }
    };

    const getRoleBadge = (role) => {
        switch (role) {
            case ROLES.ADMIN: return <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full">Admin</span>;
            case ROLES.FACTORY: return <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full">Factory</span>;
            case ROLES.SITE: return <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">Site</span>;
            default: return <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">User</span>;
        }
    };

    return (
        <div className="min-h-screen bg-slate-50">
            <main className="max-w-7xl mx-auto px-3 py-4 sm:p-6">
                {/* ── Page header ── */}
                <div className="flex justify-between items-center mb-4 sm:mb-8">
                    <h2 className="text-lg sm:text-2xl font-bold text-slate-800">BOQ Dashboard</h2>
                    {user.role === ROLES.ADMIN && (
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="bg-indigo-600 active:bg-indigo-800 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 shadow-sm transition text-sm font-semibold"
                        >
                            <Plus size={15} /> New BOQ
                        </button>
                    )}
                </div>

                {/* ── Mobile card list (< md) ── */}
                <div className="md:hidden space-y-2.5">
                    {boqs.map(boq => (
                        <div
                            key={boq.id}
                            className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden active:bg-slate-50 transition-colors"
                            onClick={() => onViewBOQ(boq)}
                        >
                            {/* Card top: icon + name + actions */}
                            <div className="flex items-center gap-3 px-4 pt-3 pb-2">
                                <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600 flex-shrink-0">
                                    <FileText size={16} />
                                </div>
                                <span className="flex-1 font-bold text-slate-800 text-sm truncate">{boq.name}</span>
                                {user.role === ROLES.ADMIN && (
                                    <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={() => setEditBOQ({ id: boq.id, name: boq.name })}
                                            className="p-2 rounded-full text-slate-400 active:bg-indigo-50 active:text-indigo-600 transition"
                                            title="Rename BOQ"
                                        >
                                            <Edit size={14} />
                                        </button>
                                        <button
                                            onClick={() => setDeleteBOQ({ id: boq.id, name: boq.name })}
                                            className="p-2 rounded-full text-slate-400 active:bg-red-50 active:text-red-600 transition"
                                            title="Delete BOQ"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Stats grid 2×2 */}
                            <div className="grid grid-cols-4 border-t border-slate-100 divide-x divide-slate-100">
                                <div className="flex flex-col items-center py-2.5">
                                    <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Total</span>
                                    <span className="text-base font-bold text-slate-700 tabular-nums">{boq.stats?.total || 0}</span>
                                </div>
                                <div className="flex flex-col items-center py-2.5">
                                    <span className="text-[10px] text-orange-400 font-medium uppercase tracking-wide">Pending</span>
                                    <span className="text-base font-bold text-orange-500 tabular-nums">{boq.stats?.pending || 0}</span>
                                </div>
                                <div className="flex flex-col items-center py-2.5">
                                    <span className="text-[10px] text-blue-400 font-medium uppercase tracking-wide">Produced</span>
                                    <span className="text-base font-bold text-blue-500 tabular-nums">{boq.stats?.manufactured || 0}</span>
                                </div>
                                <div className="flex flex-col items-center py-2.5">
                                    <span className="text-[10px] text-green-500 font-medium uppercase tracking-wide">Installed</span>
                                    <span className="text-base font-bold text-green-500 tabular-nums">{boq.stats?.installed || 0}</span>
                                </div>
                            </div>
                        </div>
                    ))}

                    {boqs.length === 0 && (
                        <div className="py-16 text-center text-slate-400">
                            <Package size={40} className="mx-auto mb-3 opacity-40" />
                            <p className="text-sm">No BOQs found. Tap <span className="font-semibold text-indigo-600">New BOQ</span> to create one.</p>
                        </div>
                    )}
                </div>

                {/* ── Desktop table (≥ md) ── */}
                <div className="hidden md:block bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-3 w-1/3">BOQ Name</th>
                                <th className="px-4 py-3 text-center w-24">Total</th>
                                <th className="px-4 py-3 text-center w-24">Pending</th>
                                <th className="px-4 py-3 text-center w-24 text-blue-600">Produced</th>
                                <th className="px-4 py-3 text-center w-24 text-green-600">Installed</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {boqs.map(boq => (
                                <tr
                                    key={boq.id}
                                    className="hover:bg-slate-50 transition cursor-pointer group"
                                    onClick={() => onViewBOQ(boq)}
                                >
                                    <td className="px-6 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="bg-indigo-50 p-2 rounded text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition">
                                                <FileText size={16} />
                                            </div>
                                            <span className="font-bold text-slate-800 text-sm">{boq.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-center font-bold text-slate-600 text-sm">{boq.stats?.total || 0}</td>
                                    <td className="px-4 py-3 text-center font-bold text-orange-600 text-sm">{boq.stats?.pending || 0}</td>
                                    <td className="px-4 py-3 text-center font-bold text-blue-600 text-sm">{boq.stats?.manufactured || 0}</td>
                                    <td className="px-4 py-3 text-center font-bold text-green-600 text-sm">{boq.stats?.installed || 0}</td>
                                    <td className="px-6 py-3 text-right">
                                        <div className="flex justify-end items-center gap-2">
                                            {user.role === ROLES.ADMIN && (
                                                <>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setEditBOQ({ id: boq.id, name: boq.name }); }}
                                                        className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition"
                                                        title="Rename BOQ"
                                                    >
                                                        <Edit size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setDeleteBOQ({ id: boq.id, name: boq.name }); }}
                                                        className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-600 transition"
                                                        title="Delete BOQ"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </>
                                            )}
                                            <button className="text-indigo-600 font-bold text-xs hover:underline ml-2">View Details →</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {boqs.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="py-20 text-center text-slate-400">
                                        <Package size={48} className="mx-auto mb-4 opacity-50" />
                                        <p>No BOQs found. Create one to get started.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </main>

            {/* ── Add BOQ modal ── */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
                    <div className="bg-white rounded-t-2xl sm:rounded-xl p-6 w-full sm:max-w-md">
                        <h3 className="text-lg font-bold mb-4">Add New BOQ</h3>
                        <input
                            autoFocus
                            type="text"
                            className="w-full border-2 border-slate-200 focus:border-indigo-400 outline-none p-3 rounded-xl mb-4 text-sm transition-colors"
                            placeholder="BOQ Name"
                            value={newBOQName}
                            onChange={e => setNewBOQName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && newBOQName.trim() && document.getElementById('create-boq-btn').click()}
                        />
                        <div className="flex gap-2">
                            <button onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 text-slate-600 font-semibold bg-slate-100 rounded-xl active:bg-slate-200">Cancel</button>
                            <button
                                id="create-boq-btn"
                                onClick={async () => {
                                    if (!newBOQName.trim()) return;
                                    try {
                                        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'boqs'), {
                                            name: newBOQName,
                                            createdAt: serverTimestamp(),
                                            createdBy: user.username,
                                            factoryStages: [],
                                            siteStages: [],
                                            stats: { total: 0, pending: 0, manufactured: 0, installed: 0, handedover: 0 }
                                        });
                                        setShowAddModal(false);
                                        setNewBOQName('');
                                    } catch (e) { console.error(e); }
                                }}
                                className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl active:bg-indigo-800"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Edit name modal ── */}
            {editBOQ && (
                <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
                    <div className="bg-white rounded-t-2xl sm:rounded-xl p-6 w-full sm:max-w-md">
                        <h3 className="text-lg font-bold mb-4">Rename BOQ</h3>
                        <input
                            autoFocus
                            type="text"
                            className="w-full border-2 border-indigo-100 focus:border-indigo-500 outline-none p-3 rounded-xl mb-6 transition-all text-sm"
                            value={editBOQ.name}
                            onChange={e => setEditBOQ({ ...editBOQ, name: e.target.value })}
                            onKeyDown={e => e.key === 'Enter' && handleUpdateBOQName()}
                        />
                        <div className="flex gap-2">
                            <button onClick={() => setEditBOQ(null)} className="flex-1 py-2.5 text-slate-600 font-semibold bg-slate-100 rounded-xl active:bg-slate-200">Cancel</button>
                            <button onClick={handleUpdateBOQName} className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl active:bg-indigo-800">Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Delete confirmation modal ── */}
            {deleteBOQ && (
                <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
                    <div className="bg-white rounded-t-2xl sm:rounded-xl p-6 w-full sm:max-w-md">
                        <div className="flex items-center gap-3 text-red-600 mb-3">
                            <AlertTriangle size={22} />
                            <h3 className="text-lg font-bold">Delete BOQ?</h3>
                        </div>
                        <p className="text-slate-600 mb-6 text-sm">
                            Are you sure you want to delete <span className="font-bold text-slate-800">"{deleteBOQ.name}"</span>?
                            This cannot be undone and will remove all associated sign records.
                        </p>
                        <div className="flex gap-2">
                            <button onClick={() => setDeleteBOQ(null)} className="flex-1 py-2.5 text-slate-600 font-semibold bg-slate-100 rounded-xl active:bg-slate-200">Keep it</button>
                            <button onClick={handleConfirmDelete} className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-xl active:bg-red-800">Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ... EditSignModal (Same as before) ...
const EditSignModal = ({ sign, columns, onClose, onUpdate }) => {
    const [formData, setFormData] = useState({});

    useEffect(() => {
        if (sign) {
            const initialData = {};
            columns.forEach(col => {
                if (!col.isId) { // Skip ID as it usually shouldn't change
                    initialData[col.key] = sign[col.key] || '';
                }
            });
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setFormData(initialData);
        }
    }, [sign, columns]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = () => {
        onUpdate(sign._id, formData);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
            <div className="bg-white rounded-xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="p-6 border-b flex justify-between items-center">
                    <h3 className="text-xl font-bold">Edit Sign Details</h3>
                    <button onClick={onClose}><X size={20} /></button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 grid grid-cols-2 gap-4">
                    {columns.filter(c => !c.isId && c.visible).map(col => (
                        <div key={col.key} className="col-span-2 sm:col-span-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{col.label}</label>
                            <input
                                name={col.key}
                                value={formData[col.key] || ''}
                                onChange={handleChange}
                                className="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                    ))}
                </div>
                <div className="p-6 border-t bg-slate-50 rounded-b-xl flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
                    <button onClick={handleSubmit} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded hover:bg-indigo-700">Save Changes</button>
                </div>
            </div>
        </div>
    );
};

// ... BOQManager (Same as before) ...
const BOQManager = ({ boq, user, onBack }) => {
    const [signs, setSigns] = useState([]);
    const [viewMode, setViewMode] = useState('table');
    const [importConfig, setImportConfig] = useState(null);
    const [selectedSigns, setSelectedSigns] = useState(new Set());
    const [filters, setFilters] = useState({});
    const [sortConfig, setSortConfig] = useState(null);
    const [loadingImport, setLoadingImport] = useState(false);
    const [columns, setColumns] = useState([]);
    const [lightboxImages, setLightboxImages] = useState(null);
    const [editingSign, setEditingSign] = useState(null);
    const [showSettings, setShowSettings] = useState(false);

    // New state for Column Visibility
    const [showColumnSelector, setShowColumnSelector] = useState(false);
    const [visibleColumnKeys, setVisibleColumnKeys] = useState(new Set());

    // Upload Modal State
    const [uploadModal, setUploadModal] = useState({ isOpen: false, sign: null, isFactory: false });

    // Sticky Stage State
    const [lastFactoryStage, setLastFactoryStage] = useState('');
    const [lastSiteStage, setLastSiteStage] = useState('');

    // ID multi-select filter
    const [idFilter, setIdFilter] = useState(new Set());
    const [idSearch, setIdSearch] = useState('');
    const [showIdDropdown, setShowIdDropdown] = useState(false);
    const idDropdownRef = React.useRef(null);

    useEffect(() => {
        if (!showIdDropdown) return;
        const handler = (e) => {
            if (idDropdownRef.current && !idDropdownRef.current.contains(e.target)) {
                setShowIdDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showIdDropdown]);

    // Tab state
    const [activeTab, setActiveTab] = useState('items');

    useEffect(() => {
        if (!boq) return;
        const signsRef = collection(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id, 'signs');
        const unsubscribe = onSnapshot(signsRef, (snapshot) => {
            const loadedSigns = snapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
            setSigns(loadedSigns);

            if (user.role === ROLES.ADMIN) {
                const stats = loadedSigns.reduce((acc, sign) => {
                    acc.total++;
                    if (sign.status === STATUS.DRAFT || sign.status === STATUS.READY_PROD) acc.pending++;
                    if (sign.status === STATUS.READY_DISPATCH) acc.manufactured++;
                    if (sign.status === STATUS.COMPLETED) acc.handedover++;
                    if (sign.status === STATUS.READY_HANDOVER) acc.installed++;
                    return acc;
                }, { total: 0, pending: 0, manufactured: 0, installed: 0, handedover: 0 });

                updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id), { stats });
            }
        });
        return () => unsubscribe();
    }, [boq.id, user.role]);

    useEffect(() => {
        if (boq.columns) {
            setColumns(boq.columns);
            // Initialize visible columns to all currently visible columns from config
            if (visibleColumnKeys.size === 0) {
                const initialKeys = new Set(boq.columns.filter(c => c.visible).map(c => c.key));
                setVisibleColumnKeys(initialKeys);
            }
        }
    }, [boq, visibleColumnKeys.size]);

    const toggleColumnVisibility = (key) => {
        const newSet = new Set(visibleColumnKeys);
        if (newSet.has(key)) newSet.delete(key);
        else newSet.add(key);
        setVisibleColumnKeys(newSet);
    };

    // ... Import Handlers & Logic (Same as before) ...
    const findHeaderRow = (rows) => {
        let bestIdx = 0;
        let maxCols = 0;
        const scanLimit = Math.min(rows.length, 25);

        for (let i = 0; i < scanLimit; i++) {
            const row = rows[i];
            let colCount = 0;
            if (Array.isArray(row)) {
                colCount = row.filter(c => c !== undefined && c !== null && String(c).trim() !== '').length;
            } else if (row instanceof HTMLTableRowElement) {
                colCount = Array.from(row.children).filter(c => c.innerText.trim().length > 0).length;
            }

            if (colCount > maxCols) {
                maxCols = colCount;
                bestIdx = i;
            }
        }
        return bestIdx;
    };

    const parseSheetData = (workbook) => {
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const json = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        const headerIdx = findHeaderRow(json);
        const headers = json[headerIdx].map(h => String(h).trim());

        const rows = json.slice(headerIdx + 1);

        const mappedData = rows.map(row => {
            const rowObj = {};
            let hasData = false;

            headers.forEach((h, i) => {
                if (!h) return; // Skip empty header columns
                const val = row[i];
                if (val !== undefined && val !== null) {
                    const strVal = String(val).trim();
                    if (strVal !== '') {
                        rowObj[h] = strVal;
                        hasData = true;
                    }
                }
            });
            return hasData ? rowObj : null;
        }).filter(r => r !== null);

        return { headers: headers.filter(h => h), data: mappedData };
    };

    const processHTMLImport = async (fileList) => {
        let htmlFile = null;
        let imageFiles = {};

        Array.from(fileList).forEach(f => {
            if (f.name.toLowerCase().endsWith('.htm') || f.name.toLowerCase().endsWith('.html')) {
                if (!htmlFile || f.name.includes('sheet')) htmlFile = f;
            } else if (f.type.startsWith('image/')) {
                const baseName = f.name.substring(0, f.name.lastIndexOf('.'));
                imageFiles[f.name.toLowerCase()] = f;
                imageFiles[baseName.toLowerCase()] = f;
            }
        });

        if (!htmlFile) {
            alert("No HTML file found. Please select .htm file.");
            return null;
        }

        const text = await htmlFile.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const table = doc.querySelector('table');

        if (!table) return null;

        const allRows = Array.from(table.querySelectorAll('tr'));

        const headerIndex = findHeaderRow(allRows);

        const headers = Array.from(allRows[headerIndex].children).map(th => th.innerText.trim().replace(/\s+/g, ' '));
        const dataRows = allRows.slice(headerIndex + 1);

        const data = await Promise.all(dataRows.map(async row => {
            const cells = Array.from(row.children);
            const rowData = {};
            let hasData = false;

            for (let index = 0; index < cells.length; index++) {
                const cell = cells[index];
                const header = headers[index];
                if (header) {
                    const img = cell.querySelector('img');
                    if (img) {
                        const src = img.getAttribute('src');
                        if (src) {
                            const srcName = src.split('/').pop().toLowerCase();
                            const srcBase = srcName.substring(0, srcName.lastIndexOf('.'));
                            const imageFile = imageFiles[srcName] || imageFiles[srcBase];

                            if (imageFile) {
                                const base64 = await compressImage(imageFile, 600);
                                rowData[header] = base64;
                                rowData[header + '_isImage'] = true;
                                hasData = true;
                            }
                        }
                    } else {
                        const txt = cell.innerText.trim();
                        if (txt) {
                            rowData[header] = txt;
                            hasData = true;
                        }
                    }
                }
            }
            return hasData ? rowData : null;
        }));

        const validData = data.filter(r => r !== null);
        if (validData.length === 0) {
            alert("Parsed 0 valid rows. Check if your HTML structure matches standard Excel export.");
        }
        return { headers, data: validData };
    };

    const processImportWithExcelJS = async (file) => {
        try {
            const buffer = await readFileAsArrayBuffer(file);
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(buffer);

            const worksheet = workbook.getWorksheet(1);
            if (!worksheet) return null;

            const rows = [];
            const maxCols = Math.min(worksheet.actualColumnCount || 50, 100);

            worksheet.eachRow({ includeEmpty: true }, (row) => {
                const values = [];
                for (let i = 1; i <= maxCols; i++) {
                    const cell = row.getCell(i);
                    const val = cell.value;
                    let finalText = "";
                    let isFormulaImage = false;

                    if (val !== null && val !== undefined) {
                        if (typeof val === 'object') {
                            if (val.error) {
                                finalText = "";
                            } else if (val.formula || val.sharedFormula) {
                                // Catch both IMAGE() and HYPERLINK() formulas
                                const formulaStr = String(val.formula || val.sharedFormula);
                                const imageMatch = formulaStr.match(/(?:IMAGE|HYPERLINK)\(\s*["']([^"']+)["']/i);

                                if (imageMatch && imageMatch[1]) {
                                    finalText = imageMatch[1];
                                    isFormulaImage = true;
                                } else if (val.hyperlink) {
                                    finalText = val.hyperlink;
                                    isFormulaImage = true;
                                } else {
                                    finalText = val.result !== undefined ? String(val.result) : "";
                                }
                            } else if (val.hyperlink) {
                                // Catch native Excel hyperlink objects
                                finalText = val.hyperlink;
                                isFormulaImage = true;
                            } else {
                                finalText = val.text || val.result || String(val);
                            }
                        } else {
                            finalText = String(val);
                        }
                    }
                    values.push({ text: finalText, isFormulaImage });
                }
                rows.push(values);
            });

            const findHeaderIdx = (rws) => {
                let bestIdx = 0; let maxCols = 0;
                for (let i = 0; i < Math.min(rws.length, 25); i++) {
                    const colCount = rws[i].filter(c => c.text && c.text.trim() !== '').length;
                    if (colCount > maxCols) { maxCols = colCount; bestIdx = i; }
                }
                return bestIdx;
            };

            const headerIdx = findHeaderIdx(rows);
            if (headerIdx === -1) return null;

            const headers = rows[headerIdx].map(h => String(h.text || "").trim());
            const dataRows = rows.slice(headerIdx + 1);

            const imageMap = {};
            const rowImageMap = {};

            // Keep traditional floating image extraction as a fallback
            worksheet.getImages().forEach(img => {
                const imgData = workbook.getImage(img.imageId);
                if (imgData && imgData.buffer) {
                    const tl = img.range.tl;
                    const br = img.range.br || tl;
                    // Use a slight offset to ensure we catch the cell that primarily contains the image
                    const r = Math.floor(tl.row);
                    const c = Math.floor(tl.col);
                    const ext = imgData.extension || 'png';
                    const base64 = `data:image/${ext};base64,${arrayBufferToBase64(imgData.buffer)}`;

                    imageMap[`${r}_${c}`] = base64;
                    // Also map to the row as a fallback
                    if (!rowImageMap[r]) rowImageMap[r] = [];
                    rowImageMap[r].push(base64);
                }
            });

            const mappedData = [];
            // Expanded keyword list to ensure column detection
            const imageKeywords = ['artwork', 'image', 'photo', 'picture', 'visual', 'sign', 'link'];

            for (let i = 0; i < dataRows.length; i++) {
                const rowObj = {};
                let hasData = false;
                const actualRowIdx = headerIdx + 1 + i;

                headers.forEach((h, colIdx) => {
                    if (!h) return;

                    const cellData = dataRows[i][colIdx];
                    let imgSource = imageMap[`${actualRowIdx}_${colIdx}`];

                    // Priority 1: Did we extract an explicit formula/hyperlink URL?
                    if (!imgSource && cellData && cellData.isFormulaImage) {
                        imgSource = cellData.text;
                    }

                    const isImageCol = imageKeywords.some(kw => h.toLowerCase().includes(kw));

                    // Priority 2: Is it just a raw URL pasted as plain text in an image column?
                    if (!imgSource && cellData && cellData.text) {
                        const textStr = cellData.text.trim();
                        if (isImageCol && /^https?:\/\//i.test(textStr)) {
                            imgSource = textStr;
                        }
                    }

                    // Priority 3: Grab stray floating images attached to the row
                    if (!imgSource && isImageCol && rowImageMap[actualRowIdx] && rowImageMap[actualRowIdx].length > 0) {
                        imgSource = rowImageMap[actualRowIdx].shift();
                    }

                    if (imgSource) {
                        rowObj[h] = imgSource;
                        rowObj[h + '_isImage'] = true;
                        hasData = true;
                    } else if (cellData && cellData.text) {
                        const trimmed = cellData.text.trim();
                        if (trimmed !== '') {
                            rowObj[h] = trimmed;
                            hasData = true;
                        }
                    }
                });
                if (hasData) mappedData.push(rowObj);
            }

            return { headers: headers.filter(h => h), data: mappedData };
        } catch (e) {
            console.error("ExcelJS import failed, falling back to SheetJS", e);
            return processImportWithSheetJS(file);
        }
    };

    const processImportWithSheetJS = async (file) => {
        try {
            const XLSX = await loadXLSX();
            const data = await readFileAsArrayBuffer(file);
            const workbook = XLSX.read(data, { type: 'array' });
            return parseSheetData(workbook);
        } catch (e) {
            console.error("SheetJS import failed", e);
            alert("Failed to parse file. Ensure it is a valid Excel or CSV file.");
            return null;
        }
    };

    const handleFileUpload = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setLoadingImport(true);

        try {
            let result = null;
            const firstFile = files[0];

            if (files.length > 1 || firstFile.name.toLowerCase().endsWith('.htm') || firstFile.name.toLowerCase().endsWith('.html')) {
                result = await processHTMLImport(files);
            } else if (firstFile.name.toLowerCase().endsWith('.xlsx')) {
                result = await processImportWithExcelJS(firstFile);
            } else {
                // Use SheetJS for both Excel (.xls) and CSV for robust parsing
                result = await processImportWithSheetJS(firstFile);
            }

            if (result && result.data.length > 0) {
                setImportConfig(result);
            } else {
                alert("No valid data found in file.");
            }

        } catch (err) {
            console.error(err);
            alert("Import failed. See console for details.");
        } finally {
            setLoadingImport(false);
        }
    };

    const confirmImport = async (uniqueIdCol, displayCols, filterCols) => {
        // --- NEW: Duplicate Check ---
        const rawIds = importConfig.data
            .map(row => row[uniqueIdCol])
            .filter(val => val !== undefined && val !== null && String(val).trim() !== '')
            .map(val => String(val).trim());

        const seen = new Set();
        const duplicates = new Set();

        for (const id of rawIds) {
            if (seen.has(id)) {
                duplicates.add(id);
            } else {
                seen.add(id);
            }
        }

        if (duplicates.size > 0) {
            alert(`Cannot Import: Duplicate values found in Unique ID column.\n\nDuplicates: ${Array.from(duplicates).slice(0, 15).join(', ')}${duplicates.size > 15 ? '...' : ''}\n\nPlease ensure every row has a unique identifier.`);
            return;
        }
        // -----------------------------

        const newColumns = importConfig.headers.map(h => ({
            key: h,
            visible: displayCols.includes(h),
            isId: h === uniqueIdCol,
            isFilter: filterCols.includes(h),
            label: h
        }));

        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id), {
            columns: newColumns
        });
        setColumns(newColumns);

        const imageColumns = importConfig.headers.filter(h =>
            importConfig.data.some(row => row[h + '_isImage'])
        );

        for (const row of importConfig.data) {
            if (!row[uniqueIdCol]) continue;

            const signId = row[uniqueIdCol].toString().replace(/[^a-zA-Z0-9]/g, '_');

            let artworkImages = [];
            imageColumns.forEach(col => {
                if (row[col + '_isImage'] && row[col]) {
                    artworkImages.push({ url: row[col], stage: 'Artwork', timestamp: new Date().toISOString() });
                }
            });

            if (artworkImages.length === 0 && row['Artwork']) {
                artworkImages.push({ url: row['Artwork'], stage: 'Artwork', timestamp: new Date().toISOString() });
            }

            const cleanRow = { ...row };
            imageColumns.forEach(col => delete cleanRow[col]);
            if (cleanRow['Artwork']) delete cleanRow['Artwork'];

            const signData = {
                ...cleanRow,
                status: STATUS.DRAFT,
                createdAt: serverTimestamp(),
                history: [],
                artworkImages: artworkImages,
                factoryImages: [],
                siteImages: []
            };

            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id, 'signs', signId), signData);
        }

        setImportConfig(null);
    };

    const updateStatus = async (signIds, newStatus) => {
        const ids = Array.from(signIds);
        for (const id of ids) {
            try {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id, 'signs', id), {
                    status: newStatus,
                    history: serverTimestamp()
                });
            } catch (e) {
                console.error("Status update error", e);
            }
        }
        setSelectedSigns(new Set());
    };

    const batchDelete = async (signIds) => {
        if (!window.confirm(`Are you sure you want to delete ${signIds.size} signs?`)) return;
        const ids = Array.from(signIds);
        for (const id of ids) {
            try {
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id, 'signs', id));
            } catch (e) {
                console.error(e);
                alert("Error deleting sign: " + id);
            }
        }
        setSelectedSigns(new Set());
    };

    const handleUpdateSign = async (signId, updatedData) => {
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id, 'signs', signId), updatedData);
        } catch (e) {
            console.error("Update failed", e);
            alert("Failed to update sign.");
        }
    };

    const handleDeleteImage = async (signId, field, imageIndex) => {
        if (!window.confirm("Are you sure you want to delete this image?")) return;

        try {
            const signRef = doc(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id, 'signs', signId);
            const signDoc = await getDoc(signRef);

            if (signDoc.exists()) {
                const data = signDoc.data();
                const images = data[field] || [];
                const newImages = images.filter((_, i) => i !== imageIndex);

                await updateDoc(signRef, { [field]: newImages });
                setLightboxImages(null); // Close lightbox after deletion to prevent errors
            }
        } catch (e) {
            console.error("Error deleting image", e);
            alert("Failed to delete image.");
        }
    };

    const handleToggleStage = async (sign, stage, isFactory) => {
        const checksField = isFactory ? 'factoryStageChecks' : 'siteStageChecks';
        const current = sign[checksField] || {};
        const isDone = current[stage]?.checked;
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id, 'signs', sign._id), {
            [checksField]: {
                ...current,
                [stage]: isDone ? { checked: false } : { checked: true, by: user.username, at: new Date().toISOString() }
            }
        });
    };

    const handleUploadRequest = (sign, isFactory) => {
        const stages = isFactory ? boq.factoryStages : boq.siteStages;
        if (stages && stages.length > 0) {
            setUploadModal({ isOpen: true, sign, isFactory });
        } else {
            // Trigger hidden file input directly if no stages defined
            const id = `file-${isFactory ? 'fact' : 'site'}-${sign._id}`;
            document.getElementById(id).click();
        }
    };

    const handleImageUpload = async (uploads) => {
        // uploads: [{file, stage}, ...]
        const { sign, isFactory } = uploadModal;
        if (!sign || !uploads.length) return;

        const lastStage = uploads[uploads.length - 1].stage;
        if (isFactory) setLastFactoryStage(lastStage);
        else setLastSiteStage(lastStage);

        for (const { file, stage } of uploads) {
            const finalStage = stage || (isFactory ? 'General Production' : 'Installation');
            await executeUpload(sign, file, finalStage, isFactory);
        }
    };

    const executeUpload = async (sign, file, stage, isFactory) => {
        if (!file) return;
        const signRef = doc(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id, 'signs', sign._id);
        const field = isFactory ? 'factoryImages' : 'siteImages';

        // Compress and fetch fresh sign state concurrently so sequential uploads see the latest image list
        const [compressed, freshSnap] = await Promise.all([
            compressImage(file, 1200),
            getDoc(signRef),
        ]);
        const freshSign = freshSnap.exists() ? { _id: sign._id, ...freshSnap.data() } : sign;

        const artImages = freshSign.artworkImages || [];
        const hasArtworks = artImages.length > 0;

        const newImage = {
            url: compressed,
            stage,
            uploadedBy: user.username,
            timestamp: new Date().toISOString(),
            ...(isFactory ? { qcStatus: hasArtworks ? 'pending' : 'na', qcArtworkIdx: null, qcIssues: [] } : {})
        };

        const currentImages = freshSign[field] || [];
        const newImagesList = [...currentImages, newImage];
        let updates = { [field]: newImagesList };

        if (isFactory) {
            if (!hasArtworks) {
                updates.status = STATUS.READY_DISPATCH;
                updates.factoryQcStatus = 'na';
            } else {
                updates.status = STATUS.PROD_APPROVAL;
                updates.factoryQcStatus = computeFactoryQcStatus(newImagesList, artImages.length);
            }
        } else {
            updates.status = STATUS.INSTALL_APPROVAL;
        }

        await updateDoc(signRef, updates);

        // ── Background QC for factory photos that have artworks ──────────────
        if (isFactory && hasArtworks) {
            const photoUrl = newImagesList[newImagesList.length - 1].url;
            const newPhotoIdx = newImagesList.length - 1;

            (async () => {
                try {
                    const result = await runGeminiQC(artImages, photoUrl);

                    const currentDoc = await getDoc(signRef);
                    if (!currentDoc.exists()) return;
                    const latestImages = [...(currentDoc.data()[field] || [])];

                    if (latestImages[newPhotoIdx]) {
                        if (!result) {
                            latestImages[newPhotoIdx] = {
                                ...latestImages[newPhotoIdx],
                                qcStatus: 'error',
                                qcIssues: ['Automated QC could not complete. Please review manually.'],
                                qcCheckedAt: new Date().toISOString()
                            };
                        } else {
                            latestImages[newPhotoIdx] = {
                                ...latestImages[newPhotoIdx],
                                qcStatus: result.pass ? 'pass' : 'fail',
                                qcArtworkIdx: result.artworkIdx ?? 0,
                                qcIssues: result.issues || [],
                                qcCheckedAt: new Date().toISOString()
                            };
                        }
                    }

                    const newQcStatus = computeFactoryQcStatus(latestImages, artImages.length);
                    await updateDoc(signRef, { [field]: latestImages, factoryQcStatus: newQcStatus });
                } catch (e) {
                    console.error('Background QC failed:', e);
                }
            })();
        }
    };


    const filteredSigns = useMemo(() => {
        let data = [...signs];
        Object.keys(filters).forEach(key => {
            if (!filters[key]) return;
            if (key === '_factoryStage') {
                data = data.filter(s => s.factoryStageChecks?.[filters[key]]?.checked);
            } else if (key === '_siteStage') {
                data = data.filter(s => s.siteStageChecks?.[filters[key]]?.checked);
            } else {
                data = data.filter(s => s[key] === filters[key]);
            }
        });
        if (idFilter.size > 0) {
            const idKey = columns.find(c => c.isId)?.key;
            if (idKey) data = data.filter(s => idFilter.has(String(s[idKey])));
        }

        if (sortConfig) {
            data.sort((a, b) => {
                if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
                if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return data;
    }, [signs, filters, idFilter, sortConfig, columns]);

    const uniqueValues = useMemo(() => {
        const map = {};
        columns.filter(c => c.isFilter).forEach(col => {
            map[col.key] = [...new Set(signs.map(s => s[col.key]).filter(Boolean))].sort();
        });
        const btnValues = (boq.statusButtons || DEFAULT_STATUS_BUTTONS).map(b => b.value);
        const signStatuses = signs.map(s => s.status).filter(Boolean);
        map['status'] = [...new Set([STATUS.DRAFT, ...btnValues, ...signStatuses])].sort();
        return map;
    }, [signs, columns, boq.statusButtons]);

    // Determine if user can delete specific image types
    const canDeleteImage = (field) => {
        if (user.role === ROLES.ADMIN) return true;
        if (user.role === ROLES.FACTORY && field === 'factoryImages') return true;
        if (user.role === ROLES.SITE && field === 'siteImages') return true;
        if (user.role === ROLES.DUAL && (field === 'factoryImages' || field === 'siteImages')) return true;
        return false;
    };

    // Render columns based on visibility settings (but always include ID)
    const activeColumns = columns.filter(c => (c.isId || visibleColumnKeys.has(c.key)) && c.visible);

    if (viewMode === 'print') {
        return (
            <PrintView
                boq={boq}
                signs={filteredSigns}
                columns={activeColumns}
                onClose={() => setViewMode('table')}
            />
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-50">
            {lightboxImages && (
                <Lightbox
                    images={lightboxImages.images}
                    initialIndex={lightboxImages.index}
                    onClose={() => setLightboxImages(null)}
                    onDelete={
                        canDeleteImage(lightboxImages.field)
                            ? (idx) => handleDeleteImage(lightboxImages.signId, lightboxImages.field, idx)
                            : null
                    }
                />
            )}

            {editingSign && (
                <EditSignModal
                    sign={editingSign}
                    columns={columns}
                    onClose={() => setEditingSign(null)}
                    onUpdate={handleUpdateSign}
                />
            )}

            {showSettings && (
                <BOQSettingsModal
                    boq={boq}
                    onClose={() => setShowSettings(false)}
                />
            )}

            <UploadModal
                isOpen={uploadModal.isOpen}
                onClose={() => setUploadModal({ ...uploadModal, isOpen: false })}
                onUpload={handleImageUpload}
                type={uploadModal.isFactory ? "Factory" : "Site"}
                stages={uploadModal.isFactory ? boq.factoryStages : boq.siteStages}
                defaultStage={uploadModal.isFactory ? lastFactoryStage : lastSiteStage}
            />

            {/* ── Header ── */}
            <header className="bg-white border-b px-3 py-2 flex items-center justify-between shadow-sm z-20 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <button onClick={onBack} className="p-2 hover:bg-slate-100 active:bg-slate-200 rounded-full text-slate-500 flex-shrink-0">
                        <ChevronUp className="rotate-[-90deg]" size={18} />
                    </button>
                    <div className="min-w-0">
                        <h2 className="text-base font-bold text-slate-800 truncate leading-tight">{boq.name}</h2>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                            <span>{signs.length} items</span>
                            <span>·</span>
                            <span>{filteredSigns.length} filtered</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Column visibility */}
                    <div className="relative">
                        <button
                            onClick={() => setShowColumnSelector(!showColumnSelector)}
                            className={`p-2 rounded-lg transition ${showColumnSelector ? 'bg-indigo-100 text-indigo-600' : 'text-slate-500 hover:bg-slate-100 active:bg-slate-200'}`}
                            title="Show/Hide Columns"
                        >
                            <Eye size={16} />
                        </button>
                        {showColumnSelector && (
                            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border p-2 z-50 animate-in fade-in slide-in-from-top-2">
                                <div className="text-xs font-bold text-slate-400 uppercase px-2 py-1 mb-1">Visible Columns</div>
                                <div className="max-h-60 overflow-y-auto space-y-1">
                                    {columns.filter(c => c.visible).map(col => (
                                        <button
                                            key={col.key}
                                            onClick={() => !col.isId && toggleColumnVisibility(col.key)}
                                            className={`w-full text-left px-3 py-2 rounded flex items-center justify-between text-sm ${col.isId ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'hover:bg-slate-50'}`}
                                        >
                                            <span className={visibleColumnKeys.has(col.key) || col.isId ? 'text-slate-800 font-medium' : 'text-slate-400'}>{col.label}</span>
                                            {visibleColumnKeys.has(col.key) || col.isId ? <Eye size={14} className="text-indigo-500" /> : <EyeOff size={14} className="text-slate-300" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    {user.role === ROLES.ADMIN && (
                        <button
                            onClick={() => setShowSettings(true)}
                            className="p-2 text-slate-500 hover:bg-slate-100 active:bg-slate-200 rounded-lg"
                            title="BOQ Settings"
                        >
                            <Settings size={16} />
                        </button>
                    )}
                    <button
                        onClick={() => setViewMode('print')}
                        className="p-2 text-slate-500 hover:bg-slate-100 active:bg-slate-200 rounded-lg"
                    >
                        <Printer size={16} />
                    </button>
                    {user.role === ROLES.ADMIN && (
                        <div className="relative overflow-hidden cursor-pointer bg-indigo-600 active:bg-indigo-800 text-white p-2 rounded-lg flex items-center gap-1 transition">
                            {loadingImport ? (
                                <span className="animate-spin"><Package size={16} /></span>
                            ) : <Upload size={16} />}
                            <span className="hidden sm:inline text-sm font-medium">Import</span>
                            <input
                                type="file"
                                multiple
                                onChange={handleFileUpload}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                accept=".csv, .html, .htm, .xlsx, .xls, .png, .jpg, .jpeg"
                            />
                        </div>
                    )}
                </div>
            </header>

            {/* ── Tabs ── */}
            <div className="bg-white border-b flex items-center px-3 gap-0">
                <button
                    onClick={() => setActiveTab('items')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${activeTab === 'items' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    Items
                </button>
                <button
                    onClick={() => setActiveTab('dpr')}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${activeTab === 'dpr' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    DPR
                </button>
            </div>

            {/* ── Filter Bar — horizontally scrollable pills on mobile ── */}
            {activeTab === 'items' && (() => {
                const idCol = columns.find(c => c.isId);
                const allIds = idCol ? [...new Set(signs.map(s => String(s[idCol.key])).filter(Boolean))].sort() : [];
                const searchedIds = allIds.filter(id => id.toLowerCase().includes(idSearch.toLowerCase()));
                const allSelected = searchedIds.length > 0 && searchedIds.every(id => idFilter.has(id));
                const toggleId = (id) => { const n = new Set(idFilter); n.has(id) ? n.delete(id) : n.add(id); setIdFilter(n); };
                const toggleAll = () => {
                    const n = new Set(idFilter);
                    if (allSelected) searchedIds.forEach(id => n.delete(id));
                    else searchedIds.forEach(id => n.add(id));
                    setIdFilter(n);
                };
                return (
                <div className="bg-white border-b relative" ref={idDropdownRef}>
                <div className="flex items-center gap-2 px-3 py-1.5 overflow-x-auto scrollbar-hide">
                    {/* Status pill */}
                    <div className={`flex-shrink-0 flex items-center gap-1.5 pl-1.5 pr-0.5 py-1 rounded-full border text-xs font-medium transition whitespace-nowrap ${
                        filters.status ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}>
                        <Filter size={11} className="flex-shrink-0" />
                        <select
                            className="bg-transparent border-none focus:ring-0 text-xs font-medium cursor-pointer pr-1 max-w-[130px]"
                            value={filters.status || ''}
                            onChange={e => setFilters({ ...filters, status: e.target.value })}
                        >
                            <option value="">All Statuses</option>
                            {uniqueValues['status']?.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    {/* ID multi-select trigger pill */}
                    {idCol && (
                        <button
                            onClick={() => setShowIdDropdown(v => !v)}
                            className={`flex-shrink-0 flex items-center gap-1.5 pl-2 pr-2 py-1 rounded-full border text-xs font-medium whitespace-nowrap transition ${
                                idFilter.size > 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                        >
                            <Filter size={11} className="flex-shrink-0" />
                            <span>{idCol.label}:</span>
                            <span className="font-semibold">{idFilter.size > 0 ? `${idFilter.size} selected` : 'All'}</span>
                            <ChevronDown size={11} />
                        </button>
                    )}

                    {/* Factory stage filter */}
                    {boq.factoryStages?.length > 0 && (
                        <div className={`flex-shrink-0 flex items-center gap-1 pl-2 pr-0.5 py-1 rounded-full border text-xs font-medium whitespace-nowrap transition ${
                            filters._factoryStage ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}>
                            <span className="opacity-70">Factory:</span>
                            <select
                                className="bg-transparent border-none p-0 focus:ring-0 text-xs font-medium cursor-pointer pr-1 max-w-[110px]"
                                value={filters._factoryStage || ''}
                                onChange={e => setFilters({ ...filters, _factoryStage: e.target.value })}
                            >
                                <option value="">All</option>
                                {boq.factoryStages.map(s => <option key={s} value={s}>{s} ✓</option>)}
                            </select>
                        </div>
                    )}

                    {/* Site stage filter */}
                    {boq.siteStages?.length > 0 && (
                        <div className={`flex-shrink-0 flex items-center gap-1 pl-2 pr-0.5 py-1 rounded-full border text-xs font-medium whitespace-nowrap transition ${
                            filters._siteStage ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}>
                            <span className="opacity-70">Site:</span>
                            <select
                                className="bg-transparent border-none p-0 focus:ring-0 text-xs font-medium cursor-pointer pr-1 max-w-[110px]"
                                value={filters._siteStage || ''}
                                onChange={e => setFilters({ ...filters, _siteStage: e.target.value })}
                            >
                                <option value="">All</option>
                                {boq.siteStages.map(s => <option key={s} value={s}>{s} ✓</option>)}
                            </select>
                        </div>
                    )}

                    {/* Dynamic filter pills — exclude ID column to avoid duplication */}
                    {columns.filter(c => c.isFilter && !c.isId).map(col => (
                        <div key={col.key} className={`flex-shrink-0 flex items-center gap-1 pl-2 pr-0.5 py-1 rounded-full border text-xs font-medium whitespace-nowrap transition ${
                            filters[col.key] ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}>
                            <span className="opacity-70">{col.label}:</span>
                            <select
                                className="bg-transparent border-none p-0 focus:ring-0 text-xs font-medium cursor-pointer pr-1 max-w-[90px]"
                                value={filters[col.key] || ''}
                                onChange={e => setFilters({ ...filters, [col.key]: e.target.value })}
                            >
                                <option value="">All</option>
                                {uniqueValues[col.key]?.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </div>
                    ))}

                    {/* Clear button */}
                    {(Object.keys(filters).some(k => filters[k]) || idFilter.size > 0) && (
                        <button
                            onClick={() => { setFilters({}); setIdFilter(new Set()); setIdSearch(''); }}
                            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full border border-red-200 bg-red-50 text-red-600 text-xs font-semibold active:bg-red-100"
                        >
                            <X size={11} /> Clear
                        </button>
                    )}
                </div>

                {/* ID dropdown panel — rendered OUTSIDE overflow-x-auto to avoid clipping */}
                {showIdDropdown && idCol && (
                    <div className="absolute left-3 top-full mt-0 w-64 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                        <div className="p-2 border-b border-slate-100">
                            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
                                <Filter size={12} className="text-slate-400 flex-shrink-0" />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Search..."
                                    value={idSearch}
                                    onChange={e => setIdSearch(e.target.value)}
                                    className="flex-1 bg-transparent text-xs outline-none text-slate-700 placeholder-slate-400"
                                />
                                {idSearch && <button onClick={() => setIdSearch('')} className="text-slate-400 hover:text-slate-600"><X size={11} /></button>}
                            </div>
                        </div>
                        <div className="max-h-52 overflow-y-auto">
                            <button
                                onClick={toggleAll}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition text-left border-b border-slate-100"
                            >
                                <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${allSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
                                    {allSelected && <Minus size={10} className="text-white" />}
                                </span>
                                <span className="text-xs font-semibold text-slate-700">(Select All)</span>
                            </button>
                            {searchedIds.map(id => (
                                <button
                                    key={id}
                                    onClick={() => toggleId(id)}
                                    className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-50 transition text-left"
                                >
                                    <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${idFilter.has(id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
                                        {idFilter.has(id) && <CheckSquare size={10} className="text-white" />}
                                    </span>
                                    <span className="text-xs text-slate-700 truncate">{id}</span>
                                </button>
                            ))}
                            {searchedIds.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No matches</p>}
                        </div>
                        {idFilter.size > 0 && (
                            <div className="p-2 border-t border-slate-100">
                                <button
                                    onClick={() => { setIdFilter(new Set()); setShowIdDropdown(false); }}
                                    className="w-full text-xs text-red-600 font-semibold py-1.5 rounded-lg hover:bg-red-50 transition"
                                >
                                    Clear Filter
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Mobile-only sort bar ── */}
                <div className="md:hidden flex items-center gap-2 px-3 pb-1.5 border-t border-slate-100 pt-1.5">
                    <ArrowUpDown size={11} className="text-slate-400 flex-shrink-0" />
                    <span className="text-[10px] text-slate-400 font-medium flex-shrink-0">Sort:</span>

                    {/* Column picker */}
                    <div className={`flex-1 flex items-center gap-1 pl-2 pr-0.5 py-1 rounded-full border text-xs font-medium whitespace-nowrap transition ${
                        sortConfig?.key ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}>
                        <select
                            className="bg-transparent border-none focus:ring-0 text-xs font-medium cursor-pointer pr-1 w-full"
                            value={sortConfig?.key || ''}
                            onChange={e => setSortConfig({ key: e.target.value, direction: sortConfig?.direction || 'asc' })}
                        >
                            <option value="">No sort</option>
                            <option value="status">Status</option>
                            {activeColumns.map(col => (
                                <option key={col.key} value={col.key}>{col.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Asc / Desc toggle */}
                    <button
                        onClick={() => setSortConfig(prev => ({
                            key: prev?.key || 'status',
                            direction: prev?.direction === 'asc' ? 'desc' : 'asc'
                        }))}
                        className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold transition active:scale-95 ${
                            sortConfig?.direction === 'desc'
                                ? 'bg-teal-50 border-teal-200 text-teal-700'
                                : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}
                        title="Toggle sort direction"
                    >
                        {sortConfig?.direction === 'desc'
                            ? <><ChevronDown size={11} /> DESC</>
                            : <><ChevronUp size={11} /> ASC</>
                        }
                    </button>
                </div>
            </div>
                ); // close return
            })()} {/* close IIFE */}

            {activeTab === 'items' && selectedSigns.size > 0 && user.role === ROLES.ADMIN && (
                <div className="bg-indigo-50 px-6 py-1.5 flex flex-col md:flex-row items-start md:items-center justify-between border-b border-indigo-100 gap-2">
                    <span className="text-sm text-indigo-800 font-medium">{selectedSigns.size} selected</span>
                    <div className="flex flex-wrap gap-2">
                        {(boq.statusButtons || DEFAULT_STATUS_BUTTONS).map((btn, i, arr) => (
                            <button
                                key={i}
                                onClick={() => updateStatus(selectedSigns, btn.value)}
                                className={`text-xs bg-white border px-3 py-1 rounded ${
                                    i === arr.length - 1
                                        ? 'border-green-200 text-green-700 hover:bg-green-50'
                                        : 'border-indigo-200 text-indigo-700 hover:bg-indigo-50'
                                }`}
                            >
                                {btn.label}
                            </button>
                        ))}
                        <div className="w-px bg-indigo-200 mx-2 hidden md:block"></div>
                        <button onClick={() => batchDelete(selectedSigns)} className="text-xs bg-white border border-red-200 text-red-700 px-3 py-1 rounded hover:bg-red-50 flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                    </div>
                </div>
            )}

            {activeTab === 'items' && <div className="flex-1 overflow-auto relative bg-white">

                {/* ── Mobile card list (< md) ── */}
                <div className="md:hidden divide-y divide-slate-100">
                    {filteredSigns.map(sign => (
                        <SignCard
                            key={sign._id}
                            sign={sign}
                            columns={activeColumns}
                            user={user}
                            selected={selectedSigns.has(sign._id)}
                            onSelect={(id) => {
                                const newSet = new Set(selectedSigns);
                                if (newSet.has(id)) newSet.delete(id);
                                else newSet.add(id);
                                setSelectedSigns(newSet);
                            }}
                            onUploadRequest={handleUploadRequest}
                            onDirectUpload={(file, stage, isFactory) => executeUpload(sign, file, stage, isFactory)}
                            factoryStages={boq.factoryStages || []}
                            siteStages={boq.siteStages || []}
                            onToggleStage={handleToggleStage}
                            onDelete={async () => {
                                if (window.confirm('Delete sign?')) {
                                    try {
                                        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id, 'signs', sign._id));
                                    } catch (err) {
                                        console.error(err);
                                        alert("Delete failed: " + err.message);
                                    }
                                }
                            }}
                            onEdit={() => setEditingSign(sign)}
                            onViewImage={(images, idx, field) => setLightboxImages({ images, index: idx, signId: sign._id, field })}
                        />
                    ))}
                    {filteredSigns.length === 0 && (
                        <div className="p-10 text-center text-slate-400 text-sm">No records match the current filters.</div>
                    )}
                </div>

                {/* ── Desktop table (≥ md) ── */}
                <table className="hidden md:table w-full text-left border-collapse">
                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm text-xs font-bold text-slate-500 uppercase tracking-[0.08em] whitespace-nowrap">
                        <tr>
                            <th className="px-1.5 py-1.5 w-8 text-center border-b border-slate-200">
                                {user.role === ROLES.ADMIN && (
                                    <input
                                        type="checkbox"
                                        onChange={(e) => {
                                            if (e.target.checked) setSelectedSigns(new Set(filteredSigns.map(s => s._id)));
                                            else setSelectedSigns(new Set());
                                        }}
                                        checked={filteredSigns.length > 0 && selectedSigns.size === filteredSigns.length}
                                    />
                                )}
                            </th>
                            <th className="px-1.5 py-1.5 border-b border-slate-200 cursor-pointer hover:bg-slate-100 w-24" onClick={() => setSortConfig({ key: 'status', direction: sortConfig?.direction === 'asc' ? 'desc' : 'asc' })}>
                                <div className="flex items-center gap-1">Status {sortConfig?.key === 'status' && (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</div>
                            </th>
                            <th className="px-1.5 py-1.5 border-b border-slate-200 w-24">QC</th>
                            {activeColumns.map(col => (
                                <th
                                    key={col.key}
                                    className="px-1.5 py-1.5 border-b border-slate-200 cursor-pointer hover:bg-slate-100"
                                    onClick={() => setSortConfig({ key: col.key, direction: sortConfig?.direction === 'asc' ? 'desc' : 'asc' })}
                                >
                                    <div className="flex items-center gap-1">
                                        {col.label}
                                        {sortConfig?.key === col.key && (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                                    </div>
                                </th>
                            ))}
                            <th className="px-1.5 py-1.5 border-b border-slate-200">Artwork</th>
                            <th className="px-1.5 py-1.5 border-b border-slate-200 w-24">Factory</th>
                            <th className="px-1.5 py-1.5 border-b border-slate-200 w-24">Site</th>
                            {user.role === ROLES.ADMIN && <th className="px-1.5 py-1.5 border-b border-slate-200 text-center w-16">Actions</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/50">
                        {filteredSigns.map(sign => (
                            <SignRow
                                key={sign._id}
                                sign={sign}
                                columns={activeColumns}
                                user={user}
                                selected={selectedSigns.has(sign._id)}
                                onSelect={(id) => {
                                    const newSet = new Set(selectedSigns);
                                    if (newSet.has(id)) newSet.delete(id);
                                    else newSet.add(id);
                                    setSelectedSigns(newSet);
                                }}
                                onUploadRequest={handleUploadRequest}
                                onDirectUpload={(file, stage, isFactory) => executeUpload(sign, file, stage, isFactory)}
                                factoryStages={boq.factoryStages || []}
                                siteStages={boq.siteStages || []}
                                onToggleStage={handleToggleStage}
                                onDelete={async () => {
                                    if (window.confirm('Delete sign?')) {
                                        try {
                                            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id, 'signs', sign._id));
                                        } catch (err) {
                                            console.error(err);
                                            alert("Delete failed: " + err.message);
                                        }
                                    }
                                }}
                                onEdit={() => setEditingSign(sign)}
                                onViewImage={(images, idx, field) => setLightboxImages({ images, index: idx, signId: sign._id, field })}
                            />
                        ))}
                    </tbody>
                </table>
            </div>}

            {activeTab === 'dpr' && <DPRTab boq={boq} user={user} />}

            {importConfig && (
                <ImportMapper
                    config={importConfig}
                    onClose={() => setImportConfig(null)}
                    onConfirm={confirmImport}
                />
            )}
        </div>
    );
};

// ── QC UI helpers ─────────────────────────────────────────────────────────────

// Small coloured dot overlaid on a factory photo thumbnail indicating its QC result
const QcDot = ({ qcStatus }) => {
    const colours = {
        pending: 'bg-slate-400 animate-pulse',
        pass:    'bg-green-500',
        fail:    'bg-red-500',
        error:   'bg-orange-400',
    };
    const cls = colours[qcStatus];
    if (!cls) return null;
    return (
        <span className={`absolute top-0 right-0 w-2 h-2 rounded-full border border-white shadow-sm ${cls}`} />
    );
};

// Sign-level QC status pill shown next to the sign status badge
const QCBadge = ({ factoryQcStatus }) => {
    if (!factoryQcStatus || factoryQcStatus === 'na') return null;
    const cfg = {
        processing:          { label: 'QC…',           cls: 'bg-slate-100 text-slate-500 animate-pulse' },
        awaiting_photos:     { label: '🟡 Awaiting',   cls: 'bg-yellow-100 text-yellow-700' },
        rework_needed:       { label: '🔴 Rework',     cls: 'bg-red-100 text-red-700' },
        ready_for_dispatch:  { label: '🟢 QC ✓',      cls: 'bg-green-100 text-green-700' },
    };
    const c = cfg[factoryQcStatus];
    if (!c) return null;
    return (
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${c.cls}`}>{c.label}</span>
    );
};

// ── Mobile card component ─────────────────────────────────────────────────────
// Compact named stage chips — dot + truncated label, single tap toggles done/pending.
const StageDots = ({ stages, checks, onToggle, isFactory }) => {
    if (!stages || stages.length === 0) return null;
    return (
        <div className="flex gap-1 flex-wrap mt-0.5">
            {stages.map(stage => {
                const info = checks?.[stage];
                const done = info?.checked;
                const label = stage.length > 11 ? stage.slice(0, 10) + '…' : stage;
                return (
                    <button
                        key={stage}
                        onClick={onToggle ? (e) => { e.stopPropagation(); onToggle(stage); } : undefined}
                        title={done ? `✓ ${stage}${info.by ? ` — by ${info.by}` : ''}` : `${stage} — tap to mark done`}
                        className={`flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-full border text-[9px] font-semibold transition-all select-none ${
                            done
                                ? isFactory
                                    ? 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'
                                    : 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100'
                                : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400 hover:text-slate-600'
                        } ${onToggle ? 'cursor-pointer active:scale-95' : 'cursor-default'}`}
                    >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            done ? isFactory ? 'bg-blue-500' : 'bg-green-500' : 'bg-slate-300'
                        }`} />
                        {label}
                    </button>
                );
            })}
        </div>
    );
};

const SignCard = ({ sign, columns, user, selected, onSelect, onUploadRequest, onDirectUpload, onDelete, onEdit, onViewImage, factoryStages, siteStages, onToggleStage }) => {
    const isFactory = user.role === ROLES.FACTORY || user.role === ROLES.DUAL || user.role === ROLES.ADMIN;
    const isSite = user.role === ROLES.SITE || user.role === ROLES.DUAL || user.role === ROLES.ADMIN;

    const artImages = sign.artworkImages || (sign.artworkImage ? [{ url: sign.artworkImage }] : []);
    const factImages = sign.factoryImages || [];
    const siteImages = sign.siteImages || [];

    const statusColor = (s) => {
        if (s.includes('Ready')) return 'bg-blue-100 text-blue-700';
        if (s.includes('Approval')) return 'bg-orange-100 text-orange-700';
        if (s.includes('Completed')) return 'bg-green-100 text-green-700';
        return 'bg-slate-100 text-slate-600';
    };

    // ID column and a subset of visible columns for the card body
    const idCol = columns.find(c => c.isId);
    const bodyColumns = columns.filter(c => !c.isId && c.visible).slice(0, 6);

    return (
        <div className={`px-3 py-2.5 transition-colors active:bg-slate-50 ${selected ? 'bg-indigo-50/60' : 'bg-white'}`}>
            {/* Row 1: Checkbox + ID + Status badge + Actions */}
            <div className="flex items-center gap-2 mb-1.5">
                {user.role === ROLES.ADMIN && (
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onSelect(sign._id)}
                        className="flex-shrink-0 w-4 h-4 accent-indigo-600"
                    />
                )}
                {/* Sign ID */}
                {idCol && (
                    <span className="text-xs font-bold text-slate-800 flex-1 truncate">
                        {sign[idCol.key]}
                    </span>
                )}
                {/* Status + QC badges */}
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide ${statusColor(sign.status)}`}>
                        {sign.status}
                    </span>
                    <QCBadge factoryQcStatus={sign.factoryQcStatus} />
                </div>
                {/* Edit button (admin only) */}
                {user.role === ROLES.ADMIN && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onEdit(); }}
                        className="flex-shrink-0 p-1 rounded text-slate-400 active:bg-blue-50 active:text-blue-600"
                    >
                        <Edit size={13} />
                    </button>
                )}
            </div>

            {/* Row 2: Key columns as label: value pairs */}
            {bodyColumns.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2">
                    {bodyColumns.map(col => (
                        sign[col.key] ? (
                            <span key={col.key} className="text-[10px] text-slate-500">
                                <span className="font-semibold text-slate-600">{col.label}:</span> {sign[col.key]}
                            </span>
                        ) : null
                    ))}
                </div>
            )}

            {/* Row 3: Photo strips */}
            <div className="flex items-center gap-3">
                {/* Artwork */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">Art</span>
                    <div className="flex gap-0.5">
                        {artImages.length > 0 ? artImages.map((img, idx) => (
                            <div
                                key={idx}
                                onClick={() => onViewImage(artImages, idx, 'artworkImages')}
                                className="w-8 h-8 bg-white rounded border shadow-sm flex-shrink-0 cursor-zoom-in"
                            >
                                <img src={img.url} alt="" className="w-full h-full object-contain rounded" />
                            </div>
                        )) : (
                            <div className="w-8 h-8 bg-slate-50 rounded border border-dashed flex items-center justify-center text-slate-300">
                                <ImageIcon size={12} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Factory */}
                <div className="flex items-start gap-1.5">
                    <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wide mt-0.5">Fab</span>
                    <div className="flex flex-col gap-0.5">
                        <div className="flex gap-0.5">
                            {factImages.length > 0 ? factImages.map((img, idx) => (
                                <div key={idx} onClick={() => onViewImage(factImages, idx, 'factoryImages')}
                                    className="relative w-8 h-8 bg-white rounded border shadow-sm flex-shrink-0 cursor-zoom-in">
                                    <img src={img.url} alt="" className="w-full h-full object-cover rounded" />
                                    <QcDot qcStatus={img.qcStatus} />
                                </div>
                            )) : <div className="w-8 h-8 bg-slate-50 rounded border border-dashed flex items-center justify-center text-slate-300"><Package size={12} /></div>}
                            {isFactory && (
                                <button onClick={() => onUploadRequest(sign, true)}
                                    className="w-7 h-7 flex items-center justify-center bg-white border rounded-full text-blue-400 active:bg-blue-50 shadow-sm flex-shrink-0"
                                    title="Add photo">
                                    <Camera size={11} />
                                    <input id={`file-fact-${sign._id}`} type="file" className="hidden" accept="image/*" capture="environment"
                                        onChange={(e) => onDirectUpload(e.target.files[0], 'General Production', true)} />
                                </button>
                            )}
                        </div>
                        <StageDots stages={factoryStages} checks={sign.factoryStageChecks} isFactory={true}
                            onToggle={isFactory ? (stage) => onToggleStage(sign, stage, true) : null} />
                    </div>
                </div>

                {/* Site */}
                <div className="flex items-start gap-1.5">
                    <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wide mt-0.5">Site</span>
                    <div className="flex flex-col gap-0.5">
                        <div className="flex gap-0.5">
                            {siteImages.length > 0 ? siteImages.map((img, idx) => (
                                <div key={idx} onClick={() => onViewImage(siteImages, idx, 'siteImages')}
                                    className="w-8 h-8 bg-white rounded border shadow-sm flex-shrink-0 cursor-zoom-in">
                                    <img src={img.url} alt="" className="w-full h-full object-cover rounded" />
                                </div>
                            )) : <div className="w-8 h-8 bg-slate-50 rounded border border-dashed flex items-center justify-center text-slate-300"><Truck size={12} /></div>}
                            {isSite && (
                                <button onClick={() => onUploadRequest(sign, false)}
                                    className="w-7 h-7 flex items-center justify-center bg-white border rounded-full text-green-400 active:bg-green-50 shadow-sm flex-shrink-0"
                                    title="Add photo">
                                    <Camera size={11} />
                                    <input id={`file-site-${sign._id}`} type="file" className="hidden" accept="image/*" capture="environment"
                                        onChange={(e) => onDirectUpload(e.target.files[0], 'Installation', false)} />
                                </button>
                            )}
                        </div>
                        <StageDots stages={siteStages} checks={sign.siteStageChecks} isFactory={false}
                            onToggle={isSite ? (stage) => onToggleStage(sign, stage, false) : null} />
                    </div>
                </div>

                {/* Delete (admin far right) */}
                {user.role === ROLES.ADMIN && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        className="ml-auto p-1.5 rounded text-slate-300 active:bg-red-50 active:text-red-500"
                    >
                        <Trash2 size={13} />
                    </button>
                )}
            </div>

            {/* QC failure feedback — visible to all roles so factory workers see what to fix */}
            {sign.factoryQcStatus === 'rework_needed' && (
                <div className="mt-1.5 p-2 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-[9px] font-bold text-red-700 uppercase tracking-wide mb-1">QC Issues Found:</p>
                    {factImages.filter(img => img.qcStatus === 'fail').map((img, i) => (
                        <div key={i} className="mb-1 last:mb-0">
                            <p className="text-[9px] font-semibold text-red-600">
                                {img.stage} → Artwork {(img.qcArtworkIdx ?? 0) + 1}
                            </p>
                            {(img.qcIssues || []).map((issue, j) => (
                                <p key={j} className="text-[9px] text-red-500 pl-2">• {issue}</p>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Desktop table row ─────────────────────────────────────────────────────────
const SignRow = ({ sign, columns, user, selected, onSelect, onUploadRequest, onDirectUpload, onDelete, onEdit, onViewImage, factoryStages, siteStages, onToggleStage }) => {
    const isFactory = user.role === ROLES.FACTORY || user.role === ROLES.DUAL || user.role === ROLES.ADMIN;
    const isSite = user.role === ROLES.SITE || user.role === ROLES.DUAL || user.role === ROLES.ADMIN;

    // Normalize images arrays
    const artImages = sign.artworkImages || (sign.artworkImage ? [{ url: sign.artworkImage }] : []);
    const factImages = sign.factoryImages || [];
    const siteImages = sign.siteImages || [];

    const statusColor = (s) => {
        if (s.includes('Ready')) return 'bg-blue-100 text-blue-700';
        if (s.includes('Approval')) return 'bg-orange-100 text-orange-700';
        if (s.includes('Completed')) return 'bg-green-100 text-green-700';
        return 'bg-slate-100 text-slate-600';
    };

    return (
        <tr className={`hover:bg-slate-50 transition text-xs ${selected ? 'bg-indigo-50/50' : ''}`}>
            <td className="px-1.5 py-1 text-center align-middle">
                {user.role === ROLES.ADMIN && (
                    <input type="checkbox" checked={selected} onChange={() => onSelect(sign._id)} />
                )}
            </td>
            <td className="px-1.5 py-1 align-middle">
                <span className={`px-1.5 py-0.5 rounded-sm font-semibold tracking-wide ${statusColor(sign.status)}`}>
                    {sign.status}
                </span>
            </td>
            <td className="px-1.5 py-1 align-middle">
                <QCBadge factoryQcStatus={sign.factoryQcStatus} />
            </td>
            {columns.filter(c => c.visible).map(col => (
                <td key={col.key} className="px-1.5 py-1 text-slate-700 whitespace-nowrap max-w-[150px] overflow-hidden text-ellipsis align-middle">
                    {sign[col.key]}
                </td>
            ))}
            <td className="px-1.5 py-1 align-middle">
                <div className="flex -space-x-1 overflow-hidden hover:space-x-1 transition-all">
                    {artImages.length > 0 ? artImages.map((img, idx) => (
                        <div
                            key={idx}
                            onClick={() => onViewImage(artImages, idx, 'artworkImages')}
                            className="w-7 h-7 bg-white rounded border shadow-sm flex-shrink-0 cursor-zoom-in relative hover:z-10 hover:scale-110 transition"
                        >
                            <img src={img.url} alt="" className="w-full h-full object-contain rounded" />
                        </div>
                    )) : <div className="w-7 h-7 bg-slate-100 rounded border flex items-center justify-center text-slate-300"><ImageIcon size={12} /></div>}
                </div>
            </td>

            {/* Factory Column */}
            <td className="px-1.5 py-1 align-middle">
                <div className="flex items-center gap-1">
                    <div className="flex -space-x-1 hover:space-x-1 transition-all">
                        {factImages.length > 0 ? factImages.map((img, idx) => (
                            <div key={idx} onClick={() => onViewImage(factImages, idx, 'factoryImages')}
                                className="w-7 h-7 bg-white rounded border shadow-sm flex-shrink-0 cursor-zoom-in relative hover:z-10 hover:scale-110 transition">
                                <img src={img.url} alt="" className="w-full h-full object-cover rounded" />
                                <QcDot qcStatus={img.qcStatus} />
                            </div>
                        )) : <div className="w-7 h-7 bg-slate-50 rounded border border-dashed flex items-center justify-center text-slate-300"><Package size={12} /></div>}
                    </div>
                    {isFactory && (
                        <button onClick={() => onUploadRequest(sign, true)}
                            className="cursor-pointer w-5 h-5 flex items-center justify-center hover:bg-blue-100 text-blue-500 rounded-full transition border bg-white flex-shrink-0"
                            title="Add photo">
                            <Camera size={10} />
                            <input id={`file-fact-${sign._id}`} type="file" className="hidden" accept="image/*" capture="environment"
                                onChange={(e) => onDirectUpload(e.target.files[0], 'General Production', true)} />
                        </button>
                    )}
                    <StageDots stages={factoryStages} checks={sign.factoryStageChecks} isFactory={true}
                        onToggle={isFactory ? (stage) => onToggleStage(sign, stage, true) : null} />
                </div>
            </td>

            {/* Site Column */}
            <td className="px-1.5 py-1 align-middle">
                <div className="flex items-center gap-1">
                    <div className="flex -space-x-1 hover:space-x-1 transition-all">
                        {siteImages.length > 0 ? siteImages.map((img, idx) => (
                            <div key={idx} onClick={() => onViewImage(siteImages, idx, 'siteImages')}
                                className="w-7 h-7 bg-white rounded border shadow-sm flex-shrink-0 cursor-zoom-in relative hover:z-10 hover:scale-110 transition">
                                <img src={img.url} alt="" className="w-full h-full object-cover rounded" />
                            </div>
                        )) : <div className="w-7 h-7 bg-slate-50 rounded border border-dashed flex items-center justify-center text-slate-300"><Truck size={12} /></div>}
                    </div>
                    {isSite && (
                        <button onClick={() => onUploadRequest(sign, false)}
                            className="cursor-pointer w-5 h-5 flex items-center justify-center hover:bg-green-100 text-green-500 rounded-full transition border bg-white flex-shrink-0"
                            title="Add photo">
                            <Camera size={10} />
                            <input id={`file-site-${sign._id}`} type="file" className="hidden" accept="image/*" capture="environment"
                                onChange={(e) => onDirectUpload(e.target.files[0], 'Installation', false)} />
                        </button>
                    )}
                    <StageDots stages={siteStages} checks={sign.siteStageChecks} isFactory={false}
                        onToggle={isSite ? (stage) => onToggleStage(sign, stage, false) : null} />
                </div>
            </td>

            {/* Actions Column */}
            {user.role === ROLES.ADMIN && (
                <td className="px-1.5 py-1 text-center align-middle">
                    <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit();
                            }}
                            className="p-1 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded transition"
                            title="Edit Sign"
                        >
                            <Edit size={13} />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete();
                            }}
                            className="p-1 hover:bg-red-50 text-red-400 hover:text-red-600 rounded transition"
                            title="Delete Sign"
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                </td>
            )}
        </tr>
    );
};

const ImportMapper = ({ config, onClose, onConfirm }) => {
    const [uniqueId, setUniqueId] = useState(config.headers[0]);
    const [displayCols, setDisplayCols] = useState(new Set(config.headers.slice(0, 5)));
    const [filterCols, setFilterCols] = useState(new Set(config.headers.slice(1, 3)));

    const toggleSet = (set, setter, val) => {
        const newSet = new Set(set);
        if (newSet.has(val)) newSet.delete(val);
        else newSet.add(val);
        setter(newSet);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b">
                    <h3 className="text-xl font-bold">Import Configuration</h3>
                    <p className="text-sm text-slate-500">Found {config.data.length} valid rows. Map your columns below.</p>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    <div className="bg-amber-50 p-4 rounded text-sm text-amber-800 border border-amber-200">
                        <strong>Preview first row:</strong>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs overflow-auto max-h-32">
                            {Object.entries(config.data[0] || {}).filter(([k]) => !k.endsWith('_isImage')).map(([k, v]) => (
                                <div key={k} className="truncate" title={String(v)}>
                                    <span className="font-bold">{k}:</span> {config.data[0][k + '_isImage'] ? <span className="text-indigo-600 font-bold">[IMAGE]</span> : String(v)}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Unique Identifier (Sign No)</label>
                        <select
                            className="w-full border p-2 rounded"
                            value={uniqueId}
                            onChange={(e) => setUniqueId(e.target.value)}
                        >
                            {config.headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-8">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Display Columns</label>
                            <div className="space-y-1 max-h-60 overflow-y-auto border p-2 rounded">
                                {config.headers.map(h => (
                                    <label key={`d-${h}`} className="flex items-center gap-2 text-sm">
                                        <input type="checkbox" checked={displayCols.has(h)} onChange={() => toggleSet(displayCols, setDisplayCols, h)} />
                                        {h}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Enable Filtering</label>
                            <div className="space-y-1 max-h-60 overflow-y-auto border p-2 rounded">
                                {config.headers.map(h => (
                                    <label key={`f-${h}`} className="flex items-center gap-2 text-sm">
                                        <input type="checkbox" checked={filterCols.has(h)} onChange={() => toggleSet(filterCols, setFilterCols, h)} />
                                        {h}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t bg-slate-50 rounded-b-xl flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 font-medium">Cancel</button>
                    <button
                        onClick={() => onConfirm(uniqueId, Array.from(displayCols), Array.from(filterCols))}
                        className="px-6 py-2 bg-indigo-600 text-white font-bold rounded hover:bg-indigo-700"
                    >
                        Import Data
                    </button>
                </div>
            </div>
        </div>
    );
};

const PrintView = ({ boq, signs, columns, onClose }) => {
    const [showColMenu, setShowColMenu] = useState(false);
    const [selectedColIds, setSelectedColIds] = useState(new Set(['art', 'fact_all', 'site_all']));

    // Construct available report options dynamically
    const reportOptions = useMemo(() => {
        const opts = [
            { id: 'art', label: 'Artwork', type: 'artwork', color: 'text-indigo-600' },
            { id: 'fact_all', label: 'Factory (All)', type: 'factory', mode: 'all', color: 'text-orange-600' }
        ];

        if (boq.factoryStages && boq.factoryStages.length > 0) {
            boq.factoryStages.forEach(s => {
                opts.push({ id: `fact_${s}`, label: `Factory - ${s}`, type: 'factory', mode: 'stage', stage: s, color: 'text-orange-500' });
            });
        } else {
            // Default fallback if no custom stages defined
            opts.push({ id: 'fact_gen', label: 'Factory - General', type: 'factory', mode: 'stage', stage: 'General Production', color: 'text-orange-500' });
        }

        opts.push({ id: 'site_all', label: 'Site (All)', type: 'site', mode: 'all', color: 'text-green-600' });

        if (boq.siteStages && boq.siteStages.length > 0) {
            boq.siteStages.forEach(s => {
                opts.push({ id: `site_${s}`, label: `Site - ${s}`, type: 'site', mode: 'stage', stage: s, color: 'text-green-500' });
            });
        } else {
            opts.push({ id: 'site_inst', label: 'Site - Install', type: 'site', mode: 'stage', stage: 'Installation', color: 'text-green-500' });
        }

        return opts;
    }, [boq]);

    const toggleCol = (id) => {
        const next = new Set(selectedColIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedColIds(next);
    };

    const activeReportCols = reportOptions.filter(o => selectedColIds.has(o.id));
    const textCols = columns.filter(c => !c.isId).slice(0, 5);
    const idCol = columns.find(c => c.isId);

    const getImagesForCol = (sign, colConfig) => {
        if (colConfig.type === 'artwork') return sign.artworkImages || (sign.artworkImage ? [{ url: sign.artworkImage }] : []);

        const source = colConfig.type === 'factory' ? (sign.factoryImages || []) : (sign.siteImages || []);

        if (colConfig.mode === 'all') return source;
        return source.filter(img => img.stage === colConfig.stage);
    };

    return (
        <div className="min-h-screen bg-white text-black p-4">
            <div className="fixed top-0 left-0 right-0 bg-slate-800 text-white p-2 px-6 flex justify-between items-center print:hidden shadow-lg z-50">
                <div className="flex items-center gap-4">
                    <button onClick={onClose} className="hover:bg-slate-700 p-2 rounded"><ChevronUp className="rotate-[-90deg]" /></button>
                    <span className="font-bold">Report Preview (Landscape)</span>
                </div>
                <div className="flex items-center gap-4 text-sm relative">
                    <button
                        onClick={() => setShowColMenu(!showColMenu)}
                        className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded"
                    >
                        <List size={16} /> Report Columns
                    </button>

                    {showColMenu && (
                        <div className="absolute top-full right-0 mt-2 bg-white text-slate-800 rounded-xl shadow-xl border w-64 p-2 max-h-[80vh] overflow-y-auto z-50">
                            <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 px-2">Select Image Columns</h4>
                            {reportOptions.map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => toggleCol(opt.id)}
                                    className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded flex items-center gap-2 text-sm"
                                >
                                    {selectedColIds.has(opt.id) ? <CheckSquare size={16} className="text-indigo-600" /> : <div className="w-4 h-4 border rounded border-slate-300"></div>}
                                    <span className={opt.color}>{opt.label}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <button onClick={() => window.print()} className="bg-white text-slate-900 px-4 py-1 rounded font-bold flex items-center gap-2">
                        <Printer size={16} /> Print
                    </button>
                </div>
            </div>

            <div className="mt-12">
                {renderReportTable()}
            </div>

            {ReactDOM.createPortal(
                <div className="print-only-portal">
                    {renderReportTable()}
                </div>,
                document.body
            )}
        </div>
    );

    function renderReportTable() {
        return (
            <div className="p-4 bg-white text-black text-xs">
                <div className="mb-4 border-b pb-2 flex justify-between items-end">
                    <h1 className="text-xl font-bold uppercase">{boq.name}</h1>
                    <p className="text-xs text-slate-500">Generated {new Date().toLocaleDateString()}</p>
                </div>

                <table className="w-full text-xs border-collapse border border-slate-300">
                    <thead>
                        <tr className="bg-slate-100">
                            <th className="border border-slate-300 p-1.5 text-left w-52">Sign Details</th>
                            {activeReportCols.map(col => (
                                <th key={col.id} className={`border border-slate-300 p-1.5 w-40 text-left uppercase ${col.color}`}>
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {signs.map(sign => (
                            <tr key={sign._id} className="break-inside-avoid">
                                <td className="border border-slate-300 p-1 align-top">
                                    <div className="flex justify-between items-start">
                                        <span className="font-bold text-sm leading-none">{sign[idCol?.key] || sign._id}</span>
                                        <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-50 px-1 rounded border leading-none">{sign.status.split(' ')[0]}</span>
                                    </div>
                                    <div className="mt-0.5 leading-[1.1]">
                                        {textCols.map(c => (
                                            <div key={c.key} className="grid grid-cols-[60px_1fr] gap-x-1 text-xs">
                                                <span className="text-slate-500 font-medium truncate">{c.label}:</span>
                                                <span className="font-semibold">{sign[c.key]}</span>
                                            </div>
                                        ))}
                                    </div>
                                </td>

                                {activeReportCols.map(col => {
                                    const images = getImagesForCol(sign, col);
                                    const bgClass = col.type === 'artwork' ? 'bg-slate-50/30' : (col.type === 'factory' ? 'bg-orange-50/10' : 'bg-green-50/10');
                                    return (
                                        <td key={col.id} className={`border border-slate-300 p-1 align-top ${bgClass}`}>
                                            <div className="flex flex-wrap gap-1">
                                                {images.map((img, i) => (
                                                    <img key={i} src={img.url} className="h-16 w-auto object-contain border bg-white shadow-sm" alt="" />
                                                ))}
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>

                <style>{`@media print { @page { size: landscape; margin: 0.5cm; } body { -webkit-print-color-adjust: exact; } }`}</style>
            </div>
        );
    }
};

const UserManagement = ({ onClose }) => {
    const [users, setUsers] = useState([]);
    const [newUser, setNewUser] = useState({ username: '', password: '', role: ROLES.FACTORY });

    useEffect(() => {
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
        const unsub = onSnapshot(q, sn => setUsers(sn.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => unsub();
    }, []);

    const handleCreate = async () => {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'users'), {
            ...newUser,
            createdAt: serverTimestamp()
        });
        setNewUser({ username: '', password: '', role: ROLES.FACTORY });
        alert("User record added.");
    };

    return (
        <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
            <div className="max-w-3xl mx-auto p-4 md:p-8">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-2xl font-bold">User Management</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X /></button>
                </div>

                <div className="bg-slate-50 p-6 rounded-xl mb-8">
                    <h3 className="font-bold mb-4">Create New User</h3>
                    <div className="flex flex-col md:flex-row gap-4">
                        <input
                            placeholder="Username"
                            className="flex-1 p-2 border rounded"
                            value={newUser.username}
                            onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                        />
                        <input
                            placeholder="Password"
                            type="text"
                            className="flex-1 p-2 border rounded"
                            value={newUser.password}
                            onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                        />
                        <select
                            className="p-2 border rounded"
                            value={newUser.role}
                            onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                        >
                            <option value={ROLES.FACTORY}>Factory</option>
                            <option value={ROLES.SITE}>Site</option>
                            <option value={ROLES.DUAL}>Dual</option>
                            <option value={ROLES.ADMIN}>Admin</option>
                        </select>
                        <button onClick={handleCreate} className="bg-indigo-600 text-white px-4 py-2 rounded font-medium">Create</button>
                    </div>
                </div>

                <div className="space-y-2">
                    {users.map(u => (
                        <div key={u.id} className="flex justify-between items-center p-4 bg-white border rounded shadow-sm">
                            <div className="flex flex-col">
                                <span className="font-medium">{u.username}</span>
                                <span className="text-xs text-slate-500 uppercase">{u.role}</span>
                            </div>
                            <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.id))} className="text-red-500 p-2 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ── DPR Tab ───────────────────────────────────────────────────────────────────

const DPRTab = ({ boq, user }) => {
    const canManageTasks = user.role === ROLES.ADMIN;
    const todayStr = () => new Date().toISOString().split('T')[0];

    const [tasks, setTasks] = useState([]);
    const [entries, setEntries] = useState([]);
    const [employees, setEmployees] = useState([]);

    // Task library form (admin only)
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [taskForm, setTaskForm] = useState({ name: '', description: '', unit: 'pcs', defaultDailyTarget: '', totalTarget: '' });
    const [savingTask, setSavingTask] = useState(false);

    // Log progress — per-task row state + shared date
    const [logDate, setLogDate] = useState(todayStr());
    const [logRows, setLogRows] = useState({});
    const [savingRow, setSavingRow] = useState(null);

    // Accordion
    const [expandedTasks, setExpandedTasks] = useState(new Set());

    useEffect(() => {
        const ref = collection(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id, 'dpr_tasks');
        return onSnapshot(ref, snap => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))));
    }, [boq.id]);

    useEffect(() => {
        const ref = collection(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id, 'dpr_entries');
        return onSnapshot(ref, snap => {
            const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            loaded.sort((a, b) => b.date.localeCompare(a.date));
            setEntries(loaded);
        });
    }, [boq.id]);

    useEffect(() => {
        getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'payroll_employees'))
            .then(snap => setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
            .catch(() => {});
    }, []);

    // Initialise a blank row for each task
    useEffect(() => {
        setLogRows(prev => {
            const next = {};
            tasks.forEach(t => { next[t.id] = prev[t.id] || { workers: [], actual: 0, workerSearch: '', showDrop: false }; });
            return next;
        });
    }, [tasks]);

    const cumulativeSummary = useMemo(() => {
        const map = {};
        entries.forEach(e => {
            if (!map[e.taskId]) map[e.taskId] = { taskName: e.taskName, unit: e.unit || 'pcs', total: 0, days: 0, totalTarget: 0 };
            map[e.taskId].total += e.actualCount || 0;
            map[e.taskId].days += 1;
        });
        tasks.forEach(t => { if (map[t.id]) map[t.id].totalTarget = t.totalTarget || 0; });
        return Object.values(map);
    }, [entries, tasks]);

    const handleSaveTask = async () => {
        if (!taskForm.name.trim()) return;
        const daily = Number(taskForm.defaultDailyTarget) || 0;
        const total = Number(taskForm.totalTarget) || 0;
        if (!daily && !total) { alert('Set at least a Daily Target or a Total Target.'); return; }
        setSavingTask(true);
        try {
            const data = { name: taskForm.name.trim(), description: taskForm.description.trim(), unit: taskForm.unit || 'pcs', defaultDailyTarget: daily, totalTarget: total };
            if (editingTask) {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id, 'dpr_tasks', editingTask.id), data);
            } else {
                await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id, 'dpr_tasks'), data);
            }
            setShowTaskForm(false); setEditingTask(null);
            setTaskForm({ name: '', description: '', unit: 'pcs', defaultDailyTarget: '', totalTarget: '' });
        } catch (e) { alert('Error: ' + e.message); }
        setSavingTask(false);
    };

    const handleLogRow = async (taskId) => {
        const task = tasks.find(t => t.id === taskId);
        const row = logRows[taskId];
        if (!task || !logDate) return;
        setSavingRow(taskId);
        try {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id, 'dpr_entries'), {
                date: logDate,
                taskId,
                taskName: task.name,
                unit: task.unit || 'pcs',
                workers: row?.workers || [],
                actualCount: Number(row?.actual) || 0,
                targetCount: task.defaultDailyTarget || 0,
                createdBy: user.username,
                createdAt: serverTimestamp(),
            });
            setLogRows(prev => ({ ...prev, [taskId]: { workers: [], actual: 0, workerSearch: '', showDrop: false } }));
        } catch (e) { alert('Error: ' + e.message); }
        setSavingRow(null);
    };

    const updRow = (taskId, patch) => setLogRows(prev => ({ ...prev, [taskId]: { ...prev[taskId], ...patch } }));

    const fmtTs = (ts) => {
        if (!ts) return '—';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const day = String(d.getDate()).padStart(2, '0');
        const mon = MONTHS[d.getMonth()];
        let h = d.getHours();
        const ampm = h >= 12 ? 'pm' : 'am';
        h = h % 12 || 12;
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${day}-${mon} ${h}:${min}${ampm}`;
    };

    const toggleExpand = (taskId) => setExpandedTasks(prev => {
        const next = new Set(prev);
        next.has(taskId) ? next.delete(taskId) : next.add(taskId);
        return next;
    });

    // Per-task cumulative totals from entries
    const taskTotals = useMemo(() => {
        const map = {};
        entries.forEach(e => {
            if (!map[e.taskId]) map[e.taskId] = { total: 0, days: 0 };
            map[e.taskId].total += e.actualCount || 0;
            map[e.taskId].days += 1;
        });
        return map;
    }, [entries]);

    // Entries grouped by task (sorted date desc already from snapshot)
    const entriesByTask = useMemo(() => {
        const map = {};
        entries.forEach(e => { (map[e.taskId] = map[e.taskId] || []).push(e); });
        return map;
    }, [entries]);

    const colCount = canManageTasks ? 7 : 6;
    const th = 'px-2 py-1.5 text-left text-sm font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap';
    const td = 'px-2 py-2 align-top text-sm';

    return (
        <div className="flex-1 overflow-auto bg-slate-50 p-3">
            <div className="bg-white rounded-xl border border-slate-200" style={{ overflow: 'visible' }}>

                {/* ── Header ── */}
                <div className="flex items-center justify-between px-3 py-2 border-b bg-slate-50 rounded-t-xl">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide">Daily Progress Report</h3>
                        {canManageTasks && (
                            <button
                                onClick={() => { setShowTaskForm(true); setEditingTask(null); setTaskForm({ name: '', description: '', unit: 'pcs', defaultDailyTarget: '', totalTarget: '' }); }}
                                className="flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-0.5 rounded hover:bg-indigo-50"
                            >
                                <Plus size={12} /> Add Task
                            </button>
                        )}
                    </div>
                    <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                </div>

                {/* ── Task form (inline panel, admin only) ── */}
                {showTaskForm && (
                    <div className="px-3 py-2.5 bg-indigo-50 border-b flex flex-wrap gap-2 items-end">
                        {[
                            { label: 'Name', key: 'name', placeholder: 'e.g. Profile Cutting', w: 'w-36' },
                            { label: 'Description', key: 'description', placeholder: 'Short description…', w: 'w-52' },
                            { label: 'Unit', key: 'unit', placeholder: 'pcs', w: 'w-16' },
                        ].map(({ label, key, placeholder, w }) => (
                            <div key={key} className="flex flex-col gap-0.5">
                                <label className="text-sm font-semibold text-slate-500 uppercase">{label}</label>
                                <input autoFocus={key === 'name'} className={`border rounded px-2 py-1 text-sm ${w} focus:outline-none focus:ring-1 focus:ring-indigo-400`} placeholder={placeholder} value={taskForm[key]} onChange={e => setTaskForm(f => ({ ...f, [key]: e.target.value }))} />
                            </div>
                        ))}
                        {[
                            { label: 'Daily Target', key: 'defaultDailyTarget', placeholder: '200' },
                            { label: 'Total Target', key: 'totalTarget', placeholder: '1000' },
                        ].map(({ label, key, placeholder }) => (
                            <div key={key} className="flex flex-col gap-0.5">
                                <label className="text-sm font-semibold text-slate-500 uppercase">{label}</label>
                                <input type="number" min="0" className="border rounded px-2 py-1 text-sm w-24 focus:outline-none focus:ring-1 focus:ring-indigo-400" placeholder={placeholder} value={taskForm[key]} onChange={e => setTaskForm(f => ({ ...f, [key]: e.target.value }))} />
                            </div>
                        ))}
                        <div className="flex gap-1.5 pb-0.5">
                            <button onClick={handleSaveTask} disabled={savingTask || !taskForm.name.trim()} className="bg-indigo-600 text-white text-sm px-3 py-1.5 rounded font-semibold hover:bg-indigo-700 disabled:opacity-50">
                                {savingTask ? '…' : editingTask ? 'Update' : 'Add'}
                            </button>
                            <button onClick={() => { setShowTaskForm(false); setEditingTask(null); }} className="text-slate-500 text-sm px-2 py-1.5 rounded hover:bg-slate-200">✕</button>
                        </div>
                    </div>
                )}

                {/* ── Empty state ── */}
                {tasks.length === 0 ? (
                    <div className="px-4 py-10 text-center text-slate-400 text-sm">
                        {canManageTasks ? 'No tasks yet. Click "Add Task" to get started.' : 'No tasks defined yet. Ask an admin to set up the task library.'}
                    </div>
                ) : (
                    <div style={{ overflow: 'visible' }}>
                        <table className="w-full text-sm" style={{ overflow: 'visible' }}>
                            <thead>
                                <tr className="border-b bg-slate-50">
                                    <th className={th} style={{ minWidth: 140 }}>Task</th>
                                    <th className={th} style={{ minWidth: 100 }}>Workers</th>
                                    <th className={`${th} text-center`} style={{ width: 100 }}>Actual</th>
                                    <th className={`${th} text-center`} style={{ minWidth: 120 }}>Today</th>
                                    <th className={`${th} text-center`} style={{ minWidth: 130 }}>Lifetime</th>
                                    <th style={{ width: 56 }}></th>
                                    {canManageTasks && <th style={{ width: 48 }}></th>}
                                </tr>
                            </thead>
                            <tbody style={{ overflow: 'visible' }}>
                                {tasks.map(task => {
                                    const row = logRows[task.id] || { workers: [], actual: 0, workerSearch: '', showDrop: false };
                                    const stats = taskTotals[task.id] || { total: 0, days: 0 };
                                    const taskEntryList = entriesByTask[task.id] || [];
                                    const isExpanded = expandedTasks.has(task.id);
                                    const todayActual = taskEntryList.filter(e => e.date === logDate).reduce((s, e) => s + (e.actualCount || 0), 0);
                                    const dailyPct = task.defaultDailyTarget > 0 ? Math.min(100, Math.round(todayActual / task.defaultDailyTarget * 100)) : null;
                                    const lifetimePct = task.totalTarget > 0 ? Math.min(100, Math.round(stats.total / task.totalTarget * 100)) : null;
                                    const workerSearch = (row.workerSearch || '').toLowerCase();
                                    const filteredEmps = employees
                                        .filter(e =>
                                            e.department?.toLowerCase() === 'factory' &&
                                            e.name?.toLowerCase().includes(workerSearch) &&
                                            !row.workers.includes(e.name)
                                        )
                                        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                                    // Allow adding a custom/temp worker if the typed name isn't already in the list
                                    const showAddCustom = workerSearch.trim().length > 0 &&
                                        !row.workers.map(w => w.toLowerCase()).includes(workerSearch.trim()) &&
                                        !filteredEmps.some(e => e.name?.toLowerCase() === workerSearch.trim());

                                    return (
                                        <React.Fragment key={task.id}>
                                            <tr
                                            className={`border-b hover:bg-slate-50/50 cursor-pointer select-none ${isExpanded ? 'bg-indigo-50/30' : ''}`}
                                            style={{ overflow: 'visible' }}
                                            onClick={e => { if (e.target.closest('button,input,a')) return; toggleExpand(task.id); }}
                                        >

                                                {/* Task + description */}
                                                <td className={td}>
                                                    <div className="flex items-center gap-1">
                                                        <span className="font-semibold text-slate-700">{task.name}</span>
                                                        {taskEntryList.length > 0 && (
                                                            <span className={`text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} style={{ display: 'inline-flex' }}>
                                                                <ChevronDown size={13} />
                                                            </span>
                                                        )}
                                                    </div>
                                                    {task.description && <div className="text-sm text-slate-400 mt-0.5 leading-tight max-w-[160px]">{task.description}</div>}
                                                </td>

                                                {/* Workers tag input */}
                                                <td className={td} style={{ overflow: 'visible', position: 'relative' }}>
                                                    <div className="border rounded flex flex-wrap gap-0.5 px-1.5 py-1 min-h-[28px] bg-white cursor-text focus-within:ring-1 focus-within:ring-indigo-400"
                                                        onClick={() => updRow(task.id, { showDrop: true })}>
                                                        {row.workers.map(w => (
                                                            <span key={w} className="flex items-center gap-0.5 bg-indigo-100 text-indigo-700 text-sm px-1.5 py-0.5 rounded-full">
                                                                {w}
                                                                <button onClick={ev => { ev.stopPropagation(); updRow(task.id, { workers: row.workers.filter(x => x !== w) }); }}><X size={9} /></button>
                                                            </span>
                                                        ))}
                                                        <input
                                                            className="flex-1 min-w-[36px] text-sm outline-none bg-transparent"
                                                            placeholder={row.workers.length === 0 ? 'Add…' : ''}
                                                            value={row.workerSearch || ''}
                                                            onChange={e => updRow(task.id, { workerSearch: e.target.value, showDrop: true })}
                                                            onFocus={() => updRow(task.id, { showDrop: true })}
                                                            onBlur={() => setTimeout(() => updRow(task.id, { showDrop: false }), 150)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') {
                                                                    const trimmed = (row.workerSearch || '').trim();
                                                                    if (trimmed && !row.workers.includes(trimmed)) {
                                                                        updRow(task.id, { workers: [...row.workers, trimmed], workerSearch: '', showDrop: false });
                                                                    }
                                                                    e.preventDefault();
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                    {row.showDrop && (filteredEmps.length > 0 || showAddCustom) && (
                                                        <div className="absolute left-0 right-0 top-full mt-0.5 bg-white border rounded shadow-lg z-30 max-h-36 overflow-y-auto">
                                                            {filteredEmps.map(emp => (
                                                                <button key={emp.id} className="w-full text-left px-2 py-1.5 text-sm hover:bg-indigo-50 text-slate-700"
                                                                    onMouseDown={() => updRow(task.id, { workers: [...row.workers, emp.name], workerSearch: '' })}>
                                                                    {emp.name}
                                                                </button>
                                                            ))}
                                                            {showAddCustom && (
                                                                <button className="w-full text-left px-2 py-1.5 text-sm hover:bg-amber-50 text-amber-700 border-t"
                                                                    onMouseDown={() => { const t = (row.workerSearch || '').trim(); updRow(task.id, { workers: [...row.workers, t], workerSearch: '', showDrop: false }); }}>
                                                                    + Add "{(row.workerSearch || '').trim()}" as temp worker
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Actual stepper */}
                                                <td className={`${td} text-center`}>
                                                    <div className="flex items-center border rounded overflow-hidden mx-auto" style={{ width: 100 }}>
                                                        <button onClick={() => updRow(task.id, { actual: Math.max(0, Number(row.actual) - 1) })} className="px-1.5 py-1.5 bg-slate-50 hover:bg-slate-100 border-r text-slate-500"><Minus size={11} /></button>
                                                        <input
                                                            type="number" min="0"
                                                            value={row.actual}
                                                            onChange={e => updRow(task.id, { actual: e.target.value })}
                                                            className="w-0 flex-1 text-center text-sm py-1 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                        />
                                                        <button onClick={() => updRow(task.id, { actual: Number(row.actual) + 1 })} className="px-1.5 py-1.5 bg-slate-50 hover:bg-slate-100 border-l text-slate-500"><Plus size={11} /></button>
                                                    </div>
                                                </td>

                                                {/* Today's progress vs daily target */}
                                                <td className={`${td} text-center`}>
                                                    {task.defaultDailyTarget > 0 ? (
                                                        <div>
                                                            <span className={`font-semibold ${dailyPct != null && dailyPct >= 100 ? 'text-green-600' : 'text-indigo-700'}`}>{todayActual}</span>
                                                            <span className="text-slate-400 text-sm"> / {task.defaultDailyTarget} {task.unit}</span>
                                                            <div className="mt-1">
                                                                <div className="h-1 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${dailyPct != null && dailyPct >= 100 ? 'bg-green-500' : 'bg-indigo-400'}`} style={{ width: `${dailyPct ?? 0}%` }} /></div>
                                                                <div className={`text-sm mt-0.5 font-bold ${dailyPct != null && dailyPct >= 100 ? 'text-green-600' : 'text-indigo-500'}`}>{dailyPct ?? 0}%</div>
                                                            </div>
                                                        </div>
                                                    ) : <span className="text-slate-300">—</span>}
                                                </td>

                                                {/* Lifetime progress */}
                                                <td className={`${td} text-center`}>
                                                    {task.totalTarget > 0 ? (
                                                        <div>
                                                            <span className="font-semibold text-indigo-700">{stats.total}</span>
                                                            <span className="text-slate-400 text-sm"> / {task.totalTarget} {task.unit}</span>
                                                            {lifetimePct !== null && (
                                                                <div className="mt-1">
                                                                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${lifetimePct >= 100 ? 'bg-green-500' : 'bg-teal-400'}`} style={{ width: `${lifetimePct}%` }} /></div>
                                                                    <div className={`text-sm mt-0.5 font-bold ${lifetimePct >= 100 ? 'text-green-600' : 'text-teal-600'}`}>{lifetimePct}%</div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="font-semibold text-indigo-700">{stats.total} <span className="font-normal text-slate-400 text-sm">{task.unit}</span></span>
                                                    )}
                                                    {stats.days > 0 && <div className="text-sm text-slate-300 mt-0.5">{stats.days} {stats.days === 1 ? 'entry' : 'entries'}</div>}
                                                </td>

                                                {/* Log */}
                                                <td className={`${td} text-center`}>
                                                    <button onClick={() => handleLogRow(task.id)} disabled={savingRow === task.id} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-2.5 py-1 rounded disabled:opacity-50">
                                                        {savingRow === task.id ? '…' : 'Log'}
                                                    </button>
                                                </td>

                                                {/* Admin actions */}
                                                {canManageTasks && (
                                                    <td className={`${td} text-center`}>
                                                        <div className="flex gap-0.5 justify-center">
                                                            <button onClick={() => { setEditingTask(task); setTaskForm({ name: task.name, description: task.description || '', unit: task.unit || 'pcs', defaultDailyTarget: String(task.defaultDailyTarget || ''), totalTarget: String(task.totalTarget || '') }); setShowTaskForm(true); }} className="p-1 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded"><Edit size={13} /></button>
                                                            <button onClick={async () => { if (window.confirm('Delete task?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'boqs', boq.id, 'dpr_tasks', task.id)); }} className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={13} /></button>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>

                                            {/* Accordion: entry history for this task */}
                                            {isExpanded && (
                                                <tr className="bg-slate-50/70">
                                                    <td colSpan={colCount} className="px-6 py-2 border-b">
                                                        {taskEntryList.length === 0 ? (
                                                            <span className="text-sm text-slate-400">No entries yet.</span>
                                                        ) : (
                                                            <table className="w-full text-sm">
                                                                <thead>
                                                                    <tr className="text-sm text-slate-400 uppercase">
                                                                        <th className="pb-1 text-left font-bold pr-4">Date</th>
                                                                        <th className="pb-1 text-left font-bold pr-4">Workers</th>
                                                                        <th className="pb-1 text-center font-bold pr-4">Actual / Target</th>
                                                                        <th className="pb-1 text-center font-bold w-20">Progress</th>
                                                                        <th className="pb-1 text-right font-bold">By</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100">
                                                                    {taskEntryList.map(e => {
                                                                        const pct = e.targetCount > 0 ? Math.min(100, Math.round(e.actualCount / e.targetCount * 100)) : null;
                                                                        return (
                                                                            <tr key={e.id}>
                                                                                <td className="py-1.5 pr-4 text-slate-600 font-medium whitespace-nowrap">{fmtTs(e.createdAt)}</td>
                                                                                <td className="py-1.5 pr-4">
                                                                                    <div className="flex flex-wrap gap-0.5">
                                                                                        {e.workers?.length > 0 ? e.workers.map(w => <span key={w} className="text-sm bg-white border text-slate-500 px-1.5 py-0.5 rounded">{w}</span>) : <span className="text-slate-300">—</span>}
                                                                                    </div>
                                                                                </td>
                                                                                <td className={`py-1.5 pr-4 text-center font-bold ${pct != null && pct >= 100 ? 'text-green-600' : 'text-indigo-700'}`}>
                                                                                    {e.actualCount} / {e.targetCount} {e.unit}
                                                                                </td>
                                                                                <td className="py-1.5 text-center">
                                                                                    {pct !== null ? (
                                                                                        <div className="flex flex-col items-center gap-0.5">
                                                                                            <span className={`text-sm font-bold ${pct >= 100 ? 'text-green-600' : 'text-indigo-600'}`}>{pct}%</span>
                                                                                            <div className="w-16 h-1 bg-slate-200 rounded-full overflow-hidden"><div className={`h-full ${pct >= 100 ? 'bg-green-500' : 'bg-indigo-400'}`} style={{ width: `${pct}%` }} /></div>
                                                                                        </div>
                                                                                    ) : '—'}
                                                                                </td>
                                                                                <td className="py-1.5 text-right text-slate-400 whitespace-nowrap">{e.createdBy}</td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Main App Component ---


const ReportingTracker = ({ user: globalUser, perms = {} }) => {
    const loading = false;
    const [activeBOQ, setActiveBOQ] = useState(null);
    const [showUserMan, setShowUserMan] = useState(false);

    // Map perms to the tracker's internal role model
    const getTrackerRole = () => {
        if (perms['boq.create']) return ROLES.ADMIN;
        if (perms['boq.updateFactoryStatus'] && perms['boq.updateSiteStatus']) return ROLES.DUAL;
        if (perms['boq.updateFactoryStatus']) return ROLES.FACTORY;
        if (perms['boq.updateSiteStatus']) return ROLES.SITE;
        return ROLES.SITE; // view-only: most restricted worker
    };

    const user = {
        username: globalUser?.username || globalUser?.email?.split('@')[0] || 'user',
        role: getTrackerRole()
    };

    if (loading) return <Loading />;

    if (showUserMan) return <UserManagement onClose={() => setShowUserMan(false)} />;

    if (activeBOQ) {
        return (
            <BOQManager
                boq={activeBOQ}
                user={user}
                onBack={() => setActiveBOQ(null)}
            />
        );
    }

    return (
        <Dashboard
            user={user}
            onViewBOQ={setActiveBOQ}
            onManageUsers={() => setShowUserMan(true)}
            onLogout={() => { }} // Controlled by main app
        />
    );
};

export default ReportingTracker;
