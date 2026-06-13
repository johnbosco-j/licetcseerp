#!/bin/bash
# Run from: cd ~/Documents/Excelsior/web
# Then: bash fix-logo.sh

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "\n${CYAN}══════════════════════════════════════${NC}"
echo -e "${CYAN}  Excelsior ERP — Logo Fix${NC}"
echo -e "${CYAN}══════════════════════════════════════${NC}\n"

if [ ! -f "package.json" ]; then
  echo -e "${RED}✗ Run from ~/Documents/Excelsior/web${NC}"; exit 1
fi

# ── Step 1: Check what's in public/ ──
echo -e "▶ Step 1 — Checking public/ directory"
ls -lh public/
echo ""

# ── Step 2: Find where images.png is ──
echo -e "▶ Step 2 — Looking for images.png"
if [ -f "public/images.png" ]; then
  echo -e "  ${GREEN}✓ Found: public/images.png ($(wc -c < public/images.png) bytes)${NC}"
  LOGO_FILE="images.png"
elif [ -f "public/licet-logo.png" ]; then
  SIZE=$(wc -c < public/licet-logo.png)
  echo -e "  Found: public/licet-logo.png ($SIZE bytes)"
  # Check if it's actually a real image (not HTML)
  MAGIC=$(file public/licet-logo.png)
  echo -e "  File type: $MAGIC"
  if echo "$MAGIC" | grep -q "HTML\|text\|ASCII"; then
    echo -e "  ${RED}✗ This file is HTML/text — NOT a real image! That's why logo doesn't show.${NC}"
    echo -e "  ${YELLOW}You need to copy your real logo image to public/images.png first.${NC}"
    LOGO_FILE=""
  else
    echo -e "  ${GREEN}✓ It's a real image${NC}"
    # Rename it to images.png for consistency
    cp public/licet-logo.png public/images.png
    LOGO_FILE="images.png"
  fi
else
  echo -e "  ${RED}✗ No logo file found in public/${NC}"
  LOGO_FILE=""
fi

if [ -z "$LOGO_FILE" ]; then
  echo -e "\n${YELLOW}══════════════════════════════════════${NC}"
  echo -e "${YELLOW}  ACTION REQUIRED:${NC}"
  echo -e "${YELLOW}  Your logo image is missing or corrupted.${NC}"
  echo -e "${YELLOW}  Do this manually:${NC}"
  echo -e ""
  echo -e "  1. In Finder, go to your Downloads folder"
  echo -e "  2. Find the LICET logo image you downloaded"
  echo -e "  3. Copy it to: ~/Documents/Excelsior/web/public/images.png"
  echo -e "  4. Run this script again: bash fix-logo.sh"
  echo -e "${YELLOW}══════════════════════════════════════${NC}\n"
  exit 0
fi

echo -e "  Using logo file: $LOGO_FILE"

# ── Step 3: Update ALL references in source code ──
echo -e "\n▶ Step 3 — Updating all logo references to /$LOGO_FILE"

# Find and replace every possible old logo path
find src -type f \( -name "*.tsx" -o -name "*.ts" \) | while read file; do
  if grep -q "licet-logo\|images\.png\|logo\.svg\|logo\.png" "$file" 2>/dev/null; then
    sed -i '' \
      "s|/licet-logo\.png|/$LOGO_FILE|g; \
       s|/licet-logo\.svg|/$LOGO_FILE|g; \
       s|/images\.png|/$LOGO_FILE|g" \
      "$file"
    echo -e "  Patched: $file"
  fi
done

# ── Step 4: Verify references are correct ──
echo -e "\n▶ Step 4 — Verifying references"
REFS=$(grep -rn "$LOGO_FILE\|licet-logo" src/ --include="*.tsx" --include="*.ts" 2>/dev/null)
if [ -n "$REFS" ]; then
  echo "$REFS" | head -10
else
  echo -e "  ${YELLOW}⚠ No logo references found in src/ — check your layout.tsx has img tags${NC}"
fi

# ── Step 5: Test the image is accessible ──
echo -e "\n▶ Step 5 — Image verification"
REAL_SIZE=$(wc -c < "public/$LOGO_FILE")
echo -e "  public/$LOGO_FILE — $REAL_SIZE bytes"
IMGTYPE=$(file "public/$LOGO_FILE")
echo -e "  Type: $IMGTYPE"
if echo "$IMGTYPE" | grep -qiE "JPEG|PNG|GIF|WebP|SVG"; then
  echo -e "  ${GREEN}✓ Valid image file — logo WILL display${NC}"
else
  echo -e "  ${RED}✗ Not a valid image — logo will NOT display${NC}"
  echo -e "  ${YELLOW}Please copy the real LICET logo image to public/images.png${NC}"
  exit 1
fi

# ── Step 6: Restart ──
echo -e "\n▶ Step 6 — Restarting dev server"
pkill -f "next dev" 2>/dev/null || true
rm -rf .next

echo -e "\n${GREEN}══════════════════════════════════════${NC}"
echo -e "${GREEN}  Done! Logo should now be visible.${NC}"
echo -e "${GREEN}══════════════════════════════════════${NC}\n"

npm run dev
