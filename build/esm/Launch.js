/**
 * @author Luuxis
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 */
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import jsonMinecraft from './Minecraft/Minecraft-Json.js';
import librariesMinecraft from './Minecraft/Minecraft-Libraries.js';
import assetsMinecraft from './Minecraft/Minecraft-Assets.js';
import loggingMinecraft from './Minecraft/Minecraft-Logging.js';
import loaderMinecraft from './Minecraft/Minecraft-Loader.js';
import javaMinecraft from './Minecraft/Minecraft-Java.js';
import bundleMinecraft from './Minecraft/Minecraft-Bundle.js';
import argumentsMinecraft from './Minecraft/Minecraft-Arguments.js';
import { isold } from './utils/Index.js';
import Downloader from './utils/Downloader.js';
export default class Launch extends EventEmitter {
    async Launch(opt) {
        const defaultOptions = {
            url: null,
            authenticator: null,
            timeout: 10000,
            path: '.Minecraft',
            version: 'latest_release',
            instance: null,
            detached: false,
            intelEnabledMac: false,
            downloadFileMultiple: 5,
            bypassOffline: false,
            loader: {
                path: './loader',
                type: null,
                build: 'latest',
                enable: false,
            },
            mcp: null,
            verify: false,
            ignored: [],
            JVM_ARGS: [],
            GAME_ARGS: [],
            java: {
                path: null,
                version: null,
                type: 'jre',
            },
            screen: {
                width: null,
                height: null,
                fullscreen: false,
            },
            memory: {
                min: '1G',
                max: '2G'
            },
            ...opt,
        };
        this.options = defaultOptions;
        this.options.path = path.resolve(this.options.path).replace(/\\/g, '/');
        if (this.options.mcp) {
            if (this.options.instance)
                this.options.mcp = `${this.options.path}/instances/${this.options.instance}/${this.options.mcp}`;
            else
                this.options.mcp = path.resolve(`${this.options.path}/${this.options.mcp}`).replace(/\\/g, '/');
        }
        if (this.options.loader.type) {
            this.options.loader.type = this.options.loader.type.toLowerCase();
            this.options.loader.build = this.options.loader.build.toLowerCase();
        }
        if (!this.options.authenticator)
            return this.emit("error", { error: "Authenticator not found" });
        if (this.options.downloadFileMultiple < 1)
            this.options.downloadFileMultiple = 1;
        if (this.options.downloadFileMultiple > 30)
            this.options.downloadFileMultiple = 30;
        if (typeof this.options.loader.path !== 'string')
            this.options.loader.path = `./loader/${this.options.loader.type}`;
        if (this.options.java.version && typeof this.options.java.type !== 'string')
            this.options.java.type = 'jre';
        this.start();
    }
    async start() {
        let data = await this.DownloadGame();
        if (data.error)
            return this.emit('error', data);
        let { minecraftJson, minecraftLoader, minecraftVersion, minecraftJava } = data;
        let minecraftArguments = await new argumentsMinecraft(this.options).GetArguments(minecraftJson, minecraftLoader);
        if (minecraftArguments.error)
            return this.emit('error', minecraftArguments);
        let loaderArguments = await new loaderMinecraft(this.options).GetArguments(minecraftLoader, minecraftVersion);
        if (loaderArguments.error)
            return this.emit('error', loaderArguments);
        let Arguments = [
            ...minecraftArguments.jvm,
            ...minecraftArguments.classpath,
            ...loaderArguments.jvm,
            minecraftArguments.mainClass,
            ...minecraftArguments.game,
            ...loaderArguments.game
        ];
        let java = this.options.java.path ? this.options.java.path : minecraftJava.path;
        let logs = this.options.instance ? `${this.options.path}/instances/${this.options.instance}` : this.options.path;
        if (!fs.existsSync(logs))
            fs.mkdirSync(logs, { recursive: true });
        let argumentsLogs = Arguments.join(' ');
        argumentsLogs = argumentsLogs.replaceAll(this.options.authenticator?.access_token, '????????');
        argumentsLogs = argumentsLogs.replaceAll(this.options.authenticator?.client_token, '????????');
        argumentsLogs = argumentsLogs.replaceAll(this.options.authenticator?.uuid, '????????');
        argumentsLogs = argumentsLogs.replaceAll(this.options.authenticator?.xboxAccount?.xuid, '????????');
        argumentsLogs = argumentsLogs.replaceAll(`${this.options.path}/`, '');
        this.emit('data', `Launching with arguments ${argumentsLogs}`);
        let minecraftDebug = spawn(java, Arguments, { cwd: logs, detached: this.options.detached });
        minecraftDebug.stdout.on('data', (data) => this.emit('data', data.toString('utf-8')));
        minecraftDebug.stderr.on('data', (data) => this.emit('data', data.toString('utf-8')));
        minecraftDebug.on('close', (code) => this.emit('close', 'Minecraft closed'));
    }
    async DownloadGame() {
        const InfoVersion = await new jsonMinecraft(this.options).GetInfoVersion();
        let loaderJson = null;
        if ('error' in InfoVersion)
            return this.emit('error', InfoVersion);
        const { json, version } = InfoVersion;
        const libraries = new librariesMinecraft(this.options);
        const bundle = new bundleMinecraft(this.options);
        const java = new javaMinecraft(this.options);
        java.on('progress', (progress, size, element) => {
            this.emit('progress', progress, size, element);
        });
        java.on('extract', (progress) => {
            this.emit('extract', progress);
        });
        const gameLibraries = await libraries.Getlibraries(json);
        const gameAssetsOther = await libraries.GetAssetsOthers(this.options.url);
        const gameAssets = await new assetsMinecraft(this.options).getAssets(json);
        await new loggingMinecraft(this.options).getLogging(json);
        const gameJava = this.options.java.path ? { files: [] } : await java.getJavaFiles(json);
        if (gameJava.error)
            return gameJava;
        const filesList = await bundle.checkBundle([...gameLibraries, ...gameAssetsOther, ...gameAssets, ...gameJava.files]);
        if (filesList.length > 0) {
            let downloader = new Downloader();
            let totsize = await bundle.getTotalSize(filesList);
            downloader.on("progress", (DL, totDL, element) => {
                this.emit("progress", DL, totDL, element);
            });
            downloader.on("speed", (speed) => {
                this.emit("speed", speed);
            });
            downloader.on("estimated", (time) => {
                this.emit("estimated", time);
            });
            downloader.on("error", (e) => {
                this.emit("error", e);
            });
            await downloader.downloadFileMultiple(filesList, totsize, this.options.downloadFileMultiple, this.options.timeout);
        }
        if (this.options.loader.enable === true) {
            const loaderInstall = new loaderMinecraft(this.options);
            loaderInstall.on('extract', (extract) => {
                this.emit('extract', extract);
            });
            loaderInstall.on('progress', (progress, size, element) => {
                this.emit('progress', progress, size, element);
            });
            loaderInstall.on('check', (progress, size, element) => {
                this.emit('check', progress, size, element);
            });
            loaderInstall.on('patch', (patch) => {
                this.emit('patch', patch);
            });
            loaderInstall.on('data', (data) => {
                this.emit('data', data);
            });
            const jsonLoader = await loaderInstall.GetLoader(version, this.options.java.path ? this.options.java.path : gameJava.path)
                .then((data) => data)
                .catch((err) => err);
            if (jsonLoader.error)
                return jsonLoader;
            loaderJson = jsonLoader;
        }
        if (this.options.verify)
            await bundle.checkFiles([...gameLibraries, ...gameAssetsOther, ...gameAssets, ...gameJava.files]);
        const natives = await libraries.natives(gameLibraries);
        if (natives.length === 0)
            json.nativesList = false;
        else
            json.nativesList = true;
        if (isold(json))
            new assetsMinecraft(this.options).copyAssets(json);
        return {
            minecraftJson: json,
            minecraftLoader: loaderJson,
            minecraftVersion: version,
            minecraftJava: gameJava
        };
    }
}
//# sourceMappingURL=Launch.js.map