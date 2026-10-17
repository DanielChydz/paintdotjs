# FIXME

- [x] Colors window: labels in the expanded RGB/HSV controls overlap the sliders and become clipped (including Green, Saturation, and Value). Check label widths, spacing, and alignment against the supplied screenshot.
- [x] Measurement units: the View menu displays untranslated keys (`measurementUnit.pixel.plural`, `measurementUnit.inch.plural`, and `measurementUnit.centimeter.plural`) instead of user-facing unit names. Check the translations and the unit labels used by the menu and selector.
- [x] HEIC save: selecting HEIC (`.heic`, `.heif`) in the save dialog produces “Preview unavailable” and `NoEncodeDelegateForThisImageFormat 'HEIC' @ error/constitute.c/WriteImage/1435` (reported at quality 90). Check encoder availability and whether the advertised save format is supported.
- [x] JPEG XR save: selecting JPEG XR (`.jxr`, `.wdp`, `.wmp`) in the save dialog produces “Preview unavailable” and `Unsupported image format: jxr` (reported at quality 90). Check save-format routing and encoder support for all advertised extensions.
