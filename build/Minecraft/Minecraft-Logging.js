"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const Downloader_js_1 = __importDefault(require("../utils/Downloader.js"));
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
class MinecraftLogging extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.options = options;
        this.loggingPath = node_path_1.default.resolve(this.options.path, 'assets', 'log_configs');
    }
    async getLogging(json) {
        if (json.logging) {
            const logConfig = json.logging;
            const logConfigPath = node_path_1.default.join(this.loggingPath, logConfig.client.file.id);
            if (!node_fs_1.default.existsSync(logConfigPath)) {
                const downloaderInstance = new Downloader_js_1.default();
                await downloaderInstance.downloadFile(logConfig.client.file.url, node_path_1.default.dirname(logConfigPath), node_path_1.default.basename(logConfigPath));
            }
        }
    }
}
exports.default = MinecraftLogging;
//# sourceMappingURL=Minecraft-Logging.js.map