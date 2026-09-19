/* ==========================================================================
   CIVICCARE LIVE TRACKING - HYBRID CLIENT & SIMULATION ENGINE FOR FIREBASE
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // Application State Variables
    let map = null;
    let ws = null;
    let isStandaloneMode = false;
    let standaloneTimer = null;
    let simulationSpeed = 1.0;
    let isSimulationPaused = false;
    let selectedComplaintId = null;
    let currentFilter = 'all';
    let isReportModeActive = false;

    // Simulation Data Store
    let complaintsData = [];
    let crewsData = [];
    let geofencesData = [];
    let systemLogs = [];

    // Map Layers
    const complaintMarkers = {};
    const crewMarkers = {};
    const crewTrails = {};
    const targetLines = {};
    const geofenceLayers = [];

    const CATEGORY_ICONS = {
        pothole: 'fa-road',
        sanitation: 'fa-trash-can',
        lighting: 'fa-lightbulb',
        water: 'fa-droplet',
        parking: 'fa-square-parking'
    };

    const CATEGORY_COLORS = {
        pothole: '#ff7a00',
        sanitation: '#00cc7a',
        lighting: '#ffc107',
        water: '#0088ff',
        parking: '#a900ff'
    };

    // Priority Geofence Zones
    const DEFAULT_GEOFENCES = [
        {
            id: "zone_hospital",
            name: "General Hospital Core (Critical Escalation)",
            center: [37.7850, -122.4050],
            radius_meters: 600,
            type: "CRITICAL"
        },
        {
            id: "zone_school",
            name: "Mission District School Zone (High Escalation)",
            center: [37.7600, -122.4200],
            radius_meters: 500,
            type: "HIGH"
        }
    ];

    function getInitialComplaints() {
        return [
            {
                id: "CP-1001",
                title: "Severe Market St Pothole",
                category: "pothole",
                description: "Deep pothole in center lane. Damaging tires.",
                lat: 37.7790,
                lng: -122.4150,
                status: "RESOLVED",
                urgency: "MEDIUM",
                reporter: "Marcus Vance",
                created_at: "10:15:30",
                assigned_crew_id: "CREW-01",
                history: [
                    "10:15:30 - Reported by Marcus Vance.",
                    "10:17:10 - Dispatched Road Maintenance Crew A.",
                    "10:20:45 - Crew arrived on site.",
                    "10:28:15 - Pothole filled and sealed. Resolved."
                ]
            },
            {
                id: "CP-1002",
                title: "Dark Streetlamp 4th St",
                category: "lighting",
                description: "Entire block is dark, streetlight bulb seems burnt out.",
                lat: 37.7850,
                lng: -122.4010,
                status: "RESOLVED",
                urgency: "LOW",
                reporter: "Elena Rostova",
                created_at: "10:22:15",
                assigned_crew_id: "CREW-03",
                history: [
                    "10:22:15 - Reported by Elena Rostova.",
                    "10:24:00 - Dispatched Grid Electricians Beta.",
                    "10:28:30 - Crew arrived on site.",
                    "10:33:02 - Bulb replaced and line tested. Resolved."
                ]
            },
            {
                id: "CP-1003",
                title: "Burst Water Main Folsom St",
                category: "water",
                description: "Water leaking rapidly onto sidewalk and road. Low pressure nearby.",
                lat: 37.7760,
                lng: -122.4080,
                status: "IN_PROGRESS",
                urgency: "HIGH",
                reporter: "Sarah Chen",
                created_at: "10:35:00",
                assigned_crew_id: "CREW-04",
                history: [
                    "10:35:00 - Reported by Sarah Chen.",
                    "10:36:12 - Dispatched Municipal Water Works.",
                    "10:41:00 - Crew arrived. Shutting off main valve."
                ]
            },
            {
                id: "CP-1004",
                title: "Blocked Hydrant at Mission St",
                category: "parking",
                description: "Commercial truck parked in front of fire hydrant.",
                lat: 37.7600,
                lng: -122.4200,
                status: "ASSIGNED",
                urgency: "HIGH",
                reporter: "Officer Jim",
                created_at: "10:42:00",
                assigned_crew_id: "CREW-05",
                history: [
                    "10:42:00 - Reported by Officer Jim in Mission School Zone.",
                    "10:42:45 - Dispatched Rapid Response Team."
                ]
            },
            {
                id: "CP-1005",
                title: "Overflowing Trash Can 16th St",
                category: "sanitation",
                description: "Public garbage bin overflowing with commercial waste.",
                lat: 37.7650,
                lng: -122.4180,
                status: "PENDING",
                urgency: "LOW",
                reporter: "Clara Bell",
                created_at: "10:48:10",
                assigned_crew_id: null,
                history: [
                    "10:48:10 - Reported by Clara Bell. Queued for crew assignment."
                ]
            }
        ];
    }

    function getInitialCrews() {
        return [
            {
                id: "CREW-01",
                name: "Road Patrol Unit Alpha",
                category: "pothole",
                lat: 37.7790,
                lng: -122.4150,
                status: "IDLE",
                target_complaint_id: null,
                current_speed_kmh: 0.0,
                heading: 45.0,
                history_trail: [[37.7790, -122.4150]],
                completed_jobs: 3
            },
            {
                id: "CREW-02",
                name: "Sanitation Rapid Sweep",
                category: "sanitation",
                lat: 37.7700,
                lng: -122.4100,
                status: "IDLE",
                target_complaint_id: null,
                current_speed_kmh: 0.0,
                heading: 180.0,
                history_trail: [[37.7700, -122.4100]],
                completed_jobs: 2
            },
            {
                id: "CREW-03",
                name: "Grid Lighting Team Beta",
                category: "lighting",
                lat: 37.7850,
                lng: -122.4010,
                status: "IDLE",
                target_complaint_id: null,
                current_speed_kmh: 0.0,
                heading: 90.0,
                history_trail: [[37.7850, -122.4010]],
                completed_jobs: 4
            },
            {
                id: "CREW-04",
                name: "Municipal Water Works",
                category: "water",
                lat: 37.7760,
                lng: -122.4080,
                status: "WORKING",
                target_complaint_id: "CP-1003",
                current_speed_kmh: 0.0,
                heading: 270.0,
                history_trail: [[37.7760, -122.4080]],
                completed_jobs: 1
            },
            {
                id: "CREW-05",
                name: "Traffic & Parking Patrol",
                category: "parking",
                lat: 37.7680,
                lng: -122.4150,
                status: "EN_ROUTE",
                target_complaint_id: "CP-1004",
                current_speed_kmh: 38.5,
                heading: 195.0,
                history_trail: [[37.7680, -122.4150]],
                completed_jobs: 5
            }
        ];
    }

    // Initialize Modules
    initClock();
    initMap();
    initWebSocketOrFallback();
    initEventListeners();

    function initClock() {
        const clockEl = document.getElementById('utc-clock');
        setInterval(() => {
            const now = new Date();
            clockEl.textContent = now.toISOString().slice(11, 19) + ' UTC';
        }, 1000);
    }

    function initMap() {
        map = L.map('map', {
            center: [37.7749, -122.4194],
            zoom: 14,
            zoomControl: false
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(map);

        L.control.zoom({ position: 'topright' }).addTo(map);

        map.on('click', (e) => {
            if (isReportModeActive) {
                const lat = e.latlng.lat.toFixed(6);
                const lng = e.latlng.lng.toFixed(6);
                openReportModal(lat, lng);
                setReportMode(false);
            }
        });
    }

    function initWebSocketOrFallback() {
        const isLocalHost = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
        
        if (isLocalHost && window.location.port !== '5000') {
            try {
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
                    if (!isStandaloneMode) startStandaloneEngine();
                };

                ws.onerror = () => {
                    if (!isStandaloneMode) startStandaloneEngine();
                };
            } catch (e) {
                startStandaloneEngine();
            }
        } else {
            // Running on Firebase Hosting or public static domain
            startStandaloneEngine();
        }
    }

    // Standalone Simulation Engine (Runs directly in browser for Firebase Hosting)
    function startStandaloneEngine() {
        isStandaloneMode = true;
        const statusEl = document.getElementById('connection-status');
        statusEl.querySelector('.status-dot').className = 'status-dot connected';
        statusEl.querySelector('.status-text').textContent = 'FIREBASE CLOUD HUD';

        complaintsData = getInitialComplaints();
        crewsData = getInitialCrews();
        geofencesData = DEFAULT_GEOFENCES;
        addSystemLog('SYSTEM', 'CivicCare Live Cloud Simulation running on Firebase Hosting.');

        renderGeofencesOnMap(geofencesData);
        syncStandaloneUI();

        if (standaloneTimer) clearInterval(standaloneTimer);
        standaloneTimer = setInterval(standaloneSimulationTick, 1000);
    }

    function syncStandaloneUI() {
        renderComplaintMarkers(complaintsData);
        renderCrewMarkers(crewsData);
        renderComplaintsList(complaintsData);
        renderCrewsList(crewsData);
        updateQuickStats(complaintsData);
        updateLogStream(systemLogs);
    }

    function addSystemLog(level, message) {
        const timeStr = new Date().toTimeString().slice(0, 8);
        systemLogs.unshift({ timestamp: timeStr, level, message });
        if (systemLogs.length > 30) systemLogs.pop();
    }

    // Standalone Physics & Dispatch Tick
    function standaloneSimulationTick() {
        if (isSimulationPaused) return;

        const dt = 1.0 * simulationSpeed;
        const stepDist = (35.0 * 1000 / 3600) * dt; // meters at 35 km/h

        // 1. Auto-dispatch idle crews to pending complaints
        crewsData.forEach(crew => {
            if (crew.status === 'IDLE') {
                const target = complaintsData.find(c => c.status === 'PENDING' && (!c.assigned_crew_id || c.assigned_crew_id === crew.id));
                if (target) {
                    crew.status = 'EN_ROUTE';
                    crew.target_complaint_id = target.id;
                    target.status = 'ASSIGNED';
                    target.assigned_crew_id = crew.id;
                    const timeStr = new Date().toTimeString().slice(0, 8);
                    target.history.push(`${timeStr} - Dispatched ${crew.name}.`);
                    addSystemLog('DISPATCH', `Dispatched ${crew.name} to ${target.title} (${target.id})`);
                }
            } else if (crew.status === 'EN_ROUTE' && crew.target_complaint_id) {
                const target = complaintsData.find(c => c.id === crew.target_complaint_id);
                if (target) {
                    const dLat = (target.lat - crew.lat) * 111000;
                    const dLng = (target.lng - crew.lng) * 111000 * Math.cos(crew.lat * Math.PI / 180);
                    const distM = Math.sqrt(dLat * dLat + dLng * dLng);

                    if (distM <= 35) {
                        crew.status = 'WORKING';
                        crew.work_timer = 10; // seconds on site
                        crew.lat = target.lat;
                        crew.lng = target.lng;
                        target.status = 'IN_PROGRESS';
                        const timeStr = new Date().toTimeString().slice(0, 8);
                        target.history.push(`${timeStr} - Crew arrived on site. Repairs in progress.`);
                        addSystemLog('FIELD', `${crew.name} arrived at ${target.title}. Repair started.`);
                    } else {
                        const ratio = Math.min(1.0, stepDist / distM);
                        crew.lat += (target.lat - crew.lat) * ratio;
                        crew.lng += (target.lng - crew.lng) * ratio;
                        crew.heading = (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360;
                        crew.current_speed_kmh = 32.0 + Math.random() * 8.0;
                        crew.history_trail.push([crew.lat, crew.lng]);
                        if (crew.history_trail.length > 20) crew.history_trail.shift();
                    }
                }
            } else if (crew.status === 'WORKING' && crew.target_complaint_id) {
                crew.work_timer = (crew.work_timer || 10) - dt;
                if (crew.work_timer <= 0) {
                    const target = complaintsData.find(c => c.id === crew.target_complaint_id);
                    if (target) {
                        target.status = 'RESOLVED';
                        const timeStr = new Date().toTimeString().slice(0, 8);
                        target.history.push(`${timeStr} - Repairs completed by ${crew.name}. Ticket resolved.`);
                        addSystemLog('RESOLVED', `Issue ${target.id} marked RESOLVED by ${crew.name}.`);
                    }
                    crew.status = 'IDLE';
                    crew.target_complaint_id = null;
                    crew.completed_jobs = (crew.completed_jobs || 0) + 1;
                }
            }
        });

        syncStandaloneUI();
        if (selectedComplaintId) updateHUD(selectedComplaintId);
    }

    function updateDashboardState(payload) {
        complaintsData = payload.complaints || [];
        crewsData = payload.crews || [];
        const logs = payload.logs || [];
        geofencesData = payload.geofences || geofencesData;

        if (geofencesData.length > 0 && geofenceLayers.length === 0) {
            renderGeofencesOnMap(geofencesData);
        }

        renderComplaintMarkers(complaintsData);
        renderCrewMarkers(crewsData);
        renderComplaintsList(complaintsData);
        renderCrewsList(crewsData);
        updateQuickStats(complaintsData);
        updateLogStream(logs);

        if (selectedComplaintId) updateHUD(selectedComplaintId);
    }

    function renderGeofencesOnMap(geofences) {
        geofences.forEach(zone => {
            const color = zone.type === 'CRITICAL' ? '#ff3366' : '#ffb700';
            const circle = L.circle(zone.center, {
                radius: zone.radius_meters,
                color: color,
                weight: 1.5,
                dashArray: '4, 8',
                fillColor: color,
                fillOpacity: 0.12
            }).addTo(map);

            circle.bindTooltip(`<b>${zone.name}</b><br><small>Priority Escalation Zone</small>`, {
                permanent: false,
                direction: 'top',
                className: 'zone-tooltip'
            });

            geofenceLayers.push(circle);
        });
    }

    function renderComplaintMarkers(complaints) {
        complaints.forEach(c => {
            const iconClass = CATEGORY_ICONS[c.category] || 'fa-triangle-exclamation';
            const statusClass = c.status.toLowerCase().replace('_', '-');

            const customIcon = L.divIcon({
                className: 'complaint-marker-wrapper',
                html: `
                    <div class="custom-map-pin ${c.category} status-${statusClass} ${selectedComplaintId === c.id ? 'selected' : ''}">
                        <i class="fa-solid ${iconClass}"></i>
                    </div>
                `,
                iconSize: [36, 36],
                iconAnchor: [18, 18],
                popupAnchor: [0, -20]
            });

            if (complaintMarkers[c.id]) {
                complaintMarkers[c.id].setLatLng([c.lat, c.lng]);
                complaintMarkers[c.id].setIcon(customIcon);
            } else {
                const marker = L.marker([c.lat, c.lng], { icon: customIcon }).addTo(map);
                marker.on('click', () => selectComplaint(c.id));
                complaintMarkers[c.id] = marker;
            }
        });
    }

    function renderCrewMarkers(crews) {
        crews.forEach(crew => {
            const statusColor = crew.status === 'WORKING' ? '#00f2fe' : (crew.status === 'EN_ROUTE' ? '#00ff88' : '#8a99ad');
            
            const crewIcon = L.divIcon({
                className: 'crew-marker-wrapper',
                html: `
                    <div class="crew-map-pin" style="border-color: ${statusColor}">
                        <div class="crew-arrow" style="transform: rotate(${crew.heading}deg);">
                            <i class="fa-solid fa-location-arrow"></i>
                        </div>
                    </div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            if (crewMarkers[crew.id]) {
                crewMarkers[crew.id].setLatLng([crew.lat, crew.lng]);
                crewMarkers[crew.id].setIcon(crewIcon);
            } else {
                const marker = L.marker([crew.lat, crew.lng], { icon: crewIcon }).addTo(map);
                crewMarkers[crew.id] = marker;
            }

            // Render Target Route Polyline
            if (crew.target_complaint_id) {
                const target = complaintsData.find(c => c.id === crew.target_complaint_id);
                if (target && target.status !== 'RESOLVED') {
                    const latlngs = [[crew.lat, crew.lng], [target.lat, target.lng]];
                    if (targetLines[crew.id]) {
                        targetLines[crew.id].setLatLngs(latlngs);
                    } else {
                        targetLines[crew.id] = L.polyline(latlngs, {
                            color: '#00f2fe',
                            weight: 2,
                            opacity: 0.8,
                            dashArray: '6, 6'
                        }).addTo(map);
                    }
                } else if (targetLines[crew.id]) {
                    map.removeLayer(targetLines[crew.id]);
                    delete targetLines[crew.id];
                }
            } else if (targetLines[crew.id]) {
                map.removeLayer(targetLines[crew.id]);
                delete targetLines[crew.id];
            }
        });
    }

    function renderComplaintsList(complaints) {
        const container = document.getElementById('complaints-list');
        const searchTerm = document.getElementById('complaint-search').value.toLowerCase();
        
        const filtered = complaints.filter(c => {
            const matchesCat = currentFilter === 'all' || c.category === currentFilter;
            const matchesSearch = !searchTerm || c.id.toLowerCase().includes(searchTerm) || c.title.toLowerCase().includes(searchTerm) || c.description.toLowerCase().includes(searchTerm);
            return matchesCat && matchesSearch;
        });

        document.getElementById('complaints-count').textContent = filtered.length;

        container.innerHTML = filtered.map(c => {
            const iconClass = CATEGORY_ICONS[c.category] || 'fa-triangle-exclamation';
            const isSelected = selectedComplaintId === c.id ? 'selected' : '';
            return `
                <div class="complaint-card ${c.category} ${isSelected}" onclick="window.selectComplaint('${c.id}')">
                    <div class="card-top">
                        <span class="card-id"><i class="fa-solid ${iconClass}"></i> ${c.id}</span>
                        <span class="status-badge ${c.status.toLowerCase()}">${c.status.replace('_', ' ')}</span>
                    </div>
                    <div class="card-title">${c.title}</div>
                    <div class="card-desc">${c.description}</div>
                    <div class="card-bottom">
                        <span class="urgency-tag ${c.urgency.toLowerCase()}">${c.urgency}</span>
                        <span class="card-time"><i class="fa-regular fa-clock"></i> ${c.created_at}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderCrewsList(crews) {
        const container = document.getElementById('crew-list');
        container.innerHTML = crews.map(crew => {
            const statusClass = crew.status.toLowerCase().replace('_', '-');
            return `
                <div class="crew-card">
                    <div class="crew-header">
                        <span class="crew-name"><i class="fa-solid fa-truck"></i> ${crew.name}</span>
                        <span class="crew-status-badge ${statusClass}">${crew.status.replace('_', ' ')}</span>
                    </div>
                    <div class="crew-details">
                        <span>Speed: <b>${crew.current_speed_kmh.toFixed(1)} km/h</b></span>
                        <span>Jobs: <b>${crew.completed_jobs}</b></span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function updateQuickStats(complaints) {
        const total = complaints.length;
        const pending = complaints.filter(c => c.status === 'PENDING' || c.status === 'ASSIGNED').length;
        const inProgress = complaints.filter(c => c.status === 'IN_PROGRESS').length;
        const resolved = complaints.filter(c => c.status === 'RESOLVED').length;

        document.getElementById('stat-total-complaints').textContent = total;
        document.getElementById('stat-pending-issues').textContent = pending;
        document.getElementById('stat-inprogress-issues').textContent = inProgress;
        document.getElementById('stat-resolved-issues').textContent = resolved;
        
        const rate = total > 0 ? Math.round((resolved / total) * 100) : 100;
        document.getElementById('stat-satisfaction').textContent = `${rate}%`;
    }

    function updateLogStream(logs) {
        const stream = document.getElementById('log-stream');
        if (!logs || logs.length === 0) return;
        stream.innerHTML = logs.map(l => `
            <div class="log-entry">
                <span class="log-time">[${l.timestamp}]</span>
                <span class="log-level level-${(l.level || 'info').toLowerCase()}">${l.level || 'LOG'}</span>
                <span class="log-msg">${l.message}</span>
            </div>
        `).join('');
    }

    window.selectComplaint = function(id) {
        selectedComplaintId = id;
        renderComplaintMarkers(complaintsData);
        renderComplaintsList(complaintsData);
        updateHUD(id);
    };

    function updateHUD(id) {
        const c = complaintsData.find(item => item.id === id);
        if (!c) return;

        const hud = document.getElementById('telemetry-hud');
        hud.classList.remove('hidden');

        document.getElementById('hud-id').textContent = c.id;
        document.getElementById('hud-name').textContent = c.title;
        document.getElementById('hud-reporter').textContent = c.reporter;
        document.getElementById('hud-created').textContent = c.created_at;
        document.getElementById('hud-category').textContent = c.category.toUpperCase();
        document.getElementById('hud-urgency').textContent = c.urgency;
        document.getElementById('hud-status').textContent = c.status.replace('_', ' ');
        document.getElementById('hud-assigned-crew').textContent = c.assigned_crew_id || 'None';

        const iconEl = document.getElementById('hud-type-icon');
        iconEl.innerHTML = `<i class="fa-solid ${CATEGORY_ICONS[c.category] || 'fa-circle-exclamation'}"></i>`;

        const timelineList = document.getElementById('hud-timeline-list');
        timelineList.innerHTML = (c.history || []).map(h => `<div class="timeline-log-item"><i class="fa-solid fa-circle-check text-accent"></i> ${h}</div>`).join('');
    }

    function closeHUD() {
        selectedComplaintId = null;
        document.getElementById('telemetry-hud').classList.add('hidden');
        renderComplaintMarkers(complaintsData);
        renderComplaintsList(complaintsData);
    }

    function setReportMode(active) {
        isReportModeActive = active;
        const btn = document.getElementById('btn-report-mode');
        if (active) {
            btn.classList.add('active');
            map.getContainer().style.cursor = 'crosshair';
        } else {
            btn.classList.remove('active');
            map.getContainer().style.cursor = '';
        }
    }

    function openReportModal(lat, lng) {
        document.getElementById('report-lat').value = lat;
        document.getElementById('report-lng').value = lng;
        document.getElementById('report-modal').classList.remove('hidden');
    }

    function initEventListeners() {
        // Search & Filters
        document.getElementById('complaint-search').addEventListener('input', () => renderComplaintsList(complaintsData));
        document.querySelectorAll('.filter-chips .chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                currentFilter = chip.getAttribute('data-filter');
                renderComplaintsList(complaintsData);
            });
        });

        // Sim Pause
        document.getElementById('btn-pause-sim').addEventListener('click', () => {
            isSimulationPaused = !isSimulationPaused;
            document.getElementById('pause-btn-text').textContent = isSimulationPaused ? 'Resume' : 'Pause';
            document.getElementById('btn-pause-sim').classList.toggle('active', isSimulationPaused);
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ action: 'PAUSE', value: isSimulationPaused }));
            }
        });

        // Speed Slider
        document.getElementById('sim-speed-slider').addEventListener('input', (e) => {
            simulationSpeed = parseFloat(e.target.value);
            document.getElementById('speed-multiplier-label').textContent = `${simulationSpeed.toFixed(1)}x`;
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ action: 'SPEED', value: simulationSpeed }));
            }
        });

        // Report Mode
        document.getElementById('btn-report-mode').addEventListener('click', () => {
            setReportMode(!isReportModeActive);
        });

        // Toggle Zones
        let zonesVisible = true;
        document.getElementById('btn-toggle-geofences').addEventListener('click', () => {
            zonesVisible = !zonesVisible;
            geofenceLayers.forEach(l => zonesVisible ? map.addLayer(l) : map.removeLayer(l));
        });

        // Reset System
        document.getElementById('btn-reset-sim').addEventListener('click', () => {
            if (confirm("Reset simulation to initial state?")) {
                if (isStandaloneMode) {
                    complaintsData = getInitialComplaints();
                    crewsData = getInitialCrews();
                    systemLogs = [];
                    addSystemLog('SYSTEM', 'Simulation reset to default state.');
                    syncStandaloneUI();
                } else if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ action: 'RESET' }));
                }
                closeHUD();
            }
        });

        document.getElementById('btn-close-hud').addEventListener('click', closeHUD);
        document.getElementById('hud-btn-center').addEventListener('click', () => {
            if (selectedComplaintId) {
                const c = complaintsData.find(item => item.id === selectedComplaintId);
                if (c) map.flyTo([c.lat, c.lng], 16, { duration: 1.0 });
            }
        });

        // Modal Handlers
        document.getElementById('close-report-modal').addEventListener('click', () => document.getElementById('report-modal').classList.add('hidden'));
        document.getElementById('btn-cancel-report').addEventListener('click', () => document.getElementById('report-modal').classList.add('hidden'));

        // Form Submission
        document.getElementById('btn-submit-report').addEventListener('click', async () => {
            const title = document.getElementById('report-title').value.trim();
            const description = document.getElementById('report-description').value.trim();
            const reporter = document.getElementById('report-reporter').value.trim() || 'Anonymous Citizen';
            const category = document.getElementById('report-category').value;
            const urgency = document.getElementById('report-urgency').value;
            const lat = parseFloat(document.getElementById('report-lat').value);
            const lng = parseFloat(document.getElementById('report-lng').value);

            if (!title) {
                alert("Please enter a complaint title.");
                return;
            }

            const newId = `CP-${Math.floor(1000 + Math.random() * 9000)}`;
            const timeStr = new Date().toTimeString().slice(0, 8);
            const newComplaint = {
                id: newId,
                title,
                description: description || title,
                reporter,
                category,
                urgency,
                lat,
                lng,
                status: 'PENDING',
                created_at: timeStr,
                assigned_crew_id: null,
                history: [`${timeStr} - Reported by ${reporter}. Ticket filed.`]
            };

            complaintsData.unshift(newComplaint);
            addSystemLog('REPORT', `New complaint filed: ${title} (${newId})`);
            document.getElementById('report-modal').classList.add('hidden');
            syncStandaloneUI();
            selectComplaint(newId);
        });

        document.getElementById('btn-clear-logs').addEventListener('click', () => {
            systemLogs = [];
            document.getElementById('log-stream').innerHTML = '';
        });
    }
});
