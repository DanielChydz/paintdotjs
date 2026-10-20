/* Fixture generator for the pinned Microsoft JPEG XR reference encoder.
 * Build against native libjxrglue/libjpegxr; see tests/fixtures/jxr/README.md.
 * Original fixture patterns and harness: project MIT license.
 */
#include "jxr_encoder.c"
#include <math.h>

typedef struct { const char* name; const PKPixelFormatGUID* format; } Fixture;
static const Fixture fixtures[] = {
    {"gray1", &GUID_PKPixelFormatBlackWhite},
    {"gray8", &GUID_PKPixelFormat8bppGray},
    {"gray16", &GUID_PKPixelFormat16bppGray},
    {"gray16fixed", &GUID_PKPixelFormat16bppGrayFixedPoint},
    {"gray16half", &GUID_PKPixelFormat16bppGrayHalf},
    {"gray32fixed", &GUID_PKPixelFormat32bppGrayFixedPoint},
    {"gray32float", &GUID_PKPixelFormat32bppGrayFloat},
    {"rgb24", &GUID_PKPixelFormat24bppRGB},
    {"bgr24", &GUID_PKPixelFormat24bppBGR},
    {"rgb32", &GUID_PKPixelFormat32bppRGB},
    {"rgb48", &GUID_PKPixelFormat48bppRGB},
    {"rgb48fixed", &GUID_PKPixelFormat48bppRGBFixedPoint},
    {"rgb48half", &GUID_PKPixelFormat48bppRGBHalf},
    {"rgb64fixed", &GUID_PKPixelFormat64bppRGBFixedPoint},
    {"rgb64half", &GUID_PKPixelFormat64bppRGBHalf},
    {"rgb96fixed", &GUID_PKPixelFormat96bppRGBFixedPoint},
    {"rgb96float", &GUID_PKPixelFormat96bppRGBFloat},
    {"rgb128fixed", &GUID_PKPixelFormat128bppRGBFixedPoint},
    {"rgb128float", &GUID_PKPixelFormat128bppRGBFloat},
    {"rgba32", &GUID_PKPixelFormat32bppRGBA},
    {"bgra32", &GUID_PKPixelFormat32bppBGRA},
    {"rgba64", &GUID_PKPixelFormat64bppRGBA},
    {"rgba64fixed", &GUID_PKPixelFormat64bppRGBAFixedPoint},
    {"rgba64half", &GUID_PKPixelFormat64bppRGBAHalf},
    {"rgba128fixed", &GUID_PKPixelFormat128bppRGBAFixedPoint},
    {"rgba128float", &GUID_PKPixelFormat128bppRGBAFloat},
    {"prgba32", &GUID_PKPixelFormat32bppPRGBA},
    {"prgba64", &GUID_PKPixelFormat64bppPRGBA},
    {"prgba128float", &GUID_PKPixelFormat128bppPRGBAFloat},
    {"rgb555", &GUID_PKPixelFormat16bppRGB555},
    {"rgb565", &GUID_PKPixelFormat16bppRGB565},
    {"rgb101010", &GUID_PKPixelFormat32bppRGB101010},
    {"cmyk32", &GUID_PKPixelFormat32bppCMYK},
    {"cmyka40", &GUID_PKPixelFormat40bppCMYKAlpha},
    {"cmyk64", &GUID_PKPixelFormat64bppCMYK},
    {"cmyka80", &GUID_PKPixelFormat80bppCMYKAlpha},
    {"rgbe", &GUID_PKPixelFormat32bppRGBE},
    {"nchannel", &GUID_PKPixelFormat40bpp5Channels}
};

static ERR generate(const Fixture* fixture, const char* directory)
{
    ERR err = WMP_errSuccess;
    PKImageEncode* encoder = NULL;
    struct WMPStream* stream = NULL;
    PKPixelInfo info = {0};
    info.pGUIDPixFmt = fixture->format;
    Call(PixelFormatLookup(&info, LOOKUP_FORWARD));
    U32 stride = (3 * info.cbitUnit + 7) / 8;
    U8 pixels[256] = {0};
    const float pattern[] = {0.0f, .25f, .5f, 1.0f, .75f, .125f};
    for (int pixel = 0; pixel < 6; ++pixel) {
        U8* target = pixels + pixel / 3 * stride + pixel % 3 * info.cbitUnit / 8;
        if (info.bdBitDepth == BD_1) {
            pixels[pixel / 3 * stride] = pixel < 3 ? 0xa0 : 0x40;
        } else if (info.bdBitDepth == BD_5 || info.bdBitDepth == BD_565 || info.bdBitDepth == BD_10) {
            if (info.bdBitDepth == BD_10) {
                ((U32*)target)[0] = (pixel % 3 == 0 ? 1023u << 20 : pixel % 3 == 1 ? 1023u << 10 : 1023u);
            } else {
                ((U16*)target)[0] = (pixel % 3 == 0 ? 31u << (info.bdBitDepth == BD_565 ? 11 : 10)
                    : pixel % 3 == 1 ? (info.bdBitDepth == BD_565 ? 63u : 31u) << 5 : 31u);
            }
        } else {
            for (U32 channel = 0; channel < info.cChannel; ++channel) {
                float value = pattern[(pixel + channel) % 6];
                if ((info.grBit & PK_pixfmtPreMul) && channel < 3) {
                    value *= pattern[(pixel + 3) % 6];
                }
                switch (info.bdBitDepth) {
                    case BD_8: target[channel] = (U8)roundf(value * 255); break;
                    case BD_16: ((U16*)target)[channel] = (U16)roundf(value * 65535); break;
                    case BD_16S: ((I16*)target)[channel] = (I16)(value * 8192); break;
                    case BD_16F: { U32 bits; memcpy(&bits, &value, 4); ((U16*)target)[channel] = value == 0 ? 0 : ((((bits >> 23) & 255) - 112) << 10) | ((bits >> 13) & 1023); break; }
                    case BD_32S: ((I32*)target)[channel] = (I32)(value * 16777216); break;
                    case BD_32F: ((float*)target)[channel] = value; break;
                    default: return WMP_errUnsupportedFormat;
                }
            }
            if (info.cfColorFormat == CF_RGBE) { target[0] = 64; target[1] = 128; target[2] = 192; target[3] = pixel == 0 ? 0 : 129; }
        }
    }
    CWMIStrCodecParam parameters = {0};
    parameters.cfColorFormat = info.cfColorFormat == Y_ONLY ? Y_ONLY : info.cfColorFormat == CMYK ? CMYK
        : info.cfColorFormat == NCOMPONENT ? NCOMPONENT : YUV_444;
    parameters.bdBitDepth = BD_LONG;
    parameters.bfBitstreamFormat = FREQUENCY;
    parameters.bProgressiveMode = TRUE;
    parameters.olOverlap = OL_NONE;
    parameters.sbSubband = SB_ALL;
    parameters.uAlphaMode = info.grBit & PK_pixfmtHasAlpha ? 2 : 0;
    parameters.uiDefaultQPIndex = 1;
    parameters.uiDefaultQPIndexAlpha = 1;
    release_result();
    Call(CreateWS_Memory(&stream, NULL, 0));
    stream->Write = write_bytes;
    Call(PKImageEncode_Create_WMP(&encoder));
    Call(encoder->Initialize(encoder, stream, &parameters, sizeof(parameters)));
    Call(encoder->SetPixelFormat(encoder, *fixture->format));
    Call(encoder->SetSize(encoder, 3, 2));
    Call(encoder->SetResolution(encoder, 96, 96));
    Call(encoder->WritePixels(encoder, 2, pixels, stride));
    char filename[1024];
    snprintf(filename, sizeof(filename), "%s/%s.jxr", directory, fixture->name);
    FILE* file = fopen(filename, "wb");
    if (!file) { err = WMP_errFileIO; goto Cleanup; }
    fwrite(output, 1, output_size, file); fclose(file);
Cleanup:
    if (encoder && encoder->pStream) { encoder->Release(&encoder); stream = NULL; }
    else if (encoder) { PKFree((void**)&encoder); }
    if (stream) { stream->Close(&stream); }
    release_result();
    return err;
}

int main(int argc, char** argv)
{
    if (argc != 2) { return 2; }
    for (size_t i = 0; i < sizeof(fixtures) / sizeof(fixtures[0]); ++i) {
        ERR err = generate(&fixtures[i], argv[1]);
        if (err) { fprintf(stderr, "%s: %ld\n", fixtures[i].name, (long)err); return 1; }
    }
    return 0;
}
