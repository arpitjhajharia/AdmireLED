import React from 'react';
import ReactDOM from 'react-dom';
import { formatCurrency, generateId } from '../lib/utils';

const BOMLayout = ({ data, allScreensData }) => {
    // 1. Data Validation
    if (!data && !allScreensData) return null;

    const isMultiScreen = allScreensData && allScreensData.calculations && allScreensData.calculations.length > 1;
    if (!isMultiScreen && !data) return null;

    const clientName = (isMultiScreen ? allScreensData.clientName : data?.clientName) || '';
    const projectName = (isMultiScreen ? allScreensData.projectName : data?.projectName) || '';

    // 2. Helper to render a single screen's BOM table
    const renderScreenBOM = (calc, screenIndex, screenConfig) => {
        const { detailedItems, screenQty, moduleType, cabinetType, finalWidth, finalHeight } = calc;

        return (
            <div key={screenIndex} className="mb-8 break-inside-avoid print-break-avoid">
                {isMultiScreen && (
                    <div className="bg-teal-50 dark:bg-teal-900/20 p-3 rounded-lg mb-3 border border-teal-200 dark:border-teal-800">
                        <h3 className="font-bold text-teal-800 dark:text-teal-300 text-sm">
                            Screen Configuration #{screenIndex + 1}
                        </h3>
                        <div className="grid grid-cols-4 gap-2 mt-2 text-xs text-teal-700 dark:text-teal-400">
                            <div><span className="font-semibold">Target:</span> {screenConfig.targetWidth}×{screenConfig.targetHeight}{screenConfig.unit || 'm'}</div>
                            <div><span className="font-semibold">Final:</span> {finalWidth}m × {finalHeight}m</div>
                            <div><span className="font-semibold">Quantity:</span> {screenQty} screens</div>
                            {moduleType && <div><span className="font-semibold">Pitch:</span> P{moduleType.pitch}</div>}
                        </div>
                    </div>
                )}

                <table className="w-full border-collapse border border-slate-300 text-[10px]">
                    <thead className="bg-slate-100 text-slate-700">
                        <tr>
                            <th className="p-2 border border-slate-300 text-left w-10">#</th>
                            <th className="p-2 border border-slate-300 text-left w-32">Component</th>
                            <th className="p-2 border border-slate-300 text-left">Specification / Details</th>
                            <th className="p-2 border border-slate-300 text-center w-16">Qty/Scrn</th>
                            <th className="p-2 border border-slate-300 text-center w-16">Total Qty</th>
                        </tr>
                    </thead>
                    <tbody>
                        {detailedItems.map((item, i) => {
                            let extraSpecs = null;
                            if (item.id === 'modules' && moduleType) {
                                extraSpecs = (
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-[9px] text-slate-500">
                                        <span>Size: {moduleType.width}x{moduleType.height}mm</span>
                                        <span>LED: {moduleType.ledType || '-'}</span>
                                        <span>Bright: {moduleType.brightness} nits</span>
                                        <span>Ref: {moduleType.refreshRate} Hz</span>
                                        <span>Ang: {moduleType.viewAngleH}/{moduleType.viewAngleV}</span>
                                        <span>IP: {moduleType.ipFront}/{moduleType.ipBack}</span>
                                        <span>Pwr: {moduleType.avgPower}/{moduleType.maxPower} W</span>
                                        <span>Wt: {moduleType.weight} kg</span>
                                    </div>
                                );
                            }
                            if (item.id === 'cabinets' && cabinetType) {
                                extraSpecs = (
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-[9px] text-slate-500">
                                        <span>Size: {cabinetType.width}x{cabinetType.height}mm</span>
                                        <span>Mat: {cabinetType.material}</span>
                                        <span>Weight: {cabinetType.weight} kg</span>
                                    </div>
                                );
                            }
                            return (
                                <tr key={i}>
                                    <td className="p-2 border border-slate-300 text-center">{i + 1}</td>
                                    <td className="p-2 border border-slate-300 font-bold align-top">{item.name}</td>
                                    <td className="p-2 border border-slate-300 align-top">
                                        <div className="font-semibold">{item.spec}</div>
                                        {extraSpecs}
                                    </td>
                                    <td className="p-2 border border-slate-300 text-center align-top">{item.qty}</td>
                                    <td className="p-2 border border-slate-300 text-center font-bold align-top">{item.qty * screenQty}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    // 3. Helper to render consolidated BOM
    const renderConsolidatedBOM = () => {
        if (!isMultiScreen) return null;

        const consolidatedItems = {};
        allScreensData.calculations.forEach((calc, screenIndex) => {
            calc.detailedItems.forEach(item => {
                const key = `${item.inventoryId || item.id}_${item.spec}`;
                if (!consolidatedItems[key]) {
                    consolidatedItems[key] = {
                        name: item.name,
                        spec: item.spec,
                        totalQty: 0,
                        screens: []
                    };
                }
                const itemTotalQty = item.qty * calc.screenQty;
                consolidatedItems[key].totalQty += itemTotalQty;
                consolidatedItems[key].screens.push({
                    screenIndex: screenIndex + 1,
                    qtyPerScreen: item.qty,
                    screenQty: calc.screenQty,
                    total: itemTotalQty
                });
            });
        });

        const consolidatedArray = Object.values(consolidatedItems);

        return (
            <div className="mt-8 break-inside-avoid print-break-avoid border-t-4 border-slate-800 pt-6">
                <div className="bg-slate-800 text-white p-3 rounded-t-lg mb-0">
                    <h3 className="font-bold text-lg uppercase tracking-wide">Consolidated Bill of Materials</h3>
                    <p className="text-xs text-slate-300 mt-1">Combined quantities across all screen configurations</p>
                </div>

                <table className="w-full border-collapse border border-slate-300 text-[10px]">
                    <thead className="bg-slate-700 text-white">
                        <tr>
                            <th className="p-2 border border-slate-600 text-left w-10">#</th>
                            <th className="p-2 border border-slate-600 text-left w-32">Component</th>
                            <th className="p-2 border border-slate-600 text-left">Specification</th>
                            <th className="p-2 border border-slate-600 text-center w-20">Total Qty</th>
                            <th className="p-2 border border-slate-600 text-left">Usage Breakdown</th>
                        </tr>
                    </thead>
                    <tbody>
                        {consolidatedArray.map((item, i) => (
                            <tr key={i} className={i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                                <td className="p-2 border border-slate-300 text-center">{i + 1}</td>
                                <td className="p-2 border border-slate-300 font-bold align-top">{item.name}</td>
                                <td className="p-2 border border-slate-300 align-top">{item.spec}</td>
                                <td className="p-2 border border-slate-300 text-center font-bold align-top text-teal-700">{item.totalQty}</td>
                                <td className="p-2 border border-slate-300 align-top">
                                    <div className="text-[9px] text-slate-600">
                                        {item.screens.map((screen, idx) => (
                                            <span key={idx}>
                                                Screen #{screen.screenIndex}: {screen.total} units
                                                {idx < item.screens.length - 1 ? ' • ' : ''}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="mt-4 p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-800">
                    <div className="grid grid-cols-3 gap-4 text-xs">
                        <div>
                            <span className="font-bold text-teal-800 dark:text-teal-300">Total Configurations:</span>
                            <span className="ml-2 font-bold text-lg text-teal-600 dark:text-teal-400">{allScreensData.calculations.length}</span>
                        </div>
                        <div>
                            <span className="font-bold text-teal-800 dark:text-teal-300">Total Screens:</span>
                            <span className="ml-2 font-bold text-lg text-teal-600 dark:text-teal-400">{allScreensData.totalScreenQty}</span>
                        </div>
                        <div>
                            <span className="font-bold text-teal-800 dark:text-teal-300">Unique Components:</span>
                            <span className="ml-2 font-bold text-lg text-teal-600 dark:text-teal-400">{consolidatedArray.length}</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // 4. Content Generator (Renders content for both Preview and Print)
    const renderContent = (isPrintVersion) => (
        <div className={`p-8 max-w-[210mm] mx-auto bg-white min-h-screen text-slate-800 font-sans text-xs ${isPrintVersion ? 'print-version-container p-0 w-full' : ''}`}>
            <div className="flex justify-between items-start mb-6 border-b-2 border-slate-800 pb-4">
                <div className="flex items-center gap-4">
                    <img src="/logo.png" alt="Logo" className="h-12 w-auto" />
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-wide">Bill of Materials</h1>
                        <div className="mt-1 space-y-0.5">
                            <p className="text-sm font-bold text-slate-700">Project: <span className="font-normal">{projectName}</span></p>
                            <p className="text-sm font-bold text-slate-700">Client: <span className="font-normal">{clientName}</span></p>
                            {isMultiScreen && (
                                <p className="text-xs text-slate-500 mt-1">
                                    {allScreensData.calculations.length} Configs • {allScreensData.totalScreenQty} Screens
                                </p>
                            )}
                            {!isMultiScreen && data.moduleType && (
                                <p className="text-xs text-slate-500 mt-1">
                                    P{data.moduleType.pitch} {data.moduleType.indoor ? 'Indoor' : 'Outdoor'} • {data.finalWidth}m x {data.finalHeight}m • Qty: {data.screenQty}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-sm font-bold text-slate-700">REF: {generateId()}</p>
                    <p className="text-xs text-slate-500">{new Date().toLocaleDateString()}</p>
                </div>
            </div>

            {/* Content Body */}
            {isMultiScreen ? (
                <>
                    <div className="mb-6">
                        <h2 className="text-sm font-bold text-slate-700 uppercase mb-3 pb-2 border-b border-slate-300">Individual Screen Configurations</h2>
                    </div>
                    {allScreensData.calculations.map((calc, index) =>
                        renderScreenBOM(calc, index, allScreensData.screenConfigs ? allScreensData.screenConfigs[index] : {})
                    )}
                    {renderConsolidatedBOM()}
                </>
            ) : (
                renderScreenBOM(data, 0, {})
            )}

            <div className="mt-8 text-[10px] text-slate-400 border-t border-slate-200 pt-2 text-center">
                Internal Document • Generated by Admire Sign LED Calculator
            </div>
        </div>
    );

    // 5. Dual Render Return (Preview + Portal Print)
    return (
        <React.Fragment>
            {/* A. Preview Copy */}
            <div className="screen-preview-wrapper">
                {renderContent(false)}
            </div>

            {/* B. Print Copy (Portal) */}
            {ReactDOM.createPortal(
                <div className="print-only-portal">
                    {renderContent(true)}
                </div>,
                document.body
            )}
        </React.Fragment>
    );
};

export default BOMLayout;