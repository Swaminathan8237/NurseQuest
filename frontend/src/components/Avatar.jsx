import { useMemo } from 'react';

const SKIN_TONES = ['#FDDCB5', '#F5C5A3', '#E8A87C', '#D4A574', '#C68642', '#8D5524', '#5C3A1E', '#3B2414'];
const HAIR_COLORS = ['#1a1a2e', '#2d2d2d', '#4a3728', '#8B4513', '#D4A574', '#C68642', '#B22222', '#FFD700', '#FF6B6B', '#6C5CE7', '#00CEC9', '#FF69B4'];

const FACES = [
  (skin) => `<circle cx="100" cy="100" r="75" fill="${skin}"/>`, // Round
  (skin) => `<ellipse cx="100" cy="100" rx="68" ry="78" fill="${skin}"/>`, // Oval
  (skin) => `<rect x="30" y="28" width="140" height="148" rx="35" fill="${skin}"/>`, // Square-ish
  (skin) => `<path d="M100 22 C145 22 170 55 170 100 C170 150 145 180 100 180 C55 180 30 150 30 100 C30 55 55 22 100 22" fill="${skin}"/>`, // Heart
  (skin) => `<ellipse cx="100" cy="105" rx="72" ry="75" fill="${skin}"/>`, // Wide
  (skin) => `<ellipse cx="100" cy="100" rx="62" ry="80" fill="${skin}"/>`, // Narrow
];

const EYES = [
  `<ellipse cx="72" cy="90" rx="10" ry="12" fill="#1a1a2e"/><ellipse cx="128" cy="90" rx="10" ry="12" fill="#1a1a2e"/><circle cx="75" cy="87" r="3" fill="white"/><circle cx="131" cy="87" r="3" fill="white"/>`,
  `<ellipse cx="72" cy="92" rx="12" ry="10" fill="#1a1a2e"/><ellipse cx="128" cy="92" rx="12" ry="10" fill="#1a1a2e"/><circle cx="76" cy="89" r="4" fill="white"/><circle cx="132" cy="89" r="4" fill="white"/>`,
  `<path d="M60 90 Q72 78 84 90" stroke="#1a1a2e" stroke-width="3" fill="none"/><circle cx="72" cy="92" r="6" fill="#1a1a2e"/><path d="M116 90 Q128 78 140 90" stroke="#1a1a2e" stroke-width="3" fill="none"/><circle cx="128" cy="92" r="6" fill="#1a1a2e"/>`,
  `<circle cx="72" cy="90" r="11" fill="white" stroke="#1a1a2e" stroke-width="2"/><circle cx="72" cy="90" r="6" fill="#1a1a2e"/><circle cx="128" cy="90" r="11" fill="white" stroke="#1a1a2e" stroke-width="2"/><circle cx="128" cy="90" r="6" fill="#1a1a2e"/>`,
  `<ellipse cx="72" cy="90" rx="8" ry="5" fill="#1a1a2e"/><ellipse cx="128" cy="90" rx="8" ry="5" fill="#1a1a2e"/>`, // Squinting
  `<path d="M62 85 Q72 95 82 85" stroke="#1a1a2e" stroke-width="3" fill="none"/><path d="M118 85 Q128 95 138 85" stroke="#1a1a2e" stroke-width="3" fill="none"/>`, // Happy closed
  `<ellipse cx="72" cy="88" rx="13" ry="15" fill="white" stroke="#1a1a2e" stroke-width="2"/><circle cx="74" cy="90" r="7" fill="#6C5CE7"/><circle cx="76" cy="87" r="3" fill="white"/><ellipse cx="128" cy="88" rx="13" ry="15" fill="white" stroke="#1a1a2e" stroke-width="2"/><circle cx="130" cy="90" r="7" fill="#6C5CE7"/><circle cx="132" cy="87" r="3" fill="white"/>`,
  `<ellipse cx="72" cy="90" rx="11" ry="13" fill="white" stroke="#1a1a2e" stroke-width="2"/><circle cx="72" cy="91" r="7" fill="#00CEC9"/><circle cx="75" cy="88" r="2.5" fill="white"/><ellipse cx="128" cy="90" rx="11" ry="13" fill="white" stroke="#1a1a2e" stroke-width="2"/><circle cx="128" cy="91" r="7" fill="#00CEC9"/><circle cx="131" cy="88" r="2.5" fill="white"/>`,
];

const MOUTHS = [
  `<path d="M82 120 Q100 138 118 120" stroke="#B5446E" stroke-width="3" fill="none" stroke-linecap="round"/>`, // Smile
  `<path d="M82 122 Q100 135 118 122" stroke="#B5446E" stroke-width="3" fill="#FF8FAB" stroke-linecap="round"/>`, // Open smile
  `<ellipse cx="100" cy="124" rx="8" ry="10" fill="#B5446E"/>`, // Surprised
  `<line x1="82" y1="124" x2="118" y2="124" stroke="#B5446E" stroke-width="3" stroke-linecap="round"/>`, // Neutral
  `<path d="M85 118 Q100 128 115 118" stroke="#B5446E" stroke-width="2.5" fill="none" stroke-linecap="round"/>`, // Slight smile
  `<path d="M82 120 Q100 142 118 120" stroke="#B5446E" stroke-width="3" fill="#FF8FAB" stroke-linecap="round"/><line x1="95" y1="130" x2="105" y2="130" stroke="#B5446E" stroke-width="1.5"/>`, // Big grin
];

const HAIRS = [
  (color) => `<path d="M30 85 Q30 20 100 18 Q170 20 170 85 Q170 50 155 38 Q140 25 100 22 Q60 25 45 38 Q30 50 30 85" fill="${color}"/>`, // Short
  (color) => `<path d="M28 90 Q28 15 100 12 Q172 15 172 90 L172 65 Q170 28 100 18 Q30 28 28 65Z" fill="${color}"/><path d="M165 85 Q175 100 170 130 Q165 100 155 90" fill="${color}"/>`, // Side swept
  (color) => `<path d="M25 95 Q25 10 100 8 Q175 10 175 95 Q175 55 160 35 Q140 15 100 12 Q60 15 40 35 Q25 55 25 95" fill="${color}"/><path d="M25 95 Q20 120 22 160 Q28 130 35 110" fill="${color}"/><path d="M175 95 Q180 120 178 160 Q172 130 165 110" fill="${color}"/>`, // Long
  (color) => `<path d="M30 85 Q30 18 100 15 Q170 18 170 85 L170 55 Q168 25 100 20 Q32 25 30 55Z" fill="${color}"/><circle cx="42" cy="45" r="15" fill="${color}"/><circle cx="65" cy="28" r="16" fill="${color}"/><circle cx="95" cy="20" r="17" fill="${color}"/><circle cx="125" cy="24" r="16" fill="${color}"/><circle cx="152" cy="38" r="15" fill="${color}"/>`, // Curly
  (color) => `<path d="M32 80 Q32 22 100 18 Q168 22 168 80" fill="${color}"/><path d="M42 25 L35 5 L55 18" fill="${color}"/><path d="M70 18 L68 -5 L85 12" fill="${color}"/><path d="M105 15 L108 -6 L118 10" fill="${color}"/><path d="M140 22 L148 0 L155 20" fill="${color}"/>`, // Spiky
  (color) => `<path d="M28 92 Q28 14 100 10 Q172 14 172 92 Q172 50 157 33 Q138 15 100 12 Q62 15 43 33 Q28 50 28 92" fill="${color}"/><rect x="88" y="3" width="24" height="30" rx="5" fill="${color}"/>`, // Mohawk
  (color) => `<path d="M28 95 Q28 12 100 8 Q172 12 172 95" fill="${color}"/><path d="M28 95 Q20 120 28 165 Q35 130 42 108" fill="${color}"/><path d="M172 95 Q180 120 172 165 Q165 130 158 108" fill="${color}"/><path d="M65 10 Q55 -8 75 -2 Q90 -10 100 -5 Q110 -12 125 -2 Q145 -8 135 10" fill="${color}"/>`, // Flowing
  (color) => `<path d="M30 88 Q30 18 100 15 Q170 18 170 88" fill="${color}"/><path d="M45 15 Q100 -10 155 15 Q170 22 172 50 Q155 28 100 18 Q45 28 28 50 Q30 22 45 15" fill="${color}" opacity="0.7"/>`, // Wavy top
  (color) => `<circle cx="100" cy="42" r="42" fill="${color}"/><rect x="35" y="40" width="130" height="50" rx="0" fill="${color}"/>`, // Afro
  (color) => `<path d="M30 85 Q30 20 100 16 Q170 20 170 85 Q175 45 155 30 Q130 12 100 10 Q70 12 45 30 Q25 45 30 85" fill="${color}"/><path d="M150 40 Q175 45 178 75 Q172 55 160 48" fill="${color}"/>`, // Parted
  (color) => `<path d="M32 90 Q32 20 100 16 Q168 20 168 90" fill="${color}"/><path d="M32 90 Q28 50 50 30 Q75 14 100 12 Q125 14 150 30 Q172 50 168 90" fill="none" stroke="${color}" stroke-width="15"/>`, // Thick short
  (color) => `<path d="M35 82 Q35 25 100 20 Q165 25 165 82 L165 55 Q163 30 100 25 Q37 30 35 55Z" fill="${color}"/>`, // Buzz
];

const ACCESSORIES = {
  none: '',
  cap: `<path d="M25 75 Q25 42 100 35 Q175 42 175 75 L180 78 Q180 80 175 80 L25 80 Q20 80 20 78 Z" fill="white" stroke="#ccc" stroke-width="0.5"/><text x="100" y="65" text-anchor="middle" font-size="12" fill="#FF6B6B" font-weight="bold" font-family="Arial">+</text><rect x="18" y="76" width="164" height="6" rx="2" fill="white" stroke="#ddd" stroke-width="0.5"/>`,
  stethoscope: `<path d="M55 165 Q55 195 75 200 Q95 205 100 185 Q105 205 125 200 Q145 195 145 165" stroke="#888" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="100" cy="182" r="8" fill="#888" stroke="#666" stroke-width="1.5"/><circle cx="100" cy="182" r="3" fill="#aaa"/>`,
  badge: `<rect x="125" y="145" width="30" height="38" rx="4" fill="white" stroke="#ddd"/><rect x="125" y="145" width="30" height="12" rx="4" fill="#6C5CE7"/><text x="140" y="154" text-anchor="middle" font-size="7" fill="white" font-weight="bold">NQ</text><circle cx="140" cy="170" r="5" fill="#00CEC9"/>`,
};

export default function Avatar({ config = {}, size = 200, className = '', onClick, showBg = true }) {
  const {
    face = 0,
    skin = 0,
    hair = 0,
    hairColor = '#1a1a2e',
    eyes = 0,
    mouth = 0,
    accessory = 'none',
    scrubsColor = '#6C5CE7',
  } = config;

  const skinColor = SKIN_TONES[skin % SKIN_TONES.length];
  const hairCol = hairColor || HAIR_COLORS[0];
  const faceIdx = face % FACES.length;
  const eyeIdx = eyes % EYES.length;
  const mouthIdx = mouth % MOUTHS.length;
  const hairIdx = hair % HAIRS.length;

  const svgContent = useMemo(() => {
    const bg = showBg ? `<defs><linearGradient id="avBg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${scrubsColor}33"/><stop offset="100%" stop-color="${scrubsColor}11"/></linearGradient></defs><circle cx="100" cy="100" r="98" fill="url(#avBg)" stroke="${scrubsColor}44" stroke-width="2"/>` : '';
    const scrubs = `<path d="M55 155 Q55 148 65 145 Q80 140 100 138 Q120 140 135 145 Q145 148 145 155 L148 200 L52 200 Z" fill="${scrubsColor}"/><path d="M85 145 L90 160 L100 155 L110 160 L115 145" stroke="white" stroke-width="1.5" fill="none" opacity="0.5"/>`;
    const faceEl = FACES[faceIdx](skinColor);
    const hairEl = HAIRS[hairIdx](hairCol);
    const eyeEl = EYES[eyeIdx];
    const mouthEl = MOUTHS[mouthIdx];
    const acc = ACCESSORIES[accessory] || '';
    const ears = `<ellipse cx="28" cy="95" rx="10" ry="14" fill="${skinColor}"/><ellipse cx="172" cy="95" rx="10" ry="14" fill="${skinColor}"/>`;
    
    return `${bg}${scrubs}${ears}${faceEl}${hairEl}${eyeEl}${mouthEl}${acc}`;
  }, [config, showBg]);

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={`avatar ${className}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}

export { SKIN_TONES, HAIR_COLORS, FACES, EYES, MOUTHS, HAIRS, ACCESSORIES };
