const { ipcRenderer } = require('electron');
const container = document.getElementById('logs');
const containersTableBody = document.querySelector('#containers-table tbody');
let containers = 0;
let threats = 0;

ipcRenderer.on('log-data', (event, data) => {
    if (data.message.includes('Allocating Container')) {
        // containers++; // Handled by table update
    }
    if (data.message.includes('Destroying Container')) {
        // containers = Math.max(0, containers - 1); // Handled by table update
    }
    if (data.type === 'THREAT' || data.message.includes('BLOCKED')) {
        threats++;
        document.getElementById('count-threats').innerText = threats;
    }

    const row = document.createElement('div');
    row.className = 'log-entry';
    const time = new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + Math.floor(Math.random() * 999);

    row.innerHTML = `<span class="ts">${time}</span><span class="badge type-${data.type}">${data.type}</span><span class="msg">${data.message}</span>`;
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
});

// Update Containers Table
function updateContainers() {
    ipcRenderer.send('get-containers');
}

ipcRenderer.on('containers-data', (e, data) => {
    containers = data.length;
    document.getElementById('count-containers').innerText = containers;

    containersTableBody.innerHTML = '';
    data.forEach(c => {
        const tr = document.createElement('tr');

        // Calculate Uptime
        const uptimeSeconds = Math.floor((Date.now() - c.creationTime) / 1000);
        const uptime = `${Math.floor(uptimeSeconds / 60)}m ${uptimeSeconds % 60}s`;

        // TTL Display
        let ttlDisplay = '∞';
        if (c.ttl > 0) {
            const timeLeft = Math.max(0, Math.floor((c.creationTime + c.ttl - Date.now()) / 1000));
            ttlDisplay = `${Math.floor(timeLeft / 60)}m ${timeLeft % 60}s`;
        }

        tr.innerHTML = `
            <td>${c.id.substring(0, 8)}...</td>
            <td>${c.profile}</td>
            <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.title}</td>
            <td>${c.proxy || 'Direct'}</td>
            <td>${ttlDisplay}</td>
            <td>${uptime}</td>
            <td>
                <button class="action-btn" onclick="regenerate('${c.id}')">Regenerate</button>
                <button class="action-btn danger" onclick="closeContainer('${c.id}')">Kill</button>
            </td>
        `;
        containersTableBody.appendChild(tr);
    });
});

window.regenerate = (id) => ipcRenderer.send('regenerate-container', id);
window.closeContainer = (id) => ipcRenderer.send('close-tab', id);

// Poll for updates
setInterval(updateContainers, 2000);
updateContainers();
