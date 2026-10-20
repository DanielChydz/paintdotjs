#!/usr/bin/env bash
# Run in the pinned Emscripten container documented in docs/image-encoders.md.
set -euo pipefail
cd "$(dirname "$0")/.."
root="$PWD"
codec_build="$root/.tmp/image-encoders"
python3 scripts/codecs/fetch_sources.py
python3 -m pip install --target "$codec_build/tools" cmake==3.31.6
export PYTHONPATH="$codec_build/tools"
export PATH="$codec_build/tools/bin:$PATH"
export SOURCE_DATE_EPOCH=1792195200
prefix="$codec_build/prefix"

emcmake cmake -S "$codec_build/kvazaar-2.3.2" -B "$codec_build/build/kvazaar" \
    -DCMAKE_BUILD_TYPE=MinSizeRel -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTS=OFF \
    -DBUILD_KVAZAAR_BINARY=OFF -DUSE_CRYPTO=OFF -DCMAKE_INSTALL_PREFIX="$prefix"
cmake --build "$codec_build/build/kvazaar" -j 4
cmake --install "$codec_build/build/kvazaar"

# libheif's own standalone build flag omits unused JavaScript/Embind bindings.
emcmake cmake -S "$codec_build/libheif-1.23.6" -B "$codec_build/build/heif" \
    -DCMAKE_BUILD_TYPE=MinSizeRel -DBUILD_SHARED_LIBS=OFF -DCMAKE_INSTALL_PREFIX="$prefix" \
    -DCMAKE_PREFIX_PATH="$prefix" -DKVAZAAR_INCLUDE_DIR="$prefix/include" \
    -DKVAZAAR_LIBRARY="$prefix/lib/libkvazaar.a" -DCMAKE_CXX_FLAGS=-D__EMSCRIPTEN_STANDALONE_WASM__ \
    -DENABLE_PLUGIN_LOADING=OFF -DENABLE_MULTITHREADING_SUPPORT=OFF -DENABLE_PARALLEL_TILE_DECODING=OFF \
    -DWITH_KVAZAAR=ON -DWITH_KVAZAAR_PLUGIN=OFF -DWITH_LIBDE265=OFF -DWITH_X265=OFF \
    -DWITH_X264=OFF -DWITH_OpenH264_DECODER=OFF -DWITH_AOM_ENCODER=OFF -DWITH_AOM_DECODER=OFF \
    -DWITH_LIBSHARPYUV=OFF -DWITH_EXAMPLES=OFF -DWITH_GDK_PIXBUF=OFF \
    -DBUILD_TESTING=OFF -DBUILD_DOCUMENTATION=OFF
cmake --build "$codec_build/build/heif" -j 4
cmake --install "$codec_build/build/heif"

jxr_source="$codec_build/jxrlib-19cc1fa19ca6607449d210aea946b3187f808f2c"
# The old transcoder declarations must match the actual Int return types in WASM.
sed -i -e 's/EXTERN_C Void StrIODecTerm/EXTERN_C Int StrIODecTerm/' \
    -e 's/EXTERN_C Void StrIOEncTerm/EXTERN_C Int StrIOEncTerm/' "$jxr_source/image/decode/JXRTranscode.c"
(
    cd "$jxr_source"
    emmake make -j 4 CC="emcc -Wno-error=incompatible-pointer-types -include $root/scripts/codecs/jxr_compat.h" \
        JAVA_HOME=/tmp "$jxr_source/build/libjpegxr.a" "$jxr_source/build/libjxrglue.a"
)

mkdir -p lib/codecs
flags=(-Oz -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker -sALLOW_MEMORY_GROWTH=1
    -sINITIAL_MEMORY=33554432 -sSTACK_SIZE=2097152 -sFILESYSTEM=0 -sASSERTIONS=0
    '-sEXPORTED_FUNCTIONS=["_malloc","_free","_encode_rgba","_encoded_data","_encoded_size","_encoder_error","_release_result"]'
    '-sEXPORTED_RUNTIME_METHODS=["UTF8ToString","HEAPU8"]')
em++ scripts/codecs/heic_encoder.cpp -I"$prefix/include" "$prefix/lib/libheif.a" "$prefix/lib/libkvazaar.a" \
    "${flags[@]}" -o lib/codecs/heic-encoder.js
flags+=('-sEXPORTED_FUNCTIONS=["_malloc","_free","_encode_rgba","_encoded_data","_encoded_size","_encoder_error","_release_result","_decode_image","_image_width","_image_height","_image_channels","_image_depth","_image_color","_image_flags","_image_bits"]')
emcc scripts/codecs/jxr_encoder.c -I"$jxr_source/jxrgluelib" -I"$jxr_source/common/include" \
    -I"$jxr_source/image/sys" -D__ANSI__ "$jxr_source/build/libjxrglue.a" "$jxr_source/build/libjpegxr.a" \
    "${flags[@]}" -o lib/codecs/jxr-encoder.js
chmod 644 lib/codecs/*.js lib/codecs/*.wasm
sha256sum scripts/build_image_encoders.sh scripts/codecs/*.* lib/codecs/*.js lib/codecs/*.wasm > lib/codecs/SHA256SUMS
cat lib/codecs/SHA256SUMS
