
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
                <p>Uptime: ${container.uptime}</p>
                <button class="kill-btn" data-pid="${container.pid}">Terminar Proceso</button>
            </div>
        `;
        containerList.appendChild(containerElement);
    });

    document.querySelectorAll('.kill-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const pid = e.target.dataset.pid;
            ipcRenderer.send('kill-process', pid);
        });
    });
});

ipcRenderer.on('log-event', (event, message) => {
    const logContainer = document.getElementById('event-log');
    const logEntry = document.createElement('div');
    logEntry.textContent = message;
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
});
