// src/lib/utils.js

export const formatCurrency = (amount, currency = 'INR', compact = false, dynamicDecimals = false) => {
    let minFraction = 0;
    let maxFraction = 0;

    if (compact) {
        maxFraction = 1;
    } else if (dynamicDecimals) {
        // If it's a whole number, show 0 decimals. If it has decimals, show 2.
        const isWhole = amount % 1 === 0;
        minFraction = isWhole ? 0 : 2;
        maxFraction = isWhole ? 0 : 2;
    } else {
        // Default behavior: No decimals for standard view
        minFraction = 0;
        maxFraction = 0;
    }

    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: minFraction,
        maximumFractionDigits: maxFraction,
        notation: compact ? "compact" : "standard"
    }).format(amount);
};

export const generateId = () => Math.random().toString(36).substr(2, 9).toUpperCase();

// Helper: Shared Calculation Logic
export const calculateBOM = (state, inventory, transactions, exchangeRate) => {
    // Safety check for empty inputs
    if (!state || !inventory) return null;

    // 1. Destructure state, but rename screenQty to rawScreenQty to avoid naming conflict
    const {
        screenQty: rawScreenQty, targetWidth, targetHeight, unit,
        selectedIndoor, assemblyMode, selectedPitch, selectedModuleId,
        selectedCabinetId, selectedCardId, selectedSMPSId, selectedProcId,
        sizingMode, readyId, margin, extras, overrides, extraComponents,
        pricingMode, targetSellPrice, commercials, terms
    } = state;

    // 2. Force convert quantity to Number immediately
    const screenQty = Number(rawScreenQty || 1);

    const getPriceInInr = (item) => {
        if (!item) return 0;
        const basePrice = Number(item.price || 0);
        const carriage = Number(item.carriage || 0);
        const totalBase = basePrice + carriage;
        if (item.currency === 'USD') return totalBase * exchangeRate;
        return totalBase;
    };

    let module, cabinet, card, psu, proc;
    let totalModules = 0;

    if (assemblyMode === 'assembled') {
        module = inventory.find(i => i.id === selectedModuleId);
        cabinet = inventory.find(i => i.id === selectedCabinetId);
        card = inventory.find(i => i.id === selectedCardId);
        psu = inventory.find(i => i.id === selectedSMPSId);
        proc = inventory.find(i => i.id === selectedProcId);
        if (!module || !cabinet) return null;
    } else {
        const readyUnit = inventory.find(i => i.id === readyId);
        proc = inventory.find(i => i.id === selectedProcId);
        if (!readyUnit) return null;
        module = readyUnit;
        cabinet = readyUnit;
    }

    // Dimensions
    const w_mm = unit === 'm' ? targetWidth * 1000 : targetWidth * 304.8;
    const h_mm = unit === 'm' ? targetHeight * 1000 : targetHeight * 304.8;

    // Sizing Logic
    const rawCols = w_mm / cabinet.width;
    const rawRows = h_mm / cabinet.height;
    let cols, rows;
    if (sizingMode === 'up') { cols = Math.ceil(rawCols); rows = Math.ceil(rawRows); }
    else if (sizingMode === 'down') { cols = Math.max(1, Math.floor(rawCols)); rows = Math.max(1, Math.floor(rawRows)); }
    else { cols = Math.max(1, Math.round(rawCols)); rows = Math.max(1, Math.round(rawRows)); }

    const finalW_mm = cols * cabinet.width;
    const finalH_mm = rows * cabinet.height;
    const totalCabinetsPerScreen = cols * rows;

    // Area Calculation
    const areaSqFt = (finalW_mm * finalH_mm) / 92903;

    // --- BUILD ITEM LIST ---
    let rawItems = [];
    if (assemblyMode === 'assembled') {
        const modsPerCab = (Math.floor(cabinet.width / module.width) * Math.floor(cabinet.height / module.height));
        totalModules = totalCabinetsPerScreen * modsPerCab;

        // Calculate SMPS Quantity based on Power
        let totalSMPS = totalCabinetsPerScreen; // Default fallback
        let smpsPerCab = 1;

        if (module.maxPower && psu && psu.amps && psu.voltage) {
            // 1. Calculate Cabinet Area in Sqm
            const cabAreaSqm = (cabinet.width / 1000) * (cabinet.height / 1000);

            // 2. Calculate Max Power per Cabinet (Watts)
            const maxPowerPerCabinet = cabAreaSqm * Number(module.maxPower);

            // 3. Calculate SMPS Capacity (Watts)
            const smpsCapacity = Number(psu.amps) * Number(psu.voltage);

            // 4. Determine SMPS needed per cabinet (Rounded Up)
            if (smpsCapacity > 0) {
                smpsPerCab = Math.ceil(maxPowerPerCabinet / smpsCapacity);
                totalSMPS = smpsPerCab * totalCabinetsPerScreen;
            }
        }

        rawItems = [
            { id: 'modules', inventoryId: selectedModuleId, name: 'Modules', spec: `${module.brand} ${module.model}`, qty: totalModules, unit: getPriceInInr(module), total: totalModules * getPriceInInr(module), type: 'led' },
            { id: 'cabinets', inventoryId: selectedCabinetId, name: 'Cabinets', spec: `${cabinet.brand} ${cabinet.model}`, qty: totalCabinetsPerScreen, unit: getPriceInInr(cabinet), total: totalCabinetsPerScreen * getPriceInInr(cabinet), type: 'led' },
            { id: 'cards', inventoryId: selectedCardId, name: 'Cards', spec: card ? card.brand : '-', qty: totalCabinetsPerScreen, unit: getPriceInInr(card), total: totalCabinetsPerScreen * getPriceInInr(card), type: 'led' },
            {
                id: 'smps',
                inventoryId: selectedSMPSId,
                name: 'SMPS',
                spec: psu ? `${psu.brand} (${smpsPerCab}/cab)` : '-',
                qty: totalSMPS,
                unit: getPriceInInr(psu),
                total: totalSMPS * getPriceInInr(psu),
                type: 'led'
            },
        ];
    } else {
        rawItems = [
            { id: 'ready', inventoryId: readyId, name: 'LED Panels (Ready)', spec: `${cabinet.brand} ${cabinet.model}`, qty: totalCabinetsPerScreen, unit: getPriceInInr(cabinet), total: totalCabinetsPerScreen * getPriceInInr(cabinet), type: 'led' }
        ];
        totalModules = totalCabinetsPerScreen;
    }
    // Always include processor row so it remains visible in the Cost Sheet UI
    rawItems.push({
        id: 'processor',
        inventoryId: selectedProcId,
        name: 'Processor',
        spec: proc ? proc.brand : 'Select Processor',
        qty: 1,
        unit: proc ? getPriceInInr(proc) : 0,
        total: proc ? getPriceInInr(proc) : 0,
        type: 'service'
    });

    // Add Extra Components
    if (extraComponents && extraComponents.length > 0) {
        extraComponents.forEach(extra => {
            const invItem = inventory.find(i => i.id === extra.componentId);
            if (invItem) {
                const extraQty = extra.type === 'cabinet' ? (extra.qty * totalCabinetsPerScreen) : extra.qty;
                rawItems.push({
                    id: extra.id,
                    inventoryId: extra.componentId,
                    name: `Extra: ${invItem.type}`,
                    spec: `${invItem.brand} ${invItem.model}`,
                    qty: extraQty,
                    unit: getPriceInInr(invItem),
                    total: extraQty * getPriceInInr(invItem),
                    type: invItem.type === 'processor' ? 'service' : 'led' // Categorize extra components
                });
            } else {
                // Show placeholder for newly added (empty) extras
                rawItems.push({
                    id: extra.id,
                    inventoryId: '',
                    name: 'Extra Component',
                    spec: 'Select Item...',
                    qty: extra.qty || 1,
                    unit: 0,
                    total: 0,
                    type: 'led'
                });
            }
        });
    }

    // --- APPLY OVERRIDES ---
    const finalItems = rawItems.map(item => {
        if (overrides && overrides[item.id]) {
            const ov = overrides[item.id];
            const finalQty = ov.qty !== undefined && ov.qty !== '' ? Number(ov.qty) : item.qty;
            const finalRate = ov.rate !== undefined && ov.rate !== '' ? Number(ov.rate) : item.unit;
            return { ...item, qty: finalQty, unit: finalRate, total: finalQty * finalRate, isOverridden: true };
        }
        return item;
    });

    // --- SPLIT COSTS: LED vs SERVICES ---
    const ledItemsTotal = finalItems.filter(i => i.type === 'led').reduce((acc, i) => acc + i.total, 0);
    const serviceItemsTotal = finalItems.filter(i => i.type !== 'led').reduce((acc, i) => acc + i.total, 0);

    // Extras: Split logic
    const calculatedExtras = {};
    let ledOpsCost = 0;
    let serviceOpsCost = 0;

    // 1. Dynamic Panel Extras (Array)
    if (Array.isArray(extras)) {
        extras.forEach(item => {
            let val = 0;
            const baseForPct = ledItemsTotal;
            if (item.type === 'pct') val = baseForPct * (Number(item.val) / 100);
            else val = Number(item.val);

            // Store by ID for tracking
            calculatedExtras[item.id] = val;
            ledOpsCost += val;
        });
    }

    // 2. Fixed Service Costs (From Commercials/Fixed State)
    const installCostData = commercials?.installation || { cost: 0, costType: 'abs' };
    let installCostVal = 0;
    if (installCostData.costType === 'pct') installCostVal = serviceItemsTotal * (Number(installCostData.cost) / 100);
    else {
        const mode = installCostData.unit || 'sqft';
        if (mode === 'sqft') installCostVal = Number(installCostData.cost) * areaSqFt;
        else installCostVal = Number(installCostData.cost);
    }
    calculatedExtras['install'] = installCostVal;
    serviceOpsCost += installCostVal;

    const structCostData = commercials?.structure || { cost: 0, costType: 'abs' };
    let structCostVal = 0;
    if (structCostData.costType === 'pct') structCostVal = serviceItemsTotal * (Number(structCostData.cost) / 100);
    else {
        const mode = structCostData.unit || 'sqft';
        if (mode === 'sqft') structCostVal = Number(structCostData.cost) * areaSqFt;
        else structCostVal = Number(structCostData.cost);
    }
    calculatedExtras['structure'] = structCostVal;
    serviceOpsCost += structCostVal;

    // COST TOTALS (Per Screen)
    const costLEDPerScreen = ledItemsTotal + ledOpsCost;
    const costServicesPerScreen = serviceItemsTotal + serviceOpsCost;
    const costPerScreenTotal = costLEDPerScreen + costServicesPerScreen;

    const totalProjectCost = costPerScreenTotal * screenQty;

    // --- COMMERCIALS / SELL PRICE LOGIC ---
    const comms = commercials || { processor: { val: 0 }, installation: { val: 0 }, structure: { val: 0 } };

    let sellProcTotal = 0;
    if (comms.processor.unit === 'unit') {
        const procItem = finalItems.find(i => i.id === 'processor');
        const procQty = procItem ? procItem.qty : 1;
        sellProcTotal = Number(comms.processor.val) * procQty * screenQty;
    } else {
        sellProcTotal = Number(comms.processor.val) * screenQty;
    }

    let sellInstallTotal = 0;
    if (comms.installation.unit === 'sqft') {
        sellInstallTotal = Number(comms.installation.val) * areaSqFt * screenQty;
    } else {
        sellInstallTotal = Number(comms.installation.val) * screenQty;
    }

    let sellStructureTotal = 0;
    if (comms.structure.unit === 'sqft') {
        sellStructureTotal = Number(comms.structure.val) * areaSqFt * screenQty;
    } else {
        sellStructureTotal = Number(comms.structure.val) * screenQty;
    }

    const totalServiceSell = sellProcTotal + sellInstallTotal + sellStructureTotal;
    const sellServicesPerScreen = totalServiceSell / screenQty;

    // 2. Calculate LED Panel Sell Price
    let sellLEDPerScreen = 0;
    let effectiveMargin = margin;
    const mode = pricingMode || 'margin';

    if (mode === 'margin') {
        sellLEDPerScreen = costLEDPerScreen * (1 + margin / 100);
    } else {
        const target = Number(targetSellPrice || 0);
        if (mode === 'screen') sellLEDPerScreen = target;
        else if (mode === 'sqft') sellLEDPerScreen = target * areaSqFt;
        else if (mode === 'sqm') sellLEDPerScreen = target * (areaSqFt / 10.7639);

        if (costLEDPerScreen > 0) effectiveMargin = ((sellLEDPerScreen - costLEDPerScreen) / costLEDPerScreen) * 100;
        else effectiveMargin = 0;
    }

    const totalLEDSell = sellLEDPerScreen * screenQty;
    const totalProjectSell = totalLEDSell + totalServiceSell;
    const totalMargin = totalProjectSell - totalProjectCost;

    return {
        gridCols: cols, gridRows: rows,
        finalWidth: (finalW_mm / 1000).toFixed(2), finalHeight: (finalH_mm / 1000).toFixed(2),
        totalCabinets: totalCabinetsPerScreen, moduleType: module, cabinetType: cabinet, processor: proc,
        breakdown: {
            qtyModules: totalModules,
            ledOps: ledOpsCost,
            serviceOps: serviceOpsCost
        },
        detailedItems: finalItems, calculatedExtras,

        // Costs
        costLEDPerScreen,
        costServicesPerScreen,
        costPerScreen: costPerScreenTotal,
        totalProjectCost,

        // Sales
        finalPrice: totalProjectSell,
        totalProjectSell,

        assemblyMode,
        // 3. Return the numeric screenQty, so external components use the Number, not String
        screenQty,
        commercials: { sellProcTotal, sellInstallTotal, sellStructureTotal },
        terms: terms || { price: 'Ex-works Mumbai', deliveryWeeks: 10, payment: [] },

        // Matrix for UI
        matrix: {
            cost: { sqft: costPerScreenTotal / areaSqFt, unit: costPerScreenTotal, total: totalProjectCost },
            margin: { sqft: (totalMargin / screenQty) / areaSqFt, unit: (totalMargin / screenQty), total: totalMargin },
            sell: { sqft: (totalProjectSell / screenQty) / areaSqFt, unit: (totalProjectSell / screenQty), total: totalProjectSell },

            // Specific LED Panel Metrics
            led: {
                cost: costLEDPerScreen,
                sell: sellLEDPerScreen,
                margin: sellLEDPerScreen - costLEDPerScreen,
                marginPct: effectiveMargin
            },

            sqft: { perScreen: areaSqFt, total: areaSqFt * screenQty }
        }
    };
};