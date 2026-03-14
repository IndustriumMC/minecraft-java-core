/**
 * @author Industrium
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 *
 * Custom loader installer – fully independent of Forge/Fabric/NeoForge/Quilt.
 * Supports any loader that follows the standard JAR installer pattern:
 *   java -jar installer.jar --installClient --installDir <mcRoot>
 */
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import Downloader from '../../../utils/Downloader.js';
export default class CustomLoader extends EventEmitter {
    constructor(options) {
        super();
        this.options = options;
    }
    /**
     * Full install flow for a custom loader:
     *  1. Fetch version list from customUrls.metaData
     *  2. Select version based on loader.build ('latest' = first entry)
     *  3. Download installer JAR
     *  4. Snapshot versions/ directory
     *  5. Run: java -jar installer.jar --installClient --installDir <mcRoot>
     *  6. Detect newly created version directory
     *  7. Read and return the version JSON
     */
    async downloadAndInstall() {
        const { customUrls, build, config } = this.options.loader;
        if (!customUrls) {
            return { error: 'customUrls is required for custom loader type' };
        }
        // 1. Fetch version list
        let versions;
        try {
            const res = await fetch(customUrls.metaData);
            if (!res.ok) {
                return { error: `Failed to fetch loader metadata: HTTP ${res.status}` };
            }
            const data = await res.json();
            versions = data.versions;
            if (!Array.isArray(versions) || versions.length === 0) {
                return { error: 'No versions found in loader metadata' };
            }
        }
        catch (err) {
            return { error: `Failed to fetch loader metadata: ${err.message}` };
        }
        // 2. Select version
        let selectedVersion;
        if (!build || build === 'latest') {
            selectedVersion = versions[0];
        }
        else {
            const found = versions.find(v => v === build);
            if (!found) {
                return { error: `Version '${build}' not found in loader metadata. Available: ${versions.join(', ')}` };
            }
            selectedVersion = found;
        }
        // 3. Build installer URL and download
        const installerUrl = customUrls.install.replace('${version}', selectedVersion);
        const tempDir = path.resolve(this.options.path, 'temp');
        const installerFileName = `custom-installer-${selectedVersion}.jar`;
        const installerPath = path.join(tempDir, installerFileName);
        const downloader = new Downloader();
        downloader.on('progress', (downloaded, total) => {
            this.emit('progress', downloaded, total, 'custom-installer');
        });
        try {
            await downloader.downloadFile(installerUrl, tempDir, installerFileName);
        }
        catch (err) {
            return { error: `Failed to download installer: ${err.message}` };
        }
        // 4. Determine Minecraft root from minecraftJar path
        //    config.minecraftJar = <mcRoot>/versions/<ver>/<ver>.jar
        const mcRoot = path.dirname(path.dirname(path.dirname(config.minecraftJar)));
        const versionsDir = path.resolve(mcRoot, 'versions');
        if (!fs.existsSync(versionsDir)) {
            fs.mkdirSync(versionsDir, { recursive: true });
        }
        // Snapshot versions/ before install
        const versionsBefore = new Set(fs.readdirSync(versionsDir));
        // Ensure launcher_profiles.json exists — some installers (Forge/NeoForge-based) require it
        const launcherProfilesPath = path.resolve(mcRoot, 'launcher_profiles.json');
        if (!fs.existsSync(launcherProfilesPath)) {
            fs.writeFileSync(launcherProfilesPath, JSON.stringify({
                profiles: {},
                selectedProfile: '(Default)',
                clientToken: '00000000000000000000000000000000',
                authenticationDatabase: {},
                launcherVersion: { format: 21, name: '2.1.1349', profilesFormat: 2 }
            }, null, 2));
        }
        // 5. Run installer subprocess
        this.emit('extract', `Running custom loader installer (version ${selectedVersion})...`);
        const exitCode = await new Promise((resolve) => {
            const proc = spawn(config.javaPath, ['-jar', installerPath, '--installClient', mcRoot], { cwd: mcRoot });
            const timer = setTimeout(() => {
                proc.kill();
                resolve(1);
            }, 120000);
            proc.stdout?.on('data', (data) => {
                this.emit('data', data.toString('utf-8'));
            });
            proc.stderr?.on('data', (data) => {
                this.emit('data', data.toString('utf-8'));
            });
            proc.on('close', (code) => {
                clearTimeout(timer);
                resolve(code ?? 1);
            });
            proc.on('error', () => {
                clearTimeout(timer);
                resolve(1);
            });
        });
        if (exitCode !== 0) {
            return { error: `Custom loader installer exited with code ${exitCode}` };
        }
        // 6. Detect newly installed version directory
        const versionsAfter = fs.readdirSync(versionsDir);
        const newVersions = versionsAfter.filter(v => !versionsBefore.has(v));
        if (newVersions.length === 0) {
            return { error: 'Installer ran successfully but no new version directory was created in versions/' };
        }
        const versionId = newVersions[0];
        const versionJsonPath = path.resolve(versionsDir, versionId, `${versionId}.json`);
        if (!fs.existsSync(versionJsonPath)) {
            return { error: `Version JSON not found at expected path: ${versionJsonPath}` };
        }
        // 7. Read and return version JSON
        let versionJson;
        try {
            versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));
        }
        catch (err) {
            return { error: `Failed to read version JSON: ${err.message}` };
        }
        // Cleanup temp installer JAR (non-critical)
        try {
            fs.rmSync(installerPath);
        }
        catch (_) { /* ignore */ }
        return versionJson;
    }
}
//# sourceMappingURL=custom.js.map