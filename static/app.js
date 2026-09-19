// Firebase Configuration for live-tracker-c6dc1
const firebaseConfig = {
    apiKey: "AIzaSyAbPFjkvL7Be77nli4Ynb8YRJYQKzgTn5A",
    authDomain: "live-tracker-c6dc1.firebaseapp.com",
    projectId: "live-tracker-c6dc1",
    storageBucket: "live-tracker-c6dc1.firebasestorage.app",
    messagingSenderId: "344866134033",
    appId: "1:344866134033:web:90138343d234711c4779b0",
    measurementId: "G-RL5RTHZCY4"
};

// Initialize Firebase App & Analytics if available
let firebaseApp = null;
let firebaseAnalytics = null;
if (typeof firebase !== 'undefined') {
    try {
        firebaseApp = firebase.initializeApp(firebaseConfig);
        if (typeof firebase.analytics === 'function') {
            firebaseAnalytics = firebase.analytics();
        }
        console.log("Firebase initialized successfully with project:", firebaseConfig.projectId);
    } catch (e) {
        console.warn("Firebase initialization note:", e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Application State Variables
    let map = null;
    let ws = null;
    let complaintsData = [];
    let crewsData = [];
    let geofencesData = [];
    let selectedComplaintId = null;
    let currentFilter = 'all';
    let isReportModeActive = false;

    // Map Markers & Lines Registries
    const complaintMarkers = {};
    const crewMarkers = {};
    const crewTrails = {};
    const targetLines = {}; // Dotted lines from responding crew to complaint
    const geofenceLayers = [];

    // FontAwesome category icon mapping
    const CATEGORY_ICONS = {
        pothole: 'fa-road',
        sanitation: 'fa-trash-can',
        lighting: 'fa-lightbulb',
        water: 'fa-droplet',
        parking: 'fa-square-parking'
    };

    // Color definitions per category (matches style.css classes)
    const CATEGORY_COLORS = {
        pothole: '#ff7a00',    // Orange
        sanitation: '#00cc7a', // Green
        lighting: '#ffc107',   // Yellow
        water: '#0088ff',      // Blue
        parking: '#a900ff'     // Purple
    };

    // Initialize Modules
    initClock();
    initMap();
    initWebSocket();
    initEventListeners();

    // UTC Clock
    function initClock() {
        const clockEl = document.getElementById('utc-clock');
        setInterval(() => {
            const now = new Date();
            clockEl.textContent = now.toISOString().slice(11, 19) + ' UTC';
        }, 1000);
    }

    // Leaflet Map with CartoDB Dark Matter Tiles
    function initMap() {
        // Center on San Francisco Metro area (37.7749, -122.4194)
        map = L.map('map', {
            center: [37.7749, -122.4194],
            zoom: 14,
            zoomControl: false
        });

        // Add custom tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);

        // Add zoom control top right
        L.control.zoom({ position: 'topright' }).addTo(map);

        // Capture Map Click Event for Click-to-Report mode
        map.on('click', (e) => {
            if (isReportModeActive) {
                const lat = e.latlng.lat.toFixed(6);
                const lng = e.latlng.lng.toFixed(6);
                openReportModal(lat, lng);
                setReportMode(false);
            }
        });
    }

    // WebSocket Telemetry Connection
    function initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/tracking`;
        const statusEl = document.getElementById('connection-status');

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            statusEl.querySelector('.status-dot').className = 'status-dot connected';
            statusEl.querySelector('.status-text').textContent = 'LIVE WEBSOCKET';
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'INITIAL_STATE' || data.type === 'TELEMETRY_UPDATE') {
                updateDashboardState(data);
            }
        };

        ws.onclose = () => {
            statusEl.querySelector('.status-dot').className = 'status-dot disconnected';
            statusEl.querySelector('.status-text').textContent = 'DISCONNECTED (RECONNECTING...)';
            setTimeout(initWebSocket, 3000);
        };

        ws.onerror = (err) => {
            console.error('WebSocket Error:', err);
        };
    }

    // Sync state with incoming payload
    function updateDashboardState(payload) {
        complaintsData = payload.complaints || [];
        crewsData = payload.crews || [];
        const logs = payload.logs || [];
        const config = payload.config || {};
        geofencesData = payload.geofences || geofencesData;

        // Render Priority Zones once
        if (geofencesData.length > 0 && geofenceLayers.length === 0) {
            renderGeofencesOnMap(geofencesData);
        }

        // Draw entities
        renderComplaintMarkers(complaintsData);
        renderCrewMarkers(crewsData);
        
        // Sync lists
        renderComplaintsList(complaintsData);
        renderCrewsList(crewsData);
        
        // Stats and terminal
        updateQuickStats(complaintsData);
        updateLogStream(logs);

        // Sync Speed & Pause Toolbar States
        if (config.is_paused !== undefined) {
            const pauseBtnText = document.getElementById('pause-btn-text');
            const pauseBtn = document.getElementById('btn-pause-sim');
            if (config.is_paused) {
                pauseBtnText.textContent = 'Resume';
                pauseBtn.classList.add('active');
            } else {
                pauseBtnText.textContent = 'Pause';
                pauseBtn.classList.remove('active');
            }
        }
        if (config.speed_multiplier) {
            document.getElementById('sim-speed-slider').value = config.speed_multiplier;
            document.getElementById('speed-multiplier-label').textContent = `${config.speed_multiplier}x`;
        }

        // Sync Bottom HUD details if selected
        if (selectedComplaintId) {
            const c = complaintsData.find(item => item.id === selectedComplaintId);
            if (c) {
                updateHUD(c);
            } else {
                closeHUD();
            }
        }
    }

    // Render Complaints on the Leaflet Map
    function renderComplaintMarkers(complaints) {
        // Remove deleted markers
        Object.keys(complaintMarkers).forEach(id => {
            if (!complaints.some(c => c.id === id)) {
                map.removeLayer(complaintMarkers[id]);
                delete complaintMarkers[id];
            }
        });

        complaints.forEach(c => {
            const iconClass = CATEGORY_ICONS[c.category] || 'fa-circle-question';
            const statusClass = c.status.toLowerCase();
            const color = CATEGORY_COLORS[c.category] || '#ffffff';

            const markerHtml = `
                <div class="complaint-marker-wrapper ${statusClass}" style="--marker-color: ${color}">
                    <div class="marker-pulse"></div>
                    <div class="marker-core">
                        <i class="fa-solid ${iconClass}"></i>
                    </div>
                </div>
            `;

            const customIcon = L.divIcon({
                className: 'leaflet-complaint-marker',
                html: markerHtml,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });

            if (!complaintMarkers[c.id]) {
                const marker = L.marker([c.lat, c.lng], { icon: customIcon }).addTo(map);
                marker.bindTooltip(`<b>${c.title}</b> (${c.id})<br>Status: ${c.status}<br>Urgency: ${c.urgency}`, {
                    direction: 'top',
                    offset: [0, -10],
                    className: 'map-tooltip'
                });
                marker.on('click', () => {
                    selectComplaint(c.id);
                });
                complaintMarkers[c.id] = marker;
            } else {
                const marker = complaintMarkers[c.id];
                marker.setLatLng([c.lat, c.lng]);
                marker.setIcon(customIcon);
                marker.getTooltip().setContent(`<b>${c.title}</b> (${c.id})<br>Status: ${c.status}<br>Urgency: ${c.urgency}`);
            }
        });
    }

    // Render Active Municipal Crew Vehicles on Map
    function renderCrewMarkers(crews) {
        crews.forEach(crew => {
            const heading = crew.heading || 0;
            const statusClass = crew.status.toLowerCase();
            const color = CATEGORY_COLORS[crew.type] || '#ffffff';

            // Custom Rotatable Marker HTML representing municipal vehicles
            const markerHtml = `
                <div class="crew-marker-wrapper ${statusClass}" style="transform: rotate(${heading}deg); --crew-color: ${color};">
                    <div class="marker-arrow"></div>
                    <div class="crew-icon">
                        <i class="fa-solid fa-truck"></i>
                    </div>
                </div>
            `;

            const customIcon = L.divIcon({
                className: 'leaflet-crew-marker',
                html: markerHtml,
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });

            if (!crewMarkers[crew.id]) {
                const marker = L.marker([crew.lat, crew.lng], { icon: customIcon }).addTo(map);
                marker.bindTooltip(`<b>${crew.name}</b> (${crew.id})<br>Status: ${crew.status}<br>Fuel: ${crew.fuel}%`, {
                    direction: 'top',
                    offset: [0, -12],
                    className: 'map-tooltip'
                });
                crewMarkers[crew.id] = marker;

                // Create polyline trail for past crew path
                const trailPolyline = L.polyline([[crew.lat, crew.lng]], {
                    color: color,
                    weight: 3,
                    opacity: 0.5,
                    dashArray: '4, 6'
                }).addTo(map);
                crewTrails[crew.id] = trailPolyline;
            } else {
                const marker = crewMarkers[crew.id];
                marker.setLatLng([crew.lat, crew.lng]);
                marker.setIcon(customIcon);
                marker.getTooltip().setContent(`<b>${crew.name}</b> (${crew.id})<br>Status: ${crew.status}<br>Fuel: ${crew.fuel}%`);

                // Update past trail polyline
                if (crew.history && crew.history.length > 0) {
                    const latlngs = crew.history.map(h => [h.lat, h.lng]);
                    crewTrails[crew.id].setLatLngs(latlngs);
                }
            }

            // Draw line to active assigned complaint
            if (crew.status === 'RESPONDING' && crew.target_lat && crew.target_lng) {
                const routePoints = [[crew.lat, crew.lng], [crew.target_lat, crew.target_lng]];
                if (!targetLines[crew.id]) {
                    targetLines[crew.id] = L.polyline(routePoints, {
                        color: color,
                        weight: 2,
                        opacity: 0.6,
                        dashArray: '6, 10'
                    }).addTo(map);
                } else {
                    targetLines[crew.id].setLatLngs(routePoints);
                }
            } else {
                if (targetLines[crew.id]) {
                    map.removeLayer(targetLines[crew.id]);
                    delete targetLines[crew.id];
                }
            }
        });
    }

    // Render Complaints List in Left Sidebar
    function renderComplaintsList(complaints) {
        const container = document.getElementById('complaints-list');
        const searchTerm = document.getElementById('complaint-search').value.toLowerCase();
        
        document.getElementById('complaints-count').textContent = complaints.length;

        // Apply filters & search terms
        const filtered = complaints.filter(c => {
            const matchesFilter = (currentFilter === 'all') || (c.category === currentFilter);
            const matchesSearch = c.title.toLowerCase().includes(searchTerm) || 
                                  c.description.toLowerCase().includes(searchTerm) || 
                                  c.reporter.toLowerCase().includes(searchTerm) || 
                                  c.id.toLowerCase().includes(searchTerm);
            return matchesFilter && matchesSearch;
        });

        container.innerHTML = '';

        if (filtered.length === 0) {
            container.innerHTML = `<div class="empty-state">No complaints found.</div>`;
            return;
        }

        // Sort by status precedence (Pending > Assigned > In Progress > Resolved)
        const statusOrder = { 'PENDING': 0, 'IN_PROGRESS': 1, 'ASSIGNED': 2, 'RESOLVED': 3 };
        filtered.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

        filtered.forEach(c => {
            const card = document.createElement('div');
            card.className = `vehicle-card ${selectedComplaintId === c.id ? 'active' : ''}`;
            card.setAttribute('data-id', c.id);

            const iconClass = CATEGORY_ICONS[c.category] || 'fa-road';
            const urgencyClass = c.urgency.toLowerCase();
            const statusClass = c.status.toLowerCase();
            
            // Map status text clean labels
            let statusText = c.status;
            if (statusText === 'IN_PROGRESS') statusText = 'IN PROGRESS';

            let assignmentInfo = '';
            if (c.status === 'ASSIGNED' || c.status === 'IN_PROGRESS') {
                const assignedCrewName = crewsData.find(cr => cr.id === c.assigned_crew_id)?.name || 'Crew';
                assignmentInfo = `<div class="v-driver"><i class="fa-solid fa-helmet-safety"></i> ${assignedCrewName} responding</div>`;
            }

            card.innerHTML = `
                <div class="v-card-header">
                    <span class="v-title">
                        <i class="fa-solid ${iconClass} v-type-icon" style="color: ${CATEGORY_COLORS[c.category]}"></i> ${c.title}
                    </span>
                    <span class="v-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="v-driver" style="margin-bottom: 4px;"><i class="fa-regular fa-user"></i> Reported by ${c.reporter}</div>
                ${assignmentInfo}
                <div class="complaint-desc">${c.description}</div>
                <div class="v-metrics" style="grid-template-columns: repeat(2, 1fr); margin-top: 8px;">
                    <div class="v-metric-item">
                        <span class="m-lbl">ID / CATEGORY</span>
                        <span class="m-val" style="font-size:0.7rem; font-family:var(--font-mono)">${c.id} • ${c.category.toUpperCase()}</span>
                    </div>
                    <div class="v-metric-item">
                        <span class="m-lbl">URGENCY</span>
                        <span class="m-val text-${urgencyClass}">${c.urgency}</span>
                    </div>
                </div>
            `;

            card.addEventListener('click', () => {
                selectComplaint(c.id);
            });

            container.appendChild(card);
        });
    }

    // Render Crews List in Right Sidebar
    function renderCrewsList(crews) {
        const container = document.getElementById('crew-list');
        container.innerHTML = '';

        crews.forEach(crew => {
            const card = document.createElement('div');
            card.className = 'geofence-card';
            card.style.flexDirection = 'column';
            card.style.alignItems = 'stretch';
            card.style.gap = '6px';
            card.style.padding = '10px';

            const color = CATEGORY_COLORS[crew.type] || '#ffffff';
            let detailLine = 'Status: IDLE';
            if (crew.status === 'RESPONDING') {
                detailLine = `Responding to ${crew.assigned_complaint_id} (${Math.round(crew.speed)} km/h)`;
            } else if (crew.status === 'RESOLVING') {
                detailLine = `Resolving onsite (${Math.round(crew.resolving_timer)}s remaining)`;
            }

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:0.8rem; font-weight:700; display:flex; align-items:center; gap:6px;">
                        <i class="fa-solid fa-truck" style="color: ${color}"></i> ${crew.name}
                    </span>
                    <span class="v-badge ${crew.status.toLowerCase()}" style="font-size:0.6rem; padding: 1px 5px;">${crew.status}</span>
                </div>
                <div style="font-size:0.68rem; color:var(--text-muted); display:flex; justify-content:space-between;">
                    <span>${detailLine}</span>
                    <span>Fuel: ${crew.fuel}%</span>
                </div>
            `;
            container.appendChild(card);
        });
    }

    // Select Complaint, Center Map & Populate Bottom HUD details
    function selectComplaint(id) {
        selectedComplaintId = id;
        const c = complaintsData.find(item => item.id === id);
        if (!c) return;

        // Highlight selected card
        document.querySelectorAll('.vehicle-card').forEach(card => {
            card.classList.toggle('active', card.getAttribute('data-id') === id);
        });

        // Pan map smoothly to the incident coordinate
        map.flyTo([c.lat, c.lng], 15, { duration: 1.0 });

        // Show and populate Bottom HUD
        updateHUD(c);
        document.getElementById('telemetry-hud').classList.remove('hidden');
    }

    // Populate bottom HUD details
    function updateHUD(c) {
        document.getElementById('hud-type-icon').innerHTML = `<i class="fa-solid ${CATEGORY_ICONS[c.category] || 'fa-circle-exclamation'}" style="color: ${CATEGORY_COLORS[c.category]}"></i>`;
        document.getElementById('hud-name').textContent = c.title;
        document.getElementById('hud-id').textContent = c.id;
        document.getElementById('hud-reporter').textContent = `Reported by ${c.reporter}`;
        document.getElementById('hud-created').textContent = `Filed at ${c.created_at}`;

        document.getElementById('hud-category').textContent = c.category.toUpperCase();
        document.getElementById('hud-category').style.color = CATEGORY_COLORS[c.category];

        const urgencyEl = document.getElementById('hud-urgency');
        urgencyEl.textContent = c.urgency;
        urgencyEl.className = 'hud-gauge-value';
        urgencyEl.classList.add(`text-${c.urgency.toLowerCase()}`);

        const statusEl = document.getElementById('hud-status');
        statusEl.textContent = c.status.replace('_', ' ');
        statusEl.className = 'hud-gauge-value';
        statusEl.classList.add(`text-${c.status.toLowerCase() === 'in_progress' ? 'accent' : c.status.toLowerCase()}`);

        const assignedCrew = crewsData.find(cr => cr.id === c.assigned_crew_id);
        const crewEl = document.getElementById('hud-assigned-crew');
        if (assignedCrew) {
            crewEl.textContent = assignedCrew.name;
            crewEl.style.color = CATEGORY_COLORS[assignedCrew.type];
        } else {
            crewEl.textContent = 'Awaiting Dispatch';
            crewEl.style.color = 'var(--text-muted)';
        }

        // Render incident timeline logs
        const timelineList = document.getElementById('hud-timeline-list');
        timelineList.innerHTML = '';
        if (c.history && c.history.length > 0) {
            c.history.forEach(log => {
                const step = document.createElement('div');
                step.className = 'timeline-log-step';
                step.innerHTML = `
                    <span class="timeline-step-bullet"></span>
                    <span class="timeline-step-text">${log}</span>
                `;
                timelineList.appendChild(step);
            });
        }
    }

    // Close HUD Panel
    function closeHUD() {
        document.getElementById('telemetry-hud').classList.add('hidden');
        selectedComplaintId = null;
        document.querySelectorAll('.vehicle-card').forEach(card => card.classList.remove('active'));
    }

    // Draw Auto-Escalation Zone Circles on Map
    function renderGeofencesOnMap(geofences) {
        geofences.forEach(gf => {
            const circle = L.circle(gf.center, {
                color: gf.type === 'CRITICAL' ? '#ff3366' : '#ff7a00',
                fillColor: gf.type === 'CRITICAL' ? '#ff3366' : '#ff7a00',
                fillOpacity: 0.08,
                weight: 1.5,
                dashArray: '5, 5'
            }).addTo(map);

            circle.bindTooltip(`<b>${gf.name}</b><br>Escalation: ${gf.type}`, { permanent: false });
            geofenceLayers.push(circle);
        });
    }

    // Update Quick Stats panel labels
    function updateQuickStats(complaints) {
        const total = complaints.length;
        const pending = complaints.filter(c => c.status === 'PENDING').length;
        const inProgress = complaints.filter(c => c.status === 'IN_PROGRESS').length;
        const resolved = complaints.filter(c => c.status === 'RESOLVED').length;
        
        let satisfaction = 100;
        if (total > 0) {
            // Pending counts against citizen satisfaction
            satisfaction = Math.max(30, Math.min(100, Math.round((resolved / total) * 100 + (inProgress / total) * 20)));
        }

        document.getElementById('stat-total-complaints').textContent = total;
        document.getElementById('stat-pending-issues').textContent = pending;
        document.getElementById('stat-inprogress-issues').textContent = inProgress;
        document.getElementById('stat-resolved-issues').textContent = resolved;
        document.getElementById('stat-satisfaction').textContent = `${satisfaction}%`;
        
        const satisfactionEl = document.getElementById('stat-satisfaction');
        if (satisfaction < 60) {
            satisfactionEl.className = 'stat-value text-danger';
        } else if (satisfaction < 85) {
            satisfactionEl.className = 'stat-value text-warning';
        } else {
            satisfactionEl.className = 'stat-value text-success';
        }
    }

    // Live Operational Logs Feed Stream
    function updateLogStream(logs) {
        const streamContainer = document.getElementById('log-stream');
        
        // Find if container has scrolled
        const isScrolledToBottom = streamContainer.scrollHeight - streamContainer.clientHeight <= streamContainer.scrollTop + 5;
        
        streamContainer.innerHTML = '';
        logs.forEach(log => {
            const entry = document.createElement('div');
            entry.className = `log-entry ${log.type}`;
            
            // Map tag formatting
            let tag = log.type;
            if (log.type === 'REPORT') tag = 'NEW INCIDENT';
            if (log.type === 'DISPATCH') tag = 'UNIT DISPATCH';
            if (log.type === 'SYSTEM' && log.message.includes('fully resolved')) tag = 'RESOLVED';
            
            entry.innerHTML = `
                <span class="log-time">[${log.timestamp}]</span>
                <span class="log-tag">[${tag}]</span>
                ${log.message}
            `;
            
            // Link to selected complaint on log click
            if (log.complaint_id) {
                entry.style.cursor = 'pointer';
                entry.addEventListener('click', () => {
                    selectComplaint(log.complaint_id);
                });
            }
            
            streamContainer.appendChild(entry);
        });
        
        // Keep scroll at bottom if already there
        if (isScrolledToBottom) {
            streamContainer.scrollTop = streamContainer.scrollHeight;
        }
    }

    // Toggle click-to-report incident state
    function setReportMode(active) {
        isReportModeActive = active;
        const btn = document.getElementById('btn-report-mode');
        if (active) {
            btn.classList.add('active');
            map.getContainer().style.cursor = 'crosshair';
            // Show alert tooltip briefly
            const tooltip = L.tooltip()
                .setLatLng(map.getCenter())
                .setContent('Click anywhere on map to file a complaint at that spot.')
                .addTo(map);
            setTimeout(() => map.closeTooltip(tooltip), 3000);
        } else {
            btn.classList.remove('active');
            map.getContainer().style.cursor = '';
        }
    }

    // Open complaint reporting modal
    function openReportModal(lat, lng) {
        document.getElementById('report-lat').value = lat;
        document.getElementById('report-lng').value = lng;
        document.getElementById('report-title').value = '';
        document.getElementById('report-description').value = '';
        document.getElementById('report-reporter').value = 'Anonymous Citizen';
        document.getElementById('report-category').selectedIndex = 0;
        document.getElementById('report-urgency').selectedIndex = 1;
        
        document.getElementById('report-modal').classList.remove('hidden');
    }

    // Wire-up Event Listeners
    function initEventListeners() {
        // Search Input
        document.getElementById('complaint-search').addEventListener('input', () => {
            renderComplaintsList(complaintsData);
        });

        // Filter chips
        document.querySelectorAll('.filter-chips .chip').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active'));
                e.target.classList.add('active');
                currentFilter = e.target.getAttribute('data-filter');
                renderComplaintsList(complaintsData);
            });
        });

        // Sim Toolbar Play / Pause Control
        document.getElementById('btn-pause-sim').addEventListener('click', () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ action: 'TOGGLE_PAUSE' }));
            }
        });

        // Sim Speed Slider
        document.getElementById('sim-speed-slider').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            document.getElementById('speed-multiplier-label').textContent = `${val}x`;
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ action: 'SET_SPEED', value: val }));
            }
        });

        // Report Incident mode toggle
        document.getElementById('btn-report-mode').addEventListener('click', () => {
            setReportMode(!isReportModeActive);
        });

        // Toggle Zones visibility
        let showGeofences = true;
        document.getElementById('btn-toggle-geofences').addEventListener('click', (e) => {
            showGeofences = !showGeofences;
            e.currentTarget.classList.toggle('active', !showGeofences);
            geofenceLayers.forEach(layer => {
                if (showGeofences) map.addLayer(layer);
                else map.removeLayer(layer);
            });
        });

        // Reset system simulation state
        document.getElementById('btn-reset-sim').addEventListener('click', () => {
            if (confirm("Are you sure you want to reset all complaints and crews to initial default mock values?")) {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ action: 'RESET' }));
                }
                closeHUD();
            }
        });

        // Close HUD panel
        document.getElementById('btn-close-hud').addEventListener('click', () => {
            closeHUD();
        });

        // Center map on selected incident coordinate
        document.getElementById('hud-btn-center').addEventListener('click', () => {
            if (selectedComplaintId) {
                const c = complaintsData.find(item => item.id === selectedComplaintId);
                if (c) map.flyTo([c.lat, c.lng], 16, { duration: 1.0 });
            }
        });

        // Submit Complaint Modal Handlers
        document.getElementById('close-report-modal').addEventListener('click', () => {
            document.getElementById('report-modal').classList.add('hidden');
        });
        document.getElementById('btn-cancel-report').addEventListener('click', () => {
            document.getElementById('report-modal').classList.add('hidden');
        });

        // Form Submit POST request
        document.getElementById('btn-submit-report').addEventListener('click', async () => {
            const title = document.getElementById('report-title').value.trim();
            const description = document.getElementById('report-description').value.trim();
            const reporter = document.getElementById('report-reporter').value.trim() || 'Anonymous Citizen';
            const category = document.getElementById('report-category').value;
            const urgency = document.getElementById('report-urgency').value;
            const lat = parseFloat(document.getElementById('report-lat').value);
            const lng = parseFloat(document.getElementById('report-lng').value);

            if (!title) {
                alert("Please enter a short complaint title.");
                return;
            }

            const payload = { title, description, reporter, category, urgency, lat, lng };

            try {
                const res = await fetch('/api/complaints', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (res.ok) {
                    const data = await res.json();
                    document.getElementById('report-modal').classList.add('hidden');
                    // Automatically track the newly reported complaint
                    if (data.complaint && data.complaint.id) {
                        setTimeout(() => selectComplaint(data.complaint.id), 500);
                    }
                } else {
                    console.error("Failed to report complaint", res.statusText);
                    alert("Error submitting complaint. Please try again.");
                }
            } catch (err) {
                console.error('Submit report error:', err);
                alert("Failed to reach server. Please try again.");
            }
        });

        // Clear Logs Stream UI
        document.getElementById('btn-clear-logs').addEventListener('click', () => {
            document.getElementById('log-stream').innerHTML = '';
        });
    }
});
