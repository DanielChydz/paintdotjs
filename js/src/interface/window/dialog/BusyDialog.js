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

class BusyDialog {
    static run(app, operation) {
        if (app.busyOperation) {
            return app.busyOperation.then(() => this.run(app, operation));
        }
        app.busyOperation = this.perform(operation).finally(() => { app.busyOperation = null; });
        return app.busyOperation;
    }

    static async perform(operation) {
        let previousFocus = document.activeElement;
        let backdrop = document.createElement("div");
        backdrop.className = "app-dialog-backdrop busy-dialog-backdrop";
        document.body.appendChild(backdrop);
        {
            // Status
            let status = document.createElement("section");
            status.className = "app-dialog busy-dialog";
            status.setAttribute("role", "status");
            status.setAttribute("aria-live", "polite");
            status.setAttribute("aria-busy", "true");
            status.textContent = "Finishing transformation…";
            backdrop.appendChild(status);
        }
        ModalDialogController.sync();
        try {
            // Give the compositor a complete frame before synchronous CPU work.
            await new Promise(resolve => {
                let frame;
                let finish = () => {
                    clearTimeout(timer);
                    cancelAnimationFrame(frame);
                    resolve();
                };
                // Hidden windows may suspend animation frames entirely.
                let timer = setTimeout(finish, 300);
                frame = requestAnimationFrame(() => { frame = requestAnimationFrame(finish); });
            });
            return await operation();
        } finally {
            backdrop.remove();
            ModalDialogController.sync();
            if (!ModalDialogController.isActive()) {
                previousFocus?.focus({preventScroll: true});
            }
        }
    }
}
