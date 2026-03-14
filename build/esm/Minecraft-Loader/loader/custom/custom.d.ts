/**
 * @author Industrium
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 *
 * Custom loader installer – fully independent of Forge/Fabric/NeoForge/Quilt.
 * Supports any loader that follows the standard JAR installer pattern:
 *   java -jar installer.jar --installClient --installDir <mcRoot>
 */
import { EventEmitter } from 'events';
import { LoaderOptions, LoaderResult } from '../../index.js';
export default class CustomLoader extends EventEmitter {
    private readonly options;
    constructor(options: LoaderOptions);
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
    downloadAndInstall(): Promise<LoaderResult>;
}
