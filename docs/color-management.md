# Color management

paint.js edits and composites 8-bit sRGB canvas pixels. When opening PNG, JPEG,
WebP, TIFF, AVIF or JPEG XL with an embedded ICC profile, the portable ImageMagick
codec converts the source pixels to sRGB before importing them into the document.
It retains the source profile separately from the working pixels. Untagged images
continue through the existing decoder path.

Image → Color Profile displays the working space, source profile description and
chosen export profile. Choose an RGB `.icc`/`.icm` file to change the export
profile, or choose sRGB to restore standard output. Changing this preference is
undoable and marks the document modified. It does not reinterpret existing sRGB
pixels. ICC input is limited to 16 MiB; invalid profiles are reported in the dialog.

PNG, JPEG, WebP, TIFF, AVIF and JPEG XL exports transform sRGB pixels to the chosen
RGB profile and embed its bytes. JPEG still flattens transparency on white and
respects quality/subsampling; TIFF retains its compression/channel options.
Other formats retain the existing sRGB output behavior. Native PDN preserves both
source and export profile settings as string metadata, including after resizing
or transforming the document and reopening it. CMYK input profiles can be
converted to sRGB; selecting CMYK/gray export profiles is not supported.

Conversion uses the bundled Little CMS-generated sRGB profile and the bundled
ImageMagick color management engine. It is a pixel conversion, not just ICC tag
replacement. The source profile can describe colors outside the sRGB gamut;
conversion to the 8-bit working space can clip them. This is not HDR, soft
proofing, monitor-profile configuration or a wide-gamut editing mode. Metadata
other than the retained ICC profiles is not generally preserved in raster exports.

Reference: [ImageMagick color management](https://imagemagick.org/color-management/).
