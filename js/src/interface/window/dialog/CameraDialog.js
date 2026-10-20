/*
 * paint.js, an unofficial JavaScript port of Paint.NET 3.36.7
 *
 * Original Paint.NET source:
 * Copyright (C) dotPDN LLC, Rick Brewster, and contributors.
 *
 * JavaScript port and port-specific changes:
 * Copyright (C) 2024-present LabyStudio.
 * https://github.com/LabyStudio
 *
 * The interface design and behavior target Paint.NET 5.1.12+.
 * Licensed under LICENSE.md. See NOTICE.md for full attribution.
 */

class CameraDialog {

    static activePromise = null;

    static open() {
        if (this.activePromise !== null) {
            return this.activePromise;
        }
        this.activePromise = this.show().finally(() => {
            this.activePromise = null;
        });
        return this.activePromise;
    }

    static show() {
        return new Promise(resolve => {
            let stream = null;
            let closed = false;
            let capturing = false;
            let mover = null;
            let video;
            let status;
            let start;
            let capture;
            let titleBar;
            let releaseStream = () => {
                if (stream !== null) {
                    for (let track of stream.getTracks()) {
                        track.removeEventListener("ended", onEnded);
                        track.stop();
                    }
                    stream = null;
                }
                video.pause();
                video.srcObject = null;
            };
            let finish = file => {
                if (closed) {
                    return;
                }
                closed = true;
                releaseStream();
                document.removeEventListener("keydown", onKeyDown, true);
                window.removeEventListener("pagehide", onPageHide);
                mover.destroy();
                backdrop.remove();
                resolve(file);
            };
            let onKeyDown = event => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    finish(null);
                }
            };
            let onPageHide = () => finish(null);
            let showError = error => {
                status.setAttribute("role", "alert");
                status.textContent = CameraDialog.errorMessage(error);
            };
            let onEnded = () => {
                releaseStream();
                capture.disabled = true;
                start.disabled = false;
                showError(new Error("The camera was disconnected or stopped. Connect it and try again."));
            };
            let updateReady = (showStatus = true) => {
                if (closed || stream === null || capturing) {
                    return;
                }
                capture.disabled = video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0;
                if (!capture.disabled && showStatus) {
                    status.textContent = "Camera ready. Take a photo or cancel.";
                    status.setAttribute("role", "status");
                }
            };

            let backdrop = document.createElement("div");
            backdrop.className = "app-dialog-backdrop camera-backdrop";
            if (isApp) {
                backdrop.classList.add("dialog-backdrop-app");
            }
            {
                let dialog = document.createElement("form");
                dialog.className = "app-dialog camera-dialog";
                dialog.setAttribute("role", "dialog");
                dialog.setAttribute("aria-modal", "true");
                dialog.setAttribute("aria-label", "From Camera");
                backdrop.appendChild(dialog);
                {
                    // Title
                    titleBar = document.createElement("header");
                    titleBar.className = "app-dialog-title-bar";
                    dialog.appendChild(titleBar);
                    {
                        let title = document.createElement("strong");
                        title.textContent = "From Camera";
                        titleBar.appendChild(title);
                        let close = document.createElement("button");
                        close.type = "button";
                        close.className = "app-dialog-close";
                        close.textContent = "\u00d7";
                        close.title = "Close";
                        close.onclick = () => finish(null);
                        titleBar.appendChild(close);
                    }
                    // Preview
                    let content = document.createElement("div");
                    content.className = "camera-content";
                    dialog.appendChild(content);
                    {
                        video = document.createElement("video");
                        video.autoplay = true;
                        video.muted = true;
                        video.playsInline = true;
                        video.setAttribute("aria-label", "Live camera preview");
                        video.addEventListener("loadeddata", updateReady);
                        video.addEventListener("resize", updateReady);
                        content.appendChild(video);
                        status = document.createElement("p");
                        status.setAttribute("role", "status");
                        status.textContent = "Start the camera to request access. Audio is never requested.";
                        content.appendChild(status);
                    }
                    // Actions
                    let footer = document.createElement("footer");
                    footer.className = "app-dialog-footer";
                    dialog.appendChild(footer);
                    {
                        start = document.createElement("button");
                        start.type = "button";
                        start.textContent = "Start Camera";
                        footer.appendChild(start);
                        capture = document.createElement("button");
                        capture.type = "submit";
                        capture.textContent = "Take Photo";
                        capture.disabled = true;
                        footer.appendChild(capture);
                        let cancel = document.createElement("button");
                        cancel.type = "button";
                        cancel.textContent = "Cancel";
                        cancel.onclick = () => finish(null);
                        footer.appendChild(cancel);
                    }
                    start.onclick = async () => {
                        if (start.disabled) {
                            return;
                        }
                        start.disabled = true;
                        status.textContent = "Waiting for camera permission and video...";
                        status.setAttribute("role", "status");
                        try {
                            let acquired = await navigator.mediaDevices.getUserMedia({video: true, audio: false});
                            if (closed) {
                                for (let track of acquired.getTracks()) {
                                    track.stop();
                                }
                                return;
                            }
                            stream = acquired;
                            for (let track of stream.getTracks()) {
                                track.addEventListener("ended", onEnded);
                            }
                            video.srcObject = stream;
                            await video.play();
                            updateReady();
                        } catch (error) {
                            if (!closed) {
                                releaseStream();
                                start.disabled = false;
                                showError(error);
                            }
                        }
                    };
                    dialog.onsubmit = async event => {
                        event.preventDefault();
                        if (capture.disabled || capturing || closed) {
                            return;
                        }
                        capturing = true;
                        capture.disabled = true;
                        try {
                            let canvas = document.createElement("canvas");
                            canvas.width = video.videoWidth;
                            canvas.height = video.videoHeight;
                            let context = canvas.getContext("2d");
                            if (context === null) {
                                throw new Error("Could not allocate a photo canvas.");
                            }
                            context.drawImage(video, 0, 0);
                            let blob = await new Promise(resolveBlob => canvas.toBlob(resolveBlob, "image/png"));
                            if (blob === null) {
                                throw new Error("Could not encode the camera photo.");
                            }
                            if (!closed) {
                                Object.defineProperty(blob, "name", {value: "Camera.png"});
                                finish(blob);
                            }
                        } catch (error) {
                            if (!closed) {
                                showError(error);
                            }
                        } finally {
                            capturing = false;
                            updateReady(false);
                        }
                    };
                }
            }
            document.body.appendChild(backdrop);
            mover = new DialogMover(backdrop.firstElementChild, titleBar, backdrop);
            document.addEventListener("keydown", onKeyDown, true);
            window.addEventListener("pagehide", onPageHide);
            if (navigator.mediaDevices?.getUserMedia === undefined) {
                start.disabled = true;
                showError(new Error("Camera access is unavailable. Use a supported browser over HTTPS or localhost, or a desktop installation with camera access."));
            }
            start.focus();
        });
    }

    static errorMessage(error) {
        switch (error.name) {
            case "NotAllowedError":
            case "SecurityError":
                return "Camera access was denied. Allow camera access in browser or system privacy settings and try again.";
            case "NotFoundError":
            case "OverconstrainedError":
                return "No usable camera was found. Connect a camera and try again.";
            case "NotReadableError":
                return "The camera could not be started. It may be in use by another application.";
            default:
                return "Camera capture failed: " + error.message;
        }
    }
}
