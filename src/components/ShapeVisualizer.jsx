import React from 'react';

// ── Palette ───────────────────────────────────────────────────────────────────
const DC  = '#1e40af'; // dimension / annotation blue
const SF  = '#c8d3db'; // shape fill
const SS  = '#475569'; // shape stroke
const HF  = '#eef2f7'; // void (hole) fill
const LC  = '#94a3b8'; // centerline
const LBG = 'white';   // label background

const lv = (v) => (v && Number(v) > 0) ? String(v) : '?';

// ── Primitives ────────────────────────────────────────────────────────────────

// Single arrowhead at (x,y) pointing in direction (dx,dy)
const Tip = ({ x, y, dx, dy }) => {
  const L = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / L, dy / L];
  const [pw, pl] = [2.4, 5];
  return (
    <polygon
      points={`${x},${y} ${x - pl*ux + pw*uy},${y - pl*uy - pw*ux} ${x - pl*ux - pw*uy},${y - pl*uy + pw*ux}`}
      fill={DC} stroke="none"
    />
  );
};

// Double-arrow dimension line with label at midpoint in white box
const Dim = ({ x1, y1, x2, y2, lbl }) => {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  if (L < 4) return null;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const bw = Math.max(lbl.length * 5.5, 28), bh = 11;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={DC} strokeWidth={0.8} fill="none" />
      <Tip x={x1} y={y1} dx={x1 - x2} dy={y1 - y2} />
      <Tip x={x2} y={y2} dx={dx} dy={dy} />
      <rect x={mx - bw/2} y={my - bh/2} width={bw} height={bh} fill={LBG} fillOpacity={0.92} rx={2} />
      <text x={mx} y={my} fontSize={7.5} fill={DC} fontFamily="monospace" fontWeight="bold"
        textAnchor="middle" dominantBaseline="middle">{lbl}</text>
    </g>
  );
};

// Extension / witness line (thin, solid)
const Ext = ({ x1, y1, x2, y2 }) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={DC} strokeWidth={0.5} fill="none" />
);

// Centerline (dash-dot)
const CL = ({ x1, y1, x2, y2 }) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2}
    stroke={LC} strokeWidth={0.7} strokeDasharray="8,3,2,3" fill="none" />
);

// Small leader: dashed line + arrowhead at (x2,y2) pointing toward shape
const Leader = ({ x1, y1, x2, y2, lbl }) => {
  const bw = Math.max(lbl.length * 5.5, 28);
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={DC} strokeWidth={0.6} strokeDasharray="3,2" fill="none" />
      <Tip x={x2} y={y2} dx={x2 - x1} dy={y2 - y1} />
      <rect x={x1 - bw/2} y={y1 - 6} width={bw} height={11} fill={LBG} fillOpacity={0.92} rx={2} />
      <text x={x1} y={y1} fontSize={7.5} fill={DC} fontFamily="monospace" fontWeight="bold"
        textAnchor="middle" dominantBaseline="middle">{lbl}</text>
    </g>
  );
};

// Horizontal dim with vertical extension lines
const DimH = ({ x1, x2, yShape, yDim, lbl }) => (
  <g>
    <Ext x1={x1} y1={yShape} x2={x1} y2={yDim + (yDim < yShape ? 3 : -3)} />
    <Ext x1={x2} y1={yShape} x2={x2} y2={yDim + (yDim < yShape ? 3 : -3)} />
    <Dim x1={x1} y1={yDim} x2={x2} y2={yDim} lbl={lbl} />
  </g>
);

// Vertical dim with horizontal extension lines
const DimV = ({ y1, y2, xShape, xDim, lbl }) => (
  <g>
    <Ext x1={xShape} y1={y1} x2={xDim + (xDim < xShape ? 3 : -3)} y2={y1} />
    <Ext x1={xShape} y1={y2} x2={xDim + (xDim < xShape ? 3 : -3)} y2={y2} />
    <Dim x1={xDim} y1={y1} x2={xDim} y2={y2} lbl={lbl} />
  </g>
);

// Shape & hole shared props
const shp = { fill: SF, stroke: SS, strokeWidth: 1.5 };
const hlp = { fill: HF, stroke: SS, strokeWidth: 1.0 };

// Caption line at the bottom
const Caption = ({ text }) => (
  <text x={100} y={164} fontSize={7} fill={LC} textAnchor="middle"
    fontFamily="sans-serif" fontStyle="italic">{text}</text>
);

// ── SVG Wrapper ───────────────────────────────────────────────────────────────
const SVG = ({ children }) => (
  <svg viewBox="0 0 200 170" className="w-full h-auto select-none" style={{ maxHeight: 170 }}>
    <rect x={0} y={0} width={200} height={170} fill="#f8fafc" rx={6} />
    {children}
  </svg>
);

// ── Per-shape renderers ───────────────────────────────────────────────────────

const FlatPlate = ({ s }) => {
  const [x1, y1, x2, y2] = [35, 72, 165, 110];
  return (
    <SVG>
      <rect x={x1} y={y1} width={x2-x1} height={y2-y1} {...shp} />
      {/* Width annotation above */}
      <DimH x1={x1} x2={x2} yShape={y1} yDim={y1-14} lbl={`W=${lv(s.width)}`} />
      {/* Thickness annotation right */}
      <DimV y1={y1} y2={y2} xShape={x2} xDim={x2+16} lbl={`T=${lv(s.thickness)}`} />
      {/* Length note */}
      <text x={100} y={135} fontSize={7.5} fill={DC} fontFamily="monospace"
        textAnchor="middle" dominantBaseline="middle" fontWeight="bold">L={lv(s.length)}</text>
      <Caption text="cross-section view (W × T); length into page" />
    </SVG>
  );
};

const RoundBar = ({ s }) => {
  const [cx, cy, R] = [100, 90, 60];
  return (
    <SVG>
      <CL x1={8} y1={cy} x2={192} y2={cy} />
      <CL x1={cx} y1={8} x2={cx} y2={162} />
      <circle cx={cx} cy={cy} r={R} {...shp} />
      <DimH x1={cx-R} x2={cx+R} yShape={cy-R} yDim={14} lbl={`D=${lv(s.diameter)}`} />
      <Caption text="cross-section view" />
    </SVG>
  );
};

const SquareBar = ({ s }) => {
  const [x1, y1, w] = [45, 32, 110];
  return (
    <SVG>
      <rect x={x1} y={y1} width={w} height={w} {...shp} />
      <DimH x1={x1} x2={x1+w} yShape={y1} yDim={14} lbl={`a=${lv(s.side)}`} />
      <DimV y1={y1} y2={y1+w} xShape={x1} xDim={x1-16} lbl={`a=${lv(s.side)}`} />
      <Caption text="cross-section view" />
    </SVG>
  );
};

const RectBar = ({ s }) => {
  const [x1, y1, x2, y2] = [35, 40, 165, 140];
  return (
    <SVG>
      <rect x={x1} y={y1} width={x2-x1} height={y2-y1} {...shp} />
      <DimH x1={x1} x2={x2} yShape={y1} yDim={14} lbl={`W=${lv(s.width)}`} />
      <DimV y1={y1} y2={y2} xShape={x2} xDim={x2+16} lbl={`H=${lv(s.height)}`} />
      <Caption text="cross-section view (W × H)" />
    </SVG>
  );
};

const RoundPipe = ({ s }) => {
  const [cx, cy, R, tv] = [100, 90, 60, 11];
  const r = R - tv;
  return (
    <SVG>
      <CL x1={8} y1={cy} x2={192} y2={cy} />
      <CL x1={cx} y1={8} x2={cx} y2={162} />
      {/* outer circle */}
      <circle cx={cx} cy={cy} r={R} {...shp} />
      {/* inner void */}
      <circle cx={cx} cy={cy} r={r} {...hlp} />
      {/* OD annotation */}
      <DimH x1={cx-R} x2={cx+R} yShape={cy-R} yDim={14} lbl={`OD=${lv(s.od)}`} />
      {/* wall thickness leader at ~45° */}
      <Leader
        x1={cx + R*0.707 + 20} y1={cy - R*0.707 - 20}
        x2={cx + (r + tv*0.5)*0.707} y2={cy - (r + tv*0.5)*0.707}
        lbl={`t=${lv(s.wallThick)}`}
      />
      <Caption text="cross-section view (CHS)" />
    </SVG>
  );
};

const SquareHollow = ({ s }) => {
  const [x1, y1, w, tv] = [40, 28, 120, 14];
  return (
    <SVG>
      <rect x={x1}    y={y1}    width={w}      height={w}      {...shp} />
      <rect x={x1+tv} y={y1+tv} width={w-2*tv} height={w-2*tv} {...hlp} />
      <DimH x1={x1} x2={x1+w} yShape={y1} yDim={12} lbl={`a=${lv(s.side)}`} />
      {/* t leader pointing to wall */}
      <Leader
        x1={x1-20} y1={y1 + w/2}
        x2={x1 + tv/2} y2={y1 + w/2}
        lbl={`t=${lv(s.wallThick)}`}
      />
      <Caption text="cross-section view (SHS)" />
    </SVG>
  );
};

const RectHollow = ({ s }) => {
  const [x1, y1, x2, y2, tv] = [35, 35, 165, 140, 13];
  return (
    <SVG>
      <rect x={x1}    y={y1}    width={x2-x1}      height={y2-y1}      {...shp} />
      <rect x={x1+tv} y={y1+tv} width={x2-x1-2*tv} height={y2-y1-2*tv} {...hlp} />
      <DimH x1={x1} x2={x2} yShape={y1} yDim={14} lbl={`W=${lv(s.width)}`} />
      <DimV y1={y1} y2={y2} xShape={x2} xDim={x2+16} lbl={`H=${lv(s.height)}`} />
      <Leader
        x1={x1-20} y1={y1 + (y2-y1)/2}
        x2={x1 + tv/2} y2={y1 + (y2-y1)/2}
        lbl={`t=${lv(s.wallThick)}`}
      />
      <Caption text="cross-section view (RHS)" />
    </SVG>
  );
};

const EqualAngle = ({ s }) => {
  // Corner at top-left: (35, 28)
  // Vertical leg going down: width tv, height legH
  // Horizontal leg going right: height tv, width legH
  const [cx, cy, legH, tv] = [35, 28, 110, 14];
  const pts = [
    [cx,       cy],               // top-left
    [cx+tv,    cy],               // top of web
    [cx+tv,    cy+legH-tv],       // inner corner
    [cx+legH,  cy+legH-tv],       // inner right
    [cx+legH,  cy+legH],          // bottom-right
    [cx,       cy+legH],          // bottom-left
  ].map(p => p.join(',')).join(' ');
  return (
    <SVG>
      <polygon points={pts} {...shp} />
      {/* Leg dimension on left */}
      <DimV y1={cy} y2={cy+legH} xShape={cx} xDim={cx-16} lbl={`L=${lv(s.leg)}`} />
      {/* Leg dimension on bottom */}
      <DimH x1={cx} x2={cx+legH} yShape={cy+legH} yDim={cy+legH+16} lbl={`L=${lv(s.leg)}`} />
      {/* Thickness leader */}
      <Leader
        x1={cx+tv+24} y1={cy+tv/2}
        x2={cx+tv/2} y2={cy+tv/2}
        lbl={`t=${lv(s.thickness)}`}
      />
      <Caption text="cross-section view — equal leg angle" />
    </SVG>
  );
};

const UnequalAngle = ({ s }) => {
  const [cx, cy, legAH, legBH, tv] = [35, 28, 110, 85, 13];
  const pts = [
    [cx,         cy],
    [cx+tv,      cy],
    [cx+tv,      cy+legAH-tv],
    [cx+legBH,   cy+legAH-tv],
    [cx+legBH,   cy+legAH],
    [cx,         cy+legAH],
  ].map(p => p.join(',')).join(' ');
  return (
    <SVG>
      <polygon points={pts} {...shp} />
      {/* Leg A: left vertical */}
      <DimV y1={cy} y2={cy+legAH} xShape={cx} xDim={cx-17} lbl={`A=${lv(s.legA)}`} />
      {/* Leg B: bottom horizontal */}
      <DimH x1={cx} x2={cx+legBH} yShape={cy+legAH} yDim={cy+legAH+17} lbl={`B=${lv(s.legB)}`} />
      {/* t leader */}
      <Leader
        x1={cx+tv+24} y1={cy+tv/2}
        x2={cx+tv/2} y2={cy+tv/2}
        lbl={`t=${lv(s.thickness)}`}
      />
      <Caption text="cross-section — unequal angle (A: vertical, B: horizontal)" />
    </SVG>
  );
};

const TSection = ({ s }) => {
  // Flange at top, web below
  const [cx, fW, fT, totH, wT] = [100, 120, 14, 120, 14];
  const x1 = cx - fW/2, x2 = cx + fW/2;
  const y1 = 20;
  const pts = [
    [x1,         y1],
    [x2,         y1],
    [x2,         y1+fT],
    [cx+wT/2,    y1+fT],
    [cx+wT/2,    y1+totH],
    [cx-wT/2,    y1+totH],
    [cx-wT/2,    y1+fT],
    [x1,         y1+fT],
  ].map(p => p.join(',')).join(' ');
  return (
    <SVG>
      <CL x1={cx} y1={8} x2={cx} y2={y1+totH+8} />
      <polygon points={pts} {...shp} />
      {/* Flange width */}
      <DimH x1={x1} x2={x2} yShape={y1} yDim={y1-14} lbl={`B=${lv(s.flangeWidth)}`} />
      {/* Total height */}
      <DimV y1={y1} y2={y1+totH} xShape={x2} xDim={x2+17} lbl={`H=${lv(s.totalHeight)}`} />
      {/* Flange thickness leader */}
      <Leader
        x1={x1-26} y1={y1+fT/2}
        x2={x1} y2={y1+fT/2}
        lbl={`tf=${lv(s.flangeThick)}`}
      />
      {/* Web thickness */}
      <DimH x1={cx-wT/2} x2={cx+wT/2} yShape={y1+totH} yDim={y1+totH+16} lbl={`tw=${lv(s.webThick)}`} />
      <Caption text="cross-section — T-Section" />
    </SVG>
  );
};

const IBeam = ({ s }) => {
  const [cx, fW, fT, totH, wT] = [100, 120, 13, 120, 13];
  const x1 = cx - fW/2, x2 = cx + fW/2;
  const y1 = 18;
  const pts = [
    [x1,      y1],
    [x2,      y1],
    [x2,      y1+fT],
    [cx+wT/2, y1+fT],
    [cx+wT/2, y1+totH-fT],
    [x2,      y1+totH-fT],
    [x2,      y1+totH],
    [x1,      y1+totH],
    [x1,      y1+totH-fT],
    [cx-wT/2, y1+totH-fT],
    [cx-wT/2, y1+fT],
    [x1,      y1+fT],
  ].map(p => p.join(',')).join(' ');
  return (
    <SVG>
      <CL x1={cx} y1={6} x2={cx} y2={y1+totH+8} />
      <polygon points={pts} {...shp} />
      {/* Flange width */}
      <DimH x1={x1} x2={x2} yShape={y1} yDim={y1-14} lbl={`B=${lv(s.flangeWidth)}`} />
      {/* Total height */}
      <DimV y1={y1} y2={y1+totH} xShape={x2} xDim={x2+17} lbl={`H=${lv(s.totalHeight)}`} />
      {/* Flange thickness */}
      <Leader
        x1={x1-26} y1={y1+fT/2}
        x2={x1} y2={y1+fT/2}
        lbl={`tf=${lv(s.flangeThick)}`}
      />
      {/* Web thickness */}
      <DimH x1={cx-wT/2} x2={cx+wT/2} yShape={y1+(totH/2)} yDim={y1+(totH/2)+16} lbl={`tw=${lv(s.webThick)}`} />
      <Caption text="cross-section — I-Beam / H-Section" />
    </SVG>
  );
};

const Channel = ({ s }) => {
  // Web on left, two flanges going right
  const [x1, y1, totH, fW, wT, fT] = [38, 20, 122, 90, 14, 13];
  const x2 = x1 + fW, yBot = y1 + totH;
  const pts = [
    [x1,      y1],
    [x2,      y1],
    [x2,      y1+fT],
    [x1+wT,   y1+fT],
    [x1+wT,   yBot-fT],
    [x2,      yBot-fT],
    [x2,      yBot],
    [x1,      yBot],
  ].map(p => p.join(',')).join(' ');
  return (
    <SVG>
      <polygon points={pts} {...shp} />
      {/* Total height */}
      <DimV y1={y1} y2={yBot} xShape={x1} xDim={x1-17} lbl={`H=${lv(s.totalHeight)}`} />
      {/* Flange width */}
      <DimH x1={x1} x2={x2} yShape={y1} yDim={y1-14} lbl={`b=${lv(s.flangeWidth)}`} />
      {/* Flange thickness */}
      <Leader
        x1={x2+28} y1={y1+fT/2}
        x2={x2} y2={y1+fT/2}
        lbl={`tf=${lv(s.flangeThick)}`}
      />
      {/* Web thickness */}
      <DimH x1={x1} x2={x1+wT} yShape={yBot-fT} yDim={yBot-fT+16} lbl={`tw=${lv(s.webThick)}`} />
      <Caption text="cross-section — Channel / C-Section" />
    </SVG>
  );
};

const HexBar = ({ s }) => {
  const [cx, cy, R] = [100, 88, 58];
  // Flat-side-up hexagon: vertices at angles 0°,60°,120°,180°,240°,300°
  // For flat-top: vertices at 30°, 90°, 150°, 210°, 270°, 330°
  const pts = Array.from({length: 6}, (_, i) => {
    const a = (i * 60 + 30) * Math.PI / 180;
    return `${cx + R*Math.cos(a)},${cy + R*Math.sin(a)}`;
  }).join(' ');
  // across-flats = 2 * R * cos(30°) = R * √3
  const afY = cy; // flat side is horizontal
  const afX1 = cx - R * Math.cos(30 * Math.PI / 180);
  const afX2 = cx + R * Math.cos(30 * Math.PI / 180);
  return (
    <SVG>
      <CL x1={8} y1={cy} x2={192} y2={cy} />
      <CL x1={cx} y1={6} x2={cx} y2={162} />
      <polygon points={pts} {...shp} />
      {/* across-flats: horizontal dim at top flat-to-flat */}
      <DimH x1={afX1} x2={afX2} yShape={cy - R*Math.sin(30*Math.PI/180)} yDim={14} lbl={`A/F=${lv(s.acrossFlats)}`} />
      <Caption text="cross-section view — Hexagonal Bar" />
    </SVG>
  );
};

// ── Router ────────────────────────────────────────────────────────────────────
const RENDERERS = {
  flat_plate:    FlatPlate,
  round_bar:     RoundBar,
  square_bar:    SquareBar,
  rect_bar:      RectBar,
  round_pipe:    RoundPipe,
  square_hollow: SquareHollow,
  rect_hollow:   RectHollow,
  equal_angle:   EqualAngle,
  unequal_angle: UnequalAngle,
  t_section:     TSection,
  i_beam:        IBeam,
  channel:       Channel,
  hex_bar:       HexBar,
};

const ShapeVisualizer = ({ componentType, specs }) => {
  const Renderer = RENDERERS[componentType];
  if (!Renderer) return null;
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-1 overflow-hidden">
      <Renderer s={specs || {}} />
    </div>
  );
};

export default ShapeVisualizer;
