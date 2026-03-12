import { EventEmitter } from "events";
export default class MinecraftLogging extends EventEmitter {
    private options;
    private loggingPath;
    constructor(options: any);
    getLogging(json: any): Promise<void>;
}
