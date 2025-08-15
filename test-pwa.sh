#!/bin/bash

echo "🚀 Testing PWA build locally..."
echo ""

# Build the PWA
echo "📦 Building PWA..."
DEPLOY_TARGET=github npm run build:pwa

# Copy PWA files
echo "📋 Copying PWA files..."
cp public/manifest.github.json out/manifest.json
cp -r public/icons out/

echo ""
echo "✅ Build complete! To test locally:"
echo ""
echo "   npx serve out -p 3000"
echo ""
echo "Then open: http://localhost:3000/rich-text-editor"
echo ""
echo "To deploy to GitHub Pages, commit and push these changes:"
echo "   git add ."
echo "   git commit -m 'Setup PWA for mobile'"
echo "   git push origin main"
echo ""
echo "Your PWA will be available at:"
echo "   https://efesop.github.io/rich-text-editor"
