/**
 * @author Luuxis
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 */
import prompt from 'prompt';
module.exports = async function (url) {
    console.log(`Open brosser ${url}`);
    prompt.start();
    let result = await prompt.get(['copy-URL']);
    return result['copy-URL'].split("code=")[1].split("&")[0];
};
//# sourceMappingURL=Terminal.js.map