const state = require('./state');

function systemLog(type, message) {
    if (state.blackBoxView) {
        state.blackBoxView.webContents.send('log-data', { type, message });
    } else {
        console.log(`[${type}] ${message}`);
    }
}

module.exports = { systemLog };