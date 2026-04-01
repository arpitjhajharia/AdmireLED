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

export const formatComponentSpecs = (item) => {
    const specs = [];
    if (!item) return [];

    if (item.type === 'module' || item.type === 'ready') {
        if (item.series) specs.push(item.series);
        if (item.pitch) specs.push(`P${item.pitch}`);
        if (item.type === 'ready' && item.material) specs.push(item.material);
        specs.push(item.indoor === 'true' || item.indoor === true ? 'Indoor' : 'Outdoor');
        if (item.ledType) specs.push(item.ledType);
        if (item.lampMake) specs.push(item.lampMake);
        if (item.width && item.height) specs.push(`${item.width}×${item.height}mm`);
        if (item.brightness) specs.push(`${item.brightness} nits`);
        if (item.refreshRate) specs.push(`${item.refreshRate} Hz`);
        if (item.avgPower) specs.push(`Avg: ${item.avgPower}W`);
        if (item.maxPower) specs.push(`Max: ${item.maxPower}W`);
        if (item.contrast) specs.push(`Contrast: ${item.contrast}`);
        if (item.viewAngleH && item.viewAngleV) specs.push(`VA: ${item.viewAngleH}°/${item.viewAngleV}°`);
        if (item.ipFront || item.ipBack) specs.push(`IP: ${item.ipFront}/${item.ipBack}`);
        if (item.weight) specs.push(`${item.weight}kg`);
        if (item.warrantyPeriod) specs.push(`Warranty: ${item.warrantyPeriod} yr${item.warrantyPeriod > 1 ? 's' : ''}`);
        if (item.maintenance) specs.push(`Maint: ${item.maintenance}`);
    } else if (item.type === 'cabinet') {
        if (item.material) specs.push(item.material);
        specs.push(item.indoor === 'true' || item.indoor === true ? 'Indoor' : 'Outdoor');
        if (item.width && item.height) specs.push(`${item.width}×${item.height}mm`);
        if (item.weight) specs.push(`${item.weight}kg`);
    } else if (item.type === 'smps') {
        if (item.amps) specs.push(`${item.amps}A`);
        if (item.voltage) specs.push(`${item.voltage}V`);
    } else if (item.type === 'card' || item.type === 'processor') {
        if (item.ports) specs.push(`${item.ports} ports/capacity`);
    } else if (['frc_cable', 'power_cable'].includes(item.type)) {
        if (item.ports) specs.push(`${item.ports} pins`);
        if (item.length) specs.push(`${item.length}mm`);
    } else if (['screw', 'bolt'].includes(item.type)) {
        if (item.material) specs.push(item.material);
        if (item.size) specs.push(item.size);
        if (item.length) specs.push(`${item.length}mm`);
    } else if (item.type === 'gasket') {
        if (item.width) specs.push(`W: ${item.width}mm`);
        if (item.length) specs.push(`L: ${item.length}mm`);
    } else if (item.type === 'tool') {
        if (item.material) specs.push(item.material);
    }
    return specs;
};

export const generateId = () => Math.random().toString(36).substr(2, 9).toUpperCase();

/**
 * Gets the Indian financial year string (e.g., "26-27") for a given date.
 * Financial year starts on April 1st.
 */
export const getFinancialYear = (date = new Date()) => {
    const d = new Date(date);
    const m = d.getMonth() + 1; // 1-indexed (Jan=1, Apr=4)
    const y = d.getFullYear();
    const startYear = m >= 4 ? y : y - 1;
    const endYear = startYear + 1;
    return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
};

/**
 * Formats a sequence number and FY into the ASD/###/YY-YY format.
 */
export const formatQuoteRef = (seq, fy) => {
    const padded = String(seq).padStart(3, '0');
    return `ASD/${padded}/${fy}`;
};


// Helper: Shared Calculation Logic
export const calculateBOM = (state, inventory, transactions, exchangeRate) => {
    // Safety check for empty inputs
    if (!state || !inventory) return null;

    // 1. Destructure state, but rename screenQty to rawScreenQty to avoid naming conflict
    const {
        screenQty: rawScreenQty, targetWidth, targetHeight, unit,
        assemblyMode, selectedModuleId,
        selectedCabinetId, selectedCardId,
        selectedSMPSId,   // legacy single-select (kept for backward compat)
        selectedSMPSIds,  // new multi-select array
        selectedProcId,
        sizingMode, readyId, margin, extras, overrides, extraComponents,
        pricingMode, targetSellPrice, commercials, terms
    } = state;

    // Normalise: prefer the new array; fall back to legacy single id
    const activeSMPSIds = Array.isArray(selectedSMPSIds) && selectedSMPSIds.length > 0
        ? selectedSMPSIds
        : (selectedSMPSId ? [selectedSMPSId] : []);

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

    let module, cabinet, card, proc;
    let totalModules = 0;

    if (assemblyMode === 'assembled') {
        module = inventory.find(i => i.id === selectedModuleId);
        cabinet = inventory.find(i => i.id === selectedCabinetId);
        card = inventory.find(i => i.id === selectedCardId);
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

        // ── SMPS Optimisation ──────────────────────────────────────────────────
        // Resolve selected SMPS objects
        const smpsOptions = activeSMPSIds
            .map(id => inventory.find(i => i.id === id))
            .filter(Boolean)
            .filter(i => Number(i.amps) > 0 && Number(i.voltage) > 0)
            .map(i => ({
                id: i.id,
                brand: i.brand,
                model: i.model,
                capacity: Number(i.amps) * Number(i.voltage), // Watts
                price: getPriceInInr(i)
            }));

        // Cabinet wattage requirement
        const cabAreaSqm = (cabinet.width / 1000) * (cabinet.height / 1000);
        const maxPowerPerCabinet = module.maxPower ? cabAreaSqm * Number(module.maxPower) : 0;

        /**
         * optimiseSmps(required, options)
         *
         * Dynamic-programming minimum-cost solver (unbounded knapsack / coin-change).
         *
         * For every integer wattage level w from 0 to (reqW + maxCapacity) the DP
         * tracks the cheapest SMPS combination that totals EXACTLY w watts. We then
         * scan all levels ≥ reqW and pick the one with the lowest total cost.
         *
         * This guarantees the globally optimal mix, e.g.:
         *   700W need  |  200W @ ₹600,  300W @ ₹800
         *   → 2×200W + 1×300W = 700W  → ₹2000  ✓  (not 2×300W+1×200W = 800W → ₹2200)
         */
        const optimiseSmps = (required, options) => {
            if (!options.length || required <= 0) return [];

            // Work with integer watts (round required up so we never under-supply)
            const reqW = Math.ceil(required);

            // The worst-case overshoot is by at most one full SMPS unit, so we only
            // need to search up to reqW + maxCapacity.
            const maxCap = Math.max(...options.map(o => o.capacity));
            const maxW = reqW + maxCap;

            const INF = Infinity;

            // dp[w]   = minimum total cost to cover EXACTLY w watts
            // from[w] = id of the SMPS option last added to reach w
            const dp   = new Float64Array(maxW + 1).fill(INF);
            const from = new Array(maxW + 1).fill(null);
            dp[0] = 0;

            for (let w = 1; w <= maxW; w++) {
                for (const opt of options) {
                    const prev = w - opt.capacity;
                    if (prev >= 0 && dp[prev] !== INF) {
                        const cost = dp[prev] + opt.price;
                        if (cost < dp[w]) {
                            dp[w]   = cost;
                            from[w] = opt.id;
                        }
                    }
                }
            }

            // Find the cheapest feasible level (covering ≥ reqW watts)
            let bestW    = -1;
            let bestCost = INF;
            for (let w = reqW; w <= maxW; w++) {
                if (dp[w] < bestCost) {
                    bestCost = dp[w];
                    bestW    = w;
                }
            }

            if (bestW === -1) return []; // No solution found (shouldn't happen)

            // Backtrack through `from` to count how many of each option were used
            const counts = {};
            options.forEach(o => { counts[o.id] = 0; });
            let w = bestW;
            while (w > 0 && from[w] !== null) {
                const optId = from[w];
                counts[optId]++;
                const opt = options.find(o => o.id === optId);
                w -= opt.capacity;
            }

            return options
                .map(o => ({ ...o, count: counts[o.id] }))
                .filter(o => o.count > 0);
        };

        // Build SMPS rows for the BOM
        let smpsRows = [];
        if (smpsOptions.length > 0 && maxPowerPerCabinet > 0) {
            const mixPerCab = optimiseSmps(maxPowerPerCabinet, smpsOptions);
            mixPerCab.forEach((s, idx) => {
                const totalForType = s.count * totalCabinetsPerScreen;
                smpsRows.push({
                    id: idx === 0 ? 'smps' : `smps_${idx}`,  // first keeps legacy id
                    inventoryId: s.id,
                    name: idx === 0 ? 'SMPS' : 'SMPS (mix)',
                    spec: `${s.brand} ${s.model} (${s.count}/cab)`,
                    qty: totalForType,
                    unit: s.price,
                    total: totalForType * s.price,
                    type: 'led'
                });
            });
        } else if (smpsOptions.length === 0) {
            // No SMPS selected – keep placeholder
            smpsRows.push({
                id: 'smps',
                inventoryId: '',
                name: 'SMPS',
                spec: '-',
                qty: 0,
                unit: 0,
                total: 0,
                type: 'led'
            });
        }
        // ── End SMPS Optimisation ──────────────────────────────────────────────

        rawItems = [
            { id: 'modules', inventoryId: selectedModuleId, name: 'Modules', spec: `${module.brand} ${module.model}`, qty: totalModules, unit: getPriceInInr(module), total: totalModules * getPriceInInr(module), type: 'led', warranty: module.warrantyPeriod },
            { id: 'cabinets', inventoryId: selectedCabinetId, name: 'Cabinets', spec: `${cabinet.brand} ${cabinet.model}`, qty: totalCabinetsPerScreen, unit: getPriceInInr(cabinet), total: totalCabinetsPerScreen * getPriceInInr(cabinet), type: 'led' },
            { id: 'cards', inventoryId: selectedCardId, name: 'Cards', spec: card ? card.brand : '-', qty: totalCabinetsPerScreen, unit: getPriceInInr(card), total: totalCabinetsPerScreen * getPriceInInr(card), type: 'led' },
            ...smpsRows,
        ];
    } else {
        rawItems = [
            { id: 'ready', inventoryId: readyId, name: 'LED Panels (Ready)', spec: `${cabinet.brand} ${cabinet.model}`, qty: totalCabinetsPerScreen, unit: getPriceInInr(cabinet), total: totalCabinetsPerScreen * getPriceInInr(cabinet), type: 'led', warranty: cabinet.warrantyPeriod }
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
            const finalWarranty = ov.warranty !== undefined && ov.warranty !== '' ? Number(ov.warranty) : item.warranty;
            return {
                ...item,
                qty: finalQty,
                unit: finalRate,
                total: finalQty * finalRate,
                warranty: finalWarranty,
                isOverridden: true
            };
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
    // Removed unused sellServicesPerScreen

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

    const ledRow = finalItems.find(i => i.id === 'modules' || i.id === 'ready');
    const finalWarrantyValue = ledRow?.warranty !== undefined ? ledRow.warranty : (module ? (module.warrantyPeriod || 0) : 0);

    return {
        gridCols: cols, gridRows: rows,
        finalWidth: (finalW_mm / 1000).toFixed(2), finalHeight: (finalH_mm / 1000).toFixed(2),
        totalCabinets: totalCabinetsPerScreen, moduleType: module, cabinetType: cabinet, processor: proc,
        finalWarranty: finalWarrantyValue,
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
        commercials: {
            sellProcTotal, sellInstallTotal, sellStructureTotal,
            installationUnit: comms.installation?.unit || 'sqft',
            installationVal: Number(comms.installation?.val || 0),
            structureUnit: comms.structure?.unit || 'sqft',
            structureVal: Number(comms.structure?.val || 0),
            processorUnit: comms.processor?.unit || 'unit',
            processorVal: Number(comms.processor?.val || 0),
        },
        pricingMode: mode,
        targetSellPrice: Number(targetSellPrice || 0),
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