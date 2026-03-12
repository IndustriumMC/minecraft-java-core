import { EventEmitter } from "events";
import downloader from "../utils/Downloader.js";
import path from "node:path";
import fs from "node:fs";
export default class MinecraftLogging extends EventEmitter {
    constructor(options) {
        super();
        this.options = options;
        this.loggingPath = path.resolve(this.options.path, 'assets', 'log_configs');
    }
    async getLogging(json) {
        if (json.logging) {
            const logConfig = json.logging;
            const logConfigPath = path.join(this.loggingPath, logConfig.client.file.id);
            if (!fs.existsSync(logConfigPath)) {
                const downloaderInstance = new downloader();
                await downloaderInstance.downloadFile(logConfig.client.file.url, path.dirname(logConfigPath), path.basename(logConfigPath));
            }
        }
    }
}
//# sourceMappingURL=Minecraft-Logging.js.map