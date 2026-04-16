#!/bin/bash
# Generate simple placeholder icons for the extension
# Uses a blue lightning bolt on transparent background

for size in 16 48 128; do
  cat > "icon${size}.svg" << EOF
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${size > 16 ? 8 : 2}" fill="#1e1e1e"/>
  <text x="50%" y="55%" text-anchor="middle" dominant-baseline="central"
        font-family="Arial, sans-serif" font-weight="bold"
        font-size="${size * 0.55}" fill="#61dafb">B</text>
</svg>
EOF
done
