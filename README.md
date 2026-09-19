# 🚨 CivicCare - Public Complaint Live Tracking System

CivicCare is a real-time, interactive municipal complaint tracking and field crew dispatch simulation system built with **FastAPI**, **WebSockets**, and modern front-end mapping.

---

## ✨ Features

- 🛰️ **Real-Time Telemetry & Geofencing**: Live monitoring of civic issues (potholes, water leaks, garbage, electrical hazards) with dynamic status tracking.
- ⚡ **Automated Crew Dispatch Simulation**: AI-driven simulation of field crews en route, on-site, and completing repairs.
- 🔄 **Bidirectional WebSocket Sync**: Zero-latency updates, simulation playback speed controls (1x, 2x, 5x, 10x), and live event logs.
- 📊 **Interactive Dashboard**: Modern glassmorphism UI with live metrics, urgency zones, filterable complaint queues, and animated status pulses.

---

## 🛠️ Tech Stack

- **Backend**: FastAPI, Uvicorn, WebSockets, Jinja2, Pydantic
- **Frontend**: HTML5, Vanilla CSS, JavaScript (ES6+), Leaflet / OpenStreetMap
- **Architecture**: Async event-loop simulation engine with broadcast connection management

---

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/basith2717-prog/LIVE-TRACKER.git
cd LIVE-TRACKER
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Run the application
```bash
python app.py
```
Or with Uvicorn directly:
```bash
uvicorn app:app --reload --port 8000
```

### 4. Open in browser
Navigate to [http://127.0.0.1:8000](http://127.0.0.1:8000)

---

## 📄 License
MIT License
