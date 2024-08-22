document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('video');
    const startVideoButton = document.getElementById('startVideo');
    const captureButton = document.getElementById('capture');
    const stopVideoButton = document.getElementById('stopVideo');
    const resultsTable = document.getElementById('resultsTable').getElementsByTagName('tbody')[0];
    const overlay = document.getElementById('overlay');
    const context = overlay.getContext('2d');

    // Load statuses after initializing resultsTable
    loadStatus();

    updateDateHeader(); 

    // Load face-api.js models
    Promise.all([
        faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.ssdMobilenetv1.loadFromUri('/models')
    ]).then(start);

    function start() {
        startVideoButton.addEventListener('click', startVideo);
        captureButton.addEventListener('click', captureImage);
        stopVideoButton.addEventListener('click', stopVideo);
    }

    function startVideo() {
        navigator.mediaDevices.getUserMedia({ video: {} })
            .then(stream => {
                video.srcObject = stream;
            })
            .catch(err => console.error(err));
    }

    function stopVideo() {
        const stream = video.srcObject;
        if (stream) {
            const tracks = stream.getTracks();
            tracks.forEach(track => track.stop());
            video.srcObject = null;
        }
    }

    async function captureImage() {
        overlay.width = 320;
        overlay.height = 240;
        context.drawImage(video, 0, 0, overlay.width, overlay.height);

        const detections = await faceapi.detectAllFaces(overlay).withFaceLandmarks().withFaceDescriptors();
        const resizedDetections = faceapi.resizeResults(detections, { width: overlay.width, height: overlay.height });

        const labeledFaceDescriptors = await loadLabeledImages();
        const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);
        const results = resizedDetections.map(d => faceMatcher.findBestMatch(d.descriptor));

        // Avoid duplicate entries for the same person in the same capture
        const uniqueResults = new Set();
        results.forEach(result => uniqueResults.add(result.label));

        updateResultsTable(Array.from(uniqueResults));
        updateMissingStatuses(Array.from(uniqueResults));

        results.forEach((result, i) => {
            const box = resizedDetections[i].detection.box;
            const drawBox = new faceapi.draw.DrawBox(box, { label: result.toString() });
            drawBox.draw(overlay);
        });
    }

    function updateResultsTable(results) {
        results.forEach(label => {
            const personRow = Array.from(resultsTable.rows).find(row => row.cells[0].textContent === label);
            if (personRow) {
                const nextAvailableCellIndex = getNextAvailableIndex(personRow);
                if (nextAvailableCellIndex !== -1) {
                    personRow.cells[nextAvailableCellIndex].textContent = '✔️'; // Changed to a check mark
                }
            }
            updateStatistics(personRow); // Update statistics after each update
        });
        saveStatus();
    }

    function updateMissingStatuses(results) {
        const detectedLabels = results;
        Array.from(resultsTable.rows).forEach(row => {
            const personName = row.cells[0].textContent;
            if (personName && !detectedLabels.includes(personName)) {
                const nextAvailableCellIndex = getNextAvailableIndex(row);
                if (nextAvailableCellIndex !== -1) {
                    row.cells[nextAvailableCellIndex].textContent = '❌'; // Changed to a cross mark
                }
            }
            updateStatistics(row); // Update statistics after each update
        });

        saveStatus();
    }

    function getNextAvailableIndex(row) {
        for (let i = 1; i < row.cells.length - 1; i++) { // Exclude the last column (statistics)
            if (!row.cells[i].textContent || row.cells[i].textContent.trim() === '') {
                return i;
            }
        }
        return -1;
    }

    function updateStatistics(row) {
        const cells = row.cells;
        let presentCount = 0;
        for (let i = 1; i < cells.length - 1; i++) { // Exclude the last column (statistics)
            if (cells[i].textContent === '✔️') {
                presentCount++;
            }
        }
        cells[cells.length - 1].textContent = presentCount; // Set the statistics in the last column
    }

    function saveStatus() {
        const headerDates = [];
        const statuses = {};
        // تخزين محتويات خلايا الرأس (التواريخ)
        const headerCells = document.querySelectorAll('thead th');
        headerCells.forEach((cell, index) => {
            if (index > 0) { // تجاوز أول خلية (الاسم)
                headerDates.push(cell.textContent || '');
            }
        });
        Array.from(resultsTable.rows).forEach(row => {
            const cells = row.cells;
            const name = cells[0].textContent;
            statuses[name] = [];
            for (let j = 1; j < cells.length; j++) {
                statuses[name].push(cells[j].textContent || '');
            }
        });
        localStorage.setItem('faceRecognitionStatuses', JSON.stringify(statuses));
        localStorage.setItem('headerDates', JSON.stringify(headerDates));
    }

    function loadStatus() {
        const savedHeaderDates = JSON.parse(localStorage.getItem('headerDates')) || [];

        // استعادة التواريخ في خلايا الرؤوس
        const headerCells = document.querySelectorAll('thead th');
        savedHeaderDates.forEach((date, index) => {
            if (index < headerCells.length - 1) { // تجاوز أول خلية (الاسم) والتأكد من عدم تجاوز عدد الخلايا
                headerCells[index + 1].textContent = date;
            }
        });
        const savedStatuses = JSON.parse(localStorage.getItem('faceRecognitionStatuses')) || {};
        Array.from(resultsTable.rows).forEach(row => {
            const cells = row.cells;
            const name = cells[0].textContent;
            const statuses = savedStatuses[name] || [];
            for (let j = 1; j < cells.length; j++) {
                cells[j].textContent = statuses[j - 1] || '';
            }
        });
    }

    function loadLabeledImages() {
        const labels = ['Black Widow', 'Captain America', 'Captain Marvel', 'EmanTalal', 'Hawkeye', 'Jim Rhodes', 'MurtadaRaad', 'Thor', 'Tony Stark'];
        return Promise.all(
            labels.map(async label => {
                const descriptions = [];
                for (let i = 1; i <= 2; i++) {
                    const img = await faceapi.fetchImage(`/labeled_images/${label}/${i}.jpg`);
                    const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
                    if (detections) {
                        descriptions.push(detections.descriptor);
                    }
                }
                return new faceapi.LabeledFaceDescriptors(label, descriptions);
            })
        );
    }

    function updateDateHeader() {
        const headerCells = document.querySelectorAll('thead th');
        
        const today = new Date();
        const day = today.getDate();
        const month = today.getMonth() + 1; 
        const formattedDate = `${day}/${month}`;
    
        for (let i = 1; i < headerCells.length; i++) {
            if (!headerCells[i].textContent || headerCells[i].textContent.trim() === '') {
                headerCells[i].textContent = `المحاضرة ${i} \n
                 ${formattedDate}`;
                break; 
            }
        }
    }
});
