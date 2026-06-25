export default function CadSvg() {
  return (
    <svg
      width="390" height="290"
      viewBox="0 0 390 290"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ── Enclosure body ── */}
      {/* Top face */}
      <path d="M195 40 L330 118 L195 196 L60 118 Z"
        stroke="#3b82f6" strokeWidth="1.5" fill="#f0f7ff" strokeLinejoin="round" />
      {/* Right face */}
      <path d="M330 118 L330 202 L195 280 L195 196 Z"
        stroke="#3b82f6" strokeWidth="1.5" fill="#dbeafe" strokeLinejoin="round" />
      {/* Left face */}
      <path d="M60 118 L60 202 L195 280 L195 196 Z"
        stroke="#3b82f6" strokeWidth="1.5" fill="#eff6ff" strokeLinejoin="round" />

      {/* ── Top face details ── */}
      <line x1="145" y1="133" x2="245" y2="133" stroke="#93c5fd" strokeWidth="0.7" strokeDasharray="3,3" />
      <line x1="195" y1="74"  x2="195" y2="172" stroke="#93c5fd" strokeWidth="0.7" strokeDasharray="3,3" />
      <path d="M160 88 L196 108 L196 134 L160 114 Z" fill="#dbeafe" stroke="#93c5fd" strokeWidth="0.9" />
      <path d="M202 93 L238 113 L238 139 L202 119 Z" fill="#dbeafe" stroke="#93c5fd" strokeWidth="0.9" />

      {/* ── Fan (right face) ── */}
      <circle cx="278" cy="200" r="28" stroke="#60a5fa" strokeWidth="1.2" fill="#dbeafe" />
      <circle cx="278" cy="200" r="20" stroke="#60a5fa" strokeWidth="0.8" fill="#eff6ff" />
      <circle cx="278" cy="200" r="12" stroke="#60a5fa" strokeWidth="0.8" fill="#dbeafe" />
      <circle cx="278" cy="200" r="5"  stroke="#60a5fa" strokeWidth="0.8" fill="#bfdbfe" />
      {/* fan blades */}
      {[0,40,80,120,160,200,240,280,320].map(deg => {
        const r  = deg * Math.PI / 180
        const x1 = 278 + 14 * Math.sin(r)
        const y1 = 200 - 14 * Math.cos(r)
        const x2 = 278 + 22 * Math.sin(r)
        const y2 = 200 - 22 * Math.cos(r)
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#93c5fd" strokeWidth="1.2" />
      })}

      {/* ── Vent slots (right face) ── */}
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x="310" y={152 + i * 6} width="16" height="3" rx="1.5" fill="#93c5fd" opacity="0.9" />
      ))}

      {/* ── Ports (left face) ── */}
      {[184, 197, 210, 223].map((y, i) => (
        <g key={i}>
          <rect x="76" y={y} width="20" height="9" rx="2" fill="#dbeafe" stroke="#93c5fd" strokeWidth="0.8" />
          <circle cx="80" cy={y + 4.5} r="1.5" fill="#60a5fa" />
        </g>
      ))}

      {/* ── Centre-ridge line ── */}
      <line x1="195" y1="196" x2="195" y2="280"
        stroke="#93c5fd" strokeWidth="0.8" strokeDasharray="2,2" />
    </svg>
  )
}
