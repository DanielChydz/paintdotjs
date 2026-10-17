module.exports = async function checkModernCodecs() {
    let check = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    let canvas = document.createElement('canvas');
    canvas.width = 35;
    canvas.height = 33;
    let context = canvas.getContext('2d');
    let image = context.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            image.data.set([x * 7, y * 7, (x + y) * 3, Math.round(x * 255 / 34)], (y * canvas.width + x) * 4);
        }
    }
    context.putImageData(image, 0, 0);
    let expected = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let png = new Uint8Array(await (await ImageEncoder.encode(canvas, 'png')).arrayBuffer());
    let sizes = {};
    for (let format of ['heic', 'heif', 'jxr', 'wdp', 'wmp']) {
        for (let quality of [0, 90, 100]) {
            let bytes = await window.portableImageCodec.encode(png, format, quality);
            check(bytes.length > 32, 'Empty encoded image: ' + format);
            if (format === 'heic' || format === 'heif') {
                check(String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp'
                    && String.fromCharCode(...bytes.slice(8, 12)) === 'heic', 'HEIC is not HEVC in a HEIF container');
            } else {
                check(bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0xbc,
                    'JPEG XR has the wrong signature');
            }
            let decoded = await window.portableImageCodec.decode(bytes, format);
            check(decoded.width === canvas.width && decoded.height === canvas.height, 'Odd image dimensions changed: ' + format);
            let alphaError = 0;
            for (let i = 3; i < expected.length; i += 4) {
                alphaError += Math.abs(expected[i] - decoded.rgba[i]);
            }
            if (format === 'heic' || format === 'heif') {
                if (quality === 100) {
                    check(alphaError === 0, 'HEIC quality 100 changed alpha');
                } else if (quality === 90) {
                    check(alphaError / (canvas.width * canvas.height) < 3, 'HEIC lost alpha at default quality');
                }
            } else {
                check(alphaError === 0, 'JPEG XR changed lossless alpha');
                if (quality === 100) {
                    check(decoded.rgba.every((value, i) => value === expected[i]), 'Lossless JPEG XR changed RGBA pixels');
                }
            }
            sizes[format + quality] = bytes.length;
        }
        check(sizes[format + 0] < sizes[format + 100], 'Quality does not control encoded size: ' + format);
    }

    // Exercise the actual save dialog and preview path from both screenshots.
    for (let format of ['heic', 'jxr']) {
        let pending = SaveImageDialog.open({canvas, initialFormat: format,
            encode: (format, options) => ImageEncoder.encode(canvas, format, options)});
        let dialog = document.querySelector('.save-config-dialog');
        let preview = dialog.querySelector('.save-config-preview-stage img');
        let deadline = performance.now() + 10000;
        while (preview.naturalWidth !== canvas.width) {
            check(performance.now() < deadline, 'Save preview timed out: ' + format
                + ' ' + dialog.querySelector('.save-config-status').textContent);
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        check(dialog.querySelector('.save-config-status').textContent === '', 'Save preview failed: ' + format);
        dialog.requestSubmit();
        let saved = await pending;
        check(saved.format === format && saved.blob.size > 32, 'Save dialog did not return encoded bytes: ' + format);
    }

    // Tiny transparent files must remain valid, including codec block padding.
    canvas.width = 1;
    canvas.height = 1;
    for (let format of ['heic', 'jxr']) {
        let blob = await ImageEncoder.encode(canvas, format, {quality: 90});
        let decoded = await window.portableImageCodec.decode(new Uint8Array(await blob.arrayBuffer()), format);
        check(decoded.width === 1 && decoded.height === 1 && decoded.rgba[3] === 0,
            'Tiny transparent image was lost: ' + format);
    }
    canvas.width = 0;
    canvas.height = 0;
};
