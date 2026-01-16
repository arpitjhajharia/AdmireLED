// src/lib/config.js

export const CONFIG = {
    COMPANY: {
        NAME: "ADMIRE SIGN & DISPLAY PVT. LTD.",
        ADDRESS_1: "102, Priya Industrial Estate 4, K.T. Industrial Estate",
        ADDRESS_2: "Kherpada, Waliv, Vasai East, Mumbai - 401208",
        EMAIL: "info@admiresign.com",
        WEB: "www.admiresign.com"
    },
    DEFAULTS: {
        EXCHANGE_RATE: 90,
        GST_RATE: 18,
        DELIVERY_WEEKS: 10,
        PRICE_BASIS: "Ex-works Mumbai",
        PAYMENT_TERMS: [
            { name: "Advance with PO", percent: 60 },
            { name: "Before dispatch", percent: 30 },
            { name: "After installation", percent: 10 }
        ]
    },
    TEXT: {
        WARRANTY: "Against any manufacturing defect. Offsite support for troubleshooting. Client can sign up for Admire’s excellent AMC services for on-site support. Serious fault will be attended to by our technical team within 48-72 hours upon receipt of written complaints with pictures/videos of the fault. 2% Extra spares includes Modules, Power Supply, Receiver Card (if there are over 100 cabinets), Flat cables, 5V connectors, Power and Data Cable. Any damage to the screen due to force majure, natural disasters, electricity surge, earthing, accident, etc is not covered under the warranty. Power supplies damage due to power fluctuation will not be covered under warranty. Power supply will be under the direct warranty of the OEM supplier. If the repair requires additional components then these will be charged extra. Brightness control meter, Video Processor & Timer can be supplied at extra cost. Maintenance team visit in six months during warranty period.",
        SCOPE_STRUCTURE: "Foundation & Structure. Structural stability certificate from a consultant. For wall mounted outdoor screen, Client to ensure strong and solid brick wall, RCC beams and column base. For front access indoor screen, Client to ensure a strong base. Indoor Structures cannot be mounted on ACP Sheets, Gypsum boards etc. Scaffolding, Aluminium composite panelling if required. Personnel for troubleshooting training during the screen installation. Helpers for loading, unloading and installing the display at site.",
        SCOPE_ELEC: "Electricity 3 phase electric power near the site, not more than 5m from the site, before the commencement of work. Electrical distribution board within 5m from the screen. Conduited electrical cable. 4mm 2 core armored cable or 4mm 3 core cables, 32 ampere MCB, 1 switch board with 2 sockets. Good quality Stabiliser and timers. 1 Certified electrical engineer for all connections from power Main to the unit. Ventilation machineries such as Air Conditioners or Fans.",
        SCOPE_NET: "CAT 6 or Optic Fiber Data cable and its terminations. Data points near the screen. Space with power sockets for Video wall Controllers. Data source/AV room within 80 meters of the screen. Connections to be availed through CAT 6 cables duly terminated with RJ45. If the length is farther then Fiber optic converter will be required. Fiber optic converters, if required, will be charged extra. In case the fiber optic converter is required, single mode Fiber optic cable is to be provided by client from source point to the display, terminated as per specs with Patch Chords from the splicing unit to connect to screen.",
        SCOPE_SOFT: "3rd party Software for Content upload on screen will be provided by the controller card supplier. Admire cannot provide regular updates and application stability.",
        SCOPE_PERM: "All permissions such as PTW, work permits & gate passes for workers, engineers and executives.",
        SCOPE_PC: "As per specification, to be arranged by client.",
        VALIDITY: "30 days."
    }
};