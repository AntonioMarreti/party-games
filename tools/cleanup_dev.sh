#!/bin/bash

echo "🗑️  Starting Developer Cache Cleanup..."

# 1. NPM Cache
if [ -d "$HOME/.npm/_cacache" ]; then
    SIZE=$(du -sh "$HOME/.npm/_cacache" | awk '{print $1}')
    echo "📦 Found NPM Cache: $SIZE"
    echo "   Cleaning..."
    npm cache clean --force
else
    echo "✅ NPM Cache is already empty."
fi

# 2. Pip Cache
if [ -d "$HOME/Library/Caches/pip" ]; then
    SIZE=$(du -sh "$HOME/Library/Caches/pip" | awk '{print $1}')
    echo "🐍 Found Pip Cache: $SIZE"
    echo "   Cleaning..."
    pip cache purge
else
    echo "✅ Pip Cache is already empty."
fi

# 3. UV Cache
# Note: we check both default and our temp location if it exists
if [ -d "$HOME/.uv_cache" ]; then
    echo "⚡ Found UV Cache (Local). Cleaning..."
    uv cache clean
fi

# 4. Hugging Face (Check only)
HF_CACHE="$HOME/.cache/huggingface"
if [ -d "$HF_CACHE" ]; then
    HF_SIZE=$(du -sh "$HF_CACHE" | awk '{print $1}')
    echo "🤗 Hugging Face Internal Cache: $HF_SIZE"
    if [[ "$HF_SIZE" == *"G"* ]]; then
        echo "⚠️  WARNING: Internal HF cache is large! We should have moved this."
    else
        echo "✅ Hugging Face cache is small (models are on external drive)."
    fi
fi

# 5. Yarn Cache (Optional)
if [ -d "$HOME/Library/Caches/yarn" ]; then
     SIZE=$(du -sh "$HOME/Library/Caches/yarn" | awk '{print $1}')
     echo "🧶 Found Yarn Cache: $SIZE"
     echo "   Cleaning..."
     rm -rf "$HOME/Library/Caches/yarn"
fi

echo "🎉 Cleanup Complete!"
echo "Check your 'About This Mac' storage to see reclaimed space."
