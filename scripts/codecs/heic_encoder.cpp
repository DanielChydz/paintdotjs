// libheif 1.23.6 API; see docs/image-encoders.md and the bundled licenses.
#include <libheif/heif.h>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>

static uint8_t* output = nullptr;
static size_t output_size = 0;
static char error_message[512];

static heif_error write_bytes(heif_context*, const void* bytes, size_t length, void*)
{
    auto* resized = static_cast<uint8_t*>(realloc(output, output_size + length));
    if (resized == nullptr) {
        return {heif_error_Memory_allocation_error, heif_suberror_Unspecified, "HEIC output allocation failed"};
    }
    output = resized;
    memcpy(output + output_size, bytes, length);
    output_size += length;
    return {heif_error_Ok, heif_suberror_Unspecified, nullptr};
}

extern "C" {
void release_result()
{
    free(output);
    output = nullptr;
    output_size = 0;
}

const uint8_t* encoded_data() { return output; }
size_t encoded_size() { return output_size; }
const char* encoder_error() { return error_message; }

int encode_rgba(const uint8_t* rgba, int width, int height, int quality)
{
    release_result();
    error_message[0] = '\0';
    heif_context* context = heif_context_alloc();
    heif_encoder* encoder = nullptr;
    heif_image* image = nullptr;
    heif_error error = heif_context_get_encoder_for_format(context, heif_compression_HEVC, &encoder);
    if (error.code == heif_error_Ok) {
        error = heif_encoder_set_lossy_quality(encoder, quality);
    }
    if (error.code == heif_error_Ok) {
        error = heif_encoder_set_lossless(encoder, quality == 100);
    }
    if (error.code == heif_error_Ok) {
        error = heif_image_create(width, height, heif_colorspace_RGB, heif_chroma_interleaved_RGBA, &image);
    }
    if (error.code == heif_error_Ok) {
        error = heif_image_add_plane(image, heif_channel_interleaved, width, height, 8);
    }
    if (error.code == heif_error_Ok) {
        int stride;
        uint8_t* plane = heif_image_get_plane(image, heif_channel_interleaved, &stride);
        for (int y = 0; y < height; y++) {
            memcpy(plane + y * stride, rgba + y * width * 4, width * 4);
        }
        error = heif_context_encode_image(context, image, encoder, nullptr, nullptr);
    }
    if (error.code == heif_error_Ok) {
        heif_writer writer = {1, write_bytes};
        error = heif_context_write(context, &writer, nullptr);
    }
    if (error.code != heif_error_Ok) {
        snprintf(error_message, sizeof(error_message), "%s", error.message);
        release_result();
    }
    if (image != nullptr) {
        heif_image_release(image);
    }
    if (encoder != nullptr) {
        heif_encoder_release(encoder);
    }
    heif_context_free(context);
    return error.code;
}
}
