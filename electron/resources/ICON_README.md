# App Icon Instructions

To complete the Electron build, you need to create an app icon.

## Requirements

- **Format**: `.icns` file for macOS
- **Size**: 1024x1024 pixels minimum (source PNG)
- **Location**: `electron/resources/icon.icns`

## How to Create

### Option 1: Using an existing PNG/JPG image

1. Create a 1024x1024 PNG image (you can use any design tool like Figma, Sketch, or even Preview on macOS)
2. Save it as `icon.png` in this directory
3. Use the following command to convert it to .icns:

```bash
# Install iconutil (comes with Xcode Command Line Tools)
# Create iconset directory
mkdir icon.iconset

# Generate all required icon sizes
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png

# Convert to .icns
iconutil -c icns icon.iconset -o icon.icns

# Clean up
rm -rf icon.iconset
```

### Option 2: Use a simple placeholder

For testing purposes, you can skip the icon by temporarily commenting out the icon lines in `electron-builder.json`:

```json
// "icon": "electron/resources/icon.icns",
```

However, the final build should have a proper icon.

## Recommended Icon Design

For Alata Studio, consider creating an icon that:
- Uses your brand colors
- Is simple and recognizable at small sizes
- Works well on both light and dark backgrounds
- Represents the AI/productivity theme of the application

## Current Status

⚠️ **No icon file currently exists.** You must create one before building the production app.

For development testing, the app will use Electron's default icon.
