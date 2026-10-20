/* Microsoft JPEG XR reference API; see docs/image-encoders.md. */
#include <JXRGlue.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <stdint.h>

static U8* output;
static size_t output_size;
static char error_message[128];
static I32 decoded_width;
static I32 decoded_height;
static PKPixelInfo decoded_info;

/* SSIM quality table from this revision's JxrEncApp.c, under its Microsoft license. */
static const int quality_table[12][6] = {
    {67,93,98,71,98,104}, {59,83,88,61,89,95}, {50,76,81,53,85,90},
    {46,71,77,47,79,85}, {41,67,71,42,75,78}, {34,59,65,35,66,72},
    {30,54,60,29,60,66}, {24,48,53,22,53,58}, {18,39,45,17,43,48},
    {13,34,38,11,35,38}, {8,20,24,7,22,25}, {2,5,6,2,5,6}
};

void release_result(void)
{
    free(output);
    output = NULL;
    output_size = 0;
}

const U8* encoded_data(void) { return output; }
size_t encoded_size(void) { return output_size; }
const char* encoder_error(void) { return error_message; }

static ERR write_bytes(struct WMPStream* stream, const void* bytes, size_t length)
{
    size_t position = stream->state.buf.cbCur;
    if (length > SIZE_MAX - position) {
        return WMP_errBufferOverflow;
    }
    size_t end = position + length;
    if (end > output_size) {
        U8* resized = realloc(output, end);
        if (resized == NULL) {
            return WMP_errOutOfMemory;
        }
        output = resized;
        memset(output + output_size, 0, end - output_size);
        output_size = end;
    }
    memcpy(output + position, bytes, length);
    stream->state.buf.cbCur = end;
    return WMP_errSuccess;
}

int encode_rgba(U8* rgba, int width, int height, int quality)
{
    ERR err = WMP_errSuccess;
    PKImageEncode* encoder = NULL;
    struct WMPStream* stream = NULL;
    CWMIStrCodecParam parameters = {0};
    release_result();
    error_message[0] = '\0';
    parameters.cfColorFormat = YUV_444;
    parameters.bdBitDepth = BD_LONG;
    parameters.bfBitstreamFormat = FREQUENCY;
    parameters.bProgressiveMode = TRUE;
    parameters.olOverlap = quality == 100 ? OL_NONE : OL_ONE;
    parameters.sbSubband = SB_ALL;
    parameters.uAlphaMode = 2;
    parameters.uiDefaultQPIndex = 1;
    parameters.uiDefaultQPIndexAlpha = 1;
    Call(CreateWS_Memory(&stream, NULL, 0));
    stream->Write = write_bytes;
    Call(PKImageEncode_Create_WMP(&encoder));
    Call(encoder->Initialize(encoder, stream, &parameters, sizeof(parameters)));
    if (quality < 100) {
        float q = quality / 100.0f;
        if (q > 0.8f) {
            q = 0.8f + (q - 0.8f) * 1.5f;
        }
        int index = (int)(10 * q);
        float fraction = 10 * q - index;
        U8 quantizers[6];
        for (int i = 0; i < 6; i++) {
            quantizers[i] = (U8)(0.5f + quality_table[index][i] * (1 - fraction) + quality_table[index + 1][i] * fraction);
        }
        encoder->WMP.wmiSCP.uiDefaultQPIndex = quantizers[0];
        encoder->WMP.wmiSCP.uiDefaultQPIndexU = quantizers[1];
        encoder->WMP.wmiSCP.uiDefaultQPIndexV = quantizers[2];
        encoder->WMP.wmiSCP.uiDefaultQPIndexYHP = quantizers[3];
        encoder->WMP.wmiSCP.uiDefaultQPIndexUHP = quantizers[4];
        encoder->WMP.wmiSCP.uiDefaultQPIndexVHP = quantizers[5];
    }
    encoder->WMP.wmiSCP_Alpha.uiDefaultQPIndex = 1;
    Call(encoder->SetPixelFormat(encoder, GUID_PKPixelFormat32bppRGBA));
    Call(encoder->SetSize(encoder, width, height));
    Call(encoder->SetResolution(encoder, 96, 96));
    Call(encoder->WritePixels(encoder, height, rgba, width * 4));
Cleanup:
    if (encoder != NULL && encoder->pStream != NULL) {
        encoder->Release(&encoder);
        stream = NULL;
    } else if (encoder != NULL) {
        PKFree((void**)&encoder);
    }
    if (stream != NULL) {
        stream->Close(&stream);
    }
    if (err != WMP_errSuccess) {
        snprintf(error_message, sizeof(error_message), "JPEG XR encoding failed (%ld)", (long)err);
        release_result();
    }
    return err;
}

int image_width(void) { return decoded_width; }
int image_height(void) { return decoded_height; }
int image_channels(void) { return decoded_info.cChannel; }
int image_depth(void) { return decoded_info.bdBitDepth; }
int image_color(void) { return decoded_info.cfColorFormat; }
int image_flags(void) { return decoded_info.grBit; }
int image_bits(void) { return decoded_info.cbitUnit; }

int decode_image(U8* bytes, size_t length)
{
    ERR err = WMP_errSuccess;
    PKImageDecode* decoder = NULL;
    PKFormatConverter* converter = NULL;
    struct WMPStream* stream = NULL;
    PKPixelFormatGUID format;
    release_result();
    Call(CreateWS_Memory(&stream, bytes, length));
    Call(PKImageDecode_Create_WMP(&decoder));
    Call(decoder->Initialize(decoder, stream));
    Call(decoder->GetSize(decoder, &decoded_width, &decoded_height));
    Call(decoder->GetPixelFormat(decoder, &format));
    decoded_info.pGUIDPixFmt = &format;
    Call(PixelFormatLookup(&decoded_info, LOOKUP_FORWARD));
    /* Expand bilevel rows with the reference converter, including polarity. */
    if (decoded_info.bdBitDepth == BD_1) {
        Call(PKCodecFactory_CreateFormatConverter(&converter));
        Call(converter->Initialize(converter, decoder, NULL, GUID_PKPixelFormat8bppGray));
        format = GUID_PKPixelFormat8bppGray;
        decoded_info.pGUIDPixFmt = &format;
        Call(PixelFormatLookup(&decoded_info, LOOKUP_FORWARD));
    }
    /* Validate before calculating stride or allowing a codec allocation. */
    if (decoded_width < 1 || decoded_height < 1 || decoded_info.cbitUnit < 8
        || decoded_info.cbitUnit > 256 || decoded_info.cbitUnit % 8 != 0
        || (uint64_t)decoded_width * decoded_height * (decoded_info.cbitUnit / 8) > 0x1fffffff) {
        err = WMP_errInvalidParameter;
        goto Cleanup;
    }
    output_size = (size_t)decoded_width * decoded_height * (decoded_info.cbitUnit / 8);
    output = calloc(1, output_size);
    if (output == NULL) {
        err = WMP_errOutOfMemory;
        goto Cleanup;
    }
    /* The original npm wrapper leaves this at zero and silently drops planar alpha. */
    decoder->WMP.wmiSCP.uAlphaMode = 2;
    PKRect rectangle = {0, 0, decoded_width, decoded_height};
    if (converter != NULL) {
        Call(converter->Copy(converter, &rectangle, output, decoded_width * (decoded_info.cbitUnit / 8)));
    } else {
        Call(decoder->Copy(decoder, &rectangle, output, decoded_width * (decoded_info.cbitUnit / 8)));
    }
Cleanup:
    if (converter != NULL) {
        converter->Release(&converter);
    }
    if (decoder != NULL) {
        decoder->Release(&decoder);
    }
    if (stream != NULL) {
        stream->Close(&stream);
    }
    if (err != WMP_errSuccess) {
        snprintf(error_message, sizeof(error_message), "JPEG XR decoding failed (%ld)", (long)err);
        release_result();
    }
    return err;
}
