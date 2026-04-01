import React from 'react';
import { db, appId } from '../lib/firebase';
import { ImagePlus, Trash2, X, CheckCircle2, Circle, Upload, Image as ImageIcon } from 'lucide-react';

/**
 * QuoteImageManager
 *
 * mode='library'  (default) — full management: upload, delete, no selection UX.
 *                             Used as a standalone tab page.
 * mode='picker'              — selection only: checkboxes, no upload zone, close button.
 *                             Used as an inline panel inside the Calculator.
 *
 * Props:
 *  user               : firebase user
 *  userRole           : string
 *  mode               : 'library' | 'picker'
 *  selectedIds        : string[]   (picker mode only)
 *  onSelectionChange  : fn         (picker mode only)
 *  onClose            : fn         (picker mode only)
 */
const QuoteImageManager = ({
    user,
    userRole,
    mode = 'library',
    selectedIds = [],
    onSelectionChange,
    onClose,
}) => {
    const [images, setImages] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [uploading, setUploading] = React.useState(false);
    const [dragOver, setDragOver] = React.useState(false);
    const fileInputRef = React.useRef(null);

    const isAdmin = userRole === 'admin' || userRole === 'super_admin';
    const isLibrary = mode === 'library';
    const isPicker  = mode === 'picker';

    const COLLECTION = () =>
        db.collection('artifacts').doc(appId).collection('public').doc('data').collection('quote_images');

    // ── Fetch ────────────────────────────────────────────────────────────────
    React.useEffect(() => {
        if (!user || !db) return;
        const unsub = COLLECTION()
            .orderBy('createdAt', 'desc')
            .onSnapshot(snap => {
                setImages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                setLoading(false);
            }, err => {
                console.error('quote_images fetch error:', err);
                setLoading(false);
            });
        return () => unsub();
    }, [user]);

    // ── Helpers ──────────────────────────────────────────────────────────────
    const toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const resizeImage = (dataUrl, maxWidth) => new Promise(resolve => {
        const img = new window.Image();
        img.onload = () => {
            const scale = img.width > maxWidth ? maxWidth / img.width : 1;
            const w = Math.round(img.width * scale);
            const h = Math.round(img.height * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = dataUrl;
    });

    const handleUpload = async files => {
        if (!isAdmin || !files || files.length === 0) return;
        setUploading(true);
        try {
            for (const file of Array.from(files)) {
                if (!file.type.startsWith('image/')) continue;
                const base64 = await toBase64(file);
                const resized = await resizeImage(base64, 1200);
                await COLLECTION().add({
                    name: file.name,
                    dataUrl: resized,
                    createdAt: new Date(),
                    uploadedBy: user?.email || 'unknown'
                });
            }
        } catch (e) {
            console.error('Upload error:', e);
            alert('Error uploading image. See console.');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async id => {
        if (!isAdmin) return;
        if (!window.confirm('Delete this image from the library?')) return;
        try {
            await COLLECTION().doc(id).delete();
            if (selectedIds.includes(id)) onSelectionChange?.(selectedIds.filter(x => x !== id));
        } catch (e) { console.error('Delete error:', e); }
    };

    const toggleSelect = id => {
        if (!onSelectionChange) return;
        if (selectedIds.includes(id)) onSelectionChange(selectedIds.filter(x => x !== id));
        else onSelectionChange([...selectedIds, id]);
    };

    const handleDrop = e => {
        e.preventDefault();
        setDragOver(false);
        if (!isAdmin) return;
        handleUpload(e.dataTransfer.files);
    };

    // ── LIBRARY MODE layout ──────────────────────────────────────────────────
    if (isLibrary) {
        return (
            <div className="p-3 md:p-4">
                {/* Page header */}
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-800 to-slate-600 flex items-center justify-center shadow-sm">
                        <ImageIcon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-white leading-none">
                            Image Library
                        </h2>
                        <p className="text-[11px] font-medium text-slate-400 mt-0.5 tracking-wide uppercase">
                            {images.length} {images.length === 1 ? 'image' : 'images'} · shared reference pool for quotes
                        </p>
                    </div>
                </div>

                {/* Upload zone — admin only */}
                {isAdmin && (
                    <div
                        className={`mb-4 border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
                            dragOver
                                ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                                : 'border-slate-200 dark:border-slate-600 hover:border-teal-400 dark:hover:border-teal-600 hover:bg-slate-50 dark:hover:bg-slate-700/30'
                        }`}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={e => handleUpload(e.target.files)}
                        />
                        {uploading ? (
                            <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400">
                                <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                                <span className="text-sm font-semibold">Uploading…</span>
                            </div>
                        ) : (
                            <>
                                <Upload className="w-6 h-6 text-slate-400" />
                                <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                                    <span className="font-semibold text-teal-600 dark:text-teal-400">Click to upload</span> or drag & drop
                                </p>
                                <p className="text-xs text-slate-400">JPG, PNG, WEBP — stored as shared library</p>
                            </>
                        )}
                    </div>
                )}

                {/* Grid */}
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-7 h-7 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : images.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                        <ImagePlus className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
                        <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">No images yet</p>
                        {isAdmin && <p className="text-xs text-slate-400 mt-1">Upload reference images above — they'll be available for all quotes</p>}
                        {!isAdmin && <p className="text-xs text-slate-400 mt-1">Ask an admin to upload reference images</p>}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                        {images.map(img => (
                            <div key={img.id} className="group relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-shadow">
                                <img
                                    src={img.dataUrl}
                                    alt={img.name}
                                    className="w-full aspect-video object-cover block"
                                />
                                {/* Caption bar */}
                                <div className="px-2 py-1.5 flex items-center justify-between gap-1">
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate flex-1" title={img.name}>
                                        {img.name}
                                    </p>
                                    {isAdmin && (
                                        <button
                                            onClick={() => handleDelete(img.id)}
                                            className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 size={11} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // ── PICKER MODE layout (inline panel in Calculator) ───────────────────────
    return (
        <div className="flex flex-col h-full">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white">Reference Images</h3>
                    {selectedIds.length > 0 && (
                        <span className="px-1.5 py-0.5 bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-[10px] font-bold rounded-full">
                            {selectedIds.length} selected
                        </span>
                    )}
                </div>
                {onClose && (
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                        <X size={16} />
                    </button>
                )}
            </div>

            {/* Helper */}
            <p className="px-4 pt-2 text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">
                {images.length > 0
                    ? 'Click images to include them in this quote\'s print layout.'
                    : 'Go to the Images tab to upload reference images.'}
            </p>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : images.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                        <ImagePlus className="w-7 h-7 text-slate-600 mb-2" />
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">No images in library</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        {images.map(img => {
                            const isSelected = selectedIds.includes(img.id);
                            return (
                                <div
                                    key={img.id}
                                    onClick={() => toggleSelect(img.id)}
                                    className={`relative group rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                                        isSelected
                                            ? 'border-teal-500 ring-2 ring-teal-400/40'
                                            : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                                    }`}
                                >
                                    <img src={img.dataUrl} alt={img.name} className="w-full aspect-video object-cover block" />
                                    <div className={`absolute inset-0 transition-all ${isSelected ? 'bg-teal-900/20' : 'bg-transparent group-hover:bg-black/10'}`} />
                                    <div className="absolute top-1.5 left-1.5">
                                        {isSelected
                                            ? <CheckCircle2 className="w-5 h-5 text-teal-400 drop-shadow" />
                                            : <Circle className="w-5 h-5 text-white/70 drop-shadow" />
                                        }
                                    </div>
                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                                        <p className="text-[9px] text-white/80 truncate">{img.name}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default QuoteImageManager;
