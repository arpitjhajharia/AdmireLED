import React from 'react';

const ScreenVisualizer = ({ cols, rows, module, cabinet, unit }) => {
    if (!module || !cabinet) return null;

    // Dimensions
    const cabinetW = cabinet.width;
    const cabinetH = cabinet.height;
    const screenW = cabinetW * cols;
    const screenH = cabinetH * rows;

    const formatDims = (mm) => {
        const m = (mm / 1000).toFixed(2) + 'm';
        const ft = (mm / 304.8).toFixed(2) + 'ft';
        return `${m} / ${ft}`;
    };

    return (
        <div className="w-full flex flex-col bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="w-full h-full min-h-[300px] p-10 flex items-center justify-center">
                <div className="relative" style={{ aspectRatio: `${screenW}/${screenH}`, width: '100%', maxHeight: '400px' }}>
                    {/* Top Dimension */}
                    <div className="absolute -top-8 left-0 right-0 text-center text-xs font-bold text-slate-600 flex items-center justify-center gap-2">
                        <div className="h-[1px] flex-1 bg-slate-300"></div>
                        <span className="bg-white px-1 whitespace-nowrap">{formatDims(screenW)} ({cols} Cabinets)</span>
                        <div className="h-[1px] flex-1 bg-slate-300"></div>
                    </div>

                    {/* Left Dimension */}
                    <div className="absolute -left-8 top-0 bottom-0 text-center text-xs font-bold text-slate-600 flex flex-col items-center justify-center gap-2" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                        <div className="w-[1px] flex-1 bg-slate-300"></div>
                        <span className="bg-white px-1 whitespace-nowrap">{formatDims(screenH)} ({rows} Cabinets)</span>
                        <div className="w-[1px] flex-1 bg-slate-300"></div>
                    </div>

                    {/* The Grid Itself */}
                    <div
                        className="w-full h-full grid bg-white border-2 border-slate-900 shadow-sm"
                        style={{
                            gridTemplateColumns: `repeat(${cols}, 1fr)`,
                            gridTemplateRows: `repeat(${rows}, 1fr)`
                        }}
                    >
                        {Array.from({ length: cols * rows }).map((_, i) => (
                            <div key={i} className="border border-slate-300 relative"></div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScreenVisualizer;