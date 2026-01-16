import React from 'react';
import ReactDOM from 'react-dom';
import ScreenVisualizer from './ScreenVisualizer';
import { formatCurrency, generateId } from '../lib/utils';
import { CONFIG } from '../lib/config';

// 4. Print Layout - Dual Render (Visualizer Removed from Print)
const PrintLayout = ({ data, allScreensData, currency = 'INR', exchangeRate, date }) => {
    // 1. Data Preparation
    const isMultiScreen = allScreensData && allScreensData.calculations && allScreensData.calculations.length > 1;
    const configs = isMultiScreen ? allScreensData.calculations : (data ? [data] : []);

    if (configs.length === 0) return null;

    // 2. Extract Shared Details
    const clientName = (isMultiScreen ? allScreensData.clientName : data?.clientName) || '';
    const projectName = (isMultiScreen ? allScreensData.projectName : data?.projectName) || '';
    const terms = configs[0].terms || {};
    const grandTotalProject = isMultiScreen ? allScreensData.totalProjectSell : data?.totalProjectSell;

    // 3. Content Generator (Renders the FULL Advanced Quote without Visualizer)
    const renderContent = (isPrintVersion) => (
        <div className={`bg-white text-slate-800 font-sans text-xs ${isPrintVersion ? 'print-version-container p-0' : 'preview-version-container w-full h-full p-8'}`}>

            {/* Header */}
            <div className="flex justify-between items-start mb-6 border-b-2 border-slate-800 pb-4">
                <div className="flex gap-4 items-center">
                    <img src="/logo.png" alt="Company Logo" className="h-16 w-auto object-contain" />
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-wide">{CONFIG.COMPANY.NAME}</h1>
                        <div className="text-[10px] text-slate-600 mt-1 space-y-0.5">
                            <p>{CONFIG.COMPANY.ADDRESS_1}</p>
                            <p>{CONFIG.COMPANY.ADDRESS_2}</p>
                            <p>Email: {CONFIG.COMPANY.EMAIL} | Web: {CONFIG.COMPANY.WEB}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Loop through each configuration */}
            {configs.map((config, index) => {
                const {
                    finalWidth, finalHeight, totalCabinets,
                    moduleType = {}, cabinetType = {}, processor, screenQty, totalProjectSell,
                    gridCols, gridRows, commercials
                } = config;

                // Technical Calculations
                const screenWidthM = Number(finalWidth);
                const screenHeightM = Number(finalHeight);
                const areaSqm = screenWidthM * screenHeightM;
                const areaSqft = areaSqm * 10.7639;

                const pitch = Number(moduleType.pitch || 0);
                const resW = pitch > 0 ? Math.round((screenWidthM * 1000) / pitch) : 0;
                const resH = pitch > 0 ? Math.round((screenHeightM * 1000) / pitch) : 0;

                // Weight & Power Logic
                const totalModWeight = (moduleType.weight || 0) * areaSqm;
                const totalCabWeight = (cabinetType.weight || 0) * totalCabinets;
                const totalWeight = totalModWeight + totalCabWeight;

                const avgPower = (moduleType.avgPower || 0) * areaSqm;
                const maxPower = (moduleType.maxPower || 0) * areaSqm;

                // Commercials Logic
                const comms = commercials || { sellProcTotal: 0, sellInstallTotal: 0, sellStructureTotal: 0 };
                const sellTotalPerScreen = totalProjectSell / (screenQty || 1);
                const sellProc = (comms.sellProcTotal || 0) / (screenQty || 1);
                const sellInstall = (comms.sellInstallTotal || 0) / (screenQty || 1);
                const sellStructure = (comms.sellStructureTotal || 0) / (screenQty || 1);

                const sellLEDBase = sellTotalPerScreen - sellProc - sellInstall - sellStructure;
                const sellSpares = sellLEDBase * 0.02;
                const sellLEDFinal = sellLEDBase - sellSpares;

                const commercialRows = [
                    { name: "LED Panel", rate: sellLEDFinal },
                    { name: "Processor", rate: sellProc },
                    { name: "Installation", rate: sellInstall },
                    { name: "Spares (2%)", rate: sellSpares },
                    { name: "Structure", rate: sellStructure },
                ].filter(r => r.rate > 0);

                return (
                    <div key={index} className="mb-10 pb-6 border-b-2 border-slate-100 break-inside-avoid print-break-avoid">
                        {isMultiScreen && (
                            <div className="mb-4 pb-2 border-b border-teal-500">
                                <h2 className="text-lg font-bold text-teal-800 uppercase">Configuration #{index + 1}</h2>
                            </div>
                        )}

                        {/* Project & Screen Details */}
                        <div className="grid grid-cols-2 gap-6 mb-6">
                            <div>
                                <h3 className="font-bold text-slate-700 uppercase border-b border-slate-300 mb-2">Project Details</h3>
                                <div className="grid grid-cols-3 gap-y-1 text-[11px]">
                                    <span className="font-semibold text-slate-500">Client:</span> <span className="col-span-2 font-bold">{clientName}</span>
                                    <span className="font-semibold text-slate-500">Project:</span> <span className="col-span-2 font-bold">{projectName}</span>
                                    <span className="font-semibold text-slate-500">Screen Size:</span> <span className="col-span-2">{screenWidthM}m (W) x {screenHeightM}m (H)</span>
                                    <span className="font-semibold text-slate-500">Quantity:</span> <span className="col-span-2">{screenQty} Nos</span>
                                </div>

                                <h3 className="font-bold text-slate-700 uppercase border-b border-slate-300 mt-4 mb-2">Module & Cabinet</h3>
                                <div className="grid grid-cols-3 gap-y-1 text-[11px]">
                                    <span className="font-semibold text-slate-500">Module:</span> <span className="col-span-2">{moduleType.brand} P{moduleType.pitch}</span>
                                    <span className="font-semibold text-slate-500">Mod Size:</span> <span className="col-span-2">{moduleType.width} x {moduleType.height} mm</span>
                                    <span className="font-semibold text-slate-500">Lamp:</span> <span className="col-span-2">{moduleType.lampMake || '-'}</span>
                                    <span className="font-semibold text-slate-500">Cabinet:</span> <span className="col-span-2">{cabinetType.material || 'Standard'}</span>
                                    <span className="font-semibold text-slate-500">Cab Size:</span> <span className="col-span-2">{cabinetType.width} x {cabinetType.height} mm</span>
                                </div>
                            </div>

                            <div>
                                <h3 className="font-bold text-slate-700 uppercase border-b border-slate-300 mb-2">Screen Specifications</h3>
                                <div className="grid grid-cols-3 gap-y-1 text-[11px]">
                                    <span className="font-semibold text-slate-500">Resolution:</span> <span className="col-span-2">{resW} x {resH} pixels</span>
                                    <span className="font-semibold text-slate-500">Total Area:</span> <span className="col-span-2">{areaSqft.toFixed(2)} Sq.ft / {areaSqm.toFixed(2)} Sq.m</span>
                                    <span className="font-semibold text-slate-500">Total Weight:</span> <span className="col-span-2">{totalWeight.toFixed(1)} kg</span>
                                    <span className="font-semibold text-slate-500">Avg Power:</span> <span className="col-span-2">{(avgPower).toFixed(0)} Watts</span>
                                    <span className="font-semibold text-slate-500">Max Power:</span> <span className="col-span-2">{(maxPower).toFixed(0)} Watts</span>
                                    <span className="font-semibold text-slate-500">Brightness:</span> <span className="col-span-2">{moduleType.brightness} nits</span>
                                    <span className="font-semibold text-slate-500">Refresh Rate:</span> <span className="col-span-2">{moduleType.refreshRate} Hz</span>
                                    <span className="font-semibold text-slate-500">Controller:</span> <span className="col-span-2">{processor ? `${processor.brand} ${processor.model}` : 'Standard'}</span>
                                    <span className="font-semibold text-slate-500">Viewing:</span> <span className="col-span-2">H: {moduleType.viewAngleH}° / V: {moduleType.viewAngleV}°</span>
                                    <span className="font-semibold text-slate-500">IP Rating:</span> <span className="col-span-2">Front: IP{moduleType.ipFront} / Back: IP{moduleType.ipBack}</span>
                                </div>
                            </div>
                        </div>

                        {/* Visualizer - Removed for Print Version, Kept for Preview if needed, but per request removed from logic here to keep aligned */}
                        {/* You can re-enable it for 'preview-version-container' only using simple logic if desired later */}

                        {/* Commercial Quote */}
                        <div className="mb-2 break-inside-avoid print-break-avoid">
                            <h3 className="font-bold text-slate-700 uppercase border-b border-slate-300 mb-2 pb-1">Commercial Proposal {isMultiScreen ? `(Config #${index + 1})` : ''}</h3>
                            <table className="w-full border-collapse border border-slate-300 text-[11px]">
                                <thead className="bg-slate-800 text-white">
                                    <tr>
                                        <th className="p-2 border border-slate-600 text-left w-12">#</th>
                                        <th className="p-2 border border-slate-600 text-left">Item Description</th>
                                        <th className="p-2 border border-slate-600 text-right w-32">Amount (1 Screen)</th>
                                        <th className="p-2 border border-slate-600 text-right w-32">Amount ({screenQty} Screens)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {commercialRows.map((row, i) => (
                                        <tr key={i}>
                                            <td className="p-2 border border-slate-300 text-center">{i + 1}</td>
                                            <td className="p-2 border border-slate-300 font-bold">{row.name}</td>
                                            <td className="p-2 border border-slate-300 text-right">{formatCurrency(row.rate, currency)}</td>
                                            <td className="p-2 border border-slate-300 text-right font-bold">{formatCurrency(row.rate * screenQty, currency)}</td>
                                        </tr>
                                    ))}
                                    <tr className="bg-slate-100">
                                        <td colSpan="3" className="p-2 border border-slate-300 text-right font-bold uppercase">Subtotal (Excl. GST)</td>
                                        <td className="p-2 border border-slate-300 text-right font-bold text-sm">{formatCurrency(totalProjectSell, currency)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}

            {/* Grand Total */}
            {isMultiScreen && (
                <div className="mb-8 break-inside-avoid print-break-avoid">
                    <div className="bg-slate-800 text-white p-4 rounded-lg flex justify-between items-center shadow-lg">
                        <div className="text-lg font-bold uppercase tracking-wide">Grand Total</div>
                        <div className="text-2xl font-bold">{formatCurrency(grandTotalProject, currency)} <span className="text-xs font-normal opacity-70">(Excl. GST)</span></div>
                    </div>
                </div>
            )}

            {/* Terms & Scope */}
            <div className="mt-8 break-inside-avoid print-break-avoid">
                <h3 className="font-bold text-slate-700 uppercase border-b border-slate-300 mb-2 pb-1">Terms & Conditions</h3>
                <div className="text-[10px] text-slate-600 space-y-3">
                    <div className="grid grid-cols-[100px_1fr] gap-y-2 gap-x-4">
                        <div className="font-bold text-slate-800">PRICE</div><div>{terms.price}</div>
                        <div className="font-bold text-slate-800">PAYMENT</div>
                        <div>{(terms.payment || []).map((p, i) => <span key={i}>{p.percent}% {p.name}{i < (terms.payment || []).length - 1 ? ', ' : ''}</span>)}</div>
                        <div className="font-bold text-slate-800">DELIVERY</div><div>{terms.deliveryWeeks} weeks</div>
                        <div className="font-bold text-slate-800">GST</div>
                        <div>Extra as applicable (currently {CONFIG.DEFAULTS.GST_RATE}%)</div>
                        <div className="font-bold text-slate-800">WARRANTY</div>
                        <div className="text-justify leading-snug">{CONFIG.TEXT.WARRANTY}</div>
                    </div>
                </div>

                <h3 className="font-bold text-slate-700 uppercase border-b border-slate-300 mt-4 mb-2 pb-1">Client's Scope</h3>
                <div className="text-[10px] text-slate-600 grid gap-y-2">
                    <div><span className="font-bold text-slate-800 block">Structure:</span>{CONFIG.TEXT.SCOPE_STRUCTURE}</div>
                    <div><span className="font-bold text-slate-800 block">Electricity:</span>{CONFIG.TEXT.SCOPE_ELEC}</div>
                    <div><span className="font-bold text-slate-800 block">Internet:</span>{CONFIG.TEXT.SCOPE_NET}</div>
                    <div><span className="font-bold text-slate-800 block">Software:</span>{CONFIG.TEXT.SCOPE_SOFT}</div>
                    <div><span className="font-bold text-slate-800 block">Permissions:</span>{CONFIG.TEXT.SCOPE_PERM}</div>
                    <div><span className="font-bold text-slate-800 block">Computer:</span>{CONFIG.TEXT.SCOPE_PC}</div>
                    <div><span className="font-bold text-slate-800 block">Validity:</span>{CONFIG.TEXT.VALIDITY}</div>
                </div>

                <div className="mt-8 pt-8 border-t border-slate-200 flex justify-between items-end">
                    <div className="text-center">
                        <div className="h-12 mb-2"></div>
                        <p className="text-[10px] font-bold border-t border-slate-400 px-4 pt-1">Client Acceptance</p>
                    </div>
                    <div className="text-center">
                        <div className="h-12 mb-2"></div>
                        <p className="text-[10px] font-bold border-t border-slate-400 px-4 pt-1">For Admire Sign & Display Pvt. Ltd.</p>
                    </div>
                </div>
            </div>
        </div>
    );

    // 4. Return Dual Output (Preview & Portal Print)
    return (
        <React.Fragment>
            {/* Note: CSS is now handled globally in index.css */}

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

export default PrintLayout;