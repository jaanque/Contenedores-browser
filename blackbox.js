
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
                <p>Estado: ${container.state}</p>
                <p>RAM: ${container.ram} MB</p>
                <!-- Aquí se puede añadir más información -->
            </div>
        `;
        containerList.appendChild(containerElement);

        const titleElement = containerElement.querySelector('.title');
        const infoElement = containerElement.querySelector('.info');

        titleElement.addEventListener('click', () => {
            infoElement.style.display = infoElement.style.display === 'block' ? 'none' : 'block';
        });
    });
});
