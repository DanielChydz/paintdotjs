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

class DocumentWorkspaceAction extends Action {

    constructor(
        actionId,
        nameTranslationId,
        descriptionTranslationId,
        shortcutKeyCombo
    ) {
        super(
            actionId,
            nameTranslationId,
            descriptionTranslationId,
            shortcutKeyCombo
        );
    }

    runPerformAction() {
        let app = window.app;
        let documentWorkspace = app.getActiveDocumentWorkspace();
        if (documentWorkspace !== null && this.isActionExecutable(documentWorkspace)) {
            documentWorkspace.performAction(this);
        }
    }

    runIsActionExecutable() {
        let app = window.app;
        let documentWorkspace = app.getActiveDocumentWorkspace();
        return documentWorkspace !== null && this.isActionExecutable(documentWorkspace);
    }

    performAction(documentWorkspace) {
        throw new Error("No action implementation provided for " + this.getActionId());
    }

    isActionExecutable(documentWorkspace) {
        return true;
    }

}
