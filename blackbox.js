
const { ipcRenderer } = require('electron');
const containerList = document.getElementById('container-list');
const totalRamElement = document.getElementById('total-ram');

ipcRenderer.on('update-containers', (event, containers, totalRam) => {
    containerList.innerHTML = '';
    totalRamElement.textContent = totalRam;

    containers.forEach(container => {
        const containerElement = document.createElement('div');
        containerElement.className = 'container';
        containerElement.innerHTML = `
            <div class="title">${container.title}</div>
            <div class="info">
                <p>ID: ${container.id}</p>
                <p>PID: ${container.pid}</p>
                <p>URL: ${container.url}</p>
                <p>Estado: ${container.state}</p>
                <p>RAM: ${container.ram} MB</p>
            </div>
        `;
        containerList.appendChild(containerElement);
    });
});

ipcRenderer.on('log-event', (event, message) => {
    const logContainer = document.getElementById('event-log');
    const logEntry = document.createElement('div');
    logEntry.textContent = message;
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
});
