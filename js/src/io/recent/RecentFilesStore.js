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

class RecentFilesStore {
    static entries = [];
    static initialization = null;
    static pending = Promise.resolve();
    static limit = 10;

    static async request(mode, operation) {
        let database = await new Promise((resolve, reject) => {
            let request = indexedDB.open("paintdotjs-recent-files", 1);
            request.onupgradeneeded = () => request.result.createObjectStore("files", {keyPath: "id"});
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            return await new Promise((resolve, reject) => {
                let transaction = database.transaction("files", mode);
                let request = operation(transaction.objectStore("files"));
                transaction.oncomplete = () => resolve(request.result);
                transaction.onabort = () => reject(transaction.error || new Error("Recent files transaction aborted"));
                transaction.onerror = () => {}; // Abort owns the error/result.
            });
        } finally {
            database.close();
        }
    }

    static async load() {
        if (this.initialization === null) {
            this.initialization = this.request("readonly", store => store.getAll())
                .then(entries => { this.entries = entries.sort((a, b) => b.time - a.time).slice(0, this.limit); })
                .catch(error => console.warn("Could not load recent files", error));
        }
        await this.initialization;
        return this.entries;
    }

    static remember(name, path, handle = null) {
        return this.enqueue(async () => {
            if (path === null && handle === null) {
                return;
            }
            let id = path;
            if (handle !== null) {
                for (let entry of this.entries) {
                    if (entry.handle !== null && await this.sameHandle(handle, entry.handle)) {
                        id = entry.id;
                        break;
                    }
                }
            }
            id ??= crypto.randomUUID();
            let entry = {id, name, path, handle, time: Math.max(Date.now(), (this.entries[0]?.time || 0) + 1)};
            this.entries = [entry, ...this.entries.filter(previous => previous.id !== id)].slice(0, this.limit);
        }).catch(error => console.warn("Could not save recent files", error));
    }

    static async sameHandle(left, right) {
        try {
            return await left.isSameEntry(right);
        } catch (_) {
            return false;
        }
    }

    static clear() {
        return this.enqueue(() => { this.entries = []; });
    }

    static enqueue(operation) {
        let pending = this.pending.then(async () => {
            await this.load();
            let previous = this.entries;
            try {
                await operation();
                await this.request("readwrite", store => {
                    let request = store.clear();
                    for (let entry of this.entries) {
                        request = store.put(entry);
                    }
                    return request;
                });
            } catch (error) {
                this.entries = previous;
                throw error;
            }
        });
        this.pending = pending.catch(() => {});
        return pending;
    }
}
